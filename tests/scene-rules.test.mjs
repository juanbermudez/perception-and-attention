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
const { visionShown, hearingShown, gatedLayers } = await bundle(`
  export * from "./src/model/view.ts";
`);

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
