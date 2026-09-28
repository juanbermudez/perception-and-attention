// Markdown ↔ blocks and the safe inline renderer (spec §9, §13, §16).
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const source = `export * from "./src/model/markdown"; export { BLOCK_TYPES } from "./src/store/types";`;
const result = await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { markdownToBlocks, blocksToMarkdown, blockToMarkdown, renderInline, describeView, exportDocument, parseDocument, BLOCK_TYPES } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

const normal = (block) => ({ type: block.type, indent: block.indent ?? 0, text: block.text, ...(block.data ? { data: block.data } : {}) });
const roundTrip = (blocks) => markdownToBlocks(blocksToMarkdown(blocks)).map(normal);

const EVERY_TYPE = [
  { type: "h1", text: "Seeing" },
  { type: "h2", text: "The **relay**" },
  { type: "h3", text: "Where [V1](region:v1) sits" },
  { type: "p", text: "Only *ganglion cells* send `output` to the brain.\nSee [the review](https://example.org/a_(b)?q=1&r=2)." },
  { type: "bullet", indent: 0, text: "Retina" },
  { type: "bullet", indent: 1, text: "Chiasm" },
  { type: "number", indent: 2, text: "LGN" },
  { type: "number", indent: 2, text: "V1" },
  { type: "todo", indent: 1, text: "Read about ~~MT~~ MST", data: { checked: false } },
  { type: "todo", indent: 0, text: "Quiz myself", data: { checked: true } },
  { type: "number", indent: 0, text: "First" },
  { type: "number", indent: 0, text: "Second\ncontinued" },
  { type: "quote", text: "Attention is a spotlight.\nOr is it?" },
  { type: "callout", text: "The TPJ placement is approximate.", data: { tone: "note" } },
  { type: "callout", text: "Try it.", data: { tone: "tip" } },
  { type: "callout", text: "Not a clinical tool.\nSecond line", data: { tone: "warning" } },
  { type: "code", text: "const hop = ['retina', 'lgn'];\nconsole.log(hop);", data: { lang: "ts" } },
  { type: "code", text: "no language" },
  { type: "table", text: "| Area | Role |\n| --- | --- |\n| LGN | relay |\n| V1 | edges |" },
  { type: "divider", text: "" },
  {
    type: "view",
    text: "LGN and V1 from the left, skull dissolved",
    data: { camera: { frame: ["lgn", "v1"], from: "left", zoom: 1.4 }, layers: { skull: 0 }, isolate: { regions: ["lgn", "v1"], keep: 0.08 } },
  },
  {
    type: "question",
    text: "Which area relays vision?",
    data: { kind: "choice", prompt: "Which area relays vision?", choices: ["V1", "LGN", "MT"], answer: [1] },
  },
  {
    type: "question",
    text: "V1 is in the occipital lobe.",
    data: { kind: "truefalse", prompt: "V1 is in the occipital lobe.", answer: true, explain: "It lines the calcarine sulcus." },
  },
  { type: "question", text: "Click the relay.", data: { kind: "region", prompt: "Click the relay.", answer: ["lgn"], choices: ["lgn", "v1", "pulvinar"] } },
  { type: "question", text: "Order the path.", data: { kind: "order", prompt: "Order the path.", items: ["retina", "LGN", "V1"] } },
  { type: "question", text: "What does --> mean <here>?", data: { kind: "recall", prompt: "What does --> mean <here>?", answer: "an arrow" } },
  { type: "p", text: "The end." },
];

test("round trip for every block type, including view and question comments", () => {
  assert.deepEqual(new Set(EVERY_TYPE.map((block) => block.type)), new Set(BLOCK_TYPES), "the fixture covers every block type");
  assert.deepEqual(roundTrip(EVERY_TYPE), EVERY_TYPE.map(normal));
  const markdown = blocksToMarkdown(EVERY_TYPE);
  assert.deepEqual(roundTrip(markdownToBlocks(markdown)), EVERY_TYPE.map(normal), "export is stable");
  assert.equal(blocksToMarkdown(markdownToBlocks(markdown)), markdown);
});

test("export reads cleanly as plain markdown", () => {
  const markdown = blocksToMarkdown(EVERY_TYPE);
  assert.match(
    markdown,
    /^- Retina\n {2}- Chiasm\n {4}1\. LGN\n {4}2\. V1\n {2}- \[ \] Read about ~~MT~~ MST\n- \[x\] Quiz myself\n1\. First\n2\. Second\n {3}continued$/m,
  );
  assert.match(markdown, /^> \[!warning\]\n> Not a clinical tool\.\n> Second line$/m);
  assert.match(markdown, /^```ts\nconst hop/m);
  assert.match(markdown, /^<!-- view \{"camera".*\} -->\n\*\*3D view:\*\* LGN and V1 from the left, skull dissolved$/m);
  assert.match(markdown, /\*\*Question:\*\* Which area relays vision\?\n\n1\. V1\n2\. LGN\n3\. MT\n\n\*Answer:\* 2\. LGN\n<!-- \/question -->/);
  assert.match(markdown, /\*Answer:\* True\n\n\*Why:\* It lines the calcarine sulcus\./);
  assert.match(markdown, /\*Answer:\* retina → LGN → V1/);
  // "-->" inside question JSON cannot close the comment early.
  const comment = markdown.split("\n").find((line) => line.includes('"recall"'));
  assert.equal(comment.indexOf("-->"), comment.length - 3);
  assert(!markdown.includes("\n\n\n"), "no double blank lines");
});

test("text that looks like block syntax survives the round trip", () => {
  const tricky = [
    "# not a heading",
    "- not a list",
    "+ not a list",
    "* not a list",
    "1. not ordered",
    "2) not ordered",
    "> not a quote",
    "---",
    "***",
    "___",
    "===",
    "--",
    "```",
    "~~~ fence",
    "<div>raw html</div>",
    "<!-- view {} -->",
    '<!-- question {"kind":"recall","prompt":"x","answer":"y"} -->',
    "[ref]: https://example.org",
    "| a | b |\n|---|---|",
    "a line\n# then a heading",
    "a line\n---",
    "a line\n===",
    "\\ backslash first",
    "#hashtag is fine",
    "1.5 is a number",
  ];
  for (const text of tricky) {
    const blocks = [
      { type: "p", text },
      { type: "bullet", text },
      { type: "quote", text },
      { type: "callout", text, data: { tone: "note" } },
    ];
    assert.deepEqual(roundTrip(blocks), blocks.map(normal), JSON.stringify(text));
  }
  for (const text of ["x #", "x ##", "#", "C#", "a # b"]) assert.deepEqual(roundTrip([{ type: "h2", text }]), [normal({ type: "h2", text })], text);
  for (const text of ["[ ] not a task", "[x] not done", "[!note] not a callout"]) {
    const blocks = [
      { type: "bullet", text },
      { type: "number", text },
      { type: "quote", text },
    ];
    assert.deepEqual(roundTrip(blocks), blocks.map(normal), text);
  }
  const code = [{ type: "code", text: "```\nnested fence\n````", data: { lang: "md" } }];
  assert.deepEqual(roundTrip(code), code.map(normal));
});

test("list nesting follows the item before it, with mixed markers and long numbers", () => {
  const blocks = [
    ...Array.from({ length: 11 }, (_, index) => ({ type: "number", indent: 0, text: `n${index + 1}` })),
    { type: "bullet", indent: 1, text: "under eleven" },
    { type: "todo", indent: 2, text: "deep", data: { checked: false } },
    { type: "number", indent: 3, text: "deepest" },
    { type: "bullet", indent: 0, text: "new list" },
    { type: "number", indent: 1, text: "restart at one" },
  ];
  const markdown = blocksToMarkdown(blocks);
  assert.match(markdown, /^11\. n11\n {4}- under eleven\n {6}- \[ \] deep\n {8}1\. deepest\n- new list\n {2}1\. restart at one$/m);
  assert.deepEqual(roundTrip(blocks), blocks.map(normal));
  // An indent with no parent item cannot nest in markdown; it exports one level deeper at most.
  assert.deepEqual(
    roundTrip([
      { type: "p", text: "para" },
      { type: "bullet", indent: 2, text: "orphan" },
    ]).map((block) => block.indent),
    [0, 0],
  );
});

test("importing markdown from elsewhere", () => {
  const blocks = markdownToBlocks(
    [
      "Setext title",
      "============",
      "",
      "#### Deep heading",
      "",
      "* star bullet",
      "    * four-space nested",
      "",
      "1) paren list",
      "",
      "> [!NOTE] Same-line callout",
      "> continues",
      "",
      "> [!IMPORTANT]",
      "> unknown tone stays a quote",
      "",
      "    indented code",
      "",
      "- loose item",
      "",
      "- second loose item",
      "",
      "Line one  ",
      "line two",
      "",
      "[link]: https://example.org",
      "<!-- a stray comment -->",
      "<!-- view {not json} -->",
    ].join("\r\n"),
  );
  assert.deepEqual(blocks.map(normal), [
    { type: "h1", indent: 0, text: "Setext title" },
    { type: "h3", indent: 0, text: "Deep heading" },
    { type: "bullet", indent: 0, text: "star bullet" },
    { type: "bullet", indent: 1, text: "four-space nested" },
    { type: "number", indent: 0, text: "paren list" },
    { type: "callout", indent: 0, text: "Same-line callout\ncontinues", data: { tone: "note" } },
    { type: "quote", indent: 0, text: "[!IMPORTANT]\nunknown tone stays a quote" },
    { type: "code", indent: 0, text: "indented code" },
    { type: "bullet", indent: 0, text: "loose item" },
    { type: "bullet", indent: 0, text: "second loose item" },
    { type: "p", indent: 0, text: "Line one  \nline two" },
    { type: "p", indent: 0, text: "<!-- a stray comment -->" },
    { type: "p", indent: 0, text: "<!-- view {not json} -->" },
  ]);
  assert.deepEqual(markdownToBlocks(""), []);
  assert.deepEqual(markdownToBlocks("\n\n  \n"), []);
  const view = markdownToBlocks('<!-- view {"camera":{"focus":"pulvinar"}} -->\n\nFollowing paragraph');
  assert.deepEqual(view.map(normal), [
    { type: "view", indent: 0, text: "Pulvinar", data: { camera: { focus: "pulvinar" } } },
    { type: "p", indent: 0, text: "Following paragraph" },
  ]);
  const unclosed = markdownToBlocks('<!-- question {"kind":"recall","prompt":"P","answer":"A"} -->\n\nKept paragraph');
  assert.deepEqual(
    unclosed.map((block) => block.type),
    ["question", "p"],
    "without a closing marker nothing after the question is skipped",
  );
});

test("single blocks: markdown for read(full) and update", () => {
  assert.equal(blockToMarkdown({ type: "bullet", indent: 2, text: "nested" }), "- nested");
  assert.equal(blockToMarkdown({ type: "number", indent: 0, text: "x" }), "1. x");
  assert.equal(blockToMarkdown({ type: "todo", text: "t", data: { checked: true } }), "- [x] t");
  assert.equal(blockToMarkdown({ type: "p", text: "# literal" }), "\\# literal");
  assert.deepEqual(markdownToBlocks(blockToMarkdown({ type: "p", text: "# literal" })).map(normal), [{ type: "p", indent: 0, text: "# literal" }]);
});

test("exported files carry a header and the title, and import back", () => {
  const date = new Date("2026-09-27T12:00:00Z");
  const file = exportDocument("doc:k3f9", "Vision # notes #", EVERY_TYPE, date);
  assert(file.startsWith("<!-- perception-attention doc:k3f9 exported 2026-09-27 -->\n\n# Vision # notes \\#\n\n"));
  const parsed = parseDocument(file);
  assert.equal(parsed.title, "Vision # notes #");
  assert.deepEqual(parsed.blocks.map(normal), EVERY_TYPE.map(normal));
  assert.equal(parseDocument("# Just a heading").title, undefined, "only our own exports carry a title");
});

test("view descriptions", () => {
  assert.equal(describeView({ camera: { focus: "lgn" } }), "LGN");
  assert.equal(
    describeView({ camera: { frame: ["lgn", "v1", "mt"], from: "left" }, layers: { skull: 0, cortex: 0.5 } }),
    "LGN, V1 and MT from the left, skull dissolved",
  );
  assert.equal(describeView({ isolate: ["lgn", "v1"], layers: { skull: 0, temporal_bone: 0 }, effect: "fade" }), "LGN and V1, skull and temporal bone faded");
  assert.equal(describeView({ camera: { focus: "v1", zoom: 2 }, isolate: { regions: ["v1", "lgn"] } }), "V1 at 2×, only V1 and LGN shown");
  assert.equal(describeView({ camera: { from: "top" } }), "The brain from the top");
  assert.equal(describeView({}), "Saved 3D view");
});

test("inline rendering: the allow-listed syntax", () => {
  const cases = [
    ["**bold** and __bold__", "<strong>bold</strong> and <strong>bold</strong>"],
    ["*em* and _em_", "<em>em</em> and <em>em</em>"],
    ["***both***", "<strong><em>both</em></strong>"],
    ["*a **b***", "<em>a <strong>b</strong></em>"],
    ["`a < b` and ``tick ` inside``", "<code>a &lt; b</code> and <code>tick ` inside</code>"],
    ["~~gone~~", "<s>gone</s>"],
    ["snake_case_name and 2*3*4", "snake_case_name and 2<em>3</em>4"],
    ["* not em *", "* not em *"],
    ["\\*literal\\* and \\[not a link](https://x.org)", "*literal* and [not a link](https://x.org)"],
    ["line\nbreak", "line<br>break"],
    ["[site](https://example.org/a?b=1&c=2)", '<a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">site</a>'],
    [
      "[wiki](https://en.wikipedia.org/wiki/Pulvinar_(thalamus))",
      '<a href="https://en.wikipedia.org/wiki/Pulvinar_(thalamus)" target="_blank" rel="noopener noreferrer">wiki</a>',
    ],
    ["[**bold** link](http://x.org)", '<a href="http://x.org" target="_blank" rel="noopener noreferrer"><strong>bold</strong> link</a>'],
    ["[the relay](region:lgn)", '<button class="region-mention" data-region="lgn" aria-label="Show Lateral geniculate nucleus (LGN)">the relay</button>'],
    [
      "[dorsal horn](region:DORSALHORN)",
      '<button class="region-mention" data-region="dorsalHorn" aria-label="Show Dorsal horn of the spinal cord">dorsal horn</button>',
    ],
    ["[nowhere](region:atlantis)", "nowhere"],
    ["[step](step:vision/1)", "step"],
    ["**unclosed", "**unclosed"],
    ["`unclosed", "`unclosed"],
    ["[unclosed](https://x.org", "[unclosed](https://x.org"],
  ];
  for (const [input, html] of cases) assert.equal(renderInline(input), html, input);
});

// Everything the renderer emits must be escaped text or one of these tags.
const ALLOWED_TAG =
  /^<(\/?(strong|em|code|s|a|button)|br|a href="https?:\/\/[^"<>\s]+" target="_blank" rel="noopener noreferrer"|button class="region-mention" data-region="[A-Za-z0-9]+" aria-label="[^"<>]*")>$/;
function assertSafe(html, input) {
  for (const tag of html.match(/<[^>]*>/g) ?? []) assert.match(tag, ALLOWED_TAG, `unsafe tag from ${JSON.stringify(input)}: ${tag}`);
  assert(!/[<>"]/.test(html.replace(/<[^>]*>/g, "")), `unescaped text from ${JSON.stringify(input)}`);
  for (const [, url] of html.matchAll(/href="([^"]*)"/g)) assert.match(url, /^https?:\/\//i, `unsafe href from ${JSON.stringify(input)}`);
}

const HOSTILE = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  '<a href="javascript:alert(1)">x</a>',
  "[x](javascript:alert(1))",
  "[x](JaVaScRiPt:alert(1))",
  "[x](javascript&#58;alert(1))",
  "[x](\\javascript:alert(1))",
  "[x]( javascript:alert(1))",
  "[x](data:text/html;base64,PHNjcmlwdD4=)",
  "[x](vbscript:msgbox(1))",
  "[x](//evil.example/path)",
  "[x](/relative)",
  '[x](https://ok.org" onmouseover="alert(1))',
  "[x](https://ok.org'onmouseover='alert(1))",
  '[x](region:v1" onclick="alert(1))',
  "[x](region:v1><img src=x onerror=alert(1)>)",
  "[<img src=x onerror=alert(1)>](https://ok.org)",
  "[[x](https://ok.org)](javascript:alert(1))",
  "**<b>bold html</b>**",
  "`<script>`",
  "&lt;script&gt; stays escaped",
  "<!-- comment --> and <![CDATA[x]]>",
  '<svg onload="alert(1)">',
  "\u0000\u202e control characters",
];

test("hostile inline markdown renders as inert text", () => {
  for (const input of HOSTILE) assertSafe(renderInline(input), input);
  assert.equal(renderInline("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(renderInline("[x](javascript:alert(1))"), "x");
  assert.equal(renderInline("&lt;"), "&amp;lt;");
});

test("hostile block markdown becomes plain text blocks", () => {
  const markdown = [
    "<script>alert(1)</script>",
    "",
    '<iframe src="https://evil.example"></iframe>',
    "",
    '<!-- view {"camera":{"focus":"v1"}} --><script>alert(1)</script>',
    "",
    '<!-- question {"kind":"recall","prompt":"<img src=x onerror=alert(1)>","answer":"x"} -->',
    "<!-- /question -->",
    "",
    "[click](javascript:alert(1))",
  ].join("\n");
  const blocks = markdownToBlocks(markdown);
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["p", "p", "p", "question", "p"],
  );
  assert.equal(blocks[0].text, "<script>alert(1)</script>");
  for (const block of blocks) assertSafe(renderInline(block.text), block.text);
  // Stored text round-trips as text: it never turns into markup on the next import.
  assert.deepEqual(roundTrip(blocks), blocks.map(normal));
});
