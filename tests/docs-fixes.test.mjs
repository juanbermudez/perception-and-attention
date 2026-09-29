// Fixes from the 2026-09-28 review (docs/reviews/2026-09-28/code-agent-side.md): the docs API, the docs
// half of the agent tools, the store and the editor model, against the real engine (sqlite-wasm in memory).
import assert from "node:assert/strict";
import { test } from "node:test";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { build } from "esbuild";

const source = `
export { createDocsApi, isApiError } from "./src/api/docs-api";
export { createDocsTools } from "./src/api/docs-tools";
export { openEngine } from "./src/store/engine";
export { createStore, directCall } from "./src/store/store";
export { transaction } from "./src/store/sql";
export { LIMITS } from "./src/store/limits";
export { createDocSchema } from "./src/editor/schema";
export { blockToNode, checkedNode, nodeToBlock } from "./src/editor/convert";`;
const result = await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const { createDocsApi, isApiError, openEngine, createStore, directCall, transaction } = m;
const schema = m.createDocSchema();
const sqlite3 = await sqlite3InitModule();

function setup(options = {}) {
  const engine = openEngine(new sqlite3.oo1.DB(":memory:"));
  const store = createStore(directCall(engine), { mode: "local" });
  let opens = 0;
  const api = createDocsApi({
    store: async () => {
      opens++;
      await new Promise((resolve) => setTimeout(resolve, 1));
      return store;
    },
    now: () => new Date("2026-09-28T12:00:00Z"),
    ...options,
  });
  return { api, engine, store, opens: () => opens };
}
const ok = (value) => {
  assert(!isApiError(value), `unexpected error: ${JSON.stringify(value)}`);
  return value;
};
const err = (value, code) => {
  assert(isApiError(value), `expected ${code}, got ${JSON.stringify(value)}`);
  assert.equal(value.error.code, code, value.error.message);
  return value.error;
};

/* ---------- L1, L11 ---------- */

test("L1: overlapping first calls open the store once and subscribe once", async () => {
  const { api, engine, opens } = setup();
  const changes = [];
  let opened = 0;
  api.onChange((change) => changes.push(change));
  api.onOpen(() => opened++);
  await Promise.all([api.outlineDocs(), api.outlineDocs(), api.outlineDocs()]);
  assert.equal(opens(), 1);
  assert.equal(opened, 1);
  ok(await api.doc({ action: "create", title: "Once", markdown: "x" }, "user"));
  assert.equal(changes.length, 1, "One change, one event.");
  assert.equal(engine.listArtifacts().items.length, 1);
});

test("L1: a store that fails to open is tried again on the next call", async () => {
  let attempts = 0;
  const engine = openEngine(new sqlite3.oo1.DB(":memory:"));
  const api = createDocsApi({
    store: async () => {
      attempts++;
      if (attempts === 1) throw new Error("no worker");
      return createStore(directCall(engine), { mode: "local" });
    },
  });
  err(await api.outlineDocs(), "store_unavailable");
  ok(await api.outlineDocs());
  assert.equal(attempts, 2);
});

test("L11: a failed ROLLBACK does not hide the original error", () => {
  const db = {
    exec(sql) {
      if (sql === "ROLLBACK") throw new Error("cannot rollback - no transaction is active");
    },
  };
  assert.throws(
    () =>
      transaction(db, () => {
        throw new Error("database or disk is full");
      }),
    /database or disk is full/,
  );
});

/* ---------- M2 ---------- */

test("M2: update with the markdown read(full) returns keeps a nested list item's indent", async () => {
  const { api } = setup();
  const { ref } = ok(await api.doc({ action: "create", title: "Outline", markdown: "- parent\n  - child\n    - grandchild\n\nText" }));
  const full = ok(await api.read(ref, "full"));
  const grandchild = full.blocks[2];
  assert.equal(grandchild.md, "- grandchild");
  assert.equal(grandchild.indent, 2);
  ok(await api.editBlocks({ ref, ops: [{ op: "update", id: grandchild.id, md: "- grandchild (edited)", rev: grandchild.rev }] }));
  ok(await api.editBlocks({ ref, ops: [{ op: "update", id: full.blocks[1].id, md: "1. child as a number", rev: full.blocks[1].rev }] }));
  ok(await api.editBlocks({ ref, ops: [{ op: "update", id: full.blocks[3].id, md: "- text becomes a bullet", rev: full.blocks[3].rev }] }));
  const after = ok(await api.read(ref, "full")).blocks.map((block) => [block.type, block.md, block.indent ?? 0]);
  assert.deepEqual(after, [
    ["bullet", "- parent", 0],
    ["number", "1. child as a number", 1],
    ["bullet", "- grandchild (edited)", 2],
    ["bullet", "- text becomes a bullet", 0],
  ]);
});

/* ---------- M3, M9, L4: one check per block type ---------- */

const BAD_VIEW = { camera: { focus: "not-a-region", zoom: -5 }, layers: { nope: 7 } };

test("M3: replace cannot empty a question's prompt or push it past 300 characters", async () => {
  const { api, engine } = setup();
  const quiz = ok(await api.createQuiz({ title: "Q", questions: [{ kind: "truefalse", prompt: "The LGN is in the thalamus.", answer: true }] }));
  const [question] = quiz.blocks;
  const whole = err(
    await api.editBlocks({ ref: quiz.ref, ops: [{ op: "replace", id: question.id, find: "The LGN is in the thalamus.", with: "", rev: 1 }] }),
    "bad_input",
  );
  assert.match(whole.message, /^Op 1: A question needs a prompt of 1–300 characters/);
  err(await api.editBlocks({ ref: quiz.ref, ops: [{ op: "replace", id: question.id, find: "LGN", with: "x".repeat(2000), rev: 1 }] }), "bad_input");
  ok(await api.editBlocks({ ref: quiz.ref, ops: [{ op: "replace", id: question.id, find: "LGN", with: "pulvinar", rev: 1 }] }));
  assert.equal(engine.getArtifact(quiz.ref.slice(5)).blocks[0].data.prompt, "The pulvinar is in the thalamus.");
  // The engine keeps the prompt in range on its own, for callers that skip the docs API.
  assert.throws(
    () => engine.applyBlockOps(quiz.ref.slice(5), [{ op: "replace", id: question.id, find: "The pulvinar is in the thalamus.", with: " " }], "user"),
    /A question prompt is 1–300 characters/,
  );
});

test("M9: view data and a question's view are checked on create, insert, update, set, import and saves", async () => {
  const { api } = setup();
  const comment = `<!-- view ${JSON.stringify(BAD_VIEW)} -->`;
  const created = err(await api.doc({ action: "create", title: "Bad view", markdown: `Intro\n\n${comment}` }), "bad_input");
  assert.match(created.message, /^View 1: The view is not valid: camera\.focus: unknown region id "not-a-region"/);
  err(await api.importDoc(`# Notes\n\n${comment}`, "notes.md"), "bad_input");

  const { ref } = ok(await api.doc({ action: "create", title: "Good", markdown: 'Intro\n\n<!-- view {"camera":{"focus":"v1"}} -->' }));
  const [intro, view] = ok(await api.read(ref, "full")).blocks;
  assert.equal(view.type, "view");
  err(await api.editBlocks({ ref, ops: [{ op: "set", id: view.id, data: { anything: [1, 2, 3] }, rev: view.rev }] }), "bad_input");
  ok(await api.editBlocks({ ref, ops: [{ op: "set", id: view.id, data: { camera: { focus: "lgn" } }, rev: view.rev }] }));
  err(await api.editBlocks({ ref, ops: [{ op: "insert", view: BAD_VIEW }] }), "bad_input");
  err(await api.editBlocks({ ref, ops: [{ op: "update", id: intro.id, md: comment, rev: intro.rev }] }), "bad_input");
  const question = { kind: "truefalse", prompt: "V1 is in the occipital lobe.", answer: true, view: BAD_VIEW };
  const inserted = err(await api.editBlocks({ ref, ops: [{ op: "insert", question }] }), "bad_input");
  assert.match(inserted.message, /view: camera\.focus/);
  err(await api.createQuiz({ title: "Q", questions: [question] }), "bad_input");
  ok(await api.editBlocks({ ref, ops: [{ op: "insert", question: { ...question, view: { camera: { focus: "v1" }, layers: { skull: 0 } } } }] }));

  // The editor's own saves (pastes, drops) go through the same check.
  err(await api.saveBlocks(ref, [{ op: "insert", after: "end", blocks: [{ type: "view", text: "", data: BAD_VIEW }] }]), "bad_input");
  err(await api.saveBlocks(ref, [{ op: "update", id: intro.id, block: { type: "question", text: "", data: { kind: "recall", prompt: "" } } }]), "bad_input");
  const saved = ok(await api.saveBlocks(ref, [{ op: "insert", after: "end", blocks: [{ type: "view", text: "", data: { camera: { focus: "v1" } } }] }]));
  assert.equal(saved.inserted[0].text, "V1", "An empty caption becomes the view's description.");
});

test("L4: a question too large to store is rejected with a limit that says what to shorten", async () => {
  const { api } = setup();
  const explain = "x".repeat(7990);
  const big = err(await api.createQuiz({ title: "Q", questions: [{ kind: "truefalse", prompt: "Long?", answer: true, explain }] }), "limit");
  assert.match(big.message, /^Question 1: The question is 8,0\d\d characters when saved; a block holds at most 8,000\. Shorten explain/);
  assert.equal(big.max, 8000);
});

test("M9: a pasted question or view that does not check out comes in as text", () => {
  const node = (block) => m.blockToNode(schema, { id: "b1234", ...block });
  const bad = m.checkedNode(schema, node({ type: "view", text: "Somewhere **odd**", data: BAD_VIEW }));
  assert.equal(bad.changed, true);
  assert.deepEqual(m.nodeToBlock(bad.node), { id: "b1234", type: "p", indent: 0, text: "Somewhere **odd**" });
  const question = m.checkedNode(schema, node({ type: "question", text: "", data: { kind: "recall", prompt: "What is V1?" } }));
  assert.deepEqual(m.nodeToBlock(question.node), { id: "b1234", type: "p", indent: 0, text: "What is V1?" });
  const good = m.checkedNode(schema, node({ type: "view", text: "", data: { camera: { focus: "v1" } } }));
  assert.equal(good.changed, false);
  assert.deepEqual(m.nodeToBlock(good.node), { id: "b1234", type: "view", indent: 0, text: "V1", data: { camera: { focus: "v1" } } });
  const paragraph = node({ type: "p", text: "plain" });
  assert.equal(m.checkedNode(schema, paragraph).node, paragraph);
});
