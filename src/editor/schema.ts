// The doc editor's flat schema (spec D4, §9.1, §9.3): one top-level node per stored block, lists as
// flat items with an `indent`, every block carrying its store id. Headless: the node views and
// key bindings live in `ui/doc-editor.ts`, so this module builds a schema in Node for the tests.

import { getSchema, type JSONContent, Mark, Node } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import type { BlockType } from "../store/types";

/** Node name for each block type. Tiptap's own commands expect the paragraph to be called "paragraph". */
export const NODE_NAMES: Record<BlockType, string> = {
  p: "paragraph",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  bullet: "bullet",
  number: "number",
  todo: "todo",
  quote: "quote",
  callout: "callout",
  code: "codeBlock",
  table: "table",
  divider: "divider",
  view: "view",
  question: "question",
};
export const BLOCK_OF_NODE: Record<string, BlockType> = Object.fromEntries(Object.entries(NODE_NAMES).map(([block, node]) => [node, block as BlockType]));

/** Every block has an id; a split or a paste gets a fresh one (see the ids plugin in the editor). */
const idAttribute = {
  id: {
    default: null,
    keepOnSplit: false,
    parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
    renderHTML: (attributes: Record<string, unknown>) => (attributes.id ? { "data-id": attributes.id } : {}),
  },
};

const blockClass = (type: BlockType) => ({ class: `blk blk-${type}`, "data-type": type });

function textBlock(type: BlockType, tag: string, options: { content?: string; attributes?: Record<string, object>; parse?: string[] } = {}) {
  return Node.create({
    name: NODE_NAMES[type],
    group: "block",
    content: options.content ?? "inline*",
    defining: type !== "p",
    addAttributes: () => ({ ...idAttribute, ...options.attributes }),
    parseHTML: () => (options.parse ?? [tag]).map((selector) => ({ tag: selector })),
    renderHTML: ({ HTMLAttributes }) => [tag, { ...HTMLAttributes, ...blockClass(type) }, 0],
  });
}

const indentAttribute = {
  indent: {
    default: 0,
    parseHTML: (element: HTMLElement) => Math.min(3, Math.max(0, Number(element.getAttribute("data-indent")) || 0)),
    renderHTML: (attributes: Record<string, unknown>) => ({ "data-indent": String(attributes.indent ?? 0) }),
  },
};

const jsonAttribute = (name: string) => ({
  default: null,
  parseHTML: (element: HTMLElement) => {
    try {
      const value = JSON.parse(element.getAttribute(`data-${name}`) ?? "null");
      return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  },
  renderHTML: (attributes: Record<string, unknown>) => (attributes[name] ? { [`data-${name}`]: JSON.stringify(attributes[name]) } : {}),
});

const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });
const Text = Node.create({ name: "text", group: "inline" });
const HardBreak = Node.create({
  name: "hardBreak",
  group: "inline",
  inline: true,
  selectable: false,
  parseHTML: () => [{ tag: "br" }],
  renderHTML: () => ["br"],
  renderText: () => "\n",
});

const Paragraph = textBlock("p", "p", { parse: ["p", "div.blk-p"] });
const Heading1 = textBlock("h1", "h1", { content: "text*" });
const Heading2 = textBlock("h2", "h2", { content: "text*" });
const Heading3 = textBlock("h3", "h3", { content: "text*", parse: ["h3", "h4", "h5", "h6"] });
const Bullet = textBlock("bullet", "div", { attributes: indentAttribute, parse: ["div.blk-bullet", "ul > li"] });
const NumberItem = textBlock("number", "div", { attributes: indentAttribute, parse: ["div.blk-number", "ol > li"] });
const Todo = textBlock("todo", "div", {
  parse: ["div.blk-todo"],
  attributes: {
    ...indentAttribute,
    checked: {
      default: false,
      keepOnSplit: false,
      parseHTML: (element: HTMLElement) => element.getAttribute("data-checked") === "true",
      renderHTML: (attributes: Record<string, unknown>) => ({ "data-checked": String(attributes.checked === true) }),
    },
  },
});
const Quote = textBlock("quote", "blockquote", { parse: ["blockquote"] });
const Callout = textBlock("callout", "aside", {
  parse: ["aside"],
  attributes: {
    tone: {
      default: "note",
      parseHTML: (element: HTMLElement) => {
        const tone = element.getAttribute("data-tone");
        return tone === "tip" || tone === "warning" ? tone : "note";
      },
      renderHTML: (attributes: Record<string, unknown>) => ({ "data-tone": String(attributes.tone ?? "note") }),
    },
  },
});

function sourceBlock(type: "code" | "table", parse: string) {
  return Node.create({
    name: NODE_NAMES[type],
    group: "block",
    content: "text*",
    marks: "",
    code: true,
    defining: true,
    addAttributes: () => ({
      ...idAttribute,
      ...(type === "code"
        ? {
            lang: {
              default: "",
              parseHTML: (element: HTMLElement) => (element.getAttribute("data-lang") ?? "").replace(/[^\w+#.-]/g, "").slice(0, 32),
              renderHTML: (attributes: Record<string, unknown>) => (attributes.lang ? { "data-lang": attributes.lang } : {}),
            },
          }
        : {}),
    }),
    parseHTML: () => [{ tag: parse, preserveWhitespace: "full" }],
    renderHTML: ({ HTMLAttributes }) => ["pre", { ...HTMLAttributes, ...blockClass(type) }, ["code", 0]],
  });
}
const Code = sourceBlock("code", "pre:not(.blk-table)");
const Table = sourceBlock("table", "pre.blk-table");

const Divider = Node.create({
  name: NODE_NAMES.divider,
  group: "block",
  atom: true,
  addAttributes: () => ({ ...idAttribute }),
  parseHTML: () => [{ tag: "hr" }],
  renderHTML: ({ HTMLAttributes }) => ["div", { ...HTMLAttributes, ...blockClass("divider") }, ["hr"]],
});

/** View and question blocks are atoms: their JSON lives in `data`, the caption or prompt in `text`. */
function dataBlock(type: "view" | "question") {
  return Node.create({
    name: NODE_NAMES[type],
    group: "block",
    atom: true,
    selectable: true,
    addAttributes: () => ({
      ...idAttribute,
      data: jsonAttribute("block"),
      text: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-text") ?? "",
        renderHTML: (attributes: Record<string, unknown>) => ({ "data-text": String(attributes.text ?? "") }),
      },
    }),
    parseHTML: () => [{ tag: `div.blk-${type}` }],
    renderHTML: ({ HTMLAttributes, node }) => ["div", { ...HTMLAttributes, ...blockClass(type) }, String(node.attrs.text ?? "")],
  });
}
const View = dataBlock("view");
const Question = dataBlock("question");

// Marks: bold, italic, strike, code and links (http(s) and region:).
const Strong = Mark.create({
  name: "strong",
  parseHTML: () => [{ tag: "strong" }, { tag: "b", getAttrs: (node) => (node as HTMLElement).style.fontWeight !== "normal" && null }],
  renderHTML: () => ["strong", 0],
});
const Em = Mark.create({ name: "em", parseHTML: () => [{ tag: "em" }, { tag: "i" }], renderHTML: () => ["em", 0] });
const Strike = Mark.create({ name: "strike", parseHTML: () => [{ tag: "s" }, { tag: "del" }, { tag: "strike" }], renderHTML: () => ["s", 0] });
const CodeMark = Mark.create({ name: "code", code: true, parseHTML: () => [{ tag: "code" }], renderHTML: () => ["code", 0] });

export const SAFE_HREF = /^(https?:\/\/[^\s<>"'`\\]+|region:[A-Za-z0-9]+)$/i;
const Link = Mark.create({
  name: "link",
  inclusive: false,
  addAttributes: () => ({ href: { default: null } }),
  parseHTML: () => [
    {
      tag: "a[href]",
      getAttrs: (node) => {
        const href = (node as HTMLElement).getAttribute("href") ?? "";
        return SAFE_HREF.test(href) ? { href } : false;
      },
    },
    {
      tag: "[data-region]",
      getAttrs: (node) => {
        const id = (node as HTMLElement).getAttribute("data-region") ?? "";
        return /^[A-Za-z0-9]+$/.test(id) ? { href: `region:${id}` } : false;
      },
    },
  ],
  renderHTML: ({ HTMLAttributes }) => {
    const href = String(HTMLAttributes.href ?? "");
    // Region links look and behave like the guide's region mentions (hover previews, click opens the region).
    if (href.startsWith("region:")) return ["span", { class: "region-mention", "data-region": href.slice("region:".length) }, 0];
    return ["a", { href, target: "_blank", rel: "noopener noreferrer" }, 0];
  },
});

/** Every node and mark of the flat schema, without node views or key bindings. */
export const schemaExtensions = [
  Doc,
  Text,
  HardBreak,
  Paragraph,
  Heading1,
  Heading2,
  Heading3,
  Bullet,
  NumberItem,
  Todo,
  Quote,
  Callout,
  Code,
  Table,
  Divider,
  View,
  Question,
  Strong,
  Em,
  Strike,
  CodeMark,
  Link,
];

/** A schema for headless use (tests, conversions outside an editor). */
export function createDocSchema(): Schema {
  return getSchema(schemaExtensions);
}

export type { JSONContent };
