// Stage 2 tools end to end in Node: set_view, start_tour, walkthrough stop, get_context.view/tour and the view
// reset on navigation, through the real tool runner, GuideApi, view API and tour runner. The scene,
// explorer, caption bar and clock are fakes.
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
const m = await bundle(`
  export { tools } from "./src/agent/tools/index.ts";
  export { createToolRunner } from "./src/agent/webmcp.ts";
  export { createGuideApi } from "./src/api/guide-api.ts";
  export { createActivityLog } from "./src/api/activity.ts";
  export { createTourRunner } from "./src/api/tour.ts";
  export { createViewApi } from "./src/api/view-api.ts";
  export { createState } from "./src/state.ts";
  export { anglesFromDirection, clearViewOnNavigate, defaultLayers, focusPreset, frameFit, stageFov } from "./src/model/view.ts";
  export { pathways, regions } from "./src/content/index.ts";
`);
const { tools, createToolRunner, createGuideApi, createActivityLog, createTourRunner, createViewApi, createState, pathways, regions } = m;
const { anglesFromDirection, clearViewOnNavigate, defaultLayers, focusPreset, frameFit, stageFov } = m;
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const topic = (id) => pathways.find((path) => path.id === id);

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
      focusPreset(id, 0.4, target, direction);
      return { target, ...anglesFromDirection(direction), distance: 11.2 };
    },
    frameRegions(ids) {
      const fit = frameFit(
        ids.map((id) => regions[id].position),
        stageFov(1.6),
        1.6,
      );
      return { target: fit.target, distance: fit.distance };
    },
    setPose(next) {
      this.current = { ...this.current, ...next };
    },
    snapLayers() {},
  };
}

/** The explorer's navigation, reduced to what GuideApi sees; it resets the view as ui/explorer.ts does. */
function fakeExplorer(state) {
  const s = { panel: "guide", region: null, walking: false, seconds: 5.5 };
  const calls = [];
  const place = () => {
    if (state.overview) return { kind: "overview" };
    if (s.panel === "streams") return { kind: "streams" };
    if (s.panel === "region") return s.region ? { kind: "region", path: state.path, id: s.region } : { kind: "regions", path: state.path };
    return { kind: "step", path: state.path, index: state.step };
  };
  // Selecting a region in 3D clears an agent's view focus (scene.focusRegion).
  const select = (id) => Object.assign(state, { selected: id, viewFocus: null });
  function selectPath(path, step = 0) {
    clearViewOnNavigate(state, { overview: false, path });
    Object.assign(state, { overview: false, path, step });
    select(topic(path).steps[step].region);
  }
  return {
    calls,
    state: s,
    snapshot: () => ({ overview: state.overview, path: state.path, step: state.step, selected: state.selected, ...s, place: place() }),
    goTo(target, options) {
      calls.push([target.kind === "overview" ? "overview" : `${target.kind}:${target.path ?? ""}/${target.index ?? target.id ?? ""}`, options]);
      s.walking = false;
      s.region = null;
      s.panel = "guide";
      if (target.kind === "overview") {
        clearViewOnNavigate(state, { overview: true });
        Object.assign(state, { overview: true, path: "attention" });
        select("pfc");
      } else if (target.kind === "step") {
        if (state.overview || state.path !== target.path) selectPath(target.path, target.index);
        else {
          state.step = target.index;
          select(topic(target.path).steps[target.index].region);
        }
      } else if (target.kind === "streams") {
        if (state.overview || state.path !== "attention") selectPath("attention");
        s.panel = "streams";
      } else if (target.kind === "region") {
        const host = target.path ?? pathways.find((path) => path.steps.some((step) => step.region === target.id)).id;
        if (state.overview || state.path !== host) selectPath(host);
        Object.assign(s, { panel: "region", region: target.id });
        select(target.id);
      }
    },
    startWalk(seconds) {
      Object.assign(s, { walking: true, seconds });
    },
    stopWalk() {
      s.walking = false;
    },
    selection: () => null,
  };
}

function fakeClock() {
  let now = 0,
    nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(run, ms) {
      timers.set(nextId, { run, at: now + ms });
      return nextId++;
    },
    clearTimeout: (id) => timers.delete(id),
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = end;
    },
  };
}

function setup() {
  const state = createState(false);
  const scene = fakeScene();
  const view = createViewApi(state, scene);
  const explorer = fakeExplorer(state);
  const clock = fakeClock();
  const narration = {
    shown: null,
    show(stop) {
      this.shown = { ...stop };
    },
    setPaused(paused) {
      if (this.shown) this.shown.paused = paused;
    },
    hide() {
      this.shown = null;
    },
  };
  const tour = createTourRunner({ narration, clock });
  const about = { open() {}, close() {}, tab: () => null };
  const activity = createActivityLog({ now: () => 0 });
  const api = createGuideApi({ explorer, about, activity, playing: () => true, agentControl: () => true, view, tour, now: () => 0 });
  const toasts = [];
  const presence = { begin() {}, end: (said, undo) => toasts.push({ said, undo }) };
  const runner = createToolRunner({ tools, api, control: { on: true }, presence, activity });
  return { state, scene, view, explorer, clock, narration, tour, api, runner, toasts, call: (name, args) => runner.call(name, args) };
}

/* ---------- set_view ---------- */

test("set_view applies a patch in one call and says what changed", async () => {
  const { state, call, toasts, view } = setup();
  const result = await call("set_view", { camera: { frame: ["lgn", "v1"], from: "left" }, layers: { skull: 0 }, isolate: ["lgn", "v1"] });
  assert.match(result.said, /^Framed LGN and V1 from the left at [\d.]+×; skull dissolved; isolated LGN and V1, dissolved the rest\.$/);
  assert.deepEqual(Object.keys(result), ["view", "said"], "No undo or skipped in the agent's result.");
  assert.deepEqual(result.view.frame, ["lgn", "v1"]);
  assert.deepEqual([result.view.yaw, result.view.pitch], [90, 10]);
  assert.deepEqual(result.view.isolate, { regions: ["lgn", "v1"], keep: 0.08 });
  assert.deepEqual(state.isolate, { regions: ["lgn", "v1"], keep: 0.08 });
  assert(bytes(result) < 2048);
  const said = async (patch) => (await call("set_view", patch)).said;
  assert.equal(await said({ layers: { cortex: 0.3, cerebellum: 0.3 }, effect: "fade" }), "Cortex and cerebellum at 30%.");
  assert.equal(await said({ layers: { skull: 1 }, effect: "dissolve" }), "Skull restored.");
  assert.equal(await said({ labels: "none" }), "Labels hidden.");
  assert.equal(await said({ isolate: null, labels: "auto" }), "Stopped isolating; labels back to the topic's own.");
  assert.match(await said({ camera: { focus: "tpj" } }), /^Focused on TPJ at [\d.]+×\.$/);
  assert.match(await said({ camera: { from: "top", zoom: 2 } }), /^Now viewing from above at 2×\.$/);
  assert.equal(await said({}), "View unchanged.");
  // The toast offers Undo for each change; it goes back one view.
  assert.equal(toasts.at(-2).undo.label, "Back to previous view");
  assert.equal(toasts.at(-1).undo, undefined, "An unchanged view has nothing to undo.");
  const depth = view.depth;
  toasts.at(-2).undo.run();
  assert.equal(view.depth, depth - 1);
  assert.equal(state.viewFocus, "tpj", "Back to the view before the last change.");
  toasts.at(-2).undo.run();
  assert.equal(view.depth, depth - 1, "A toast's Undo works once, and only while its change is the latest.");
});

test("focus and frame together are rejected, and nothing changes", async () => {
  const { state, call, api, view } = setup();
  const before = JSON.stringify(state);
  const result = await call("set_view", { camera: { focus: "v1", frame: ["lgn"] }, layers: { skull: 0 } });
  assert.equal(result.error.code, "bad_input");
  assert.match(result.error.message, /focus and frame cannot be used together/);
  // Callers that skip the tool schema get the same answer from the view API.
  const direct = api.setView({ camera: { focus: "v1", frame: ["lgn"] } });
  assert.equal(direct.error.code, "bad_input");
  assert.match(direct.error.message, /camera\.focus and camera\.frame cannot be used together/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(view.depth, 0);
});

test("mid-gesture the camera part returns locked_by_user and the rest applies", async () => {
  const { state, scene, call, toasts } = setup();
  scene.gesturing = true;
  const cameraOnly = await call("set_view", { camera: { from: "left" } });
  assert.deepEqual(cameraOnly, { error: { code: "locked_by_user", message: "The user is moving the view, so the camera was left as it is." } });
  assert.equal(toasts.at(-1).said, undefined, "A failed call shows no toast.");
  const mixed = await call("set_view", { camera: { from: "left" }, labels: "all", layers: { skull: 0 } });
  assert.equal(mixed.skipped.camera.code, "locked_by_user");
  assert.equal(mixed.said, "Kept the camera still while you move it; skull dissolved; all labels shown.");
  assert.equal(state.labelMode, "all");
  assert.equal(scene.current.yaw, 60.6, "The camera did not move.");
});

test("set_view without a 3D view is not_available", () => {
  const explorer = fakeExplorer(createState(false));
  const api = createGuideApi({ explorer, about: { tab: () => null }, activity: createActivityLog(), playing: () => true, agentControl: () => true });
  assert.equal(api.setView({ labels: "all" }).error.code, "not_available");
  assert.equal(api.context().view, undefined);
  assert.equal(api.context().tour, undefined);
  assert.equal(api.tour({ stops: [{ say: "Hi" }] }).error.code, "not_available");
});

/* ---------- get_context and go ---------- */

test("get_context.view and go's view report the settled view: focus, angles, zoom, effective layers, gated", async () => {
  const { call } = setup();
  const overview = await call("get_context", {});
  assert.deepEqual(overview.view, { yaw: 61, pitch: 14, zoom: 1 });
  const went = await call("go", { ref: "topic:vision" });
  assert.deepEqual(Object.keys(went), ["at", "title", "n", "of", "walking", "said", "brief", "view"]);
  assert.deepEqual(went.view.gated, ["ears", "auditory_nerve", "temporal_bone"]);
  await call("set_view", { camera: { focus: "lgn", zoom: 2 }, layers: { skull: 0.5 }, isolate: ["lgn", "v1"], labels: "focus" });
  const { view } = await call("get_context", {});
  assert.deepEqual(Object.keys(view), ["focus", "yaw", "pitch", "zoom", "layers", "isolate", "labels", "gated"]);
  assert.equal(view.focus, "lgn");
  assert.equal(view.zoom, 2);
  // Effective presence = min(setting, isolate keep) × the zoom fade at 2× (skull 0.12, cortex 0.3).
  assert.equal(view.layers.skull, 0.01);
  assert.equal(view.layers.cortex, 0.02);
  assert.equal(view.layers.routes, undefined, "Routes are filtered per region, not dimmed as a layer.");
  assert.deepEqual(view.isolate, { regions: ["lgn", "v1"], keep: 0.08 });
  assert.deepEqual(view.gated, ["ears", "auditory_nerve", "temporal_bone"]);
});

/* ---------- Tours ---------- */

const STOPS = [
  { ref: "step:vision/1", say: "Light lands on the retina." },
  { ref: "overview", view: { isolate: ["lgn", "v1"], camera: { frame: ["lgn", "v1"], from: "left" } }, say: "LGN relays to V1.", seconds: 4 },
  { ref: "topic:hearing", say: "Now hearing.", seconds: 2 },
];

test("a tour goes to each stop in order, then applies its view, with the caption n/N", async () => {
  const { state, explorer, clock, narration, tour, call } = setup();
  // main.ts leaves navigation out of the user's activity while the tour is driving.
  const driving = [];
  const goTo = explorer.goTo;
  explorer.goTo = (...args) => {
    driving.push(tour.driving);
    goTo(...args);
  };
  const started = await call("start_tour", { stops: STOPS });
  assert.equal(started.said, "Started a 3-stop tour, about 12 s.");
  assert.deepEqual(started.tour, { stop: 1, of: 3, paused: false });
  assert.equal(started.at, `step:vision/${topic("vision").steps[0].key}`);
  assert(started.view && bytes(started) < 2048);
  assert.deepEqual(narration.shown, { text: "Light lands on the retina.", stop: 1, of: 3, paused: false });
  assert.deepEqual(explorer.calls, [["step:vision/0", { camera: true, section: undefined }]]);
  clock.tick(5999);
  assert.equal(explorer.calls.length, 1, "Stop 1 lasts the default 6 s.");
  clock.tick(1);
  assert.equal(explorer.calls.at(-1)[0], "overview");
  assert.deepEqual(state.isolate, { regions: ["lgn", "v1"], keep: 0.08 }, "Going home resets the view, then the stop's own view applies.");
  assert.deepEqual(narration.shown, { text: "LGN relays to V1.", stop: 2, of: 3, paused: false });
  assert.deepEqual((await call("get_context", {})).tour, { stop: 2, of: 3, paused: false });
  clock.tick(4000);
  assert.equal(explorer.calls.at(-1)[0], "step:hearing/0");
  assert.equal(state.isolate, null, "A stop without a view leaves the reset in place.");
  clock.tick(2000);
  assert.equal(narration.shown, null, "The caption closes after the last stop.");
  assert.equal((await call("get_context", {})).tour, undefined);
  assert.deepEqual(driving, [true, true, true], "Every stop navigates while the tour is driving.");
  await call("go", { ref: "topic:touch" });
  assert.equal(driving.at(-1), false, "The agent's own go is not tour navigation.");
});

test("user input pauses the tour; walkthrough controls act on it; stop clears the caption", async () => {
  const { clock, narration, tour, explorer, call } = setup();
  await call("start_tour", { stops: STOPS });
  clock.tick(1000);
  tour.pause("user");
  assert.deepEqual((await call("get_context", {})).tour, { stop: 1, of: 3, paused: true });
  assert.equal(narration.shown.paused, true);
  clock.tick(60_000);
  assert.equal(explorer.calls.length, 1, "Paused: the tour waits.");
  assert.equal((await call("walkthrough", { action: "pause" })).said, "The tour was already paused at stop 1 of 3.");
  assert.equal((await call("walkthrough", { action: "play" })).said, "Resumed the tour at stop 1 of 3.");
  clock.tick(5000);
  assert.equal(explorer.calls.length, 2, "Resuming finishes the 5 s left on stop 1.");
  assert.equal((await call("walkthrough", { action: "next" })).said, "Tour stop 3 of 3.");
  assert.equal((await call("walkthrough", { action: "prev" })).said, "Back to tour stop 2 of 3.");
  const stopped = await call("walkthrough", { action: "stop" });
  assert.equal(stopped.said, "Ended the tour at stop 2 of 3.");
  assert.equal(stopped.tour, undefined);
  assert.equal(narration.shown, null);
  assert.equal(tour.active, false);
  assert.equal((await call("walkthrough", { action: "stop" })).said, "Nothing was playing.");
  const calls = explorer.calls.length;
  clock.tick(60_000);
  assert.equal(explorer.calls.length, calls, "Nothing runs after stop.");
});

test("go and a new walkthrough end a tour", async () => {
  const { tour, narration, call } = setup();
  await call("start_tour", { stops: STOPS });
  const went = await call("go", { ref: "region:mgn" });
  assert.match(went.said, / Ended the tour\.$/);
  assert.equal(tour.active, false);
  assert.equal(narration.shown, null);
  await call("start_tour", { stops: STOPS });
  const played = await call("walkthrough", { action: "play", ref: "topic:touch" });
  assert.match(played.said, /^Playing Touch step 1 .* Ended the tour\.$/);
  assert.equal(tour.active, false);
});

test("a bad stop rejects the whole tour before anything plays", async () => {
  const { explorer, narration, api, call } = setup();
  const unknown = await call("start_tour", { stops: [{ ref: "topic:vision" }, { ref: "region:visual cortex" }] });
  assert.equal(unknown.error.code, "unknown_ref");
  assert.match(unknown.error.message, /^stops\.1\.ref: /);
  assert.equal(unknown.error.options[0], "region:v1");
  const about = await call("start_tour", { stops: [{ ref: "about/papers" }] });
  assert.match(about.error.message, /^stops\.0\.ref: tour stops go to places in the guide/);
  const view = api.tour({ stops: [{ say: "Hi" }, { view: { camera: { focus: "v1", frame: ["v1"] } } }] });
  assert.match(view.error.message, /^stops\.1\.view: camera\.focus and camera\.frame/);
  assert.match(api.tour({ stops: [{}] }).error.message, /^stops\.0: give the stop a ref, a view or say text/);
  assert.equal(api.tour({ stops: Array.from({ length: 21 }, () => ({ say: "Hi" })) }).error.code, "limit");
  assert.equal(api.tour({ stops: [] }).error.code, "bad_input");
  assert.deepEqual(explorer.calls, []);
  assert.equal(narration.shown, null);
});

test("start_tour seconds is the default for stops without their own", async () => {
  const { clock, explorer, call } = setup();
  await call("start_tour", { seconds: 3, stops: [{ ref: "topic:vision" }, { ref: "topic:touch", seconds: 10 }, { ref: "overview" }] });
  clock.tick(3000);
  assert.equal(explorer.calls.length, 2);
  clock.tick(9999);
  assert.equal(explorer.calls.length, 2);
  clock.tick(1);
  assert.equal(explorer.calls.length, 3);
});

/* ---------- Navigation resets the agent's view ---------- */

test("going home or to another topic resets layers, isolate, labels and view focus; moving within a topic keeps them", async () => {
  const { state, call } = setup();
  const agentView = { layers: { skull: 0, cortex: 0.2 }, effect: "fade", isolate: ["lgn", "v1"], labels: "focus" };
  await call("go", { ref: "topic:vision" });
  await call("set_view", { ...agentView, camera: { focus: "lgn" } });
  assert.equal(state.viewFocus, "lgn");
  await call("go", { ref: "step:vision/3" });
  assert.deepEqual(state.isolate, { regions: ["lgn", "v1"], keep: 0.08 }, "A step in the same topic keeps the agent's view.");
  assert.equal(state.layers.skull, 0);
  assert.equal(state.labelMode, "focus");
  await call("go", { ref: "topic:hearing" });
  const defaults = () => {
    assert.deepEqual(state.layers, defaultLayers());
    assert.equal(state.layerEffect, "dissolve");
    assert.equal(state.isolate, null);
    assert.equal(state.labelMode, "auto");
    assert.equal(state.viewFocus, null);
  };
  defaults();
  await call("set_view", { ...agentView, camera: { focus: "mgn" } });
  await call("go", { ref: "overview" });
  defaults();
  // The rule itself, as the explorer applies it on Home and on a topic switch.
  const view = createState(false);
  Object.assign(view, { overview: false, path: "vision", isolate: { regions: ["v1"], keep: 0.08 }, labelMode: "none", viewFocus: "v1" });
  assert.equal(clearViewOnNavigate(view, { overview: false, path: "vision" }), false);
  assert.equal(view.labelMode, "none");
  assert.equal(clearViewOnNavigate(view, { overview: false, path: "touch" }), true);
  assert.equal(view.isolate, null);
  assert.equal(view.labels, true, "Labels are back on.");
  assert.equal(clearViewOnNavigate(view, { overview: true }), false, "Nothing left to reset.");
  view.layers = { ...view.layers, floor: 0 };
  assert.equal(clearViewOnNavigate(view, { overview: true }), true, "Home always resets, even from the overview.");
  assert.equal(view.layers.floor, 1);
});

test("typical Stage 2 results stay under 2 KB", async () => {
  const { call, clock } = setup();
  await call("start_tour", { stops: STOPS });
  clock.tick(6000);
  for (let i = 0; i < 5; i++) await call("set_view", { camera: { orbit: [10, 0] }, layers: { skull: 0.2, cortex: 0.4 } });
  const results = [
    await call("get_context", {}),
    await call("set_view", { camera: { frame: ["retina", "chiasm", "lgn", "v1", "pulvinar", "sc"], from: "top" }, isolate: ["retina", "chiasm", "lgn", "v1"] }),
    await call("go", { ref: "region:lgn" }),
  ];
  for (const result of results) assert(bytes(result) < 2048, `${bytes(result)} bytes: ${JSON.stringify(result).slice(0, 120)}`);
});
