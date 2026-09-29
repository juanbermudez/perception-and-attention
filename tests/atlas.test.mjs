import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CEREBELLUM_NAME, CORTEX_NAME } from "../scripts/atlas-groups.mjs";

const atlas = JSON.parse(await readFile("src/data/atlas-data.json", "utf8"));
const provenance = JSON.parse(await readFile("provenance/anatomy.json", "utf8"));

test("each atlas mesh belongs to exactly one group", () => {
  const groups = new Map();
  for (const mesh of atlas.meshes) groups.set(mesh.name, [...(groups.get(mesh.name) ?? []), mesh.group]);
  const repeated = [...groups].filter(([, list]) => list.length > 1).map(([name, list]) => `${name} (${list.join(", ")})`);
  assert.deepEqual(repeated, []);
  assert.equal(provenance.meshCount, atlas.meshes.length);
});

test("no cerebellar mesh is drawn as cortex", () => {
  const cerebellar = atlas.meshes.filter((mesh) => mesh.group === "lower").map((mesh) => mesh.name);
  assert(cerebellar.length > 20, "the cerebellum group should list the lobules and the vermis");
  for (const name of cerebellar) {
    assert(CEREBELLUM_NAME.test(name), `${name} is in the cerebellum group but not matched by its pattern`);
    assert(!CORTEX_NAME.test(name), `${name} matches the cortex pattern`);
  }
  for (const mesh of atlas.meshes.filter((m) => m.group === "cortex")) assert(!CEREBELLUM_NAME.test(mesh.name), `${mesh.name} is cerebellar`);
});

test("triangle meshes store each vertex once and index it; point clouds have no index", () => {
  let largest = 0;
  for (const mesh of atlas.meshes) {
    const raw = Buffer.from(mesh.data, "base64");
    const positions = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    assert.equal(positions.length % 3, 0, mesh.name);
    if (mesh.mode === "points") {
      assert.equal(mesh.index, undefined, `${mesh.name}: point cloud with an index`);
      continue;
    }
    const bytes = Buffer.from(mesh.index, "base64");
    const index = new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const vertices = positions.length / 3;
    largest = Math.max(largest, vertices);
    assert(index.length > 0 && index.length % 3 === 0, `${mesh.name}: index is not whole triangles`);
    const used = new Uint8Array(vertices);
    for (const i of index) {
      assert(i < vertices, `${mesh.name}: index ${i} past ${vertices} vertices`);
      used[i] = 1;
    }
    assert(used.every(Boolean), `${mesh.name}: a stored vertex is not used by any triangle`);
    const seen = new Set();
    for (let i = 0; i < positions.length; i += 3) seen.add(`${positions[i]},${positions[i + 1]},${positions[i + 2]}`);
    assert.equal(seen.size, vertices, `${mesh.name}: a vertex is stored twice`);
  }
  assert(largest <= 65536);
});

test("the cortex pattern keeps the angular gyrus and rejects the quadrangular lobules", () => {
  for (const name of ["Angular_gyrusl", "Angular_gyrusr", "Supramarginal_gyrusl", "Superior_parietal_lobulel", "Precuneusl", "Circular_sulcus_of_insulal"])
    assert(CORTEX_NAME.test(name), name);
  for (const name of ["Anterior_quadrangular_lobulel", "Anterior_quadrangular_lobuler", "Posterior_quadrangular_lobulel", "Tonsil_of_cerebellumr"])
    assert(!CORTEX_NAME.test(name), name);
});
