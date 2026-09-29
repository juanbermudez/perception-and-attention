// Docs store: sqlite-wasm in Node, in memory (spec §16 "Store").
import assert from "node:assert/strict";
import { test } from "node:test";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { build } from "esbuild";

const source = `
export * from "./src/store/engine";
export * from "./src/store/migrations";
export * from "./src/store/store";
export * from "./src/store/mode";
export * from "./src/store/limits";
export * from "./src/store/types";`;
const result = await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { openEngine, migrate, MIGRATIONS, SCHEMA_VERSION, createStore, directCall, planStorage, storageBanner, MEMORY_BANNER, LIMITS, BLOCK_TYPES } =
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const sqlite3 = await sqlite3InitModule();

const DAY = 86_400_000;
function fresh(options = {}) {
  const db = new sqlite3.oo1.DB(":memory:");
  return { db, engine: openEngine(db, options) };
}
const p = (text) => ({ type: "p", text });
/** Runs `work` and returns the StoreError it throws. */
function storeError(work) {
  try {
    work();
  } catch (error) {
    assert.equal(error.name, "StoreError", `unexpected ${error.stack}`);
    return error;
  }
  assert.fail("expected a StoreError");
}
/** Live blocks in order, with their ords: the order must be dense 0…n-1. */
function ordered(db, artifactId) {
  const rows = db.selectObjects("SELECT id, ord, text FROM blocks WHERE artifact_id = ? AND deleted_at IS NULL ORDER BY ord", [artifactId]);
  assert.deepEqual(
    rows.map((row) => row.ord),
    rows.map((_, index) => index),
    "ords are not dense",
  );
  return rows.map((row) => row.text);
}
/** Everything a failed batch must leave untouched. */
const snapshot = (db) =>
  JSON.stringify([
    db.selectObjects("SELECT * FROM artifacts ORDER BY id"),
    db.selectObjects("SELECT * FROM blocks ORDER BY id"),
    db.selectObjects("SELECT * FROM block_history ORDER BY block_id, rev"),
  ]);

test("migrations run once, in order, gated on user_version", () => {
  const db = new sqlite3.oo1.DB(":memory:");
  assert.deepEqual(
    migrate(db),
    MIGRATIONS.map((_, index) => index + 1),
  );
  assert.equal(db.selectValue("PRAGMA user_version"), SCHEMA_VERSION);
  const tables = db.selectValues("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  assert.deepEqual(tables, ["activity", "artifacts", "attempts", "block_history", "blocks", "settings", "windows"]);
  assert.deepEqual(migrate(db), [], "a migrated database is left alone");

  const next = [...MIGRATIONS, "ALTER TABLE settings ADD COLUMN note TEXT"];
  assert.deepEqual(migrate(db, next), [SCHEMA_VERSION + 1], "only the new migration runs on an existing database");
  assert.equal(db.selectValue("PRAGMA user_version"), SCHEMA_VERSION + 1);
  assert.throws(() => migrate(db, MIGRATIONS), /newer than this page/);
});

test("a failing migration rolls back and leaves user_version unchanged", () => {
  const db = new sqlite3.oo1.DB(":memory:");
  migrate(db);
  assert.throws(() => migrate(db, [...MIGRATIONS, "CREATE TABLE half (a); SELECT no_such_function()"]));
  assert.equal(db.selectValue("PRAGMA user_version"), SCHEMA_VERSION);
  assert.equal(db.selectValue("SELECT count(*) FROM sqlite_master WHERE name = 'half'"), 0);
});

test("artifacts and blocks get short base36 ids and start at rev 1", () => {
  const { engine } = fresh();
  const doc = engine.createArtifact({ kind: "doc", title: "  Vision   notes ", blocks: [p("one"), { type: "bullet", indent: 1, text: "two" }] }, "agent");
  assert.match(doc.id, /^[0-9a-z]{4}$/);
  assert.equal(doc.title, "Vision notes");
  assert.equal(doc.rev, 1);
  assert.equal(doc.createdBy, "agent");
  for (const block of doc.blocks) {
    assert.match(block.id, /^[0-9a-z]{5}$/);
    assert.equal(block.rev, 1);
  }
  assert.deepEqual(
    doc.blocks.map((block) => [block.type, block.indent, block.text]),
    [
      ["p", 0, "one"],
      ["bullet", 1, "two"],
    ],
  );
  assert.equal(engine.getArtifact("zzzz"), null);
});

test("id collisions retry, and give up with a limit error", () => {
  const ids = ["aaaa", "aaaa", "bbbb"];
  const { engine } = fresh({ randomId: (length) => (length === 4 ? ids.shift() : Math.random().toString(36).slice(2, 7).padEnd(5, "0")) });
  assert.equal(engine.createArtifact({ kind: "doc", title: "A", blocks: [] }, "user").id, "aaaa");
  assert.equal(engine.createArtifact({ kind: "doc", title: "B", blocks: [] }, "user").id, "bbbb");
  const stuck = fresh({ randomId: (length) => (length === 4 ? "cccc" : "start") });
  stuck.engine.createArtifact({ kind: "doc", title: "C", blocks: [] }, "user");
  assert.equal(storeError(() => stuck.engine.createArtifact({ kind: "doc", title: "D", blocks: [] }, "user")).code, "limit");
  const reserved = storeError(() => stuck.engine.applyBlockOps("cccc", [{ op: "insert", blocks: [p("x")] }], "user"));
  assert.equal(reserved.code, "limit", "block ids never equal the anchors start/end");
});

test("applyBlockOps is atomic: a failing op rolls back the whole batch", () => {
  const { db, engine } = fresh();
  const doc = engine.createArtifact({ kind: "doc", title: "Notes", blocks: [p("a"), p("b")] }, "user");
  const before = snapshot(db);
  const error = storeError(() =>
    engine.applyBlockOps(
      doc.id,
      [
        { op: "insert", after: "start", blocks: [p("new")] },
        { op: "update", id: doc.blocks[0].id, rev: 1, text: "changed" },
        { op: "delete", id: doc.blocks[1].id },
        { op: "move", id: "nope0", after: "end" },
      ],
      "agent",
    ),
  );
  assert.equal(error.code, "unknown_ref");
  assert.equal(error.details.op, 4);
  assert.match(error.message, /^Op 4:/);
  assert.equal(snapshot(db), before);
});

test("a stale rev rejects the whole batch and reports the current block", () => {
  const { db, engine } = fresh();
  const doc = engine.createArtifact({ kind: "doc", title: "Notes", blocks: [p("first"), p("second")] }, "user");
  const [first, second] = doc.blocks;
  engine.applyBlockOps(doc.id, [{ op: "update", id: second.id, rev: 1, text: "second, edited by the user" }], "user");
  const before = snapshot(db);
  const error = storeError(() =>
    engine.applyBlockOps(
      doc.id,
      [
        { op: "insert", after: "end", blocks: [p("tail")] },
        { op: "update", id: first.id, rev: 1, text: "first!" },
        { op: "replace", id: second.id, rev: 1, find: "second", with: "2nd" },
      ],
      "agent",
    ),
  );
  assert.equal(error.code, "stale_rev");
  assert.equal(error.details.id, second.id);
  assert.equal(error.details.current.rev, 2);
  assert.equal(error.details.current.block.text, "second, edited by the user");
  assert.equal(snapshot(db), before);
  // Without a rev (the user's editor is the local authority) the write goes through.
  const ok = engine.applyBlockOps(doc.id, [{ op: "update", id: second.id, text: "user wins" }], "user");
  assert.deepEqual(ok.changed, [{ id: second.id, rev: 3 }]);
});

test("ord stays dense 0…n-1 through inserts, moves, deletes and restores", () => {
  const { db, engine } = fresh();
  const doc = engine.createArtifact({ kind: "doc", title: "Order", blocks: ["a", "b", "c"].map(p) }, "user");
  const id = (text) => db.selectValue("SELECT id FROM blocks WHERE text = ? AND deleted_at IS NULL", [text]);
  const apply = (ops) => engine.applyBlockOps(doc.id, ops, "agent");

  apply([{ op: "insert", after: "start", blocks: [p("s1"), p("s2")] }]);
  assert.deepEqual(ordered(db, doc.id), ["s1", "s2", "a", "b", "c"]);
  apply([{ op: "insert", after: id("a"), blocks: [p("a1"), p("a2")] }]);
  assert.deepEqual(ordered(db, doc.id), ["s1", "s2", "a", "a1", "a2", "b", "c"]);
  apply([{ op: "insert", blocks: [p("end")] }]);
  assert.deepEqual(ordered(db, doc.id), ["s1", "s2", "a", "a1", "a2", "b", "c", "end"]);

  apply([
    { op: "move", id: id("end"), after: "start" },
    { op: "move", id: id("s1"), after: "end" },
    { op: "move", id: id("a2"), after: id("c") },
  ]);
  assert.deepEqual(ordered(db, doc.id), ["end", "s2", "a", "a1", "b", "c", "a2", "s1"]);

  // Restore puts a block back at its old position (undo runs in reverse order), or after an anchor.
  const a1 = id("a1");
  const end = id("end");
  apply([
    { op: "delete", id: a1 },
    { op: "delete", id: end },
  ]);
  assert.deepEqual(ordered(db, doc.id), ["s2", "a", "b", "c", "a2", "s1"]);
  const restored = apply([
    { op: "restore", id: end },
    { op: "restore", id: a1 },
  ]);
  assert.deepEqual(ordered(db, doc.id), ["end", "s2", "a", "a1", "b", "c", "a2", "s1"]);
  assert.deepEqual(
    restored.inserted.map((block) => block.id),
    [end, a1],
  );
  apply([{ op: "delete", id: end }]);
  apply([{ op: "restore", id: end, after: id("c") }]);
  assert.deepEqual(ordered(db, doc.id), ["s2", "a", "a1", "b", "c", "end", "a2", "s1"]);
  apply([{ op: "insert", after: id("b"), blocks: [p("x")] }]);
  apply([
    { op: "move", id: id("x"), after: "start" },
    { op: "delete", id: id("s1") },
  ]);
  assert.deepEqual(ordered(db, doc.id), ["x", "s2", "a", "a1", "b", "c", "end", "a2"]);
  assert.equal(storeError(() => apply([{ op: "move", id: id("x"), after: id("x") }])).code, "bad_input");
});

test("results report inserted, changed and deleted blocks, and bump the artifact rev once", () => {
  const { engine } = fresh();
  const doc = engine.createArtifact({ kind: "doc", title: "Notes", blocks: [p("a"), p("b"), p("c")] }, "user");
  const [a, b, c] = doc.blocks;
  const result = engine.applyBlockOps(
    doc.id,
    [
      { op: "insert", after: a.id, blocks: [p("new"), { type: "todo", text: "task" }] },
      { op: "update", id: a.id, rev: 1, block: { type: "h2", text: "A" } },
      { op: "replace", id: b.id, rev: 1, find: "b", with: "bee" },
      { op: "delete", id: c.id },
    ],
    "agent",
  );
  assert.equal(result.rev, 2);
  assert.deepEqual(result.changed, [
    { id: a.id, rev: 2 },
    { id: b.id, rev: 2 },
  ]);
  assert.deepEqual(
    result.inserted.map((block) => [block.type, block.text, block.rev]),
    [
      ["p", "new", 1],
      ["todo", "task", 1],
    ],
  );
  assert.deepEqual(result.deleted, [c.id]);
  const after = engine.getArtifact(doc.id);
  assert.deepEqual(
    after.blocks.map((block) => [block.type, block.text, block.updatedBy]),
    [
      ["h2", "A", "agent"],
      ["p", "new", "agent"],
      ["todo", "task", "agent"],
      ["p", "bee", "agent"],
    ],
  );
  assert.deepEqual(after.blocks[2].data, { checked: false });
});

test("text-only updates keep the block's type, indent and data; question prompts stay in sync", () => {
  const { engine } = fresh();
  const question = { kind: "truefalse", prompt: "V1 is in the occipital lobe.", answer: true };
  const doc = engine.createArtifact(
    {
      kind: "quiz",
      title: "Q",
      blocks: [
        { type: "bullet", indent: 2, text: "item" },
        { type: "question", text: "ignored", data: question },
        { type: "callout", text: "c", data: { tone: "tip" } },
      ],
    },
    "agent",
  );
  const [bullet, q, callout] = doc.blocks;
  assert.equal(q.text, question.prompt, "question text mirrors the prompt");
  engine.applyBlockOps(
    doc.id,
    [
      { op: "update", id: bullet.id, rev: 1, text: "renamed" },
      { op: "update", id: q.id, rev: 1, text: "V1 sits at the back of the brain." },
      { op: "replace", id: callout.id, rev: 1, find: "c", with: "careful" },
      { op: "set", id: callout.id, rev: 2, data: { tone: "warning" } },
    ],
    "agent",
  );
  const [b2, q2, c2] = engine.getArtifact(doc.id).blocks;
  assert.deepEqual([b2.type, b2.indent, b2.text], ["bullet", 2, "renamed"]);
  assert.equal(q2.text, "V1 sits at the back of the brain.");
  assert.equal(q2.data.prompt, q2.text);
  assert.equal(q2.data.answer, true);
  assert.deepEqual([c2.text, c2.data, c2.rev], ["careful", { tone: "warning" }, 3]);
  const bad = storeError(() => engine.applyBlockOps(doc.id, [{ op: "set", id: b2.id, rev: 2, data: { checked: true } }], "agent"));
  assert.equal(bad.code, "bad_input");
  assert.equal(storeError(() => engine.applyBlockOps(doc.id, [{ op: "update", id: b2.id, rev: 2, text: "x", block: p("y") }], "agent")).code, "bad_input");
  assert.equal(storeError(() => engine.applyBlockOps(doc.id, [{ op: "replace", id: b2.id, rev: 2, find: "absent", with: "y" }], "agent")).code, "bad_input");
});

test("block content is validated and normalized", () => {
  const { engine } = fresh();
  const doc = engine.createArtifact(
    {
      kind: "doc",
      title: "Types",
      blocks: [
        { type: "h1", text: "one\ntwo" },
        { type: "p", indent: 2, text: "flat" },
        { type: "divider", text: "ignored" },
        { type: "code", text: "x", data: { lang: "ts" } },
        { type: "code", text: "y" },
        { type: "todo", text: "t", data: { checked: "yes" } },
      ],
    },
    "user",
  );
  assert.deepEqual(
    doc.blocks.map((block) => [block.type, block.indent, block.text, block.data]),
    [
      ["h1", 0, "one two", undefined],
      ["p", 0, "flat", undefined],
      ["divider", 0, "", undefined],
      ["code", 0, "x", { lang: "ts" }],
      ["code", 0, "y", undefined],
      ["todo", 0, "t", { checked: false }],
    ],
  );
  for (const bad of [
    { type: "h4", text: "x" },
    { type: "bullet", indent: 4, text: "x" },
    { type: "bullet", indent: 1.5, text: "x" },
    { type: "callout", text: "x", data: { tone: "danger" } },
    { type: "code", text: "x", data: { lang: "not a lang" } },
    { type: "view", text: "no data" },
    { type: "question", text: "x", data: { prompt: "no kind" } },
    { type: "p", text: "x", data: { stray: 1 } },
    { type: "p", text: 42 },
  ])
    assert.equal(storeError(() => engine.applyBlockOps(doc.id, [{ op: "insert", blocks: [bad] }], "agent")).code, "bad_input", JSON.stringify(bad));
});

test("soft delete and restore, for blocks and artifacts; purge after 30 days", () => {
  let clock = Date.UTC(2026, 8, 1);
  const { db, engine } = fresh({ now: () => clock });
  const doc = engine.createArtifact({ kind: "doc", title: "Keep", blocks: [p("a"), p("b")] }, "user");
  const quiz = engine.createArtifact(
    { kind: "quiz", title: "Gone", blocks: [{ type: "question", text: "", data: { kind: "recall", prompt: "?", answer: "x" } }] },
    "agent",
  );
  const [a] = doc.blocks;

  engine.applyBlockOps(doc.id, [{ op: "delete", id: a.id }], "agent");
  assert.deepEqual(ordered(db, doc.id), ["b"]);
  assert.equal(engine.blockHistory(a.id).length, 1, "a deleted block keeps its history");
  assert.equal(engine.locateBlock(a.id), null);
  assert.equal(storeError(() => engine.applyBlockOps(doc.id, [{ op: "update", id: a.id, text: "x" }], "user")).code, "unknown_ref");
  assert.equal(storeError(() => engine.applyBlockOps(doc.id, [{ op: "restore", id: doc.blocks[1].id }], "user")).code, "bad_input");
  engine.applyBlockOps(doc.id, [{ op: "restore", id: a.id }], "user");
  assert.deepEqual(ordered(db, doc.id), ["a", "b"]);

  engine.recordAttempt({ artifactId: quiz.id, blockId: quiz.blocks[0].id, answer: "x", correct: true });
  engine.saveWindows([{ artifactId: quiz.id, state: "open", x: 10, y: 20, w: 320, h: 380, z: 1 }]);
  const deleted = engine.updateArtifact(quiz.id, { deleted: true }, "agent");
  assert.equal(deleted.deletedAt, clock);
  assert.equal(engine.getArtifact(quiz.id), null);
  assert.equal(engine.getArtifact(quiz.id, { includeDeleted: true }).title, "Gone");
  assert.deepEqual(
    engine.listArtifacts().items.map((item) => item.id),
    [doc.id],
  );
  assert.equal(engine.listArtifacts({ includeDeleted: true }).items.length, 2);
  assert.deepEqual(engine.listWindows(), [], "windows of deleted artifacts are hidden");
  assert.equal(engine.searchRows().length, 2, "search skips deleted artifacts");
  assert.equal(storeError(() => engine.applyBlockOps(quiz.id, [{ op: "insert", blocks: [p("x")] }], "agent")).code, "unknown_ref");
  assert.equal(storeError(() => engine.updateArtifact(quiz.id, { title: "New" }, "agent")).code, "unknown_ref");

  engine.updateArtifact(quiz.id, { deleted: false }, "user");
  assert.equal(engine.getArtifact(quiz.id).blocks.length, 1);
  engine.updateArtifact(quiz.id, { deleted: true }, "user");

  clock += 29 * DAY;
  assert.deepEqual(engine.maintain().purged, []);
  clock += 2 * DAY;
  assert.deepEqual(engine.maintain().purged, [quiz.id]);
  for (const table of ["artifacts", "blocks", "attempts", "windows"])
    assert.equal(db.selectValue(`SELECT count(*) FROM ${table} WHERE ${table === "artifacts" ? "id" : "artifact_id"} = ?`, [quiz.id]), 0, table);
  assert.equal(db.selectValue("SELECT count(*) FROM block_history WHERE block_id = ?", [quiz.blocks[0].id]), 0);
  assert.equal(engine.getArtifact(doc.id).blocks.length, 2);
});

test("history keeps the last 20 revs per block, and revert restores an old one", () => {
  const { db, engine } = fresh();
  const doc = engine.createArtifact({ kind: "doc", title: "History", blocks: [p("v1")] }, "user");
  const id = doc.blocks[0].id;
  for (let rev = 2; rev <= 25; rev++) engine.applyBlockOps(doc.id, [{ op: "update", id, rev: rev - 1, text: `v${rev}` }], rev % 2 ? "user" : "agent");
  const revs = db.selectValues("SELECT rev FROM block_history WHERE block_id = ? ORDER BY rev", [id]);
  assert.deepEqual(
    revs,
    Array.from({ length: 20 }, (_, index) => index + 6),
  );
  assert.equal(engine.blockHistory(id)[0].text, "v25");
  const reverted = engine.applyBlockOps(doc.id, [{ op: "revert", id, rev: 25, to: 10 }], "user");
  assert.deepEqual(reverted.changed, [{ id, rev: 26 }]);
  assert.equal(engine.getArtifact(doc.id).blocks[0].text, "v10");
  const trimmed = storeError(() => engine.applyBlockOps(doc.id, [{ op: "revert", id, to: 3 }], "user"));
  assert.equal(trimmed.code, "bad_input");
  assert.equal(trimmed.details.kept.length, LIMITS.historyPerBlock);
});

test("limits: 200 artifacts", () => {
  const { engine } = fresh();
  const ids = [];
  for (let index = 0; index < LIMITS.artifacts; index++) ids.push(engine.createArtifact({ kind: "doc", title: `Doc ${index}`, blocks: [] }, "agent").id);
  const error = storeError(() => engine.createArtifact({ kind: "doc", title: "One too many", blocks: [] }, "agent"));
  assert.equal(error.code, "limit");
  assert.equal(error.details.max, 200);
  engine.updateArtifact(ids[0], { deleted: true }, "user");
  engine.createArtifact({ kind: "quiz", title: "Fits again", blocks: [] }, "agent");
  assert.equal(storeError(() => engine.updateArtifact(ids[0], { deleted: false }, "user")).code, "limit", "restore also respects the cap");
});

test("limits: 500 blocks per artifact, 8,000 characters per block, 50 ops per call", () => {
  const { db, engine } = fresh();
  const many = (count) => Array.from({ length: count }, (_, index) => p(`b${index}`));
  assert.equal(storeError(() => engine.createArtifact({ kind: "doc", title: "Big", blocks: many(501) }, "agent")).code, "limit");
  const doc = engine.createArtifact({ kind: "doc", title: "Full", blocks: many(500) }, "agent");
  assert.equal(doc.blocks.length, 500);
  const before = snapshot(db);
  const over = storeError(() => engine.applyBlockOps(doc.id, [{ op: "insert", blocks: [p("501st")] }], "agent"));
  assert.equal(over.code, "limit");
  assert.equal(snapshot(db), before);
  // Delete one and insert one in the same batch: the count is checked after the batch.
  engine.applyBlockOps(
    doc.id,
    [
      { op: "delete", id: doc.blocks[0].id },
      { op: "insert", blocks: [p("swap")] },
    ],
    "agent",
  );

  const small = engine.createArtifact({ kind: "doc", title: "Small", blocks: [p("x".repeat(LIMITS.charsPerBlock))] }, "user");
  const long = storeError(() => engine.applyBlockOps(small.id, [{ op: "update", id: small.blocks[0].id, text: "x".repeat(8001) }], "user"));
  assert.equal(long.code, "limit");
  const bigData = storeError(() =>
    engine.applyBlockOps(small.id, [{ op: "insert", blocks: [{ type: "view", text: "v", data: { note: "x".repeat(8000) } }] }], "user"),
  );
  assert.equal(bigData.code, "limit");
  const replaced = storeError(() => engine.applyBlockOps(small.id, [{ op: "replace", id: small.blocks[0].id, find: "x", with: "yy" }], "user"));
  assert.equal(replaced.code, "limit");

  const ops = (count) => Array.from({ length: count }, () => ({ op: "insert", blocks: [p("o")] }));
  assert.equal(engine.applyBlockOps(small.id, ops(50), "agent").inserted.length, 50);
  assert.equal(storeError(() => engine.applyBlockOps(small.id, ops(51), "agent")).code, "limit");
  assert.equal(storeError(() => engine.applyBlockOps(small.id, [], "agent")).code, "bad_input");
});

test("limits: 30 questions per quiz, and titles", () => {
  const { engine } = fresh();
  const question = (index) => ({ type: "question", text: "", data: { kind: "recall", prompt: `Q${index}`, answer: "a" } });
  const questions = (count) => Array.from({ length: count }, (_, index) => question(index));
  assert.equal(storeError(() => engine.createArtifact({ kind: "quiz", title: "Q", blocks: questions(31) }, "agent")).code, "limit");
  const quiz = engine.createArtifact({ kind: "quiz", title: "Q", blocks: [p("Intro"), ...questions(30)] }, "agent");
  assert.equal(storeError(() => engine.applyBlockOps(quiz.id, [{ op: "insert", blocks: [question(31)] }], "agent")).code, "limit");
  assert.equal(storeError(() => engine.createArtifact({ kind: "doc", title: "t".repeat(LIMITS.titleChars + 1), blocks: [] }, "agent")).code, "limit");
  assert.equal(storeError(() => engine.createArtifact({ kind: "doc", title: "  ", blocks: [] }, "agent")).code, "bad_input");
  assert.equal(storeError(() => engine.createArtifact({ kind: "note", title: "x", blocks: [] }, "agent")).code, "bad_input");
});

test("listArtifacts pages newest first with a cursor, and filters by kind", () => {
  let clock = 1_000_000;
  const { engine } = fresh({ now: () => clock });
  const created = [];
  for (let index = 0; index < 25; index++) {
    clock += index % 3 === 0 ? 0 : 1000;
    created.push(engine.createArtifact({ kind: index % 5 ? "doc" : "quiz", title: `A${index}`, blocks: [p("x")] }, "agent"));
  }
  const seen = [];
  let cursor;
  do {
    const page = engine.listArtifacts({ limit: 10, cursor });
    assert(page.items.length <= 10);
    seen.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  assert.equal(seen.length, 25);
  assert.equal(new Set(seen.map((item) => item.id)).size, 25);
  for (let index = 1; index < seen.length; index++) assert(seen[index - 1].updatedAt >= seen[index].updatedAt);
  assert.equal(seen[0].blockCount, 1);
  assert.equal(engine.listArtifacts({ kind: "quiz", limit: 100 }).items.length, 5);
  assert.equal(engine.listArtifacts({ limit: 1000 }).items.length, 25, "limit is clamped to 100");
  assert.equal(storeError(() => engine.listArtifacts({ cursor: "not a cursor" })).code, "bad_input");
});

test("attempts, windows, activity and settings", () => {
  const { engine } = fresh();
  const quiz = engine.createArtifact(
    { kind: "quiz", title: "Q", blocks: [p("intro"), { type: "question", text: "", data: { kind: "truefalse", prompt: "?", answer: true } }] },
    "agent",
  );
  const [intro, question] = quiz.blocks;
  engine.recordAttempt({ artifactId: quiz.id, blockId: question.id, answer: false, correct: false });
  engine.recordAttempt({ artifactId: quiz.id, blockId: question.id, answer: true, correct: true });
  engine.recordAttempt({ artifactId: quiz.id, blockId: question.id, answer: "self" });
  assert.deepEqual(
    engine.listAttempts(quiz.id).map((attempt) => [attempt.answer, attempt.correct]),
    [
      [false, false],
      [true, true],
      ["self", null],
    ],
  );
  assert.equal(storeError(() => engine.recordAttempt({ artifactId: quiz.id, blockId: intro.id, answer: 1 })).code, "bad_input");
  assert.equal(storeError(() => engine.recordAttempt({ artifactId: quiz.id, blockId: "nope0", answer: 1 })).code, "unknown_ref");

  engine.saveWindows([
    { artifactId: quiz.id, state: "minimized", x: 1.5, y: Number.NaN, z: 2 },
    { artifactId: engine.createArtifact({ kind: "doc", title: "D", blocks: [] }, "user").id, state: "open", w: 440, h: 540, z: 1 },
  ]);
  const windows = engine.listWindows();
  assert.deepEqual(
    windows.map((window) => [window.kind, window.state, window.z]),
    [
      ["doc", "open", 1],
      ["quiz", "minimized", 2],
    ],
  );
  assert.equal(windows[1].y, undefined, "non-finite geometry is dropped");
  engine.saveWindows([]);
  assert.deepEqual(engine.listWindows(), []);
  assert.equal(storeError(() => engine.saveWindows([{ artifactId: "zzzz", state: "open" }])).code, "unknown_ref");
  assert.equal(storeError(() => engine.saveWindows([{ artifactId: quiz.id, state: "closed" }])).code, "bad_input");

  let last = 0;
  for (let index = 0; index < 520; index++)
    last = engine.appendActivity({ actor: index % 2 ? "user" : "agent", kind: "navigated", ref: `step:vision/${index}` });
  const recent = engine.listActivity(0);
  assert.equal(recent.length, 30, "at most 30 entries per read");
  assert.equal(recent.at(-1).seq, last);
  assert.deepEqual(
    engine.listActivity(last - 2).map((entry) => entry.seq),
    [last - 1, last],
  );
  assert.equal(engine.listActivity(0, 1000).length, 30, "the read limit is clamped to 30");

  assert.equal(engine.getSetting("agentControl"), null);
  engine.setSetting("agentControl", "off");
  engine.setSetting("agentControl", "on");
  assert.equal(engine.getSetting("agentControl"), "on");
});

test("the activity log keeps the last 500 rows", () => {
  const { db, engine } = fresh();
  for (let index = 0; index < 600; index++) engine.appendActivity({ actor: "user", kind: "orbit", summary: "s".repeat(400) });
  assert.equal(db.selectValue("SELECT count(*) FROM activity"), LIMITS.activityRows);
  assert.equal(db.selectValue("SELECT min(seq) FROM activity"), 101);
  assert.equal(db.selectValue("SELECT max(length(summary)) FROM activity"), LIMITS.captionChars);
});

test("the async Store emits changes after successful writes only", async () => {
  const { engine } = fresh();
  let persisted = 0;
  const store = createStore(directCall(engine), { mode: "memory", reason: "file", onFirstCreate: () => persisted++ });
  const changes = [];
  const stop = store.onChange((change) => changes.push(change));
  const doc = await store.createArtifact({ kind: "doc", title: "Async", blocks: [p("a")] }, "agent");
  await store.createArtifact({ kind: "doc", title: "Second", blocks: [] }, "agent");
  assert.equal(persisted, 1, "persistent storage is requested once");
  await store.applyBlockOps(doc.id, [{ op: "insert", blocks: [p("b")] }], "agent");
  await assert.rejects(store.applyBlockOps(doc.id, [{ op: "delete", id: "nope0" }], "agent"), (error) => error.code === "unknown_ref");
  await store.updateArtifact(doc.id, { deleted: true }, "user");
  stop();
  await store.updateArtifact(doc.id, { deleted: false }, "user");
  assert.deepEqual(
    changes.map((change) => [change.kind, change.deleted ?? change.ids?.length ?? null]),
    [
      ["artifact", null],
      ["artifact", null],
      ["blocks", 1],
      ["artifact", true],
    ],
  );
  assert.equal(store.mode, "memory");
  assert.equal(store.reason, "file");
});

test("storage mode: file://, insecure pages, missing OPFS or locks fall back to memory with a banner", () => {
  const ok = { protocol: "https:", secureContext: true, opfs: true, workers: true, locks: true };
  assert.deepEqual(planStorage(ok), { persist: true, reason: null });
  assert.deepEqual(planStorage({ ...ok, protocol: "http:", secureContext: true }), { persist: true, reason: null }, "localhost is a secure context");
  assert.deepEqual(planStorage({ ...ok, protocol: "file:", secureContext: false }), { persist: false, reason: "file" });
  assert.deepEqual(planStorage({ ...ok, protocol: "http:", secureContext: false }), { persist: false, reason: "insecure" });
  assert.deepEqual(planStorage({ ...ok, opfs: false }), { persist: false, reason: "no-opfs" });
  assert.deepEqual(planStorage({ ...ok, locks: false }), { persist: false, reason: "no-opfs" });
  assert.equal(storageBanner("local", null), null);
  for (const reason of ["file", "insecure", "no-opfs", "other-tab", "failed"]) {
    const banner = storageBanner("memory", reason);
    assert.equal(banner.text, MEMORY_BANNER);
    assert(banner.detail.length > 0);
  }
  assert.equal(MEMORY_BANNER, "Not saved in this browser. Download docs to keep them.");
});

test("every block type is accepted by the store", () => {
  const { engine } = fresh();
  const data = {
    callout: { tone: "note" },
    code: { lang: "js" },
    todo: { checked: true },
    view: { camera: { focus: "v1" } },
    question: { kind: "truefalse", prompt: "?", answer: false },
  };
  const doc = engine.createArtifact({ kind: "doc", title: "All", blocks: BLOCK_TYPES.map((type) => ({ type, text: "t", data: data[type] })) }, "user");
  assert.deepEqual(
    doc.blocks.map((block) => block.type),
    [...BLOCK_TYPES],
  );
});
