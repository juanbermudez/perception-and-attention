// Markdown ↔ blocks (spec §9.2) and the safe inline renderer (§9.1, §13). Pure: tested in Node.
//
// Import: `marked`'s block lexer gives top-level tokens and each becomes one block; list items
// become one block each with an indent. HTML comments are read only for the `view` and `question`
// metadata; any other raw HTML is kept as text, which the renderer escapes.
//
// Export: one block per paragraph-level element. Text that would read as block syntax (a line
// starting with "# ", "- ", "1. ", ">" and so on) gets a backslash, and import removes exactly
// those backslashes, so export → import returns the same blocks.

import { Lexer, type Token, type Tokens } from "marked";
import { regions } from "../content/regions";
import type { RegionId } from "../content/types";
import type { BlockContent, BlockData, CalloutTone } from "../store/types";

const TONES: readonly CalloutTone[] = ["note", "tip", "warning"];
const CODE_LANG = /^[\w+#.-]{1,32}$/;
const VIEW_COMMENT = /^<!--\s*view\s+(\{[\s\S]*\})\s*-->\s*$/;
const QUESTION_COMMENT = /^<!--\s*question\s+(\{[\s\S]*\})\s*-->\s*$/;
const QUESTION_END = /^<!--\s*\/question\s*-->\s*$/;
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

const regionIds = new Map(Object.keys(regions).map((id) => [id.toLowerCase(), id as RegionId]));
function regionById(id: string) {
  const known = regionIds.get(id.toLowerCase());
  return known ? regions[known] : undefined;
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

function questionLines(question: BlockData): string[] {
  const lines = [`**Question:** ${String(question.prompt ?? "").replace(/\s*\n\s*/g, " ")}`];
  const list = (items: unknown[], ordered: boolean) => items.map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${String(item)}`).join("\n");
  const answer = (text: string) => lines.push(`*Answer:* ${text}`);
  switch (question.kind) {
    case "choice": {
      const choices = Array.isArray(question.choices) ? question.choices : [];
      const correct = Array.isArray(question.answer) ? question.answer.filter((index): index is number => typeof index === "number") : [];
      lines.push(list(choices, true));
      answer(correct.map((index) => `${index + 1}. ${String(choices[index] ?? "?")}`).join("; "));
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
      answer((Array.isArray(question.items) ? question.items : []).map(String).join(" → "));
      break;
    default:
      answer(String(question.answer ?? ""));
  }
  if (typeof question.explain === "string" && question.explain) lines.push(`*Why:* ${question.explain.replace(/\s*\n\s*/g, " ")}`);
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
          const end = tokens.findIndex((candidate, at) => at > index && candidate.type === "html" && QUESTION_END.test((candidate as Tokens.HTML).text.trim()));
          if (end > index) index = end;
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
    case "table":
      return block.text.split("\n");
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

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ENTITIES[char]);
const PUNCTUATION = /[!-/:-@[-`{-~]/;
const HTTP_URL = /^https?:\/\/[^\s<>"'`\\]+$/i;
const REGION_URL = /^region:([A-Za-z0-9]+)$/;

/** Index of the next backtick run of exactly `length` at or after `from`, or -1. */
function closingRun(text: string, length: number, from: number): number {
  const runs = /`+/g;
  runs.lastIndex = from;
  for (let match = runs.exec(text); match; match = runs.exec(text)) if (match[0].length === length) return match.index;
  return -1;
}

/** Index of the `]` that closes the `[` at `open`, or -1. */
function closingBracket(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (char === "\\") index++;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) return index;
  }
  return -1;
}

/** Index of a closing delimiter `mark` after `from` that is not preceded by whitespace, or -1. */
function closingMark(text: string, mark: string, from: number): number {
  for (let index = from; index < text.length; index++) {
    const char = text[index];
    if (char === "\\") {
      index++;
      continue;
    }
    if (char === "`") {
      const run = /^`+/.exec(text.slice(index))![0];
      const end = closingRun(text, run.length, index + run.length);
      index = end > 0 ? end + run.length - 1 : index + run.length - 1;
      continue;
    }
    if (char !== mark[0]) continue;
    // Look at the whole run of delimiter characters. In a longer run ("***") the closer is its
    // last characters; a single * or _ does not close on a run of two (a nested strong span).
    let run = 1;
    while (text[index + run] === char) run++;
    const close = index + run - mark.length;
    const opensOnly = /\s/.test(text[index - 1] ?? " ");
    const intraword = char === "_" && /[\p{L}\p{N}]/u.test(text[index + run] ?? "");
    if (opensOnly || intraword || run < mark.length || (mark.length === 1 && run % 2 === 0)) {
      index += run - 1;
      continue;
    }
    return close;
  }
  return -1;
}

function renderSpan(text: string, links: boolean): string {
  let html = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\" && PUNCTUATION.test(text[index + 1] ?? "")) {
      html += escapeHtml(text[index + 1]);
      index += 2;
      continue;
    }
    if (char === "\n") {
      html += "<br>";
      index++;
      continue;
    }
    if (char === "`") {
      const run = /^`+/.exec(text.slice(index))![0];
      const end = closingRun(text, run.length, index + run.length);
      if (end > 0) {
        let code = text.slice(index + run.length, end).replace(/\n/g, " ");
        if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1);
        html += `<code>${escapeHtml(code)}</code>`;
        index = end + run.length;
        continue;
      }
      html += escapeHtml(run);
      index += run.length;
      continue;
    }
    if (char === "[" && links) {
      const close = closingBracket(text, index);
      // One level of parentheses is allowed inside the URL, as in Wikipedia links.
      const target = close > 0 && text[close + 1] === "(" ? /^\(((?:[^()\s]|\([^()\s]*\))*)\)/.exec(text.slice(close + 1)) : null;
      if (target) {
        const label = renderSpan(text.slice(index + 1, close), false);
        const url = target[1];
        const region = REGION_URL.exec(url);
        const known = region ? regionById(region[1]) : undefined;
        if (HTTP_URL.test(url)) html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        else if (known) html += `<button class="region-mention" data-region="${known.id}" aria-label="Show ${escapeHtml(known.label)}">${label}</button>`;
        else html += label;
        index = close + 1 + target[0].length;
        continue;
      }
    }
    const pair = char === "~" && text[index + 1] === "~" ? "~~" : (char === "*" || char === "_") && text[index + 1] === char ? char + char : null;
    const mark = pair ?? (char === "*" || char === "_" ? char : null);
    const opens = mark && !/\s/.test(text[index + mark.length] ?? " ") && !(char === "_" && /[\p{L}\p{N}]/u.test(text[index - 1] ?? ""));
    if (mark && opens) {
      const close = closingMark(text, mark, index + mark.length + 1);
      if (close > 0) {
        const tag = mark === "~~" ? "s" : mark.length === 2 ? "strong" : "em";
        html += `<${tag}>${renderSpan(text.slice(index + mark.length, close), links)}</${tag}>`;
        index = close + mark.length;
        continue;
      }
    }
    html += escapeHtml(char);
    index++;
  }
  return html;
}

/**
 * Renders a block's inline markdown as HTML. Everything is escaped first; only bold, italic,
 * code, strike, line breaks, http(s) links and region links become tags. Region links render as
 * the guide's `.region-mention` buttons; links with any other scheme keep only their text.
 */
export function renderInline(text: string): string {
  return renderSpan(text, true);
}
