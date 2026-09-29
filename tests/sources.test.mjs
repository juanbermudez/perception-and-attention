// Source lists: every region-guide source is cited by a region guide, and About › Papers lists each paper
// once under "Region details", leaving out papers already listed under a topic.
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
const { papersTab, guideSources, regionGuides, sources, pathways } = await bundle(`
  export { papersTab } from "./src/ui/about.ts";
  export { guideSources, regionGuides } from "./src/content/region-guides.ts";
  export { sources } from "./src/content/sources.ts";
  export { pathways } from "./src/content/pathways.ts";
`);
const hrefs = (html) => [...html.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1]);

test("every region-guide source is cited by at least one region guide", () => {
  const cited = new Set(Object.values(regionGuides).flatMap((guide) => guide.sourceIds));
  const orphans = guideSources.filter((source) => !cited.has(source.id)).map((source) => source.id);
  assert.deepEqual(orphans, [], "Cite these from the guide whose text they support, or remove them.");
});

test("a source id means the same paper in the topic and region lists", () => {
  for (const guide of guideSources) {
    const topic = sources.find((source) => source.id === guide.id);
    if (topic) assert.equal(guide.url, topic.url, guide.id);
  }
});

test('About › Papers lists each "Region details" paper once, and none already listed under a topic', () => {
  const [topicsPart, regionPart] = papersTab().split("<h3>Region details</h3>");
  assert(regionPart, "The Papers tab has a Region details section.");
  const region = hrefs(regionPart);
  assert.equal(new Set(region).size, region.length, `Listed twice: ${region.filter((url, i) => region.indexOf(url) !== i).join(", ")}`);
  const topicUrls = new Set(hrefs(topicsPart));
  assert.deepEqual(
    region.filter((url) => topicUrls.has(url)),
    [],
  );
  // Every paper a region guide cites is reachable from the tab, under its topic or under Region details.
  const listed = new Set([...topicUrls, ...region]);
  const missing = guideSources.filter((source) => !listed.has(source.url)).map((source) => source.id);
  assert.deepEqual(missing, []);
  assert.equal(topicsPart.split("<h3>").length - 1, pathways.length, "One group per topic.");
});
