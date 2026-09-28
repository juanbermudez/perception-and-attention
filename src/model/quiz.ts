// Quiz questions (spec §6.10, §10): the type, its validation, grading for the five kinds, the results
// summary, and the pure choices behind the card (which regions a region question offers, where
// "Show me" goes, the shuffled order of an order question). No DOM; tested in Node.

import { pathways } from "../content/pathways";
import { regions } from "../content/regions";
import type { PathId, RegionId } from "../content/types";
import { LIMITS } from "../store/limits";
import { formatRef, resolveRef } from "./refs";
import { pathwayById, topicRegions } from "./topics";

interface QuestionBase {
  prompt: string;
  explain?: string;
  /** Where "Show me" goes, e.g. `step:vision/parallel-channels` or `region:v1`. Stored in the stable form. */
  ref?: string;
  /** A view to show with "Show me" (a ViewPatch; checked by the view API). */
  view?: Record<string, unknown>;
}

export type Question =
  | (QuestionBase & { kind: "choice"; choices: string[]; answer: number[] })
  | (QuestionBase & { kind: "truefalse"; answer: boolean })
  | (QuestionBase & { kind: "region"; answer: RegionId[]; choices?: RegionId[] })
  | (QuestionBase & { kind: "order"; items: string[] })
  | (QuestionBase & { kind: "recall"; answer: string });

export type QuestionKind = Question["kind"];
export type RegionQuestion = Extract<Question, { kind: "region" }>;

export const QUESTION_KINDS = ["choice", "truefalse", "region", "order", "recall"] as const;

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

const regionIds = new Map(Object.keys(regions).map((id) => [id.toLowerCase(), id as RegionId]));
const isText = (input: unknown, max: number = LIMITS.charsPerBlock): input is string =>
  typeof input === "string" && input.trim().length > 0 && input.length <= max;
const bad = (message: string): { ok: false; message: string } => ({ ok: false, message });

function regionList(input: unknown, what: string, min: number, max: number): Checked<RegionId[]> {
  if (!Array.isArray(input) || input.length < min || input.length > max) return bad(`${what} must list ${min}–${max} region ids.`);
  const ids: RegionId[] = [];
  for (const id of input) {
    const known = typeof id === "string" ? regionIds.get(id.toLowerCase()) : undefined;
    if (!known) return bad(`${what}: "${String(id)}" is not a region id. See read({ ref: "help" }).`);
    if (!ids.includes(known)) ids.push(known);
  }
  return { ok: true, value: ids };
}

function textList(input: unknown, what: string, min: number, max: number): Checked<string[]> {
  if (!Array.isArray(input) || input.length < min || input.length > max || !input.every((item) => isText(item, LIMITS.promptChars)))
    return bad(`${what} must be ${min}–${max} non-empty strings of at most ${LIMITS.promptChars} characters.`);
  return { ok: true, value: input.map((item: string) => item.trim()) };
}

/** A "Show me" ref: any ref the guide knows, stored in its stable form (`step:vision/3` becomes the step's key). */
function checkRef(input: unknown): Checked<string> {
  if (!isText(input, 200)) return bad("ref must be a ref string such as region:v1.");
  const resolved = resolveRef(input);
  if ("error" in resolved) {
    const options = resolved.error.options?.length ? ` Did you mean ${resolved.error.options.join(", ")}?` : "";
    return bad(`ref: ${resolved.error.message}${options}`);
  }
  return { ok: true, value: formatRef(resolved.ref) };
}

/** Checks a question from an agent or a markdown file and returns a clean copy (unknown fields dropped). */
export function validateQuestion(input: unknown): Checked<Question> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return bad("A question must be an object.");
  const raw = input as Record<string, unknown>;
  if (!QUESTION_KINDS.includes(raw.kind as never)) return bad(`Question kind must be one of ${QUESTION_KINDS.join(", ")}.`);
  if (!isText(raw.prompt, LIMITS.promptChars)) return bad(`A question needs a prompt of 1–${LIMITS.promptChars} characters.`);
  const base: QuestionBase = { prompt: raw.prompt.trim() };
  if (raw.explain !== undefined) {
    if (!isText(raw.explain)) return bad("explain must be non-empty text.");
    base.explain = raw.explain.trim();
  }
  if (raw.ref !== undefined) {
    const ref = checkRef(raw.ref);
    if (!ref.ok) return ref;
    base.ref = ref.value;
  }
  if (raw.view !== undefined) {
    if (typeof raw.view !== "object" || raw.view === null || Array.isArray(raw.view)) return bad("view must be a view object.");
    base.view = raw.view as Record<string, unknown>;
  }
  switch (raw.kind) {
    case "choice": {
      const choices = textList(raw.choices, "choices", 2, 6);
      if (!choices.ok) return choices;
      const answer = raw.answer;
      if (!Array.isArray(answer) || answer.length === 0 || !answer.every((index) => Number.isInteger(index) && index >= 0 && index < choices.value.length))
        return bad(`answer must list the correct choice indexes (0 to ${choices.value.length - 1}).`);
      return { ok: true, value: { kind: "choice", ...base, choices: choices.value, answer: [...new Set(answer as number[])].sort((a, b) => a - b) } };
    }
    case "truefalse":
      if (typeof raw.answer !== "boolean") return bad("answer must be true or false.");
      return { ok: true, value: { kind: "truefalse", ...base, answer: raw.answer } };
    case "region": {
      const answer = regionList(raw.answer, "answer", 1, 12);
      if (!answer.ok) return answer;
      if (raw.choices === undefined) return { ok: true, value: { kind: "region", ...base, answer: answer.value } };
      const choices = regionList(raw.choices, "choices", 2, 12);
      if (!choices.ok) return choices;
      if (!answer.value.every((id) => choices.value.includes(id))) return bad("Every answer region must be one of the choices.");
      return { ok: true, value: { kind: "region", ...base, answer: answer.value, choices: choices.value } };
    }
    case "order": {
      const items = textList(raw.items, "items", 3, 8);
      if (!items.ok) return items;
      return { ok: true, value: { kind: "order", ...base, items: items.value } };
    }
    default:
      if (!isText(raw.answer, LIMITS.promptChars)) return bad(`answer must be 1–${LIMITS.promptChars} characters.`);
      return { ok: true, value: { kind: "recall", ...base, answer: raw.answer.trim() } };
  }
}

// ── Grading ───────────────────────────────────────────────────────────────────────────────────

/** What the user typed for a recall question is kept with the attempt, up to this many characters. */
export const RECALL_CHARS = 1000;

/**
 * An answer as the card submits it and `attempts.answer` stores it:
 * - choice: the chosen indexes (sorted)
 * - truefalse: true or false
 * - region: the region clicked (one id)
 * - order: item indexes in the order the user put them
 * - recall: `{ text, self }`, where `self` is the user's own "Got it" (true) or "Missed it" (false)
 */
export type AttemptAnswer = number[] | boolean | RegionId | { text: string; self: boolean };

export interface Graded {
  correct: boolean;
  /** The answer, cleaned, as it is stored. */
  answer: AttemptAnswer;
}

const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((item, index) => item === b[index]);

/** Grades one submission. A malformed answer (wrong shape, index out of range) is an error, not a wrong answer. */
export function gradeAnswer(question: Question, input: unknown): Checked<Graded> {
  switch (question.kind) {
    case "choice": {
      const count = question.choices.length;
      if (!Array.isArray(input) || input.length === 0 || !input.every((index) => Number.isInteger(index) && index >= 0 && index < count))
        return bad(`Choose from the ${count} choices by index (0 to ${count - 1}).`);
      const picked = [...new Set(input as number[])].sort((a, b) => a - b);
      if (question.answer.length === 1 && picked.length > 1) return bad("This question takes one choice.");
      return { ok: true, value: { correct: sameList(picked, question.answer), answer: picked } };
    }
    case "truefalse":
      if (typeof input !== "boolean") return bad("Answer true or false.");
      return { ok: true, value: { correct: input === question.answer, answer: input } };
    case "region": {
      const id = typeof input === "string" ? regionIds.get(input.toLowerCase()) : undefined;
      if (!id) return bad(`"${String(input)}" is not a region id.`);
      if (question.choices && !question.choices.includes(id)) return bad(`${id} is not one of this question's regions.`);
      return { ok: true, value: { correct: question.answer.includes(id), answer: id } };
    }
    case "order": {
      const count = question.items.length;
      const order = input as number[];
      if (
        !Array.isArray(order) ||
        order.length !== count ||
        !order.every((index) => Number.isInteger(index)) ||
        !sameList(
          [...order].sort((a, b) => a - b),
          [...order.keys()],
        )
      )
        return bad(`Give the order as the ${count} item indexes (0 to ${count - 1}), each once.`);
      // Compared by text, so two identical items may swap places.
      const correct = order.every((index, position) => question.items[index] === question.items[position]);
      return { ok: true, value: { correct, answer: [...order] } };
    }
    case "recall": {
      const answer = input as { text?: unknown; self?: unknown } | null;
      if (typeof answer !== "object" || answer === null || typeof answer.self !== "boolean" || (answer.text !== undefined && typeof answer.text !== "string"))
        return bad('A recall answer is { text, self }, where self is the user\'s own "Got it" (true) or "Missed it" (false).');
      const text = (answer.text ?? "").trim().slice(0, RECALL_CHARS);
      return { ok: true, value: { correct: answer.self, answer: { text, self: answer.self } } };
    }
  }
}

// ── Results ───────────────────────────────────────────────────────────────────────────────────

export interface QuestionResult {
  id: string;
  kind: string;
  attempts: number;
  correct: number;
  /** Whether the latest attempt was right; missing before the first attempt. */
  last?: boolean | null;
}
export interface ResultsSummary {
  /** Questions with at least one attempt. */
  answered: number;
  /** Questions whose latest attempt was right. */
  correct: number;
  of: number;
}

/** `read(quiz, "results")` (spec §6.10): per question, and a summary that counts each question's latest attempt. */
export function summarizeResults(
  questions: readonly { id: string; kind: string }[],
  attempts: readonly { blockId: string; correct: boolean | null }[],
): { summary: ResultsSummary; questions: QuestionResult[] } {
  const rows = questions.map(({ id, kind }) => {
    const mine = attempts.filter((attempt) => attempt.blockId === id);
    const row: QuestionResult = { id, kind, attempts: mine.length, correct: mine.filter((attempt) => attempt.correct === true).length };
    if (mine.length) row.last = mine[mine.length - 1].correct;
    return row;
  });
  return {
    summary: {
      answered: rows.filter((row) => row.attempts > 0).length,
      correct: rows.filter((row) => row.last === true).length,
      of: rows.length,
    },
    questions: rows,
  };
}

// ── Region questions: which markers pick mode offers ─────────────────────────────────────────

/** Markers closer than this share a spot on screen (V1 and its layers 5 and 6). */
const SAME_SPOT = 0.03;
const distance = (a: RegionId, b: RegionId) => {
  const [p, q] = [regions[a].position, regions[b].position];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
/** `mgnR` mirrors `mgn`: the right-hand copy of a paired structure. */
const mirrorOf = (id: RegionId): RegionId | null => {
  const base = id.endsWith("R") ? (id.slice(0, -1) as RegionId) : null;
  return base && base in regions ? base : null;
};
const topicPool = (path: PathId) => {
  const { inSteps, onRoutes } = topicRegions(pathwayById(path));
  return [...inSteps, ...onRoutes];
};

/** The topic a question belongs to: its ref's topic, else the open one, else the first (in UI order) that covers every answer region. */
function questionTopic(question: RegionQuestion, openTopic: PathId | null): PathId | null {
  const candidates: PathId[] = [];
  const resolved = question.ref ? resolveRef(question.ref) : null;
  if (resolved && "ref" in resolved) {
    const { ref } = resolved;
    if (ref.kind === "topic" || ref.kind === "step") candidates.push(ref.path);
    if (ref.kind === "region") candidates.push(...pathways.filter((path) => topicPool(path.id).includes(ref.id)).map((path) => path.id));
  }
  if (openTopic) candidates.push(openTopic);
  candidates.push(...pathways.map((path) => path.id));
  return candidates.find((path) => question.answer.every((id) => topicPool(path).includes(id))) ?? null;
}

/**
 * The regions pick mode offers: the question's `choices`, or by default its topic's regions (spec §10),
 * in the topic's order so the position gives nothing away. Defaults leave out right-hand copies of paired
 * structures and markers that share a spot with another, unless they are an answer.
 */
export function pickChoices(question: RegionQuestion, openTopic: PathId | null = null): RegionId[] {
  if (question.choices) return [...question.choices];
  const answer = new Set(question.answer);
  const topic = questionTopic(question, openTopic);
  const pool = topic ? topicPool(topic) : (Object.keys(regions) as RegionId[]);
  const kept = new Set(answer);
  for (const id of pool) {
    if (kept.has(id)) continue;
    const mirror = mirrorOf(id);
    if (mirror && pool.includes(mirror)) continue;
    if ([...kept].some((other) => distance(id, other) < SAME_SPOT)) continue;
    kept.add(id);
  }
  return pool.filter((id) => kept.has(id)).concat([...answer].filter((id) => !pool.includes(id)));
}

// ── Card helpers ──────────────────────────────────────────────────────────────────────────────

/** Where "Show me" goes: the question's ref, or for a region question its (first) answer region. */
export function showMeRef(question: Question): string | null {
  if (question.ref) return question.ref;
  return question.kind === "region" ? `region:${question.answer[0]}` : null;
}

/** Item indexes in a shuffled display order that is never already correct (for 2 or more items). */
export function shuffledOrder(count: number, random: () => number = Math.random): number[] {
  const order = [...Array(count).keys()];
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (count > 1 && order.every((index, position) => index === position)) order.push(order.shift()!);
  return order;
}
