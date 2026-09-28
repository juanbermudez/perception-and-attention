import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const skull = JSON.parse(await readFile("src/data/skull-data.json", "utf8"));
const provenance = JSON.parse(await readFile("provenance/skull.json", "utf8"));
const brain = JSON.parse(await readFile("provenance/anatomy.json", "utf8"));
function decode(data) {
  const bytes = Buffer.from(data, "base64");
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}
const positions = decode(skull.positions),
  normals = decode(skull.normals);
assert.equal(provenance.sha256, brain.sha256.skeletal);
assert.equal(provenance.sourceTree, brain.sourceTree);
assert.deepEqual(provenance.transform, brain.transform);
assert.equal(provenance.boneCount, 22);
assert.equal(provenance.toothCount, 28);
assert.equal(provenance.parts.length, 50);
assert.equal(new Set(provenance.parts.map((p) => p.name)).size, 50);
assert.equal(positions.length, skull.count * 3);
assert.equal(normals.length, positions.length);
assert.equal(
  provenance.parts.reduce((n, p) => n + p.count, 0),
  skull.count,
);
console.log("PASS skull uses the same atlas release and transform, with 22 bones and 28 teeth.");
for (const part of provenance.parts) {
  assert(part.count > 0);
  for (let i = part.offset; i < part.offset + part.count; i++) {
    let length = 0;
    for (let axis = 0; axis < 3; axis++) {
      const p = positions[i * 3 + axis] / 1000;
      assert(p >= part.min[axis] - 0.00051 && p <= part.max[axis] + 0.00051, part.name);
      length += (normals[i * 3 + axis] / 32767) ** 2;
    }
    assert(Math.abs(length - 1) < 0.0001, `${part.name}: invalid normal`);
  }
}
console.log("PASS every sampled particle stays in its source part bounds and has a unit normal.");
for (const name of ["Temporal_bonel", "Temporal_boner"]) {
  const part = provenance.parts.find((p) => p.name === name),
    existing = brain.parts[name];
  for (const field of ["min", "max"]) for (let axis = 0; axis < 3; axis++) assert(Math.abs(part[field][axis] - existing[field][axis]) < 0.000001);
}
console.log("PASS skull temporal bones align exactly with the existing inner-ear bone context.");
for (let axis = 0; axis < 3; axis++) {
  assert(skull.bounds.min[axis] <= brain.cerebrumBounds.min[axis]);
  assert(skull.bounds.max[axis] >= brain.cerebrumBounds.max[axis]);
}
console.log("PASS skull overall bounds surround the cerebrum bounds. This is not a volumetric fit test.");
