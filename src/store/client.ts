// Starts the store worker from the bundled source and exposes it as a `Store`. Boot is lazy:
// nothing runs until the first docs, quiz or doc-search use (spec §11.1), so the guide is
// unchanged for visitors who never make a doc.

import workerSource from "virtual:store-worker";
import { planStorage, type StorageEnvironment } from "./mode";
import type { BootMessage, BootReply, CallMessage, CallReply } from "./protocol";
import { createStore, type EngineCall } from "./store";
import { type MemoryReason, type Store, StoreError } from "./types";

const LOCK = "pa-db";
const BOOT_TIMEOUT_MS = 15_000;

function browserEnvironment(): StorageEnvironment {
  return {
    protocol: location.protocol,
    secureContext: globalThis.isSecureContext === true,
    // createSyncAccessHandle exists only inside workers; the worker checks it and falls back to memory.
    opfs: typeof navigator.storage?.getDirectory === "function",
    workers: typeof Worker === "function",
    locks: typeof navigator.locks?.request === "function",
  };
}

/** Holds the database lock for the life of the page. Resolves false when another tab has it. */
function acquireLock(): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.locks
      .request(LOCK, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        return lock ? new Promise<void>(() => {}) : undefined;
      })
      .catch(() => resolve(false));
  });
}

function startWorker(persist: boolean): Promise<{ worker: Worker; reply: Extract<BootReply, { type: "ready" }> }> {
  const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  const worker = new Worker(url, { name: "pa-store" });
  return new Promise((resolve, reject) => {
    const fail = (message: string) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      worker.terminate();
      reject(new StoreError("store_unavailable", message));
    };
    const timer = setTimeout(() => fail("The docs store did not start in time."), BOOT_TIMEOUT_MS);
    worker.onerror = (event) => fail(`The docs store could not start: ${event.message || "worker error"}.`);
    worker.onmessage = (event: MessageEvent<BootReply>) => {
      const reply = event.data;
      if (reply.type === "failed") return fail(`The docs store could not start: ${reply.message}`);
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve({ worker, reply });
    };
    worker.postMessage({ type: "boot", persist } satisfies BootMessage);
  });
}

function workerCall(worker: Worker): EngineCall {
  let next = 1;
  let broken: StoreError | null = null;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>();
  worker.onmessage = (event: MessageEvent<CallReply>) => {
    const reply = event.data;
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if (reply.type === "result") waiting.resolve(reply.result);
    else waiting.reject(new StoreError(reply.error.code, reply.error.message, reply.error.details));
  };
  worker.onerror = (event) => {
    broken = new StoreError("store_unavailable", `The docs store stopped: ${event.message || "worker error"}.`);
    for (const waiting of pending.values()) waiting.reject(broken);
    pending.clear();
  };
  return (method, args) =>
    new Promise((resolve, reject) => {
      if (broken) return reject(broken);
      const id = next++;
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage({ type: "call", id, method, args } satisfies CallMessage);
    });
}

async function openBrowserStore(): Promise<Store> {
  const plan = planStorage(browserEnvironment());
  let reason: MemoryReason = plan.reason;
  let persist = plan.persist;
  if (persist && !(await acquireLock())) {
    persist = false;
    reason = "other-tab";
  }
  const { worker, reply } = await startWorker(persist);
  reason = reason ?? reply.reason;
  const persistOnce = () => void navigator.storage?.persist?.().catch(() => {});
  return createStore(workerCall(worker), { mode: reply.mode, reason, onFirstCreate: reply.mode === "local" ? persistOnce : undefined });
}

let opening: Promise<Store> | null = null;

/** The page's store, booted on first use. Rejects with `store_unavailable` if the worker cannot start. */
export function browserStore(): Promise<Store> {
  opening ??= openBrowserStore();
  return opening;
}
