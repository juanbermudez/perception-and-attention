// Fuzzy search for the command palette (src/model/fuzzy.ts) and what it searches (src/model/palette.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const result = await build({
  stdin: {
    contents: `export * from "./src/model/fuzzy.ts"; export * from "./src/model/palette.ts";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { fuzzySearch, normalize, paletteItems, prepare, stem, withinOneEdit } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

const items = paletteItems();
const index = prepare(items);
const top = (query) => fuzzySearch(index, query, 5).map((match) => match.entry.id);

test("normalize drops case, accents and punctuation", () => {
  assert.equal(normalize("  Heschl’s  Gyrus (A1) "), "heschl s gyrus a1");
  assert.equal(normalize("Café—Noir"), "cafe noir");
});

test("withinOneEdit allows one insertion, deletion, substitution or swap", () => {
  for (const [a, b] of [
    ["pulvinar", "pulvinr"],
    ["pulvinar", "pulvinaar"],
    ["cochlea", "cochlae"],
    ["cortex", "cortax"],
  ])
    assert(withinOneEdit(a, b), `${a} ~ ${b}`);
  assert(!withinOneEdit("pulvinar", "plvinr"), "Two edits.");
  assert(!withinOneEdit("cortex", "vertex"), "Two substitutions.");
});

test("stems join forms of the same word", () => {
  assert.equal(stem("recognition"), "recognit");
  assert.equal(stem("recognizing"), "recogniz");
  assert(stem("faces").startsWith("fac") && "face".startsWith(stem("faces")), "Plural and singular share a stem.");
  assert.equal(stem("eye"), "eye", "Short words are left alone.");
});

test("an exact title comes first, then titles that start with the query", () => {
  assert.equal(top("Vision")[0], "topic:vision");
  assert.equal(top("pulvinar")[0], "region:pulvinar");
  assert.equal(top("Attent")[0], "topic:attention");
});

test("typos, initials and several words still find the right place", () => {
  assert.equal(top("pulvinr")[0], "region:pulvinar", "One letter missing.");
  assert.equal(top("cochlae")[0].startsWith("region:cochlea") || top("cochlae")[0].startsWith("step:hearing"), true, "Two letters swapped.");
  assert(top("lgn").includes("region:lgn"), "Initials and short names.");
  assert(
    top("face recognition").some((id) => id === "region:ffa"),
    "Words from the region's text.",
  );
});

test("every query word must match, and an empty query finds nothing", () => {
  assert.deepEqual(top("pulvinar zzzqqq"), []);
  assert.deepEqual(top("   "), []);
});

test("the palette covers every topic, step, region and paper once, each with a place or a URL", () => {
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "No duplicate ids.");
  assert.equal(items.filter((item) => item.group === "Topics").length, 6);
  const urls = items.filter((item) => item.group === "Papers").map((item) => item.url);
  assert.equal(new Set(urls).size, urls.length, "Each paper once.");
  for (const item of items) assert(item.place || item.url, item.id);
  for (const item of items) assert(!/\[\[/.test(item.text ?? ""), `${item.id}: link markup removed`);
});
