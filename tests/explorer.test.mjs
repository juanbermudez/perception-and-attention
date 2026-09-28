import assert from "node:assert/strict";
import { build } from "esbuild";

async function bundle(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const [
  { attentionWeight, regionPulse, routeWeight, streamResponses },
  { layoutCallouts, leaderPath, stackColumn },
  { regionGuides, guideSources },
  { pathways, regions, sources },
] = await Promise.all([
  bundle("src/model/attention.ts"),
  bundle("src/model/callouts.ts"),
  bundle("src/content/region-guides.ts"),
  bundle("src/content/index.ts"),
]);
const senses = ["vision", "hearing", "touch"];
const settings = { enabledSenses: { vision: true, hearing: true, touch: true }, priority: "balanced", controlNetwork: true, focus: 100 };
const attention = pathways.find((path) => path.id === "attention");
assert(attention.edges.some((edge) => edge.channel === "vision"));
assert(attention.edges.some((edge) => edge.channel === "hearing"));
assert(attention.edges.some((edge) => edge.channel === "touch"));
for (const selected of senses) {
  settings.priority = selected;
  for (const path of pathways)
    for (const edge of path.edges) {
      const weight = attentionWeight(path.id, edge, settings);
      if (path.id === selected) assert.equal(weight, 1);
      else if (senses.includes(path.id)) assert(Math.abs(weight - 7 / 15) < 1e-9, `${path.id}: unattended weight ${weight}`);
    }
  settings.enabledSenses[selected] = false;
  for (const path of pathways)
    for (const edge of path.edges) {
      if (path.id === selected || (path.id === "attention" && edge.channel === selected)) assert.equal(attentionWeight(path.id, edge, settings), 0);
    }
  settings.enabledSenses[selected] = true;
}
settings.focus = 0;
for (const sense of senses) assert.equal(attentionWeight(sense, {}, settings), 0.7);
// Normalization: fewer competitors raise the remaining responses.
settings.priority = "balanced";
settings.focus = 100;
settings.enabledSenses.vision = false;
assert(attentionWeight("hearing", {}, settings) > 0.7);
const r = streamResponses(settings);
assert.equal(r.vision, 0);
assert(Math.abs(r.hearing - 1 / 3) < 1e-12);
settings.enabledSenses.vision = true;
settings.controlNetwork = false;
for (const edge of attention.edges) assert.equal(attentionWeight("attention", edge, settings), 0);
const touch = pathways.find((path) => path.id === "touch");
assert.deepEqual(
  touch.steps.map((step) => step.region),
  ["medulla", "vpl", "s1", "parietal"],
);
assert(regions.medulla.position[2] < 0 && regions.vpl.position[2] > 0, "Right medulla to left thalamus must cross the midline.");
console.log(
  "PASS attention follows divisive normalization: priority boosts one stream, damps but keeps the others, and removing a stream frees capacity; body route crosses at the medulla.",
);

const values = Array.from({ length: 901 }, (_, i) => regionPulse(i * 0.005));
assert(Math.abs(Math.min(...values) - 0.5) < 1e-12);
assert(Math.abs(Math.max(...values) - 0.95) < 1e-12);
assert.equal(regionPulse(0), regionPulse(4.5));
assert(Math.abs(regionPulse(2.25) - 0.5) < 1e-12);
assert.equal(regionPulse(1, true), 0.725);
console.log("PASS selected anatomy pulse: 4.5 seconds, 50–95% opacity, steady 72.5% with reduced motion.");

assert.deepEqual(Object.keys(regionGuides).sort(), Object.keys(regions).sort());
const ids = new Set(guideSources.map((source) => source.id));
assert.equal(ids.size, guideSources.length);
const pathIds = new Set(pathways.map((path) => path.id));
let mentions = 0;
for (const [id, guide] of Object.entries(regionGuides)) {
  for (const field of ["summary", "mechanism", "connections", "limit"]) assert(guide[field].length > 0, `${id}: missing ${field}`);
  assert(guide.sourceIds.length > 0 && guide.sourceIds.every((id) => ids.has(id)));
  assert(Object.keys(guide.roles).every((id) => pathIds.has(id)));
  const text = [guide.summary, guide.mechanism, ...Object.values(guide.roles), guide.connections, guide.limit].join(" ");
  for (const match of text.matchAll(/\[\[([a-zA-Z0-9]+)\|([^\]]+)\]\]/g)) {
    assert(match[1] in regions, `${id}: invalid reference ${match[1]}`);
    mentions++;
  }
  assert(!text.replace(/\[\[[a-zA-Z0-9]+\|[^\]]+\]\]/g, "").includes("[["));
}
for (const source of guideSources) assert.equal(new URL(source.url).protocol, "https:");
console.log(`PASS ${Object.keys(regionGuides).length} region drawers, ${mentions} marker references, ${ids.size} resolving source IDs.`);

// Walkthrough content: every step names a fact, every signal follows a drawn edge,
// every cited source resolves.
const sourceIds = new Set(sources.map((source) => source.id));
let signals = 0;
for (const path of pathways) {
  assert(path.short && path.subtitle && path.intro && path.insight && path.caveat, `${path.id}: missing copy`);
  assert(path.sourceIds.length && path.sourceIds.every((id) => sourceIds.has(id)), `${path.id}: unresolved source`);
  path.steps.forEach((step, index) => {
    assert(step.fact, `${path.id} step ${index + 1}: missing key fact`);
    const hops = step.signal ?? (index > 0 ? [[[path.steps[index - 1].region, step.region]]] : []);
    for (const hop of hops)
      for (const [from, to] of hop) {
        assert(
          path.edges.some((edge) => edge.from === from && edge.to === to),
          `${path.id} step ${index + 1}: no edge ${from}→${to}`,
        );
        signals++;
      }
    for (const match of [step.body, step.fact].join(" ").matchAll(/\[\[([a-zA-Z0-9]+)\|/g)) assert(match[1] in regions);
  });
}
for (const source of sources) assert.equal(new URL(source.url).protocol, "https:");
console.log(`PASS ${pathways.length} walkthroughs: every step has a key fact, ${signals} step signals follow drawn edges, all pathway sources resolve.`);

// Detail routes (beyond V1) appear only inside their own topic.
{
  const vision = pathways.find((path) => path.id === "vision");
  const detail = vision.edges.filter((edge) => edge.detail),
    core = vision.edges.filter((edge) => !edge.detail);
  assert(detail.length && core.length);
  const view = (overview, path) => ({ ...settings, priority: "balanced", enabledSenses: { vision: true, hearing: true, touch: true }, overview, path });
  for (const edge of detail) {
    assert.equal(routeWeight("vision", edge, view(true, "vision")), 0, "Detail route shown in the overview.");
    assert.equal(routeWeight("vision", edge, view(false, "attention")), 0, "Detail route shown in the Attention topic.");
    assert.equal(routeWeight("vision", edge, view(false, "vision")), 1);
  }
  for (const edge of core) assert.equal(routeWeight("vision", edge, view(true, "vision")), 0.7);
  console.log(`PASS ${detail.length} detail routes show only inside Vision; ${core.length} core routes still show in the overview.`);
}

// Callouts: columns outside the head, stacked without overlap, in anchor order.
const makeLabel = (x, y, w = 120) => ({
  anchorX: x,
  anchorY: y,
  labelX: 0,
  labelY: 0,
  labelWidth: w,
  labelHeight: 26,
  targetX: 0,
  targetY: 0,
  side: 0,
  initialized: false,
  fade: 0,
});
const head = { left: 260, right: 640, top: 120, bottom: 560 },
  bounds = { width: 900, top: 14, bottom: 600, margin: 10 };
const dt = 1 / 60;
const labels = [
  makeLabel(420, 300),
  makeLabel(430, 302),
  makeLabel(440, 305, 160),
  makeLabel(470, 310),
  makeLabel(300, 420),
  makeLabel(310, 425),
  makeLabel(600, 200),
  makeLabel(590, 205),
];
for (let frame = 0; frame < 240; frame++) layoutCallouts(labels, labels.length, head, bounds, dt);
const leftCol = labels.filter((l) => l.side < 0),
  rightCol = labels.filter((l) => l.side > 0);
assert(leftCol.length && rightCol.length && Math.abs(leftCol.length - rightCol.length) <= 2, "Columns should be roughly balanced.");
for (const label of leftCol) assert(label.labelX + label.labelWidth / 2 <= head.left - 10, "Left label overlaps the head.");
for (const label of rightCol) assert(label.labelX - label.labelWidth / 2 >= head.right + 10, "Right label overlaps the head.");
for (const column of [leftCol, rightCol]) {
  const sorted = [...column].sort((a, b) => a.anchorY - b.anchorY);
  for (let i = 1; i < sorted.length; i++) {
    assert(sorted[i].labelY > sorted[i - 1].labelY, "Labels left anchor order, so leaders would cross.");
    // With room in the band, labels keep the full 14 px spacing.
    const spacing = sorted[i].labelY - sorted[i - 1].labelY - (sorted[i].labelHeight + sorted[i - 1].labelHeight) / 2;
    assert(spacing >= 14 - 0.01, `Labels only ${spacing.toFixed(1)} px apart.`);
  }
}
const leaderPoints = (label) => [...leaderPath(label).matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
for (const label of labels) {
  assert(label.labelY - label.labelHeight / 2 >= bounds.top - 1 && label.labelY + label.labelHeight / 2 <= bounds.bottom + 1);
  // Two segments: an angled one from the region, then a horizontal run into the label's near edge.
  const [anchor, elbow, edge] = leaderPoints(label);
  assert(edge, "Leader should have two segments.");
  assert.deepEqual(anchor, [Number(label.anchorX.toFixed(1)), Number(label.anchorY.toFixed(1))]);
  assert(Math.abs(elbow[1] - label.labelY) < 0.1 && Math.abs(edge[1] - label.labelY) < 0.1, "Run into the label is not horizontal.");
  assert(Math.abs(Math.abs(edge[0] - label.labelX) - label.labelWidth / 2) < 0.1, "Leader does not end at the label's edge.");
  assert(Math.abs(edge[0] - elbow[0]) >= 12 - 0.1, "Horizontal run is too short.");
  const rise = Math.abs(elbow[1] - anchor[1]),
    run = Math.abs(elbow[0] - anchor[0]);
  assert(run <= rise + 0.25, `Angled segment is shallower than 45° (run ${run}, rise ${rise}).`);
}
// Labels fan out from the head's vertical centre, so leaders away from the middle bend outward.
{
  const middle = (head.top + head.bottom) / 2,
    outer = labels.filter((l) => Math.abs(l.anchorY - middle) > 40);
  for (const label of outer) assert(Math.abs(label.labelY - middle) >= Math.abs(label.anchorY - middle), "Label was pulled toward the centre.");
  assert(
    outer.some((label) => Math.abs(label.labelY - label.anchorY) > 20),
    "No leader bends visibly.",
  );
}
// Far-off label: the bend steepens so a short horizontal run remains.
{
  const far = { ...makeLabel(600, 500), labelX: 720, labelY: 100, side: 1, initialized: true };
  const [, elbow, edge] = leaderPoints(far);
  assert(Math.abs(edge[0] - elbow[0] - 12) < 0.1 && elbow[0] > 600, "Steep leader should keep a 12 px run.");
}
// A crowded column squeezed into a short band still fits and keeps order.
const crowd = Array.from({ length: 9 }, (_, i) => makeLabel(500, 300 + i * 2));
for (let frame = 0; frame < 240; frame++) layoutCallouts(crowd, crowd.length, head, { ...bounds, top: 100, bottom: 420 }, dt);
for (const label of crowd) assert(label.labelY - 13 >= 99 && label.labelY + 13 <= 421, "Crowded label escaped its band.");
for (const side of [-1, 1]) {
  const ys = crowd
    .filter((label) => label.side === side)
    .map((label) => label.labelY)
    .sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) assert(ys[i] - ys[i - 1] >= 26 + 4 - 0.01, "Crowded labels overlap.");
}
// One column too full for the preferred spacing squeezes it instead of overflowing.
{
  const column = Array.from({ length: 9 }, (_, i) => ({ ...makeLabel(700, 250 + i * 3), labelX: 760, side: 1 }));
  stackColumn(column, 100, 420);
  for (let i = 1; i < column.length; i++) {
    const spacing = column[i].targetY - column[i - 1].targetY - 26;
    assert(spacing >= 4 - 0.01 && spacing < 14, `Squeezed spacing ${spacing.toFixed(1)} px.`);
  }
  assert(column[0].targetY - 13 >= 99 && column.at(-1).targetY + 13 <= 421, "Squeezed column escaped its band.");
}
// A label moved to the other column to balance them keeps that side and fades in,
// instead of being pulled back to its preferred side and restarting every frame.
{
  const lopsided = [490, 500, 510, 520, 530, 540].map((x, i) => makeLabel(x, 250 + i * 40));
  for (let frame = 0; frame < 120; frame++) layoutCallouts(lopsided, lopsided.length, head, bounds, dt);
  assert(
    lopsided.some((label) => label.side < 0),
    "Columns were not balanced.",
  );
  const sides = lopsided.map((label) => label.side);
  layoutCallouts(lopsided, lopsided.length, head, bounds, dt);
  assert.deepEqual(
    lopsided.map((label) => label.side),
    sides,
    "Balanced labels changed sides while nothing moved.",
  );
  for (const label of lopsided) assert.equal(label.fade, 1, "A balanced label never finished fading in.");
}
// Orbiting: anchors sweep, labels glide under the speed cap.
for (let frame = 0; frame < 600; frame++) {
  const previous = labels.map((label) => [label.labelX, label.labelY]);
  labels.forEach((label, i) => {
    label.anchorX = 450 + Math.sin(frame * 0.02 + i) * 170;
    label.anchorY = 340 + Math.cos(frame * 0.017 + i) * 160;
  });
  layoutCallouts(labels, labels.length, head, bounds, dt);
  // A side change is a deliberate jump with a fade-in; everything else glides.
  labels.forEach((label, i) => {
    assert(label.fade < 0.1 || Math.hypot(label.labelX - previous[i][0], label.labelY - previous[i][1]) <= 900 * dt + 1e-8, "Callout jumped.");
  });
}
console.log(
  "PASS callouts sit outside the head in balanced columns, keep anchor order and 14 px spacing (squeezing only when crowded), bend leaders at 45° into a horizontal run, and glide under 900 px/s while orbiting.",
);
