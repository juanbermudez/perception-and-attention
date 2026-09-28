// Docs API over the real engine (sqlite-wasm in memory): the shapes the `doc`, `edit_blocks`,
// `outline`, `read` and `search` wrappers return (spec §6.2–§6.4, §6.8–§6.10).
import assert from "node:assert/strict";
import { test } from "node:test";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { build } from "esbuild";

const source = `
export { createDocsApi, isApiError } from "./src/api/docs-api";
export { openEngine } from "./src/store/engine";
export { createStore, directCall } from "./src/store/store";
export { validateQuestion } from "./src/model/quiz";
export { markdownToBlocks } from "./src/model/markdown";`;
const result = await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { createDocsApi, isApiError, openEngine, createStore, directCall, validateQuestion, markdownToBlocks } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const sqlite3 = await sqlite3InitModule();

function setup(options = {}) {
  const engine = openEngine(new sqlite3.oo1.DB(":memory:"));
  const store = createStore(directCall(engine), { mode: "memory", reason: "file" });
  let opens = 0;
  const api = createDocsApi({
    store: async () => {
      opens++;
      return store;
    },
    now: () => new Date("2026-09-27T12:00:00Z"),
    ...options,
  });
  return { api, engine, opens: () => opens };
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

const NOTES = `# Notes on attention

The pulvinar coordinates activty between cortical areas.

Second paragraph has a tpyo in it.

- [the relay](region:lgn)
  - nested point

<!-- question {"kind":"truefalse","prompt":"The LGN is in the thalamus.","answer":true} -->
**Question:** The LGN is in the thalamus.
<!-- /question -->
`;

test("the store opens on first use, not before", async () => {
  const { api, opens } = setup();
  assert.deepEqual(api.status(), { store: "unopened" });
  assert.equal(opens(), 0);
  ok(await api.outlineDocs());
  assert.equal(opens(), 1);
  assert.deepEqual(api.status(), {
    store: "memory",
    reason: "file",
    banner: { text: "Not saved in this browser. Download docs to keep them.", detail: "Pages opened from a file cannot save." },
  });
});

test("a store that cannot start returns store_unavailable", async () => {
  const api = createDocsApi({ store: () => Promise.reject(new Error("no worker")) });
  const error = err(await api.doc({ action: "create", title: "X" }), "store_unavailable");
  assert.match(error.message, /no worker/);
  assert.deepEqual(api.status(), { store: "unavailable" });
});

test("doc create parses markdown into blocks and opens a window", async () => {
  const opened = [];
  const { api } = setup({ open: (ref) => opened.push(ref) });
  const created = ok(await api.doc({ action: "create", title: "Attention notes", markdown: NOTES }));
  assert.match(created.ref, /^doc:[0-9a-z]{4}$/);
  assert.deepEqual(
    created.blocks.map((block) => [block.type, block.rev]),
    [
      ["h1", 1],
      ["p", 1],
      ["p", 1],
      ["bullet", 1],
      ["bullet", 1],
      ["question", 1],
    ],
  );
  assert.equal(created.said, "Created doc “Attention notes” with 6 blocks");
  assert.deepEqual(opened, [created.ref]);
  ok(await api.doc({ action: "create", title: "Hidden", open: false }));
  assert.equal(opened.length, 1);
  const long = ok(await api.doc({ action: "create", title: "Long", markdown: "word ".repeat(40) }));
  assert.equal(long.blocks[0].text.length, 80, "block text in results is cut to 80 characters");
  err(
    await api.doc({ action: "create", title: "Bad quiz", markdown: '<!-- question {"kind":"choice","prompt":"?","choices":["a"],"answer":[0]} -->' }),
    "bad_input",
  );
  err(await api.doc({ action: "create", title: "" }), "bad_input");
  err(await api.doc({ action: "explode", ref: created.ref }), "bad_input");
  // A leading heading that repeats the title is dropped, since the window already shows the title.
  const titled = ok(await api.doc({ action: "create", title: "LGN notes", markdown: "# LGN notes\n\nRelay to V1." }));
  assert.deepEqual(
    titled.blocks.map((block) => block.type),
    ["p"],
  );
  const other = ok(await api.doc({ action: "create", title: "Notes", markdown: "# The LGN\n\nRelay." }));
  assert.equal(other.blocks[0].type, "h1", "a different heading stays");
});

test("acceptance prompt 7: fix the typo in the second paragraph (outline, then replace with rev)", async () => {
  const { api } = setup();
  const { ref } = ok(await api.doc({ action: "create", title: "Attention notes", markdown: NOTES }));
  const docs = ok(await api.outlineDocs());
  assert.deepEqual(docs.docs, [{ ref, kind: "doc", title: "Attention notes", blocks: 6, updated: docs.docs[0].updated }]);
  const outline = ok(await api.outlineArtifact(ref));
  const second = outline.blocks.filter((block) => block.type === "p")[1];
  assert.equal(second.text, "Second paragraph has a tpyo in it.");
  const edit = ok(await api.editBlocks({ ref, ops: [{ op: "replace", id: second.id, find: "tpyo", with: "typo", rev: second.rev }] }));
  assert.deepEqual(edit, { rev: 2, changed: [{ id: second.id, rev: 2 }], inserted: [], deleted: [], said: "Edited “Attention notes”: 1 changed" });
  const full = ok(await api.read(ref, "full"));
  assert.equal(full.blocks.find((block) => block.id === second.id).md, "Second paragraph has a typo in it.");
  assert(JSON.stringify(edit).length < 2048, "typical results stay under 2 KB");
});

test("edit_blocks: insert, update, set, move and delete in one batch", async () => {
  const { api } = setup({ currentView: () => ({ camera: { focus: "pulvinar" }, layers: { skull: 0 } }) });
  const { ref, blocks } = ok(await api.doc({ action: "create", title: "Notes", markdown: NOTES }));
  const [title, first, second, bullet, nested, question] = blocks;
  const edit = ok(
    await api.editBlocks({
      ref,
      ops: [
        { op: "insert", after: `block:${first.id}`, md: "Inserted one.\n\n- [ ] follow up" },
        { op: "insert", after: "end", view: "current" },
        { op: "insert", after: "start", question: { kind: "recall", prompt: "Name the relay.", answer: "LGN" } },
        { op: "update", id: nested.id, md: "renamed nested point", rev: 1 },
        { op: "update", id: title.id, md: "## Smaller title", rev: 1 },
        { op: "update", id: question.id, md: "The LGN sits in the thalamus.", rev: 1 },
        { op: "move", id: second.id, after: "start" },
        { op: "delete", id: bullet.id },
      ],
    }),
  );
  assert.equal(edit.rev, 2);
  assert.deepEqual(
    edit.inserted.map((block) => block.type),
    ["p", "todo", "view", "question"],
  );
  assert.equal(edit.inserted[2].text, "Pulvinar, skull dissolved");
  assert.deepEqual(edit.deleted, [bullet.id]);
  assert.match(edit.said, /4 added, 4 changed, 1 deleted/);

  const full = ok(await api.read(ref, "full"));
  assert.deepEqual(
    full.blocks.map((block) => [block.type, block.md, block.indent ?? 0]),
    [
      ["p", "Second paragraph has a tpyo in it.", 0],
      ["question", "Name the relay.", 0],
      ["h2", "## Smaller title", 0],
      ["p", "The pulvinar coordinates activty between cortical areas.", 0],
      ["p", "Inserted one.", 0],
      ["todo", "- [ ] follow up", 0],
      ["bullet", "- renamed nested point", 1],
      ["question", "The LGN sits in the thalamus.", 0],
      ["view", "Pulvinar, skull dissolved", 0],
    ],
  );
  const q = full.blocks.find((block) => block.md === "The LGN sits in the thalamus.");
  assert.deepEqual(q.data, { kind: "truefalse", prompt: "The LGN sits in the thalamus.", answer: true });
  const todo = full.blocks.find((block) => block.type === "todo");
  ok(await api.editBlocks({ ref, ops: [{ op: "set", id: todo.id, data: { checked: true }, rev: todo.rev }] }));
  assert.equal((await api.read(ref, "full")).blocks.find((block) => block.id === todo.id).md, "- [x] follow up");
});

test("edit_blocks: a stale rev rejects the whole batch with the current markdown", async () => {
  const { api } = setup();
  const { ref, blocks } = ok(await api.doc({ action: "create", title: "Notes", markdown: "- one\n- two" }));
  ok(await api.editBlocks({ ref, ops: [{ op: "update", id: blocks[1].id, md: "two, by the user" }] }, "user"));
  const error = err(
    await api.editBlocks({
      ref,
      ops: [
        { op: "insert", md: "should not land" },
        { op: "update", id: blocks[1].id, md: "- agent", rev: 1 },
      ],
    }),
    "stale_rev",
  );
  assert.equal(error.id, blocks[1].id);
  assert.deepEqual(error.current, { rev: 2, md: "- two, by the user" });
  assert.equal(error.op, 2);
  assert.equal((await api.outlineArtifact(ref)).count, 2);
});

test("edit_blocks: input errors, limits, locks and unknown refs", async () => {
  const { api } = setup({ isLocked: (id) => id === locked });
  let locked = "";
  const { ref, blocks } = ok(await api.doc({ action: "create", title: "Notes", markdown: "a\n\nb" }));
  locked = blocks[0].id;
  const lockedError = err(await api.editBlocks({ ref, ops: [{ op: "update", id: locked, md: "x", rev: 1 }] }), "locked_by_user");
  assert.equal(lockedError.id, locked);
  ok(await api.editBlocks({ ref, ops: [{ op: "update", id: locked, md: "the user may edit their own block" }] }, "user"));

  err(await api.editBlocks({ ref, ops: [{ op: "update", id: blocks[1].id, md: "no rev" }] }), "bad_input");
  err(await api.editBlocks({ ref, ops: [{ op: "update", id: blocks[1].id, md: "one\n\ntwo", rev: 1 }] }), "bad_input");
  err(await api.editBlocks({ ref, ops: [{ op: "insert", md: "x", view: "current" }] }), "bad_input");
  err(await api.editBlocks({ ref, ops: [{ op: "insert", view: "current" }] }), "not_available");
  err(await api.editBlocks({ ref, ops: [{ op: "insert", md: "   " }] }), "bad_input");
  err(await api.editBlocks({ ref, ops: [{ op: "insert", question: { kind: "choice", prompt: "?", choices: ["a", "b"], answer: [5] } }] }), "bad_input");
  err(await api.editBlocks({ ref, ops: [{ op: "explode", id: blocks[1].id }] }), "bad_input");
  err(await api.editBlocks({ ref, ops: [] }), "bad_input");
  const tooMany = err(await api.editBlocks({ ref, ops: Array.from({ length: 51 }, () => ({ op: "insert", md: "x" })) }), "limit");
  assert.equal(tooMany.max, 50);
  const missing = err(await api.editBlocks({ ref, ops: [{ op: "delete", id: "zzzzz" }] }), "unknown_ref");
  assert.match(missing.message, /^Op 1: No block zzzzz in this doc/);
  const noDoc = err(await api.editBlocks({ ref: "doc:zzzz", ops: [{ op: "delete", id: "x" }] }), "unknown_ref");
  assert.deepEqual(noDoc.options, [ref]);
  err(await api.editBlocks({ ref: "notes", ops: [{ op: "delete", id: "x" }] }), "unknown_ref");
  err(await api.editBlocks({ ref, ops: [{ op: "insert", md: "x".repeat(8001) }] }), "limit");
});

test("rename, delete (soft), restore and download", async () => {
  const downloads = [];
  const { api } = setup({ download: (file, text) => downloads.push([file, text]) > 0 });
  const { ref } = ok(await api.doc({ action: "create", title: "Vision notes", markdown: NOTES }));
  assert.equal(ok(await api.doc({ action: "rename", ref, title: "Seeing: notes & questions" })).title, "Seeing: notes & questions");
  const deleted = ok(await api.doc({ action: "delete", ref }));
  assert.deepEqual(deleted, { ref, said: "Deleted “Seeing: notes & questions”; restorable for 30 days", restore: `doc({ action: "restore", ref: "${ref}" })` });
  err(await api.read(ref), "unknown_ref");
  assert.deepEqual((await api.outlineDocs()).docs, []);
  assert.match(ok(await api.outlineDocs({ deleted: true })).docs[0].deleted, /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/);
  assert.equal(ok(await api.doc({ action: "restore", ref })).said, "Restored “Seeing: notes & questions”");
  const download = ok(await api.doc({ action: "download", ref }));
  assert.deepEqual(download, { ref, file: "seeing-notes-questions.md", said: "Downloaded seeing-notes-questions.md" });
  const [[file, text]] = downloads;
  assert.equal(file, "seeing-notes-questions.md");
  assert(text.startsWith(`<!-- perception-attention ${ref} exported 2026-09-27 -->\n\n# Seeing: notes & questions\n`));
  assert.equal(ok(await api.read(ref, "markdown")).markdown, text);
  const blocked = setup({ download: () => false });
  const other = ok(await blocked.api.doc({ action: "create", title: "Ünïcode ✓ title!" }));
  assert.deepEqual(ok(await blocked.api.doc({ action: "download", ref: other.ref })), {
    ref: other.ref,
    file: "unicode-title.md",
    said: "Download ready in the window",
  });
});

test("read: brief and full shapes; outline pages long docs", async () => {
  const { api } = setup();
  const markdown = ["# Top", ...Array.from({ length: 45 }, (_, index) => `Paragraph ${index + 1}`), "## Later heading"].join("\n\n");
  const { ref } = ok(await api.doc({ action: "create", title: "Long", markdown }));
  const brief = ok(await api.read(ref));
  assert.deepEqual(brief, {
    ref,
    kind: "doc",
    title: "Long",
    rev: 1,
    blocks: 47,
    updated: brief.updated,
    outline: [
      { id: brief.outline[0].id, level: 1, text: "Top" },
      { id: brief.outline[1].id, level: 2, text: "Later heading" },
    ],
  });
  const pages = [];
  let cursor;
  do {
    const page = ok(await api.outlineArtifact(ref, { limit: 20, cursor }));
    pages.push(page.blocks.length);
    cursor = page.cursor;
  } while (cursor);
  assert.deepEqual(pages, [20, 20, 7]);
  err(await api.outlineArtifact(ref, { cursor: "-3" }), "bad_input");
  err(await api.read(ref, "everything"), "bad_input");
});

test("quizzes: stored questions, attempts and results", async () => {
  const { api, engine } = setup();
  const quiz = ok(
    await api.createQuiz({
      title: "Vision check",
      intro: "Five quick ones.",
      questions: [
        { kind: "choice", prompt: "Which relays vision?", choices: ["V1", "LGN"], answer: [1] },
        { kind: "region", prompt: "Click the relay.", answer: ["LGN"], choices: ["lgn", "v1"] },
        { kind: "order", prompt: "Order it.", items: ["retina", "LGN", "V1"] },
        { kind: "recall", prompt: "What is V1?", answer: "Primary visual cortex" },
        { kind: "truefalse", prompt: "MT handles motion.", answer: true, ref: "region:mt" },
      ],
    }),
  );
  assert.match(quiz.ref, /^quiz:/);
  assert.deepEqual(
    quiz.blocks.map((block) => block.type),
    ["p", "question", "question", "question", "question", "question"],
  );
  const stored = engine.getArtifact(quiz.ref.slice(5)).blocks;
  assert.deepEqual(stored[2].data.answer, ["lgn"], "region ids are canonicalized");
  const [, choice, region] = quiz.blocks;
  ok(await api.recordAttempt({ ref: quiz.ref, block: choice.id, answer: [0], correct: false }));
  ok(await api.recordAttempt({ ref: quiz.ref, block: choice.id, answer: [1], correct: true }));
  ok(await api.recordAttempt({ ref: quiz.ref, block: `block:${region.id}`, answer: ["v1"], correct: false }));
  const results = ok(await api.read(quiz.ref, "results"));
  assert.deepEqual(results.summary, { answered: 2, correct: 1, of: 5 });
  assert.deepEqual(results.questions[0], { id: choice.id, kind: "choice", attempts: 2, correct: 1, last: true });
  assert.deepEqual(results.questions[2], { id: quiz.blocks[3].id, kind: "order", attempts: 0, correct: 0 });

  const set = ok(
    await api.editBlocks({
      ref: quiz.ref,
      ops: [{ op: "set", id: choice.id, rev: 1, data: { kind: "choice", prompt: "Which one relays?", choices: ["LGN", "V1", "MT"], answer: [0] } }],
    }),
  );
  assert.deepEqual(set.changed, [{ id: choice.id, rev: 2 }]);
  err(
    await api.editBlocks({
      ref: quiz.ref,
      ops: [{ op: "set", id: choice.id, rev: 2, data: { kind: "choice", prompt: "?", choices: ["only one"], answer: [0] } }],
    }),
    "bad_input",
  );
  err(await api.editBlocks({ ref: quiz.ref, ops: [{ op: "update", id: choice.id, rev: 2, md: "x".repeat(301) }] }), "bad_input");

  err(await api.createQuiz({ title: "Empty", questions: [] }), "bad_input");
  const tooMany = err(
    await api.createQuiz({ title: "Big", questions: Array.from({ length: 31 }, () => ({ kind: "truefalse", prompt: "?", answer: true })) }),
    "limit",
  );
  assert.equal(tooMany.max, 30);
  const bad = err(await api.createQuiz({ title: "Bad", questions: [{ kind: "region", prompt: "Click Atlantis.", answer: ["atlantis"] }] }), "bad_input");
  assert.match(bad.message, /Question 1: .*atlantis/);
});

test("question validation covers all five kinds and the spec limits", () => {
  const good = [
    { kind: "choice", prompt: "p", choices: ["a", "b", "c", "d", "e", "f"], answer: [2, 0, 2] },
    { kind: "truefalse", prompt: "p", answer: false, explain: "because" },
    { kind: "region", prompt: "p", answer: ["v1"] },
    { kind: "order", prompt: "p", items: ["a", "b", "c", "d", "e", "f", "g", "h"] },
    { kind: "recall", prompt: "p".repeat(300), answer: "a" },
  ];
  for (const question of good) assert(validateQuestion(question).ok, JSON.stringify(question));
  assert.deepEqual(validateQuestion(good[0]).value.answer, [0, 2]);
  assert.equal(validateQuestion({ ...good[1], extra: "dropped" }).value.extra, undefined);
  const bad = [
    null,
    { kind: "essay", prompt: "p" },
    { kind: "recall", prompt: "p".repeat(301), answer: "a" },
    { kind: "recall", prompt: "  ", answer: "a" },
    { kind: "choice", prompt: "p", choices: ["a"], answer: [0] },
    { kind: "choice", prompt: "p", choices: ["a", "b", "c", "d", "e", "f", "g"], answer: [0] },
    { kind: "choice", prompt: "p", choices: ["a", "b"], answer: [] },
    { kind: "choice", prompt: "p", choices: ["a", "b"], answer: [1.5] },
    { kind: "truefalse", prompt: "p", answer: "yes" },
    { kind: "region", prompt: "p", answer: [] },
    { kind: "region", prompt: "p", answer: ["v1"], choices: ["lgn", "mt"] },
    { kind: "order", prompt: "p", items: ["a", "b"] },
    { kind: "order", prompt: "p", items: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] },
    { kind: "recall", prompt: "p", answer: "" },
    { kind: "recall", prompt: "p", answer: "a", view: "front" },
  ];
  for (const question of bad) assert(!validateQuestion(question).ok, JSON.stringify(question));
});

test("search rows, block lookup, windows and change events", async () => {
  const { api } = setup();
  const changes = [];
  api.onChange((change) => changes.push(change.kind));
  const doc = ok(await api.doc({ action: "create", title: "Pulvinar notes", markdown: "The pulvinar gates attention." }));
  const quiz = ok(await api.createQuiz({ title: "Q", questions: [{ kind: "truefalse", prompt: "The pulvinar is thalamic.", answer: true }] }));
  const rows = ok(await api.searchRows());
  assert.deepEqual(
    rows.map((row) => [row.in, row.type, row.text]).sort(),
    [
      [doc.ref, "p", "The pulvinar gates attention."],
      [quiz.ref, "question", "The pulvinar is thalamic."],
    ].sort(),
  );
  assert.deepEqual(ok(await api.locate(`block:${quiz.blocks[0].id}`)), { ref: quiz.ref, block: quiz.blocks[0].id });
  err(await api.locate("block:zzzzz"), "unknown_ref");

  ok(
    await api.saveWindows([
      { ref: doc.ref, state: "open", x: 24, y: 24, w: 440, h: 540, z: 2 },
      { ref: quiz.ref, state: "minimized", z: 1 },
    ]),
  );
  assert.deepEqual(ok(await api.loadWindows()), [
    { ref: quiz.ref, state: "minimized", z: 1 },
    { ref: doc.ref, state: "open", x: 24, y: 24, w: 440, h: 540, z: 2 },
  ]);
  // Both were created in the same instant, so compare without relying on their order.
  const listed = new Map(ok(await api.outlineDocs()).docs.map((item) => [item.ref, [item.open ?? false, item.minimized ?? false]]));
  assert.deepEqual(listed.get(quiz.ref), [false, true]);
  assert.deepEqual(listed.get(doc.ref), [true, false]);
  err(await api.saveWindows([{ ref: "nonsense", state: "open" }]), "unknown_ref");
  assert.deepEqual(changes, ["artifact", "artifact", "windows"]);
});

test("markdown blocks survive a store round trip unchanged", async () => {
  const { api, engine } = setup();
  const { ref } = ok(await api.doc({ action: "create", title: "Round trip", markdown: NOTES }));
  const exported = ok(await api.read(ref, "markdown")).markdown;
  const stored = engine.getArtifact(ref.slice(4)).blocks.map(({ type, indent, text, data }) => ({ type, indent, text, ...(data ? { data } : {}) }));
  const reparsed = markdownToBlocks(exported)
    .slice(1)
    .map(({ type, indent = 0, text, data }) => ({ type, indent, text, ...(data ? { data } : {}) }));
  assert.deepEqual(reparsed, stored);
});
