// Blocks ↔ ProseMirror nodes for the flat schema (spec §9.3). A stored block is `{ id, type,
// indent, text, data }` with inline markdown in `text`; a node is one top-level child of the doc.
// Pure (no DOM): tested in Node with the headless schema.

import type { Mark as PMMark, Node as PMNode, Schema } from "@tiptap/pm/model";
import { type InlineRun, inlineRuns, type RunMark, runsToMarkdown } from "../model/inline";
import { type BlockContent, type BlockData, type BlockType, LIST_TYPES } from "../store/types";
import { BLOCK_OF_NODE, NODE_NAMES } from "./schema";

/** A block as the editor sees it: content plus its id. */
export interface EditorBlock extends BlockContent {
  id: string;
  indent: number;
}

const SOURCE_TYPES = new Set<BlockType>(["code", "table"]);
const DATA_TYPES = new Set<BlockType>(["view", "question"]);
const HEADINGS = new Set<BlockType>(["h1", "h2", "h3"]);

/** Base36 ids of the store's length (5), so the store keeps them (spec §11.2). */
export function newBlockId(random: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length))): string {
  let id = "";
  for (const byte of random(5)) id += (byte % 36).toString(36);
  return id === "start" ? newBlockId(random) : id;
}

/** The same content always gives the same key, in the store's normal form. */
export function contentKey(block: BlockContent): string {
  return JSON.stringify([block.type, LIST_TYPES.includes(block.type) ? (block.indent ?? 0) : 0, block.text, block.data ?? null]);
}

// ── Inline ────────────────────────────────────────────────────────────────────────────────────

function markFor(schema: Schema, mark: RunMark): PMMark {
  return mark.type === "link" ? schema.marks.link.create({ href: mark.href }) : schema.marks[mark.type].create();
}

/** Inline markdown as the inline nodes of a textblock. Single-line blocks turn line breaks into spaces. */
export function inlineNodes(schema: Schema, text: string, singleLine = false): PMNode[] {
  const nodes: PMNode[] = [];
  for (const run of inlineRuns(text)) {
    if (run.br) {
      if (singleLine) nodes.push(schema.text(" "));
      else nodes.push(schema.nodes.hardBreak.create());
      continue;
    }
    nodes.push(
      schema.text(
        run.text,
        run.marks.map((mark) => markFor(schema, mark)),
      ),
    );
  }
  return nodes;
}

/** The inline content of a textblock as markdown. */
export function inlineMarkdown(node: PMNode): string {
  const runs: InlineRun[] = [];
  node.forEach((child) => {
    if (child.type.name === "hardBreak") runs.push({ text: "\n", marks: [], br: true });
    else if (child.isText)
      runs.push({
        text: child.text ?? "",
        marks: child.marks.map(
          (mark): RunMark => (mark.type.name === "link" ? { type: "link", href: String(mark.attrs.href) } : { type: mark.type.name as "strong" }),
        ),
      });
  });
  return runsToMarkdown(runs);
}

// ── Blocks ↔ nodes ────────────────────────────────────────────────────────────────────────────

/** One stored block as a node. Unknown types become paragraphs, so a newer store never breaks the editor. */
export function blockToNode(schema: Schema, block: EditorBlock | (BlockContent & { id: string })): PMNode {
  const type: BlockType = BLOCK_OF_NODE[NODE_NAMES[block.type]] ? block.type : "p";
  const nodeType = schema.nodes[NODE_NAMES[type]];
  const data = block.data ?? {};
  const attrs: Record<string, unknown> = { id: block.id };
  if (LIST_TYPES.includes(type)) attrs.indent = Math.min(3, Math.max(0, Math.trunc(block.indent ?? 0)));
  if (type === "todo") attrs.checked = data.checked === true;
  if (type === "callout") attrs.tone = data.tone === "tip" || data.tone === "warning" ? data.tone : "note";
  if (type === "code") attrs.lang = typeof data.lang === "string" ? data.lang : "";
  if (DATA_TYPES.has(type)) return nodeType.create({ ...attrs, data: block.data ?? null, text: block.text });
  if (type === "divider") return nodeType.create(attrs);
  if (SOURCE_TYPES.has(type)) return nodeType.create(attrs, block.text ? schema.text(block.text) : null);
  return nodeType.create(attrs, inlineNodes(schema, block.text, HEADINGS.has(type)));
}

/** One top-level node as stored content, in the store's normal form. */
export function nodeToBlock(node: PMNode): EditorBlock {
  const type = BLOCK_OF_NODE[node.type.name] ?? "p";
  const id = String(node.attrs.id ?? "");
  const indent = LIST_TYPES.includes(type) ? Math.min(3, Math.max(0, Number(node.attrs.indent) || 0)) : 0;
  let data: BlockData | undefined;
  let text: string;
  if (DATA_TYPES.has(type)) {
    data = (node.attrs.data as BlockData | null) ?? undefined;
    text = type === "question" ? String(data?.prompt ?? node.attrs.text ?? "") : String(node.attrs.text ?? "");
  } else if (type === "divider") text = "";
  else if (SOURCE_TYPES.has(type)) text = node.textContent;
  else text = inlineMarkdown(node);
  if (type === "todo") data = { checked: node.attrs.checked === true };
  if (type === "callout") data = { tone: node.attrs.tone === "tip" || node.attrs.tone === "warning" ? node.attrs.tone : "note" };
  if (type === "code" && node.attrs.lang) data = { lang: String(node.attrs.lang) };
  const block: EditorBlock = { id, type, indent, text };
  if (data !== undefined) block.data = data;
  return block;
}

/** Every top-level node of a doc as blocks, in order. */
export function docBlocks(doc: PMNode): EditorBlock[] {
  const blocks: EditorBlock[] = [];
  doc.forEach((node) => {
    blocks.push(nodeToBlock(node));
  });
  return blocks;
}

/** A doc from stored blocks. An empty list gives one empty paragraph with a fresh id. */
export function blocksToDoc(schema: Schema, blocks: readonly (BlockContent & { id: string })[], freshId: () => string = () => newBlockId()): PMNode {
  const nodes = blocks.map((block) => blockToNode(schema, block));
  if (!nodes.length) nodes.push(schema.nodes.paragraph.create({ id: freshId() }));
  return schema.nodes.doc.create(null, nodes);
}
