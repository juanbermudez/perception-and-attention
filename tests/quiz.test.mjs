// Quizzes without the DOM (spec §6.10, §10, §16): validation, grading for all five kinds, the results
// summary, the regions pick mode offers, and the card's session (keys, feedback, retry of missed questions).
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
const {
  validateQuestion,
  gradeAnswer,
  summarizeResults,
  pickChoices,
  showMeRef,
  shuffledOrder,
  RECALL_CHARS,
  createQuestionState,
  createQuizSession,
  regions,
} = await bundle(`
  export * from "./src/model/quiz.ts";
  export * from "./src/model/quiz-session.ts";
  export { regions } from "./src/content/regions.ts";
`);

const question = (input) => {
  const checked = validateQuestion(input);
  assert(checked.ok, checked.message);
  return checked.value;
};
const grade = (q, answer) => {
  const graded = gradeAnswer(q, answer);
  assert(graded.ok, graded.message);
  return graded.value;
};
const invalid = (q, answer) => assert.equal(gradeAnswer(q, answer).ok, false, JSON.stringify(answer));
/** A fixed sequence of "random" numbers, repeated. */
const sequence =
  (...values) =>
  () => {
    const value = values.shift();
    values.push(value);
    return value;
  };

/* ---------- Validation ---------- */

test("question refs are checked against the guide and stored in their stable form", () => {
  assert.equal(question({ kind: "truefalse", prompt: "p", answer: true, ref: "step:vision/3" }).ref, "step:vision/parallel-channels");
  assert.equal(question({ kind: "truefalse", prompt: "p", answer: true, ref: "REGION:LGN" }).ref, "region:lgn");
  const unknown = validateQuestion({ kind: "truefalse", prompt: "p", answer: true, ref: "region:visual cortex" });
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /^ref: .*region:v1/, "A near miss names the ref to use.");
  assert.equal(validateQuestion({ kind: "truefalse", prompt: "p", answer: true, ref: "nowhere" }).ok, false);
});

/* ---------- Grading ---------- */

test("choice: one answer is single-select; several make it multi-select, graded as a set", () => {
  const single = question({ kind: "choice", prompt: "Which relays vision?", choices: ["Pulvinar", "LGN", "MGN"], answer: [1] });
  assert.deepEqual(grade(single, [1]), { correct: true, answer: [1] });
  assert.deepEqual(grade(single, [2]), { correct: false, answer: [2] });
  invalid(single, [0, 1]);
  invalid(single, []);
  invalid(single, [3]);
  invalid(single, [1.5]);
  invalid(single, 1);

  const multi = question({ kind: "choice", prompt: "Thalamic relays?", choices: ["LGN", "MGN", "V1", "VPL"], answer: [3, 0, 1] });
  assert.deepEqual(grade(multi, [3, 1, 0, 1]), { correct: true, answer: [0, 1, 3] }, "Order and repeats do not matter.");
  assert.equal(grade(multi, [0, 1]).correct, false, "Missing one is wrong.");
  assert.equal(grade(multi, [0, 1, 2, 3]).correct, false, "An extra one is wrong.");
});

test("truefalse", () => {
  const q = question({ kind: "truefalse", prompt: "The LGN is in the thalamus.", answer: true });
  assert.deepEqual(grade(q, true), { correct: true, answer: true });
  assert.deepEqual(grade(q, false), { correct: false, answer: false });
  invalid(q, "true");
  invalid(q, undefined);
});

test("region: one click, right when it is any of the answer regions", () => {
  const q = question({ kind: "region", prompt: "Click a face or place area.", answer: ["ffa", "ppa"] });
  assert.deepEqual(grade(q, "ffa"), { correct: true, answer: "ffa" });
  assert.deepEqual(grade(q, "PPA"), { correct: true, answer: "ppa" }, "Ids are canonicalized.");
  assert.deepEqual(grade(q, "v1"), { correct: false, answer: "v1" });
  invalid(q, "atlantis");
  invalid(q, ["ffa"]);
  const listed = question({ kind: "region", prompt: "Click the relay.", answer: ["lgn"], choices: ["lgn", "v1"] });
  assert.equal(grade(listed, "v1").correct, false);
  invalid(listed, "mt");
});

test("order: the user's order as item indexes; identical items may swap", () => {
  const q = question({ kind: "order", prompt: "Order the route.", items: ["Retina", "Optic chiasm", "LGN", "V1"] });
  assert.deepEqual(grade(q, [0, 1, 2, 3]), { correct: true, answer: [0, 1, 2, 3] });
  assert.equal(grade(q, [1, 0, 2, 3]).correct, false);
  invalid(q, [0, 1, 2]);
  invalid(q, [0, 1, 2, 2]);
  invalid(q, [0, 1, 2, 4]);
  invalid(q, "0123");
  const twins = question({ kind: "order", prompt: "p", items: ["a", "b", "b"] });
  assert.equal(grade(twins, [0, 2, 1]).correct, true);
});

test("recall: self-graded; the typed text is kept, trimmed and clipped", () => {
  const q = question({ kind: "recall", prompt: "What is V1?", answer: "Primary visual cortex" });
  assert.deepEqual(grade(q, { text: "  visual cortex ", self: true }), { correct: true, answer: { text: "visual cortex", self: true } });
  assert.deepEqual(grade(q, { self: false }), { correct: false, answer: { text: "", self: false } });
  assert.equal(grade(q, { text: "x".repeat(RECALL_CHARS + 50), self: true }).answer.text.length, RECALL_CHARS);
  invalid(q, { text: "visual cortex" });
  invalid(q, { text: 3, self: true });
  invalid(q, "visual cortex");
});

/* ---------- Results ---------- */

test("the results summary counts each question's latest attempt", () => {
  const questions = [
    { id: "a", kind: "choice" },
    { id: "b", kind: "region" },
    { id: "c", kind: "recall" },
    { id: "d", kind: "order" },
  ];
  const attempts = [
    { blockId: "a", correct: false },
    { blockId: "b", correct: true },
    { blockId: "a", correct: true },
    { blockId: "b", correct: false },
    { blockId: "c", correct: null },
    { blockId: "elsewhere", correct: true },
  ];
  assert.deepEqual(summarizeResults(questions, attempts), {
    summary: { answered: 3, correct: 1, of: 4 },
    questions: [
      { id: "a", kind: "choice", attempts: 2, correct: 1, last: true },
      { id: "b", kind: "region", attempts: 2, correct: 1, last: false },
      { id: "c", kind: "recall", attempts: 1, correct: 0, last: null },
      { id: "d", kind: "order", attempts: 0, correct: 0 },
    ],
  });
  assert.deepEqual(summarizeResults([], []), { summary: { answered: 0, correct: 0, of: 0 }, questions: [] });
});

/* ---------- Pick mode choices, Show me, shuffling ---------- */

test("pick mode offers the question's choices, or its topic's regions in topic order", () => {
  const listed = question({ kind: "region", prompt: "p", answer: ["lgn"], choices: ["v1", "lgn"] });
  assert.deepEqual(pickChoices(listed), ["v1", "lgn"]);

  const faces = question({ kind: "region", prompt: "Faces?", answer: ["ffa"] });
  const vision = pickChoices(faces);
  assert.deepEqual(vision, ["retina", "chiasm", "lgn", "v1", "extrastriate", "mt", "parietal", "it", "ffa", "ppa", "eba", "vwfa"]);
  assert(!vision.includes("retinaR"), "The right-hand copy of a paired structure is left out.");
  assert.notEqual(vision[0], "ffa", "The answer keeps its topic position.");

  const hearing = pickChoices(question({ kind: "region", prompt: "p", answer: ["mgn"] }));
  assert(hearing.includes("mgn") && hearing.includes("a1"));
  for (const id of hearing) assert(!(id.endsWith("R") && `${id.slice(0, -1)}` in regions), `${id} is a mirror`);
  assert.deepEqual(
    pickChoices(question({ kind: "region", prompt: "p", answer: ["a1R"] })).filter((id) => id.startsWith("a1")),
    ["a1", "a1R"],
  );

  // Layers 5 and 6 share V1's spot: only one marker there, and the answer wins it.
  const loop = pickChoices(question({ kind: "region", prompt: "p", answer: ["l5"] }));
  assert(loop.includes("l5") && !loop.includes("v1") && !loop.includes("l6"), loop.join());
  const loopV1 = pickChoices(question({ kind: "region", prompt: "p", answer: ["trn"] }));
  assert(loopV1.includes("v1") && !loopV1.includes("l5") && !loopV1.includes("l6"), loopV1.join());
});

test("the default topic: the question's ref, then the open topic, then the first that covers the answer", () => {
  const parietal = (extra) => question({ kind: "region", prompt: "p", answer: ["parietal"], ...extra });
  assert(pickChoices(parietal()).includes("retina"), "Vision is first in UI order.");
  assert(pickChoices(parietal({ ref: "topic:touch" })).includes("s1"));
  assert(pickChoices(parietal({ ref: "step:hearing/1" })).includes("cochlea"));
  assert(pickChoices(parietal(), "attention").includes("pfc"));
  assert(pickChoices(parietal({ ref: "topic:touch" }), "attention").includes("s1"), "The ref wins over the open topic.");
  // No topic has both: every region is offered (still without mirrors).
  const mixed = pickChoices(question({ kind: "region", prompt: "p", answer: ["ffa", "cochlea"] }), "vision");
  assert(mixed.includes("ffa") && mixed.includes("cochlea") && mixed.includes("pfc"));
});

test("Show me goes to the question's ref, or a region question's answer", () => {
  assert.equal(showMeRef(question({ kind: "truefalse", prompt: "p", answer: true, ref: "region:mt" })), "region:mt");
  assert.equal(showMeRef(question({ kind: "region", prompt: "p", answer: ["ffa", "ppa"] })), "region:ffa");
  assert.equal(showMeRef(question({ kind: "truefalse", prompt: "p", answer: true })), null);
});

test("order questions start shuffled, never already in order", () => {
  for (let count = 2; count <= 8; count++)
    for (const random of [() => 0.999, () => 0, sequence(0.3, 0.7, 0.1)]) {
      const order = shuffledOrder(count, random);
      assert.deepEqual(
        [...order].sort((a, b) => a - b),
        [...Array(count).keys()],
      );
      assert(!order.every((index, position) => index === position), `${count}: ${order}`);
    }
  assert.deepEqual(shuffledOrder(1), [0]);
});

/* ---------- The card's session ---------- */

const VISION = [
  { id: "q1", question: question({ kind: "choice", prompt: "Which relays vision?", choices: ["Pulvinar", "LGN", "MGN"], answer: [1] }) },
  { id: "q2", question: question({ kind: "truefalse", prompt: "Nasal fibres cross.", answer: true }) },
  { id: "q3", question: question({ kind: "region", prompt: "Click the face area.", answer: ["ffa"] }) },
  { id: "q4", question: question({ kind: "order", prompt: "Order it.", items: ["Retina", "LGN", "V1"] }) },
  { id: "q5", question: question({ kind: "recall", prompt: "What does MT do?", answer: "Motion" }) },
];

function session(items = VISION, options = {}) {
  const attempts = [];
  const finished = [];
  const run = createQuizSession(items, {
    random: () => 0,
    onAttempt: (attempt) => attempts.push(attempt),
    onFinish: (score) => finished.push(score),
    ...options,
  });
  return { run, attempts, finished };
}

test("keys 1–6 choose, Enter submits, → goes on; every submission is an attempt", () => {
  const { run, attempts, finished } = session();
  assert.equal(run.handleKey("ArrowRight"), false, "→ waits for an answer.");
  assert.equal(run.handleKey("Enter"), false, "Nothing chosen, nothing to submit.");
  assert(run.handleKey("3"));
  assert(run.handleKey("2"));
  assert.deepEqual(run.current.draft.selected, [1], "Single-select: the last key wins.");
  assert.equal(run.handleKey("5"), false, "Only 3 choices.");
  assert(run.handleKey("Enter"));
  assert.deepEqual(attempts, [{ block: "q1", answer: [1], correct: true }]);
  assert.equal(run.handleKey("1"), false, "Answered questions are locked.");
  assert.deepEqual(run.dots(), ["active", "todo", "todo", "todo", "todo"]);
  assert(run.handleKey("ArrowRight"));
  assert.deepEqual(run.dots(), ["correct", "active", "todo", "todo", "todo"]);

  run.handleKey("2"); // false
  run.handleKey("Enter");
  assert.deepEqual(attempts.at(-1), { block: "q2", answer: false, correct: false });
  run.handleKey("Enter"); // Enter also goes on after feedback

  // Region: pick mode answers on the click; keys have nothing to choose there.
  assert.equal(run.current.draft.mode, "pick");
  assert.equal(run.handleKey("1"), false);
  assert.equal(run.current.pick("pfc"), null, "Not one of the offered regions.");
  assert.equal(run.current.pick("ffa").correct, true);
  run.next();

  // Order: shuffled; the moves put it right.
  const shown = run.current.draft.order;
  assert.notDeepEqual(shown, [0, 1, 2]);
  assert(run.current.setOrder([0, 1, 2]));
  run.handleKey("Enter");
  assert.deepEqual(attempts.at(-1), { block: "q4", answer: [0, 1, 2], correct: true });
  run.handleKey("ArrowRight");

  // Recall: type, Enter reveals, then 1 = Got it, 2 = Missed it.
  run.current.setText("motion");
  assert.equal(run.handleKey("1"), false, "Nothing to mark before the reveal.");
  assert(run.handleKey("Enter"));
  assert(run.current.draft.revealed);
  assert(run.handleKey("2"));
  assert.deepEqual(attempts.at(-1), { block: "q5", answer: { text: "motion", self: false }, correct: false });
  assert.equal(finished.length, 0);
  assert(run.handleKey("ArrowRight"));
  assert(run.done);
  assert.deepEqual(finished, [{ correct: 3, of: 5, missed: ["q2", "q5"] }]);
  assert.deepEqual(run.dots(), ["correct", "missed", "correct", "correct", "missed"]);
  assert.equal(attempts.length, 5);
});

test("Retry the ones I missed runs only those; Start over runs all", () => {
  const { run, attempts } = session();
  const answers = [["1"], ["1"], null, [], ["Enter", "1"]];
  for (const keys of answers) {
    if (keys === null) run.current.pick("v1");
    else for (const key of keys) run.handleKey(key);
    if (!run.current.graded) run.handleKey("Enter");
    run.handleKey("ArrowRight");
  }
  assert(run.done);
  const score = run.score();
  assert.deepEqual(score.missed, ["q1", "q3", "q4"]);
  assert(run.handleKey("Enter"), "Enter on the end screen retries the missed questions.");
  assert.deepEqual(
    run.run.map((item) => item.id),
    ["q1", "q3", "q4"],
  );
  assert.equal(run.position, 0);
  assert.deepEqual(run.dots(), ["active", "todo", "todo"]);
  run.handleKey("2");
  run.handleKey("Enter");
  assert.deepEqual(attempts.at(-1), { block: "q1", answer: [1], correct: true });
  run.restart();
  assert.equal(run.run.length, 5);
  assert.equal(run.retryMissed(), false, "Only from the end screen.");
});

test("region questions can be answered from a list; multi-select toggles", () => {
  const items = [
    { id: "r", question: question({ kind: "region", prompt: "Click the relay.", answer: ["lgn"], choices: ["v1", "lgn", "mt"] }) },
    { id: "m", question: question({ kind: "choice", prompt: "Relays?", choices: ["LGN", "MGN", "V1"], answer: [0, 1] }) },
  ];
  const { run, attempts } = session(items, { regionMode: "list" });
  assert.equal(run.current.draft.mode, "list");
  assert(run.handleKey("2"));
  assert.equal(run.current.draft.selected, "lgn");
  run.handleKey("Enter");
  assert.deepEqual(attempts.at(-1), { block: "r", answer: "lgn", correct: true });
  run.next();
  run.handleKey("1");
  run.handleKey("3");
  run.handleKey("3");
  run.handleKey("2");
  assert.deepEqual(run.current.draft.selected, [0, 1]);
  run.handleKey("Enter");
  assert.equal(attempts.at(-1).correct, true);

  const state = createQuestionState(items[0], { regionMode: "pick" });
  assert(state.setMode("idle"), "Esc leaves pick mode");
  assert.equal(state.canSubmit(), false);
  assert(state.setMode("list"));
  state.choose(0);
  assert.equal(state.submit().correct, false);
  assert.equal(state.setMode("pick"), false, "Answered questions stay as they are.");
});

test("an edited quiz keeps the place and the answers given", () => {
  const { run } = session();
  run.handleKey("2");
  run.handleKey("Enter");
  run.next();
  const edited = VISION.map((item) =>
    item.id === "q2" ? { id: "q2", question: question({ kind: "truefalse", prompt: "Nasal fibres cross at the chiasm.", answer: true }) } : item,
  );
  run.update([...edited.slice(0, 3), { id: "q6", question: question({ kind: "truefalse", prompt: "New", answer: false }) }, ...edited.slice(3)]);
  assert.equal(run.position, 1);
  assert.equal(run.current.item.question.prompt, "Nasal fibres cross at the chiasm.", "The unanswered current question takes the edit.");
  assert.equal(run.run.length, 6);
  assert.deepEqual(run.dots(), ["correct", "active", "todo", "todo", "todo", "todo"]);
  run.update(edited.filter((item) => item.id !== "q2"));
  assert.equal(run.current.item.id, "q3", "A removed current question moves on to the next.");
});

test("a quiz session needs questions", () => {
  assert.throws(() => createQuizSession([]), /at least one question/);
});
