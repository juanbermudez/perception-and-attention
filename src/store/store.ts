// Turns an engine call (in a worker, or in-process for tests) into the async `Store` interface and
// emits change events after successful writes. There is one writer per database (the Web Lock
// keeps other tabs in memory mode), so events from this page are the only changes.

import type { Engine } from "./engine";
import type { MemoryReason, Store, StoreChange, StoreMode } from "./types";

export type EngineMethods = Omit<Engine, "maintain">;
export type EngineMethod = keyof EngineMethods;
export type EngineCall = <M extends EngineMethod>(method: M, args: Parameters<EngineMethods[M]>) => Promise<ReturnType<EngineMethods[M]>>;

export const ENGINE_METHODS: readonly EngineMethod[] = [
  "listArtifacts",
  "getArtifact",
  "createArtifact",
  "updateArtifact",
  "applyBlockOps",
  "blockHistory",
  "locateBlock",
  "searchRows",
  "recordAttempt",
  "listAttempts",
  "saveWindows",
  "listWindows",
  "appendActivity",
  "listActivity",
  "getSetting",
  "setSetting",
];

export interface StoreOptions {
  mode: StoreMode;
  reason?: MemoryReason;
  /**
   * Runs once, after the first artifact is created (the browser asks for persistent storage then).
   * When it resolves false, the store emits a `storage` change so the page can say so.
   */
  onFirstCreate?: () => Promise<boolean> | undefined;
  /** Memory mode because another tab had the database: resolves when it lets go (reason becomes "freed"). */
  released?: Promise<void>;
}

/** Calls the engine in this thread. Used by tests, and by anything that already runs inside the worker. */
export function directCall(engine: EngineMethods): EngineCall {
  return async (method, args) => (engine[method] as (...input: unknown[]) => unknown)(...args) as never;
}

export function createStore(call: EngineCall, options: StoreOptions): Store {
  const listeners = new Set<(change: StoreChange) => void>();
  const emit = (change: StoreChange) => {
    for (const listener of listeners) listener(change);
  };
  let created = false;
  let reason = options.reason ?? null;
  void options.released?.then(() => {
    reason = "freed";
    emit({ kind: "storage", reason: "freed" });
  });

  return {
    mode: options.mode,
    get reason() {
      return reason;
    },
    listArtifacts: (listOptions = {}) => call("listArtifacts", [listOptions]),
    getArtifact: (id, getOptions = {}) => call("getArtifact", [id, getOptions]),
    async createArtifact(input, actor) {
      const artifact = await call("createArtifact", [input, actor]);
      emit({ kind: "artifact", id: artifact.id, rev: artifact.rev });
      if (!created) {
        created = true;
        void Promise.resolve(options.onFirstCreate?.()).then((persisted) => {
          if (persisted === false) emit({ kind: "storage", reason: "not-persisted" });
        });
      }
      return artifact;
    },
    async updateArtifact(id, patch, actor) {
      const summary = await call("updateArtifact", [id, patch, actor]);
      emit({ kind: "artifact", id, rev: summary.rev, deleted: summary.deletedAt !== undefined });
      return summary;
    },
    async applyBlockOps(artifactId, ops, actor, applyOptions = {}) {
      const result = await call("applyBlockOps", [artifactId, ops, actor]);
      const ids = [...result.changed.map((block) => block.id), ...result.inserted.map((block) => block.id), ...result.deleted];
      emit({ kind: "blocks", artifactId, rev: result.rev, actor, ids, ...(applyOptions.origin ? { origin: applyOptions.origin } : {}) });
      return result;
    },
    blockHistory: (blockId) => call("blockHistory", [blockId]),
    locateBlock: (blockId) => call("locateBlock", [blockId]),
    searchRows: () => call("searchRows", []),
    recordAttempt: (attempt) => call("recordAttempt", [attempt]),
    listAttempts: (artifactId) => call("listAttempts", [artifactId]),
    async saveWindows(windows) {
      await call("saveWindows", [windows]);
      emit({ kind: "windows" });
    },
    listWindows: () => call("listWindows", []),
    appendActivity: (entry) => call("appendActivity", [entry]),
    listActivity: (since, limit) => call("listActivity", [since, limit]),
    getSetting: (key) => call("getSetting", [key]),
    setSetting: (key, value) => call("setSetting", [key, value]),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
