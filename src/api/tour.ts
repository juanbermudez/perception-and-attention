// Tour runner (spec §6.6): plays an agent's stops in order, each for its own seconds, and keeps the caption
// bar ("Assistant tour · n/N") in step. Pausing keeps the time left on the stop. No DOM: what a stop does
// (go, then set_view) is a callback, the caption bar is a port, and the clock can be faked in tests.
import type { Actor } from "./activity";

export const TOUR_LIMITS = { stops: 20, say: 280, seconds: { min: 2, max: 30, default: 6 } };

export interface TourStop {
  /** Caption; empty shows only the count. */
  say: string;
  seconds: number;
}
export interface TourStatus {
  /** 1-based. */
  stop: number;
  of: number;
  paused: boolean;
}
/** User actions, and the natural end, for the activity log. The agent's own controls are logged as its tool calls. */
export interface TourEvent {
  kind: "paused" | "resumed" | "skipped" | "closed" | "ended";
  by: Actor;
  stop: number;
  of: number;
}

/** The caption bar (ui/narration.ts). */
export interface NarrationPort {
  show(stop: { text: string; stop: number; of: number; paused?: boolean }): void;
  setPaused(paused: boolean): void;
  hide(): void;
}
export interface Clock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface TourDeps {
  narration: NarrationPort;
  clock?: Clock;
  onEvent?: (event: TourEvent) => void;
}

export function createTourRunner({ narration, clock = systemClock, onEvent }: TourDeps) {
  let stops: TourStop[] = [];
  let play: (stop: TourStop, index: number) => void = () => {};
  /** Current stop, 0-based; −1 when no tour is running. */
  let index = -1;
  let paused = false;
  let timer: unknown;
  let endsAt = 0;
  /** Milliseconds left on the current stop while paused. */
  let left = 0;
  let driving = false;

  const active = () => index >= 0;
  const status = (): TourStatus | null => (active() ? { stop: index + 1, of: stops.length, paused } : null);

  function emit(kind: TourEvent["kind"], by: Actor) {
    if (active()) onEvent?.({ kind, by, stop: index + 1, of: stops.length });
  }
  function clearTimer() {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
  }
  function schedule(ms: number) {
    clearTimer();
    endsAt = clock.now() + ms;
    timer = clock.setTimeout(() => {
      timer = undefined;
      advance("agent", false);
    }, ms);
  }

  function enter(next: number) {
    clearTimer();
    index = next;
    const stop = stops[next];
    driving = true;
    try {
      play(stop, next);
    } catch (error) {
      console.error(`Tour stop ${next + 1} failed`, error);
      finish("ended", "agent");
      return;
    } finally {
      driving = false;
    }
    narration.show({ text: stop.say, stop: next + 1, of: stops.length, paused });
    left = stop.seconds * 1000;
    if (!paused) schedule(left);
  }

  function finish(kind: "closed" | "ended", by: Actor) {
    if (!active()) return false;
    emit(kind, by);
    clearTimer();
    stops = [];
    index = -1;
    paused = false;
    narration.hide();
    return true;
  }

  function advance(by: Actor, skipped: boolean) {
    if (index + 1 >= stops.length) {
      finish("ended", by);
      return;
    }
    if (skipped) emit("skipped", by);
    enter(index + 1);
  }

  return {
    /** Play `next` from the first stop, replacing any tour in progress. `playStop` runs each stop's navigation and view. */
    start<Stop extends TourStop>(next: Stop[], playStop: (stop: Stop, index: number) => void) {
      if (!next.length) throw new Error("A tour needs at least one stop.");
      clearTimer();
      stops = next;
      play = playStop as (stop: TourStop, index: number) => void;
      paused = false;
      enter(0);
    },
    /** Hold the current stop; the time left is kept. */
    pause(by: Actor = "agent") {
      if (!active() || paused) return false;
      paused = true;
      left = Math.max(0, endsAt - clock.now());
      clearTimer();
      narration.setPaused(true);
      emit("paused", by);
      return true;
    },
    resume(by: Actor = "agent") {
      if (!active() || !paused) return false;
      paused = false;
      narration.setPaused(false);
      emit("resumed", by);
      schedule(left);
      return true;
    },
    /** Skip to the next stop (a paused tour stays paused); after the last stop the tour ends. */
    next(by: Actor = "agent") {
      if (!active()) return false;
      advance(by, true);
      return true;
    },
    prev() {
      if (!active() || index === 0) return false;
      enter(index - 1);
      return true;
    },
    restart() {
      if (!active()) return false;
      paused = false;
      enter(0);
      return true;
    },
    /** End the tour and hide the caption bar. */
    stop(by: Actor = "agent") {
      return finish("closed", by);
    },
    status,
    get active() {
      return active();
    },
    get paused() {
      return active() && paused;
    },
    /** True while a stop's navigation and view run, so the page does not log them as the user's. */
    get driving() {
      return driving;
    },
  };
}

export type TourRunner = ReturnType<typeof createTourRunner>;
