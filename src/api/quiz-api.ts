// The `quiz` tool's commands (spec §6.10): create a quiz and show it in the card, open, close or reset
// the card, and the quiz parts of `read` (every detail of a quiz:*, and "results" of a doc with questions).
// No DOM: the docs API stores quizzes and attempts, and the card is a port (ui/quiz-card.ts in the page,
// a fake in tests). Grading happens in the page, never here.

import { formatRef, resolveRef } from "../model/refs";
import type { DocsApi } from "./docs-api";
import { fail, isFailure, type Result, type WriteResult } from "./result";

export interface QuizOpened {
  ref: string;
  title: string;
  questions: number;
  /** 1-based question shown. */
  at: number;
  /** The card already showed this quiz and kept its place. */
  resumed?: true;
  /** Question blocks the card could not read, so it left them out. */
  skipped?: number;
}

/** The card, as `get_context.quiz` reports it. */
export interface QuizStatus {
  ref: string;
  title: string;
  /** 1-based position in the current run (a retry runs only the missed questions). */
  question: number;
  of: number;
  answered: number;
  correct: number;
  done?: true;
  /** A region question is waiting for a click on the brain. */
  picking?: true;
}

export interface QuizCardPort {
  open(ref: string, options?: { reset?: boolean }): Promise<Result<QuizOpened>>;
  close(by?: "user" | "agent"): { ref: string; title: string } | null;
  status(): QuizStatus | null;
}

export type QuizInput =
  | { action: "create"; title: string; questions: { kind: string }[]; open?: boolean }
  | { action: "open" | "close" | "reset"; ref: string };

export interface QuizApiDeps {
  docs: Pick<DocsApi, "createQuiz" | "read">;
  /** Missing where there is no page to show a card in. */
  card?: QuizCardPort;
}

const quoted = (title: string) => `“${title}”`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** `quiz:K3F9` → `quiz:k3f9`; only quiz and doc refs hold questions. */
function artifactRef(ref: string): Result<string> {
  const resolved = resolveRef(ref);
  if (isFailure(resolved)) return resolved;
  if (resolved.ref.kind !== "quiz" && resolved.ref.kind !== "doc") return fail("bad_input", `Expected quiz:<id>, got "${ref}".`);
  return formatRef(resolved.ref);
}

export function createQuizApi({ docs, card }: QuizApiDeps) {
  const noCard = () => fail("not_available", "This page has no quiz card to show the quiz in.");

  async function create(input: Extract<QuizInput, { action: "create" }>): Promise<Result<WriteResult>> {
    const created = await docs.createQuiz({ title: input.title, questions: input.questions, open: false });
    if (isFailure(created)) return created;
    const questions = created.blocks.map((block, index) => ({ id: block.id, kind: input.questions[index]?.kind, rev: block.rev }));
    const made = `Created quiz ${quoted(created.title)} with ${plural(questions.length, "question")}`;
    if (input.open === false) return { ref: created.ref, title: created.title, questions, said: `${made}.` };
    const shown = card ? await card.open(created.ref, { reset: true }) : noCard();
    if (isFailure(shown)) return { ref: created.ref, title: created.title, questions, said: `${made}; it could not be shown: ${shown.error.message}` };
    return { ref: created.ref, title: created.title, questions, open: true, said: `${made} and opened it.` };
  }

  async function quiz(input: QuizInput): Promise<Result<WriteResult>> {
    if (input.action === "create") return create(input);
    const ref = artifactRef(input.ref);
    if (isFailure(ref)) return ref;
    if (!card) return noCard();
    switch (input.action) {
      case "open":
      case "reset": {
        const shown = await card.open(ref, { reset: input.action === "reset" });
        if (isFailure(shown)) return shown;
        const said =
          input.action === "reset"
            ? `Restarted quiz ${quoted(shown.title)} from question 1 of ${shown.questions}.`
            : shown.resumed
              ? `Showing quiz ${quoted(shown.title)} at question ${shown.at} of ${shown.questions}.`
              : `Opened quiz ${quoted(shown.title)}: ${plural(shown.questions, "question")}.`;
        const left = shown.skipped ? ` ${plural(shown.skipped, "question")} could not be read and ${shown.skipped === 1 ? "was" : "were"} left out.` : "";
        return { ref: shown.ref, title: shown.title, questions: shown.questions, at: shown.at, skipped: shown.skipped, said: said + left };
      }
      case "close": {
        const showing = card.status();
        if (!showing) return { ref, said: "No quiz was open." };
        if (showing.ref !== ref) return fail("not_available", `${ref} is not open; the card shows ${showing.ref}.`, [showing.ref]);
        card.close("agent");
        return { ref, said: `Closed quiz ${quoted(showing.title)} at question ${showing.question} of ${showing.of}.` };
      }
    }
  }

  return {
    quiz,
    /** `read` for quiz refs (every detail) and for "results" of a doc with questions. */
    read: (ref: string, detail?: "brief" | "full" | "markdown" | "results") => docs.read(ref, detail),
    /** What the card shows, for `get_context.quiz`; null while it is closed. */
    status: (): QuizStatus | null => card?.status() ?? null,
  };
}

export type QuizApi = ReturnType<typeof createQuizApi>;
