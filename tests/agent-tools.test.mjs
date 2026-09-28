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
  encodeResult,
  decodeResult,
  resultFormat,
  inputSchema,
  toolDefinition,
  registerTools,
  compact,
  createAgentControl,
  REGION_IDS,
  LAYER_IDS,
} = await bundle(`
  export { tools } from "./src/agent/tools/index.ts";
  export * from "./src/agent/webmcp.ts";
  export { compact } from "./src/api/result.ts";
  export { createAgentControl } from "./src/agent/control.ts";
  export { REGION_IDS } from "./src/model/refs.ts";
  export { LAYER_IDS } from "./src/model/view.ts";
`);

const WRITE_TOOLS = ["go", "walkthrough", "set_view"];
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

test("eleven tools, each with a title, a description, and readOnly set only on the read tools", () => {
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["get_context", "outline", "read", "search", "go", "walkthrough", "set_view", "doc", "edit_blocks", "window", "quiz"],
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
    assert(!JSON.stringify(schema).includes("$ref"), `${tool.name} uses $ref`);
  }
  const walk = inputSchema(tools.find((tool) => tool.name === "walkthrough").input);
  assert.deepEqual(walk.properties.action.enum, ["play", "pause", "next", "prev", "restart", "tour", "stop"]);
  assert.deepEqual([walk.properties.seconds.minimum, walk.properties.seconds.maximum], [3, 20]);
  assert.deepEqual(walk.required, ["action"]);
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
    { action: "tour", stops: [{ ref: "step:vision/3", say: "The LGN relays the eye's signal." }] },
    {
      action: "tour",
      seconds: 8,
      stops: [
        { ref: "topic:vision" },
        { ref: "region:lgn", view: { camera: { frame: ["lgn", "v1"], from: "left" }, isolate: ["lgn", "v1"] }, say: "x".repeat(280), seconds: 2 },
        { view: { labels: "focus" }, seconds: 30 },
      ],
    },
    { action: "tour", stops: Array.from({ length: 20 }, (_, i) => ({ say: `Stop ${i + 1}` })) },
  ],
  set_view: [
    {},
    { camera: { focus: "v1" } },
    { camera: { frame: ["lgn", "v1"], from: "left", zoom: 1.4 } },
    { camera: { reset: true, yaw: -90, pitch: 88, orbit: [15, -5], zoom: 7.4 } },
    { layers: { skull: 0, cortex: 0.3, auditory_nerve: 1 }, effect: "fade" },
    { isolate: ["lgn", "v1"] },
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
    { action: "tour" },
    { action: "play", seconds: 2 },
    { action: "play", seconds: 21 },
    { action: "play", stops: [] },
    { action: "play", stops: [{ ref: "topic:vision" }] },
    { action: "tour", stops: [] },
    { action: "tour", stops: Array.from({ length: 21 }, () => ({ say: "Hi" })) },
    { action: "tour", stops: [{ say: "x".repeat(281) }] },
    { action: "tour", stops: [{ ref: "topic:vision", seconds: 1 }] },
    { action: "tour", stops: [{ ref: "topic:vision", seconds: 31 }] },
    { action: "tour", stops: [{ ref: "topic:vision", view: { camera: { focus: "v1", frame: ["lgn"] } } }] },
    { action: "tour", stops: [{ ref: "topic:vision", duration: 5 }] },
  ],
  set_view: [
    { camera: { focus: "v1", frame: ["lgn"] } },
    { camera: { focus: "V1" } },
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
    assert.equal(result.error.code, "not_available", name);
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

test("encodeResult switches between a plain object and MCP-style content", () => {
  const result = { at: "overview", said: "Opened the overview." };
  assert.equal(encodeResult(result, "object"), result);
  const content = encodeResult(result, "content");
  assert.deepEqual(content, { content: [{ type: "text", text: JSON.stringify(result) }] });
  assert.deepEqual(decodeResult(content), result);
  assert.deepEqual(decodeResult(result), result);
  assert.equal(encodeResult({ error: { code: "bad_input", message: "x" } }, "content").isError, true);
  assert.equal(resultFormat(""), "object");
  assert.equal(resultFormat("?agent=shim&agent-result=content"), "content");
});

test("registration gives every tool its schema and readOnlyHint, and aborting unregisters", async () => {
  const registered = new Map();
  const modelContext = {
    registerTool(tool, { signal }) {
      registered.set(tool.name, tool);
      signal.addEventListener("abort", () => registered.delete(tool.name));
    },
  };
  const { runner } = setup();
  const controller = new AbortController();
  registerTools(modelContext, runner, controller.signal, "content");
  assert.deepEqual(
    [...registered.keys()],
    tools.map((tool) => tool.name),
  );
  for (const tool of tools) assert.equal(registered.get(tool.name).annotations.readOnlyHint, tool.readOnly);
  const encoded = await registered.get("read").execute({ ref: "help" });
  assert.deepEqual(decodeResult(encoded), { ref: "help" });
  assert.deepEqual(Object.keys(toolDefinition(tools[0], runner)), ["name", "title", "description", "inputSchema", "annotations", "execute"]);
  controller.abort();
  assert.equal(registered.size, 0);
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
  const walk = inputSchema(tools.find((tool) => tool.name === "walkthrough").input);
  const stop = walk.properties.stops.items;
  assert.deepEqual([walk.properties.stops.minItems, walk.properties.stops.maxItems], [1, 20]);
  assert.deepEqual(Object.keys(stop.properties), ["ref", "view", "say", "seconds"]);
  assert.deepEqual([stop.properties.seconds.minimum, stop.properties.seconds.maximum, stop.properties.say.maxLength], [2, 30, 280]);
  assert.deepEqual(stop.properties.view, { ...schema, description: stop.properties.view.description }, "Tour stops take the same ViewPatch.");
});

test("set_view and tour errors say what to fix", async () => {
  const message = async (name, args) => (await setup().runner.call(name, args)).error.message;
  assert.equal(await message("set_view", { camera: { focus: "v1", frame: ["lgn"] } }), "camera: focus and frame cannot be used together; use one");
  assert.match(await message("set_view", { camera: { focus: "V1" } }), /^camera\.focus: unknown region id "V1"; closest: v1/);
  assert.match(await message("set_view", { camera: { focus: "visual cortex" } }), /closest: .*\bv1\b/);
  assert.match(await message("set_view", { isolate: ["lgn", "nope"] }), /^isolate\.1: unknown region id "nope"/, "The list form's own error, not the union's.");
  assert.match(await message("set_view", { isolate: { regions: ["v1"], keep: 2 } }), /^isolate\.keep: /);
  assert.equal(await message("set_view", { isolate: "v1" }), "isolate: isolate takes a list of region ids, { regions, keep }, or null");
  assert.match(await message("set_view", { layers: { brain: 0 } }), /^layers: Unrecognized key: "brain"/);
  assert.equal(
    await message("walkthrough", { action: "tour", stops: [{ view: { camera: { focus: "v1", frame: ["lgn"] } } }] }),
    "stops.0.view.camera: focus and frame cannot be used together; use one",
  );
  assert.equal(await message("walkthrough", { action: "tour" }), "stops: tour needs stops");
  assert.equal(await message("walkthrough", { action: "next", stops: [{ say: "Hi" }] }), "stops: stops applies to tour, not next");
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
