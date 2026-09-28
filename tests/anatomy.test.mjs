import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["src/scene/geometry.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { sampleEdge } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const content = await build({ entryPoints: ["src/content/index.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { pathways, regions } = await import(`data:text/javascript;base64,${Buffer.from(content.outputFiles[0].text).toString("base64")}`);
const atlas = JSON.parse(await readFile("src/data/atlas-data.json", "utf8"));
const provenance = JSON.parse(await readFile("provenance/anatomy.json", "utf8"));
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log(`PASS ${name}`);
};
check("shared atlas scale and realistic cerebrum aspect ratio", () => {
  assert.equal(provenance.transform.scale, 0.29);
  const [ap, si, lr] = atlas.dimensions;
  assert(ap > 160 && ap < 210 && lr > 120 && lr < 160 && si > 90 && si < 150);
  assert(lr / ap > 0.7 && lr / ap < 0.85);
});
check("quantized meshes retain original part bounds", () => {
  for (const mesh of atlas.meshes) {
    const raw = Buffer.from(mesh.data, "base64");
    const v = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    const box = atlas.landmarks[mesh.name];
    for (let i = 0; i < v.length; i++) {
      const p = v[i] / 1000;
      assert(p >= box.min[i % 3] - 0.00051 && p <= box.max[i % 3] + 0.00051, mesh.name);
    }
  }
});
check("paired cochleae keep atlas symmetry, bone context and brainstem relationship", () => {
  const left = atlas.landmarks.Cochleal,
    right = atlas.landmarks.Cochlear;
  assert(Math.abs(left.center[0] - right.center[0]) < 0.0001);
  assert(Math.abs(left.center[1] - right.center[1]) < 0.0001);
  assert(Math.abs(left.center[2] + right.center[2]) < 0.0001);
  for (const [ear, bone, cn] of [
    [left, atlas.landmarks.Temporal_bonel, regions.brainstem],
    [right, atlas.landmarks.Temporal_boner, regions.brainstemR],
  ]) {
    for (let i = 0; i < 3; i++) assert(ear.min[i] >= bone.min[i] && ear.max[i] <= bone.max[i]);
    assert(Math.abs(ear.center[2]) > Math.abs(cn.position[2]));
    assert(Math.abs(ear.center[1] - cn.position[1]) < 0.03);
    assert(ear.center[1] < provenance.cerebrumBounds.min[1]);
  }
});
check("V1 and layer 6 share a cortical patch; auditory anchors use Heschl gyri", () => {
  assert.deepEqual(regions.v1.position, regions.l6.position);
  for (const [id, name] of [
    ["v1", "Calcarine_sulcusl"],
    ["a1", "Transverse_temporal_gyril"],
    ["a1R", "Transverse_temporal_gyrir"],
  ]) {
    const part = atlas.landmarks[name];
    for (let i = 0; i < 3; i++) assert(regions[id].position[i] >= part.min[i] - 0.0001 && regions[id].position[i] <= part.max[i] + 0.0001);
  }
});
check("each cochlear input first enters its ipsilateral nucleus, then reaches both cortices", () => {
  const edges = pathways.find((p) => p.id === "hearing").edges;
  for (const [ear, nucleus] of [
    ["cochlea", "brainstem"],
    ["cochleaR", "brainstemR"],
  ]) {
    const first = edges.filter((e) => e.from === ear);
    assert.equal(first.length, 1);
    assert.equal(first[0].to, nucleus);
    assert.equal(first[0].stage, 0);
    const seen = new Set([ear]),
      pending = [ear];
    while (pending.length) {
      const id = pending.pop();
      for (const e of edges.filter((e) => e.from === id)) {
        if (!seen.has(e.to)) {
          seen.add(e.to);
          pending.push(e.to);
        }
      }
    }
    assert(seen.has("a1") && seen.has("a1R"));
  }
  // Ascending relay routes fire in stages; detail routes (streams, feedback to the ear) are not staged.
  for (const e of edges.filter((e) => !e.detail)) assert(Number.isInteger(e.stage) && e.stage >= 0 && e.stage <= 4);
});
check("every animated curve is finite and anchored to its atlas endpoints", () => {
  for (const path of pathways)
    for (const edge of path.edges) {
      for (const [t, id] of [
        [0, edge.from],
        [1, edge.to],
      ]) {
        const point = sampleEdge([0, 0, 0], edge, t);
        for (let i = 0; i < 3; i++) assert(Math.abs(point[i] - regions[id].position[i]) < 1e-8);
      }
      for (let i = 0; i <= 100; i++) assert(sampleEdge([0, 0, 0], edge, i / 100).every(Number.isFinite));
    }
});
console.log(`PASS ${checks} anatomical geometry and route checks. These do not establish clinical or tractographic accuracy.`);
