// Activity log with a `seq` cursor (spec §6.1). The page cannot push events to an agent, so the agent
// polls get_context with the last cursor it saw. `seq` restarts at 1 on every page load; `epoch` names
// the load, so a cursor from before a reload can be recognised instead of silently skipping entries.
//
// The ring in memory is the source for get_context, so logging never starts the docs store. Once
// the store is open (someone used docs), `connect` mirrors every entry into its `activity` table,
// earlier entries of this visit first, and the store keeps the last 500 across reloads.

export type Actor = "user" | "agent";

export interface ActivityInput {
  by: Actor;
  /** navigated, played, paused, answered, agent_control, or the name of the agent's tool. */
  kind: string;
  ref?: string;
  said?: string;
  on?: boolean;
  /** A quiz answer: whether it was right. */
  ok?: boolean;
}
export interface ActivityEntry extends ActivityInput {
  seq: number;
  /** Milliseconds since the epoch. */
  time: number;
}

/** Where entries are mirrored once the docs store is open (`Store.appendActivity`). */
export interface ActivitySink {
  appendActivity(entry: { actor: Actor; kind: string; ref?: string; summary?: string; at?: number }): Promise<number>;
}

/** Kinds where a repeat by the same actor on the same ref says nothing new. */
const COALESCED = new Set(["navigated", "edited"]);

export const ACTIVITY_CAPACITY = 500;
export const ACTIVITY_PAGE = 30;

export function createActivityLog({ capacity = ACTIVITY_CAPACITY, now = Date.now }: { capacity?: number; now?: () => number } = {}) {
  const entries: ActivityEntry[] = [];
  /** This page load, in base 36: short, and different after a reload. */
  const epoch = now().toString(36);
  let seq = 0;
  let sink: ActivitySink | null = null;
  /** The last seq written to the sink; writes go one after another so the store keeps the order. */
  let mirrored = 0;
  let writing: Promise<unknown> = Promise.resolve();

  function mirror(entry: ActivityEntry) {
    if (!sink || entry.seq <= mirrored) return;
    mirrored = entry.seq;
    const target = sink;
    const summary = entry.said ?? (entry.on === undefined ? undefined : entry.on ? "on" : "off");
    writing = writing
      .then(() => target.appendActivity({ actor: entry.by, kind: entry.kind, ref: entry.ref, summary, at: entry.time }))
      // The log in memory is what agents read; a failed mirror write only loses history.
      .catch(() => {});
  }

  function append(input: ActivityInput): number {
    const last = entries.at(-1);
    // Navigating to (or editing) the same place twice in a row says nothing new.
    if (last && COALESCED.has(input.kind) && last.kind === input.kind && last.by === input.by && last.ref === input.ref) return last.seq;
    seq += 1;
    const entry = { ...input, seq, time: now() };
    entries.push(entry);
    if (entries.length > capacity) entries.shift();
    mirror(entry);
    return seq;
  }

  /** Mirror entries into the store from now on, starting with the ones already in memory. */
  function connect(next: ActivitySink) {
    sink = next;
    for (const entry of entries) mirror(entry);
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
    connect,
    /** Resolves once every mirrored entry has been written. */
    flushed: () => writing,
    epoch,
    get latest() {
      return seq;
    },
  };
}

export type ActivityLog = ReturnType<typeof createActivityLog>;
