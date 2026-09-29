import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const inputs = resolve(process.argv[2] || "work/anatomy");
const project = resolve(".");

import { mulberry32 } from "math/random";
import { Box3, Matrix4, Vector3 } from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { CEREBELLUM_NAME, CORTEX_NAME } from "./atlas-groups.mjs";

globalThis.window = { innerWidth: 1000, innerHeight: 800 };
const scale = 0.29;
// One rigid rotation, translation and uniform scale for every atlas part.
// Atlas +X=subject left, +Y=superior, +Z=anterior (centimetres).
// Scene +X=posterior, +Y=superior, +Z=subject left.
const transform = new Matrix4().set(0, 0, -scale, -scale, 0, scale, 0, -163 * scale, scale, 0, 0, 0, 0, 0, 0, 1);
const entries = new Map();
const hashes = {};
for (const name of ["nervous", "skeletal"]) {
  const raw = await readFile(join(inputs, `${name}.fbx`));
  hashes[name] = createHash("sha256").update(raw).digest("hex");
  const root = new FBXLoader().parse(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), "");
  root.updateMatrixWorld(true);
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.geometry.getAttribute("position").count < 50) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(transform);
    const p = geo.getAttribute("position");
    const values = Array.from(p.array);
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    entries.set(mesh.name, { name: mesh.name, values, min: box.min.toArray(), max: box.max.toArray(), center: box.getCenter(new Vector3()).toArray() });
  });
}
const random = mulberry32.create(9482);
const sample = () => mulberry32.sample(random);
const quantize = (v) => Math.round(v * 1000);
const base64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString("base64");
function pack(values) {
  return base64(new Int16Array(values.map(quantize)));
}
// Triangle meshes share corners: each quantized vertex is stored once (in first-use order, so a
// nearest-vertex search finds the same one as in the unindexed list) and triangles index it.
function packIndexed(values) {
  const ids = new Map(),
    positions = [],
    index = [];
  for (let i = 0; i < values.length; i += 3) {
    const corner = [quantize(values[i]), quantize(values[i + 1]), quantize(values[i + 2])];
    const key = corner.join(",");
    let id = ids.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      ids.set(key, id);
      positions.push(...corner);
    }
    index.push(id);
  }
  if (positions.length / 3 > 65536) throw new Error(`Too many vertices for a Uint16 index: ${positions.length / 3}`);
  return { data: base64(new Int16Array(positions)), index: base64(new Uint16Array(index)) };
}
function surfacePoints(values, count) {
  const areas = [];
  let area = 0;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (let i = 0; i < values.length; i += 9) {
    a.fromArray(values, i);
    b.fromArray(values, i + 3).sub(a);
    c.fromArray(values, i + 6).sub(a);
    area += b.cross(c).length() * 0.5;
    areas.push(area);
  }
  const points = [];
  for (let i = 0; i < count; i++) {
    const pick = sample() * area;
    let lo = 0,
      hi = areas.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (areas[m] < pick) lo = m + 1;
      else hi = m;
    }
    const j = lo * 9;
    const u = Math.sqrt(sample()),
      v = sample();
    for (let k = 0; k < 3; k++) points.push((1 - u) * values[j + k] + u * (1 - v) * values[j + 3 + k] + u * v * values[j + 6 + k]);
  }
  return points;
}
const meshes = [];
const landmarkMeshes = {};
function add(name, group, mode = "triangles", count = 0) {
  const part = entries.get(name);
  if (!part) throw new Error(`Missing atlas part: ${name}`);
  meshes.push({ name, group, mode, ...(mode === "points" ? { data: pack(surfacePoints(part.values, count)) } : packIndexed(part.values)) });
  landmarkMeshes[name] = { center: part.center, min: part.min, max: part.max };
}
for (const [name, e] of entries) {
  if (CORTEX_NAME.test(name) && e.min[1] > -1.3 && e.max[1] < 3.1 && !/[ij]$/.test(name)) add(name, "cortex");
}
const lowerNames = [...entries.keys()].filter((name) => CEREBELLUM_NAME.test(name));
for (const name of lowerNames) add(name, "lower", "points", 500);
for (const name of ["Ponsl", "Ponsr", "Midbrainl", "Midbrainr", "Medulla_oblongatal", "Medulla_oblongatar"]) add(name, "stem", "points", 650);
for (const name of [
  "Thalamusl",
  "Thalamusr",
  "Lateral_geniculate_bodyl",
  "Lateral_geniculate_bodyr",
  "Medial_geniculate_bodyl",
  "Medial_geniculate_bodyr",
  "Inferior_colliculusl",
  "Inferior_colliculusr",
  "Anterior_cochlear_nucleusl",
  "Anterior_cochlear_nucleusr",
  "Posterior_cochlear_nucleusl",
  "Posterior_cochlear_nucleusr",
])
  add(name, "deep");
for (const name of ["Cochleal", "Cochlear"]) add(name, "ear");
for (const name of ["Vestibulocochlear_nerve_(VIII)l", "Vestibulocochlear_nerve_(VIII)r"]) add(name, "auditory-nerve", "points", 900);
for (const name of ["Temporal_bonel", "Temporal_boner"]) add(name, "bone");
for (const name of ["Retinal", "Retinar"]) add(name, "eye", "points", 1700);
for (const name of ["Optic_nerve_(II)l", "Optic_nerve_(II)r", "Optic_chiasml", "Optic_chiasmr", "Optic_tractl", "Optic_tractr"])
  add(name, "optic", "points", 650);
const cortex = meshes.filter((x) => x.group === "cortex").flatMap((x) => entries.get(x.name).values);
const bounds = new Box3().setFromArray(cortex);
const dimensions = bounds.getSize(new Vector3()).toArray();
// Parts added after the cerebrum bounds are measured and after all point sampling, so the shared
// frame and every earlier point cloud stay identical: the supratemporal plane (planum temporale,
// where area Spt and most of the auditory belt lie), the inferior temporal and parahippocampal gyri
// (outside the height filter above) and the superior colliculi.
for (const name of [
  "Temporal_planel",
  "Temporal_planer",
  "Inferior_temporal_gyrusl",
  "Inferior_temporal_gyrusr",
  "Medial_occipitotemporal_gyrus_(Parahippocampal*)l",
  "Medial_occipitotemporal_gyrus_(Parahippocampal*)r",
])
  add(name, "cortex");
for (const name of ["Superior_colliculusl", "Superior_colliculusr"]) add(name, "deep");
function anchor(name, fractions = [0.5, 0.5, 0.5]) {
  const e = entries.get(name),
    target = e.min.map((v, i) => v + (e.max[i] - v) * fractions[i]);
  let best = Infinity,
    out = [];
  for (let i = 0; i < e.values.length; i += 3) {
    const d = e.values.slice(i, i + 3).reduce((s, v, k) => s + (v - target[k]) ** 2, 0);
    if (d < best) {
      best = d;
      out = e.values.slice(i, i + 3);
    }
  }
  return out.map((v) => Number(v.toFixed(4)));
}
const anchors = {
  retina: anchor("Retinal", [0.9, 0.5, 0.5]),
  retinaR: anchor("Retinar", [0.9, 0.5, 0.5]),
  chiasm: [-0.7634, -0.5203, 0],
  lgn: landmarkMeshes.Lateral_geniculate_bodyl.center,
  v1: anchor("Calcarine_sulcusl", [0.72, 0.5, 0.3]),
  pfc: anchor("Middle_frontal_gyrusl", [0.22, 0.6, 0.8]),
  parietal: anchor("Superior_parietal_lobulel", [0.5, 0.6, 0.8]),
  extrastriate: anchor("Lateral_occipital_gyrus_(Middle_occipital_gyrus*)l", [0.7, 0.55, 0.7]),
  cochlea: landmarkMeshes.Cochleal.center,
  cochleaR: landmarkMeshes.Cochlear.center,
  brainstem: landmarkMeshes.Anterior_cochlear_nucleusl.center,
  brainstemR: landmarkMeshes.Anterior_cochlear_nucleusr.center,
  ic: landmarkMeshes.Inferior_colliculusl.center,
  icR: landmarkMeshes.Inferior_colliculusr.center,
  mgn: landmarkMeshes.Medial_geniculate_bodyl.center,
  mgnR: landmarkMeshes.Medial_geniculate_bodyr.center,
  a1: anchor("Transverse_temporal_gyril"),
  a1R: anchor("Transverse_temporal_gyrir"),
  temporal: anchor("Superior_temporal_gyrus_(Lateral_part)l", [0.65, 0.65, 0.9]),
  // Spt lies at the back of the planum temporale, near the parietal operculum.
  spt: anchor("Temporal_planel", [0.85, 0.7, 0.5]),
  frontal: anchor("Opercular_part_of_inferior_frontal_gyrusl", [0.6, 0.6, 0.8]),
  motor: anchor("Precentral_gyrusl", [0.45, 0.12, 0.95]),
  meaning: anchor("Middle_temporal_gyrusl", [0.2, 0.6, 0.8]),
  // Anatomical landmarks within/along the atlas structures, not segmented nuclei.
  soc: [-0.12, -1.22, 0.21],
  socR: [-0.12, -1.22, -0.21],
  trn: [-0.02, -0.12, landmarkMeshes.Thalamusl.max[2] + 0.015],
  pulvinar: [landmarkMeshes.Thalamusl.max[0] - 0.14, 0.0, 0.38],
};
anchors.l6 = anchors.v1;
anchors.l5 = anchors.v1;
anchors.sc = landmarkMeshes.Superior_colliculusl.center;
// Hand-placed landmarks for nuclei and structures this model does not load (see docs/science-factcheck.md):
// locus coeruleus beside the floor of the fourth ventricle in the rostral pons (Keren et al., 2009);
// dorsal horn at the lower end of the right medulla, standing in for the spinal cord below the model.
anchors.lc = [0.35, -1.0, 0.13];
anchors.dorsalHorn = [0.65, -2.62, -0.12];
const manifest = {
  atlas: "Z-Anatomy / BodyParts3D",
  source: "https://github.com/LluisV/Z-Anatomy/tree/PC-Version/Resources/Models/FBX",
  sourceTree: JSON.parse(await readFile(join(inputs, "z-unity-tree.json"), "utf8")).sha,
  sha256: hashes,
  transform: { atlasUnits: "centimetres", scale, translationBeforeScale: [0, -163, -1], sceneAxes: { x: "posterior", y: "superior", z: "left" } },
  cerebrumMillimetres: dimensions.map((x) => (x / scale) * 10),
  cerebrumBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  parts: landmarkMeshes,
  anchors,
  meshCount: meshes.length,
  quantizationSceneUnits: 0.001,
  encoding: "base64 little-endian; data: Int16 x,y,z per vertex (scene units × 1000); index (triangle meshes): Uint16, three vertices per triangle",
};
await writeFile(
  join(project, "src/data/atlas-data.json"),
  JSON.stringify({ meshes, anchors, landmarks: landmarkMeshes, dimensions: manifest.cerebrumMillimetres }),
);
await writeFile(join(project, "provenance/anatomy.json"), JSON.stringify(manifest, null, 2));
console.log(`PASS ${meshes.length} atlas meshes; cerebrum AP / SI / LR mm: ${manifest.cerebrumMillimetres.map((v) => v.toFixed(3)).join(" / ")}`);
console.log("Ears", landmarkMeshes.Cochleal, landmarkMeshes.Cochlear);
