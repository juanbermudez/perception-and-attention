import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

/** Bundle one or more modules into a single instance, imported from a data URL. */
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
const refs = await bundle(`
  export * from "./src/model/refs.ts";
  export { pathways, regions } from "./src/content/index.ts";
  export { regionIdSchema } from "./src/agent/schemas.ts";
  export { helpCard } from "./src/agent/help.ts";
`);
const { resolveRef, formatRef, stepRef, markdownLinks, plainText, parseHash, placeHash, placeRef, refPlace, pathways, regions } = refs;
const ok = (text) => {
  const result = resolveRef(text);
  assert(!result.error, `${text}: ${result.error?.message}`);
  return result.ref;
};
const failure = (text) => {
  const result = resolveRef(text);
  assert(result.error, `${text} should not resolve`);
  return result.error;
};

test("every step has a slug key, unique in its topic, that cannot be read as a step number or a hash segment", () => {
  for (const path of pathways) {
    const keys = path.steps.map((step) => step.key);
    assert.equal(new Set(keys).size, keys.length, `${path.id}: duplicate step key`);
    for (const key of keys) {
      assert.match(key, /^[a-z][a-z0-9-]*[a-z0-9]$/, `${path.id}: bad key ${key}`);
      assert(!refs.RESERVED_STEP_KEYS.includes(key), `${path.id}: reserved key ${key}`);
    }
  }
});

test("step:<path>/<n> and step:<path>/<key> resolve to the same step, and results use the key form", () => {
  for (const path of pathways)
    path.steps.forEach((step, index) => {
      const byNumber = ok(`step:${path.id}/${index + 1}`);
      const byKey = ok(`step:${path.id}/${step.key}`);
      assert.deepEqual(byNumber, { kind: "step", path: path.id, index });
      assert.deepEqual(byKey, byNumber);
      assert.equal(formatRef(byNumber), `step:${path.id}/${step.key}`);
      assert.equal(stepRef(path.id, index), formatRef(byKey));
    });
});

test("refs are case-insensitive and format back to one canonical form", () => {
  const cases = {
    guide: "guide",
    OVERVIEW: "overview",
    Help: "help",
    docs: "docs",
    about: "about",
    "About/Papers": "about/papers",
    "about/code": "about/code",
    "about/models": "about/models",
    "topic:Vision": "topic:vision",
    "topic:attention/streams": "topic:attention/streams",
    "step:HEARING/3": "step:hearing/comparing-ears",
    "step:Vision/Parallel-Channels": "step:vision/parallel-channels",
    "region:LGN": "region:lgn",
    "region:retinar": "region:retinaR",
    "region:dorsalhorn#Mechanism": "region:dorsalHorn#mechanism",
    "source:hubel-wiesel": "source:hubel-wiesel",
    "doc:K3F9": "doc:k3f9",
    "quiz:q1": "quiz:q1",
    "block:b7x2k": "block:b7x2k",
    "  region:v1  ": "region:v1",
  };
  for (const [input, canonical] of Object.entries(cases)) assert.equal(formatRef(ok(input)), canonical, input);
});

test("region ids resolve case-insensitively without collisions", () => {
  const lower = Object.keys(regions).map((id) => id.toLowerCase());
  assert.equal(new Set(lower).size, lower.length);
  for (const id of Object.keys(regions)) assert.deepEqual(ok(`region:${id.toUpperCase()}`), { kind: "region", id });
});

test("unknown refs return unknown_ref with at most 5 suggestions", () => {
  const visual = failure("region:visual cortex");
  assert.equal(visual.code, "unknown_ref");
  assert.equal(visual.options[0], "region:v1");
  assert(visual.options.includes("region:extrastriate"), visual.options.join(", "));
  assert(visual.options.length <= 5);

  assert.deepEqual(failure("region:lgm").options, ["region:lgn"]);
  assert.equal(failure("topic:heairng").options[0], "topic:hearing");
  assert.equal(failure("pulvinar").options[0], "region:pulvinar", "A bare name suggests its ref.");
  assert.equal(failure("vision").options[0], "topic:vision");
  assert.equal(failure("step:vision/parallel-chanels").options[0], "step:vision/parallel-channels");
  assert.equal(failure("source:hubel-wiesle").options[0], "source:hubel-wiesel");
  for (const text of ["region:visual cortex", "pulvinar", "topic:heairng", "x:y", "about/credits"]) assert(failure(text).options.length <= 5, text);
});

test("step numbers out of range and bad sections say what exists", () => {
  const vision = pathways.find((path) => path.id === "vision");
  const tooFar = failure(`step:vision/${vision.steps.length + 1}`);
  assert.equal(tooFar.code, "unknown_ref");
  assert.match(tooFar.message, new RegExp(`${vision.steps.length} steps`));
  assert.deepEqual(tooFar.options, [stepRef("vision", vision.steps.length - 1)]);
  assert.deepEqual(failure("step:vision/0").options, [stepRef("vision", 0)]);
  const section = failure("region:v1#history");
  assert.equal(section.options.length, 5);
  assert(section.options.every((option) => option.startsWith("region:v1#")));
  assert.equal(failure("doc:not an id!").code, "bad_input");
  assert.equal(failure("region:").code, "unknown_ref");
});

test("[[id|text]] is rewritten to [text](region:id); unknown ids keep only their text", () => {
  assert.equal(markdownLinks("See [[v1|primary visual cortex]] and [[lgn|the LGN]]."), "See [primary visual cortex](region:v1) and [the LGN](region:lgn).");
  assert.equal(markdownLinks("A [[nope|made-up area]] here."), "A made-up area here.");
  assert.equal(plainText("From [[retina|the eye]] to [[v1|V1]]."), "From the eye to V1.");
  assert.equal(markdownLinks("No links."), "No links.");
});

test("the URL hash round-trips every place and accepts step numbers", () => {
  const places = [{ kind: "overview" }, { kind: "streams" }];
  for (const path of pathways) {
    places.push({ kind: "regions", path: path.id });
    for (const index of path.steps.keys()) places.push({ kind: "step", path: path.id, index });
    places.push({ kind: "region", path: path.id, id: path.steps[0].region });
  }
  for (const place of places) assert.deepEqual(parseHash(placeHash(place)), place, placeHash(place));
  assert.equal(placeHash({ kind: "overview" }), "");
  assert.equal(placeHash({ kind: "step", path: "vision", index: 2 }), "#/vision/parallel-channels");
  assert.deepEqual(parseHash("#/vision/3"), { kind: "step", path: "vision", index: 2 });
  assert.deepEqual(parseHash("#/Hearing"), { kind: "step", path: "hearing", index: 0 });
  assert.deepEqual(parseHash("#/region/V1"), { kind: "region", path: null, id: "v1" });
  for (const bad of ["#/nope", "#/vision/99", "#/vision/streams", "#/vision/region/nope", "#/doc/k3f9", "#/vision/1/2"])
    assert.equal(parseHash(bad), null, bad);
});

test("places map to refs, and refs with a place map back", () => {
  assert.equal(formatRef(placeRef({ kind: "regions", path: "touch" })), "topic:touch");
  assert.equal(formatRef(placeRef({ kind: "region", path: "hearing", id: "soc" })), "region:soc");
  assert.deepEqual(refPlace(ok("topic:speech")), { kind: "step", path: "speech", index: 0 });
  assert.deepEqual(refPlace(ok("guide")), { kind: "overview" });
  assert.deepEqual(refPlace(ok("region:mgn#role")), { kind: "region", path: null, id: "mgn" });
  for (const text of ["help", "source:hubel-wiesel", "about/papers", "docs", "doc:k3f9"]) assert.equal(refPlace(ok(text)), null, text);
});

test("the region enum and the help card are generated from content", () => {
  const ids = Object.keys(regions);
  assert.deepEqual(refs.regionIdSchema.options, ids);
  assert.deepEqual(refs.REGION_IDS, ids);
  const card = refs.helpCard();
  assert.deepEqual(Object.keys(card.regions), ids);
  assert.deepEqual(
    Object.keys(card.topics),
    pathways.map((path) => path.id),
  );
  for (const path of pathways) assert.match(card.topics[path.id], new RegExp(`${path.steps.length} steps`));
});
