// Activity log with a `seq` cursor (spec §6.1). In memory for now; the store takes it over in Stage 3.
// The page cannot push events to an agent, so the agent polls get_context with the last cursor it saw.

export type Actor = "user" | "agent";

export interface ActivityInput {
  by: Actor;
  /** navigated, played, paused, agent_control, or the name of the agent's tool. */
  kind: string;
  ref?: string;
  said?: string;
  on?: boolean;
}
export interface ActivityEntry extends ActivityInput {
  seq: number;
  /** Milliseconds since the epoch. */
  time: number;
}

export const ACTIVITY_CAPACITY = 500;
export const ACTIVITY_PAGE = 30;

export function createActivityLog({ capacity = ACTIVITY_CAPACITY, now = Date.now }: { capacity?: number; now?: () => number } = {}) {
  const entries: ActivityEntry[] = [];
  let seq = 0;

  function append(input: ActivityInput): number {
    const last = entries.at(-1);
    // Navigating to the same place twice in a row says nothing new.
    if (last && input.kind === "navigated" && last.kind === "navigated" && last.by === input.by && last.ref === input.ref) return last.seq;
    seq += 1;
    entries.push({ ...input, seq, time: now() });
    if (entries.length > capacity) entries.shift();
    return seq;
  }

  /**
   * Entries after `cursor`, oldest first, at most `max`; `more` says another call would return more.
   * Without a cursor, the latest `max` entries.
   */
  function since(cursor?: number, max = ACTIVITY_PAGE) {
    const after = cursor === undefined ? entries : entries.filter((entry) => entry.seq > cursor);
    const page = cursor === undefined ? after.slice(-max) : after.slice(0, max);
    const last = page.at(-1)?.seq ?? (cursor === undefined ? seq : Math.min(cursor, seq));
    return { entries: page, cursor: last, more: after.length > page.length && cursor !== undefined };
  }

  return {
    append,
    since,
    get latest() {
      return seq;
    },
  };
}

export type ActivityLog = ReturnType<typeof createActivityLog>;
