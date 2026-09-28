// The quiz card's state, without the DOM (spec §10). `createQuestionState` is one question being
// answered: its draft (what is chosen, typed or ordered so far), submission and grade. `createQuizSession`
// runs a list of them one at a time, keeps the score, retries the missed ones, and maps keys 1–6, Enter
// and → to answers. The card (ui/quiz-card.ts) and inline question blocks (ui/question-view.ts) render
// from these; tests drive them directly.

import type { RegionId } from "../content/types";
import { type Graded, gradeAnswer, pickChoices, type Question, type RegionQuestion, shuffledOrder } from "./quiz";

export interface QuizItem {
  /** The question block's id. */
  id: string;
  question: Question;
}

/** How a region question is answered: on the brain (pick mode), from a list, or not started (pick mode was cancelled). */
export type RegionMode = "pick" | "list" | "idle";

export type Draft =
  | { kind: "choice"; selected: number[]; multi: boolean }
  | { kind: "truefalse"; selected: boolean | null }
  | { kind: "region"; selected: RegionId | null; choices: RegionId[]; mode: RegionMode }
  | { kind: "order"; order: number[] }
  | { kind: "recall"; text: string; revealed: boolean };

export interface QuestionStateOptions {
  random?: () => number;
  /** The regions a region question offers (default: its `choices`, else its topic's regions). */
  choices?: (question: RegionQuestion) => RegionId[];
  /** How a region question starts: "pick" in the card, "idle" inline in a doc, "list" without a 3D view. */
  regionMode?: RegionMode;
  onGraded?: (graded: Graded, item: QuizItem) => void;
}

/** Keys 1–6 pick an option; there are at most six. */
export const OPTION_KEYS = 6;
const KEY_OPTION = /^[1-6]$/;

function initialDraft(question: Question, options: QuestionStateOptions): Draft {
  switch (question.kind) {
    case "choice":
      return { kind: "choice", selected: [], multi: question.answer.length > 1 };
    case "truefalse":
      return { kind: "truefalse", selected: null };
    case "region":
      return { kind: "region", selected: null, choices: (options.choices ?? pickChoices)(question), mode: options.regionMode ?? "pick" };
    case "order":
      return { kind: "order", order: shuffledOrder(question.items.length, options.random) };
    case "recall":
      return { kind: "recall", text: "", revealed: false };
  }
}

export function createQuestionState(item: QuizItem, options: QuestionStateOptions = {}) {
  const { question } = item;
  let draft = initialDraft(question, options);
  let graded: Graded | null = null;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
    return true;
  };

  function finish(answer: unknown): Graded | null {
    if (graded) return null;
    const result = gradeAnswer(question, answer);
    if (!result.ok) return null;
    graded = result.value;
    options.onGraded?.(graded, item);
    changed();
    return graded;
  }

  /** How many options keys 1–6 can choose from right now. */
  function optionCount(): number {
    if (graded) return 0;
    switch (draft.kind) {
      case "choice":
        return question.kind === "choice" ? question.choices.length : 0;
      case "truefalse":
        return 2;
      case "region":
        return draft.mode === "list" ? draft.choices.length : 0;
      case "recall":
        return draft.revealed ? 2 : 0;
      default:
        return 0;
    }
  }

  function canSubmit(): boolean {
    if (graded) return false;
    switch (draft.kind) {
      case "choice":
        return draft.selected.length > 0;
      case "truefalse":
      case "region":
        return draft.selected !== null;
      case "order":
        return true;
      case "recall":
        return false;
    }
  }

  return {
    item,
    get draft(): Readonly<Draft> {
      return draft;
    },
    get graded() {
      return graded;
    },
    optionCount,
    /**
     * Option `n` (0-based, as shown): selects a choice (or toggles it, for multi-select), true (0) or false (1),
     * a region in the list, or after a recall reveal "Got it" (0) or "Missed it" (1), which submits.
     */
    choose(n: number): boolean {
      if (!Number.isInteger(n) || n < 0 || n >= optionCount()) return false;
      switch (draft.kind) {
        case "choice": {
          const selected = draft.multi
            ? draft.selected.includes(n)
              ? draft.selected.filter((i) => i !== n)
              : [...draft.selected, n].sort((a, b) => a - b)
            : [n];
          draft = { ...draft, selected };
          return changed();
        }
        case "truefalse":
          draft = { ...draft, selected: n === 0 };
          return changed();
        case "region":
          draft = { ...draft, selected: draft.choices[n] };
          return changed();
        case "recall":
          return finish({ text: draft.text, self: n === 0 }) !== null;
        default:
          return false;
      }
    },
    canSubmit,
    /** Grades the draft. Recall questions are graded by `selfGrade` instead. */
    submit(): Graded | null {
      if (!canSubmit()) return null;
      switch (draft.kind) {
        case "choice":
          return finish(draft.selected);
        case "truefalse":
        case "region":
          return finish(draft.selected);
        case "order":
          return finish(draft.order);
        default:
          return null;
      }
    },
    /** A click on the brain in pick mode: answers at once (spec §10). */
    pick(id: RegionId): Graded | null {
      if (graded || draft.kind !== "region" || !draft.choices.includes(id)) return null;
      draft = { ...draft, selected: id };
      return finish(id);
    },
    setMode(mode: RegionMode): boolean {
      if (graded || draft.kind !== "region" || draft.mode === mode) return false;
      draft = { ...draft, mode, selected: mode === "list" ? draft.selected : null };
      return changed();
    },
    /** Order questions: move the item at display position `from` to `to`. */
    move(from: number, to: number): boolean {
      if (graded || draft.kind !== "order") return false;
      const order = [...draft.order];
      if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return false;
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      draft = { ...draft, order };
      return changed();
    },
    /** Order questions: the whole display order at once (after a drag). */
    setOrder(order: number[]): boolean {
      if (graded || draft.kind !== "order" || order.length !== draft.order.length || ![...order].sort((a, b) => a - b).every((v, i) => v === i)) return false;
      if (order.every((v, i) => v === (draft as { order: number[] }).order[i])) return false;
      draft = { ...draft, order: [...order] };
      return changed();
    },
    setText(text: string) {
      if (graded || draft.kind !== "recall" || draft.revealed) return;
      draft = { ...draft, text };
    },
    /** Recall: lock the typed answer and show the model answer. */
    reveal(): boolean {
      if (graded || draft.kind !== "recall" || draft.revealed) return false;
      draft = { ...draft, revealed: true };
      return changed();
    },
    /** Recall: the user's own verdict after the reveal; this is the submission. */
    selfGrade(correct: boolean): Graded | null {
      if (draft.kind !== "recall" || !draft.revealed) return null;
      return finish({ text: draft.text, self: correct });
    },
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type QuestionState = ReturnType<typeof createQuestionState>;

export type DotState = "active" | "correct" | "missed" | "todo";

export interface SessionScore {
  correct: number;
  of: number;
  /** Ids of the questions answered wrong in this run. */
  missed: string[];
}

export interface QuizSessionOptions extends Omit<QuestionStateOptions, "onGraded"> {
  /** Every submission, for the `attempts` table. */
  onAttempt?: (attempt: { block: string; answer: Graded["answer"]; correct: boolean }) => void;
  /** The last question of a run was answered. */
  onFinish?: (score: SessionScore) => void;
}

export function createQuizSession(initial: QuizItem[], options: QuizSessionOptions = {}) {
  if (!initial.length) throw new Error("A quiz session needs at least one question.");
  let items = initial;
  /** The questions in this run: all of them, or the ones missed last time. */
  let run = items;
  let position = 0;
  let results = new Map<string, boolean>();
  let done = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  function stateFor(item: QuizItem): QuestionState {
    const state = createQuestionState(item, {
      ...options,
      onGraded: (graded) => {
        results.set(item.id, graded.correct);
        options.onAttempt?.({ block: item.id, answer: graded.answer, correct: graded.correct });
      },
    });
    state.onChange(emit);
    return state;
  }
  let current = stateFor(run[0]);

  function score(): SessionScore {
    const answered = run.filter((item) => results.has(item.id));
    return {
      correct: answered.filter((item) => results.get(item.id)).length,
      of: run.length,
      missed: answered.filter((item) => results.get(item.id) === false).map((item) => item.id),
    };
  }

  function start(next: QuizItem[]) {
    run = next;
    position = 0;
    results = new Map();
    done = false;
    current = stateFor(run[0]);
    emit();
  }

  const session = {
    get items(): readonly QuizItem[] {
      return items;
    },
    get run(): readonly QuizItem[] {
      return run;
    },
    /** 0-based position in the run. */
    get position() {
      return position;
    },
    get current() {
      return current;
    },
    /** True on the end screen. */
    get done() {
      return done;
    },
    score,
    /** One progress dot per question in the run, in the style of the walkthrough's step dots. */
    dots(): DotState[] {
      return run.map((item, index) => (!done && index === position ? "active" : results.has(item.id) ? (results.get(item.id) ? "correct" : "missed") : "todo"));
    },
    /** After feedback: the next question, or the end screen after the last. */
    next(): boolean {
      if (done || !current.graded) return false;
      if (position + 1 >= run.length) {
        done = true;
        emit();
        options.onFinish?.(score());
        return true;
      }
      position += 1;
      current = stateFor(run[position]);
      emit();
      return true;
    },
    /** "Retry the ones I missed": a new run of only the questions answered wrong. */
    retryMissed(): boolean {
      const missed = new Set(score().missed);
      if (!done || !missed.size) return false;
      start(run.filter((item) => missed.has(item.id)));
      return true;
    },
    /** From question 1, every question. */
    restart() {
      start(items);
    },
    /**
     * The questions changed (an agent edited the quiz). Keeps the place and the answers given, drops removed
     * questions, and restarts the current one if its content changed before it was answered.
     */
    update(next: QuizItem[]) {
      if (!next.length) return;
      const byId = new Map(next.map((item) => [item.id, item]));
      const full = run === items;
      const currentId = run[position]?.id;
      const before = run[position];
      items = next;
      run = full ? next : run.filter((item) => byId.has(item.id)).map((item) => byId.get(item.id)!);
      if (!run.length) run = next;
      const found = run.findIndex((item) => item.id === currentId);
      position = found >= 0 ? found : Math.min(position, run.length - 1);
      const now = run[position];
      if (!done && (now.id !== before?.id || (!current.graded && JSON.stringify(now.question) !== JSON.stringify(before.question)))) current = stateFor(now);
      emit();
    },
    /** Keys the card takes from the guide's shortcuts while it is open: 1–6, Enter and →. */
    ownsKey(key: string): boolean {
      return KEY_OPTION.test(key) || key === "Enter" || key === "ArrowRight";
    },
    /**
     * 1–6 choose an option; Enter submits (or reveals a recall answer, or goes on after feedback);
     * → goes on after feedback. On the end screen, Enter retries the missed questions. Returns whether anything happened.
     */
    handleKey(key: string): boolean {
      if (done) return key === "Enter" ? session.retryMissed() : false;
      if (KEY_OPTION.test(key)) return current.choose(Number(key) - 1);
      if (key === "ArrowRight") return session.next();
      if (key !== "Enter") return false;
      if (current.graded) return session.next();
      if (current.canSubmit()) return current.submit() !== null;
      return current.reveal();
    },
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return session;
}

export type QuizSession = ReturnType<typeof createQuizSession>;
