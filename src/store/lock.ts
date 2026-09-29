// The database lock (spec §11.1): one tab keeps the OPFS database and the others run in memory. A tab
// waits a moment for the lock, which covers a reload whose old page has not let go yet. A tab that
// ends up in memory keeps a queued request, so it learns when the database is free and can offer a
// reload instead of staying in memory for the rest of the visit. Pure over an injected LockManager,
// so it is tested in Node.

export const LOCK = "pa-db";
/** How long a tab waits for the database before it runs in memory. */
export const LOCK_WAIT_MS = 3000;

export interface Locks {
  request(name: string, options: { signal?: AbortSignal }, callback: (lock: unknown) => unknown): Promise<unknown>;
}

export interface LockResult {
  /** This page holds the database lock for the rest of its life. */
  held: boolean;
  /** Only when not held: resolves once the tab that has the database lets go of it. */
  released?: Promise<void>;
}

export function acquireLock(locks: Locks, waitMs = LOCK_WAIT_MS): Promise<LockResult> {
  return new Promise((resolve) => {
    const waiting = new AbortController();
    const timer = setTimeout(() => waiting.abort(), waitMs);
    locks
      .request(LOCK, { signal: waiting.signal }, () => {
        clearTimeout(timer);
        resolve({ held: true });
        // Held until the page goes away.
        return new Promise<void>(() => {});
      })
      .catch(() => {
        clearTimeout(timer);
        // Another tab has it. Queue behind it; when it is granted, let go at once (returning from the
        // callback releases it) so a reload of this tab, or any other tab, can take it.
        const released = new Promise<void>((done) => {
          locks.request(LOCK, {}, () => done()).catch(() => {});
        });
        resolve({ held: false, released });
      });
  });
}
