// Inline markdown (spec §9.1): one parser for the safe HTML renderer and for the doc editor.
//
// `parseInline` turns a block's text into a small tree (text, line breaks, code, links, region
// links, bold, italic, strike). `renderInline` prints that tree as escaped, allow-listed HTML.
// `inlineRuns` flattens it into runs with marks for the editor, and `runsToMarkdown` writes runs
// back as text that parses to the same runs. Pure: tested in Node.

import { regions } from "../content/regions";
import type { RegionId } from "../content/types";

export type InlineNode =
  | { t: "text"; text: string }
  | { t: "br" }
  | { t: "code"; text: string }
  | { t: "link"; href: string; children: InlineNode[] }
  | { t: "region"; id: RegionId; label: string; children: InlineNode[] }
  | { t: "strong" | "em" | "s"; children: InlineNode[] };

// ── Parsing ───────────────────────────────────────────────────────────────────────────────────

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const HTTP_URL = /^https?:\/\/[^\s<>"'`\\]+$/i;
const REGION_URL = /^region:([A-Za-z0-9]+)$/i;

const regionIds = new Map(Object.keys(regions).map((id) => [id.toLowerCase(), id as RegionId]));
export function regionById(id: string) {
  const known = regionIds.get(id.toLowerCase());
  return known ? regions[known] : undefined;
}

/**
 * The one link rule for docs (the renderer, the editor's paste and ⌘K): an http(s) URL as given, or a
 * link to a region the guide knows, as `region:<id>` with the id's own case. Anything else is null.
 */
export function safeHref(href: string): string | null {
  if (HTTP_URL.test(href)) return href;
  const region = REGION_URL.exec(href);
  const known = region ? regionById(region[1]) : undefined;
  return known ? `region:${known.id}` : null;
}

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

function pushText(out: InlineNode[], text: string) {
  const last = out.at(-1);
  if (last?.t === "text") last.text += text;
  else out.push({ t: "text", text });
}

function parseSpan(text: string, links: boolean): InlineNode[] {
  const out: InlineNode[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "\\" && PUNCTUATION.test(text[index + 1] ?? "")) {
      pushText(out, text[index + 1]);
      index += 2;
      continue;
    }
    if (char === "\n") {
      out.push({ t: "br" });
      index++;
      continue;
    }
    if (char === "`") {
      const run = /^`+/.exec(text.slice(index))![0];
      const end = closingRun(text, run.length, index + run.length);
      if (end > 0) {
        let code = text.slice(index + run.length, end).replace(/\n/g, " ");
        if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1);
        out.push({ t: "code", text: code });
        index = end + run.length;
        continue;
      }
      pushText(out, run);
      index += run.length;
      continue;
    }
    if (char === "[" && links) {
      const close = closingBracket(text, index);
      // One level of parentheses is allowed inside the URL, as in Wikipedia links.
      const target = close > 0 && text[close + 1] === "(" ? /^\(((?:[^()\s]|\([^()\s]*\))*)\)/.exec(text.slice(close + 1)) : null;
      if (target) {
        const label = parseSpan(text.slice(index + 1, close), false);
        const href = safeHref(target[1]);
        const known = href?.startsWith("region:") ? regionById(href.slice("region:".length)) : undefined;
        if (known) out.push({ t: "region", id: known.id, label: known.label, children: label });
        else if (href) out.push({ t: "link", href, children: label });
        else for (const node of label) node.t === "text" ? pushText(out, node.text) : out.push(node);
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
        out.push({ t: mark === "~~" ? "s" : mark.length === 2 ? "strong" : "em", children: parseSpan(text.slice(index + mark.length, close), links) });
        index = close + mark.length;
        continue;
      }
    }
    pushText(out, char);
    index++;
  }
  return out;
}

/** A block's inline markdown as a tree. Never throws; anything unknown stays text. */
export function parseInline(text: string): InlineNode[] {
  return parseSpan(text, true);
}

// ── HTML ──────────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ENTITIES[char]);

function toHtml(nodes: InlineNode[]): string {
  let html = "";
  for (const node of nodes) {
    switch (node.t) {
      case "text":
        html += escapeHtml(node.text);
        break;
      case "br":
        html += "<br>";
        break;
      case "code":
        html += `<code>${escapeHtml(node.text)}</code>`;
        break;
      case "link":
        html += `<a href="${escapeHtml(node.href)}" target="_blank" rel="noopener noreferrer">${toHtml(node.children)}</a>`;
        break;
      case "region":
        html += `<button class="region-mention" data-region="${node.id}" aria-label="Show ${escapeHtml(node.label)}">${toHtml(node.children)}</button>`;
        break;
      default:
        html += `<${node.t}>${toHtml(node.children)}</${node.t}>`;
    }
  }
  return html;
}

/**
 * Renders a block's inline markdown as HTML. Everything is escaped first; only bold, italic,
 * code, strike, line breaks, http(s) links and region links become tags. Region links render as
 * the guide's `.region-mention` buttons; links with any other scheme keep only their text.
 */
export function renderInline(text: string): string {
  return toHtml(parseInline(text));
}

/** The visible words of inline markdown, for titles, snippets and search. */
export function inlinePlainText(text: string): string {
  const walk = (nodes: InlineNode[]): string =>
    nodes.map((node) => (node.t === "text" || node.t === "code" ? node.text : node.t === "br" ? "\n" : walk(node.children))).join("");
  return walk(parseInline(text));
}

// ── Runs: the editor's view of inline text ────────────────────────────────────────────────────

export type RunMark = { type: "strong" | "em" | "strike" | "code" } | { type: "link"; href: string };
/** A stretch of text with the same marks, or a line break (`br`). */
export interface InlineRun {
  text: string;
  marks: RunMark[];
  br?: true;
}

/** Outermost first. Code is always innermost because its content is not parsed. */
const MARK_ORDER: RunMark["type"][] = ["link", "strong", "em", "strike", "code"];
const markRank = (mark: RunMark) => MARK_ORDER.indexOf(mark.type);
const sameMark = (a: RunMark, b: RunMark) => a.type === b.type && (a.type !== "link" || a.href === (b as { href: string }).href);
const sameMarks = (a: RunMark[], b: RunMark[]) => a.length === b.length && a.every((mark, index) => sameMark(mark, b[index]));
const sortMarks = (marks: RunMark[]) => [...marks].sort((a, b) => markRank(a) - markRank(b));

/** Flattens inline markdown into runs. Region links become link marks with a `region:` href. */
export function inlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const push = (run: InlineRun) => {
    const last = runs.at(-1);
    if (last && !last.br && !run.br && sameMarks(last.marks, run.marks)) last.text += run.text;
    else runs.push(run);
  };
  const walk = (nodes: InlineNode[], marks: RunMark[]) => {
    for (const node of nodes) {
      switch (node.t) {
        case "text":
          if (node.text) push({ text: node.text, marks });
          break;
        case "br":
          push({ text: "\n", marks: [], br: true });
          break;
        case "code":
          if (node.text) push({ text: node.text, marks: sortMarks([...marks, { type: "code" }]) });
          break;
        case "link":
          walk(node.children, sortMarks([...marks, { type: "link", href: node.href }]));
          break;
        case "region":
          walk(node.children, sortMarks([...marks, { type: "link", href: `region:${node.id}` }]));
          break;
        default: {
          const type = node.t === "s" ? "strike" : node.t;
          walk(node.children, marks.some((mark) => mark.type === type) ? marks : sortMarks([...marks, { type }]));
        }
      }
    }
  };
  walk(parseInline(text), []);
  return runs;
}

const EMPHASIS = new Set(["strong", "em", "strike"]);

/**
 * Canonical runs: marks sorted, adjacent runs with the same marks merged, empty runs dropped, and
 * whitespace at the edges of bold, italic and strike moved outside them (markdown cannot open or
 * close emphasis next to a space).
 */
export function normalizeRuns(input: readonly InlineRun[]): InlineRun[] {
  const split: InlineRun[] = [];
  for (const run of input) {
    if (run.br) {
      split.push({ text: "\n", marks: [], br: true });
      continue;
    }
    if (!run.text) continue;
    const marks = sortMarks(run.marks);
    if (!marks.some((mark) => EMPHASIS.has(mark.type)) || marks.some((mark) => mark.type === "code")) {
      split.push({ text: run.text, marks });
      continue;
    }
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text)!;
    const plain = marks.filter((mark) => !EMPHASIS.has(mark.type));
    if (lead) split.push({ text: lead, marks: plain });
    if (core) split.push({ text: core, marks });
    if (trail) split.push({ text: trail, marks: plain });
  }
  const out: InlineRun[] = [];
  for (const run of split) {
    const last = out.at(-1);
    if (last && !last.br && !run.br && sameMarks(last.marks, run.marks)) last.text += run.text;
    else out.push({ ...run, marks: [...run.marks] });
  }
  return out;
}

// ── Runs → markdown ───────────────────────────────────────────────────────────────────────────

const ALNUM = /[\p{L}\p{N}]/u;

/** Backslash-escapes the characters the inline parser would read as syntax. */
function escapeInline(text: string, before: string, after: string): string {
  let out = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const prev = index > 0 ? text[index - 1] : before;
    const next = index < text.length - 1 ? text[index + 1] : after;
    if (char === "\\" || char === "*" || char === "`" || char === "[" || char === "]") out += `\\${char}`;
    else if (char === "_" && !(ALNUM.test(prev) && ALNUM.test(next))) out += "\\_";
    else if (char === "~" && (prev === "~" || next === "~")) out += "\\~";
    else out += char;
  }
  return out;
}

/** A link target the parser reads back: it takes one level of balanced parentheses, so others are percent-encoded. */
function linkTarget(href: string): string {
  return /^(?:[^()\s]|\([^()\s]*\))*$/.test(href) ? href : href.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") || /^ .*[^ ].* $/.test(text) ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

interface Delimiters {
  strong: string;
  em: string;
}

function write(runs: InlineRun[], delimiters: Delimiters): string {
  const open: RunMark[] = [];
  const parts: string[] = [];
  const opener = (mark: RunMark) => (mark.type === "link" ? "[" : mark.type === "strong" ? delimiters.strong : mark.type === "em" ? delimiters.em : "~~");
  const closer = (mark: RunMark) => (mark.type === "link" ? `](${linkTarget(mark.href)})` : opener(mark));
  runs.forEach((run, index) => {
    const wanted = run.br ? [] : run.marks.filter((mark) => mark.type !== "code");
    let keep = 0;
    while (keep < open.length && keep < wanted.length && sameMark(open[keep], wanted[keep])) keep++;
    while (open.length > keep) parts.push(closer(open.pop()!));
    for (const mark of wanted.slice(keep)) {
      parts.push(opener(mark));
      open.push(mark);
    }
    if (run.br) parts.push("\n");
    else if (run.marks.some((mark) => mark.type === "code")) parts.push(codeSpan(run.text));
    else {
      const before = parts.join("").slice(-1);
      const nextRun = runs[index + 1];
      parts.push(escapeInline(run.text, before, nextRun && !nextRun.br && !nextRun.marks.length ? nextRun.text[0] : ""));
    }
  });
  while (open.length) parts.push(closer(open.pop()!));
  return parts.join("");
}

const DELIMITERS: Delimiters[] = [
  { strong: "**", em: "*" },
  { strong: "**", em: "_" },
  { strong: "__", em: "*" },
  { strong: "__", em: "_" },
];

const sameRuns = (a: InlineRun[], b: InlineRun[]) =>
  a.length === b.length &&
  a.every((run, index) => run.text === b[index].text && Boolean(run.br) === Boolean(b[index].br) && sameMarks(run.marks, b[index].marks));

/**
 * Writes runs as inline markdown that `inlineRuns` reads back to the same runs. Where `**` and
 * `*` would touch and read differently ("**a***b*"), the underscore forms are tried instead.
 */
export function runsToMarkdown(input: readonly InlineRun[]): string {
  const runs = normalizeRuns(input);
  let first = "";
  for (const delimiters of DELIMITERS) {
    const text = write(runs, delimiters);
    if (sameRuns(normalizeRuns(inlineRuns(text)), runs)) return text;
    first ||= text;
  }
  return first;
}
