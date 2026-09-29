import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { build } from "esbuild";
import { inertScene, installInertDom } from "./support/explorer-dom.mjs";

installInertDom();
// The explorer's walkthrough timer never fires on its own.
mock.timers.enable({ apis: ["setTimeout"] });

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
const m = await bundle(`
  export * from "./src/api/guide-content.ts";
  export { helpCard } from "./src/agent/help.ts";
  export { createGuideApi } from "./src/api/guide-api.ts";
  export { createActivityLog } from "./src/api/activity.ts";
  export { stepRef, formatRef, placeRef } from "./src/model/refs.ts";
  export { pathways, regions, regionGuides, guideSources, sources } from "./src/content/index.ts";
  export { createState } from "./src/state.ts";
  export { createExplorer } from "./src/ui/explorer.ts";
`);
const { guideSources, sources } = m;
const {
  outline,
  read,
  createGuideApi,
  createActivityLog,
  createState,
  createExplorer,
  pathways,
  regions,
  regionGuides,
  stepRef,
  searchGuide,
  noMatchesHint,
  helpCard,
} = m;
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
/** Keys with a value: the runner drops undefined fields before results leave the page. */
const keys = (value) => Object.keys(value).filter((key) => value[key] !== undefined);
const isError = (result, code) => result.error?.code === code;
const REGION_IDS = Object.keys(regions);

/* ---------- outline ---------- */

test("outline(guide) lists the overview, every topic in UI order with its step count, About and help", () => {
  const guide = outline();
  assert.equal(guide.ref, "guide");
  assert.deepEqual(
    guide.topics.map((topic) => topic.ref),
    pathways.map((path) => `topic:${path.id}`),
  );
  for (const [i, topic] of guide.topics.entries()) assert.equal(topic.steps, pathways[i].steps.length);
  assert.deepEqual(guide.about, ["about", "about/papers", "about/code", "about/models"]);
  assert.equal(guide.help, "help");
  assert.deepEqual(outline("overview").topics, guide.topics);
});

test("outline(topic) lists steps with stable refs, then walkthrough regions and route-only regions", () => {
  for (const path of pathways) {
    const result = outline(`topic:${path.id}`);
    assert.equal(result.steps.length, path.steps.length);
    result.steps.forEach((step, i) => {
      assert.deepEqual(step, { ref: stepRef(path.id, i), n: i + 1, title: path.steps[i].title, region: path.steps[i].region });
    });
    assert.deepEqual(result.regions, [...new Set(path.steps.map((step) => step.region))]);
    for (const id of result.also) assert(!result.regions.includes(id) && path.edges.some((edge) => edge.from === id || edge.to === id));
    assert.equal(result.streams, path.id === "attention" ? "topic:attention/streams" : undefined);
    assert.equal(result.cursor, undefined);
  }
  const paged = outline("topic:vision", { limit: 4 });
  assert.equal(paged.steps.length, 4);
  assert.equal(paged.cursor, "4");
  assert.equal(paged.more, true, "A cursor comes with more: true.");
  const next = outline("topic:vision", { limit: 4, cursor: paged.cursor });
  assert.equal(next.steps[0].n, 5);
  assert(isError(outline("topic:vision", { cursor: "x" }), "bad_input"));
});

test("outline shapes for every other ref kind", () => {
  const step = outline("step:vision/1");
  assert.deepEqual(keys(step), ["ref", "n", "of", "topic", "title", "region", "next"]);
  const last = pathways[0].steps.length;
  assert.equal(outline(`step:vision/${last}`).next, undefined);
  assert.equal(outline(`step:vision/${last}`).prev, stepRef("vision", last - 2));
  for (const id of REGION_IDS) {
    const region = outline(`region:${id}`);
    assert.equal(region.ref, `region:${id}`);
    assert(region.sections.includes("summary") && region.sections.includes("mechanism"));
    assert(region.topics.length > 0, `${id} is in no topic`);
    for (const ref of region.steps) assert.equal(read(ref).region, id);
  }
  assert.deepEqual(
    outline("region:soc").steps,
    pathways.find((path) => path.id === "hearing").steps.flatMap((s, i) => (s.region === "soc" ? [stepRef("hearing", i)] : [])),
  );
  assert.equal(outline("about/code").tabs.length, 4);
  assert.deepEqual(
    outline("topic:attention/streams").streams.map((stream) => stream.region),
    ["v1", "s1", "a1"],
  );
  assert(outline("source:hubel-wiesel").cited.includes("topic:vision"));
  assert.deepEqual(outline("help"), read("help"));
  for (const ref of ["docs", "doc:k3f9", "quiz:k3f9", "block:b7x2k"]) assert(isError(outline(ref), "not_available"), ref);
  assert(isError(outline("region:nope"), "unknown_ref"));
});

/* ---------- read ---------- */

const REFS = [
  "guide",
  "overview",
  "about",
  "about/papers",
  "about/code",
  "about/models",
  "topic:vision",
  "topic:attention/streams",
  "step:vision/1",
  "step:hearing/mgn-relay",
  "region:v1",
  "region:v1#summary",
  "region:v1#mechanism",
  "region:v1#role",
  "region:v1#connections",
  "region:v1#limit",
  "region:v1#sources",
  "source:hubel-wiesel",
  "help",
  "docs",
  "doc:k3f9",
  "quiz:k3f9",
  "block:b7x2k",
];
const WITHOUT_SOURCES = new Set(["guide", "overview", "about", "about/code", "about/models", "topic:attention/streams"]);
const ARTIFACTS = new Set(["docs", "doc:k3f9", "quiz:k3f9", "block:b7x2k"]);

test("read returns a result or a coded error for every ref kind and detail level", () => {
  for (const ref of REFS)
    for (const detail of m.DETAILS) {
      const result = read(ref, detail);
      const label = `${ref} ${detail}`;
      if (ARTIFACTS.has(ref)) assert(isError(result, "not_available"), label);
      else if (detail === "markdown" || detail === "results") assert(isError(result, "bad_input"), label);
      else if (detail === "sources" && WITHOUT_SOURCES.has(ref)) assert(isError(result, "bad_input"), label);
      else {
        assert(!result.error, `${label}: ${result.error?.message}`);
        assert.equal(typeof result.ref, "string", label);
      }
    }
});

test("read(topic): brief is short; full adds summary, caveat and steps; sources lists citations", () => {
  for (const path of pathways) {
    const brief = read(`topic:${path.id}`);
    assert.deepEqual(keys(brief), ["ref", "title", "subtitle", "text"]);
    const full = read(`topic:${path.id}`, "full");
    for (const key of ["summary", "caveat", "steps"]) assert(key in full, `${path.id} full: ${key}`);
    assert.equal(full.steps.length, path.steps.length);
    const { sources } = read(`topic:${path.id}`, "sources");
    assert.equal(sources.length, path.sourceIds.length);
    for (const source of sources) assert(source.ref.startsWith("source:") && source.url.startsWith("https://") && source.title);
  }
});

test("read(step): brief has the body; full adds the key fact, the route in words and the region summary", () => {
  for (const path of pathways)
    path.steps.forEach((step, i) => {
      const ref = stepRef(path.id, i);
      const brief = read(ref);
      assert.deepEqual(keys(brief), ["ref", "n", "of", "topic", "title", "region", "text"]);
      assert.equal(brief.n, i + 1);
      assert.equal(brief.region, step.region);
      const full = read(`step:${path.id}/${i + 1}`, "full");
      assert.equal(full.ref, ref);
      assert(full.fact && full.regionSummary);
      if (step.signal?.length !== 0 && (i > 0 || step.signal)) assert.match(full.route, /→/, `${ref} route`);
      assert(read(ref, "sources").sources.length > 0);
    });
  assert.equal(read("step:vision/parallel-channels", "full").route, "Optic chiasm → LGN");
  assert.equal(read("step:vision/light-to-signals", "full").route, undefined, "An empty signal has no route.");
});

test("read(region): brief is summary and location; full has every section; roles follow the open topic", () => {
  for (const id of REGION_IDS) {
    const brief = read(`region:${id}`);
    assert.deepEqual(keys(brief), ["ref", "title", "where", "text"]);
    const full = read(`region:${id}`, "full");
    for (const key of ["summary", "mechanism", "roles", "connections", "limit", "sources"]) assert(key in full, `${id} full: ${key}`);
    assert.deepEqual(keys(full.roles).sort(), Object.keys(regionGuides[id].roles).sort(), `${id}: all roles outside a topic`);
  }
  const inHearing = read("region:soc", "full", { path: "hearing" });
  assert.deepEqual(keys(inHearing.roles), ["hearing"]);
  assert.deepEqual(read("region:soc#role", "brief", { path: "hearing" }).roles, inHearing.roles);
  const section = read("region:lgn#mechanism");
  assert.deepEqual(keys(section), ["ref", "title", "section", "text"]);
  assert.equal(section.ref, "region:lgn#mechanism");
});

test("guide text reaches agents with markdown region links, never [[id|text]]", () => {
  const texts = [];
  for (const path of pathways) {
    texts.push(JSON.stringify(read(`topic:${path.id}`, "full")));
    for (const i of path.steps.keys()) texts.push(JSON.stringify(read(stepRef(path.id, i), "full")));
  }
  for (const id of REGION_IDS) texts.push(JSON.stringify(read(`region:${id}`, "full")));
  texts.push(JSON.stringify(read("overview", "full")));
  const all = texts.join("\n");
  assert(!all.includes("[["), "Unconverted [[id|text]] link.");
  const links = [...all.matchAll(/\]\(region:([a-zA-Z0-9]+)\)/g)].map((match) => match[1]);
  assert(links.length > 50, `${links.length} region links`);
  for (const id of links) assert(id in regions, `link to unknown region ${id}`);
});

test("About › Papers counts each region-only paper once, by URL, as the Papers tab lists them", () => {
  // The Papers tab lists topic sources first, then region-guide papers whose URL is not listed yet, each URL once.
  const topicUrls = new Set(pathways.flatMap((path) => path.sourceIds.map((id) => sources.find((source) => source.id === id)?.url)));
  const regionUrls = new Set(guideSources.map((source) => source.url).filter((url) => !topicUrls.has(url)));
  for (const detail of ["brief", "full"]) assert.equal(read("about/papers", detail).regionOnly, regionUrls.size, detail);
});

test("typical results stay under 2 KB", () => {
  const typical = [
    ["outline", outline()],
    ["read help (reference card)", read("help")],
  ];
  for (const path of pathways) {
    typical.push([`outline topic:${path.id}`, outline(`topic:${path.id}`)], [`read topic:${path.id}`, read(`topic:${path.id}`)]);
    for (const i of path.steps.keys()) typical.push([`read ${stepRef(path.id, i)}`, read(stepRef(path.id, i))]);
  }
  for (const id of REGION_IDS) typical.push([`read region:${id}`, read(`region:${id}`)], [`outline region:${id}`, outline(`region:${id}`)]);
  for (const [label, result] of typical) {
    // The reference card maps tasks to the 12 tools and explains every error code, so it gets a little more room.
    const limit = label.includes("reference card") ? 2560 : 2048;
    assert(bytes(result) < limit, `${label}: ${bytes(result)} bytes`);
  }
});

/* ---------- GuideApi commands, against a fake explorer ---------- */

/** The real explorer (ui/explorer.ts) on an inert DOM, recording what GuideApi asks of it. */
function realExplorer() {
  const state = createState(false);
  const explorer = createExplorer(state, { matches: true }, () => {});
  explorer.attachScene(inertScene(state));
  const calls = [];
  return Object.assign(Object.create(explorer), {
    calls,
    state,
    goTo(target, options) {
      calls.push(["goTo", target, options]);
      explorer.goTo(target, options);
    },
    startWalk(seconds) {
      calls.push(["startWalk", seconds]);
      explorer.startWalk(seconds);
    },
    stopWalk() {
      calls.push(["stopWalk"]);
      explorer.stopWalk();
    },
  });
}

function setup({ control = true } = {}) {
  const explorer = realExplorer();
  const opened = [];
  let aboutTab = null;
  const about = {
    open: (tab) => {
      opened.push(tab);
      aboutTab = tab;
    },
    close: () => {
      aboutTab = null;
    },
    tab: () => aboutTab,
  };
  const activity = createActivityLog({ now: () => 10_000 });
  const api = createGuideApi({ explorer, about, activity, playing: () => true, agentControl: () => control, now: () => 12_000 });
  return { api, explorer, opened, activity };
}

test("go moves to steps (either form), regions and sections, and returns the new place with its brief", () => {
  const { api, explorer } = setup();
  const result = api.go("step:vision/3");
  assert.deepEqual(explorer.calls.at(-1), ["goTo", { kind: "step", path: "vision", index: 2 }, { camera: true, section: undefined }]);
  assert.equal(result.at, "step:vision/parallel-channels");
  assert.equal(result.n, 3);
  assert.equal(result.of, pathways[0].steps.length);
  assert.match(result.said, /Vision step 3 of \d+: Parallel channels in the LGN/);
  assert.equal(result.brief, read("step:vision/3").text);
  assert.equal(typeof result.undo.run, "function");
  assert.equal(api.go("step:vision/parallel-channels").undo, undefined, "Going where you already are has nothing to undo.");

  const region = api.go("region:lgn#mechanism", false);
  assert.deepEqual(explorer.calls.at(-1)[2], { camera: false, section: "mechanism" });
  assert.equal(region.at, "region:lgn");
  assert.equal(region.brief, read("region:lgn#mechanism").text);
  region.undo.run();
  assert.deepEqual(explorer.calls.at(-1)[1], { kind: "step", path: "vision", index: 2 }, "Undo returns to the previous place.");

  assert.equal(api.go("topic:attention/streams").at, "topic:attention/streams");
  assert.equal(api.go("overview").at, "overview");
  assert.equal(api.go("topic:touch").at, stepRef("touch", 0));
});

test("go opens About tabs, and explains refs without a place", () => {
  const { api, opened } = setup();
  assert.equal(api.go("about/papers").at, "about/papers");
  assert.deepEqual(opened, ["papers"]);
  assert.equal(api.context().about, "about/papers");
  api.go("topic:vision");
  assert.equal(api.context().about, undefined, "Navigating closes About.");
  const source = api.go("source:hubel-wiesel");
  assert(isError(source, "not_available"));
  assert(source.error.options.includes("topic:vision"));
  assert(isError(api.go("help"), "not_available"));
  assert(isError(api.go("doc:k3f9"), "not_available"));
  const unknown = api.go("region:visual cortex");
  assert(isError(unknown, "unknown_ref") && unknown.error.options[0] === "region:v1");
});

test("walkthrough plays, pauses, steps and restarts, with the seconds per step", () => {
  const { api, explorer } = setup();
  const idle = api.walkthrough({ action: "play" });
  assert(isError(idle, "not_available"));
  assert.deepEqual(
    idle.error.options,
    pathways.map((path) => `topic:${path.id}`),
  );

  const play = api.walkthrough({ action: "play", ref: "topic:hearing", seconds: 8 });
  assert.deepEqual(explorer.calls.slice(-2), [
    ["goTo", { kind: "step", path: "hearing", index: 0 }, undefined],
    ["startWalk", 8],
  ]);
  assert.equal(play.walking, true);
  assert.match(play.said, /^Playing Hearing step 1 of \d+: .+, 8 s per step\.$/);
  assert.equal(api.context().seconds, 8);

  const pause = api.walkthrough({ action: "pause" });
  assert.equal(pause.walking, false);
  assert.match(api.walkthrough({ action: "pause" }).said, /already paused/);

  assert.equal(api.walkthrough({ action: "next" }).at, stepRef("hearing", 1));
  assert.equal(api.walkthrough({ action: "prev" }).at, stepRef("hearing", 0));
  assert(isError(api.walkthrough({ action: "prev" }), "not_available"), "No step before the first.");
  const last = pathways.find((path) => path.id === "hearing").steps.length;
  api.go(`step:hearing/${last}`);
  assert.match(api.walkthrough({ action: "next" }).error.message, /last step/);

  api.walkthrough({ action: "restart", seconds: 4 });
  assert.deepEqual(explorer.calls.slice(-2), [
    ["goTo", { kind: "step", path: "hearing", index: 0 }, undefined],
    ["startWalk", 4],
  ]);
  api.walkthrough({ action: "play", ref: "step:vision/4" });
  assert.deepEqual(explorer.calls.slice(-2), [
    ["goTo", { kind: "step", path: "vision", index: 3 }, undefined],
    ["startWalk", 5.5],
  ]);

  assert(isError(api.walkthrough({ action: "pause", ref: "topic:vision" }), "bad_input"));
  assert(isError(api.walkthrough({ action: "next", seconds: 4 }), "bad_input"));
  assert(isError(api.walkthrough({ action: "play", ref: "region:v1" }), "bad_input"));
  assert(isError(api.walkthrough({ action: "play", ref: "topic:nope" }), "unknown_ref"));
});

test("get_context reports the place, the step and new activity since a cursor", () => {
  const { api, activity } = setup({ control: false });
  const start = api.context();
  assert.equal(start.at, "overview");
  assert.equal(start.panel, undefined);
  assert.equal(start.control, "off");
  assert.equal(start.cursor, `${activity.epoch}.0`);
  assert.deepEqual(start.activity, []);

  activity.append({ by: "user", kind: "navigated", ref: "step:vision/optic-chiasm" });
  activity.append({ by: "user", kind: "navigated", ref: "step:vision/optic-chiasm" });
  activity.append({ by: "agent", kind: "go", ref: "region:lgn", said: "Showed the LGN." });
  const first = api.context();
  assert.equal(first.activity.length, 2, "Repeated navigation to one place is logged once.");
  assert.deepEqual(first.activity[0], { seq: 1, by: "user", kind: "navigated", ref: "step:vision/optic-chiasm", said: undefined, on: undefined, ago_s: 2 });
  assert.equal(first.cursor, `${activity.epoch}.2`);
  assert.deepEqual(api.context(first.cursor).activity, []);
  assert.equal(api.context(first.cursor).reset, undefined);

  const { api: inTopic, explorer } = setup();
  inTopic.go("region:mgn");
  const context = inTopic.context();
  assert.equal(context.at, "region:mgn");
  assert.equal(context.panel, "region");
  assert.equal(context.topic, "topic:hearing");
  assert.equal(context.step, stepRef("hearing", explorer.state.step));
  assert.equal(context.selected, "mgn");
  assert(bytes(context) < 2048);
});

test("a cursor from before a reload is recognised: the agent gets the latest entries and reset", () => {
  const before = setup().api.context().cursor;
  const log = createActivityLog({ now: () => 99_000 });
  const api = createGuideApi({
    explorer: realExplorer(),
    about: { tab: () => null },
    activity: log,
    playing: () => false,
    agentControl: () => true,
    now: () => 99_000,
  });
  log.append({ by: "user", kind: "navigated", ref: "topic:vision" });
  log.append({ by: "user", kind: "navigated", ref: "topic:hearing" });
  assert.notEqual(log.epoch, before.split(".")[0], "Each page load has its own epoch.");
  const after = api.context(before);
  assert.deepEqual(
    after.activity.map((entry) => entry.ref),
    ["topic:vision", "topic:hearing"],
    "Nothing is skipped, even though the old seq was higher.",
  );
  assert.match(after.reset, /before the page reloaded/);
  assert.equal(after.cursor, `${log.epoch}.2`);
  assert.equal(api.context("not a cursor").reset !== undefined, true);
  assert.equal(api.context(after.cursor).reset, undefined);
});

test("a search with no hits says what to try next, naming close refs when there are some", () => {
  const { api } = setup();
  const typo = api.search("pulvinr", "guide");
  assert.deepEqual(typo.hits, []);
  assert.match(
    typo.hint,
    /^No matches for "pulvinr"\. Closest refs: region:pulvinar(, [a-z:/-]+)*\. Try fewer or different keywords, or browse with outline\(\)\.$/,
  );
  assert.equal(noMatchesHint("qqqxxz"), 'No matches for "qqqxxz". Try fewer or different keywords, or browse with outline().');
  assert.equal(api.search("lgn", "guide").hint, undefined);
  for (const hit of searchGuide("lgn relay", 50)) assert.notEqual(hit.snip, "", `${hit.ref}: an empty snip is left out`);
});

test("the help card maps tasks to tools and says what each error code asks for", () => {
  const card = helpCard();
  assert.equal(card.details.results, "a quiz's answers and score");
  assert.equal(card.tasks["narrate your own sequence"], "start_tour");
  assert.equal(card.tasks["list the user's docs"], "outline docs");
  assert.match(card.docs, /by \(user or agent\)/);
  assert.match(card.docs, /deleted: true/);
  assert.match(card.docs, /30 days/);
  for (const code of [
    "bad_input",
    "unknown_ref",
    "not_available",
    "stale_rev",
    "locked_by_user",
    "limit",
    "agent_control_off",
    "store_unavailable",
    "internal",
  ])
    assert(card.errors[code], code);
});

test("the activity log pages 30 entries at a time and keeps the latest 500", () => {
  const log = createActivityLog();
  for (let i = 0; i < 520; i++) log.append({ by: "user", kind: "played", ref: `topic:vision` });
  const latest = log.since();
  assert.equal(latest.entries.length, 30);
  assert.equal(latest.cursor, 520);
  const old = log.since(0);
  assert.equal(old.entries[0].seq, 21, "The oldest 20 entries were dropped.");
  assert.equal(old.more, true);
  assert.equal(log.since(510).entries.length, 10);
  assert.equal(log.since(510).more, false);
  assert.equal(log.since(9999).cursor, 520);
});
