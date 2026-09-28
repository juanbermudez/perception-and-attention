// One question, answered in place (spec §10). The quiz card mounts one at a time. The doc editor
// (Stage 4) can mount one per `question` block (spec §9.3) the same way:
//
//   const state = createQuestionState({ id: block.id, question: block.data }, {
//     regionMode: "idle",                                  // inline: pick on the brain only when asked
//     onGraded: (graded) => docs.recordAttempt({ ref, block: block.id, answer: graded.answer, correct: graded.correct }),
//   });
//   const view = mountQuestion(host, state, { pick, showMe, showRegion });   // view.destroy() when the block goes
//
// Esc while a region question is picking should call `pick.cancel()`; the card does it through its key owner.
//
// Everything renders from the question state. Answers are never in the DOM before the submission:
// no data attributes, no hidden feedback. Prompts, choices and explanations go through the escaped,
// allow-listed inline renderer (model/markdown).

import { regions } from "../content/regions";
import type { RegionId } from "../content/types";
import { renderInline } from "../model/markdown";
import { type Question, showMeRef } from "../model/quiz";
import type { QuestionState } from "../model/quiz-session";
import { escapeHtml } from "./dom";
import type { PickMode } from "./pick-mode";

export interface QuestionViewOptions {
  /** Region questions answer on the brain through this; without it (no 3D view) they use the list. */
  pick?: PickMode | null;
  /** "Show me" after feedback: go to the question's ref, then apply its view. */
  showMe?: (question: Question) => void;
  /** A region link in a prompt or explanation was clicked. */
  showRegion?: (id: RegionId) => void;
  /** After feedback, the card's primary action ("Next", "See your score"). Inline in a doc there is none. */
  next?: () => { label: string; key?: string; run: () => void } | null;
}

const icon = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICONS = {
  up: icon('<path d="m6 15 6-6 6 6"/>'),
  down: icon('<path d="m6 9 6 6 6-6"/>'),
  grip: icon(
    '<circle cx="9" cy="6" r=".6"/><circle cx="15" cy="6" r=".6"/><circle cx="9" cy="12" r=".6"/><circle cx="15" cy="12" r=".6"/><circle cx="9" cy="18" r=".6"/><circle cx="15" cy="18" r=".6"/>',
  ),
};

/** Inline markdown without links, for text inside buttons (a region link there would nest buttons). */
const plainInline = (text: string) => renderInline(text.replace(/\[([^\]]+)\]\((?:[^()\s]|\([^()\s]*\))*\)/g, "$1"));
const regionName = (id: RegionId) => escapeHtml(regions[id].short.split(" · ")[0]);
const regionLabel = (id: RegionId) => escapeHtml(regions[id].label);
const kbd = (key: string) => `<kbd class="quiz-key">${key}</kbd>`;
const mark = (ok: boolean) => `<span class="option-mark ${ok ? "ok" : "no"}" aria-label="${ok ? "Right" : "Wrong"}">${ok ? "✓" : "✗"}</span>`;

export function mountQuestion(host: HTMLElement, state: QuestionState, options: QuestionViewOptions = {}) {
  const { question } = state.item;
  const root = document.createElement("div");
  root.className = "question";
  root.dataset.kind = question.kind;
  const main = document.createElement("div");
  main.className = "question-main";
  // A steady live region, so the verdict is announced once when it arrives.
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  root.append(main, live);
  host.append(root);
  /** Pick-mode token: whether the pick in progress is this question's. */
  const owner = {};
  let focusAfter: string | null = null;

  /* ---------- Parts ---------- */

  function hint(): string {
    if (state.graded) return "";
    const draft = state.draft;
    let text = "";
    switch (draft.kind) {
      case "choice":
        text = draft.multi ? "Choose all that apply, then submit." : "Choose one.";
        break;
      case "truefalse":
        text = "True or false?";
        break;
      case "region":
        text =
          draft.mode === "pick"
            ? "Click a marked region on the brain. Esc stops."
            : draft.mode === "list"
              ? "Choose one region."
              : "Pick a region on the brain, or choose from a list.";
        break;
      case "order":
        text = "Put these in order: drag the handles or use the arrows.";
        break;
      case "recall":
        text = draft.revealed ? "Compare, then mark it honestly." : "Type your answer, then reveal the model answer.";
        break;
    }
    return `<p class="question-hint">${text}</p>`;
  }

  function optionButton(index: number, html: string, selected: boolean, after: string, disabled: boolean) {
    const keyed = index < 6 ? kbd(String(index + 1)) : '<span class="quiz-key blank"></span>';
    return `<button class="question-option${selected ? " selected" : ""}${after ? " marked" : ""}" data-choice="${index}" data-focus="o${index}" aria-pressed="${selected}"${
      disabled ? ' aria-disabled="true"' : ""
    }>${keyed}<span class="option-text">${html}</span>${after}</button>`;
  }

  function body(): string {
    const draft = state.draft;
    const graded = state.graded;
    switch (draft.kind) {
      case "choice": {
        if (question.kind !== "choice") return "";
        const rows = question.choices.map((choice, index) => {
          const selected = draft.selected.includes(index);
          const right = question.answer.includes(index);
          const after = graded ? (right ? mark(true) : selected ? mark(false) : "") : "";
          return optionButton(index, plainInline(choice), selected, after, graded !== null);
        });
        return `<div class="question-options" role="group" aria-label="Choices">${rows.join("")}</div>`;
      }
      case "truefalse": {
        if (question.kind !== "truefalse") return "";
        const rows = [true, false].map((value, index) => {
          const selected = draft.selected === value;
          const after = graded ? (question.answer === value ? mark(true) : selected ? mark(false) : "") : "";
          return optionButton(index, value ? "True" : "False", selected, after, graded !== null);
        });
        return `<div class="question-options two" role="group" aria-label="True or false">${rows.join("")}</div>`;
      }
      case "region":
        return regionBody();
      case "order":
        return orderBody();
      case "recall":
        return recallBody();
    }
  }

  function regionBody(): string {
    const draft = state.draft;
    if (draft.kind !== "region" || question.kind !== "region") return "";
    const graded = state.graded;
    const canPick = Boolean(options.pick);
    if (draft.mode === "list") {
      const rows = draft.choices.map((id, index) => {
        const selected = draft.selected === id;
        const after = graded ? (question.answer.includes(id) ? mark(true) : selected ? mark(false) : "") : "";
        return optionButton(index, regionLabel(id), selected, after, graded !== null);
      });
      const back = !graded && canPick ? '<button class="quiz-link" data-action="pick" data-focus="pick">Pick on the brain instead</button>' : "";
      return `<div class="question-options" role="group" aria-label="Regions">${rows.join("")}</div>${back}`;
    }
    if (graded) {
      const picked = draft.selected ? `<b>${regionName(draft.selected)}</b>` : "nothing";
      return `<p class="question-picked">You picked ${picked}.</p>`;
    }
    const list = '<button class="quiz-button" data-action="list" data-focus="list">Choose from a list</button>';
    if (draft.mode === "pick") return `<div class="question-pick"><p class="pick-status"><span class="pick-dot"></span>Picking on the brain</p>${list}</div>`;
    const again = canPick ? '<button class="quiz-button" data-action="pick" data-focus="pick">Pick on the brain</button>' : "";
    return `<div class="question-pick">${again}${list}</div>`;
  }

  function orderBody(): string {
    const draft = state.draft;
    if (draft.kind !== "order" || question.kind !== "order") return "";
    const graded = state.graded;
    const last = draft.order.length - 1;
    const rows = draft.order.map((item, position) => {
      const text = plainInline(question.items[item]);
      const after = graded ? mark(question.items[item] === question.items[position]) : "";
      const moves = graded
        ? ""
        : `<span class="order-moves">
            <button class="order-move" data-move="up" data-position="${position}" data-focus="u${item}" aria-label="Move up"${position === 0 ? " disabled" : ""}>${ICONS.up}</button>
            <button class="order-move" data-move="down" data-position="${position}" data-focus="d${item}" aria-label="Move down"${position === last ? " disabled" : ""}>${ICONS.down}</button>
          </span>`;
      return `<li class="order-item" data-item="${item}">${graded ? "" : `<span class="order-grip" data-grip title="Drag to reorder">${ICONS.grip}</span>`}<span class="order-text">${text}</span>${after}${moves}</li>`;
    });
    return `<ol class="question-order${graded ? " graded" : ""}" aria-label="Items to order">${rows.join("")}</ol>`;
  }

  function recallBody(): string {
    const draft = state.draft;
    if (draft.kind !== "recall" || question.kind !== "recall") return "";
    if (!draft.revealed)
      return `<textarea class="question-input" data-focus="text" rows="2" maxlength="1000" aria-label="Your answer" placeholder="Your answer">${escapeHtml(draft.text)}</textarea>`;
    const yours = draft.text.trim() ? escapeHtml(draft.text.trim()) : '<span class="quiet">No answer typed</span>';
    return `<dl class="question-recall">
      <dt>You wrote</dt><dd>${yours}</dd>
      <dt>Model answer</dt><dd>${renderInline(question.answer)}</dd>
    </dl>`;
  }

  function answerLine(): string {
    if (state.graded?.correct) return "";
    switch (question.kind) {
      case "truefalse":
        return `<p class="feedback-answer">The answer is ${question.answer ? "true" : "false"}.</p>`;
      case "region":
        return `<p class="feedback-answer">The answer: ${question.answer.map((id) => `<b>${regionName(id)}</b>`).join(" or ")}.</p>`;
      case "order":
        return `<ol class="feedback-order">${question.items.map((item) => `<li>${plainInline(item)}</li>`).join("")}</ol>`;
      default:
        return "";
    }
  }

  function feedback(): string {
    const graded = state.graded;
    if (!graded) return "";
    const recall = question.kind === "recall";
    const verdict = graded.correct ? (recall ? "Marked as got it" : "Correct") : recall ? "Marked as missed" : "Not quite";
    const explain = question.explain ? `<p class="feedback-explain">${renderInline(question.explain)}</p>` : "";
    return `<div class="question-feedback ${graded.correct ? "ok" : "no"}">
      <p class="feedback-verdict"><span class="verdict-mark" aria-hidden="true">${graded.correct ? "✓" : "✗"}</span>${verdict}</p>
      ${answerLine()}${explain}
    </div>`;
  }

  function actions(): string {
    const draft = state.draft;
    const graded = state.graded;
    const buttons: string[] = [];
    if (graded && options.showMe && (showMeRef(question) || question.view))
      buttons.push('<button class="quiz-button" data-action="show" data-focus="show">Show me</button>');
    buttons.push('<span class="actions-spacer"></span>');
    if (graded) {
      const next = options.next?.();
      if (next)
        buttons.push(
          `<button class="quiz-button primary" data-action="next" data-focus="next">${escapeHtml(next.label)}${next.key ? kbd(next.key) : ""}</button>`,
        );
    } else if (draft.kind === "recall") {
      if (!draft.revealed) buttons.push(`<button class="quiz-button primary" data-action="reveal" data-focus="reveal">Reveal answer${kbd("↵")}</button>`);
      else
        buttons.push(
          `<button class="quiz-button" data-action="missed" data-focus="missed">Missed it${kbd("2")}</button>`,
          `<button class="quiz-button primary" data-action="got" data-focus="got">Got it${kbd("1")}</button>`,
        );
    } else if (!(draft.kind === "region" && draft.mode !== "list")) {
      const ready = state.canSubmit();
      buttons.push(`<button class="quiz-button primary" data-action="submit" data-focus="submit"${ready ? "" : " disabled"}>Submit${kbd("↵")}</button>`);
    }
    return `<div class="question-actions">${buttons.join("")}</div>`;
  }

  /* ---------- Render ---------- */

  function render() {
    const active = document.activeElement as HTMLElement | null;
    const hadFocus = active !== null && main.contains(active);
    const focusKey = focusAfter ?? (hadFocus ? (active?.closest<HTMLElement>("[data-focus]")?.dataset.focus ?? null) : null);
    focusAfter = null;
    main.innerHTML = `<p class="question-prompt">${renderInline(question.prompt)}</p>${hint()}${body()}${feedback()}${actions()}`;
    if (focusKey || hadFocus) {
      const target =
        (focusKey ? main.querySelector<HTMLElement>(`[data-focus="${focusKey}"]:not([disabled]):not([aria-disabled="true"])`) : null) ??
        main.querySelector<HTMLElement>(".question-actions .primary:not([disabled])") ??
        main.querySelector<HTMLElement>(".question-actions button:not([disabled])");
      target?.focus({ preventScroll: true });
    }
    const graded = state.graded;
    live.textContent = graded ? (graded.correct ? "Correct." : "Not quite.") : "";
    syncPick();
  }

  /** Pick mode follows the question: on while a region question waits for a click, off otherwise. */
  function syncPick() {
    const pick = options.pick;
    if (!pick) return;
    const draft = state.draft;
    const wanted = !state.graded && draft.kind === "region" && draft.mode === "pick";
    // A click on the brain answers; focus then moves to the card's next step, so Enter does not re-press the label.
    const answer = (id: RegionId) => {
      focusAfter = "next";
      state.pick(id);
    };
    if (wanted && !pick.owns(owner)) pick.begin(draft.choices, answer, { owner, onCancel: () => state.setMode("idle") });
    else if (!wanted) pick.end(owner);
  }

  /* ---------- Input ---------- */

  main.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const mention = target.closest<HTMLButtonElement>(".region-mention");
    if (mention) {
      options.showRegion?.(mention.dataset.region as RegionId);
      return;
    }
    const choice = target.closest<HTMLElement>("[data-choice]");
    if (choice) {
      state.choose(Number(choice.dataset.choice));
      return;
    }
    const move = target.closest<HTMLButtonElement>("[data-move]");
    if (move) {
      const order = state.draft.kind === "order" ? state.draft.order : [];
      const position = Number(move.dataset.position);
      const up = move.dataset.move === "up";
      const to = position + (up ? -1 : 1);
      // Keep focus on the moved item: the same arrow, or the other one once it reaches an end.
      const atEnd = up ? to === 0 : to === order.length - 1;
      focusAfter = `${up !== atEnd ? "u" : "d"}${order[position]}`;
      if (!state.move(position, to)) focusAfter = null;
      return;
    }
    const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;
    switch (action) {
      case "submit":
        state.submit();
        break;
      case "reveal":
        focusAfter = "got";
        state.reveal();
        break;
      case "got":
      case "missed":
        state.selfGrade(action === "got");
        break;
      case "show":
        options.showMe?.(question);
        break;
      case "next":
        options.next?.()?.run();
        break;
      case "list":
        focusAfter = "o0";
        state.setMode("list");
        break;
      case "pick":
        state.setMode("pick");
        break;
    }
  });
  main.addEventListener("input", (event) => {
    const input = event.target as HTMLTextAreaElement;
    if (input.matches(".question-input")) state.setText(input.value);
  });
  main.addEventListener("keydown", (event) => {
    const input = event.target as HTMLElement;
    // Enter in the answer box reveals; Shift+Enter is a new line.
    if (input.matches(".question-input") && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      focusAfter = "got";
      state.reveal();
    }
  });

  // Order questions: drag an item by its handle. The list is reordered in place while dragging and the
  // new order is committed on release, so the item under the pointer is never re-rendered mid-drag.
  main.addEventListener("pointerdown", (event) => {
    const grip = (event.target as HTMLElement).closest("[data-grip]");
    const item = grip?.closest<HTMLElement>(".order-item");
    const list = item?.parentElement;
    if (!item || !list || event.button !== 0) return;
    event.preventDefault();
    item.classList.add("dragging");
    const moveTo = (y: number) => {
      const others = [...list.children].filter((child) => child !== item) as HTMLElement[];
      const before = others.find((other) => {
        const rect = other.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
      });
      if ((before ?? null) !== item.nextElementSibling) list.insertBefore(item, before ?? null);
    };
    const onMove = (move: PointerEvent) => moveTo(move.clientY);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      item.classList.remove("dragging");
      const order = [...list.children].map((child) => Number((child as HTMLElement).dataset.item));
      if (!state.setOrder(order)) render();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  const unsubscribe = state.onChange(render);
  render();

  return {
    element: root,
    state,
    render,
    /** Give keyboard focus to the first thing to act on (a choice, the answer box or a button). */
    focus() {
      main
        .querySelector<HTMLElement>("[data-choice], .question-input, .order-move:not([disabled]), .question-actions button:not([disabled])")
        ?.focus({ preventScroll: true });
    },
    destroy() {
      unsubscribe();
      options.pick?.end(owner);
      root.remove();
    },
  };
}

export type QuestionView = ReturnType<typeof mountQuestion>;
