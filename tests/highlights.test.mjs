import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

async function bundle(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const { regionAnatomy } = await bundle("src/content/region-anatomy.ts");
const { regions } = await bundle("src/content/index.ts");
const atlas = JSON.parse(await readFile("src/data/atlas-data.json", "utf8"));
const areas = JSON.parse(await readFile("src/data/functional-areas.json", "utf8"));
const parts = new Map(atlas.meshes.map((part) => [part.name, part]));
assert.deepEqual(Object.keys(regionAnatomy).sort(), Object.keys(regions).sort());
for (const [id, highlight] of Object.entries(regionAnatomy)) {
  assert(highlight.label.length > 0);
  assert(highlight.parts.length > 0);
  for (const name of highlight.parts) {
    const part = parts.get(name);
    assert(part, `${id}: missing atlas part ${name}`);
    const bytes = Buffer.from(part.data, "base64");
    assert(bytes.length > 0);
    assert.equal(bytes.length % (part.mode === "triangles" ? 18 : 6), 0);
  }
  assert.deepEqual(regions[id].position, atlas.anchors[id] ?? areas[id]?.position ?? atlas.landmarks[highlight.parts[0]].center, `${id}: landmark moved`);
}
// Functional areas (MT, FFA, …) sit on a vertex of the gyrus or sulcus they highlight,
// within a few millimetres of the published group-average coordinate.
for (const [id, area] of Object.entries(areas)) {
  assert.equal(regionAnatomy[id].parts[0], area.mesh, `${id}: highlight and placement use different meshes`);
  assert.equal(area.mni.length, 3);
  assert(area.snappedMillimetres < 8, `${id}: snapped ${area.snappedMillimetres} mm from its source coordinate`);
  const raw = Buffer.from(parts.get(area.mesh).data, "base64");
  const v = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  let onMesh = false;
  for (let i = 0; i < v.length && !onMesh; i += 3)
    onMesh = v[i] / 1000 === area.position[0] && v[i + 1] / 1000 === area.position[1] && v[i + 2] / 1000 === area.position[2];
  assert(onMesh, `${id}: anchor is not on ${area.mesh}`);
}
console.log(`PASS ${Object.keys(areas).length} functional areas sit on their highlighted atlas surface.`);
console.log(`PASS all ${Object.keys(regions).length} landmarks map to renderable atlas parts; original anchors and new atlas-center references are preserved.`);
for (const [left, right] of [
  ["retina", "retinaR"],
  ["cochlea", "cochleaR"],
  ["brainstem", "brainstemR"],
  ["soc", "socR"],
  ["ic", "icR"],
  ["mgn", "mgnR"],
  ["a1", "a1R"],
]) {
  assert(regionAnatomy[left].parts.every((name) => name.endsWith("l")));
  assert(regionAnatomy[right].parts.every((name) => name.endsWith("r")));
}
assert.deepEqual(regionAnatomy.v1.parts, regionAnatomy.l6.parts);
assert.match(regionAnatomy.l6.context, /not segmented/);
for (const id of ["trn", "pulvinar", "soc", "socR"]) assert.match(regionAnatomy[id].context, /Parent structure highlighted.*unsegmented landmark/);
console.log("PASS bilateral selections stay on their own side; unsegmented nuclei and cortical layers identify the parent reference.");
