// The doc editor (spec §9.3): a Tiptap (ProseMirror) editor over the flat block schema, so each
// top-level node is one stored block with its id. Markdown input rules, a `/` menu, a block handle
// (drag to reorder, Turn into, Duplicate, Copy link, Delete), list indent with Tab, block moves
// with ⌘⇧↑/↓, and Esc to select a block.
//
// Sync: the ids of changed nodes are collected per transaction and saved 400 ms after typing stops,
// as the user (no rev check; `editor/sync.ts` plans the ops). Store changes made by others replace
// only their nodes, so the user's cursor stays put; agent edits get a short wash and a gutter dot
// until the user visits the block. A block the user is typing in (or has not saved yet) is locked
// against agent edits.

import { Editor, Extension, InputRule, markInputRule, type NodeViewRenderer } from "@tiptap/core";
import { history, redo, undo } from "@tiptap/pm/history";
import { Fragment, type Node as PMNode, Slice } from "@tiptap/pm/model";
import { type EditorState, NodeSelection, Plugin, PluginKey, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { Lexer, type Tokens } from "marked";
import { blocksToDoc, blockToNode, checkedNode, docBlocks, type EditorBlock, newBlockId, nodeToBlock } from "../editor/convert";
import { BLOCK_OF_NODE, createDocSchema, NODE_NAMES, schemaExtensions } from "../editor/schema";
import { applyTarget, baseFrom, changedIds, planReconcile, planSave, type SyncBase, savedBase } from "../editor/sync";
import { escapeHtml, regionById, renderInline, safeHref } from "../model/inline";
import { blocksToMarkdown, describeView, markdownToBlocks, parseDocument } from "../model/markdown";
import { type Block, type BlockData, type BlockOp, type BlockOpsResult, type BlockType, LIST_TYPES } from "../store/types";

export const SAVE_DELAY_MS = 400;
export const LOCK_MS = 5000;
export const FLASH_MS = 1200;

type Failure = { error: { code: string; message: string } };

/** What the editor needs from the page: the store, the 3D view and the region previews. */
export interface DocEditorHost {
  /** Store-level ops, saved as the user. */
  save(ops: BlockOp[]): Promise<BlockOpsResult | Failure>;
  /** The artifact's live blocks, or null when it is gone. */
  fetch(): Promise<Block[] | null>;
  /** The live 3D view as a ViewPatch (for `/` → 3D view), or null without a scene. */
  captureView(): BlockData | null;
  /** The Show button on a view block. */
  showView(data: BlockData, caption: string): void;
  /** Stage 5 renders question blocks as inline quiz cards; until then a read-only preview shows. */
  renderQuestion?(container: HTMLElement, data: BlockData, blockId: string): boolean;
  /** Blocks the user changed and saved, for the activity log. */
  onSaved?(ids: string[]): void;
  /** "saving" as soon as there are edits to save, "saved" once the store has them, "error" when a save failed. */
  onStatus?(status: "saving" | "saved" | "error", message?: string): void;
  /** The save failed again after its retries; the edits stay in the editor until a later save works. */
  onSaveFailed?(message: string): void;
  /** Escape with a block already selected. */
  onEscape?(): void;
  notify?(message: string): void;
}

/** The editor as the rest of the page sees it; a textarea editor could implement the same interface. */
export interface BlockEditor {
  readonly element: HTMLElement;
  /** The store changed: show what others changed, after saving the user's pending edits. */
  refresh(): Promise<void>;
  /** The user is typing in this block, or has changes in it that are not saved yet. */
  isLocked(id: string): boolean;
  /** The block the cursor is in while the editor has focus. */
  editing(): string | null;
  /** Scroll to a block and flash it. */
  reveal(id: string): void;
  focus(where?: "start" | "end"): void;
  /** Saves pending edits now (the page is being hidden or closed). */
  flush(): Promise<void>;
  readonly saving: boolean;
  /** A save failed and edits are still waiting: closing now would lose them. */
  readonly unsaved: boolean;
  destroy(): void;
}

const REMOTE = "paRemote";
const agentKey = new PluginKey<AgentMarks>("paAgentMarks");
const slashKey = new PluginKey<SlashState>("paSlash");

interface AgentMarks {
  flash: Set<string>;
  dots: Set<string>;
  focused: boolean;
}
interface SlashState {
  open: boolean;
  from: number;
  query: string;
}

const isList = (type: BlockType) => LIST_TYPES.includes(type);
const blockType = (node: PMNode): BlockType => BLOCK_OF_NODE[node.type.name] ?? "p";

/** The top-level block holding the selection. */
function topBlock(state: EditorState): { node: PMNode; pos: number; index: number } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.$from.depth === 0) return { node: selection.node, pos: selection.from, index: selection.$from.index(0) };
  const $from = selection.$from;
  if ($from.depth < 1) return null;
  return { node: $from.node(1), pos: $from.before(1), index: $from.index(0) };
}

function blockAt(doc: PMNode, index: number): { node: PMNode; pos: number } | null {
  if (index < 0 || index >= doc.childCount) return null;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return { node: doc.child(index), pos };
}

function findBlock(doc: PMNode, id: string): { node: PMNode; pos: number; index: number } | null {
  let found: { node: PMNode; pos: number; index: number } | null = null;
  doc.forEach((node, pos, index) => {
    if (!found && node.attrs.id === id) found = { node, pos, index };
  });
  return found;
}

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const VIEW_ICON = svg('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>');
const HANDLE_ICON = svg(
  '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
);

/* ---------- The / menu and Turn into ---------- */

interface BlockChoice {
  label: string;
  type: BlockType;
  attrs?: Record<string, unknown>;
  keywords: string;
  hint?: string;
}
const CHOICES: BlockChoice[] = [
  { label: "Text", type: "p", keywords: "paragraph plain" },
  { label: "Heading 1", type: "h1", keywords: "title h1 #", hint: "#" },
  { label: "Heading 2", type: "h2", keywords: "subtitle h2 ##", hint: "##" },
  { label: "Heading 3", type: "h3", keywords: "h3 ###", hint: "###" },
  { label: "Bulleted list", type: "bullet", keywords: "ul unordered bullet", hint: "-" },
  { label: "Numbered list", type: "number", keywords: "ol ordered number", hint: "1." },
  { label: "To-do", type: "todo", keywords: "task checkbox check todo", hint: "[]" },
  { label: "Quote", type: "quote", keywords: "blockquote", hint: ">" },
  { label: "Note", type: "callout", attrs: { tone: "note" }, keywords: "callout info" },
  { label: "Tip", type: "callout", attrs: { tone: "tip" }, keywords: "callout hint" },
  { label: "Warning", type: "callout", attrs: { tone: "warning" }, keywords: "callout caution" },
  { label: "Code", type: "code", keywords: "pre snippet", hint: "```" },
  { label: "Table", type: "table", keywords: "grid rows columns" },
  { label: "Divider", type: "divider", keywords: "hr rule line", hint: "---" },
  { label: "3D view", type: "view", keywords: "camera brain scene snapshot view", hint: "current" },
];
const TEXT_CHOICES = CHOICES.filter((choice) => !["divider", "view", "table"].includes(choice.type) && choice.label !== "Tip" && choice.label !== "Warning");
const TABLE_TEMPLATE = "| Column | Column |\n| --- | --- |\n|  |  |";

function matchChoices(query: string): BlockChoice[] {
  const words = query.toLowerCase().trim();
  if (!words) return CHOICES;
  return CHOICES.filter((choice) => `${choice.label} ${choice.keywords}`.toLowerCase().includes(words));
}

/* ---------- Table preview ---------- */

function tableHtml(source: string): string {
  const token = new Lexer({ gfm: true }).lex(source).find((candidate) => candidate.type === "table") as Tokens.Table | undefined;
  if (!token) return `<p class="table-empty">${escapeHtml(source.split("\n")[0] || "Empty table")}</p>`;
  const cell = (tag: "th" | "td", item: Tokens.TableCell, index: number) => {
    const align = token.align[index];
    return `<${tag}${align ? ` style="text-align:${align}"` : ""}>${renderInline(item.text)}</${tag}>`;
  };
  const head = `<tr>${token.header.map((item, index) => cell("th", item, index)).join("")}</tr>`;
  const rows = token.rows.map((row) => `<tr>${row.map((item, index) => cell("td", item, index)).join("")}</tr>`).join("");
  return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

/* ---------- Question preview (Stage 5 replaces it with the inline quiz card) ---------- */

const KIND_LABELS: Record<string, string> = {
  choice: "Choice",
  truefalse: "True or false",
  region: "Click the region",
  order: "Put in order",
  recall: "Recall",
};
function questionPreview(data: BlockData): string {
  const kind = String(data.kind ?? "");
  const prompt = renderInline(String(data.prompt ?? ""));
  let detail = "";
  if (kind === "choice" && Array.isArray(data.choices))
    detail = `<ol class="question-choices">${data.choices.map((choice) => `<li>${renderInline(String(choice))}</li>`).join("")}</ol>`;
  if (kind === "order" && Array.isArray(data.items)) detail = `<p class="question-note">${data.items.length} items, shuffled when answered</p>`;
  return `<p class="question-kind">Question · ${escapeHtml(KIND_LABELS[kind] ?? kind)}</p><p class="question-prompt">${prompt}</p>${detail}`;
}

/* ---------- The editor ---------- */

export function createDocEditor(blocks: readonly Block[], host: DocEditorHost, options: { label?: string } = {}): BlockEditor {
  const wrapper = document.createElement("div");
  wrapper.className = "doc-editor";
  const mount = document.createElement("div");
  mount.className = "doc-editor-mount";
  wrapper.append(mount);

  let base: SyncBase = baseFrom(blocks);
  const dirty = new Map<string, number>();
  let clock = 0;
  let typed: { id: string; at: number } | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> | null = null;
  let saveAgain = false;
  let failures = 0;
  let status: "saving" | "saved" | "error" = "saved";
  let refreshing: Promise<void> | null = null;
  let refreshAgain = false;
  let destroyed = false;

  /* ---------- Commands ---------- */

  function dispatch(tr: Transaction) {
    editor.view.dispatch(tr);
    return true;
  }

  function setIndent(state: EditorState, delta: number): Transaction | null {
    const tr = state.tr;
    const { from, to } = state.selection;
    let changed = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (pos < 0 || !node.isBlock || !isList(blockType(node))) return false;
      const indent = Math.min(3, Math.max(0, (node.attrs.indent ?? 0) + delta));
      if (indent !== node.attrs.indent) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent });
        changed = true;
      }
      return false;
    });
    return changed ? tr : null;
  }

  /** Turns the current block into another type, keeping its id; atoms are inserted after it. */
  function turnInto(type: BlockType, attrs: Record<string, unknown> = {}): boolean {
    const { state } = editor;
    const block = topBlock(state);
    if (!block) return false;
    const { schema } = state;
    const nodeType = schema.nodes[NODE_NAMES[type]];
    const tr = state.tr;
    if (type === "divider" || type === "view") {
      let node: PMNode;
      if (type === "view") {
        const data = host.captureView();
        if (!data) {
          host.notify?.("The 3D view is not running, so there is no view to save.");
          return false;
        }
        node = nodeType.create({ id: newBlockId(), data, text: describeView(data) });
      } else node = nodeType.create({ id: newBlockId() });
      const empty = block.node.isTextblock && block.node.content.size === 0;
      const at = empty ? block.pos : block.pos + block.node.nodeSize;
      if (empty) tr.replaceWith(block.pos, block.pos + block.node.nodeSize, node);
      else tr.insert(at, node);
      const after = at + node.nodeSize;
      const next = tr.doc.resolve(after).nodeAfter;
      if (!next?.isTextblock) tr.insert(after, schema.nodes.paragraph.create({ id: newBlockId() }));
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
      return dispatch(tr.scrollIntoView());
    }
    if (!block.node.isTextblock) return false;
    const next: Record<string, unknown> = { id: block.node.attrs.id };
    if (isList(type)) next.indent = isList(blockType(block.node)) ? block.node.attrs.indent : 0;
    if (type === "todo") next.checked = false;
    Object.assign(next, attrs);
    tr.setBlockType(block.pos + 1, block.pos + block.node.nodeSize - 1, nodeType, next);
    if (type === "table" && block.node.content.size === 0) tr.insertText(TABLE_TEMPLATE, block.pos + 1);
    return dispatch(tr.scrollIntoView());
  }

  function moveBlock(from: number, to: number): boolean {
    const { state } = editor;
    const source = blockAt(state.doc, from);
    if (!source || to < 0 || to > state.doc.childCount || to === from || to === from + 1) return false;
    const selection = state.selection;
    const offset = selection.from - source.pos;
    const tr = state.tr.delete(source.pos, source.pos + source.node.nodeSize);
    const index = to > from ? to - 1 : to;
    let pos = 0;
    for (let i = 0; i < index; i++) pos += tr.doc.child(i).nodeSize;
    tr.insert(pos, source.node);
    const inside = selection.from >= source.pos && selection.from <= source.pos + source.node.nodeSize;
    if (inside) {
      if (selection instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, pos));
      else tr.setSelection(TextSelection.create(tr.doc, Math.min(pos + offset, pos + source.node.nodeSize - 1)));
    }
    return dispatch(tr.scrollIntoView());
  }

  function duplicate(index: number): boolean {
    const block = blockAt(editor.state.doc, index);
    if (!block) return false;
    const copy = block.node.type.create({ ...block.node.attrs, id: newBlockId() }, block.node.content, block.node.marks);
    return dispatch(editor.state.tr.insert(block.pos + block.node.nodeSize, copy));
  }

  function remove(index: number): boolean {
    const block = blockAt(editor.state.doc, index);
    if (!block) return false;
    const tr = editor.state.tr.delete(block.pos, block.pos + block.node.nodeSize);
    if (tr.doc.childCount === 0) tr.insert(0, editor.schema.nodes.paragraph.create({ id: newBlockId() }));
    return dispatch(tr);
  }

  function enter(): boolean {
    const { state } = editor;
    const { selection, schema } = state;
    if (selection instanceof NodeSelection && selection.$from.depth === 0) {
      const tr = state.tr.insert(selection.to, schema.nodes.paragraph.create({ id: newBlockId() }));
      tr.setSelection(TextSelection.create(tr.doc, selection.to + 1));
      return dispatch(tr.scrollIntoView());
    }
    const block = topBlock(state);
    if (!block || !block.node.isTextblock) return false;
    const type = blockType(block.node);
    const empty = block.node.content.size === 0;
    if (isList(type)) {
      if (empty) {
        if (block.node.attrs.indent > 0)
          return dispatch(state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, indent: block.node.attrs.indent - 1 }));
        return turnInto("p");
      }
      const tr = state.tr;
      if (!selection.empty) tr.deleteSelection();
      tr.split(tr.selection.from, 1, [{ type: block.node.type, attrs: { id: newBlockId(), indent: block.node.attrs.indent, checked: false } }]);
      return dispatch(tr.scrollIntoView());
    }
    if ((type === "quote" || type === "callout") && empty) return turnInto("p");
    if (type === "code" && selection.empty && selection.$from.parentOffset === block.node.content.size && block.node.textContent.endsWith("\n\n")) {
      const end = block.pos + block.node.nodeSize - 1;
      const tr = state.tr.delete(end - 2, end);
      const after = tr.mapping.map(block.pos + block.node.nodeSize);
      tr.insert(after, schema.nodes.paragraph.create({ id: newBlockId() }));
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
      return dispatch(tr.scrollIntoView());
    }
    return false;
  }

  function backspaceAtStart(): boolean {
    const { selection } = editor.state;
    if (!(selection instanceof TextSelection) || !selection.empty) return false;
    const { $from } = selection;
    if ($from.parentOffset !== 0 || $from.depth !== 1) return false;
    const node = $from.parent;
    const type = blockType(node);
    if (isList(type) && node.attrs.indent > 0)
      return dispatch(editor.state.tr.setNodeMarkup($from.before(1), undefined, { ...node.attrs, indent: node.attrs.indent - 1 }));
    if (type !== "p") return turnInto("p");
    return false;
  }

  function toggleTodo(): boolean {
    const block = topBlock(editor.state);
    if (!block || blockType(block.node) !== "todo") return false;
    return dispatch(editor.state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, checked: !block.node.attrs.checked }));
  }

  /* ---------- Extensions ---------- */

  const rule = (find: RegExp, type: BlockType, attrs: (match: RegExpMatchArray) => Record<string, unknown> = () => ({})) =>
    new InputRule({
      find,
      handler: ({ state, range, match }) => {
        const $start = state.doc.resolve(range.from);
        if ($start.depth !== 1) return null;
        const node = $start.parent;
        const nodeType = state.schema.nodes[NODE_NAMES[type]];
        if (!node.isTextblock || node.type.spec.code || (node.type === nodeType && type !== "todo")) return null;
        const next: Record<string, unknown> = { id: node.attrs.id, ...attrs(match) };
        if (isList(type)) next.indent = isList(blockType(node)) ? node.attrs.indent : 0;
        const tr = state.tr;
        tr.delete(range.from, range.to);
        tr.setBlockType(range.from, range.from, nodeType, next);
      },
    });
  const dividerRule = new InputRule({
    find: /^(?:---|—-|___|\*\*\*)$/,
    handler: ({ state, range }) => {
      const $start = state.doc.resolve(range.from);
      if ($start.depth !== 1 || $start.parent.type.spec.code) return null;
      const block = $start.before(1);
      const node = $start.parent;
      const tr = state.tr;
      // Only a block that holds nothing but the dashes becomes a divider.
      if (node.content.size !== range.to - range.from) return null;
      const divider = state.schema.nodes.divider.create({ id: node.attrs.id });
      tr.replaceWith(block, block + node.nodeSize, [divider, state.schema.nodes.paragraph.create({ id: newBlockId() })]);
      tr.setSelection(TextSelection.create(tr.doc, block + divider.nodeSize + 1));
    },
  });

  const editorBehaviour = Extension.create({
    name: "paDocEditor",
    priority: 1000,
    addInputRules() {
      const { schema } = this.editor;
      return [
        rule(/^#\s$/, "h1"),
        rule(/^##\s$/, "h2"),
        rule(/^###\s$/, "h3"),
        rule(/^[-*+]\s$/, "bullet"),
        rule(/^\d{1,3}[.)]\s$/, "number"),
        rule(/^\[( |x|X)?\]\s$/, "todo", (match) => ({ checked: /x/i.test(match[1] ?? "") })),
        rule(/^>\s$/, "quote"),
        rule(/^```([\w+#.-]{0,32})\s$/, "code", (match) => ({ lang: match[1] ?? "" })),
        dividerRule,
        markInputRule({ find: /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/, type: schema.marks.strong }),
        markInputRule({ find: /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/, type: schema.marks.em }),
        markInputRule({ find: /(?:^|\s)(~~(?!\s+~~)((?:[^~]+))~~(?!\s+~~))$/, type: schema.marks.strike }),
        markInputRule({ find: /(^|[^`])`([^`]+)`(?!`)$/, type: schema.marks.code }),
      ];
    },
    addKeyboardShortcuts() {
      const indent = (delta: number) => () => {
        if (slashState().open) return false;
        const block = topBlock(this.editor.state);
        if (block && (block.node.type.spec.code as boolean)) {
          if (delta > 0) return dispatch(this.editor.state.tr.insertText("  "));
          return true;
        }
        const tr = setIndent(this.editor.state, delta);
        return tr ? dispatch(tr) : Boolean(block && isList(blockType(block.node)));
      };
      const move = (delta: number) => () => {
        const block = topBlock(this.editor.state);
        return block ? moveBlock(block.index, delta < 0 ? block.index - 1 : block.index + 2) : false;
      };
      return {
        Enter: () => !slashState().open && enter(),
        "Shift-Enter": () => {
          const block = topBlock(this.editor.state);
          if (!block?.node.isTextblock || block.node.type.spec.code || /^h[1-3]$/.test(blockType(block.node))) return false;
          return dispatch(this.editor.state.tr.replaceSelectionWith(this.editor.schema.nodes.hardBreak.create()).scrollIntoView());
        },
        Backspace: () => backspaceAtStart(),
        Tab: indent(1),
        "Shift-Tab": indent(-1),
        "Mod-Shift-ArrowUp": move(-1),
        "Mod-Shift-ArrowDown": move(1),
        "Mod-Enter": () => toggleTodo(),
        "Mod-b": () => this.editor.commands.toggleMark("strong"),
        "Mod-i": () => this.editor.commands.toggleMark("em"),
        "Mod-e": () => this.editor.commands.toggleMark("code"),
        "Mod-Shift-s": () => this.editor.commands.toggleMark("strike"),
        "Mod-Shift-x": () => this.editor.commands.toggleMark("strike"),
        "Mod-k": () => {
          openLink();
          return true;
        },
        "Mod-z": () => undo(this.editor.state, this.editor.view.dispatch),
        "Mod-Shift-z": () => redo(this.editor.state, this.editor.view.dispatch),
        "Mod-y": () => redo(this.editor.state, this.editor.view.dispatch),
        Escape: () => {
          if (slashState().open) return false;
          const { selection } = this.editor.state;
          // ProseMirror swallows Escape, so a second one is passed on (the window minimizes).
          if (selection instanceof NodeSelection) {
            host.onEscape?.();
            return true;
          }
          const block = topBlock(this.editor.state);
          if (!block) return false;
          return dispatch(this.editor.state.tr.setSelection(NodeSelection.create(this.editor.state.doc, block.pos)));
        },
      };
    },
    addProseMirrorPlugins() {
      return [history({ depth: 200, newGroupDelay: 600 }), idsPlugin(), agentPlugin(), slashPlugin()];
    },
  });

  /** Every top-level node gets a unique id: splits, pastes and new blocks get fresh ones. */
  function idsPlugin() {
    return new Plugin({
      appendTransaction(transactions, _old, state) {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        const seen = new Set<string>();
        let tr: Transaction | null = null;
        state.doc.forEach((node, pos) => {
          const id = node.attrs.id as string | null;
          if (id && !seen.has(id)) {
            seen.add(id);
            return;
          }
          const fresh = newBlockId();
          seen.add(fresh);
          tr ??= state.tr;
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: fresh });
        });
        return tr;
      },
    });
  }

  /** Decorations: the current block, list numbers, placeholders, and the agent-edit wash and dot. */
  function agentPlugin() {
    return new Plugin<AgentMarks>({
      key: agentKey,
      state: {
        init: () => ({ flash: new Set(), dots: new Set(), focused: false }),
        apply(tr, value, _old, state) {
          const meta = tr.getMeta(agentKey) as { flash?: string[]; pulse?: string[]; unflash?: string[]; focused?: boolean } | undefined;
          let next = value;
          if (meta) {
            next = { flash: new Set(value.flash), dots: new Set(value.dots), focused: meta.focused ?? value.focused };
            for (const id of meta.flash ?? []) {
              next.flash.add(id);
              next.dots.add(id);
            }
            for (const id of meta.pulse ?? []) next.flash.add(id);
            for (const id of meta.unflash ?? []) next.flash.delete(id);
          }
          // Visiting a block clears its "edited by assistant" dot.
          if (tr.selectionSet && !tr.getMeta(REMOTE) && next.focused) {
            const id = topBlock(state)?.node.attrs.id as string | undefined;
            if (id && next.dots.has(id)) {
              next = { ...next, dots: new Set(next.dots) };
              next.dots.delete(id);
            }
          }
          return next;
        },
      },
      props: {
        decorations(state) {
          const marks = agentKey.getState(state);
          const current = marks?.focused ? (topBlock(state)?.pos ?? -1) : -1;
          const only = state.doc.childCount === 1 && state.doc.firstChild?.isTextblock && state.doc.firstChild.content.size === 0;
          const decorations: Decoration[] = [];
          let numbers: (number | null)[] = [];
          state.doc.forEach((node, pos) => {
            const type = blockType(node);
            const attrs: Record<string, string> = {};
            const classes: string[] = [];
            if (isList(type)) {
              const level = Math.min(node.attrs.indent ?? 0, numbers.length);
              numbers = numbers.slice(0, level + 1);
              const n = type === "number" ? (numbers[level] ?? 0) + 1 : null;
              numbers[level] = n;
              if (n !== null) attrs["data-n"] = `${n}.`;
            } else numbers = [];
            if (pos === current) classes.push("is-current");
            const id = node.attrs.id as string;
            if (marks?.flash.has(id)) classes.push("agent-flash");
            if (marks?.dots.has(id)) {
              classes.push("agent-edited");
              attrs.title = "Edited by the assistant";
            }
            if (node.isTextblock && node.content.size === 0 && !node.type.spec.code && (pos === current || only)) {
              classes.push("is-empty");
              attrs["data-placeholder"] = only ? "Write, or type / for blocks" : placeholderFor(type);
            }
            if (classes.length || Object.keys(attrs).length)
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: classes.join(" "), ...attrs }));
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    });
  }

  function placeholderFor(type: BlockType): string {
    if (type === "h1" || type === "h2" || type === "h3") return `Heading ${type[1]}`;
    if (type === "quote") return "Quote";
    if (type === "callout") return "Callout";
    if (isList(type)) return "List";
    return "Type / for blocks";
  }

  /* ---------- The / menu ---------- */

  const slashMenu = document.createElement("div");
  slashMenu.className = "editor-menu slash-menu";
  slashMenu.setAttribute("role", "listbox");
  slashMenu.setAttribute("aria-label", "Block types");
  slashMenu.hidden = true;
  wrapper.append(slashMenu);
  let slashItems: BlockChoice[] = [];
  let slashActive = 0;

  const slashState = (): SlashState => slashKey.getState(editor.state) ?? { open: false, from: 0, query: "" };

  function slashPlugin() {
    return new Plugin<SlashState>({
      key: slashKey,
      state: {
        init: () => ({ open: false, from: 0, query: "" }),
        apply(tr, value, _old, state) {
          const meta = tr.getMeta(slashKey) as { close?: true } | undefined;
          if (meta?.close) return { open: false, from: 0, query: "" };
          let next = value;
          if (value.open) next = { ...value, from: tr.mapping.map(value.from) };
          else if (typedSlash(tr, state)) next = { open: true, from: state.selection.from - 1, query: "" };
          if (!next.open) return next;
          const { selection } = state;
          const $from = state.doc.resolve(next.from);
          if (!selection.empty || selection.from <= next.from || selection.$from.parent !== $from.parent) return { open: false, from: 0, query: "" };
          const text = state.doc.textBetween(next.from, selection.from);
          if (!text.startsWith("/") || /\s/.test(text) || text.length > 24) return { open: false, from: 0, query: "" };
          return { ...next, query: text.slice(1) };
        },
      },
      props: {
        handleKeyDown(_view, event) {
          if (!slashState().open) return false;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!slashItems.length) return false;
            slashActive = (slashActive + (event.key === "ArrowDown" ? 1 : -1) + slashItems.length) % slashItems.length;
            renderSlash();
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            if (!slashItems.length) return false;
            chooseSlash(slashItems[slashActive]);
            return true;
          }
          if (event.key === "Escape") {
            closeSlash();
            return true;
          }
          return false;
        },
      },
      view: () => ({ update: () => renderSlash() }),
    });
  }

  /** A "/" typed at the start of a block or after a space opens the block menu. */
  function typedSlash(tr: Transaction, state: EditorState): boolean {
    if (!tr.docChanged || tr.getMeta(REMOTE) || tr.steps.length !== 1 || !state.selection.empty) return false;
    const step = tr.steps[0] as unknown as { slice?: { content: { size: number; textBetween(from: number, to: number): string } } };
    if (step.slice?.content.textBetween(0, step.slice.content.size) !== "/") return false;
    const $cursor = state.selection.$from;
    if ($cursor.depth !== 1 || !$cursor.parent.isTextblock || $cursor.parent.type.spec.code) return false;
    const before = $cursor.parent.textBetween(0, $cursor.parentOffset);
    return before.endsWith("/") && (before.length === 1 || /\s/.test(before[before.length - 2]));
  }

  function closeSlash() {
    editor.view.dispatch(editor.state.tr.setMeta(slashKey, { close: true }));
  }

  function chooseSlash(choice: BlockChoice) {
    const state = slashState();
    if (!state.open) return;
    editor.view.dispatch(editor.state.tr.delete(state.from, editor.state.selection.from).setMeta(slashKey, { close: true }));
    turnInto(choice.type, choice.attrs);
    editor.view.focus();
  }

  function renderSlash() {
    const state = slashKey.getState(editor.state);
    if (!state?.open) {
      slashMenu.hidden = true;
      return;
    }
    const items = matchChoices(state.query);
    if (items !== slashItems) slashActive = Math.min(slashActive, Math.max(0, items.length - 1));
    slashItems = items;
    if (!items.length) {
      slashMenu.innerHTML = `<p class="menu-empty">No block type matches “${escapeHtml(state.query)}”</p>`;
    } else
      slashMenu.innerHTML = items
        .map(
          (item, index) =>
            `<button class="menu-item" role="option" data-index="${index}" aria-selected="${index === slashActive}" tabindex="-1"><span>${escapeHtml(item.label)}</span>${item.hint ? `<kbd>${escapeHtml(item.hint)}</kbd>` : ""}</button>`,
        )
        .join("");
    slashMenu.hidden = false;
    positionAt(slashMenu, state.from);
    slashMenu.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }

  slashMenu.addEventListener("mousedown", (event) => event.preventDefault());
  slashMenu.addEventListener("click", (event) => {
    const index = Number((event.target as HTMLElement).closest<HTMLElement>("[data-index]")?.dataset.index);
    if (Number.isInteger(index) && slashItems[index]) chooseSlash(slashItems[index]);
  });

  /** Places a popover under a document position (or above it when the window has no room below). */
  function positionAt(element: HTMLElement, pos: number) {
    const coords = editor.view.coordsAtPos(Math.min(pos, editor.state.doc.content.size));
    const box = wrapper.getBoundingClientRect();
    const left = Math.max(0, Math.min(coords.left - box.left, box.width - 240));
    element.style.left = `${left}px`;
    placeVertically(element, coords.top - box.top, coords.bottom - box.top);
  }

  /** Below the anchor if it fits in the visible part of the window, else above it. */
  function placeVertically(element: HTMLElement, anchorTop: number, anchorBottom: number) {
    const box = wrapper.getBoundingClientRect();
    const visible = (wrapper.closest(".doc-scroll") ?? wrapper).getBoundingClientRect();
    const height = element.offsetHeight;
    const below = box.top + anchorBottom + 4 + height <= visible.bottom;
    const above = box.top + anchorTop - 4 - height >= visible.top;
    element.style.top = `${below || !above ? anchorBottom + 4 : anchorTop - 4 - height}px`;
  }

  /* ---------- Links (⌘K) ---------- */

  const linkBox = document.createElement("form");
  linkBox.className = "editor-menu link-popover";
  linkBox.hidden = true;
  linkBox.innerHTML = `<input type="text" aria-label="Link: a web address or a region id such as v1" placeholder="https://… or a region id (v1)" spellcheck="false"><button type="submit" class="menu-item">Link</button>`;
  wrapper.append(linkBox);
  const linkInput = linkBox.querySelector("input")!;
  let linkRange: { from: number; to: number } | null = null;

  function openLink() {
    const { state } = editor;
    let { from, to } = state.selection;
    const linkType = state.schema.marks.link;
    if (from === to) {
      const $pos = state.doc.resolve(from);
      const mark = linkType.isInSet($pos.marks());
      if (!mark) {
        host.notify?.("Select text to link first.");
        return;
      }
      // Extend over the whole link around the cursor.
      const parent = $pos.parent;
      const start = $pos.start();
      let rangeFrom = from;
      let rangeTo = to;
      parent.forEach((child, offset) => {
        const childFrom = start + offset;
        const childTo = childFrom + child.nodeSize;
        if (mark.isInSet(child.marks) && childFrom <= from && childTo >= from) {
          rangeFrom = Math.min(rangeFrom, childFrom);
          rangeTo = Math.max(rangeTo, childTo);
        }
      });
      from = rangeFrom;
      to = rangeTo;
    }
    linkRange = { from, to };
    const current = state.doc.rangeHasMark(from, to, linkType) ? findLink(from, to) : "";
    linkInput.value = current.startsWith("region:") ? current.slice("region:".length) : current;
    linkBox.hidden = false;
    positionAt(linkBox, from);
    linkInput.focus();
    linkInput.select();
  }

  function findLink(from: number, to: number): string {
    let href = "";
    editor.state.doc.nodesBetween(from, to, (node) => {
      const mark = node.marks.find((candidate) => candidate.type.name === "link");
      if (mark && !href) href = String(mark.attrs.href);
    });
    return href;
  }

  function closeLink(refocus = true) {
    linkBox.hidden = true;
    linkRange = null;
    if (refocus) editor.view.focus();
  }

  linkBox.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!linkRange) return closeLink();
    const value = linkInput.value.trim();
    const linkType = editor.schema.marks.link;
    const tr = editor.state.tr.removeMark(linkRange.from, linkRange.to, linkType);
    if (value) {
      const region = regionById(value.replace(/^region:/i, ""));
      const href = safeHref(region ? `region:${region.id}` : /^www\./i.test(value) ? `https://${value}` : value);
      if (!href) {
        linkInput.setCustomValidity("Use a web address (https://…) or a region id such as v1.");
        linkInput.reportValidity();
        return;
      }
      tr.addMark(linkRange.from, linkRange.to, linkType.create({ href }));
    }
    dispatch(tr);
    closeLink();
  });
  linkInput.addEventListener("input", () => linkInput.setCustomValidity(""));
  linkBox.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeLink();
    }
  });
  linkInput.addEventListener("blur", () => setTimeout(() => !linkBox.contains(document.activeElement) && closeLink(false), 120));

  /* ---------- Node views ---------- */

  const nodeViews: Record<string, { addNodeView: () => NodeViewRenderer }> = {
    todo: {
      addNodeView:
        () =>
        ({ node: initial, getPos }) => {
          let node = initial;
          const dom = document.createElement("div");
          const box = document.createElement("span");
          box.className = "todo-box";
          box.contentEditable = "false";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.setAttribute("aria-label", "Done");
          box.append(input);
          const content = document.createElement("div");
          content.className = "todo-text";
          dom.append(box, content);
          const apply = () => {
            dom.className = "blk blk-todo";
            dom.dataset.type = "todo";
            dom.dataset.id = String(node.attrs.id ?? "");
            dom.dataset.indent = String(node.attrs.indent ?? 0);
            dom.dataset.checked = String(node.attrs.checked === true);
            input.checked = node.attrs.checked === true;
          };
          apply();
          input.addEventListener("change", () => {
            const pos = typeof getPos === "function" ? getPos() : undefined;
            if (pos === undefined) return;
            dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: input.checked }));
          });
          return {
            dom,
            contentDOM: content,
            update(next: PMNode) {
              if (next.type !== node.type) return false;
              node = next;
              apply();
              return true;
            },
            stopEvent: (event: Event) => box.contains(event.target as Node),
            ignoreMutation: (mutation: MutationRecord | { type: "selection"; target: Node }) =>
              mutation.type !== "selection" && box.contains(mutation.target as Node),
          };
        },
    },
    view: {
      addNodeView:
        () =>
        ({ node: initial }) => {
          let node = initial;
          const dom = document.createElement("div");
          dom.className = "blk blk-view";
          dom.dataset.type = "view";
          dom.contentEditable = "false";
          const render = () => {
            dom.dataset.id = String(node.attrs.id ?? "");
            const caption = String(node.attrs.text || describeView((node.attrs.data as BlockData) ?? {}));
            dom.innerHTML = `<span class="view-icon">${VIEW_ICON}</span><span class="view-text"><span class="view-label">3D view</span><span class="view-caption">${renderInline(caption)}</span></span><button class="view-show" type="button">Show</button>`;
            dom.querySelector(".view-show")!.addEventListener("click", () => host.showView((node.attrs.data as BlockData) ?? {}, caption));
          };
          render();
          return {
            dom,
            update(next: PMNode) {
              if (next.type !== node.type) return false;
              const changed = next.attrs.data !== node.attrs.data || next.attrs.text !== node.attrs.text || next.attrs.id !== node.attrs.id;
              node = next;
              if (changed) render();
              return true;
            },
            stopEvent: (event: Event) => Boolean((event.target as HTMLElement).closest?.(".view-show, .region-mention")),
            ignoreMutation: () => true,
          };
        },
    },
    question: {
      addNodeView:
        () =>
        ({ node: initial }) => {
          let node = initial;
          const dom = document.createElement("div");
          dom.className = "blk blk-question";
          dom.dataset.type = "question";
          dom.contentEditable = "false";
          const render = () => {
            dom.dataset.id = String(node.attrs.id ?? "");
            const data = (node.attrs.data as BlockData) ?? {};
            dom.replaceChildren();
            if (!host.renderQuestion?.(dom, data, String(node.attrs.id))) dom.innerHTML = questionPreview(data);
          };
          render();
          return {
            dom,
            update(next: PMNode) {
              if (next.type !== node.type) return false;
              const changed = next.attrs.data !== node.attrs.data || next.attrs.id !== node.attrs.id;
              node = next;
              if (changed) render();
              return true;
            },
            stopEvent: (event: Event) => Boolean((event.target as HTMLElement).closest?.("button, input, .region-mention")),
            ignoreMutation: () => true,
          };
        },
    },
    table: {
      addNodeView:
        () =>
        ({ node: initial, getPos }) => {
          let node = initial;
          const dom = document.createElement("div");
          const preview = document.createElement("div");
          preview.className = "table-preview";
          preview.contentEditable = "false";
          const pre = document.createElement("pre");
          pre.className = "table-source";
          const code = document.createElement("code");
          pre.append(code);
          dom.append(preview, pre);
          let shown = "";
          const apply = () => {
            dom.className = "blk blk-table";
            dom.dataset.type = "table";
            dom.dataset.id = String(node.attrs.id ?? "");
            if (node.textContent !== shown) {
              shown = node.textContent;
              preview.innerHTML = tableHtml(shown);
            }
          };
          apply();
          // Clicking the rendered table puts the cursor in its source.
          preview.addEventListener("mousedown", (event) => {
            if ((event.target as HTMLElement).closest(".region-mention, a")) return;
            event.preventDefault();
            const pos = typeof getPos === "function" ? getPos() : undefined;
            if (pos === undefined) return;
            dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + node.nodeSize - 1)));
            editor.view.focus();
          });
          return {
            dom,
            contentDOM: code,
            update(next: PMNode) {
              if (next.type !== node.type) return false;
              node = next;
              apply();
              return true;
            },
            stopEvent: (event: Event) => preview.contains(event.target as Node),
            ignoreMutation: (mutation: MutationRecord | { type: "selection"; target: Node }) =>
              mutation.type !== "selection" && preview.contains(mutation.target as Node),
          };
        },
    },
  };

  const extensions = [
    ...schemaExtensions.map((extension) => {
      const view = nodeViews[extension.name];
      // biome-ignore lint/suspicious/noExplicitAny: Tiptap's extend() config type differs per extension kind.
      return view ? (extension as any).extend(view) : extension;
    }),
    editorBehaviour,
  ];

  /* ---------- Clipboard and drops ---------- */

  function sliceFromMarkdown(text: string, context: PMNode): Slice {
    const { schema } = editor;
    if (context.type.spec.code) return new Slice(Fragment.from(schema.text(text)), 0, 0);
    const parsed = markdownToBlocks(text);
    if (!parsed.length) return Slice.empty;
    const nodes = parsed.map((block) => blockToNode(schema, { ...block, id: newBlockId() }));
    if (nodes.length === 1 && parsed[0].type === "p") return new Slice(Fragment.from(nodes[0]), 1, 1);
    return new Slice(Fragment.from(nodes), nodes[0].isTextblock ? 1 : 0, nodes.at(-1)?.isTextblock ? 1 : 0);
  }

  /** Pasted and dropped questions and views are checked like any other write; bad ones come in as text. */
  function checkNodes(nodes: readonly PMNode[]): PMNode[] {
    let changed = 0;
    const checked = nodes.map((node) => {
      const result = checkedNode(editor.schema, node);
      if (result.changed) changed++;
      return result.node;
    });
    if (changed)
      host.notify?.(`${changed === 1 ? "A question or 3D view" : `${changed} questions or 3D views`} could not be read, so the text was added instead.`);
    return checked;
  }

  function checkSlice(slice: Slice): Slice {
    const nodes: PMNode[] = [];
    slice.content.forEach((node) => {
      nodes.push(node);
    });
    if (!nodes.some((node) => node.type.name === NODE_NAMES.question || node.type.name === NODE_NAMES.view)) return slice;
    return new Slice(Fragment.from(checkNodes(nodes)), slice.openStart, slice.openEnd);
  }

  function markdownFromSlice(slice: Slice): string {
    const blocks: EditorBlock[] = [];
    slice.content.forEach((node) => {
      if (node.isBlock) blocks.push(nodeToBlock(node));
    });
    if (!blocks.length) return slice.content.textBetween(0, slice.content.size, "\n\n");
    return blocksToMarkdown(blocks).trimEnd();
  }

  const markdownFile = (file: File) => /\.(md|markdown|txt)$/i.test(file.name) || file.type === "text/markdown" || file.type === "text/plain";

  /* ---------- The editor ---------- */

  const editor = new Editor({
    element: mount,
    extensions,
    content: blocksToDoc(createDocSchema(), blocks).toJSON(),
    injectCSS: false,
    enableCoreExtensions: { textDirection: false },
    editorProps: {
      attributes: {
        class: "doc-body",
        "aria-label": options.label ?? "Doc",
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "true",
      },
      clipboardTextParser: (text, $context) => sliceFromMarkdown(text, $context.parent),
      transformPasted: (slice) => checkSlice(slice),
      clipboardTextSerializer: (slice) => markdownFromSlice(slice),
      handleDrop(view: EditorView, event: DragEvent) {
        const files = [...(event.dataTransfer?.files ?? [])].filter(markdownFile);
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void files[0].text().then((text) => {
          const { blocks: imported } = parseDocument(text);
          if (!imported.length) return;
          const nodes = checkNodes(imported.map((block) => blockToNode(editor.schema, { ...block, id: newBlockId() })));
          const $pos = editor.state.doc.resolve(Math.min(at?.pos ?? editor.state.doc.content.size, editor.state.doc.content.size));
          const insertAt = $pos.depth >= 1 ? $pos.after(1) : $pos.pos;
          dispatch(editor.state.tr.insert(insertAt, nodes).scrollIntoView());
          host.notify?.(`Added ${imported.length} block${imported.length === 1 ? "" : "s"} from ${files[0].name}.`);
        });
        return true;
      },
    },
  });

  let lastDoc = editor.state.doc;
  editor.on("transaction", ({ transaction }) => {
    const doc = editor.state.doc;
    if (doc === lastDoc) return;
    const before = lastDoc;
    lastDoc = doc;
    if (transaction.getMeta(REMOTE)) return;
    for (const id of changedIds(before, doc)) dirty.set(id, ++clock);
    const current = topBlock(editor.state)?.node.attrs.id as string | undefined;
    if (current) typed = { id: current, at: Date.now() };
    scheduleSave();
  });
  editor.on("focus", () => dispatch(editor.state.tr.setMeta(agentKey, { focused: true }).setMeta("addToHistory", false)));
  editor.on("blur", () => {
    if (!destroyed) dispatch(editor.state.tr.setMeta(agentKey, { focused: false }).setMeta("addToHistory", false));
    void save();
  });

  /* ---------- Block handle: drag to reorder, and the block menu ---------- */

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "block-handle";
  handle.innerHTML = HANDLE_ICON;
  handle.setAttribute("aria-label", "Block menu; drag to move the block");
  handle.title = "Drag to move · click for options";
  handle.hidden = true;
  handle.tabIndex = -1;
  const dropLine = document.createElement("div");
  dropLine.className = "drop-line";
  dropLine.hidden = true;
  const blockMenu = document.createElement("div");
  blockMenu.className = "editor-menu block-menu";
  blockMenu.setAttribute("role", "menu");
  blockMenu.hidden = true;
  wrapper.append(handle, dropLine, blockMenu);
  let handleIndex = -1;

  const blockElements = () => [...editor.view.dom.children] as HTMLElement[];

  function showHandle(index: number) {
    const element = blockElements()[index];
    if (!element) return;
    handleIndex = index;
    const box = wrapper.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    handle.style.top = `${rect.top - box.top + Math.min(rect.height, 26) / 2 - 11}px`;
    handle.hidden = false;
  }

  editor.view.dom.addEventListener("mousemove", (event) => {
    if (dragging) return;
    const element = (event.target as HTMLElement).closest?.(".ProseMirror > *");
    if (!element) return;
    const index = blockElements().indexOf(element as HTMLElement);
    if (index >= 0 && index !== handleIndex) showHandle(index);
  });
  wrapper.addEventListener("mouseleave", () => {
    if (!dragging && blockMenu.hidden) handle.hidden = true;
    handleIndex = blockMenu.hidden ? -1 : handleIndex;
  });

  let dragging = false;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || handleIndex < 0) return;
    event.preventDefault();
    const from = handleIndex;
    const y0 = event.clientY;
    let target = -1;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (!dragging && Math.abs(moveEvent.clientY - y0) < 4) return;
      dragging = true;
      wrapper.classList.add("dragging-block");
      const elements = blockElements();
      target = elements.length;
      for (const [index, element] of elements.entries()) {
        const rect = element.getBoundingClientRect();
        if (moveEvent.clientY < rect.top + rect.height / 2) {
          target = index;
          break;
        }
      }
      const box = wrapper.getBoundingClientRect();
      const edge = target < elements.length ? elements[target].getBoundingClientRect().top - 2 : elements.at(-1)!.getBoundingClientRect().bottom + 2;
      dropLine.style.top = `${edge - box.top}px`;
      dropLine.hidden = false;
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      dropLine.hidden = true;
      wrapper.classList.remove("dragging-block");
      if (dragging) {
        dragging = false;
        if (target >= 0) moveBlock(from, target);
        editor.view.focus();
      } else openBlockMenu(from);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", end, { once: true });
  });

  function openBlockMenu(index: number) {
    const block = blockAt(editor.state.doc, index);
    if (!block) return;
    const turnable = block.node.isTextblock;
    const current = blockType(block.node);
    const tone = block.node.attrs.tone;
    blockMenu.innerHTML = `${
      turnable
        ? `<p class="menu-label">Turn into</p>${TEXT_CHOICES.map(
            (choice, i) =>
              `<button class="menu-item" role="menuitemradio" aria-checked="${choice.type === current && (choice.type !== "callout" || tone === "note")}" data-turn="${i}">${escapeHtml(choice.label)}</button>`,
          ).join("")}<hr>`
        : ""
    }<button class="menu-item" role="menuitem" data-act="duplicate">Duplicate</button><button class="menu-item" role="menuitem" data-act="copy">Copy link</button><button class="menu-item danger" role="menuitem" data-act="delete">Delete</button>`;
    const box = wrapper.getBoundingClientRect();
    const rect = handle.getBoundingClientRect();
    blockMenu.style.left = `${rect.right - box.left + 4}px`;
    blockMenu.hidden = false;
    placeVertically(blockMenu, rect.bottom - box.top + 4, rect.top - box.top - 4);
    blockMenu.dataset.index = String(index);
    blockMenu.querySelector<HTMLElement>(".menu-item")?.focus();
  }

  function closeBlockMenu() {
    blockMenu.hidden = true;
  }

  blockMenu.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    const index = Number(blockMenu.dataset.index);
    const block = blockAt(editor.state.doc, index);
    closeBlockMenu();
    if (!block) return;
    if (button.dataset.turn !== undefined) {
      const choice = TEXT_CHOICES[Number(button.dataset.turn)];
      dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, block.pos + 1)));
      turnInto(choice.type, choice.attrs);
      editor.view.focus();
    } else if (button.dataset.act === "duplicate") duplicate(index);
    else if (button.dataset.act === "delete") remove(index);
    else if (button.dataset.act === "copy") {
      const ref = `block:${block.node.attrs.id}`;
      void navigator.clipboard?.writeText(ref).then(
        () => host.notify?.(`Copied ${ref}`),
        () => host.notify?.(`Block link: ${ref}`),
      );
    }
  });
  blockMenu.addEventListener("keydown", (event) => {
    const items = [...blockMenu.querySelectorAll<HTMLElement>(".menu-item")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeBlockMenu();
      editor.view.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!blockMenu.hidden && !blockMenu.contains(event.target as Node) && event.target !== handle && !handle.contains(event.target as Node)) closeBlockMenu();
  });

  /* ---------- Sync ---------- */

  function report(next: "saving" | "saved" | "error", message?: string) {
    if (next === status && next !== "error") return;
    status = next;
    host.onStatus?.(next, message);
  }

  /** Saves 400 ms after typing stops. The header says "Saving…" from the first keystroke, not only once the save runs. */
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), SAVE_DELAY_MS);
    if (status !== "error") report("saving");
  }

  async function save(): Promise<void> {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (destroyed && !dirty.size) return;
    if (saving) {
      saveAgain = true;
      return saving;
    }
    const current = docBlocks(editor.state.doc);
    const versions = new Map(dirty);
    const ops = planSave(base, current, new Set(versions.keys()));
    if (!ops.length) {
      for (const [id, version] of versions) if (dirty.get(id) === version) dirty.delete(id);
      // Edits that cancel out (typed, then deleted) leave nothing to save.
      if (!dirty.size && saveTimer === undefined) {
        failures = 0;
        report("saved");
      }
      return;
    }
    report("saving");
    saving = (async () => {
      const result = await host.save(ops);
      if ("error" in result) {
        failures++;
        report("error", result.error.message);
        // Someone else may have deleted a block this save refers to: take their changes, keep ours, retry.
        if (failures <= 2 && !destroyed) {
          saving = null;
          await reconcile();
          scheduleSave();
        } else if (failures === 3) host.onSaveFailed?.(result.error.message);
        return;
      }
      failures = 0;
      const saved = new Set(versions.keys());
      base = savedBase(base, current, saved);
      renameInserted(ops, result);
      for (const [id, version] of versions) if (dirty.get(id) === version) dirty.delete(id);
      report(dirty.size || saveTimer !== undefined ? "saving" : "saved");
      const touched = [...saved].filter((id) => current.some((block) => block.id === id));
      if (touched.length) host.onSaved?.(touched);
    })();
    try {
      await saving;
    } finally {
      saving = null;
    }
    if (saveAgain) {
      saveAgain = false;
      await save();
    }
  }

  /** The store keeps editor-chosen ids unless one was taken; follow any it replaced. */
  function renameInserted(ops: BlockOp[], result: BlockOpsResult) {
    const sent = ops.flatMap((op) => (op.op === "insert" ? op.blocks.map((block) => block.id ?? "") : []));
    const renames = new Map<string, string>();
    sent.forEach((id, index) => {
      const got = result.inserted[index]?.id;
      if (got && id && got !== id) renames.set(id, got);
    });
    if (!renames.size) return;
    const tr = editor.state.tr.setMeta(REMOTE, true).setMeta("addToHistory", false);
    editor.state.doc.forEach((node, pos) => {
      const next = renames.get(node.attrs.id as string);
      if (next) tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: next });
    });
    dispatch(tr);
    base = {
      order: base.order.map((id) => renames.get(id) ?? id),
      keys: new Map([...base.keys].map(([id, key]) => [renames.get(id) ?? id, key])),
    };
    for (const [from, to] of renames) {
      const version = dirty.get(from);
      if (version !== undefined) {
        dirty.delete(from);
        dirty.set(to, version);
      }
    }
  }

  /** Brings the store's version into the editor, keeping what the user has not saved. */
  async function reconcile() {
    const stored = await host.fetch();
    if (!stored || destroyed) return;
    const plan = planReconcile(base, docBlocks(editor.state.doc), stored as EditorBlock[], new Set(dirty.keys()));
    base = plan.base;
    const tr = editor.state.tr;
    applyTarget(tr, editor.schema, plan.target, newBlockId);
    const byAgent = plan.foreign.filter((id) => stored.find((block) => block.id === id)?.updatedBy === "agent");
    if (tr.docChanged || byAgent.length) {
      tr.setMeta(REMOTE, true).setMeta("addToHistory", false);
      if (byAgent.length) tr.setMeta(agentKey, { flash: byAgent });
      dispatch(tr);
      if (byAgent.length) setTimeout(() => !destroyed && dispatch(editor.state.tr.setMeta(agentKey, { unflash: byAgent })), FLASH_MS);
    }
    // Blocks only the editor has still need saving.
    const known = new Set(stored.map((block) => block.id));
    if (plan.target.some((entry) => "keep" in entry && !known.has(entry.id))) scheduleSave();
  }

  async function refresh(): Promise<void> {
    if (refreshing) {
      refreshAgain = true;
      return refreshing;
    }
    refreshing = (async () => {
      if (saving || saveTimer !== undefined || dirty.size) await save();
      await reconcile();
    })();
    try {
      await refreshing;
    } finally {
      refreshing = null;
    }
    if (refreshAgain) {
      refreshAgain = false;
      await refresh();
    }
  }

  function currentId(): string | null {
    return (topBlock(editor.state)?.node.attrs.id as string | undefined) ?? null;
  }

  return {
    element: wrapper,
    refresh,
    isLocked(id: string) {
      if (dirty.has(id)) return true;
      return Boolean(editor.isFocused && typed && typed.id === id && currentId() === id && Date.now() - typed.at < LOCK_MS);
    },
    editing: () => (editor.isFocused ? currentId() : null),
    reveal(id: string) {
      const found = findBlock(editor.state.doc, id);
      if (!found) return;
      const element = blockElements()[found.index];
      element?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      dispatch(editor.state.tr.setMeta(agentKey, { pulse: [id] }).setMeta("addToHistory", false));
      setTimeout(() => {
        if (destroyed) return;
        const tr = editor.state.tr.setMeta(agentKey, { unflash: [id] }).setMeta("addToHistory", false);
        dispatch(tr);
      }, FLASH_MS);
    },
    focus(where: "start" | "end" = "end") {
      editor.commands.focus(where);
    },
    flush: () => save(),
    get saving() {
      return saving !== null;
    },
    get unsaved() {
      return failures > 0 && (dirty.size > 0 || saveTimer !== undefined);
    },
    destroy() {
      void save().finally(() => {
        destroyed = true;
        editor.destroy();
      });
    },
  };
}
