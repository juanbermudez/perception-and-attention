// The quiz card (spec §10): a draggable overlay on the stage, one question at a time, with progress
// dots like the walkthrough's, feedback, "Show me", and an end screen with the score and "Retry the
// ones I missed". It is its own overlay, not a doc window. While it is open it owns keys 1–6, Enter
// and → (and Esc while picking) through `keyOwner()`, which ui/keyboard.ts asks first.
//
// The questions come from the docs API (`read(ref, "full")`), and every submission is stored with
// `recordAttempt`. The session logic is model/quiz-session.ts; each question renders with
// ui/question-view.ts, which docs can reuse inline.

import type { DocsApi } from "../api/docs-api";
import type { QuizCardPort, QuizOpened, QuizStatus } from "../api/quiz-api";
import { fail, isFailure, type Result } from "../api/result";
import type { PathId, RegionId } from "../content/types";
import { pickChoices, type Question, validateQuestion } from "../model/quiz";
import { createQuizSession, type QuizItem, type QuizSession } from "../model/quiz-session";
import { escapeHtml, toast } from "./dom";
import type { KeyLike, KeyOwner } from "./keyboard";
import type { PickMode } from "./pick-mode";
import { mountQuestion, type QuestionView } from "./question-view";

/** What the card tells the activity log: the user's answers, the end of a run, and closing it. */
export interface QuizCardEvent {
  kind: "answered" | "finished" | "closed";
  ref: string;
  ok?: boolean;
  said?: string;
}

export interface QuizCardDeps {
  stage: HTMLElement;
  docs: Pick<DocsApi, "read" | "recordAttempt" | "onChange">;
  /** Region pick mode; null when the 3D view is not running (region questions then use the list). */
  pick: PickMode | null;
  /** The open topic, for the default regions of a region question. */
  openTopic: () => PathId | null;
  showMe: (question: Question) => void;
  showRegion: (id: RegionId) => void;
  onEvent?: (event: QuizCardEvent) => void;
  random?: () => number;
}

/** At least this much of the card stays inside the stage when dragged (spec §8). */
const KEEP_INSIDE = 48;
/** Below this stage width the card docks at the bottom and does not drag. */
const DOCKED_WIDTH = 600;

const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';

interface OpenQuiz {
  ref: string;
  id: string;
  title: string;
  session: QuizSession;
  view: QuestionView | null;
  unsubscribe: () => void;
}

function isTyping(target: EventTarget | null) {
  return (target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])') != null;
}

export function createQuizCard(deps: QuizCardDeps) {
  const { stage, docs, pick } = deps;
  const card = document.createElement("section");
  card.className = "quiz-card framed-card";
  card.hidden = true;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  card.setAttribute("aria-labelledby", "quiz-card-title");
  card.innerHTML = `<div class="quiz-surface card-surface">
    <header class="quiz-head">
      <div class="quiz-heading">
        <p class="quiz-meta"><span>Quiz</span><span class="quiz-count"></span></p>
        <h2 class="quiz-title" id="quiz-card-title"></h2>
      </div>
      <button class="quiz-close" aria-label="Close quiz" title="Close quiz">${closeIcon}</button>
    </header>
    <div class="quiz-dots" aria-hidden="true"></div>
    <div class="quiz-body"></div>
  </div>`;
  stage.append(card);
  const head = card.querySelector<HTMLElement>(".quiz-head")!;
  const count = card.querySelector<HTMLElement>(".quiz-count")!;
  const title = card.querySelector<HTMLElement>(".quiz-title")!;
  const dots = card.querySelector<HTMLElement>(".quiz-dots")!;
  const body = card.querySelector<HTMLElement>(".quiz-body")!;

  let open: OpenQuiz | null = null;
  /** Where the user dragged the card, relative to the stage; null keeps the default corner. */
  let position: { left: number; top: number } | null = null;
  /** The latest open() wins when two overlap. */
  let opening = 0;

  /* ---------- Loading ---------- */

  /** The quiz's questions. A question saved before its "Show me" view was checked keeps working without the view; one that cannot be read is counted in `skipped`. */
  async function load(ref: string): Promise<Result<{ ref: string; id: string; title: string; items: QuizItem[]; skipped: number }>> {
    const full = await docs.read(ref, "full");
    if (isFailure(full)) return full;
    if (!("blocks" in full) || !Array.isArray(full.blocks)) return fail("not_available", `Could not read ${ref}.`);
    const items: QuizItem[] = [];
    let skipped = 0;
    for (const block of full.blocks) {
      if (block.type !== "question") continue;
      let checked = validateQuestion(block.data);
      if (!checked.ok && block.data?.view !== undefined) checked = validateQuestion({ ...block.data, view: undefined });
      if (checked.ok) items.push({ id: block.id, question: checked.value });
      else skipped++;
    }
    return { ref: full.ref, id: full.ref.slice(full.ref.indexOf(":") + 1), title: full.title, items, skipped };
  }

  const unreadable = (count: number) => `${count === 1 ? "1 question" : `${count} questions`} could not be read`;

  function sessionFor(ref: string, items: QuizItem[]): QuizSession {
    return createQuizSession(items, {
      random: deps.random,
      regionMode: pick ? "pick" : "list",
      choices: (question) => pickChoices(question, deps.openTopic()),
      onAttempt: ({ block, answer, correct }) => {
        deps.onEvent?.({ kind: "answered", ref: `block:${block}`, ok: correct });
        void docs.recordAttempt({ ref, block, answer, correct }).then((saved) => {
          if (isFailure(saved)) {
            console.warn("Could not save the quiz answer", saved.error);
            toast("This answer could not be saved.");
          }
        });
      },
      onFinish: (score) => deps.onEvent?.({ kind: "finished", ref, said: `${score.correct} of ${score.of} correct` }),
    });
  }

  /* ---------- Rendering ---------- */

  function renderFrame() {
    if (!open) return;
    const { session } = open;
    title.textContent = open.title;
    count.textContent = session.done ? " · Score" : ` · ${session.position + 1}/${session.run.length}`;
    dots.innerHTML = session
      .dots()
      .map((dot) => `<span class="quiz-dot ${dot}"></span>`)
      .join("");
    if (session.done) {
      open.view?.destroy();
      open.view = null;
      renderEnd();
      return;
    }
    if (open.view?.state !== session.current) {
      const hadFocus = card.contains(document.activeElement);
      open.view?.destroy();
      body.innerHTML = "";
      const last = session.position + 1 >= session.run.length;
      open.view = mountQuestion(body, session.current, {
        pick,
        showMe: deps.showMe,
        showRegion: deps.showRegion,
        next: () => ({ label: last ? "See your score" : "Next", key: "→", run: () => session.next() }),
      });
      if (hadFocus) open.view.focus();
    }
  }

  function renderEnd() {
    if (!open) return;
    const score = open.session.score();
    const missed = score.missed.length;
    const text = missed === 0 ? (score.of === 1 ? "Right." : "All correct.") : `${score.correct} of ${score.of} correct.`;
    body.innerHTML = `<div class="quiz-end">
      <p class="quiz-score"><b>${score.correct}</b><span>/${score.of}</span></p>
      <p class="quiz-end-text" role="status">${escapeHtml(text)}</p>
      <div class="question-actions">
        <button class="quiz-button" data-end="restart">Start over</button>
        <span class="actions-spacer"></span>
        ${
          missed
            ? `<button class="quiz-button primary" data-end="retry">Retry the ones I missed<kbd class="quiz-key">↵</kbd></button>`
            : '<button class="quiz-button primary" data-end="close">Close</button>'
        }
      </div>
    </div>`;
  }

  body.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-end]")?.dataset.end;
    if (!open || !action) return;
    if (action === "retry") open.session.retryMissed();
    else if (action === "restart") open.session.restart();
    else closeCard("user");
    if (action !== "close") open?.view?.focus();
  });

  /* ---------- Open and close ---------- */

  function show() {
    card.hidden = false;
    place();
  }

  function teardown() {
    if (!open) return;
    open.unsubscribe();
    open.view?.destroy();
    open = null;
    body.innerHTML = "";
  }

  function closeCard(by: "user" | "agent" = "agent"): { ref: string; title: string } | null {
    if (!open) return null;
    const closed = { ref: open.ref, title: open.title };
    teardown();
    card.hidden = true;
    if (by === "user") deps.onEvent?.({ kind: "closed", ref: closed.ref });
    return closed;
  }

  /** Load a quiz (or any doc with questions) into the card. `reset` starts again from question 1. */
  async function openQuiz(ref: string, { reset = false, focus = false }: { reset?: boolean; focus?: boolean } = {}): Promise<Result<QuizOpened>> {
    const token = ++opening;
    const loaded = await load(ref);
    if (token !== opening) return fail("not_available", `Another quiz was opened while ${ref} was loading.`);
    if (isFailure(loaded)) return loaded;
    if (!loaded.items.length)
      return fail(
        "not_available",
        loaded.skipped
          ? `${loaded.ref} has no questions that can be shown: ${unreadable(loaded.skipped)}. Fix them with edit_blocks.`
          : `${loaded.ref} has no questions yet. Add question blocks with edit_blocks.`,
      );
    if (loaded.skipped) toast(`${unreadable(loaded.skipped)} and ${loaded.skipped === 1 ? "is" : "are"} left out of this quiz.`);
    const skipped = loaded.skipped ? { skipped: loaded.skipped } : {};
    if (open && open.ref === loaded.ref && !reset) {
      open.title = loaded.title;
      open.session.update(loaded.items);
      show();
      renderFrame();
      return { ref: loaded.ref, title: loaded.title, questions: loaded.items.length, at: open.session.position + 1, resumed: true, ...skipped };
    }
    teardown();
    const session = sessionFor(loaded.ref, loaded.items);
    open = { ref: loaded.ref, id: loaded.id, title: loaded.title, session, view: null, unsubscribe: session.onChange(renderFrame) };
    show();
    renderFrame();
    if (focus) open.view?.focus();
    return { ref: loaded.ref, title: loaded.title, questions: loaded.items.length, at: 1, ...skipped };
  }

  /** An agent (or the user in a doc) changed the open quiz: take the new questions, keep the place. */
  async function refresh() {
    if (!open) return;
    const ref = open.ref;
    const loaded = await load(ref);
    if (!open || open.ref !== ref || isFailure(loaded)) return;
    if (!loaded.items.length) {
      closeCard("agent");
      return;
    }
    open.title = loaded.title;
    open.session.update(loaded.items);
    renderFrame();
  }

  docs.onChange((change) => {
    if (!open) return;
    if (change.kind === "artifact" && change.id === open.id) {
      if (change.deleted) closeCard("agent");
      else void refresh();
    } else if (change.kind === "blocks" && change.artifactId === open.id) void refresh();
  });

  card.querySelector(".quiz-close")!.addEventListener("click", () => closeCard("user"));

  /* ---------- Dragging ---------- */

  const docked = () => stage.clientWidth <= DOCKED_WIDTH;

  function clamp(left: number, top: number) {
    const width = card.offsetWidth;
    return {
      left: Math.min(Math.max(left, KEEP_INSIDE - width), stage.clientWidth - KEEP_INSIDE),
      top: Math.min(Math.max(top, 0), stage.clientHeight - KEEP_INSIDE),
    };
  }

  function place() {
    if (!position || docked()) {
      card.style.left = card.style.top = "";
      card.classList.remove("placed");
      return;
    }
    position = clamp(position.left, position.top);
    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
    card.classList.add("placed");
  }

  head.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || docked() || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const offset = { x: event.clientX - cardRect.left, y: event.clientY - cardRect.top };
    head.setPointerCapture(event.pointerId);
    card.classList.add("dragging");
    const move = (next: PointerEvent) => {
      position = clamp(next.clientX - stageRect.left - offset.x, next.clientY - stageRect.top - offset.y);
      place();
    };
    const end = () => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", end);
      head.removeEventListener("pointercancel", end);
      card.classList.remove("dragging");
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", end);
    head.addEventListener("pointercancel", end);
  });
  new ResizeObserver(() => {
    if (!card.hidden) place();
  }).observe(stage);

  /* ---------- Keys ---------- */

  /** The card's question is waiting for a click on the brain. */
  function picking() {
    const draft = open && !open.session.done ? open.session.current.draft : null;
    return pick?.active === true && draft?.kind === "region" && draft.mode === "pick" && !open?.session.current.graded;
  }

  const owner: KeyOwner = {
    owns(event: KeyLike) {
      if (!open) return false;
      if (event.key === "Escape") return picking();
      if (isTyping(event.target)) return false;
      // Enter on one of the card's buttons (Show me, Next, Close) or anywhere else on the page's controls
      // does what that button does; on an option, or with nothing focused, it submits.
      const control = (event.target as HTMLElement | null)?.closest?.("button, a, summary");
      if (event.key === "Enter" && control && !control.closest("[data-choice]")) return false;
      return open.session.ownsKey(event.key);
    },
    handle(event: KeyLike) {
      if (!open) return;
      event.preventDefault();
      if (event.key === "Escape") pick?.cancel();
      else open.session.handleKey(event.key);
    },
  };

  function status(): QuizStatus | null {
    if (!open) return null;
    const { session } = open;
    const score = session.score();
    const status: QuizStatus = {
      ref: open.ref,
      title: open.title,
      question: session.position + 1,
      of: session.run.length,
      answered: score.correct + score.missed.length,
      correct: score.correct,
    };
    if (session.done) status.done = true;
    if (picking()) status.picking = true;
    return status;
  }

  return {
    element: card,
    /** Load a quiz (or a doc with questions); `reset` starts again from question 1. */
    open: openQuiz,
    /** Close the card; returns what was open. */
    close: closeCard,
    status,
    /** The card's keys while it is open (for ui/keyboard.ts); null while it is closed. */
    keyOwner: (): KeyOwner | null => (open ? owner : null),
    get isOpen() {
      return open !== null;
    },
  } satisfies QuizCardPort & Record<string, unknown>;
}

export type QuizCard = ReturnType<typeof createQuizCard>;
