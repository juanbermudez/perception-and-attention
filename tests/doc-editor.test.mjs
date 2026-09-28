// The doc editor without a browser (spec §16, plan Stage 4): inline markdown ↔ marks, stored blocks ↔
// ProseMirror nodes, and ProseMirror doc changes → block diffs, checked against the real store engine.
import assert from "node:assert/strict";
import { test } from "node:test";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { build } from "esbuild";

const source = `
export * from "./src/model/inline";
export * from "./src/editor/convert";
export * from "./src/editor/sync";
export { createDocSchema } from "./src/editor/schema";
export { markdownToBlocks, blocksToMarkdown, parseDocument, exportDocument } from "./src/model/markdown";
export { openEngine } from "./src/store/engine";
export { Transform } from "@tiptap/pm/transform";
export { EditorState, TextSelection } from "@tiptap/pm/state";`;
const result = await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const { inlineRuns, runsToMarkdown, normalizeRuns, renderInline, createDocSchema, blocksToDoc, docBlocks, nodeToBlock, blockToNode } = m;
const { planSave, planReconcile, applyTarget, baseFrom, savedBase, changedIds, stayingIds, contentKey, newBlockId, markdownToBlocks, Transform } = m;
const schema = createDocSchema();
const sqlite3 = await sqlite3InitModule();

/* ---------- Inline markdown ↔ runs ---------- */

const strong = { type: "strong" };
const em = { type: "em" };
const strike = { type: "strike" };
const code = { type: "code" };
const link = (href) => ({ type: "link", href });

test("inline markdown reads as runs with marks, region links as link marks", () => {
  assert.deepEqual(inlineRuns("a **b** *c* ~~d~~ `e`"), [
    { text: "a ", marks: [] },
    { text: "b", marks: [strong] },
    { text: " ", marks: [] },
    { text: "c", marks: [em] },
    { text: " ", marks: [] },
    { text: "d", marks: [strike] },
    { text: " ", marks: [] },
    { text: "e", marks: [code] },
  ]);
  assert.deepEqual(inlineRuns("see [the relay](region:LGN) and [x](https://x.org)"), [
    { text: "see ", marks: [] },
    { text: "the relay", marks: [link("region:lgn")] },
    { text: " and ", marks: [] },
    { text: "x", marks: [link("https://x.org")] },
  ]);
  assert.deepEqual(inlineRuns("one\ntwo"), [
    { text: "one", marks: [] },
    { text: "\n", marks: [], br: true },
    { text: "two", marks: [] },
  ]);
  assert.deepEqual(inlineRuns("[x](javascript:alert(1))"), [{ text: "x", marks: [] }], "Unsafe links keep only their text.");
});

const RUN_CASES = [
  [{ text: "plain text", marks: [] }],
  [{ text: "2 * 3 = 6, a_b, _under_, `tick`, [1], back\\slash, ~~no~~", marks: [] }],
  [
    { text: "a", marks: [strong] },
    { text: "b", marks: [em] },
  ],
  [
    { text: "a", marks: [em] },
    { text: "b", marks: [strong] },
    { text: "c", marks: [] },
  ],
  [
    { text: "a", marks: [strong] },
    { text: "b", marks: [strong, em] },
    { text: "c", marks: [strong] },
  ],
  [{ text: "all", marks: [strong, em, strike] }],
  [
    { text: "word", marks: [] },
    { text: "mid", marks: [strong] },
    { text: "word", marks: [] },
  ],
  [
    { text: "the ", marks: [] },
    { text: "LGN", marks: [link("region:lgn"), strong] },
    { text: " relays", marks: [link("region:lgn")] },
  ],
  [{ text: "x`y``z", marks: [code] }],
  [{ text: "`edge`", marks: [code] }],
  [
    { text: "bold", marks: [strong] },
    { text: "\n", marks: [], br: true },
    { text: "next", marks: [] },
  ],
  [{ text: "wiki", marks: [link("https://en.wikipedia.org/wiki/Pulvinar_(thalamus)")] }],
  [
    { text: "a", marks: [strike] },
    { text: "b", marks: [em] },
  ],
];

test("runs write back to markdown that reads as the same runs", () => {
  for (const runs of RUN_CASES) {
    const text = runsToMarkdown(runs);
    assert.deepEqual(normalizeRuns(inlineRuns(text)), normalizeRuns(runs), `${JSON.stringify(runs)} → ${text}`);
  }
});

test("whitespace moves outside emphasis, and plain text stays unescaped where it is safe", () => {
  assert.equal(runsToMarkdown([{ text: " bold ", marks: [strong] }]), " **bold** ");
  assert.equal(runsToMarkdown([{ text: "snake_case and 5 ~ 6", marks: [] }]), "snake_case and 5 ~ 6");
  assert.equal(runsToMarkdown(inlineRuns("The **LGN** relays [V1](region:v1).")), "The **LGN** relays [V1](region:v1).");
});

test("rendering escapes everything and keeps the region-mention buttons", () => {
  assert.equal(
    renderInline("[V1](region:v1) <b>"),
    '<button class="region-mention" data-region="v1" aria-label="Show Primary visual cortex (V1)">V1</button> &lt;b&gt;',
  );
});

/* ---------- Blocks ↔ nodes ---------- */

const EVERY_TYPE = `# Heading one

## Heading **two**

### Three

A paragraph with **bold**, *italic*, \`code\`, ~~strike~~, [a link](https://example.org) and [the LGN](region:lgn).
A second line.

- bullet
  - nested bullet
1. first
2. second
- [ ] open task
- [x] done task

> a quote

> [!tip]
> a tip

\`\`\`ts
const x = 1;

console.log(x);
\`\`\`

| a | b |
| - | - |
| 1 | 2 |

---

<!-- view {"camera":{"frame":["lgn","v1"],"from":"left"},"layers":{"skull":0}} -->
**3D view:** LGN and V1 from the left, skull dissolved

<!-- question {"kind":"truefalse","prompt":"The LGN is in the thalamus.","answer":true} -->
**Question:** The LGN is in the thalamus.
<!-- /question -->
`;

let counter = 0;
const ids = () => `b${String(counter++).padStart(4, "0")}`;
const withIds = (blocks) => blocks.map((block) => ({ id: ids(), indent: 0, ...block }));
const normal = (block) => JSON.parse(contentKey(block));

test("every block type survives blocks → doc → blocks", () => {
  const blocks = withIds(markdownToBlocks(EVERY_TYPE));
  assert.deepEqual(
    [...new Set(blocks.map((block) => block.type))],
    ["h1", "h2", "h3", "p", "bullet", "number", "todo", "quote", "callout", "code", "table", "divider", "view", "question"],
  );
  const doc = blocksToDoc(schema, blocks);
  assert.equal(doc.childCount, blocks.length);
  const back = docBlocks(doc);
  assert.deepEqual(
    back.map((block) => block.id),
    blocks.map((block) => block.id),
  );
  assert.deepEqual(back.map(normal), blocks.map(normal));
  const paragraph = doc.child(blocks.findIndex((block) => block.type === "p"));
  assert(
    paragraph.content.content.some((node) => node.type.name === "hardBreak"),
    "A soft line break is a hard break node.",
  );
  const region = [];
  paragraph.descendants((node) => {
    for (const mark of node.marks) if (mark.type.name === "link") region.push(mark.attrs.href);
  });
  assert.deepEqual(region, ["https://example.org", "region:lgn"]);
});

test("unknown block types become paragraphs, and an empty doc gets one empty paragraph", () => {
  assert.equal(blockToNode(schema, { id: "b1", type: "mystery", text: "x" }).type.name, "paragraph");
  const empty = blocksToDoc(schema, [], () => "fresh");
  assert.equal(empty.childCount, 1);
  assert.equal(empty.child(0).attrs.id, "fresh");
  assert.match(newBlockId(), /^[0-9a-z]{5}$/);
});

/* ---------- Doc changes → block diffs, applied to the real store ---------- */

function setupStore(markdown) {
  const engine = openEngine(new sqlite3.oo1.DB(":memory:"));
  const artifact = engine.createArtifact({ kind: "doc", title: "Notes", blocks: markdownToBlocks(markdown) }, "agent");
  const stored = () => engine.getArtifact(artifact.id).blocks;
  return { engine, id: artifact.id, stored };
}
const { openEngine } = m;
const pos = (doc, index) => {
  let at = 0;
  for (let i = 0; i < index; i++) at += doc.child(i).nodeSize;
  return at;
};
const texts = (blocks) => blocks.map((block) => `${block.type}:${block.text}`);

/** Edits a doc with ProseMirror steps, then saves the diff to the store the way the editor does. */
function editAndSave(store, edit) {
  const before = blocksToDoc(schema, store.stored());
  const base = baseFrom(store.stored());
  const tr = new Transform(before);
  edit(tr, before);
  const dirty = changedIds(before, tr.doc);
  const blocks = docBlocks(tr.doc);
  const ops = planSave(base, blocks, dirty);
  if (ops.length) store.engine.applyBlockOps(store.id, ops, "user");
  return { ops, blocks, dirty };
}

test("typing in a block saves one update, with no rev", () => {
  const store = setupStore("# Title\n\nFirst paragraph.\n\nSecond paragraph.");
  const { ops, blocks } = editAndSave(store, (tr, doc) => tr.insert(pos(doc, 1) + 1 + "First paragraph.".length, schema.text(" More")));
  assert.deepEqual(ops, [{ op: "update", id: blocks[1].id, block: { type: "p", indent: 0, text: "First paragraph. More" } }]);
  assert.deepEqual(texts(store.stored()), ["h1:Title", "p:First paragraph. More", "p:Second paragraph."]);
});

test("splitting a block inserts the new half with the editor's id; the store keeps that id", () => {
  const store = setupStore("First half second half");
  const { ops, blocks } = editAndSave(store, (tr, doc) => {
    tr.split(1 + "First half".length, 1, [{ type: schema.nodes.paragraph, attrs: { id: "zz9zz" } }]);
    // The second paragraph's content starts after the first node ("First half" + 2) and its opening token.
    const second = doc.child(0).nodeSize - " second half".length + 1;
    tr.delete(second, second + 1);
  });
  assert.deepEqual(
    ops.map((op) => op.op),
    ["insert", "update"],
  );
  assert.equal(ops[0].after, blocks[0].id);
  assert.deepEqual(
    store.stored().map((block) => block.id),
    blocks.map((block) => block.id),
  );
  assert.deepEqual(texts(store.stored()), ["p:First half", "p:second half"]);
});

test("deleting, moving and turning blocks into other types", () => {
  const store = setupStore("# A\n\nB\n\nC\n\nD");
  const before = store.stored();
  const { ops } = editAndSave(store, (tr, doc) => {
    // Move D to the top, delete B, turn C into a bullet.
    const d = doc.child(3);
    tr.delete(pos(doc, 3), pos(doc, 3) + d.nodeSize);
    tr.insert(0, d);
    const b = tr.doc.child(2);
    tr.delete(pos(tr.doc, 2), pos(tr.doc, 2) + b.nodeSize);
    tr.setNodeMarkup(pos(tr.doc, 2), schema.nodes.bullet, { id: before[2].id, indent: 1 });
  });
  assert.deepEqual(
    ops.map((op) => op.op),
    ["delete", "move", "update"],
  );
  assert.deepEqual(texts(store.stored()), ["p:D", "h1:A", "bullet:C"]);
  assert.equal(store.stored()[2].indent, 1);
});

test("a paste of several blocks becomes one insert op; untouched blocks are never rewritten", () => {
  // "a_b" would be written back as "a_b", but "[1]" as "\\[1\\]": untouched blocks keep their stored text.
  const store = setupStore("Cite [1] here.\n\nEnd");
  const { ops } = editAndSave(store, (tr, doc) => {
    const nodes = withIds(markdownToBlocks("- one\n- two\n- three")).map((block) => blockToNode(schema, block));
    tr.insert(pos(doc, 1), nodes);
  });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "insert");
  assert.equal(ops[0].blocks.length, 3);
  assert.deepEqual(texts(store.stored()), ["p:Cite [1] here.", "bullet:one", "bullet:two", "bullet:three", "p:End"]);
});

test("the longest common subsequence keeps the most blocks in place", () => {
  assert.deepEqual([...stayingIds(["a", "b", "c", "d"], ["d", "a", "b", "c"])], ["a", "b", "c"]);
  assert.deepEqual([...stayingIds([], ["a"])], []);
});

/* ---------- Store → editor ---------- */

test("an agent edit replaces only its block; the user's unsaved block and cursor block stay the same nodes", () => {
  const store = setupStore("One\n\nTwo\n\nThree");
  const stored = store.stored();
  const doc = blocksToDoc(schema, stored);
  let base = baseFrom(stored);
  // The user types in block one (unsaved), and the agent edits block three and adds a block.
  const tr = new Transform(doc);
  tr.insert(pos(doc, 0) + 4, schema.text("!"));
  const dirty = changedIds(doc, tr.doc);
  store.engine.applyBlockOps(
    store.id,
    [
      { op: "update", id: stored[2].id, text: "Three, edited" },
      { op: "insert", after: stored[1].id, blocks: [{ type: "p", text: "Inserted" }] },
    ],
    "agent",
  );
  const editorDoc = tr.doc;
  const plan = planReconcile(base, docBlocks(editorDoc), store.stored(), dirty);
  assert.equal(plan.foreign.length, 2);
  const apply = new Transform(editorDoc);
  applyTarget(apply, schema, plan.target, () => "fresh");
  assert.deepEqual(texts(docBlocks(apply.doc)), ["p:One!", "p:Two", "p:Inserted", "p:Three, edited"]);
  assert.equal(apply.doc.child(0), editorDoc.child(0), "The user's block is the same node.");
  assert.equal(apply.doc.child(1), editorDoc.child(1), "Untouched blocks are the same nodes.");
  base = plan.base;
  // The user's pending change still saves on top.
  const ops = planSave(base, docBlocks(apply.doc), dirty);
  store.engine.applyBlockOps(store.id, ops, "user");
  assert.deepEqual(texts(store.stored()), ["p:One!", "p:Two", "p:Inserted", "p:Three, edited"]);
});

test("a cursor in a block the agent edits keeps its place (only the changed text is replaced)", () => {
  const text = "One two tpyo three";
  const blocks = withIds(markdownToBlocks(`${text}\n\nNext`));
  const doc = blocksToDoc(schema, blocks);
  for (const offset of [2, text.length]) {
    const state = m.EditorState.create({ doc, selection: m.TextSelection.create(doc, 1 + offset) });
    const tr = state.tr;
    applyTarget(
      tr,
      schema,
      [
        { id: blocks[0].id, block: { ...blocks[0], text: "One two typo three" } },
        { id: blocks[1].id, keep: true },
      ],
      () => "fresh",
    );
    const next = state.apply(tr);
    assert.equal(next.doc.child(0).textContent, "One two typo three");
    assert.equal(next.selection.from, 1 + offset, `cursor at ${offset}`);
  }
  // A to-do ticked elsewhere changes only its attributes.
  const todo = withIds(markdownToBlocks("- [ ] task"));
  const todoDoc = blocksToDoc(schema, todo);
  const state = m.EditorState.create({ doc: todoDoc, selection: m.TextSelection.create(todoDoc, 3) });
  const tr = state.tr;
  applyTarget(tr, schema, [{ id: todo[0].id, block: { ...todo[0], data: { checked: true } } }], () => "fresh");
  const next = state.apply(tr);
  assert.equal(next.doc.child(0).attrs.checked, true);
  assert.equal(next.selection.from, 3);
});

test("the editor's own save is not treated as someone else's change", () => {
  const store = setupStore("Alpha\n\nBeta");
  const stored = store.stored();
  const doc = blocksToDoc(schema, stored);
  const base = baseFrom(stored);
  const tr = new Transform(doc);
  tr.insert(pos(doc, 1) + 1 + "Beta".length, schema.text(" edited"));
  const dirty = changedIds(doc, tr.doc);
  const blocks = docBlocks(tr.doc);
  store.engine.applyBlockOps(store.id, planSave(base, blocks, dirty), "user");
  const next = savedBase(base, blocks, dirty);
  const plan = planReconcile(next, blocks, store.stored(), new Set());
  assert.deepEqual(plan.foreign, []);
  assert(plan.target.every((entry) => entry.keep));
});

test("blocks the store deleted go, unless the user is editing them; new local blocks stay in place", () => {
  const stored = withIds(markdownToBlocks("A\n\nB\n\nC"));
  const base = baseFrom(stored);
  const local = { id: "new01", type: "p", indent: 0, text: "local" };
  const editor = [stored[0], local, stored[1], stored[2]];
  const plan = planReconcile(base, editor, [stored[0], stored[2]], new Set(["new01"]));
  assert.deepEqual(
    plan.target.map((entry) => entry.id),
    [stored[0].id, "new01", stored[2].id],
  );
  const kept = planReconcile(base, editor, [stored[0], stored[2]], new Set([stored[1].id]));
  assert(
    kept.target.some((entry) => entry.id === stored[1].id),
    "A deleted block the user is editing stays.",
  );
  const doc = blocksToDoc(schema, editor);
  const tr = new Transform(doc);
  applyTarget(tr, schema, [], () => "fresh");
  assert.equal(tr.doc.childCount, 1, "A doc never becomes empty.");
});

test("markdown files import and export losslessly through the editor", () => {
  const blocks = withIds(markdownToBlocks(EVERY_TYPE));
  const exported = m.exportDocument("doc:k3f9", "Title", docBlocks(blocksToDoc(schema, blocks)), new Date("2026-09-28T00:00:00Z"));
  const imported = m.parseDocument(exported);
  assert.equal(imported.title, "Title");
  assert.deepEqual(imported.blocks.map(normal), blocks.map(normal));
  assert.deepEqual(markdownToBlocks(m.blocksToMarkdown(imported.blocks)).map(normal), blocks.map(normal));
  void nodeToBlock;
});
