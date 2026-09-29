// Result shapes shared by the API and every tool. Errors are returned, never thrown (spec §6).

/** What each code asks of the agent is listed in the help card (`agent/help.ts`). */
export type ErrorCode =
  | "bad_input"
  | "unknown_ref"
  | "not_available"
  | "stale_rev"
  | "locked_by_user"
  | "limit"
  | "agent_control_off"
  | "store_unavailable"
  /** A bug in the page, not in the call. */
  | "internal";

/**
 * Docs errors (`docs-api.ts`) can add where they happened: the block `id`, the 1-based `op` that failed,
 * the block's `current` rev and markdown on `stale_rev`, or the `max` a limit allows.
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  /** Refs or values that would work instead. */
  options?: string[];
}
export interface Failure {
  error: ApiError;
}
export type Result<T> = T | Failure;

/** Reverses an agent action from its toast. */
export interface Undo {
  label: string;
  run: () => void;
}
/** Every write returns `said`, a one-line summary for the user and the agent. `undo` never reaches the agent. */
export interface WriteResult {
  said: string;
  undo?: Undo;
  [field: string]: unknown;
}

export function fail(code: ErrorCode, message: string, options: string[] = []): Failure {
  return { error: { code, message, ...(options.length ? { options } : {}) } };
}

export function isFailure(result: unknown): result is Failure {
  return typeof result === "object" && result !== null && "error" in result;
}

/** Drops undefined and null fields so results stay compact. */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(compact) as T;
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) if (field !== undefined && field !== null) out[key] = compact(field);
  return out as T;
}
