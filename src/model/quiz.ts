// Quiz questions (spec §6.10): the type and its validation. Grading is added in Stage 5.

import { regions } from "../content/regions";
import type { RegionId } from "../content/types";
import { LIMITS } from "../store/limits";

interface QuestionBase {
  prompt: string;
  explain?: string;
  /** Where "Show me" goes, e.g. `step:vision/parallel-channels` or `region:v1`. */
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

export const QUESTION_KINDS = ["choice", "truefalse", "region", "order", "recall"] as const;

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

const regionIds = new Map(Object.keys(regions).map((id) => [id.toLowerCase(), id as RegionId]));
const isText = (input: unknown, max: number = LIMITS.charsPerBlock): input is string =>
  typeof input === "string" && input.trim().length > 0 && input.length <= max;

function regionList(input: unknown, what: string, min: number, max: number): Checked<RegionId[]> {
  if (!Array.isArray(input) || input.length < min || input.length > max) return { ok: false, message: `${what} must list ${min}–${max} region ids.` };
  const ids: RegionId[] = [];
  for (const id of input) {
    const known = typeof id === "string" ? regionIds.get(id.toLowerCase()) : undefined;
    if (!known) return { ok: false, message: `${what}: "${String(id)}" is not a region id. See read({ ref: "help" }).` };
    if (!ids.includes(known)) ids.push(known);
  }
  return { ok: true, value: ids };
}

function textList(input: unknown, what: string, min: number, max: number): Checked<string[]> {
  if (!Array.isArray(input) || input.length < min || input.length > max || !input.every((item) => isText(item, LIMITS.promptChars)))
    return { ok: false, message: `${what} must be ${min}–${max} non-empty strings of at most ${LIMITS.promptChars} characters.` };
  return { ok: true, value: input.map((item: string) => item.trim()) };
}

/** Checks a question from an agent or a markdown file and returns a clean copy (unknown fields dropped). */
export function validateQuestion(input: unknown): Checked<Question> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, message: "A question must be an object." };
  const raw = input as Record<string, unknown>;
  if (!QUESTION_KINDS.includes(raw.kind as never)) return { ok: false, message: `Question kind must be one of ${QUESTION_KINDS.join(", ")}.` };
  if (!isText(raw.prompt, LIMITS.promptChars)) return { ok: false, message: `A question needs a prompt of 1–${LIMITS.promptChars} characters.` };
  const base: QuestionBase = { prompt: raw.prompt.trim() };
  if (raw.explain !== undefined) {
    if (!isText(raw.explain)) return { ok: false, message: "explain must be non-empty text." };
    base.explain = raw.explain.trim();
  }
  if (raw.ref !== undefined) {
    if (!isText(raw.ref, 200)) return { ok: false, message: "ref must be a ref string such as region:v1." };
    base.ref = raw.ref.trim();
  }
  if (raw.view !== undefined) {
    if (typeof raw.view !== "object" || raw.view === null || Array.isArray(raw.view)) return { ok: false, message: "view must be a view object." };
    base.view = raw.view as Record<string, unknown>;
  }
  switch (raw.kind) {
    case "choice": {
      const choices = textList(raw.choices, "choices", 2, 6);
      if (!choices.ok) return choices;
      const answer = raw.answer;
      if (!Array.isArray(answer) || answer.length === 0 || !answer.every((index) => Number.isInteger(index) && index >= 0 && index < choices.value.length))
        return { ok: false, message: `answer must list the correct choice indexes (0 to ${choices.value.length - 1}).` };
      return { ok: true, value: { kind: "choice", ...base, choices: choices.value, answer: [...new Set(answer as number[])].sort((a, b) => a - b) } };
    }
    case "truefalse":
      if (typeof raw.answer !== "boolean") return { ok: false, message: "answer must be true or false." };
      return { ok: true, value: { kind: "truefalse", ...base, answer: raw.answer } };
    case "region": {
      const answer = regionList(raw.answer, "answer", 1, 12);
      if (!answer.ok) return answer;
      if (raw.choices === undefined) return { ok: true, value: { kind: "region", ...base, answer: answer.value } };
      const choices = regionList(raw.choices, "choices", 2, 12);
      if (!choices.ok) return choices;
      if (!answer.value.every((id) => choices.value.includes(id))) return { ok: false, message: "Every answer region must be one of the choices." };
      return { ok: true, value: { kind: "region", ...base, answer: answer.value, choices: choices.value } };
    }
    case "order": {
      const items = textList(raw.items, "items", 3, 8);
      if (!items.ok) return items;
      return { ok: true, value: { kind: "order", ...base, items: items.value } };
    }
    default:
      if (!isText(raw.answer, LIMITS.promptChars)) return { ok: false, message: `answer must be 1–${LIMITS.promptChars} characters.` };
      return { ok: true, value: { kind: "recall", ...base, answer: raw.answer.trim() } };
  }
}
