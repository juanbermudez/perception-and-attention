import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function bundle(source) {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const {
  tools,
  createToolRunner,
  inputSchema,
  toolDefinition,
  registerTools,
  compact,
  createAgentControl,
  startAgentSurface,
  installModelContextShim,
  REGION_IDS,
  LAYER_IDS,
} = await bundle(`
  export { tools } from "./src/agent/tools/index.ts";
  export * from "./src/agent/webmcp.ts";
  export { startAgentSurface } from "./src/agent/index.ts";
  export { installModelContextShim } from "./src/agent/shim.ts";
  export { compact } from "./src/api/result.ts";
  export { createAgentControl } from "./src/agent/control.ts";
  export { REGION_IDS } from "./src/model/refs.ts";
  export { LAYER_IDS } from "./src/model/view.ts";
`);

const WRITE_TOOLS = ["go", "walkthrough", "start_tour", "set_view"];
const READ_TOOLS = ["get_context", "outline", "read", "search"];

/** A GuideApi double that records calls and answers with fixed results. */
function fakeApi({ throws = false } = {}) {
  const calls = [];
  const answer =
    (name, result) =>
    (...args) => {
      calls.push([name, ...args]);
      if (throws) throw new Error("boom");
      return result;
    };
  return {
    calls,
    context: answer("context", { at: "overview", cursor: 0, activity: [] }),
    outline: answer("outline", { ref: "guide", topics: [], gone: null }),
    read: answer("read", { ref: "help" }),
    search: answer("search", { scope: "guide", hits: [] }),
    go: answer("go", { at: "step:vision/optic-chiasm", said: "Opened Vision step 2.", undo: { label: "Undo", run: () => calls.push(["undo"]) } }),
    walkthrough: answer("walkthrough", { at: "step:vision/optic-chiasm", walking: true, said: "Playing Vision." }),
    quiz: answer("quiz", { ref: "quiz:k3f9", said: "Created quiz." }),
    doc: answer("doc", { ref: "doc:k3f9", said: "Created doc." }),
    window: answer("window", { ref: "doc:k3f9", said: "Opened doc." }),
    tour: answer("tour", { at: "step:vision/optic-chiasm", said: "Started a 1-stop tour, about 6 s." }),
    setView: answer("setView", {
      view: { yaw: 90, pitch: 10, zoom: 1 },
      said: "Now viewing from the left.",
      undo: { label: "Back to previous view", run: () => calls.push(["undo view"]) },
    }),
  };
}

function setup({ on = true, throws = false } = {}) {
  const api = fakeApi({ throws });
  const control = { on };
  const presence = { events: [], begin: (tool) => presence.events.push(["begin", tool]), end: (said, undo) => presence.events.push(["end", said, undo]) };
  const logged = [];
  const runner = createToolRunner({ tools, api, control, presence, activity: { append: (entry) => logged.push(entry) } });
  return { api, control, presence, logged, runner };
}

test("twelve tools, each with a title, a description, and readOnly set only on the read tools", () => {
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["get_context", "outline", "read", "search", "go", "walkthrough", "start_tour", "set_view", "doc", "edit_blocks", "window", "quiz"],
  );
  for (const tool of tools) {
    assert(tool.title && tool.description.length > 20, tool.name);
    assert.equal(tool.readOnly, READ_TOOLS.includes(tool.name), tool.name);
  }
});

test("input schemas are inlined JSON Schema objects that reject unknown properties", () => {
  for (const tool of tools) {
    const schema = inputSchema(tool.input);
    assert.equal(schema.type, "object", tool.name);
    assert.equal(schema.additionalProperties, false, tool.name);
    assert(!("$schema" in schema));
    const text = JSON.stringify(schema);
    assert(!text.includes("$ref"), `${tool.name} uses $ref`);
    for (const noise of ["9007199254740991", "propertyNames", '"oneOf"']) assert(!text.includes(noise), `${tool.name} has ${noise}`);
  }
  const ops = inputSchema(tools.find((tool) => tool.name === "edit_blocks").input).properties.ops.items;
  assert.equal(ops.anyOf.length, 6, "Discriminated unions become anyOf.");
  const walk = inputSchema(tools.find((tool) => tool.name === "walkthrough").input);
  assert.deepEqual(walk.properties.action.enum, ["play", "pause", "next", "prev", "restart", "stop"]);
  assert.deepEqual([walk.properties.seconds.minimum, walk.properties.seconds.maximum], [3, 20], "Seconds per walkthrough step.");
  assert.deepEqual(walk.required, ["action"]);
  const tour = inputSchema(tools.find((tool) => tool.name === "start_tour").input);
  assert.deepEqual([tour.properties.seconds.minimum, tour.properties.seconds.maximum], [2, 30], "Seconds per stop, the stops' own range.");
  assert.deepEqual(tour.required, ["stops"]);
});

const VALID = {
  get_context: [{}, { since: 0 }, { since: 41 }, null, undefined],
  outline: [{}, { ref: "topic:vision" }, { ref: "topic:vision", limit: 5, cursor: "5" }, { limit: 100 }],
  read: [{ ref: "help" }, { ref: "region:v1", detail: "full" }, { ref: "step:vision/2", detail: "sources" }],
  search: [{ query: "pulvinar" }, { query: "lgn", scope: "guide", limit: 5 }, { query: "a", limit: 50 }],
  go: [{ ref: "step:vision/3" }, { ref: "region:v1", camera: false }, { ref: " topic:hearing " }],
  walkthrough: [
    { action: "play" },
    { action: "play", ref: "topic:hearing", seconds: 8 },
    { action: "next" },
    { action: "restart", seconds: 3 },
    { action: "stop" },
  ],
  start_tour: [
    { stops: [{ ref: "step:vision/3", say: "The LGN relays the eye's signal." }] },
    {
      seconds: 8,
      stops: [
        { ref: "topic:vision" },
        { ref: "region:lgn", view: { camera: { frame: ["lgn", "v1"], from: "left" }, isolate: ["lgn", "v1"] }, say: "x".repeat(280), seconds: 2 },
        { view: { labels: "focus" }, seconds: 30 },
      ],
    },
    { seconds: 25, stops: [{ say: "Stops take 2 to 30 seconds, so the default can too." }] },
    { stops: Array.from({ length: 20 }, (_, i) => ({ say: `Stop ${i + 1}` })) },
  ],
  set_view: [
    {},
    { camera: { focus: "v1" } },
    { camera: { frame: ["lgn", "v1"], from: "left", zoom: 1.4 } },
    { camera: { reset: true, yaw: -90, pitch: 88, orbit: [15, -5], zoom: 7.4 } },
    { layers: { skull: 0, cortex: 0.3, auditory_nerve: 1 }, effect: "fade" },
    { isolate: ["lgn", "v1"] },
    { camera: { focus: "V1" } },
    { camera: { frame: ["region:lgn", "Region:V1"] }, isolate: ["region:retinar"] },
    { isolate: { regions: ["tpj"], keep: 0.2 } },
    { isolate: null },
    { isolate: [] },
    { labels: "focus", spotlight: false, xray: true, motion: "instant" },
  ],
};
const INVALID = {
  get_context: [{ since: -1 }, { since: 1.5 }, { since: "3" }, { extra: true }, "string"],
  outline: [{ ref: "" }, { ref: "   " }, { limit: 0 }, { limit: 101 }, { ref: 5 }, { cursor: "x".repeat(21) }, { depth: 2 }],
  read: [{}, { ref: "help", detail: "everything" }, { ref: "x".repeat(201) }, { ref: "help", extra: 1 }],
  search: [{}, { query: "" }, { query: "a", limit: 51 }, { query: "a", scope: "web" }],
  go: [{}, { ref: "topic:vision", camera: "yes" }, { to: "topic:vision" }],
  walkthrough: [
    {},
    { action: "tour", stops: [{ say: "Hi" }] },
    { action: "play", seconds: 2 },
    { action: "play", seconds: 21 },
    { action: "next", seconds: 5 },
    { action: "pause", ref: "topic:vision" },
    { action: "play", stops: [{ ref: "topic:vision" }] },
  ],
  start_tour: [
    {},
    { stops: [] },
    { stops: Array.from({ length: 21 }, () => ({ say: "Hi" })) },
    { stops: [{ say: "x".repeat(281) }] },
    { stops: [{ ref: "topic:vision", seconds: 1 }] },
    { stops: [{ ref: "topic:vision", seconds: 31 }] },
    { seconds: 31, stops: [{ ref: "topic:vision" }] },
    { stops: [{ ref: "topic:vision", view: { camera: { focus: "v1", frame: ["lgn"] } } }] },
    { stops: [{ ref: "topic:vision", duration: 5 }] },
    { action: "tour", stops: [{ say: "Hi" }] },
  ],
  set_view: [
    { camera: { focus: "v1", frame: ["lgn"] } },
    { camera: { focus: "topic:vision" } },
    { camera: { focus: "visual cortex" } },
    { camera: { frame: [] } },
    { camera: { frame: ["retina", "retinaR", "chiasm", "lgn", "v1", "l6", "l5", "trn", "pfc", "parietal", "pulvinar", "extrastriate", "mt"] } },
    { camera: { from: "above" } },
    { camera: { zoom: 0 } },
    { camera: { orbit: [10] } },
    { camera: { spin: 1 } },
    { layers: { skull: 1.5 } },
    { layers: { brain: 0 } },
    { isolate: ["lgn", "nope"] },
    { isolate: { regions: ["v1"], keep: 2 } },
    { isolate: "v1" },
    { labels: "some" },
    { zoom: 2 },
    { motion: "fast" },
    "v1",
  ],
};

test("valid input fixtures reach the API", async () => {
  for (const [name, fixtures] of Object.entries(VALID))
    for (const args of fixtures) {
      const { runner, api } = setup();
      const result = await runner.call(name, args);
      assert(!result.error, `${name} ${JSON.stringify(args)}: ${result.error?.message}`);
      assert.equal(api.calls.length, 1, `${name} ${JSON.stringify(args)}`);
    }
});

test("invalid input fixtures return bad_input without touching the API", async () => {
  for (const [name, fixtures] of Object.entries(INVALID))
    for (const args of fixtures) {
      const { runner, api } = setup();
      const result = await runner.call(name, args);
      assert.equal(result.error?.code, "bad_input", `${name} ${JSON.stringify(args)}`);
      assert(result.error.message.length > 0);
      assert.equal(api.calls.length, 0, `${name} ${JSON.stringify(args)}`);
    }
});

test("inputs arrive trimmed and typed", async () => {
  const { runner, api } = setup();
  await runner.call("go", { ref: "  topic:hearing  " });
  assert.deepEqual(api.calls[0], ["go", "topic:hearing", undefined]);
  await runner.call("outline", { ref: "topic:vision", limit: 3 });
  assert.deepEqual(api.calls[1], ["outline", "topic:vision", { limit: 3, cursor: undefined }]);
});

test("the kill switch blocks write tools only", async () => {
  const { runner, api, presence, logged } = setup({ on: false });
  for (const name of WRITE_TOOLS) {
    const result = await runner.call(name, VALID[name][0]);
    assert.equal(result.error?.code, "agent_control_off", name);
  }
  assert.deepEqual(api.calls, [], "Blocked writes never reach the API.");
  assert.deepEqual(presence.events, []);
  assert.deepEqual(logged, []);
  for (const name of READ_TOOLS) {
    const result = await runner.call(name, VALID[name][1]);
    assert(!result.error, name);
  }
  assert.equal(api.calls.length, READ_TOOLS.length);
});

test("the kill switch reads the live setting", async () => {
  const storage = new Map();
  const control = createAgentControl({ getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
  const runner = createToolRunner({ tools, api: fakeApi(), control });
  assert.equal(control.on, true, "On by default.");
  assert(!(await runner.call("go", { ref: "topic:vision" })).error);
  const changes = [];
  control.onChange((on) => changes.push(on));
  control.set(false);
  assert.equal((await runner.call("go", { ref: "topic:vision" })).error.code, "agent_control_off");
  assert.deepEqual(changes, [false]);
  assert.equal(createAgentControl({ getItem: (key) => storage.get(key) ?? null, setItem() {} }).on, false, "The choice persists.");
  const blocked = createAgentControl({
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
  });
  assert.equal(blocked.on, true);
  blocked.set(false);
  assert.equal(blocked.on, false, "Works for the visit when storage is blocked.");
});

test("switching control in one tab switches it in the others", () => {
  const storage = new Map();
  const shared = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const tabA = new EventTarget();
  const tabB = new EventTarget();
  const a = createAgentControl(shared, tabA);
  const b = createAgentControl(shared, tabB);
  const heard = [];
  b.onChange((on) => heard.push(on));
  a.set(false);
  // The browser fires "storage" in every other tab of the origin, never in the tab that wrote.
  const changed = (key) => Object.assign(new Event("storage"), { key });
  tabB.dispatchEvent(changed("perception-attention:agent-control"));
  assert.equal(b.on, false);
  assert.deepEqual(heard, [false], "Tab B stops its tour and hides presence through onChange.");
  tabB.dispatchEvent(changed("some-other-key"));
  assert.deepEqual(heard, [false]);
  storage.clear();
  tabB.dispatchEvent(changed(null));
  assert.equal(b.on, true, "Cleared storage means the default, on.");
  assert.equal(createAgentControl(shared, null).on, true, "Works without a window.");
});

test("a write shows presence, logs one agent entry, and keeps its undo out of the result", async () => {
  const { runner, presence, logged, api } = setup();
  const result = await runner.call("go", { ref: "step:vision/2" });
  assert.deepEqual(result, { at: "step:vision/optic-chiasm", said: "Opened Vision step 2." });
  assert.deepEqual(presence.events[0], ["begin", "go"]);
  assert.equal(presence.events[1][1], "Opened Vision step 2.");
  presence.events[1][2].run();
  assert.deepEqual(api.calls.at(-1), ["undo"]);
  assert.deepEqual(logged, [{ by: "agent", kind: "go", ref: "step:vision/optic-chiasm", said: "Opened Vision step 2." }]);
  await runner.call("read", { ref: "help" });
  assert.equal(logged.length, 1, "Reads are not logged.");
  assert.equal(presence.events.length, 2, "Reads do not show presence.");
  assert.equal(runner.running, false);
});

test("errors are returned, never thrown", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const { runner } = setup({ throws: true });
  for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) {
    const result = await runner.call(name, VALID[name][1] ?? VALID[name][0]);
    assert.equal(result.error.code, "internal", `${name}: a bug in the page is not "try elsewhere"`);
    assert.match(result.error.message, /boom/);
  }
  assert.equal(logged.mock.callCount(), READ_TOOLS.length + WRITE_TOOLS.length, "Failures are logged to the console for debugging.");
  assert.equal(setup().runner.running, false);
  const unknown = await setup().runner.call("nope", {});
  assert.equal(unknown.error.code, "bad_input");
  assert(unknown.error.options.includes("go"));
});

test("results are compact: null and undefined fields are dropped", async () => {
  const { runner } = setup();
  assert.deepEqual(await runner.call("outline", {}), { ref: "guide", topics: [] });
  assert.deepEqual(compact({ a: 1, b: undefined, c: null, d: [{ e: undefined, f: 0 }], g: false }), { a: 1, d: [{ f: 0 }], g: false });
});

test("a failure in presence, toasts or the activity log never turns a finished write into a thrown error", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const api = fakeApi();
  const boom = () => {
    throw new Error("no #toast");
  };
  const runner = createToolRunner({ tools, api, control: { on: true }, presence: { begin: boom, end: boom }, activity: { append: boom } });
  const result = await runner.call("go", { ref: "step:vision/2" });
  assert.deepEqual(result, { at: "step:vision/optic-chiasm", said: "Opened Vision step 2." });
  assert.equal(logged.mock.callCount(), 3);
  assert.equal(runner.running, false);
});

test("switching control off while a write is running undoes what landed and returns agent_control_off", async () => {
  const api = fakeApi();
  const control = { on: true };
  let finish;
  api.go = (...args) => {
    api.calls.push(["go", ...args]);
    return new Promise((resolve) => {
      finish = () => resolve({ at: "step:vision/optic-chiasm", said: "Opened Vision step 2.", undo: { label: "Undo", run: () => api.calls.push(["undo"]) } });
    });
  };
  const presence = { events: [], begin: (tool) => presence.events.push(["begin", tool]), end: (said) => presence.events.push(["end", said]) };
  const logged = [];
  const runner = createToolRunner({ tools, api, control, presence, activity: { append: (entry) => logged.push(entry) } });
  const pending = runner.call("go", { ref: "step:vision/2" });
  await Promise.resolve();
  control.on = false;
  finish();
  const result = await pending;
  assert.equal(result.error.code, "agent_control_off");
  assert.match(result.error.message, /its change was undone/);
  assert.deepEqual(api.calls.at(-1), ["undo"]);
  assert.deepEqual(logged, [], "Nothing is logged as the agent's.");
  assert.deepEqual(presence.events.at(-1), ["end", undefined], "No toast for an undone write.");
});

test("the cancellation signal reaches the tool, and a call cancelled before it runs does nothing", async () => {
  const seen = [];
  const probe = {
    name: "probe",
    title: "Probe",
    description: "Test tool",
    readOnly: true,
    input: tools[0].input,
    run: (_input, _api, options) => seen.push(options.signal),
  };
  const runner = createToolRunner({ tools: [probe], api: fakeApi(), control: { on: true } });
  const controller = new AbortController();
  await toolDefinition(probe, runner).execute({}, { signal: controller.signal });
  assert.equal(seen[0], controller.signal);
  await toolDefinition(probe, runner).execute({});
  assert.equal(seen.length, 2, "ChatGPT passes no options; the call still runs.");
  controller.abort();
  const cancelled = await runner.call("probe", {}, { signal: controller.signal });
  assert.equal(cancelled.error.code, "not_available");
  assert.equal(seen.length, 2);
});

/** A model context that behaves as the spec says: registerTool returns a Promise, aborting unregisters. */
function specModelContext({ refuse = [] } = {}) {
  const registered = new Map();
  return {
    registered,
    async registerTool(tool, { signal }) {
      if (refuse.includes(tool.name)) throw {}; // ChatGPT rejects with an empty plain object.
      if (registered.has(tool.name)) throw new Error(`duplicate ${tool.name}`);
      registered.set(tool.name, tool);
      signal.addEventListener("abort", () => registered.delete(tool.name));
    },
  };
}

test("registration awaits every tool, gives each its schema and annotations, and aborting unregisters", async () => {
  const modelContext = specModelContext();
  const { runner } = setup();
  const controller = new AbortController();
  assert.deepEqual(await registerTools(modelContext, runner, controller.signal), []);
  assert.deepEqual(
    [...modelContext.registered.keys()],
    tools.map((tool) => tool.name),
  );
  for (const tool of tools) assert.equal(modelContext.registered.get(tool.name).annotations.readOnlyHint, tool.readOnly);
  assert.deepEqual(await modelContext.registered.get("read").execute({ ref: "help" }), { ref: "help" }, "Results are plain objects.");
  assert.deepEqual(Object.keys(toolDefinition(tools[0], runner)), ["name", "title", "description", "inputSchema", "annotations", "execute"]);
  controller.abort();
  assert.equal(modelContext.registered.size, 0);
});

test("a refused registration is logged by tool name, and the surface unregisters everything", async (t) => {
  const warned = t.mock.method(console, "warn", () => {});
  const { runner } = setup();
  const failed = await registerTools(specModelContext({ refuse: ["quiz"] }), runner, new AbortController().signal);
  assert.deepEqual(failed, ["quiz"]);
  assert.match(warned.mock.calls[0].arguments[0], /^Could not register the quiz tool: \{\}$/);
  const sync = {
    registerTool: () => {
      throw new TypeError("old preview");
    },
  };
  assert.equal((await registerTools(sync, runner, new AbortController().signal)).length, tools.length, "A synchronous throw counts as a refusal.");

  const modelContext = specModelContext({ refuse: ["window"] });
  globalThis.document = { modelContext };
  globalThis.navigator ??= {};
  t.after(() => delete globalThis.document);
  const api = fakeApi();
  const surface = startAgentSurface({ api, control: { on: true }, presence: { begin() {}, end() {} }, activity: { append() {} }, search: "" });
  assert.equal(await surface.registered, false);
  assert.equal(modelContext.registered.size, 0, "No partial tool list is left behind.");
});

test("the dev shim's registerTool is async and refuses what the spec refuses", async (t) => {
  globalThis.document = {};
  t.after(() => delete globalThis.document);
  const registry = installModelContextShim();
  const modelContext = globalThis.document.modelContext;
  const tool = { name: "probe", description: "Test tool", inputSchema: { type: "object" } };
  const controller = new AbortController();
  const pending = modelContext.registerTool(tool, { signal: controller.signal });
  assert(pending instanceof Promise);
  await pending;
  await assert.rejects(modelContext.registerTool(tool), { name: "InvalidStateError", message: /already registered/ });
  await assert.rejects(modelContext.registerTool({ ...tool, name: "bad name" }), { name: "InvalidStateError" });
  await assert.rejects(modelContext.registerTool({ ...tool, name: "x".repeat(129) }), { name: "InvalidStateError" });
  await assert.rejects(modelContext.registerTool({ ...tool, name: "quiet", description: "" }), { name: "InvalidStateError" });
  const aborted = AbortSignal.abort();
  await assert.rejects(modelContext.registerTool({ ...tool, name: "late" }, { signal: aborted }));
  assert.deepEqual([...registry.keys()], ["probe"]);
  controller.abort();
  assert.equal(registry.size, 0, "Aborting the signal unregisters.");
});

test("annotations: WebMCP hints on every tool, MCP hints set truthfully on write tools", () => {
  const { runner } = setup();
  const hints = Object.fromEntries(tools.map((tool) => [tool.name, toolDefinition(tool, runner).annotations]));
  const untrusted = ["get_context", "outline", "read", "search", "doc", "edit_blocks"];
  for (const [name, annotation] of Object.entries(hints)) {
    assert.equal(annotation.untrustedContentHint, untrusted.includes(name), `${name}: returns user doc text`);
    assert.equal(annotation.consequentialHint, false, name);
    assert.equal(annotation.openWorldHint, false, name);
    if (annotation.readOnlyHint) assert(!("destructiveHint" in annotation), name);
  }
  const destructive = Object.keys(hints).filter((name) => hints[name].destructiveHint);
  const idempotent = Object.keys(hints).filter((name) => hints[name].idempotentHint);
  assert.deepEqual(destructive, ["doc", "edit_blocks"]);
  assert.deepEqual(idempotent, ["go", "window"]);
});

test("inputs use unambiguous names, mapped to what the API and the store expect", async () => {
  const { runner, api } = setup();
  const question = { kind: "truefalse", prompt: "p", answer: true, show_me: { ref: "region:LGN", view: { camera: { focus: "V1" } } } };
  assert(!(await runner.call("quiz", { action: "create", title: "T", questions: [question], show: false })).error);
  assert.deepEqual(api.calls.at(-1), [
    "quiz",
    {
      action: "create",
      title: "T",
      open: false,
      questions: [{ kind: "truefalse", prompt: "p", answer: true, ref: "region:LGN", view: { camera: { focus: "v1" } } }],
    },
  ]);
  assert.match(
    (await runner.call("quiz", { action: "create", title: "T", questions: [{ ...question, ref: "quiz:k3f9" }] })).error.message,
    /Unrecognized key: "ref"/,
  );
  assert(!(await runner.call("doc", { action: "create", title: "T", show: false })).error);
  assert.deepEqual(api.calls.at(-1), ["doc", { action: "create", title: "T", open: false }]);
  assert(!(await runner.call("window", { action: "place", ref: "doc:k3f9", slot: "left" })).error);
  assert.deepEqual(api.calls.at(-1), ["window", { action: "place", ref: "doc:k3f9", at: "left" }]);
  assert.equal((await runner.call("window", { action: "place", ref: "doc:k3f9", at: "left" })).error.code, "bad_input");
});

test("a quiz question that passes the schema always fits in one stored block", async () => {
  const { runner, api } = setup();
  const create = (question) => runner.call("quiz", { action: "create", title: "T", questions: [question] });
  const explain = await create({ kind: "recall", prompt: "p", answer: "a", explain: "x".repeat(2001) });
  assert.match(explain.error.message, /^questions\.0\.explain: /);
  const quote = (n) => '"'.repeat(n);
  const big = { kind: "order", prompt: quote(300), items: Array.from({ length: 8 }, () => quote(300)), explain: quote(2000) };
  const tooBig = await create(big);
  assert.equal(tooBig.error.code, "bad_input");
  assert.match(tooBig.error.message, /^questions\.0: this question is \d+ characters as stored; a block holds 8000/);
  assert(!(await create({ ...big, explain: "x".repeat(2000) })).error, "Every field at its maximum still fits.");
  assert.equal(api.calls.length, 1);
});

/* ---------- Stage 2: set_view and tours ---------- */

test("set_view's schema lists region, layer, side and label names from content", () => {
  const schema = inputSchema(tools.find((tool) => tool.name === "set_view").input);
  const camera = schema.properties.camera;
  assert.deepEqual(camera.properties.focus.enum, REGION_IDS);
  assert.deepEqual(camera.properties.frame.items.enum, REGION_IDS);
  assert.deepEqual([camera.properties.frame.minItems, camera.properties.frame.maxItems], [1, 12]);
  assert.deepEqual(camera.properties.from.enum, ["front", "left", "right", "back", "top", "bottom"]);
  assert.equal(camera.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties.layers.properties), LAYER_IDS);
  assert.deepEqual(schema.properties.labels.enum, ["auto", "focus", "all", "none"]);
  assert.equal(schema.properties.isolate.anyOf.length, 3);
  const tour = inputSchema(tools.find((tool) => tool.name === "start_tour").input);
  const stop = tour.properties.stops.items;
  assert.deepEqual([tour.properties.stops.minItems, tour.properties.stops.maxItems], [1, 20]);
  assert.deepEqual(Object.keys(stop.properties), ["ref", "view", "say", "seconds"]);
  assert.deepEqual([stop.properties.seconds.minimum, stop.properties.seconds.maximum, stop.properties.say.maxLength], [2, 30, 280]);
  assert.deepEqual(Object.keys(stop.properties.view), ["description", "type", "additionalProperties"], "The ViewPatch is spelled out once, on set_view.");
  assert.match(stop.properties.view.description, /set_view patch/);
});

test("embedded view patches are loose in the schema, checked in code with set_view's rules and forgiving ids", async () => {
  const { runner } = setup();
  const tour = (view) => runner.call("start_tour", { stops: [{ ref: "topic:vision", view }] });
  assert(!(await tour({ camera: { focus: "V1" }, isolate: { regions: ["region:lgn"] } })).error);
  const bad = await tour({ camera: { focus: "nowhere" } });
  assert.equal(bad.error.code, "bad_input");
  assert.match(bad.error.message, /^stops\.0\.view: camera\.focus: unknown region id "nowhere"/);
  assert.match((await tour({ camera: { spin: 1 } })).error.message, /Unknown field camera\.spin\. Options: reset, focus/);
});

test("set_view and tour errors say what to fix", async () => {
  const message = async (name, args) => (await setup().runner.call(name, args)).error.message;
  assert.equal(await message("set_view", { camera: { focus: "v1", frame: ["lgn"] } }), "camera: focus and frame cannot be used together; use one");
  assert.match(await message("set_view", { camera: { focus: "LGM" } }), /^camera\.focus: unknown region id "LGM"; closest: lgn/);
  assert.match(await message("set_view", { isolate: ["step:vision/2"] }), /^isolate\.0: region fields take region ids such as "v1", not step: refs/);
  assert.match(await message("set_view", { camera: { focus: "visual cortex" } }), /closest: .*\bv1\b/);
  assert.match(await message("set_view", { isolate: ["lgn", "nope"] }), /^isolate\.1: unknown region id "nope"/, "The list form's own error, not the union's.");
  assert.match(await message("set_view", { isolate: { regions: ["v1"], keep: 2 } }), /^isolate\.keep: /);
  assert.equal(await message("set_view", { isolate: "v1" }), "isolate: isolate takes a list of region ids, { regions, keep }, or null");
  assert.match(await message("set_view", { layers: { brain: 0 } }), /^layers: Unrecognized key: "brain"/);
  assert.equal(
    await message("start_tour", { stops: [{ view: { camera: { focus: "v1", frame: ["lgn"] } } }] }),
    "stops.0.view: camera.focus and camera.frame cannot be used together; use one.",
  );
  assert.match(await message("start_tour", {}), /^stops: /);
  assert.equal(await message("walkthrough", { action: "next", seconds: 5 }), "seconds: seconds applies to play and restart, not next");
  assert.match(await message("walkthrough", { action: "tour", stops: [] }), /^action: /);
});

test("set_view's Undo goes to the toast as Back to previous view, never into the result", async () => {
  const { runner, presence, logged, api } = setup();
  const result = await runner.call("set_view", { camera: { from: "left" } });
  assert.deepEqual(result, { view: { yaw: 90, pitch: 10, zoom: 1 }, said: "Now viewing from the left." });
  assert.deepEqual(api.calls[0], ["setView", { camera: { from: "left" } }]);
  const [, said, undo] = presence.events[1];
  assert.equal(said, "Now viewing from the left.");
  assert.equal(undo.label, "Back to previous view");
  undo.run();
  assert.deepEqual(api.calls.at(-1), ["undo view"]);
  assert.deepEqual(logged, [{ by: "agent", kind: "set_view", ref: undefined, said: "Now viewing from the left." }]);
});
