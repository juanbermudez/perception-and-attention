// Markdown ↔ blocks (spec §9.2) and the safe inline renderer (§9.1, §13). Pure: tested in Node.
//
// Import: `marked`'s block lexer gives top-level tokens and each becomes one block; list items
// become one block each with an indent. HTML comments are read only for the `view`, `question` and
// `table` metadata; any other raw HTML is kept as text, which the renderer escapes.
//
// Export: one block per paragraph-level element. Text that would read as block syntax (a line
// starting with "# ", "- ", "1. ", ">" and so on) gets a backslash, and import removes exactly
// those backslashes, so export → import returns the same blocks.

import { Lexer, type Token, type Tokens } from "marked";
import type { BlockContent, BlockData, CalloutTone } from "../store/types";
import { regionById } from "./inline";

const TONES: readonly CalloutTone[] = ["note", "tip", "warning"];
const CODE_LANG = /^[\w+#.-]{1,32}$/;
const VIEW_COMMENT = /^<!--\s*view\s+(\{[\s\S]*\})\s*-->\s*$/;
const QUESTION_COMMENT = /^<!--\s*question\s+(\{[\s\S]*\})\s*-->\s*$/;
const QUESTION_END = /^<!--\s*\/question\s*-->\s*$/;
const TABLE_COMMENT = /^<!--\s*table\s*-->\s*$/;
const EXPORT_HEADER = /^<!--\s*perception-attention\b[\s\S]*-->\s*$/;
const VIEW_PREFIX = "**3D view:**";

// ── Block-start escaping ──────────────────────────────────────────────────────────────────────

type LineContext = "text" | "item" | "quote";

/** Would this line start a block (or end a paragraph) if written as-is? */
function isBlockStart(line: string, context: LineContext, first: boolean): boolean {
  return (
    /^#{1,6}(\s|$)/.test(line) ||
    /^>/.test(line) ||
    /^[-+*](\s|$)/.test(line) ||
    /^\d{1,9}[.)](\s|$)/.test(line) ||
    /^([-*_])(\s*\1){2,}\s*$/.test(line) ||
    /^(=+|-+)\s*$/.test(line) ||
    /^(`{3,}|~{3,})/.test(line) ||
    /^<[A-Za-z!/?]/.test(line) ||
    /^\[[^\]]+\]:/.test(line) ||
    (/^[\s|:-]+$/.test(line) && line.includes("|") && line.includes("-")) ||
    (first && context === "item" && /^\[[ xX]\](\s|$)/.test(line)) ||
    (first && context === "quote" && /^\[!\w+\]/.test(line))
  );
}

function escapeLine(line: string, context: LineContext, first: boolean): string {
  if (!isBlockStart(line, context, first)) return line;
  const ordered = /^(\d{1,9})([.)])/.exec(line);
  return ordered ? `${ordered[1]}\\${line.slice(ordered[1].length)}` : `\\${line}`;
}

function unescapeLine(line: string, context: LineContext, first: boolean): string {
  const ordered = /^(\d{1,9})\\([.)])/.exec(line);
  if (ordered) {
    const plain = ordered[1] + line.slice(ordered[1].length + 1);
    return isBlockStart(plain, context, first) ? plain : line;
  }
  if (line.startsWith("\\") && isBlockStart(line.slice(1), context, first)) return line.slice(1);
  return line;
}

const escapeText = (text: string, context: LineContext) => text.split("\n").map((line, index) => escapeLine(line, context, index === 0));
const unescapeText = (text: string, context: LineContext) =>
  text
    .split("\n")
    .map((line, index) => unescapeLine(line, context, index === 0))
    .join("\n");

/** A closing run of #s would be dropped from an ATX heading, so it is escaped. */
function escapeHeading(text: string): string {
  const flat = text.replace(/\s*\n\s*/g, " ");
  if (/^#+$/.test(flat) || /\s#+\s*$/.test(flat)) return flat.replace(/(#+)(\s*)$/, "\\$1$2");
  return flat;
}
function unescapeHeading(text: string): string {
  const match = /^(.*?)\\(#+)(\s*)$/.exec(text);
  if (!match) return text;
  const plain = `${match[1]}${match[2]}${match[3]}`;
  return escapeHeading(plain) === text ? plain : text;
}

// ── View and question metadata ────────────────────────────────────────────────────────────────

/** JSON that is safe inside an HTML comment: no "-->" can appear. */
function commentJson(data: BlockData): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function parseObject(json: string): BlockData | null {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as BlockData) : null;
  } catch {
    return null;
  }
}

const shortName = (id: unknown) => (typeof id === "string" ? (regionById(id)?.short.split(" · ")[0] ?? id) : "?");

function listWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** A readable line for a saved view, e.g. "LGN and V1 from the left, skull dissolved". */
export function describeView(view: BlockData): string {
  const parts: string[] = [];
  const camera = (typeof view.camera === "object" && view.camera !== null ? view.camera : {}) as Record<string, unknown>;
  const isolate = view.isolate as unknown;
  const isolated = Array.isArray(isolate)
    ? isolate
    : Array.isArray((isolate as { regions?: unknown })?.regions)
      ? (isolate as { regions: unknown[] }).regions
      : [];
  let subject = "";
  if (typeof camera.focus === "string") subject = shortName(camera.focus);
  else if (Array.isArray(camera.frame)) subject = listWords(camera.frame.map(shortName));
  else if (isolated.length) subject = listWords(isolated.map(shortName));
  if (typeof camera.from === "string") subject = `${subject || "The brain"} from the ${camera.from}`;
  if (typeof camera.zoom === "number") subject = `${subject || "The brain"} at ${Number(camera.zoom.toFixed(2))}×`;
  if (subject) parts.push(subject);
  if (isolated.length && (typeof camera.focus === "string" || Array.isArray(camera.frame))) parts.push(`only ${listWords(isolated.map(shortName))} shown`);
  const layers = typeof view.layers === "object" && view.layers !== null ? Object.entries(view.layers as Record<string, unknown>) : [];
  const gone = layers.filter(([, presence]) => presence === 0).map(([layer]) => layer.replace(/_/g, " "));
  if (gone.length) parts.push(`${listWords(gone)} ${view.effect === "fade" ? "faded" : "dissolved"}`);
  if (!parts.length) return "Saved 3D view";
  const line = parts.join(", ");
  return line[0].toUpperCase() + line.slice(1);
}

/**
 * One line of a question's readable part. The data lives in the comment, so this text is only for
 * people: newlines are flattened and "<!--" is written as an entity, so no field can end the
 * question early or start a block of its own.
 */
const readable = (text: unknown) =>
  String(text ?? "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/<!--/g, "&lt;!--");

function questionLines(question: BlockData): string[] {
  const lines = [`**Question:** ${readable(question.prompt)}`];
  const list = (items: unknown[], ordered: boolean) => items.map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${readable(item)}`).join("\n");
  const answer = (text: string) => lines.push(`*Answer:* ${text}`);
  switch (question.kind) {
    case "choice": {
      const choices = Array.isArray(question.choices) ? question.choices : [];
      const correct = Array.isArray(question.answer) ? question.answer.filter((index): index is number => typeof index === "number") : [];
      lines.push(list(choices, true));
      answer(correct.map((index) => `${index + 1}. ${readable(choices[index] ?? "?")}`).join("; "));
      break;
    }
    case "truefalse":
      answer(question.answer === true ? "True" : "False");
      break;
    case "region": {
      if (Array.isArray(question.choices)) lines.push(list(question.choices.map(shortName), false));
      answer(listWords((Array.isArray(question.answer) ? question.answer : []).map(shortName)));
      break;
    }
    case "order":
      answer((Array.isArray(question.items) ? question.items : []).map(readable).join(" → "));
      break;
    default:
      answer(readable(question.answer));
  }
  if (typeof question.explain === "string" && question.explain) lines.push(`*Why:* ${readable(question.explain)}`);
  return lines;
}

// ── Markdown → blocks ─────────────────────────────────────────────────────────────────────────

function listBlocks(list: Tokens.List, depth: number, out: BlockContent[]) {
  for (const item of list.items) {
    const own = item.tokens.filter((token) => token.type !== "list" && token.type !== "checkbox" && token.type !== "space");
    const raw = own.map((token) => ("text" in token && (token.type === "text" || token.type === "paragraph") ? token.text : token.raw.trim())).join("\n");
    const text = unescapeText(raw, "item");
    const indent = Math.min(depth, 3);
    if (item.task) out.push({ type: "todo", indent, text, data: { checked: item.checked === true } });
    else out.push({ type: list.ordered ? "number" : "bullet", indent, text });
    for (const token of item.tokens) if (token.type === "list") listBlocks(token as Tokens.List, depth + 1, out);
  }
}

function quoteBlock(text: string): BlockContent {
  const lines = text.split("\n");
  const marker = /^\[!(\w+)\][ \t]*(.*)$/.exec(lines[0]);
  const tone = marker?.[1].toLowerCase() as CalloutTone | undefined;
  if (marker && tone && TONES.includes(tone)) {
    const body = [marker[2], ...lines.slice(1)].filter((line, index) => index > 0 || line !== "").join("\n");
    return { type: "callout", text: unescapeText(body, "text"), data: { tone } };
  }
  return { type: "quote", text: unescapeText(text, "quote") };
}

/**
 * Where a question's readable part ends: at its own end marker. A marker is its own only if no other
 * question or view comment comes first, so a hand-edited file that lost one cannot hide the next
 * question. Without one, the readable lines are read as ordinary blocks.
 */
function questionEnd(tokens: readonly Token[], start: number): number {
  for (let index = start + 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "html") continue;
    const html = (token as Tokens.HTML).text.trim();
    if (QUESTION_END.test(html)) return index;
    if (QUESTION_COMMENT.test(html) || VIEW_COMMENT.test(html)) break;
  }
  return start;
}

/** Parses markdown into blocks. Never throws; unknown or unsafe syntax becomes plain text. */
export function markdownToBlocks(markdown: string): BlockContent[] {
  const tokens = new Lexer({ gfm: true }).lex(markdown.replace(/\r\n?/g, "\n"));
  const out: BlockContent[] = [];
  const next = (from: number) => {
    let index = from;
    while (tokens[index]?.type === "space") index++;
    return index;
  };
  for (let index = 0; index < tokens.length; index++) {
    const token: Token = tokens[index];
    switch (token.type) {
      case "space":
      case "def":
        break;
      case "heading": {
        const depth = Math.min((token as Tokens.Heading).depth, 3);
        out.push({ type: `h${depth}` as "h1" | "h2" | "h3", text: unescapeHeading((token as Tokens.Heading).text) });
        break;
      }
      case "paragraph":
      case "text":
        out.push({ type: "p", text: unescapeText((token as Tokens.Paragraph).text, "text") });
        break;
      case "list":
        listBlocks(token as Tokens.List, 0, out);
        break;
      case "blockquote":
        out.push(quoteBlock((token as Tokens.Blockquote).text.replace(/\n+$/, "")));
        break;
      case "code": {
        const lang = ((token as Tokens.Code).lang ?? "").trim().split(/\s+/)[0];
        out.push(
          CODE_LANG.test(lang) ? { type: "code", text: (token as Tokens.Code).text, data: { lang } } : { type: "code", text: (token as Tokens.Code).text },
        );
        break;
      }
      case "table":
        out.push({ type: "table", text: token.raw.trim() });
        break;
      case "hr":
        out.push({ type: "divider", text: "" });
        break;
      case "html": {
        const html = (token as Tokens.HTML).text.trim();
        if (EXPORT_HEADER.test(html) || QUESTION_END.test(html)) break;
        const view = VIEW_COMMENT.exec(html);
        const viewData = view && parseObject(view[1]);
        if (viewData) {
          const after = next(index + 1);
          const caption = tokens[after];
          if (caption?.type === "paragraph" && (caption as Tokens.Paragraph).text.startsWith(VIEW_PREFIX)) {
            out.push({ type: "view", text: (caption as Tokens.Paragraph).text.slice(VIEW_PREFIX.length).trim(), data: viewData });
            index = after;
          } else out.push({ type: "view", text: describeView(viewData), data: viewData });
          break;
        }
        const question = QUESTION_COMMENT.exec(html);
        const questionData = question && parseObject(question[1]);
        if (questionData) {
          out.push({ type: "question", text: String(questionData.prompt ?? ""), data: questionData });
          index = questionEnd(tokens, index);
          break;
        }
        if (TABLE_COMMENT.test(html)) {
          const after = next(index + 1);
          const code = tokens[after];
          if (code?.type === "code") {
            out.push({ type: "table", text: (code as Tokens.Code).text });
            index = after;
          }
          break;
        }
        out.push({ type: "p", text: html });
        break;
      }
      default:
        if (token.raw.trim()) out.push({ type: "p", text: token.raw.trim() });
    }
  }
  return out;
}

// ── Blocks → markdown ─────────────────────────────────────────────────────────────────────────

function fence(code: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/** One block as markdown, with list indentation left out (single-block reads and updates keep the stored indent). */
export function blockToMarkdown(block: BlockContent): string {
  return blockLines(block, "", 1).join("\n");
}

function blockLines(block: BlockContent, pad: string, number: number): string[] {
  const data = block.data ?? {};
  switch (block.type) {
    case "h1":
    case "h2":
    case "h3":
      return [`${"#".repeat(Number(block.type[1]))} ${escapeHeading(block.text)}`.trimEnd()];
    case "bullet":
    case "number":
    case "todo": {
      const marker = block.type === "number" ? `${number}. ` : block.type === "todo" ? `- [${data.checked === true ? "x" : " "}] ` : "- ";
      const hang = pad + " ".repeat(block.type === "todo" ? 2 : marker.length);
      const lines = escapeText(block.text, "item");
      return [`${pad}${marker}${lines[0]}`.trimEnd(), ...lines.slice(1).map((line) => (line ? hang + line : ""))];
    }
    case "quote":
      return escapeText(block.text, "quote").map((line) => `> ${line}`.trimEnd());
    case "callout": {
      const tone = TONES.includes(data.tone as CalloutTone) ? data.tone : "note";
      return [`> [!${tone}]`, ...(block.text ? escapeText(block.text, "text").map((line) => `> ${line}`.trimEnd()) : [])];
    }
    case "code": {
      const ticks = fence(block.text);
      return [`${ticks}${typeof data.lang === "string" ? data.lang : ""}`, ...block.text.split("\n"), ticks];
    }
    case "table": {
      if (isTable(block.text)) return block.text.split("\n");
      // Source that does not read back as one table (the editor lets people type anything) is kept as is.
      const ticks = fence(block.text);
      return ["<!-- table -->", ticks, ...block.text.split("\n"), ticks];
    }
    case "divider":
      return ["---"];
    case "view":
      return [`<!-- view ${commentJson(data)} -->`, `${VIEW_PREFIX} ${(block.text || describeView(data)).replace(/\s*\n\s*/g, " ")}`];
    case "question":
      return [`<!-- question ${commentJson(data)} -->`, questionLines(data).join("\n\n"), "<!-- /question -->"];
    default:
      return escapeText(block.text, "text");
  }
}

/** True when the source reads back as exactly one GFM table, with nothing around it. */
function isTable(source: string): boolean {
  const tokens = new Lexer({ gfm: true }).lex(source).filter((token) => token.type !== "space");
  return tokens.length === 1 && tokens[0].type === "table" && tokens[0].raw.trim() === source;
}

const isList = (block: BlockContent) => block.type === "bullet" || block.type === "number" || block.type === "todo";

/**
 * Blocks as a markdown document. Consecutive list blocks form one tight list, nested by indent;
 * every other block is separated by a blank line. Empty paragraphs are dropped (markdown has none).
 */
export function blocksToMarkdown(blocks: readonly BlockContent[]): string {
  const chunks: string[] = [];
  let listLines: string[] = [];
  // Per nesting level: the content column of the open item, and its running number.
  let columns: number[] = [];
  let numbers: (number | null)[] = [];
  const endList = () => {
    if (listLines.length) chunks.push(listLines.join("\n"));
    listLines = [];
    columns = [];
    numbers = [];
  };
  for (const block of blocks) {
    if (!isList(block)) {
      endList();
      if (block.type === "p" && !block.text) continue;
      chunks.push(blockLines(block, "", 1).join("\n"));
      continue;
    }
    // A list item can only nest one level below the item before it.
    const level = Math.min(block.indent ?? 0, columns.length);
    columns = columns.slice(0, level + 1);
    numbers = numbers.slice(0, level + 1);
    const number = block.type === "number" ? (numbers[level] ?? 0) + 1 : null;
    numbers[level] = number;
    const pad = " ".repeat(level ? columns[level - 1] : 0);
    const marker = block.type === "number" ? `${number}. ` : "- ";
    columns[level] = pad.length + marker.length;
    listLines.push(...blockLines(block, pad, number ?? 1));
  }
  endList();
  return chunks.length ? `${chunks.join("\n\n")}\n` : "";
}

/** The first line of an exported file (spec §9.2). */
export function exportHeader(ref: string, date: Date): string {
  return `<!-- perception-attention ${ref} exported ${date.toISOString().slice(0, 10)} -->`;
}

/** A whole artifact as a downloadable markdown file: header, title as `# `, then the blocks. */
export function exportDocument(ref: string, title: string, blocks: readonly BlockContent[], date: Date): string {
  return `${exportHeader(ref, date)}\n\n${blocksToMarkdown([{ type: "h1", text: title }, ...blocks])}`;
}

/** Reads a markdown file. A file exported by this guide gives back its title and blocks. */
export function parseDocument(markdown: string): { title?: string; blocks: BlockContent[] } {
  const blocks = markdownToBlocks(markdown);
  const exported = EXPORT_HEADER.test(markdown.trimStart().split("\n")[0] ?? "");
  if (exported && blocks[0]?.type === "h1") return { title: blocks[0].text, blocks: blocks.slice(1) };
  return { blocks };
}

// ── Inline rendering ──────────────────────────────────────────────────────────────────────────

/** Inline markdown as escaped, allow-listed HTML (the parser lives in `model/inline.ts`). */
export { renderInline } from "./inline";
