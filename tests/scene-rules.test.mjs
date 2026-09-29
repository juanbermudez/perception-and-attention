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
  visionShown,
  hearingShown,
  gatedLayers,
  markerVisible,
  labelTarget,
  regionSpot,
  homeHighlightWeight,
  highlightWeight,
  ATTENTION_LABELS,
  CONTEXT_HIGHLIGHT,
  HOME_DIM,
  HOME_FOCUS,
  HOME_GLOW,
  SPOT_DIM_REGION,
} = await bundle(`
  export * from "./src/model/view.ts";
  export * from "./src/model/scene-rules.ts";
`);

/** A step inside a topic: `shown` selected, the listed regions touched by drawn routes. */
const inTopic = (path, shown, active = [], extra = {}) => ({
  pick: null,
  home: false,
  homeTopic: null,
  homeRegions: null,
  isolate: null,
  shown,
  focusActive: true,
  activeRegions: new Set(active),
  path,
  labelMode: "auto",
  labelsOn: true,
  spotOn: false,
  spotRegions: new Set(),
  ...extra,
});
const visible = (view, ids) => ids.filter((id) => markerVisible(id, view));
const labelled = (view, ids) => ids.filter((id) => labelTarget(id, view, markerVisible(id, view), true));

const senses = (vision, hearing) => ({ vision, hearing, touch: true });

test("the overview shows the eyes and ears whatever the Streams toggles", () => {
  const overview = { overview: true, path: "attention", enabledSenses: senses(false, false) };
  assert.equal(visionShown(overview), true);
  assert.equal(hearingShown(overview), true);
  assert.deepEqual(gatedLayers(overview), []);
});

test("inside Attention the Streams toggles gate the eyes and ears", () => {
  const streams = { overview: false, path: "attention", enabledSenses: senses(false, true) };
  assert.equal(visionShown(streams), false);
  assert.equal(hearingShown(streams), true);
  assert.deepEqual(gatedLayers(streams), ["eyes", "optic"]);
});

test("other topics show only their own sense organ", () => {
  const all = senses(true, true);
  assert.deepEqual(gatedLayers({ overview: false, path: "vision", enabledSenses: all }), ["ears", "auditory_nerve", "temporal_bone"]);
  assert.deepEqual(gatedLayers({ overview: false, path: "hearing", enabledSenses: all }), ["eyes", "optic"]);
  assert.deepEqual(gatedLayers({ overview: false, path: "touch", enabledSenses: all }), ["eyes", "optic", "ears", "auditory_nerve", "temporal_bone"]);
});

test("markers: the region shown and every region a drawn route touches", () => {
  const view = inTopic("vision", "lgn", ["retina", "chiasm", "lgn", "v1"]);
  assert.deepEqual(visible(view, ["retina", "lgn", "v1", "a1", "pfc"]), ["retina", "lgn", "v1"]);
});

test("markers: layers 5 and 6 only when shown, and then V1's own marker steps aside", () => {
  const onV1 = inTopic("loop", "v1", ["lgn", "v1", "l6", "l5", "trn"]);
  assert.deepEqual(visible(onV1, ["v1", "l5", "l6", "trn"]), ["v1", "trn"]);
  const onL6 = inTopic("loop", "l6", ["lgn", "v1", "l6", "l5", "trn"]);
  assert.deepEqual(visible(onL6, ["v1", "l5", "l6", "trn"]), ["l6", "trn"]);
});

test("markers: isolating keeps the isolated regions and the one shown", () => {
  const view = inTopic("vision", "v1", ["retina", "lgn", "v1"], { isolate: { regions: ["lgn", "mt"], keep: 0.08 } });
  assert.deepEqual(visible(view, ["retina", "lgn", "v1", "mt"]), ["lgn", "v1", "mt"]);
});

test("markers: the overview map shows only the previewed topic's regions", () => {
  const home = inTopic("attention", "pfc", ["v1", "a1"], { home: true, focusActive: false });
  assert.deepEqual(visible(home, ["v1", "a1", "pfc"]), []);
  const previewing = { ...home, homeTopic: "hearing", homeRegions: new Set(["cochlea", "a1"]) };
  assert.deepEqual(visible(previewing, ["v1", "a1", "cochlea", "pfc"]), ["a1", "cochlea"]);
});

test("markers and labels: pick mode offers exactly its regions, and none looks selected", () => {
  const view = inTopic("vision", "v1", ["v1", "lgn"], { pick: ["a1", "lgn"], labelMode: "focus" });
  assert.deepEqual(visible(view, ["v1", "lgn", "a1"]), ["lgn", "a1"]);
  assert.deepEqual(labelled(view, ["v1", "lgn", "a1"]), ["lgn", "a1"]);
});

test("labels: automatic sets per topic", () => {
  const hearing = inTopic("hearing", "mgn", ["brainstem", "brainstemR", "ic", "icR", "mgn", "mgnR"]);
  assert.deepEqual(labelled(hearing, ["brainstem", "brainstemR", "ic", "icR", "mgn", "mgnR"]), ["brainstem", "ic", "mgn"]);
  const attention = inTopic("attention", "insula", ["pfc", "insula", "cingulate", "v1", "lgn"]);
  assert.deepEqual(labelled(attention, ["pfc", "insula", "cingulate", "v1", "lgn"]), ["pfc", "insula", "v1"]);
  assert(!ATTENTION_LABELS.has("insula"), "the shown region is labelled even outside the set");
  // Previewing Attention from the overview uses the Attention set too.
  const home = { ...inTopic("attention", "pfc", [], { home: true, focusActive: false }), homeTopic: "attention", homeRegions: new Set(["pfc", "cingulate"]) };
  assert.deepEqual(labelled(home, ["pfc", "cingulate"]), ["pfc"]);
});

test("labels: modes, hidden markers and markers out of view", () => {
  const base = inTopic("hearing", "a1", ["mgn", "mgnR", "a1", "a1R"], { isolate: null });
  assert.deepEqual(labelled({ ...base, labelMode: "all" }, ["mgn", "mgnR", "a1"]), ["mgn", "mgnR", "a1"]);
  assert.deepEqual(labelled({ ...base, labelMode: "focus" }, ["mgn", "mgnR", "a1"]), ["a1"]);
  const isolating = { ...base, labelMode: "focus", isolate: { regions: ["mgn"], keep: 0.08 } };
  assert.deepEqual(labelled(isolating, ["mgn", "mgnR", "a1"]), ["mgn", "a1"]);
  assert.deepEqual(labelled({ ...isolating, labelMode: "auto" }, ["mgn", "mgnR", "a1"]), ["mgn", "a1"], "auto labels every marker left while isolating");
  assert.deepEqual(labelled({ ...base, labelMode: "none", labelsOn: false }, ["mgn", "a1"]), []);
  assert.equal(labelTarget("a1", base, false, true), false, "no label without a marker");
  assert.equal(labelTarget("a1", base, true, false), false, "no label for a marker out of view");
});

test("spotlight: the step's regions and the one shown stay; isolate overrides it", () => {
  const off = inTopic("vision", "v1", [], { spotOn: false, spotRegions: new Set(["lgn", "v1"]) });
  assert.equal(regionSpot("mt", off), 1);
  const on = { ...off, spotOn: true };
  assert.deepEqual(
    ["lgn", "v1", "mt"].map((id) => regionSpot(id, on)),
    [1, 1, SPOT_DIM_REGION],
  );
  assert.equal(regionSpot("pfc", { ...on, shown: "pfc" }), 1, "the region shown is never dimmed");
  const isolating = { ...on, isolate: { regions: ["mt"], keep: 0.1 } };
  assert.deepEqual(
    ["mt", "v1", "lgn"].map((id) => regionSpot(id, isolating)),
    [1, 1, 0.1],
  );
});

test("highlights: overview map levels", () => {
  assert.equal(homeHighlightWeight(false, null, false), 0);
  assert.equal(homeHighlightWeight(true, null, false), HOME_GLOW);
  assert.equal(homeHighlightWeight(true, "vision", true), HOME_FOCUS);
  assert.equal(homeHighlightWeight(true, "vision", false), HOME_DIM);
});

test("highlights: shown and isolated regions in full, the topic's others at a steady context level", () => {
  const topic = { focusActive: true, overview: false, isolate: null };
  assert.equal(highlightWeight(true, false, true, topic), 1);
  assert.equal(highlightWeight(false, false, true, topic), CONTEXT_HIGHLIGHT);
  assert.equal(highlightWeight(false, false, false, topic), 0);
  assert.equal(highlightWeight(false, true, false, topic), 1);
  assert.equal(highlightWeight(false, false, true, { ...topic, isolate: { regions: ["v1"], keep: 0.1 } }), 0.1);
  // The overview with an agent's focus: the focused region glows, topic context does not.
  assert.equal(highlightWeight(true, false, true, { focusActive: true, overview: true, isolate: null }), 1);
  assert.equal(highlightWeight(false, false, true, { focusActive: true, overview: true, isolate: null }), 0);
  assert.equal(highlightWeight(true, false, false, { focusActive: false, overview: true, isolate: null }), 0);
});

test("labels are reached in reading order: the left column top to bottom, then the right", async () => {
  const { readingOrder } = await bundle(`export { readingOrder } from "./src/model/callouts.ts";`);
  const label = (id, side, labelY) => ({ id, side, labelY });
  const order = readingOrder([label("a", 1, 50), label("b", -1, 300), label("c", -1, 20), label("d", 1, 10)]);
  assert.deepEqual(
    order.map((l) => l.id),
    ["c", "b", "d", "a"],
  );
});
