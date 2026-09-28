// Stage 5 end to end in Node: the `quiz` tool through the real tool runner, GuideApi, quiz API and docs
// API (sqlite-wasm in memory), with a headless card driven by the real quiz session. Also pick-mode routing
// and the keyboard: while the card is open, keys 1–6 answer it and do not switch topics.
import assert from "node:assert/strict";
import test from "node:test";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
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
const m = await bundle(`
  export { agentTools, tools } from "./src/agent/tools/index.ts";
  export { createToolRunner, inputSchema } from "./src/agent/webmcp.ts";
  export { createGuideApi } from "./src/api/guide-api.ts";
  export { createActivityLog } from "./src/api/activity.ts";
  export { createQuizApi } from "./src/api/quiz-api.ts";
  export { createDocsApi } from "./src/api/docs-api.ts";
  export { openEngine } from "./src/store/engine.ts";
  export { createStore, directCall } from "./src/store/store.ts";
  export { createQuizSession } from "./src/model/quiz-session.ts";
  export { createPickMode, routeRegionClicks } from "./src/ui/pick-mode.ts";
  export { createShortcutHandler } from "./src/ui/keyboard.ts";
  export { createState } from "./src/state.ts";
  export { pathways } from "./src/content/pathways.ts";
`);
const { agentTools, tools, createToolRunner, inputSchema, createGuideApi, createActivityLog, createQuizApi, createDocsApi } = m;
const { openEngine, createStore, directCall, createQuizSession, createPickMode, routeRegionClicks, createShortcutHandler, createState, pathways } = m;
const sqlite3 = await sqlite3InitModule();

const isError = (result, code) => typeof result === "object" && result !== null && "error" in result && (code === undefined || result.error.code === code);
const ok = (result) => {
  assert(!isError(result), `unexpected error: ${JSON.stringify(result)}`);
  return result;
};

/** The card without the DOM: the real session, attempts stored through the docs API. */
function headlessCard(docs) {
  let open = null;
  const saving = [];
  const card = {
    calls: [],
    async open(ref, { reset = false } = {}) {
      card.calls.push(["open", ref, reset]);
      const full = await docs.read(ref, "full");
      if (isError(full)) return full;
      const items = full.blocks.filter((block) => block.type === "question").map((block) => ({ id: block.id, question: block.data }));
      if (!items.length) return { error: { code: "not_available", message: `${full.ref} has no questions yet.` } };
      if (open?.ref === full.ref && !reset) return { ref: full.ref, title: full.title, questions: items.length, at: open.session.position + 1, resumed: true };
      const session = createQuizSession(items, {
        random: () => 0,
        regionMode: "pick",
        onAttempt: ({ block, answer, correct }) => saving.push(docs.recordAttempt({ ref: full.ref, block, answer, correct })),
      });
      open = { ref: full.ref, title: full.title, session };
      return { ref: full.ref, title: full.title, questions: items.length, at: 1 };
    },
    close(by = "agent") {
      card.calls.push(["close", by]);
      if (!open) return null;
      const closed = { ref: open.ref, title: open.title };
      open = null;
      return closed;
    },
    status() {
      if (!open) return null;
      const score = open.session.score();
      return {
        ref: open.ref,
        title: open.title,
        question: open.session.position + 1,
        of: open.session.run.length,
        answered: score.correct + score.missed.length,
        correct: score.correct,
        ...(open.session.done ? { done: true } : {}),
      };
    },
    get session() {
      return open?.session;
    },
    saved: () => Promise.all(saving),
  };
  return card;
}

function fakeExplorer() {
  const place = { kind: "overview" };
  return {
    snapshot: () => ({ overview: true, path: "attention", step: 0, selected: "pfc", panel: "guide", region: null, walking: false, seconds: 5.5, place }),
    goTo() {},
    startWalk() {},
    stopWalk() {},
    selection: () => null,
  };
}

function setup({ on = true, withQuizzes = true } = {}) {
  const engine = openEngine(new sqlite3.oo1.DB(":memory:"));
  const store = createStore(directCall(engine), { mode: "memory", reason: "file" });
  const docs = createDocsApi({ store: async () => store, now: () => new Date("2026-09-28T12:00:00Z") });
  const card = headlessCard(docs);
  const activity = createActivityLog({ now: () => 1000 });
  const quizzes = withQuizzes ? createQuizApi({ docs, card }) : undefined;
  const control = { on };
  const about = { open() {}, close() {}, tab: () => null };
  const api = createGuideApi({ explorer: fakeExplorer(), about, activity, playing: () => true, agentControl: () => control.on, quizzes, now: () => 1000 });
  const runner = createToolRunner({ tools: agentTools, api, control, activity });
  return { docs, card, activity, api, runner, control };
}

const VISION_QUIZ = {
  action: "create",
  title: "Vision basics",
  questions: [
    { kind: "choice", prompt: "Which structure relays retinal signals to V1?", choices: ["Pulvinar", "LGN", "MGN"], answer: [1], ref: "region:lgn" },
    { kind: "truefalse", prompt: "Nasal retinal fibres cross at the optic chiasm.", answer: true, ref: "step:vision/2" },
    { kind: "region", prompt: "Click the area that responds most to faces.", answer: ["ffa"], explain: "The fusiform face area." },
    { kind: "order", prompt: "Put the route in order.", items: ["Retina", "Optic chiasm", "LGN", "V1"] },
    { kind: "recall", prompt: "What does area MT specialise in?", answer: "Visual motion", view: { camera: { focus: "mt" } } },
  ],
};

/* ---------- The tool ---------- */

test("the quiz tool registers last, with one object schema whose questions cover all five kinds", () => {
  assert.equal(agentTools.at(-1).name, "quiz");
  assert.equal(agentTools, tools);
  const quiz = tools.find((tool) => tool.name === "quiz");
  assert.equal(quiz.readOnly, false);
  const schema = inputSchema(quiz.input);
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.properties.action.enum, ["create", "open", "close", "reset"]);
  const kinds = schema.properties.questions.items.oneOf ?? schema.properties.questions.items.anyOf;
  assert.deepEqual(
    kinds.map((option) => option.properties.kind.const),
    ["choice", "truefalse", "region", "order", "recall"],
  );
  assert(JSON.stringify(schema).length < 6144, `quiz schema is ${JSON.stringify(schema).length} bytes`);
});

test("quiz inputs are checked before they reach the page, with messages that say what to fix", async () => {
  const calls = [];
  const api = {
    quiz: (input) => {
      calls.push(input);
      return { said: "ok" };
    },
  };
  const runner = createToolRunner({ tools: tools.filter((tool) => tool.name === "quiz"), api, control: { on: true } });
  const message = async (args) => {
    const result = await runner.call("quiz", args);
    assert(isError(result, "bad_input"), JSON.stringify(args));
    return result.error.message;
  };
  const one = (question) => ({ action: "create", title: "T", questions: [question] });
  assert.match(await message(one({ kind: "region", prompt: "p", answer: ["V1"] })), /^questions\.0\.answer\.0: unknown region id "V1"; closest: v1/);
  assert.equal(
    await message(one({ kind: "choice", prompt: "p", choices: ["a", "b"], answer: [2] })),
    "questions.0.answer: index 2 is past the last choice (1)",
  );
  assert.match(await message(one({ kind: "region", prompt: "p", answer: ["lgn"], choices: ["v1", "mt"] })), /^questions\.0\.choices: .*missing lgn/);
  assert.match(await message(one({ kind: "truefalse", prompt: "p", answer: true, ref: "region:visual cortex" })), /^questions\.0\.ref: .*closest: region:v1/);
  assert.match(await message(one({ kind: "truefalse", prompt: "p", answer: true, view: { camera: { focus: "nope" } } })), /^questions\.0\.view: camera\.focus/);
  assert.match(await message(one({ kind: "order", prompt: "p", items: ["a", "b"] })), /^questions\.0\.items/);
  assert.match(await message(one({ kind: "essay", prompt: "p" })), /^questions\.0/);
  assert.match(await message(one({ kind: "truefalse", prompt: "p", answer: true, hint: "x" })), /Unrecognized key/);
  assert.match(await message(one({ kind: "recall", prompt: "p".repeat(301), answer: "a" })), /^questions\.0\.prompt/);
  await message({ action: "create", title: "T", questions: [] });
  await message({ action: "create", title: "T", questions: Array.from({ length: 31 }, () => ({ kind: "truefalse", prompt: "p", answer: true })) });
  await message({ action: "open" });
  await message({ action: "close", ref: "quiz:k3f9", title: "x" });
  await message({ action: "grade", ref: "quiz:k3f9" });
  assert.equal(calls.length, 0);
  ok(await runner.call("quiz", VISION_QUIZ));
  ok(await runner.call("quiz", { action: "reset", ref: "quiz:k3f9" }));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].questions[1].ref, "step:vision/2", "Refs reach the docs API as given; it stores the stable form.");
});

test("acceptance prompt 4: a 5-question vision quiz with a click-the-region question, answered and read back", async () => {
  const { runner, card, docs } = setup();
  const created = ok(await runner.call("quiz", VISION_QUIZ));
  assert.match(created.ref, /^quiz:[0-9a-z]{4}$/);
  assert.deepEqual(
    created.questions.map((question) => question.kind),
    ["choice", "truefalse", "region", "order", "recall"],
  );
  assert(created.questions.every((question) => /^[0-9a-z]{5}$/.test(question.id) && question.rev === 1));
  assert.equal(created.open, true);
  assert.equal(created.said, "Created quiz “Vision basics” with 5 questions and opened it.");
  assert.deepEqual(card.calls, [["open", created.ref, true]]);
  assert(Buffer.byteLength(JSON.stringify(created)) < 2048);
  const stored = ok(await docs.read(created.ref, "full")).blocks;
  assert.equal(stored[1].data.ref, "step:vision/optic-chiasm", "The stable form is stored.");

  const context = ok(await runner.call("get_context", {}));
  assert.deepEqual(context.quiz, { ref: created.ref, title: "Vision basics", question: 1, of: 5, answered: 0, correct: 0 });

  // The user answers in the card: right, wrong, a click on the brain, the order as shown (wrong), Got it.
  const { session } = card;
  session.handleKey("2");
  session.handleKey("Enter");
  session.handleKey("ArrowRight");
  session.handleKey("2");
  session.handleKey("Enter");
  session.handleKey("ArrowRight");
  assert.deepEqual(session.current.draft.choices.slice(0, 3), ["retina", "chiasm", "lgn"], "Pick mode offers the vision regions.");
  assert.equal(session.current.pick("ffa").correct, true);
  session.next();
  session.handleKey("Enter");
  session.next();
  session.current.setText("motion");
  session.handleKey("Enter");
  session.handleKey("1");
  session.next();
  assert(session.done);
  await card.saved();

  const results = ok(await runner.call("read", { ref: created.ref, detail: "results" }));
  assert.deepEqual(results.summary, { answered: 5, correct: 3, of: 5 });
  assert.deepEqual(
    results.questions.map(({ kind, attempts, correct, last }) => [kind, attempts, correct, last]),
    [
      ["choice", 1, 1, true],
      ["truefalse", 1, 0, false],
      ["region", 1, 1, true],
      ["order", 1, 0, false],
      ["recall", 1, 1, true],
    ],
  );
  assert.equal(results.summary.correct, session.score().correct, "Results match the stored attempts and the card's score.");

  // Retry the missed ones: the latest attempt counts.
  session.retryMissed();
  session.handleKey("1");
  session.handleKey("Enter");
  await card.saved();
  const again = ok(await runner.call("read", { ref: created.ref, detail: "results" }));
  assert.deepEqual(again.summary, { answered: 5, correct: 4, of: 5 });
  assert.deepEqual(again.questions[1], { id: created.questions[1].id, kind: "truefalse", attempts: 2, correct: 1, last: true });

  const brief = ok(await runner.call("read", { ref: created.ref.toUpperCase() }));
  assert.equal(brief.questions, 5);
  assert(isError(await runner.call("read", { ref: created.ref, detail: "sources" }), "bad_input"));
  const full = ok(await runner.call("read", { ref: created.ref, detail: "full" }));
  assert.deepEqual(full.blocks[2].data.answer, ["ffa"], "The agent can see answers; the card never shows them before submission.");
});

test("open, reset and close", async () => {
  const { runner, card } = setup();
  const { ref } = ok(await runner.call("quiz", { ...VISION_QUIZ, open: false }));
  assert.deepEqual(card.calls, [], "open: false leaves the card closed.");
  assert.equal(ok(await runner.call("get_context", {})).quiz, undefined);

  assert.equal(ok(await runner.call("quiz", { action: "open", ref })).said, "Opened quiz “Vision basics”: 5 questions.");
  card.session.handleKey("2");
  card.session.handleKey("Enter");
  card.session.next();
  const resumed = ok(await runner.call("quiz", { action: "open", ref }));
  assert.equal(resumed.said, "Showing quiz “Vision basics” at question 2 of 5.");
  assert.equal(resumed.at, 2);
  const reset = ok(await runner.call("quiz", { action: "reset", ref }));
  assert.equal(reset.said, "Restarted quiz “Vision basics” from question 1 of 5.");
  assert.equal(card.session.position, 0);

  const other = ok(await runner.call("quiz", { action: "create", title: "Other", questions: [{ kind: "truefalse", prompt: "p", answer: true }], open: false }));
  const wrong = await runner.call("quiz", { action: "close", ref: other.ref });
  assert(isError(wrong, "not_available"));
  assert.deepEqual(wrong.error.options, [ref]);
  assert.equal(ok(await runner.call("quiz", { action: "close", ref })).said, "Closed quiz “Vision basics” at question 1 of 5.");
  assert.equal(ok(await runner.call("quiz", { action: "close", ref })).said, "No quiz was open.");

  assert(isError(await runner.call("quiz", { action: "open", ref: "quiz:zzzz" }), "unknown_ref"));
  assert(isError(await runner.call("quiz", { action: "open", ref: "region:v1" }), "bad_input"));
  const { docs } = setup();
  const note = ok(await docs.doc({ action: "create", title: "Notes", markdown: "Just text." }));
  const cardless = createQuizApi({ docs, card: headlessCard(docs) });
  assert(isError(await cardless.quiz({ action: "open", ref: note.ref }), "not_available"), "A doc without questions cannot open in the card.");
});

test("the kill switch blocks quiz writes; quiz reads keep working; without docs the tool is not available", async () => {
  const { runner, control } = setup();
  const { ref } = ok(await runner.call("quiz", { ...VISION_QUIZ, open: false }));
  control.on = false;
  assert(isError(await runner.call("quiz", { action: "open", ref }), "agent_control_off"));
  assert(isError(await runner.call("quiz", VISION_QUIZ), "agent_control_off"));
  ok(await runner.call("read", { ref, detail: "results" }));

  const bare = setup({ withQuizzes: false });
  assert(isError(await bare.runner.call("quiz", VISION_QUIZ), "not_available"));
  assert(isError(await bare.runner.call("read", { ref: "quiz:k3f9", detail: "results" }), "not_available"), "Without quizzes, reads keep the Stage 1 answer.");
});

test("get_context reports quiz answers with ok; other activity has no ok field", () => {
  const { api, activity } = setup();
  activity.append({ by: "user", kind: "navigated", ref: "topic:vision" });
  activity.append({ by: "user", kind: "answered", ref: "block:q2abc", ok: false });
  const [navigated, answered] = api.context().activity;
  assert.equal("ok" in navigated, false);
  assert.deepEqual(answered, { seq: 2, by: "user", kind: "answered", ref: "block:q2abc", said: undefined, on: undefined, ok: false, ago: 0 });
});

/* ---------- Pick mode ---------- */

test("region clicks open the region, or answer while pick mode is on", () => {
  const state = createState(true);
  const pick = createPickMode(state);
  const shown = [];
  const picked = [];
  const missed = [];
  const cancelled = [];
  const changes = [];
  pick.onChange((active) => changes.push(active));
  const onRegion = routeRegionClicks(
    pick,
    (id) => shown.push(id),
    (id) => missed.push(id),
  );

  onRegion("v1");
  assert.deepEqual(shown, ["v1"], "Without pick mode the region opens.");

  const owner = {};
  pick.begin(["lgn", "ffa"], (id) => picked.push(id), { owner, onCancel: () => cancelled.push("first") });
  assert(pick.active && pick.owns(owner));
  assert.deepEqual(state.pick, ["lgn", "ffa"], "The scene shows markers for exactly these.");
  onRegion("v1");
  assert.deepEqual(missed, ["v1"], "A region that is not offered does not answer...");
  assert.deepEqual(shown, ["v1"], "...and does not open either.");
  assert(pick.active);
  onRegion("ffa");
  assert.deepEqual(picked, ["ffa"]);
  assert.deepEqual(shown, ["v1"]);
  assert.equal(pick.active, false);
  assert.equal(state.pick, null);
  onRegion("lgn");
  assert.deepEqual(shown, ["v1", "lgn"], "After the answer, clicks open regions again.");

  pick.begin(["mt", "v1"], () => assert.fail("cancelled picks never answer"), { onCancel: () => cancelled.push("second") });
  pick.begin(["a1", "mgn"], (id) => picked.push(id), { owner });
  assert.deepEqual(cancelled, ["second"], "A new pick cancels the one in progress.");
  pick.end({});
  assert(pick.active, "end() with another owner leaves the pick alone.");
  pick.cancel();
  assert.equal(state.pick, null);
  pick.begin(["a1", "mgn"], () => {}, { owner });
  pick.end(owner);
  assert.equal(pick.active, false);
  assert.deepEqual(changes, [true, false, true, true, false, true, false]);
});

/* ---------- Keyboard ---------- */

function keyboard(owner) {
  const state = { overview: false, step: 2, playing: true };
  const calls = [];
  const explorer = { selectPath: (id) => calls.push(["selectPath", id]), setStep: (step) => calls.push(["setStep", step]) };
  let dialog = false;
  let current = owner;
  const handle = createShortcutHandler(
    state,
    explorer,
    () => {},
    () => dialog,
    () => current,
  );
  const press = (key, target = { closest: () => null }) => {
    const event = { key, code: key.length === 1 ? `Digit${key}` : key, altKey: false, ctrlKey: false, metaKey: false, target, prevented: false };
    event.preventDefault = () => {
      event.prevented = true;
    };
    handle(event);
    return event;
  };
  return {
    calls,
    press,
    setDialog: (open) => {
      dialog = open;
    },
    setOwner: (next) => {
      current = next;
    },
  };
}

test("while the quiz card is open, keys 1–6 answer it and do not switch topics", () => {
  const session = createQuizSession([
    { id: "q1", question: { kind: "choice", prompt: "Which relays vision?", choices: ["A", "B", "C", "D", "E", "F"], answer: [5] } },
    { id: "q2", question: { kind: "truefalse", prompt: "True?", answer: true } },
  ]);
  // The card's key owner, as ui/quiz-card.ts builds it over its session.
  const card = {
    owns: (event) => session.ownsKey(event.key),
    handle: (event) => {
      event.preventDefault();
      session.handleKey(event.key);
    },
  };
  const keys = keyboard(card);
  for (const key of ["1", "2", "3", "4", "5", "6"]) {
    const event = keys.press(key);
    assert.deepEqual(session.current.draft.selected, [Number(key) - 1], key);
    assert(event.prevented);
  }
  assert.equal(keys.press("Enter").prevented, true);
  assert.equal(session.current.graded.correct, true);
  keys.press("ArrowRight");
  assert.equal(session.position, 1, "→ goes to the next question, not the next step.");
  keys.press("1");
  assert.deepEqual(session.current.draft.selected, true);
  // A focused button elsewhere does not stop the card from taking its keys.
  keys.press("2", { closest: () => ({ tagName: "BUTTON" }) });
  assert.equal(session.current.draft.selected, false);
  assert.deepEqual(keys.calls, [], "No topic or step changed while the card was open.");

  keys.press("ArrowLeft");
  assert.deepEqual(keys.calls, [["setStep", 1]], "← is not the card's; it still moves the walkthrough.");
  keys.setDialog(true);
  keys.press("1");
  assert.equal(session.current.draft.selected, false, "With About open, neither the card nor the guide takes keys.");
  keys.setDialog(false);

  keys.setOwner(null);
  keys.press("2");
  keys.press("ArrowRight");
  assert.deepEqual(keys.calls.slice(1), [
    ["selectPath", pathways[1].id],
    ["setStep", 3],
  ]);
});
