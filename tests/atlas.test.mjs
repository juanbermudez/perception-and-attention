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

test("the cortex pattern keeps the angular gyrus and rejects the quadrangular lobules", () => {
  for (const name of ["Angular_gyrusl", "Angular_gyrusr", "Supramarginal_gyrusl", "Superior_parietal_lobulel", "Precuneusl", "Circular_sulcus_of_insulal"])
    assert(CORTEX_NAME.test(name), name);
  for (const name of ["Anterior_quadrangular_lobulel", "Anterior_quadrangular_lobuler", "Posterior_quadrangular_lobulel", "Tonsil_of_cerebellumr"])
    assert(!CORTEX_NAME.test(name), name);
});
