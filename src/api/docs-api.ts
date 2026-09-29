// Docs and quizzes as commands and queries (spec §6.2–§6.4, §6.8–§6.10, §8, §11). No DOM: the
// tool wrappers (`doc`, `edit_blocks`, the docs parts of `outline`/`read`/`search`) and the UI call
// these methods with plain inputs and get compact results. Errors are returned, never thrown:
// `{ error: { code, message, ... } }` with the codes from spec §6.
//
// The store boots on the first call, so the guide is untouched until someone makes a doc.

import { checkBlockContent, checkBlocks } from "../model/block-content";
import { blockToMarkdown, describeView, exportDocument, markdownToBlocks, parseDocument } from "../model/markdown";
import { summarizeResults } from "../model/quiz";
import { resolveRef } from "../model/refs";
import { stayingIds } from "../model/sequence";
import { LIMITS } from "../store/limits";
import { storageBanner } from "../store/mode";
import {
  type Actor,
  type Artifact,
  type ArtifactKind,
  type ArtifactSummary,
  type Block,
  type BlockContent,
  type BlockData,
  type BlockOp,
  type BlockOpsResult,
  type BlockType,
  LIST_TYPES,
  type MemoryReason,
  type Store,
  type StoreChange,
  type StoreErrorCode,
  type StoreMode,
  type WindowState,
} from "../store/types";
import type { ErrorCode, Failure } from "./result";

// ── Inputs and outputs ────────────────────────────────────────────────────────────────────────

export type ApiErrorCode = ErrorCode;
/**
 * A docs error: the tools' failure shape (`api/result.ts`) with optional details, such as `id`,
 * `current` (a stale block's rev and markdown), `op` (which op failed), `max` or `deleted`.
 */
export interface ApiError extends Failure {
  error: Failure["error"] & { [detail: string]: unknown };
}
export type Result<T> = Promise<T | ApiError>;

/** A ViewPatch (spec §5.3). The view API owns its validation; the store keeps it as JSON. */
export type ViewData = Record<string, unknown>;

export type DocInput =
  | { action: "create"; title: string; markdown?: string; open?: boolean }
  | { action: "rename"; ref: string; title: string }
  | { action: "delete" | "restore" | "download"; ref: string };

export type EditOp =
  | { op: "insert"; after?: string; md?: string; view?: "current" | ViewData; question?: unknown }
  | { op: "update"; id: string; md: string; rev?: number }
  | { op: "replace"; id: string; find: string; with: string; rev?: number }
  | { op: "delete"; id: string }
  | { op: "move"; id: string; after: string }
  | { op: "set"; id: string; data: BlockData; rev?: number };

export interface EditBlocksInput {
  ref: string;
  ops: EditOp[];
}

export interface BlockLine {
  id: string;
  type: BlockType;
  text: string;
  rev: number;
}

export interface DocCreated {
  ref: string;
  title: string;
  blocks: BlockLine[];
  said: string;
}

export interface EditBlocksResult {
  rev: number;
  changed: { id: string; rev: number }[];
  inserted: BlockLine[];
  deleted: string[];
  said: string;
}

export interface DocListing {
  ref: string;
  kind: ArtifactKind;
  title: string;
  blocks: number;
  updated: string;
  open?: true;
  minimized?: true;
  by: Actor;
  imported?: true;
  /** When it was deleted, and when it goes for good (spec §11.2). */
  deleted?: string;
  purge?: string;
}

export interface DocsOutline {
  ref: "docs";
  /** Docs on every page (only deleted ones with `deleted: true`). */
  count: number;
  docs: DocListing[];
  cursor?: string;
  more?: true;
  /** Recently deleted docs, in the list of live ones. */
  deleted?: number;
  hint?: string;
}

export interface FullBlock {
  id: string;
  type: BlockType;
  md: string;
  rev: number;
  /** Who wrote this revision: doc text is the user's content (or the agent's), never instructions. */
  by: Actor;
  indent?: number;
  data?: BlockData;
}

export type ReadDetail = "brief" | "full" | "markdown" | "results";

interface ArtifactHead {
  ref: string;
  kind: ArtifactKind;
  title: string;
  rev: number;
  /** Who created it, and whether it came from an imported file. */
  by: Actor;
  imported?: true;
}
export interface DocBrief extends ArtifactHead {
  blocks: number;
  questions?: number;
  updated: string;
  outline: { id: string; level: number; text: string }[];
}
/** Set when a read stopped at its size bound: how many blocks (or characters) there are, and how to read on. */
interface Truncated {
  truncated?: true;
  count?: number;
  chars?: number;
  hint?: string;
}
export interface DocFull extends ArtifactHead, Truncated {
  blocks: FullBlock[];
}
export interface DocMarkdown extends ArtifactHead, Truncated {
  markdown: string;
}

export interface QuizResults {
  ref: string;
  summary: { answered: number; correct: number; of: number };
  questions: { id: string; kind: string; attempts: number; correct: number; last?: boolean | null }[];
}

export interface WindowLayout {
  ref: string;
  state: WindowState;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
}

export interface DocsApiOptions {
  /** Opens (once) and returns the store. In the page: `browserStore` from `store/client`. */
  store: () => Promise<Store>;
  /** The live 3D view as a ViewPatch, for `insert { view: "current" }` (Stage 2 view API). */
  currentView?: () => ViewData | null;
  /** True while the user is typing in this block (Stage 4 editor): agent edits get `locked_by_user`. */
  isLocked?: (blockId: string) => boolean;
  /** Opens or focuses the artifact's window (Stage 4 window manager). */
  open?: (ref: string) => void;
  /** Saves a file. Returns false when the browser blocked it (the window then offers a button). */
  download?: (filename: string, text: string, ref: string) => boolean;
  /**
   * The kill switch (spec §12), checked again right before an agent's write commits: a call that was
   * waiting for the store when the user switched control off returns `agent_control_off`.
   */
  agentAllowed?: () => boolean;
  /** Tells the user something went wrong outside a tool call, such as an Undo that could not run (a toast in the page). */
  notify?: (message: string) => void;
  now?: () => Date;
}

export type StoreStatus = { store: "unopened" | "unavailable" } | { store: StoreMode; reason: MemoryReason; banner?: { text: string; detail?: string } };

// ── Helpers ───────────────────────────────────────────────────────────────────────────────────

const SNIPPET = 80;
/** How an agent makes the first doc, and the hint for an empty docs outline. */
export const CREATE_DOC = 'Create one with doc({ action: "create", title, markdown }).';
export const NO_DOCS = `No docs yet. ${CREATE_DOC}`;
const DAY_MS = 86_400_000;
/** The one way docs errors are made: a code, a message, and details the agent can act on. */
const fail = (code: ApiErrorCode, message: string, details: Record<string, unknown> = {}): ApiError => ({ error: { code, message, ...details } });
export const isApiError = (value: unknown): value is ApiError => typeof value === "object" && value !== null && "error" in value;

const snippet = (text: string) => (text.length > SNIPPET ? `${text.slice(0, SNIPPET - 1)}…` : text).replace(/\s*\n\s*/g, " ");
const line = (block: { id: string; type: BlockType; text: string; rev: number }): BlockLine => ({
  id: block.id,
  type: block.type,
  text: snippet(block.text),
  rev: block.rev,
});
const refOf = (artifact: { kind: ArtifactKind; id: string }) => `${artifact.kind}:${artifact.id}`;
const stamp = (ms: number) => `${new Date(ms).toISOString().slice(0, 16)}Z`;
const quoted = (title: string) => `“${title}”`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function artifactId(ref: unknown): string | null {
  if (typeof ref !== "string") return null;
  const resolved = resolveRef(ref);
  return "ref" in resolved && (resolved.ref.kind === "doc" || resolved.ref.kind === "quiz") ? resolved.ref.id : null;
}

/** Block ids may come bare (`b7x2k`) or as refs (`block:b7x2k`); `start` and `end` pass through. */
function blockId(id: unknown): string {
  return typeof id === "string"
    ? id
        .trim()
        .replace(/^block:/i, "")
        .toLowerCase()
    : "";
}

/** A block's markdown as `read(full)` shows it and `update` accepts it. Views and questions show their caption or prompt; `data` holds the rest. */
function blockMd(block: BlockContent): string {
  return block.type === "view" || block.type === "question" ? block.text : blockToMarkdown(block);
}

function isStoreError(error: unknown): error is Error & { code: StoreErrorCode; details?: Record<string, unknown> } {
  return error instanceof Error && typeof (error as { code?: unknown }).code === "string";
}

function fromError(error: unknown): ApiError {
  if (!isStoreError(error)) return fail("store_unavailable", error instanceof Error ? error.message : String(error));
  const details = { ...error.details };
  const current = details.current as { rev: number; block: Block } | undefined;
  if (error.code === "stale_rev" && current?.block) details.current = { rev: current.rev, md: blockMd(current.block) };
  return fail(error.code, error.message, details);
}

function slug(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return base || "doc";
}

/** Question and view blocks from markdown, agents or the editor are checked and cleaned before they are stored. */
function checkContent(blocks: BlockContent[]): ApiError | null {
  const checked = checkBlocks(blocks);
  return checked.ok ? null : fail(checked.code, checked.message, checked.code === "limit" ? { max: LIMITS.charsPerBlock } : {});
}

/** One question or view block's new content, as a returned error or the clean text and data. */
function checkOne(type: BlockType, data: unknown, text: string): ApiError | { text: string; data?: BlockData } {
  const checked = checkBlockContent(type, data, text);
  return checked.ok ? checked.value : fail(checked.code, checked.message, checked.code === "limit" ? { max: LIMITS.charsPerBlock } : {});
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ops that undo an agent's `edit_blocks` batch (spec §6.9: "block Undo works from the agent toast"):
 * delete what it inserted, restore what it deleted, put moved blocks back and bring changed blocks
 * back to what they were. `after` is the block order once the batch applied. Deletes and updates
 * carry the rev the agent left, so a block the user changed since makes the undo fail with
 * `stale_rev` instead of losing the user's words.
 */
export function undoOps(before: readonly Block[], after: readonly string[], result: BlockOpsResult): BlockOp[] {
  const ops: BlockOp[] = [];
  const order = [...after];
  const place = (id: string, anchor: string) => order.splice(anchor === "start" ? 0 : order.indexOf(anchor) + 1, 0, id);
  for (const block of result.inserted) {
    ops.push({ op: "delete", id: block.id, rev: block.rev });
    order.splice(order.indexOf(block.id), 1);
  }
  const beforeIds = before.map((block) => block.id);
  const anchorFor = (id: string) => {
    for (let index = beforeIds.indexOf(id) - 1; index >= 0; index--) if (order.includes(beforeIds[index])) return beforeIds[index];
    return "start";
  };
  for (const id of [...result.deleted].reverse()) {
    const anchor = anchorFor(id);
    ops.push({ op: "restore", id, after: anchor });
    place(id, anchor);
  }
  const stay = stayingIds(order, beforeIds);
  let previous = "start";
  for (const id of beforeIds) {
    if (!stay.has(id) && order.includes(id)) ops.push({ op: "move", id, after: previous });
    previous = id;
  }
  // A whole-block update (not a revert) also brings back a type the batch changed.
  const earlier = new Map(before.map((block) => [block.id, block]));
  for (const { id, rev } of result.changed) {
    const was = earlier.get(id);
    if (was && was.rev !== rev)
      ops.push({ op: "update", id, rev, block: { type: was.type, indent: was.indent, text: was.text, ...(was.data ? { data: was.data } : {}) } });
  }
  return ops;
}

// ── API ───────────────────────────────────────────────────────────────────────────────────────

export function createDocsApi(options: DocsApiOptions) {
  const now = options.now ?? (() => new Date());
  let opened: Store | null = null;
  let opening: Promise<Store> | null = null;
  let unavailable = false;
  const listeners = new Set<(change: StoreChange) => void>();
  const openListeners = new Set<(store: Store) => void>();

  function attach(db: Store): Store {
    opened = db;
    unavailable = false;
    db.onChange((change) => {
      for (const listener of listeners) listener(change);
    });
    for (const listener of openListeners) listener(db);
    return db;
  }

  /** Opens the store once; overlapping first calls share the same promise. A failed open is tried again later. */
  function store(): Promise<Store> {
    opening ??= options.store().then(attach, (error: unknown) => {
      unavailable = true;
      opening = null;
      throw error;
    });
    return opening;
  }

  /** Null when `actor` may write now; call it with no await between it and the write. */
  function writeBlocked(actor: Actor): ApiError | null {
    if (actor !== "agent" || (options.agentAllowed?.() ?? true)) return null;
    return fail("agent_control_off", "The user has switched off assistant control in About. Nothing was changed.");
  }

  /** Runs `work` with the store; any store failure becomes a returned error. */
  async function withStore<T>(work: (db: Store) => Promise<T | ApiError>): Result<T> {
    let db: Store;
    try {
      db = await store();
    } catch (error) {
      return fail("store_unavailable", `Docs are not available: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      return await work(db);
    } catch (error) {
      return fromError(error);
    }
  }

  async function findArtifact(db: Store, ref: unknown, includeDeleted = false): Promise<Artifact | ApiError> {
    const id = artifactId(ref);
    const artifact = id ? await db.getArtifact(id, { includeDeleted }) : null;
    if (artifact) return artifact;
    const recent = await db.listArtifacts({ limit: 5 });
    return fail("unknown_ref", id ? `No doc or quiz ${String(ref)}.` : `Expected doc:<id> or quiz:<id>, got "${String(ref)}".`, {
      options: recent.items.map((item) => refOf(item)),
    });
  }

  // doc (spec §6.8)
  async function doc(
    input: DocInput,
    actor: Actor = "agent",
  ): Result<DocCreated | { ref: string; title?: string; said: string; restore?: string; file?: string }> {
    if (!isObject(input)) return fail("bad_input", "Expected an object with an action.");
    if (input.action === "create") return createArtifact("doc", input.title, input.markdown ?? "", input.open !== false, actor);
    return withStore(async (db) => {
      const found = await findArtifact(db, input.ref, input.action === "restore");
      if (isApiError(found)) return found;
      const ref = refOf(found);
      const blocked = input.action === "download" ? null : writeBlocked(actor);
      if (blocked) return blocked;
      switch (input.action) {
        case "rename": {
          const summary = await db.updateArtifact(found.id, { title: input.title }, actor);
          return { ref, title: summary.title, said: `Renamed ${ref} to ${quoted(summary.title)}` };
        }
        case "delete":
          await db.updateArtifact(found.id, { deleted: true }, actor);
          return {
            ref,
            said: `Deleted ${quoted(found.title)}; restorable for ${LIMITS.purgeAfterDays} days`,
            restore: `doc({ action: "restore", ref: "${ref}" })`,
          };
        case "restore":
          if (found.deletedAt === undefined) return { ref, title: found.title, said: `${quoted(found.title)} is not deleted` };
          await db.updateArtifact(found.id, { deleted: false }, actor);
          return { ref, title: found.title, said: `Restored ${quoted(found.title)}` };
        case "download": {
          const file = `${slug(found.title)}.md`;
          const text = exportDocument(ref, found.title, found.blocks, now());
          const saved = options.download?.(file, text, ref) ?? false;
          return { ref, file, said: saved ? `Downloaded ${file}` : "Download ready in the window" };
        }
        default:
          return fail("bad_input", `Unknown action "${String((input as { action?: unknown }).action)}".`, {
            options: ["create", "rename", "delete", "restore", "download"],
          });
      }
    });
  }

  function createArtifact(
    kind: ArtifactKind,
    title: string,
    markdown: string,
    open: boolean,
    actor: Actor,
    blocks?: BlockContent[],
    imported = false,
  ): Result<DocCreated> {
    return withStore(async (db) => {
      if (typeof markdown !== "string") return fail("bad_input", "markdown must be a string.");
      let content = blocks ?? markdownToBlocks(markdown);
      // Agents often start the markdown with the title as a heading; the window already shows it.
      const first = content[0];
      if (!blocks && first?.type === "h1" && "text" in first && first.text.trim().toLowerCase() === title.trim().toLowerCase()) content = content.slice(1);
      const invalid = checkContent(content) ?? writeBlocked(actor);
      if (invalid) return invalid;
      const artifact = await db.createArtifact({ kind, title, blocks: content, ...(imported ? { imported } : {}) }, actor);
      const ref = refOf(artifact);
      if (open) options.open?.(ref);
      return {
        ref,
        title: artifact.title,
        blocks: artifact.blocks.map(line),
        said: `Created ${kind} ${quoted(artifact.title)} with ${plural(artifact.blocks.length, "block")}`,
      };
    });
  }

  // edit_blocks (spec §6.9)
  async function editBlocks(input: EditBlocksInput, actor: Actor = "agent"): Result<EditBlocksResult> {
    if (!isObject(input) || !Array.isArray(input.ops) || input.ops.length === 0) return fail("bad_input", "Send a ref and 1–50 ops.");
    if (input.ops.length > LIMITS.opsPerCall)
      return fail("limit", `At most ${LIMITS.opsPerCall} ops per call (got ${input.ops.length}). Split the batch.`, { max: LIMITS.opsPerCall });
    return withStore(async (db) => {
      const artifact = await findArtifact(db, input.ref);
      if (isApiError(artifact)) return artifact;
      const blocks = new Map(artifact.blocks.map((block) => [block.id, block]));
      const ops: BlockOp[] = [];
      for (const [index, op] of input.ops.entries()) {
        const translated = translateOp(op, blocks, artifact.kind, actor);
        if (isApiError(translated)) {
          const { code, message, ...details } = translated.error;
          return fail(code, `Op ${index + 1}: ${message}`, { ...details, op: index + 1 });
        }
        ops.push(translated);
      }
      const blocked = writeBlocked(actor);
      if (blocked) return blocked;
      const result = await db.applyBlockOps(artifact.id, ops, actor);
      const parts = [
        result.inserted.length && `${result.inserted.length} added`,
        result.changed.length && `${result.changed.length} changed`,
        result.deleted.length && `${result.deleted.length} deleted`,
      ].filter(Boolean);
      return {
        rev: result.rev,
        changed: result.changed,
        inserted: result.inserted.map(line),
        deleted: result.deleted,
        said: `Edited ${quoted(artifact.title)}: ${parts.join(", ") || "no changes"}`,
      };
    });
  }

  function translateOp(op: EditOp, blocks: Map<string, Block>, kind: ArtifactKind, actor: Actor): BlockOp | ApiError {
    if (!isObject(op)) return fail("bad_input", "Each op must be an object.");
    if (op.op === "insert") return translateInsert(op);
    const id = blockId((op as { id?: unknown }).id);
    const block = blocks.get(id);
    if (!block) return fail("unknown_ref", `No block ${String((op as { id?: unknown }).id)} in this ${kind}.`, { options: [...blocks.keys()].slice(0, 5) });
    if (actor === "agent" && options.isLocked?.(id)) return fail("locked_by_user", `The user is editing block ${id}. Try again in a few seconds.`, { id });
    const rev = (op as { rev?: unknown }).rev;
    if (actor === "agent" && ["update", "replace", "set"].includes(op.op) && !Number.isInteger(rev))
      return fail("bad_input", `${op.op} needs the block's rev (from outline or read).`);
    switch (op.op) {
      case "update": {
        if (typeof op.md !== "string") return fail("bad_input", "update needs md.");
        const parsed = markdownToBlocks(op.md);
        if (parsed.length > 1) return fail("bad_input", `md has ${parsed.length} blocks; update takes one. Use insert for more.`);
        const next = parsed[0];
        if (!next || next.type === "p") {
          const text = next?.text ?? "";
          if (block.type !== "question") return { op: "update", id, rev: op.rev, text };
          // A question's text is its prompt.
          const checked = checkOne("question", { ...block.data, prompt: text }, text);
          return isApiError(checked) ? checked : { op: "update", id, rev: op.rev, text: checked.text };
        }
        const invalid = checkContent([next]);
        if (invalid) return invalid;
        // A single block's markdown carries no nesting, so a list block that stays a list keeps its indent.
        const indent = LIST_TYPES.includes(next.type) && LIST_TYPES.includes(block.type) ? block.indent : 0;
        return { op: "update", id, rev: op.rev, block: { ...next, indent } };
      }
      case "replace": {
        // The store rewrites a question's prompt; check the prompt it would make (M3).
        const at = typeof op.find === "string" && op.find ? block.text.indexOf(op.find) : -1;
        if (block.type === "question" && at >= 0 && typeof op.with === "string") {
          const prompt = block.text.slice(0, at) + op.with + block.text.slice(at + op.find.length);
          const checked = checkOne("question", { ...block.data, prompt }, prompt);
          if (isApiError(checked)) return checked;
        }
        return { op: "replace", id, rev: op.rev, find: op.find, with: op.with };
      }
      case "delete":
        return { op: "delete", id };
      case "move":
        return { op: "move", id, after: blockId(op.after) };
      case "set": {
        if (!isObject(op.data)) return fail("bad_input", "set needs a data object.");
        if (block.type !== "question" && block.type !== "view") return { op: "set", id, rev: op.rev, data: op.data };
        const checked = checkOne(block.type, op.data, block.text);
        return isApiError(checked) ? checked : { op: "set", id, rev: op.rev, data: checked.data as BlockData };
      }
      default:
        return fail("bad_input", `Unknown op "${String((op as { op?: unknown }).op)}".`, { options: ["insert", "update", "replace", "delete", "move", "set"] });
    }
  }

  function translateInsert(op: Extract<EditOp, { op: "insert" }>): BlockOp | ApiError {
    const after = op.after === undefined ? undefined : blockId(op.after);
    const given = [op.md !== undefined, op.view !== undefined, op.question !== undefined].filter(Boolean).length;
    if (given !== 1) return fail("bad_input", "insert takes exactly one of md, view or question.");
    if (op.md !== undefined) {
      if (typeof op.md !== "string") return fail("bad_input", "md must be a string.");
      const blocks = markdownToBlocks(op.md);
      if (!blocks.length) return fail("bad_input", "md has no blocks to insert.");
      const invalid = checkContent(blocks);
      return invalid ?? { op: "insert", after, blocks };
    }
    if (op.view !== undefined) {
      const view = op.view === "current" ? options.currentView?.() : op.view;
      if (op.view === "current" && !view) return fail("not_available", "The current 3D view is not available here.");
      if (!isObject(view)) return fail("bad_input", 'view must be "current" or a view object.');
      const checked = checkOne("view", view, describeView(view));
      return isApiError(checked) ? checked : { op: "insert", after, blocks: [{ type: "view", ...checked }] };
    }
    const checked = checkOne("question", op.question, "");
    return isApiError(checked) ? checked : { op: "insert", after, blocks: [{ type: "question", ...checked }] };
  }

  function headOf(artifact: Artifact): ArtifactHead {
    const head: ArtifactHead = { ref: refOf(artifact), kind: artifact.kind, title: artifact.title, rev: artifact.rev, by: artifact.createdBy };
    if (artifact.imported) head.imported = true;
    return head;
  }

  // outline (spec §6.2): `docs`, and `doc:*` / `quiz:*`
  function listing(summary: ArtifactSummary): DocListing {
    const item: DocListing = {
      ref: refOf(summary),
      kind: summary.kind,
      title: summary.title,
      blocks: summary.blockCount,
      updated: stamp(summary.updatedAt),
      by: summary.createdBy,
    };
    if (summary.imported) item.imported = true;
    if (summary.window === "open") item.open = true;
    if (summary.window === "minimized") item.minimized = true;
    if (summary.deletedAt !== undefined) {
      item.deleted = stamp(summary.deletedAt);
      item.purge = stamp(summary.deletedAt + LIMITS.purgeAfterDays * DAY_MS);
    }
    return item;
  }

  /** The user's docs and quizzes, newest first; `deleted: true` lists the recently deleted ones instead. */
  function outlineDocs(input: { limit?: number; cursor?: string; kind?: ArtifactKind; deleted?: boolean } = {}): Result<DocsOutline> {
    return withStore(async (db) => {
      const onlyDeleted = input.deleted === true;
      const page = await db.listArtifacts({ kind: input.kind, onlyDeleted, limit: input.limit, cursor: input.cursor });
      const result: DocsOutline = { ref: "docs", count: page.total, docs: page.items.map(listing) };
      if (page.cursor) Object.assign(result, { cursor: page.cursor, more: true });
      if (onlyDeleted) {
        if (page.total) result.hint = `Deleted docs are kept for ${LIMITS.purgeAfterDays} days. Bring one back with doc({ action: "restore", ref }).`;
        return result;
      }
      const deleted = (await db.listArtifacts({ kind: input.kind, onlyDeleted: true, limit: 1 })).total;
      if (deleted) result.deleted = deleted;
      const recent = deleted ? ` ${plural(deleted, "recently deleted doc")}: outline({ ref: "docs", deleted: true }).` : "";
      if (!page.total) result.hint = `${NO_DOCS}${recent}`;
      else if (recent) result.hint = recent.trim();
      return result;
    });
  }

  function outlineArtifact(
    ref: string,
    input: { limit?: number; cursor?: string } = {},
  ): Result<ArtifactHead & { count: number; blocks: (BlockLine & { by: Actor })[]; cursor?: string }> {
    return withStore(async (db) => {
      const artifact = await findArtifact(db, ref);
      if (isApiError(artifact)) return artifact;
      const limit = Math.min(Math.max(Math.trunc(input.limit ?? LIMITS.listDefault), 1), LIMITS.listMax);
      const start = input.cursor === undefined ? 0 : Number.parseInt(input.cursor, 10);
      if (!Number.isInteger(start) || start < 0) return fail("bad_input", "That cursor is not valid. Start again without one.");
      const page = artifact.blocks.slice(start, start + limit).map((block) => ({ ...line(block), by: block.updatedBy }));
      const result = { ...headOf(artifact), count: artifact.blocks.length, blocks: page };
      return start + limit < artifact.blocks.length ? { ...result, cursor: String(start + limit) } : result;
    });
  }

  // read (spec §6.3): brief, full, markdown, results
  /** `maxChars` bounds full and markdown reads for agents (L3); the page's own reads leave it out and get everything. */
  function read(ref: string, detail: ReadDetail = "brief", bound: { maxChars?: number } = {}): Result<DocBrief | DocFull | DocMarkdown | QuizResults> {
    return withStore(async (db) => {
      const artifact = await findArtifact(db, ref);
      if (isApiError(artifact)) return artifact;
      const head = headOf(artifact);
      switch (detail) {
        case "brief": {
          const headings = artifact.blocks.filter((block) => /^h[1-3]$/.test(block.type)).slice(0, LIMITS.listDefault);
          const questions = artifact.blocks.filter((block) => block.type === "question").length;
          return {
            ...head,
            blocks: artifact.blocks.length,
            ...(questions ? { questions } : {}),
            updated: stamp(artifact.updatedAt),
            outline: headings.map((block) => ({ id: block.id, level: Number(block.type[1]), text: snippet(block.text) })),
          };
        }
        case "full": {
          const blocks: FullBlock[] = [];
          let size = 0;
          for (const block of artifact.blocks) {
            const full: FullBlock = { id: block.id, type: block.type, md: blockMd(block), rev: block.rev, by: block.updatedBy };
            if (block.indent) full.indent = block.indent;
            if (block.data && (block.type === "view" || block.type === "question")) full.data = block.data;
            size += JSON.stringify(full).length;
            if (bound.maxChars && size > bound.maxChars && blocks.length) break;
            blocks.push(full);
          }
          const count = artifact.blocks.length;
          if (blocks.length === count) return { ...head, blocks };
          const hint = `Showing blocks 1–${blocks.length} of ${count}. List the rest with outline({ ref: "${head.ref}", cursor: "${blocks.length}" }), then read each with read({ ref: "block:<id>", detail: "full" }).`;
          return { ...head, blocks, truncated: true, count, hint };
        }
        case "markdown": {
          const markdown = exportDocument(head.ref, artifact.title, artifact.blocks, now());
          if (!bound.maxChars || markdown.length <= bound.maxChars) return { ...head, markdown };
          // Cut between blocks where one ends inside the bound.
          const cut = markdown.lastIndexOf("\n\n", bound.maxChars - 1);
          const hint = `This is the first part of a ${markdown.length.toLocaleString("en")}-character file. Read the rest with read({ ref: "${head.ref}", detail: "full" }) and outline, or give the user the whole file with doc({ action: "download", ref: "${head.ref}" }).`;
          return { ...head, markdown: `${markdown.slice(0, cut > 0 ? cut : bound.maxChars - 1)}\n`, truncated: true, chars: markdown.length, hint };
        }
        case "results":
          return results(db, artifact);
        default:
          return fail("bad_input", `detail must be brief, full, markdown or results.`, { options: ["brief", "full", "markdown", "results"] });
      }
    });
  }

  async function results(db: Store, artifact: Artifact): Promise<QuizResults> {
    const attempts = await db.listAttempts(artifact.id);
    const questions = artifact.blocks.filter((block) => block.type === "question").map((block) => ({ id: block.id, kind: String(block.data?.kind ?? "?") }));
    return { ref: refOf(artifact), ...summarizeResults(questions, attempts) };
  }

  // search (spec §6.4): live block rows for the shared scorer in model/search.ts
  function searchRows(): Result<{ ref: string; in: string; title: string; type: BlockType; text: string }[]> {
    return withStore(async (db) =>
      (await db.searchRows()).map((row) => ({ ref: `block:${row.id}`, in: `${row.kind}:${row.artifactId}`, title: row.title, type: row.type, text: row.text })),
    );
  }

  /** Finds the doc or quiz that holds a block, for `go(block:*)` and `window({ ref: "block:*" })`. */
  function locate(ref: string): Result<{ ref: string; block: string }> {
    return withStore(async (db) => {
      const id = blockId(ref);
      const found = id ? await db.locateBlock(id) : null;
      if (!found) return fail("unknown_ref", `No block ${ref}.`);
      return { ref: `${found.kind}:${found.artifactId}`, block: id };
    });
  }

  // quiz storage (spec §6.10); grading is in the page (model/quiz.ts, ui/quiz-card.ts)
  async function createQuiz(input: { title: string; questions: unknown[]; intro?: string; open?: boolean }, actor: Actor = "agent"): Result<DocCreated> {
    if (!isObject(input) || !Array.isArray(input.questions) || input.questions.length === 0)
      return fail("bad_input", "A quiz needs a title and 1–30 questions.");
    if (input.questions.length > LIMITS.questionsPerQuiz)
      return fail("limit", `A quiz holds at most ${LIMITS.questionsPerQuiz} questions (got ${input.questions.length}).`, { max: LIMITS.questionsPerQuiz });
    const blocks: BlockContent[] = input.intro ? markdownToBlocks(input.intro).filter((block) => block.type !== "question") : [];
    for (const question of input.questions) blocks.push({ type: "question", text: "", data: question as BlockData });
    // Checked before the store opens, so a bad question never starts it.
    const invalid = checkContent(blocks);
    if (invalid) return invalid;
    return createArtifact("quiz", input.title, "", input.open !== false, actor, blocks);
  }

  function recordAttempt(input: { ref: string; block: string; answer: unknown; correct?: boolean | null }): Result<{ attempt: number }> {
    return withStore(async (db) => {
      const id = artifactId(input.ref);
      if (!id) return fail("unknown_ref", `Expected quiz:<id> or doc:<id>, got "${input.ref}".`);
      return { attempt: await db.recordAttempt({ artifactId: id, blockId: blockId(input.block), answer: input.answer, correct: input.correct }) };
    });
  }

  // window persistence hooks (spec §8)
  function saveWindows(layout: WindowLayout[]): Result<{ saved: number }> {
    return withStore(async (db) => {
      const rows = [];
      for (const window of layout) {
        const id = artifactId(window.ref);
        if (!id) return fail("unknown_ref", `Expected doc:<id> or quiz:<id>, got "${window.ref}".`);
        rows.push({ artifactId: id, state: window.state, x: window.x, y: window.y, w: window.w, h: window.h, z: window.z });
      }
      await db.saveWindows(rows);
      return { saved: rows.length };
    });
  }

  function loadWindows(): Result<WindowLayout[]> {
    return withStore(async (db) => {
      return (await db.listWindows()).map(({ artifactId: id, kind, ...rest }) => ({ ref: `${kind ?? "doc"}:${id}`, ...rest }));
    });
  }

  /** A whole artifact with its live blocks, for the editor and for undo. */
  function load(ref: string): Result<Artifact & { ref: string }> {
    return withStore(async (db) => {
      const artifact = await findArtifact(db, ref);
      return isApiError(artifact) ? artifact : { ...artifact, ref: refOf(artifact) };
    });
  }

  /**
   * Store-level block ops from the user's editor or from an Undo (spec §9.3): no markdown, and revs only
   * where the ops carry them. The whole save is one transaction, so a large paste or reorder is saved
   * whole or not at all.
   */
  function saveBlocks(ref: string, ops: BlockOp[], actor: Actor = "user", tag: { origin?: string } = {}): Result<BlockOpsResult> {
    return withStore(async (db) => {
      const id = artifactId(ref);
      if (!id) return fail("unknown_ref", `Expected doc:<id> or quiz:<id>, got "${ref}".`);
      if (!ops.length) return fail("bad_input", "Nothing to save.");
      for (const op of ops) {
        const invalid = op.op === "insert" ? checkContent(op.blocks) : op.op === "update" && op.block ? checkContent([op.block]) : null;
        if (invalid) return invalid;
      }
      const blocked = writeBlocked(actor);
      if (blocked) return blocked;
      return db.applyBlockOps(id, ops, actor, tag);
    });
  }

  /** Storage mode for `get_context` and the banner, without booting the store. */
  function status(): StoreStatus {
    if (unavailable) return { store: "unavailable" };
    if (!opened) return { store: "unopened" };
    const banner = storageBanner(opened.mode, opened.reason);
    return banner ? { store: opened.mode, reason: opened.reason, banner } : { store: opened.mode, reason: opened.reason };
  }

  /** Runs once the store has opened (for example to mirror the activity log into it); does not open it. */
  function onOpen(listener: (store: Store) => void): () => void {
    if (opened) listener(opened);
    openListeners.add(listener);
    return () => openListeners.delete(listener);
  }

  /** A markdown file as a new doc: a file this guide exported keeps its title, others take the file name. */
  function importDoc(text: string, fileName: string, actor: Actor = "user"): Result<DocCreated> {
    if (typeof text !== "string") return Promise.resolve(fail("bad_input", "The file is not text."));
    const parsed = parseDocument(text);
    const title = parsed.title ?? (fileName.replace(/\.(md|markdown|txt)$/i, "").trim() || "Imported notes");
    return createArtifact("doc", title.slice(0, LIMITS.titleChars), "", true, actor, parsed.blocks, true);
  }

  /** Change events for the UI. Attaches when the store opens; does not open it. */
  function onChange(listener: (change: StoreChange) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /** Shows a message to the user (a toast in the page, a warning elsewhere). */
  function notify(message: string) {
    if (options.notify) options.notify(message);
    else console.warn(message);
  }

  return {
    doc,
    editBlocks,
    load,
    saveBlocks,
    importDoc,
    onOpen,
    outlineDocs,
    outlineArtifact,
    read,
    searchRows,
    locate,
    createQuiz,
    recordAttempt,
    saveWindows,
    loadWindows,
    status,
    onChange,
    notify,
  };
}

export type DocsApi = ReturnType<typeof createDocsApi>;
