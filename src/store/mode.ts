// Storage mode detection (spec §11.1). Pure, so the rules are tested in Node; `client.ts` feeds it
// the browser's facts. Anything that cannot keep an exclusive OPFS database falls back to memory.

import type { MemoryReason, StoreMode } from "./types";

export interface StorageEnvironment {
  protocol: string;
  secureContext: boolean;
  /** OPFS is present. Sync access handles, which opfs-sahpool needs, can only be checked in the worker. */
  opfs: boolean;
  workers: boolean;
  /** Web Locks, used to keep the database to one tab. */
  locks: boolean;
}

export interface StoragePlan {
  /** Try the OPFS database; `false` means open `:memory:` straight away. */
  persist: boolean;
  reason: MemoryReason;
}

export function planStorage(env: StorageEnvironment): StoragePlan {
  if (env.protocol === "file:") return { persist: false, reason: "file" };
  if (!env.secureContext) return { persist: false, reason: "insecure" };
  // Without Web Locks a second tab could not tell that the pool is taken, so treat it like no OPFS.
  if (!env.opfs || !env.workers || !env.locks) return { persist: false, reason: "no-opfs" };
  return { persist: true, reason: null };
}

export const MEMORY_BANNER = "Not saved in this browser. Download docs to keep them.";

const DETAIL: Record<Exclude<MemoryReason, null>, string> = {
  file: "Pages opened from a file cannot save.",
  insecure: "Saving needs https or localhost.",
  "no-opfs": "This browser cannot save docs.",
  "other-tab": "Docs are open in another tab.",
  failed: "The saved docs could not be opened.",
};

/** The banner the docs UI shows while docs are on screen, or null when docs save normally. */
export function storageBanner(mode: StoreMode, reason: MemoryReason): { text: string; detail?: string } | null {
  if (mode !== "memory") return null;
  return reason ? { text: MEMORY_BANNER, detail: DETAIL[reason] } : { text: MEMORY_BANNER };
}
