// The explorer controller (src/ui/explorer.ts) on the real page template and the DOM stub: the navigation
// state machine, hash routing (including malformed links), the walkthrough timer and keyboard focus.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, mock, test } from "node:test";
import { build } from "esbuild";
import { click, installDom, label, StubEvent, settle } from "./dom-stub.mjs";

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
const { createExplorer, createState, pathways, placeHash, hostTopic, regions } = await bundle(`
  export { createExplorer } from "./src/ui/explorer.ts";
  export { createState } from "./src/state.ts";
  export { pathways } from "./src/content/pathways.ts";
  export { placeHash } from "./src/model/refs.ts";
  export { hostTopic } from "./src/model/topics.ts";
  export { regions } from "./src/content/regions.ts";
`);
const page = await readFile("src/index.html", "utf8");
const topic = (id) => pathways.find((path) => path.id === id);

let dom, state, explorer, events, sceneCalls;
function start(url = "http://localhost:8769/") {
  dom = installDom(page, { url });
  state = createState(false);
  explorer = createExplorer(state, dom.media("(prefers-reduced-motion: reduce)"));
  sceneCalls = [];
  const record =
    (name) =>
    (...args) =>
      sceneCalls.push([name, ...args]);
  explorer.attachScene({
    focusRegion: record("focusRegion"),
    sendVolley: record("sendVolley"),
    reset: record("reset"),
    previewRegion: record("previewRegion"),
    endPreview: record("endPreview"),
  });
  events = [];
  explorer.onEvent((event) => events.push(event));
}
beforeEach(() => start());
afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

const byId = (id) => dom.document.getElementById(id);
const place = () => explorer.snapshot().place;
const active = () => label(dom.document.activeElement);

/* ---------- Navigation ---------- */

test("the overview: intro shown, topic view hidden, Overview pressed, no hash", async () => {
  explorer.restore("");
  await settle();
  assert.deepEqual(place(), { kind: "overview" });
  assert.equal(byId("intro-view").hidden, false);
  assert.equal(byId("path-view").hidden, true);
  assert.equal(byId("home-button").getAttribute("aria-pressed"), "true");
  assert.equal(dom.location.hash, "");
  assert(sceneCalls.some(([name]) => name === "reset"));
});

test("selecting a topic opens its walkthrough at step 1 and marks it in the rail", async () => {
  explorer.selectPath("vision");
  await settle();
  const vision = topic("vision");
  assert.equal(state.overview, false);
  assert.equal(state.path, "vision");
  assert.equal(state.step, 0);
  assert.equal(state.selected, vision.steps[0].region);
  assert.equal(byId("path-title").textContent, vision.title);
  assert.equal(byId("path-steps").children.length, vision.steps.length);
  assert.equal(byId("step-toggle-0").getAttribute("aria-expanded"), "true");
  assert.equal(byId("streams-tab").hidden, true, "Only Attention has a Streams tab.");
  const rail = byId("pathway-list").querySelector('[data-path="vision"]');
  assert.equal(rail.getAttribute("aria-pressed"), "true");
  assert.equal(byId("home-button").getAttribute("aria-pressed"), "false");
  assert.equal(dom.location.hash, `#/vision/${vision.steps[0].key}`);
  assert.deepEqual(
    sceneCalls.find(([name]) => name === "focusRegion"),
    ["focusRegion", vision.steps[0].region, true],
  );
});

test("steps are clamped to the topic, and the step controls follow", () => {
  explorer.selectPath("hearing");
  const last = topic("hearing").steps.length - 1;
  explorer.setStep(-4);
  assert.equal(state.step, 0);
  assert.equal(byId("step-prev").disabled, true);
  assert.equal(byId("step-next").disabled, false);
  explorer.setStep(999);
  assert.equal(state.step, last);
  assert.equal(byId("step-next").disabled, true);
  assert.equal(byId("step-progress").children[last].getAttribute("aria-current"), "step");
  assert.equal(byId(`step-toggle-${last}`).getAttribute("aria-current"), "step");
  assert.equal(byId("step-toggle-0").getAttribute("aria-current"), "false");
  assert(byId("path-steps").children[0].classList.contains("done"));
});

test("the Streams tab belongs to Attention and turns the step spotlight off", async () => {
  explorer.showStreams();
  await settle();
  assert.deepEqual(place(), { kind: "streams" });
  assert.equal(state.path, "attention");
  assert.equal(byId("streams-tab").hidden, false);
  assert.equal(byId("sensory-controls").hidden, false);
  assert.equal(byId("step-controls").hidden, true);
  assert.equal(state.spotlight, false);
  assert.equal(dom.location.hash, "#/attention/streams");
  explorer.goTo({ kind: "step", path: "attention", index: 1 });
  assert.equal(state.spotlight, true);
  assert.equal(byId("sensory-controls").hidden, true);
});

test("a region from the overview opens in the topic that teaches it, with focus on its title", () => {
  explorer.restore("");
  explorer.showRegion("v1");
  assert.equal(state.overview, false);
  assert.equal(state.path, hostTopic("v1").id);
  assert.equal(state.selected, "v1");
  assert.deepEqual(place(), { kind: "region", path: state.path, id: "v1" });
  assert.equal(byId("region-drawer").hidden, false);
  assert.equal(byId("guide-panel").hidden, true);
  assert.equal(active(), "<h2#path-title>");
});

test("a region opens as a page of the panel: its name and place in the header, no tabs, a way back", () => {
  explorer.selectPath("vision");
  explorer.showRegion("lgn");
  assert.equal(byId("path-title").textContent, regions.lgn.label);
  assert.equal(byId("path-subtitle").textContent, regions.lgn.where);
  assert.equal(byId("panel-tabs").hidden, true);
  assert.equal(byId("region-drawer").getAttribute("role"), "region");
  assert.equal(byId("region-drawer").getAttribute("aria-labelledby"), "path-title");
  assert.equal(byId("back-label").textContent, `Vision / Step ${state.step + 1}`);
  assert.equal(byId("drawer-content").querySelector("[data-region-list], [data-back-guide], #drawer-title"), null, "The header is the only way back.");
  // Back on the topic page, the header names the topic again.
  explorer.goTo({ kind: "step", path: "vision", index: 0 });
  assert.equal(byId("path-title").textContent, topic("vision").title);
  assert.equal(byId("panel-tabs").hidden, false);
  assert.equal(byId("back-label").textContent, "Overview");
  assert.equal(byId("region-drawer").getAttribute("role"), "tabpanel");
});

test("the overview lists the topics without icons or a heading, the introduction after them", () => {
  explorer.restore("");
  const intro = byId("intro-scroll");
  const rows = intro.querySelectorAll(".journey");
  assert.equal(rows.length, pathways.length);
  assert.equal(intro.querySelectorAll(".journey svg.journey-icon").length, 0);
  assert.equal(intro.querySelectorAll("h3").length, 0, "No Topics heading.");
  // The title stays in the fixed header; the list comes first in the scrolling part, then the introduction.
  assert.equal(byId("intro-title").textContent, "Perception & Attention");
  assert(byId("intro-view").querySelector(".inspector-heading").contains(byId("intro-title")));
  const order = intro.querySelectorAll(".journey-list, .intro-lede-block").map((node) => node.className);
  assert.deepEqual(order, ["journey-list", "intro-lede-block"]);
  // One line per topic: its number and name.
  assert.equal(rows[0].textContent.trim(), `1. ${pathways[0].title}`);
  // Each row's topic is the rail button beside it, in the same order.
  const railOrder = byId("pathway-list")
    .querySelectorAll("button")
    .map((button) => button.dataset.path);
  assert.deepEqual(
    rows.map((row) => row.dataset.path),
    railOrder,
  );
});

test("goTo reaches every kind of place, and snapshot reports it", () => {
  const vision = topic("vision");
  const cases = [
    [
      { kind: "step", path: "vision", index: 3 },
      { kind: "step", path: "vision", index: 3 },
    ],
    [
      { kind: "regions", path: "touch" },
      { kind: "regions", path: "touch" },
    ],
    [
      { kind: "region", path: "hearing", id: "soc" },
      { kind: "region", path: "hearing", id: "soc" },
    ],
    // No topic: stay in the current one if it covers the region.
    [
      { kind: "region", path: null, id: "cochlea" },
      { kind: "region", path: "hearing", id: "cochlea" },
    ],
    // No topic, and the current one does not cover it: its host topic.
    [
      { kind: "region", path: null, id: vision.steps[2].region },
      { kind: "region", path: "vision", id: vision.steps[2].region },
    ],
    [{ kind: "streams" }, { kind: "streams" }],
    [{ kind: "overview" }, { kind: "overview" }],
  ];
  for (const [target, expected] of cases) {
    explorer.goTo(target);
    assert.deepEqual(place(), expected, JSON.stringify(target));
  }
});

test("each navigation is reported once, after it settles, with the place's ref", async () => {
  explorer.selectPath("touch");
  explorer.setStep(2);
  await settle();
  assert.deepEqual(events, [{ kind: "navigated", ref: `step:touch/${topic("touch").steps[2].key}`, auto: false }]);
  events.length = 0;
  explorer.setStep(2);
  await settle();
  assert.deepEqual(events, [], "Same place: nothing to report.");
});

/* ---------- Hash routing ---------- */

test("a link's hash opens the step, region, region list or streams it names", () => {
  const vision = topic("vision");
  const cases = [
    [`#/vision/${vision.steps[2].key}`, { kind: "step", path: "vision", index: 2 }],
    ["#/vision/3", { kind: "step", path: "vision", index: 2 }],
    ["#/Hearing/Region/SOC", { kind: "region", path: "hearing", id: "soc" }],
    ["#/vision/regions", { kind: "regions", path: "vision" }],
    ["#/attention/streams", { kind: "streams" }],
    ["#/overview", { kind: "overview" }],
  ];
  for (const [hash, expected] of cases) {
    start(`http://localhost:8769/${hash}`);
    explorer.restore(dom.location.hash);
    assert.deepEqual(place(), expected, hash);
  }
});

test("a malformed or unknown hash opens the overview instead of stopping startup", () => {
  // Whether parseHash throws on a bad escape (and the explorer warns) or returns null, the result is the same.
  mock.method(console, "warn", () => {});
  for (const hash of ["#/vision/%E0%A4%A", "#/%", "#/%zz/", "#/nowhere/at-all", "#/vision/region/nope", "#/vision/a/b/c"]) {
    start(`http://localhost:8769/${hash}`);
    assert.doesNotThrow(() => explorer.restore(dom.location.hash), hash);
    assert.deepEqual(place(), { kind: "overview" }, hash);
  }
});

test("hashchange navigates to a new place and ignores links it cannot read", async () => {
  explorer.restore("");
  const touch = topic("touch");
  dom.location.hash = `#/touch/${touch.steps[1].key}`;
  dom.window.dispatchEvent(new StubEvent("hashchange"));
  assert.deepEqual(place(), { kind: "step", path: "touch", index: 1 });
  mock.method(console, "warn", () => {});
  dom.location.hash = "#/touch/%E0%A4%A";
  assert.doesNotThrow(() => dom.window.dispatchEvent(new StubEvent("hashchange")));
  assert.deepEqual(place(), { kind: "step", path: "touch", index: 1 });
  await settle();
  assert.equal(dom.location.hash, `#/touch/${touch.steps[1].key}`, "The hash goes back to the place shown.");
});

test("the hash follows the place, and is written once per task", async () => {
  explorer.selectPath("speech");
  explorer.setStep(1);
  explorer.goTo({ kind: "regions", path: "speech" });
  assert.equal(dom.location.hash, "", "Not written mid-task.");
  await settle();
  assert.equal(dom.location.hash, placeHash({ kind: "regions", path: "speech" }));
});

/* ---------- Walkthrough timer ---------- */

test("Play advances one step per interval and stops with a toast at the end", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  explorer.selectPath("loop");
  await settle();
  events.length = 0;
  const steps = topic("loop").steps.length;
  explorer.startWalk(4);
  assert.equal(explorer.walking, true);
  assert.equal(byId("step-play").getAttribute("aria-pressed"), "true");
  assert.equal(byId("step-play-label").textContent, "Pause");
  assert(byId("step-progress").classList.contains("playing"));
  assert.deepEqual(events.shift(), { kind: "played", ref: `step:loop/${topic("loop").steps[0].key}`, auto: false });
  for (let step = 1; step < steps; step++) {
    mock.timers.tick(4000);
    await settle();
    assert.equal(state.step, step);
    assert.equal(explorer.walking, true);
    assert.deepEqual(events.shift(), { kind: "navigated", ref: `step:loop/${topic("loop").steps[step].key}`, auto: true });
  }
  mock.timers.tick(4000);
  assert.equal(explorer.walking, false);
  assert.equal(byId("toast").textContent, "End of this topic.");
  assert.equal(byId("step-play-label").textContent, "Play");
  assert.equal(events.shift().kind, "paused");
});

test("Play at the last step starts again from step 1; on the overview it does nothing", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  explorer.startWalk();
  assert.equal(explorer.walking, false, "No walkthrough on the overview.");
  explorer.selectPath("vision");
  explorer.setStep(99);
  explorer.startWalk();
  assert.equal(state.step, 0);
  assert.equal(explorer.walking, true);
});

test("a user navigation stops the walk and reports the pause as the user's", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  explorer.selectPath("vision");
  explorer.startWalk(5);
  events.length = 0;
  explorer.setStep(3);
  assert.equal(explorer.walking, false);
  assert.deepEqual(events.shift(), { kind: "paused", ref: `step:vision/${topic("vision").steps[3].key}`, auto: false });
  mock.timers.tick(20_000);
  assert.equal(state.step, 3, "The old timer no longer fires.");
});

/* ---------- Keyboard focus ---------- */

test("Back on a region picked in the Regions list returns to the list, with focus on that region", async () => {
  explorer.selectPath("vision");
  click(byId("region-tab"));
  click(byId("drawer-content").querySelector('[data-open-region="lgn"]'));
  await settle();
  assert.deepEqual(place(), { kind: "region", path: "vision", id: "lgn" });
  assert.equal(byId("back-label").textContent, "Vision / Regions");
  click(byId("back-link"));
  await settle();
  assert.deepEqual(place(), { kind: "regions", path: "vision" });
  assert.equal(byId("path-title").textContent, topic("vision").title);
  assert.equal(active(), "<button.region-row.current>");
  assert.equal(dom.document.activeElement.dataset.openRegion, "lgn");
});

test("Back on a region opened from a step returns to that step, with focus on it", async () => {
  const vision = topic("vision");
  explorer.selectPath("vision");
  explorer.setStep(3);
  click(byId("path-steps").children[3].querySelector(".step-region-link"));
  await settle();
  assert.deepEqual(place(), { kind: "region", path: "vision", id: vision.steps[3].region });
  assert.equal(byId("back-label").textContent, "Vision / Step 4");
  click(byId("back-link"));
  await settle();
  assert.deepEqual(place(), { kind: "step", path: "vision", index: 3 });
  assert.equal(active(), "<button#step-toggle-3.step-toggle>");
});

test("a region linked from another region's page opens in its place and keeps the way back", async () => {
  explorer.selectPath("vision");
  click(byId("region-tab"));
  click(byId("drawer-content").querySelector('[data-open-region="lgn"]'));
  await settle();
  const link = byId("drawer-content").querySelector("button.region-mention[data-region]");
  const target = link.dataset.region;
  click(link);
  await settle();
  assert.equal(place().id, target);
  assert.equal(byId("path-title").textContent, regions[target].label);
  assert.equal(byId("back-label").textContent, "Vision / Regions");
});

test("Back on a topic page goes to the overview", async () => {
  explorer.selectPath("hearing");
  click(byId("back-link"));
  await settle();
  assert.deepEqual(place(), { kind: "overview" });
  assert.equal(active(), "<button#home-button.rail-button>");
});

test("opening a region from a step keeps focus on the region's title", async () => {
  explorer.selectPath("hearing");
  click(byId("path-steps").querySelector(".step-region-link"));
  await settle();
  assert.equal(active(), "<h2#path-title>");
});

test("a topic switch while a step has focus moves focus to the new topic's first step", async () => {
  explorer.selectPath("vision");
  explorer.setStep(2);
  byId("step-toggle-2").focus();
  explorer.selectPath("touch");
  await settle();
  assert.equal(active(), "<button#step-toggle-0.step-toggle>");
  assert.equal(byId("path-title").textContent, topic("touch").title);
});

test("a stream's Topic button opens that walkthrough with focus on its first step", async () => {
  explorer.showStreams();
  click(byId("sensory-streams").querySelector('[data-study="hearing"]'));
  await settle();
  assert.equal(state.path, "hearing");
  assert.equal(active(), "<button#step-toggle-0.step-toggle>");
});

test("focus the user moved out of the panel is left alone", async () => {
  explorer.selectPath("vision");
  byId("step-toggle-0").focus();
  byId("about-button").focus();
  explorer.selectPath("speech");
  await settle();
  assert.equal(active(), "<button#about-button.rail-button.rail-tool>");
  // A click on empty space (the 3D view) blurs the control; a later navigation does not pull focus back.
  byId("step-toggle-0").focus();
  dom.document.activeElement.blur();
  explorer.selectPath("loop");
  await settle();
  assert.equal(active(), "<body>");
});

/* ---------- Page structure ---------- */

test("the rail, the panel and the 3D view come in screen order, so Tab follows the layout", () => {
  const order = dom.document.querySelectorAll("nav.rail, #inspector, #region-labels").map((node) => label(node));
  assert.deepEqual(order, ["<nav#rail.rail>", "<aside#inspector.inspector>", "<div#region-labels>"]);
  // The scene takes label clicks and drags through the orbit surface, so the labels stay inside it.
  assert(byId("orbit-surface").contains(byId("region-labels")));
  assert.equal(byId("region-labels").getAttribute("role"), "group", "An aria-label needs a role to be read.");
  // The rail's buttons are icons; each is named for assistive tech and carries its tooltip text.
  for (const button of byId("rail").querySelectorAll("button")) {
    assert(button.getAttribute("aria-label"), label(button));
    assert.equal(button.dataset.tip, button.getAttribute("aria-label"));
  }
});
