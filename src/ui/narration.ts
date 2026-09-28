// Caption bar for assistant tours, at the bottom of the stage: "Assistant tour · 3/7", the
// stop's caption, and pause, skip and close. UI only: the tour runner calls show, setPaused
// and hide, and listens for the buttons with onAction. Captions are agent text, so they are
// set as text, never as HTML.

export type NarrationAction = "pause" | "resume" | "skip" | "close";
export interface NarrationStop {
  text: string;
  /** 1-based stop number. */
  stop: number;
  of: number;
  paused?: boolean;
}

export const CAPTION_LIMIT = 280;

const icon = (body: string, className = "") => `<svg${className ? ` class="${className}"` : ""} viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export function createNarration(stage: HTMLElement) {
  const bar = document.createElement("section");
  bar.className = "narration framed-card";
  bar.hidden = true;
  bar.setAttribute("aria-label", "Assistant tour");
  bar.innerHTML = `<div class="narration-surface card-surface">
    <div class="narration-body">
      <p class="narration-meta"><span>Assistant tour</span><span class="narration-count"></span></p>
      <p class="narration-text" aria-live="polite"></p>
    </div>
    <div class="narration-actions">
      <button class="narration-button narration-pause" aria-pressed="false">${icon('<path d="M8 5v14M16 5v14"/>', "icon-pause")}${icon('<path d="M8 5v14l11-7Z"/>', "icon-play")}<span>Pause</span></button>
      <button class="narration-button narration-skip" aria-label="Next stop" title="Next stop">${icon('<path d="m6 17 5-5-5-5m7 10 5-5-5-5"/>')}</button>
      <button class="narration-button narration-close" aria-label="End tour" title="End tour">${icon('<path d="m6 6 12 12M6 18 18 6"/>')}</button>
    </div>
  </div>`;
  stage.append(bar);
  const count = bar.querySelector<HTMLElement>(".narration-count")!;
  const text = bar.querySelector<HTMLElement>(".narration-text")!;
  const pause = bar.querySelector<HTMLButtonElement>(".narration-pause")!;
  const listeners = new Set<(action: NarrationAction) => void>();
  let paused = false;

  function emit(action: NarrationAction) {
    for (const listener of listeners) listener(action);
  }
  function setPaused(next: boolean) {
    paused = next;
    pause.setAttribute("aria-pressed", String(paused));
    pause.querySelector("span")!.textContent = paused ? "Resume" : "Pause";
  }
  // The toast sits above the bar while it is open.
  function reserveSpace() {
    stage.style.setProperty("--narration-space", bar.hidden ? "0px" : `${bar.offsetHeight + 12}px`);
  }
  function hide() {
    bar.hidden = true;
    reserveSpace();
  }

  pause.addEventListener("click", () => {
    setPaused(!paused);
    emit(paused ? "pause" : "resume");
  });
  bar.querySelector(".narration-skip")!.addEventListener("click", () => emit("skip"));
  bar.querySelector(".narration-close")!.addEventListener("click", () => {
    hide();
    emit("close");
  });
  bar.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    hide();
    emit("close");
  });

  return {
    /** Show one stop's caption. */
    show(stop: NarrationStop) {
      count.textContent = ` · ${stop.stop}/${stop.of}`;
      text.textContent = stop.text.length > CAPTION_LIMIT ? `${stop.text.slice(0, CAPTION_LIMIT - 1)}…` : stop.text;
      text.hidden = stop.text.length === 0;
      setPaused(stop.paused ?? false);
      bar.hidden = false;
      reserveSpace();
    },
    setPaused,
    hide,
    /** Listen for pause, resume, skip and close. Returns an unsubscribe function. */
    onAction(listener: (action: NarrationAction) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The bar itself: clicks and keys inside it are its own controls, not input that pauses a tour. */
    element: bar,
    get visible() {
      return !bar.hidden;
    },
    get paused() {
      return paused;
    },
  };
}
export type Narration = ReturnType<typeof createNarration>;
