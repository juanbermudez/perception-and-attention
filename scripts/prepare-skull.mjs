import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { vec3 } from "math";
import { mulberry32 } from "math/random";
import { Box3, Matrix4, Vector3 } from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const inputs = resolve(process.argv[2] || "work/anatomy");
const reference = JSON.parse(await readFile("provenance/anatomy.json", "utf8"));
const raw = await readFile(join(inputs, "skeletal.fbx"));
const sha256 = createHash("sha256").update(raw).digest("hex");
assert.equal(sha256, reference.sha256.skeletal, "The skull must use the same atlas release as the brain.");
globalThis.window = { innerWidth: 1000, innerHeight: 800 };
const scale = reference.transform.scale;
// Identical rigid transform to prepare-atlas.mjs; no separate skull fit or stretch.
const matrix = [0, 0, -scale, -scale, 0, scale, 0, -163 * scale, scale, 0, 0, 0, 0, 0, 0, 1];
const transform = new Matrix4().set(...matrix);
const bones = [
  "Frontal_bone",
  "Parietal_bonel",
  "Parietal_boner",
  "Occipital_bone",
  "Temporal_bonel",
  "Temporal_boner",
  "Sphenoid_bone",
  "Ethmoid_bone",
  "Maxillal",
  "Maxillar",
  "Mandible",
  "Nasal_bonel",
  "Nasal_boner",
  "Zygomatic_bonel",
  "Zygomatic_boner",
  "Vomer",
  "Palatine_bonel",
  "Palatine_boner",
  "Lacrimal_bonel",
  "Lacrimal_boner",
  "Inferior_nasal_concha_bonel",
  "Inferior_nasal_concha_boner",
];
const teeth = /^(Upper|Lower)_(medial_incisor|lateral_incisor|canine|first_premolar|second_premolar|first_molar_tooth|second_molar_tooth)[lr]$/;
const a = vec3.create(),
  b = vec3.create(),
  c = vec3.create(),
  ab = vec3.create(),
  ac = vec3.create(),
  cross = vec3.create(),
  point = vec3.create(),
  normal = vec3.create();
const root = new FBXLoader().parse(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), "");
root.updateMatrixWorld(true);
const selected = [];
root.traverse((mesh) => {
  if (!mesh.isMesh || (!bones.includes(mesh.name) && !teeth.test(mesh.name))) return;
  let geometry = mesh.geometry.clone();
  if (geometry.index) geometry = geometry.toNonIndexed();
  geometry.applyMatrix4(mesh.matrixWorld).applyMatrix4(transform);
  if (!geometry.hasAttribute("normal")) geometry.computeVertexNormals();
  const positions = geometry.getAttribute("position").array,
    normals = geometry.getAttribute("normal").array;
  assert.equal(positions.length % 9, 0, mesh.name);
  const areas = new Float64Array(positions.length / 9);
  let area = 0;
  for (let i = 0; i < areas.length; i++) {
    vec3.fromBuffer(a, positions, i * 9);
    vec3.fromBuffer(b, positions, i * 9 + 3);
    vec3.fromBuffer(c, positions, i * 9 + 6);
    vec3.subtract(ab, b, a);
    vec3.subtract(ac, c, a);
    vec3.cross(cross, ab, ac);
    area += vec3.length(cross) * 0.5;
    areas[i] = area;
  }
  assert(area > 0, mesh.name);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  selected.push({ name: mesh.name, positions, normals, areas, area, min: box.min.toArray(), max: box.max.toArray() });
});
for (const name of bones)
  assert(
    selected.some((part) => part.name === name),
    `Missing skull bone: ${name}`,
  );
selected.sort((a, b) => a.name.localeCompare(b.name));
const totalArea = selected.reduce((sum, part) => sum + part.area, 0);
const counts = selected.map((part) => Math.max(180, Math.round((48000 * part.area) / totalArea)));
const count = counts.reduce((sum, n) => sum + n, 0),
  positions = new Int16Array(count * 3),
  normals = new Int16Array(count * 3),
  parts = [];
const random = mulberry32.create(54109),
  sample = () => mulberry32.sample(random);
let offset = 0;
const bounds = new Box3();
selected.forEach((part, index) => {
  const n = counts[index];
  parts.push({ name: part.name, offset, count: n, min: part.min, max: part.max });
  bounds.union(new Box3(new Vector3(...part.min), new Vector3(...part.max)));
  for (let i = 0; i < n; i++) {
    const pick = sample() * part.area;
    let lo = 0,
      hi = part.areas.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (part.areas[mid] < pick) lo = mid + 1;
      else hi = mid;
    }
    const j = lo * 9,
      u = Math.sqrt(sample()),
      v = sample(),
      w0 = 1 - u,
      w1 = u * (1 - v),
      w2 = u * v;
    for (let axis = 0; axis < 3; axis++) {
      point[axis] = part.positions[j + axis] * w0 + part.positions[j + 3 + axis] * w1 + part.positions[j + 6 + axis] * w2;
      normal[axis] = part.normals[j + axis] * w0 + part.normals[j + 3 + axis] * w1 + part.normals[j + 6 + axis] * w2;
    }
    if (vec3.squaredLength(normal) < 1e-8) {
      vec3.fromBuffer(a, part.positions, j);
      vec3.fromBuffer(b, part.positions, j + 3);
      vec3.fromBuffer(c, part.positions, j + 6);
      vec3.subtract(ab, b, a);
      vec3.subtract(ac, c, a);
      vec3.cross(normal, ab, ac);
    }
    vec3.normalize(normal, normal);
    for (let axis = 0; axis < 3; axis++) {
      positions[(offset + i) * 3 + axis] = Math.round(point[axis] * 1000);
      normals[(offset + i) * 3 + axis] = Math.round(normal[axis] * 32767);
    }
  }
  offset += n;
});
const box = { min: bounds.min.toArray(), max: bounds.max.toArray() };
await writeFile(
  "src/data/skull-data.json",
  JSON.stringify({ positions: Buffer.from(positions.buffer).toString("base64"), normals: Buffer.from(normals.buffer).toString("base64"), count, bounds: box }),
);
await writeFile(
  "provenance/skull.json",
  JSON.stringify(
    {
      atlas: reference.atlas,
      source: reference.source,
      sourceTree: reference.sourceTree,
      sha256,
      transform: reference.transform,
      matrix4RowMajor: matrix,
      boneCount: bones.length,
      toothCount: selected.length - bones.length,
      pointCount: count,
      bounds: box,
      quantizationSceneUnits: 0.001,
      normalDivisor: 32767,
      sampling: { method: "area-weighted triangle surfaces", seed: 54109, targetPoints: 48000, minPerPart: 180 },
      parts,
    },
    null,
    2,
  ),
);
console.log(`PASS ${bones.length} skull bones and ${selected.length - bones.length} teeth, ${count} surface particles, shared atlas transform.`);
