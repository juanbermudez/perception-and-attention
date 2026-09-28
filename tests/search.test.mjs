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
const { createSearchIndex, tokenize, editDistance, snippet, FIELD_WEIGHTS, searchGuide } = await bundle(`
  export * from "./src/model/search.ts";
  export { searchGuide } from "./src/api/guide-content.ts";
`);

const doc = (ref, fields) => ({ ref, kind: "test", title: ref, fields });

test("tokenize folds case and accents and keeps short region ids", () => {
  assert.deepEqual(tokenize("The Café in V1, IT and a1"), ["cafe", "v1", "it", "a1"]);
  assert.deepEqual(tokenize("red–green · Broca’s area"), ["red", "green", "broca", "s", "area"]);
  assert.deepEqual(tokenize("the of and"), []);
});

test("field weights: a title match beats a fact match, which beats a body match", () => {
  assert.deepEqual(FIELD_WEIGHTS, { title: 3, fact: 2, body: 1 });
  const index = createSearchIndex([
    doc("body", { title: "alpha", fact: "beta", body: "thalamus" }),
    doc("title", { title: "thalamus", fact: "beta", body: "gamma" }),
    doc("fact", { title: "alpha", fact: "thalamus", body: "gamma" }),
    doc("none", { title: "alpha", fact: "beta", body: "gamma" }),
  ]);
  assert.deepEqual(
    index.search("thalamus").map((hit) => hit.ref),
    ["title", "fact", "body"],
  );
});

test("prefix matching finds longer words, for terms of three letters or more", () => {
  const index = createSearchIndex([doc("ic", { title: "Inferior colliculus" }), doc("other", { title: "Cortex" })]);
  assert.deepEqual(
    index.search("colli").map((hit) => hit.ref),
    ["ic"],
  );
  assert.deepEqual(index.search("co").length, 0, "Two-letter terms match whole words only.");
  // An exact word scores above a prefix of a longer one.
  const exact = createSearchIndex([doc("prefix", { title: "colliculi" }), doc("exact", { title: "colli" })]);
  assert.equal(exact.search("colli")[0].ref, "exact");
});

test("documents matching every query term rank above partial matches, and phrases score extra", () => {
  const index = createSearchIndex([
    doc("one", { title: "visual areas", body: "visual" }),
    doc("both", { body: "the visual cortex" }),
    doc("apart", { body: "cortex that is visual" }),
  ]);
  const ranked = index.search("visual cortex").map((hit) => hit.ref);
  assert.equal(ranked[0], "both");
  assert(ranked.indexOf("apart") < ranked.indexOf("one"), ranked.join(", "));
});

test("rare terms outweigh common ones", () => {
  const common = Array.from({ length: 8 }, (_, i) => doc(`c${i}`, { body: "cortex" }));
  const index = createSearchIndex([...common, doc("rare", { body: "pulvinar" }), doc("mixed", { body: "cortex" })]);
  const hits = index.search("pulvinar cortex");
  assert.equal(hits[0].ref, "rare");
});

test("kinds narrow a search, and limit caps it", () => {
  const index = createSearchIndex([
    { ref: "a", kind: "region", title: "a", fields: { title: "lgn" } },
    { ref: "b", kind: "step", title: "b", fields: { title: "lgn" } },
  ]);
  assert.deepEqual(
    index.search("lgn", { kinds: ["step"] }).map((hit) => hit.ref),
    ["b"],
  );
  assert.equal(index.search("lgn", { limit: 1 }).length, 1);
  assert.deepEqual(index.search(""), []);
});

test("snippets show about 120 characters around the first match, cut at spaces", () => {
  const body = `${"Lorem ipsum dolor sit amet. ".repeat(6)}The pulvinar coordinates activity between cortical areas. ${"More filler text here. ".repeat(6)}`;
  const snip = snippet(doc("x", { body }), ["pulvinar"]);
  assert(snip.includes("pulvinar coordinates"), snip);
  assert(snip.startsWith("…") && snip.endsWith("…"));
  assert(snip.length <= 124, `${snip.length} characters`);
  assert.equal(snippet(doc("y", { title: "Only a title" }), ["title"]), "");
});

test("edit distance counts single-character edits", () => {
  assert.equal(editDistance("lgn", "lgm"), 1);
  assert.equal(editDistance("hearing", "heairng"), 2);
  assert.equal(editDistance("", "abc"), 3);
});

test("guide search ranks the region itself first and returns compact hits", () => {
  for (const [query, top] of [
    ["pulvinar", "region:pulvinar"],
    ["LGN", "region:lgn"],
    ["locus coeruleus", "region:lc"],
    ["frontal eye fields", "region:fef"],
    ["hubel wiesel", "source:hubel-wiesel"],
  ]) {
    const hits = searchGuide(query);
    assert.equal(hits[0].ref, top, `${query}: ${hits.map((hit) => hit.ref).join(", ")}`);
    assert(hits.length <= 10);
    for (const hit of hits) assert.deepEqual(Object.keys(hit), ["ref", "title", "snip"]);
    assert(JSON.stringify({ hits }).length < 2048, `${query}: ${JSON.stringify({ hits }).length} bytes`);
  }
  assert.deepEqual(searchGuide("zzzqqq"), []);
});
