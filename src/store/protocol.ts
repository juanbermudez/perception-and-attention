// Messages between the page (client.ts) and the store worker (worker.ts).

import type { EngineMethod } from "./store";
import type { MemoryReason, StoreErrorCode } from "./types";

/** First message to the worker: open the OPFS database, or go straight to memory. */
export interface BootMessage {
  type: "boot";
  persist: boolean;
}

export type BootReply = { type: "ready"; mode: "local" | "memory"; reason: MemoryReason; sqlite: string } | { type: "failed"; message: string };

export interface CallMessage {
  type: "call";
  id: number;
  method: EngineMethod;
  args: unknown[];
}

export interface WireError {
  code: StoreErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type CallReply = { type: "result"; id: number; result: unknown } | { type: "error"; id: number; error: WireError };
