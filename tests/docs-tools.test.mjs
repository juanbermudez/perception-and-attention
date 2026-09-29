// Stage 3 tool layer and the Stage 4 window tool, end to end in Node: doc, edit_blocks, window, and the
// docs parts of outline, read, search, go and get_context, through the real tool runner, GuideApi,
// docs API and store engine (sqlite-wasm in memory). The explorer, 3D scene and windows are fakes.
import assert from "node:assert/strict";
import test from "node:test";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { build } from "esbuild";

const result = await build({
  stdin: {
    contents: `
      export { tools } from "./src/agent/tools/index.ts";
      export { createToolRunner, inputSchema } from "./src/agent/webmcp.ts";
      export { createGuideApi } from "./src/api/guide-api.ts";
      export { createDocsApi, undoOps } from "./src/api/docs-api.ts";
      export { createActivityLog } from "./src/api/activity.ts";
      export { createViewApi } from "./src/api/view-api.ts";
      export { createState } from "./src/state.ts";
      export { openEngine } from "./src/store/engine.ts";
      export { createStore, directCall } from "./src/store/store.ts";
      export { anglesFromDirection, focusPreset } from "./src/model/view.ts";
      export { slotRect, sizeFor, arrange } from "./src/ui/window-geometry.ts";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const {
  tools,
  createToolRunner,
  inputSchema,
  createGuideApi,
  createDocsApi,
  createActivityLog,
  createViewApi,
  createState,
  openEngine,
  createStore,
  directCall,
} = m;
const sqlite3 = await sqlite3InitModule();
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));

/** Windows as the UI keeps them, without the DOM. */
function fakeWindows() {
  const shown = new Map();
  let focused = null;
  const info = (ref) => ({ ref, title: shown.get(ref).title, state: shown.get(ref).state, focused: focused === ref ? true : undefined });
  const missing = (ref) => ({ error: { code: "not_available", message: `${ref} has no window.` } });
  return {
    shown,
    editingBlock: null,
    titles: new Map(),
    list: () => [...shown.keys()].map(info),
    editing() {
      return this.editingBlock;
    },
    async open(ref, options = {}) {
      const title = this.titles.get(ref);
      if (!title) return { error: { code: "unknown_ref", message: `No doc or quiz ${ref}.` } };
      shown.set(ref, { title, state: "open", at: options.at ?? "right", size: options.size ?? "m", block: options.block });
      focused = ref;
      return { ref, title };
    },
    command(action, ref) {
      const window = shown.get(ref);
      if (!window) return missing(ref);
      if (action === "close") shown.delete(ref);
      else if (action === "minimize") window.state = "minimized";
      else window.state = "open";
      focused = action === "close" || action === "minimize" ? null : ref;
      return { ref, title: window.title };
    },
    place(ref, at, size) {
      const window = shown.get(ref);
      if (!window) return missing(ref);
      Object.assign(window, at ? { at } : {}, size ? { size } : {});
      return { ref, title: window.title };
    },
    arrange: () => [...shown.values()].filter((window) => window.state === "open").length,
  };
}

function fakeScene() {
  const homeDistance = 11.9;
  return {
    gesturing: false,
    homeDistance,
    current: { target: [0, 0.4, 0], yaw: 60.6, pitch: 14.4, distance: homeDistance },
    pose() {
      return { ...this.current, target: [...this.current.target], zoom: homeDistance / this.current.distance };
    },
    homePose: () => ({ target: [0, 0.4, 0], yaw: 60.6, pitch: 14.4, distance: homeDistance }),
    focusPose(id) {
      const target = [0, 0, 0],
        direction = [0, 0, 0];
      m.focusPreset(id, 0.4, target, direction);
      return { target, ...m.anglesFromDirection(direction), distance: 9.5 };
    },
    frameRegions: () => ({ target: [0, 0, 0], distance: 8 }),
    setPose(next) {
      this.current = { ...this.current, ...next };
    },
    snapLayers() {},
  };
}

function setup({ locked = () => false, withWindows = true } = {}) {
  const engine = openEngine(new sqlite3.oo1.DB(":memory:"));
  const store = createStore(directCall(engine), { mode: "local" });
  const state = createState(false);
  const view = createViewApi(state, fakeScene());
  const windows = withWindows ? fakeWindows() : undefined;
  let opens = 0;
  const docs = createDocsApi({
    store: async () => {
      opens++;
      return store;
    },
    currentView: () => view.capture(),
    isLocked: locked,
    open: (ref) => void windows?.open(ref),
    download: () => false,
    now: () => new Date("2026-09-28T12:00:00Z"),
  });
  // Titles for the fake windows come from the store, as the real window manager's do.
  store.onChange(async (change) => {
    if (change.kind !== "artifact" || !windows) return;
    const artifact = engine.getArtifact(change.id, { includeDeleted: true });
    if (artifact) windows.titles.set(`${artifact.kind}:${artifact.id}`, artifact.title);
  });
  const explorer = {
    snapshot: () => ({
      overview: true,
      path: "attention",
      step: 0,
      selected: "pfc",
      panel: "guide",
      region: null,
      walking: false,
      seconds: 5.5,
      place: { kind: "overview" },
    }),
    goTo() {},
    startWalk() {},
    stopWalk() {},
    selection: () => null,
  };
  const about = { open() {}, close() {}, tab: () => null };
  const activity = createActivityLog({ now: () => 0 });
  const api = createGuideApi({ explorer, about, activity, playing: () => true, agentControl: () => true, view, docs, windows, now: () => 0 });
  const toasts = [];
  const presence = { begin() {}, end: (said, undo) => toasts.push({ said, undo }) };
  const runner = createToolRunner({ tools, api, control: { on: true }, presence, activity });
  const call = (name, args) => runner.call(name, args);
  return { engine, store, state, view, windows, docs, api, runner, call, toasts, activity, opens: () => opens };
}
const ok = (value) => {
  assert(!value.error, `unexpected error: ${JSON.stringify(value.error)}`);
  return value;
};
const err = (value, code) => {
  assert.equal(value.error?.code, code, JSON.stringify(value));
  return value.error;
};

const NOTES = `# Notes on attention

The pulvinar coordinates activity between cortical areas.

Second paragraph has a tpyo in it.

- [the relay](region:lgn)
  - nested point`;

/* ---------- Schemas ---------- */

const VALID = {
  doc: [
    { action: "create", title: "Notes" },
    { action: "create", title: "Notes", markdown: "# Hi\n\n- a", show: false },
    { action: "rename", ref: "doc:k3f9", title: "New" },
    { action: "delete", ref: "doc:k3f9" },
    { action: "restore", ref: "doc:k3f9" },
    { action: "download", ref: "quiz:k3f9" },
  ],
  edit_blocks: [
    { ref: "doc:k3f9", ops: [{ op: "insert", md: "Hello" }] },
    { ref: "doc:k3f9", ops: [{ op: "insert", after: "start", view: "current" }] },
    { ref: "doc:k3f9", ops: [{ op: "insert", after: "b7x2k", view: { camera: { focus: "v1" }, layers: { skull: 0 } } }] },
    { ref: "doc:k3f9", ops: [{ op: "insert", question: { kind: "truefalse", prompt: "The LGN is in the thalamus.", answer: true } }] },
    {
      ref: "doc:k3f9",
      ops: [
        { op: "update", id: "b7x2k", md: "New text", rev: 2 },
        { op: "replace", id: "block:b7x2k", find: "tpyo", with: "typo", rev: 3 },
        { op: "delete", id: "b7x2k" },
        { op: "move", id: "b7x2k", after: "end" },
        { op: "set", id: "b7x2k", data: { checked: true }, rev: 1 },
      ],
    },
    { ref: "doc:k3f9", ops: Array.from({ length: 50 }, () => ({ op: "delete", id: "b7x2k" })) },
  ],
  window: [
    { action: "open", ref: "doc:k3f9" },
    { action: "open", ref: "block:b7x2k", slot: "top-left", size: "l" },
    { action: "close" },
    { action: "minimize", ref: "quiz:k3f9" },
    { action: "restore", ref: "doc:k3f9" },
    { action: "focus", ref: "doc:k3f9" },
    { action: "place", ref: "doc:k3f9", slot: "bottom-right" },
    { action: "place", size: "s" },
    { action: "arrange" },
    { action: "arrange", layout: "stack" },
  ],
};
const INVALID = {
  doc: [
    {},
    { action: "create" },
    { action: "create", title: "" },
    { action: "create", title: "x".repeat(201) },
    { action: "create", title: "T", ref: "doc:k3f9" },
    { action: "rename", ref: "doc:k3f9" },
    { action: "delete" },
    { action: "delete", ref: "doc:k3f9", markdown: "x" },
    { action: "download", ref: "doc:k3f9", title: "x" },
    { action: "publish", ref: "doc:k3f9" },
    { action: "create", title: "T", extra: 1 },
  ],
  edit_blocks: [
    {},
    { ref: "doc:k3f9" },
    { ref: "doc:k3f9", ops: [] },
    { ref: "doc:k3f9", ops: Array.from({ length: 51 }, () => ({ op: "delete", id: "b7x2k" })) },
    { ref: "doc:k3f9", ops: [{ op: "insert" }] },
    { ref: "doc:k3f9", ops: [{ op: "insert", md: "a", view: "current" }] },
    { ref: "doc:k3f9", ops: [{ op: "insert", view: "later" }] },
    { ref: "doc:k3f9", ops: [{ op: "insert", view: { camera: { focus: "nowhere" } } }] },
    { ref: "doc:k3f9", ops: [{ op: "insert", question: { kind: "essay", prompt: "Why?" } }] },
    { ref: "doc:k3f9", ops: [{ op: "update", id: "b7x2k", md: "no rev" }] },
    { ref: "doc:k3f9", ops: [{ op: "replace", id: "b7x2k", find: "", with: "x", rev: 1 }] },
    { ref: "doc:k3f9", ops: [{ op: "set", id: "b7x2k", data: "x", rev: 1 }] },
    { ref: "doc:k3f9", ops: [{ op: "update", id: "b7x2k", md: "x", rev: 0 }] },
    { ref: "doc:k3f9", ops: [{ op: "explode", id: "b7x2k" }] },
    { ref: "doc:k3f9", ops: [{ op: "delete", id: "b7x2k", rev: 1 }] },
  ],
  window: [
    {},
    { action: "open" },
    { action: "open", ref: "doc:k3f9", slot: "middle" },
    { action: "open", ref: "doc:k3f9", size: "xl" },
    { action: "open", ref: "doc:k3f9", layout: "tile" },
    { action: "close", slot: "left" },
    { action: "place", ref: "doc:k3f9" },
    { action: "arrange", ref: "doc:k3f9" },
    { action: "arrange", layout: "grid" },
    { action: "open", ref: "doc:k3f9", x: 10 },
  ],
};

test("doc, edit_blocks and window: schemas accept the fixtures and reject bad input before the API", async () => {
  for (const name of ["doc", "edit_blocks", "window"]) {
    const tool = tools.find((candidate) => candidate.name === name);
    assert.equal(tool.readOnly, false);
    const schema = inputSchema(tool.input);
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    for (const args of VALID[name]) assert(tool.input.safeParse(args).success, `${name} ${JSON.stringify(args)}`);
    for (const args of INVALID[name]) {
      const { call } = setup();
      const result = await call(name, args);
      assert.equal(result.error?.code, "bad_input", `${name} ${JSON.stringify(args)}`);
    }
  }
  const { call, opens } = setup();
  await call("doc", { action: "delete" });
  assert.equal(opens(), 0, "Rejected input never opens the store.");
});

/* ---------- doc ---------- */

test("doc create opens a window and returns block ids and revs; delete, restore and rename undo from the toast", async () => {
  const { call, windows, toasts, api } = setup();
  const created = ok(await call("doc", { action: "create", title: "Attention notes", markdown: NOTES }));
  assert.match(created.ref, /^doc:[0-9a-z]{4}$/);
  assert.equal(created.blocks.length, 5);
  assert(created.blocks.every((block) => /^[0-9a-z]{5}$/.test(block.id) && block.rev === 1));
  assert.deepEqual(created.windows, [{ ref: created.ref, title: "Attention notes", state: "open", focused: true }]);
  assert.equal(toasts.at(-1).said, "Created doc “Attention notes” with 5 blocks");
  assert(bytes(created) < 2048);

  ok(await call("doc", { action: "rename", ref: created.ref, title: "Attention" }));
  toasts.at(-1).undo.run();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ok(await api.read(created.ref)).title, "Attention notes", "Undo renames it back.");

  const deleted = ok(await call("doc", { action: "delete", ref: created.ref }));
  assert.equal(deleted.restore, `doc({ action: "restore", ref: "${created.ref}" })`);
  err(await call("read", { ref: created.ref }), "unknown_ref");
  toasts.at(-1).undo.run();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(ok(await call("read", { ref: created.ref })).title, "Attention notes", "Undo restores it.");

  const download = ok(await call("doc", { action: "download", ref: created.ref }));
  assert.deepEqual(download, { ref: created.ref, file: "attention-notes.md", said: "Download ready in the window" });
  assert(windows.shown.has(created.ref));
});

/* ---------- edit_blocks ---------- */

test("acceptance prompt 7 through the tools: outline, then replace with the block's rev", async () => {
  const { call } = setup();
  const { ref } = ok(await call("doc", { action: "create", title: "My notes", markdown: NOTES }));
  const listed = ok(await call("outline", { ref: "docs" }));
  assert.equal(listed.docs[0].ref, ref);
  const outline = ok(await call("outline", { ref }));
  const second = outline.blocks.filter((block) => block.type === "p")[1];
  const edit = ok(await call("edit_blocks", { ref, ops: [{ op: "replace", id: second.id, find: "tpyo", with: "typo", rev: second.rev }] }));
  assert.deepEqual(edit, { rev: 2, changed: [{ id: second.id, rev: 2 }], inserted: [], deleted: [], said: "Edited “My notes”: 1 changed" });
  const block = ok(await call("read", { ref: `block:${second.id}` }));
  assert.deepEqual(block, { ref: `block:${second.id}`, in: ref, title: "My notes", n: 3, of: 5, type: "p", md: "Second paragraph has a typo in it.", rev: 2 });
});

test("a stale rev rejects the whole batch and reports the block's current text", async () => {
  const { call, engine } = setup();
  const { ref, blocks } = ok(await call("doc", { action: "create", title: "Notes", markdown: NOTES }));
  const second = blocks[2];
  ok(await call("edit_blocks", { ref, ops: [{ op: "update", id: second.id, md: "Changed by someone else.", rev: 1 }] }));
  const before = JSON.stringify(engine.getArtifact(ref.slice(4)));
  const stale = err(
    await call("edit_blocks", {
      ref,
      ops: [
        { op: "insert", after: "start", md: "Should not appear." },
        { op: "delete", id: blocks[1].id },
        { op: "replace", id: second.id, find: "tpyo", with: "typo", rev: 1 },
      ],
    }),
    "stale_rev",
  );
  assert.equal(stale.id, second.id);
  assert.deepEqual(stale.current, { rev: 2, md: "Changed by someone else." });
  assert.equal(JSON.stringify(engine.getArtifact(ref.slice(4))), before, "Nothing in the batch applied.");
});

test("a block the user is typing in returns locked_by_user; others still edit", async () => {
  let lockedId = null;
  const { call } = setup({ locked: (id) => id === lockedId });
  const { ref, blocks } = ok(await call("doc", { action: "create", title: "Notes", markdown: NOTES }));
  lockedId = blocks[1].id;
  const locked = err(await call("edit_blocks", { ref, ops: [{ op: "update", id: lockedId, md: "x", rev: 1 }] }), "locked_by_user");
  assert.equal(locked.id, lockedId);
  ok(await call("edit_blocks", { ref, ops: [{ op: "update", id: blocks[2].id, md: "fine", rev: 1 }] }));
});

test("Undo on the toast reverses a whole batch: inserts, deletes, moves, type changes and text", async () => {
  const { call, toasts, engine } = setup();
  const { ref, blocks } = ok(await call("doc", { action: "create", title: "Notes", markdown: NOTES }));
  const snapshot = () => engine.getArtifact(ref.slice(4)).blocks.map(({ id, type, indent, text, data }) => ({ id, type, indent, text, data }));
  const before = snapshot();
  ok(
    await call("edit_blocks", {
      ref,
      ops: [
        { op: "insert", after: blocks[0].id, md: "New one.\n\n- new two" },
        { op: "update", id: blocks[0].id, md: "## Smaller title", rev: 1 },
        { op: "replace", id: blocks[2].id, find: "tpyo", with: "typo", rev: 1 },
        { op: "move", id: blocks[4].id, after: "start" },
        { op: "delete", id: blocks[1].id },
        { op: "delete", id: blocks[3].id },
      ],
    }),
  );
  assert.notDeepEqual(snapshot(), before);
  toasts.at(-1).undo.run();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(snapshot(), before);
});

/* ---------- Acceptance prompt 5, headless ---------- */

test("acceptance prompt 5: notes on attention with a 3D view of the priority map (view: current)", async () => {
  const { call, state, view } = setup();
  const hits = ok(await call("search", { query: "priority map", scope: "guide", limit: 3 }));
  const step = hits.hits.find((hit) => hit.ref.startsWith("step:attention/"));
  assert(step, JSON.stringify(hits));
  // The agent goes there and frames the region; the fake explorer stays put, so select it by hand.
  Object.assign(state, { overview: false, path: "attention", selected: "parietal" });
  ok(await call("set_view", { camera: { focus: "parietal", from: "left", zoom: 1.6 }, layers: { skull: 0 } }));
  const { ref } = ok(
    await call("doc", {
      action: "create",
      title: "Attention notes",
      markdown: "# Attention notes\n\nParietal cortex holds a [priority map](region:parietal).",
    }),
  );
  const edit = ok(await call("edit_blocks", { ref, ops: [{ op: "insert", after: "end", view: "current" }] }));
  assert.equal(edit.inserted[0].type, "view");
  assert.match(edit.inserted[0].text, /Parietal cortex|Parietal/);
  const full = ok(await call("read", { ref, detail: "full" }));
  const saved = full.blocks.find((block) => block.type === "view");
  assert.deepEqual(saved.data, view.capture());
  assert.equal(saved.data.camera.focus, "parietal");
  assert.deepEqual(saved.data.layers, { skull: 0 });
  const markdown = ok(await call("read", { ref, detail: "markdown" }));
  assert.match(markdown.markdown, /<!-- view \{"camera":\{"focus":"parietal"/);
  assert.match(markdown.markdown, /\*\*3D view:\*\* /);
});

/* ---------- window ---------- */

test("window: open a block's doc, place, minimize, restore, arrange; commands default to the focused window", async () => {
  const { call, windows } = setup();
  const { ref, blocks } = ok(await call("doc", { action: "create", title: "Notes", markdown: NOTES, show: false }));
  assert.equal(windows.shown.size, 0);
  const opened = ok(await call("window", { action: "open", ref: `block:${blocks[2].id}`, slot: "left", size: "l" }));
  assert.equal(opened.said, "Opened “Notes” at the left.");
  assert.deepEqual(windows.shown.get(ref), { title: "Notes", state: "open", at: "left", size: "l", block: blocks[2].id });
  assert.equal(ok(await call("window", { action: "place", size: "s" })).said, "Moved “Notes” size s.");
  const minimized = ok(await call("window", { action: "minimize" }));
  assert.deepEqual(minimized.windows, [{ ref, title: "Notes", state: "minimized" }]);
  err(await call("window", { action: "focus" }), "not_available");
  ok(await call("window", { action: "restore", ref }));
  assert.equal(ok(await call("window", { action: "arrange", layout: "tile" })).said, "Tiled 1 window.");
  err(await call("window", { action: "open", ref: "region:v1" }), "bad_input");
  err(await call("window", { action: "open", ref: "doc:zzzz" }), "unknown_ref");
  const context = ok(await call("get_context", {}));
  assert.deepEqual(context.windows, [{ ref, title: "Notes", state: "open", focused: true }]);
  assert.equal(context.store, "local");
  windows.editingBlock = blocks[1].id;
  assert.equal(ok(await call("get_context", {})).editing, `block:${blocks[1].id}`);
  ok(await call("window", { action: "close", ref }));
  assert.equal(ok(await call("get_context", {})).windows, undefined);
});

test("go opens a doc or scrolls to a block in its window", async () => {
  const { call, windows } = setup();
  const { ref, blocks } = ok(await call("doc", { action: "create", title: "Notes", markdown: NOTES, show: false }));
  const went = ok(await call("go", { ref: `block:${blocks[3].id}` }));
  assert.equal(went.at, `block:${blocks[3].id}`);
  assert.equal(went.in, ref);
  assert.equal(windows.shown.get(ref).block, blocks[3].id);
  assert.equal(ok(await call("go", { ref })).said, "Opened “Notes”.");
  const docs = err(await call("go", { ref: "docs" }), "not_available");
  assert.deepEqual(docs.options, [ref]);
});

test("without a window manager, window and go(doc) are not_available; doc still works", async () => {
  const { call } = setup({ withWindows: false });
  const { ref } = ok(await call("doc", { action: "create", title: "Notes" }));
  err(await call("window", { action: "open", ref }), "not_available");
  err(await call("go", { ref }), "not_available");
});

/* ---------- search, outline and get_context ---------- */

test("search: docs, all (merged with the guide), and never opening the store when no docs exist", async () => {
  const fresh = setup();
  const guideOnly = ok(await fresh.call("search", { query: "pulvinar" }));
  assert.equal(guideOnly.scope, "guide");
  assert.equal(fresh.opens(), 0, "search(all) does not start the store before any doc exists.");
  const context = ok(await fresh.call("get_context", {}));
  for (const field of ["windows", "editing", "store"]) assert.equal(context[field], undefined, field);
  const guide = ok(await fresh.call("outline", {}));
  assert.deepEqual(guide.docs, { ref: "docs", count: 0 });
  assert.equal(fresh.opens(), 0);

  const { ref, blocks } = ok(await fresh.call("doc", { action: "create", title: "Pulvinar thoughts", markdown: NOTES }));
  const docs = ok(await fresh.call("search", { query: "pulvinar coordinates", scope: "docs" }));
  assert.equal(docs.scope, "docs");
  assert.equal(docs.hits[0].ref, `block:${blocks[1].id}`);
  assert.equal(docs.hits[0].in, ref);
  const all = ok(await fresh.call("search", { query: "pulvinar", limit: 20 }));
  assert.equal(all.scope, "all");
  assert(all.hits.some((hit) => hit.ref === "region:pulvinar"));
  assert(all.hits.some((hit) => hit.ref.startsWith("block:") || hit.ref === ref));
  assert.deepEqual(ok(await fresh.call("outline", {})).docs, { ref: "docs", count: 1 });
  assert(bytes(all) < 4096);
});

test("the activity log mirrors into the store once it is open", async () => {
  const { activity, store, call } = setup();
  activity.append({ by: "user", kind: "navigated", ref: "topic:vision" });
  ok(await call("doc", { action: "create", title: "Notes" }));
  activity.connect(store);
  activity.append({ by: "user", kind: "edited", ref: "block:b1234" });
  activity.append({ by: "user", kind: "edited", ref: "block:b1234" });
  await activity.flushed();
  const rows = await store.listActivity(0);
  assert.deepEqual(
    rows.map((row) => [row.actor, row.kind, row.ref ?? null]),
    [
      ["user", "navigated", "topic:vision"],
      ["agent", "doc", null],
      ["user", "edited", "block:b1234"],
    ],
  );
});
