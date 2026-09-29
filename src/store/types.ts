// Types shared by the store engine (worker or Node), the worker RPC client and the docs API.
// Spec: docs/agent-surface-spec.md §9.1 (blocks), §11 (persistence), §13 (limits).

export type Actor = "user" | "agent";
export type ArtifactKind = "doc" | "quiz";
export type StoreMode = "local" | "memory" | "remote";

export const BLOCK_TYPES = ["h1", "h2", "h3", "p", "bullet", "number", "todo", "quote", "callout", "code", "table", "divider", "view", "question"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
/** List blocks carry an `indent` of 0–3; every other block type is flat. */
export const LIST_TYPES: readonly BlockType[] = ["bullet", "number", "todo"];
export const CALLOUT_TONES = ["note", "tip", "warning"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

/** JSON stored in `blocks.data`: `{ checked }` (todo), `{ tone }` (callout), `{ lang }` (code), a ViewPatch (view) or a Question (question). */
export type BlockData = Record<string, unknown>;

/** A block's content, without identity or bookkeeping. `text` is inline markdown (the source, for code and table). */
export interface BlockContent {
  /** Inserts only: an id chosen by the user's editor. The store uses it when it is free (5 base36 characters) and assigns another otherwise. */
  id?: string;
  type: BlockType;
  indent?: number;
  text: string;
  data?: BlockData;
}

export interface Block extends Required<Omit<BlockContent, "data" | "id">> {
  id: string;
  data?: BlockData;
  rev: number;
  updatedBy: Actor;
  updatedAt: number;
}

export interface ArtifactSummary {
  id: string;
  kind: ArtifactKind;
  title: string;
  rev: number;
  blockCount: number;
  createdBy: Actor;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  /** Saved window state, if the artifact has a window. */
  window?: WindowState;
}

export interface Artifact extends ArtifactSummary {
  blocks: Block[];
}

export interface NewArtifact {
  kind: ArtifactKind;
  title: string;
  blocks: BlockContent[];
}

/** Where an insert or move lands: after a block id, or at the start or end of the artifact. */
export type Anchor = string;

/**
 * Store-level block operations, applied in order in one transaction. Markdown is parsed before it
 * reaches the store (docs API), so ops carry block content. `rev` is checked when present; the
 * user's editor may omit it because the user is the local authority (spec §9.3).
 */
export type BlockOp =
  | { op: "insert"; after?: Anchor; blocks: BlockContent[] }
  /** Send `block` to replace type, indent, text and data, or `text` alone to keep the rest. */
  | { op: "update"; id: string; rev?: number; block?: BlockContent; text?: string }
  | { op: "replace"; id: string; rev?: number; find: string; with: string }
  /** `rev`, when given, must match: an undo does not delete a block someone changed since. */
  | { op: "delete"; id: string; rev?: number }
  | { op: "move"; id: string; after: Anchor }
  | { op: "set"; id: string; rev?: number; data: BlockData }
  /** Undo of a delete: brings a soft-deleted block back after `after`, or at its old position. */
  | { op: "restore"; id: string; after?: Anchor }
  /** Undo of an edit: restores the text and data a block had at history revision `to`. */
  | { op: "revert"; id: string; rev?: number; to: number };

export interface InsertedBlock {
  id: string;
  type: BlockType;
  text: string;
  rev: number;
}

export interface BlockOpsResult {
  rev: number;
  changed: { id: string; rev: number }[];
  inserted: InsertedBlock[];
  deleted: string[];
}

export interface Page<T> {
  items: T[];
  cursor?: string;
  /** How many match, over every page. */
  total: number;
}

export interface ListOptions {
  kind?: ArtifactKind;
  includeDeleted?: boolean;
  /** Only soft-deleted artifacts (the "Recently deleted" list), newest deletion first. */
  onlyDeleted?: boolean;
  limit?: number;
  cursor?: string;
}

export interface SearchRow {
  id: string;
  artifactId: string;
  kind: ArtifactKind;
  title: string;
  type: BlockType;
  text: string;
}

export interface HistoryEntry {
  rev: number;
  text: string;
  data?: BlockData;
  updatedBy: Actor;
  updatedAt: number;
}

export interface NewAttempt {
  artifactId: string;
  blockId: string;
  answer: unknown;
  correct?: boolean | null;
}

export interface Attempt {
  id: number;
  artifactId: string;
  blockId: string;
  answer: unknown;
  correct: boolean | null;
  answeredAt: number;
}

export type WindowState = "open" | "minimized";
export interface WindowRow {
  artifactId: string;
  /** Filled in by `listWindows`; ignored by `saveWindows`. */
  kind?: ArtifactKind;
  state: WindowState;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
}

export interface ActivityEntry {
  actor: Actor;
  kind: string;
  ref?: string;
  summary?: string;
  at?: number;
}

export interface ActivityRow extends Required<Omit<ActivityEntry, "ref" | "summary">> {
  seq: number;
  ref?: string;
  summary?: string;
}

export type StoreChange =
  | { kind: "artifact"; id: string; rev: number; deleted?: boolean }
  | { kind: "blocks"; artifactId: string; rev: number; actor: Actor; ids: string[] }
  | { kind: "windows" };

export type StoreErrorCode = "bad_input" | "unknown_ref" | "stale_rev" | "limit" | "store_unavailable";

/** Thrown by the engine and re-thrown by the RPC client; the docs API turns it into a returned `{ error }`. */
export class StoreError extends Error {
  readonly code: StoreErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: StoreErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "StoreError";
    this.code = code;
    this.details = details;
  }
}

/** Why the store runs in memory; `null` when it saves (spec §11.1). */
export type MemoryReason = "file" | "insecure" | "no-opfs" | "other-tab" | "failed" | null;

/** The persistence interface (spec §11.3). Every method is async because the engine runs in a worker. */
export interface Store {
  readonly mode: StoreMode;
  readonly reason: MemoryReason;
  listArtifacts(options?: ListOptions): Promise<Page<ArtifactSummary>>;
  getArtifact(id: string, options?: { includeDeleted?: boolean }): Promise<Artifact | null>;
  createArtifact(input: NewArtifact, actor: Actor): Promise<Artifact>;
  updateArtifact(id: string, patch: { title?: string; deleted?: boolean }, actor: Actor): Promise<ArtifactSummary>;
  applyBlockOps(artifactId: string, ops: BlockOp[], actor: Actor): Promise<BlockOpsResult>;
  blockHistory(blockId: string): Promise<HistoryEntry[]>;
  /** Finds the artifact that holds a live block. */
  locateBlock(blockId: string): Promise<{ artifactId: string; kind: ArtifactKind } | null>;
  searchRows(): Promise<SearchRow[]>;
  recordAttempt(attempt: NewAttempt): Promise<number>;
  listAttempts(artifactId: string): Promise<Attempt[]>;
  saveWindows(windows: WindowRow[]): Promise<void>;
  listWindows(): Promise<WindowRow[]>;
  appendActivity(entry: ActivityEntry): Promise<number>;
  listActivity(since?: number, limit?: number): Promise<ActivityRow[]>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  onChange(listener: (change: StoreChange) => void): () => void;
}
