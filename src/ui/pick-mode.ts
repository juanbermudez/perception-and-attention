// Region pick mode (spec §10): while a region question waits for a click on the brain, the scene shows
// markers for exactly the offered regions (`state.pick`), the canvas gets a crosshair, and a click on a
// marker or label answers instead of opening the region. No DOM here: the card toggles the stage's
// `.picking` class from `onChange`, so the routing is tested in Node.
import type { RegionId } from "../content/types";

interface Request {
  choices: RegionId[];
  onPick: (id: RegionId) => void;
  onCancel?: () => void;
  /** Who asked (a question view), so it can tell whether pick mode is still its own. */
  owner: unknown;
}

export function createPickMode(state: { pick: RegionId[] | null }) {
  let request: Request | null = null;
  const listeners = new Set<(active: boolean) => void>();
  const emit = () => {
    for (const listener of listeners) listener(request !== null);
  };
  function clear(): Request | null {
    const ended = request;
    request = null;
    state.pick = null;
    return ended;
  }

  return {
    get active() {
      return request !== null;
    },
    get choices(): readonly RegionId[] {
      return request?.choices ?? [];
    },
    /** Whether `owner` started the pick in progress. */
    owns(owner: unknown) {
      return request !== null && request.owner === owner;
    },
    /** Start picking among `choices`. A pick already in progress is cancelled first. */
    begin(choices: RegionId[], onPick: (id: RegionId) => void, options: { onCancel?: () => void; owner?: unknown } = {}) {
      clear()?.onCancel?.();
      request = { choices: [...choices], onPick, onCancel: options.onCancel, owner: options.owner };
      state.pick = [...choices];
      emit();
    },
    /** A region click while picking. Answers with it when it is one of the choices; returns whether it was taken. */
    resolve(id: RegionId): boolean {
      if (!request || !request.choices.includes(id)) return false;
      const taken = clear()!;
      emit();
      taken.onPick(id);
      return true;
    },
    /** Esc: stop picking; the question offers to pick again or choose from a list. */
    cancel() {
      const ended = clear();
      if (!ended) return;
      emit();
      ended.onCancel?.();
    },
    /** Stop quietly (the question was answered, closed or replaced). Only the owner's pick ends when one is given. */
    end(owner?: unknown) {
      if (!request || (owner !== undefined && request.owner !== owner)) return;
      clear();
      emit();
    },
    onChange(listener: (active: boolean) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type PickMode = ReturnType<typeof createPickMode>;

/**
 * The scene's region-click callback: `pick.active ? pick.resolve(id) : show(id)`. While picking, a click on
 * a region that is not offered (a marker still fading out) does nothing but call `onMiss`.
 */
export function routeRegionClicks(pick: Pick<PickMode, "active" | "resolve">, show: (id: RegionId) => void, onMiss?: (id: RegionId) => void) {
  return (id: RegionId) => {
    if (!pick.active) show(id);
    else if (!pick.resolve(id)) onMiss?.(id);
  };
}
