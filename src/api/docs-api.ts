// Docs and quizzes as commands and queries (spec §6.2–§6.4, §6.8–§6.10, §8, §11). No DOM: the
// tool wrappers (`doc`, `edit_blocks`, the docs parts of `outline`/`read`/`search`) and the UI call
// these methods with plain inputs and get compact results. Errors are returned, never thrown:
// `{ error: { code, message, ... } }` with the codes from spec §6.
//
// The store boots on the first call, so the guide is untouched until someone makes a doc.

import { blockToMarkdown, describeView, exportDocument, markdownToBlocks, parseDocument } from "../model/markdown";
import { summarizeResults, validateQuestion } from "../model/quiz";
import { resolveRef } from "../model/refs";
import { stayingIds } from "../model/sequence";
import { LIMITS } from "../store/limits";
import { storageBanner } from "../store/mode";
import type {
  Actor,
  Artifact,
  ArtifactKind,
  ArtifactSummary,
  Block,
  BlockContent,
  BlockData,
  BlockOp,
  BlockOpsResult,
  BlockType,
  MemoryReason,
  Store,
  StoreChange,
  StoreErrorCode,
  StoreMode,
  WindowState,
} from "../store/types";

// ── Inputs and outputs ────────────────────────────────────────────────────────────────────────

export type ApiErrorCode = StoreErrorCode | "not_available" | "locked_by_user" | "agent_control_off";
export interface ApiError {
  error: { code: ApiErrorCode; message: string; options?: string[]; [detail: string]: unknown };
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
  deleted?: string;
}

export interface FullBlock {
  id: string;
  type: BlockType;
  md: string;
  rev: number;
  indent?: number;
  data?: BlockData;
}

export type ReadDetail = "brief" | "full" | "markdown" | "results";

interface ArtifactHead {
  ref: string;
  kind: ArtifactKind;
  title: string;
  rev: number;
}
export interface DocBrief extends ArtifactHead {
  blocks: number;
  questions?: number;
  updated: string;
  outline: { id: string; level: number; text: string }[];
}
export interface DocFull extends ArtifactHead {
  blocks: FullBlock[];
}
export interface DocMarkdown extends ArtifactHead {
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
  now?: () => Date;
}

export type StoreStatus = { store: "unopened" | "unavailable" } | { store: StoreMode; reason: MemoryReason; banner?: { text: string; detail?: string } };

// ── Helpers ───────────────────────────────────────────────────────────────────────────────────

const SNIPPET = 80;
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

/** Question blocks from markdown or agents are checked and cleaned before they are stored. */
function checkQuestions(blocks: BlockContent[]): ApiError | null {
  for (const [index, block] of blocks.entries()) {
    if (block.type !== "question") continue;
    const checked = validateQuestion(block.data);
    if (!checked.ok) return fail("bad_input", `Question ${index + 1}: ${checked.message}`);
    block.data = checked.value as unknown as BlockData;
    block.text = checked.value.prompt;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ops that undo an agent's `edit_blocks` batch (spec §6.9: "block Undo works from the agent toast"):
 * delete what it inserted, restore what it deleted, put moved blocks back and revert changed text
 * and data to the revisions they had. `after` is the block order once the batch applied.
 */
export function undoOps(before: readonly Block[], after: readonly string[], result: BlockOpsResult): BlockOp[] {
  const ops: BlockOp[] = [];
  const order = [...after];
  const place = (id: string, anchor: string) => order.splice(anchor === "start" ? 0 : order.indexOf(anchor) + 1, 0, id);
  for (const block of result.inserted) {
    ops.push({ op: "delete", id: block.id });
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
      ops.push({ op: "update", id, block: { type: was.type, indent: was.indent, text: was.text, ...(was.data ? { data: was.data } : {}) } });
  }
  return ops;
}

// ── API ───────────────────────────────────────────────────────────────────────────────────────

export function createDocsApi(options: DocsApiOptions) {
  const now = options.now ?? (() => new Date());
  let opened: Store | null = null;
  let unavailable = false;
  const listeners = new Set<(change: StoreChange) => void>();
  const openListeners = new Set<(store: Store) => void>();

  async function store(): Promise<Store> {
    if (opened) return opened;
    try {
      opened = await options.store();
    } catch (error) {
      unavailable = true;
      throw error;
    }
    opened.onChange((change) => {
      for (const listener of listeners) listener(change);
    });
    for (const listener of openListeners) listener(opened);
    return opened;
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

  function createArtifact(kind: ArtifactKind, title: string, markdown: string, open: boolean, actor: Actor, blocks?: BlockContent[]): Result<DocCreated> {
    return withStore(async (db) => {
      if (typeof markdown !== "string") return fail("bad_input", "markdown must be a string.");
      let content = blocks ?? markdownToBlocks(markdown);
      // Agents often start the markdown with the title as a heading; the window already shows it.
      const first = content[0];
      if (!blocks && first?.type === "h1" && "text" in first && first.text.trim().toLowerCase() === title.trim().toLowerCase()) content = content.slice(1);
      const invalid = checkQuestions(content);
      if (invalid) return invalid;
      const artifact = await db.createArtifact({ kind, title, blocks: content }, actor);
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
          if (block.type === "question" && (!text.trim() || text.length > LIMITS.promptChars))
            return fail("bad_input", `A question prompt is 1–${LIMITS.promptChars} characters.`);
          return { op: "update", id, rev: op.rev, text };
        }
        const invalid = checkQuestions([next]);
        if (invalid) return invalid;
        // A single block's markdown carries no nesting, so list blocks keep their indent.
        const { indent: _indent, ...content } = next;
        return { op: "update", id, rev: op.rev, block: content as BlockContent };
      }
      case "replace":
        return { op: "replace", id, rev: op.rev, find: op.find, with: op.with };
      case "delete":
        return { op: "delete", id };
      case "move":
        return { op: "move", id, after: blockId(op.after) };
      case "set": {
        if (!isObject(op.data)) return fail("bad_input", "set needs a data object.");
        if (block.type === "question") {
          const checked = validateQuestion(op.data);
          if (!checked.ok) return fail("bad_input", checked.message);
          return { op: "set", id, rev: op.rev, data: checked.value as unknown as BlockData };
        }
        return { op: "set", id, rev: op.rev, data: op.data };
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
      const invalid = checkQuestions(blocks);
      return invalid ?? { op: "insert", after, blocks };
    }
    if (op.view !== undefined) {
      const view = op.view === "current" ? options.currentView?.() : op.view;
      if (op.view === "current" && !view) return fail("not_available", "The current 3D view is not available here.");
      if (!isObject(view)) return fail("bad_input", 'view must be "current" or a view object.');
      return { op: "insert", after, blocks: [{ type: "view", text: describeView(view), data: view }] };
    }
    const checked = validateQuestion(op.question);
    if (!checked.ok) return fail("bad_input", checked.message);
    return { op: "insert", after, blocks: [{ type: "question", text: checked.value.prompt, data: checked.value as unknown as BlockData }] };
  }

  // outline (spec §6.2): `docs`, and `doc:*` / `quiz:*`
  function listing(summary: ArtifactSummary): DocListing {
    const item: DocListing = { ref: refOf(summary), kind: summary.kind, title: summary.title, blocks: summary.blockCount, updated: stamp(summary.updatedAt) };
    if (summary.window === "open") item.open = true;
    if (summary.window === "minimized") item.minimized = true;
    if (summary.deletedAt !== undefined) item.deleted = stamp(summary.deletedAt);
    return item;
  }

  function outlineDocs(
    input: { limit?: number; cursor?: string; kind?: ArtifactKind; deleted?: boolean } = {},
  ): Result<{ docs: DocListing[]; cursor?: string }> {
    return withStore(async (db) => {
      const page = await db.listArtifacts({ kind: input.kind, includeDeleted: input.deleted, limit: input.limit, cursor: input.cursor });
      return page.cursor ? { docs: page.items.map(listing), cursor: page.cursor } : { docs: page.items.map(listing) };
    });
  }

  function outlineArtifact(
    ref: string,
    input: { limit?: number; cursor?: string } = {},
  ): Result<{ ref: string; kind: ArtifactKind; title: string; rev: number; count: number; blocks: BlockLine[]; cursor?: string }> {
    return withStore(async (db) => {
      const artifact = await findArtifact(db, ref);
      if (isApiError(artifact)) return artifact;
      const limit = Math.min(Math.max(Math.trunc(input.limit ?? LIMITS.listDefault), 1), LIMITS.listMax);
      const start = input.cursor === undefined ? 0 : Number.parseInt(input.cursor, 10);
      if (!Number.isInteger(start) || start < 0) return fail("bad_input", "That cursor is not valid. Start again without one.");
      const page = artifact.blocks.slice(start, start + limit).map(line);
      const result = { ref: refOf(artifact), kind: artifact.kind, title: artifact.title, rev: artifact.rev, count: artifact.blocks.length, blocks: page };
      return start + limit < artifact.blocks.length ? { ...result, cursor: String(start + limit) } : result;
    });
  }

  // read (spec §6.3): brief, full, markdown, results
  function read(ref: string, detail: ReadDetail = "brief"): Result<DocBrief | DocFull | DocMarkdown | QuizResults> {
    return withStore(async (db) => {
      const artifact = await findArtifact(db, ref);
      if (isApiError(artifact)) return artifact;
      const head: ArtifactHead = { ref: refOf(artifact), kind: artifact.kind, title: artifact.title, rev: artifact.rev };
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
        case "full":
          return {
            ...head,
            blocks: artifact.blocks.map((block) => {
              const full: FullBlock = { id: block.id, type: block.type, md: blockMd(block), rev: block.rev };
              if (block.indent) full.indent = block.indent;
              if (block.data && (block.type === "view" || block.type === "question")) full.data = block.data;
              return full;
            }),
          };
        case "markdown":
          return { ...head, markdown: exportDocument(head.ref, artifact.title, artifact.blocks, now()) };
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
    for (const [index, question] of input.questions.entries()) {
      const checked = validateQuestion(question);
      if (!checked.ok) return fail("bad_input", `Question ${index + 1}: ${checked.message}`);
      blocks.push({ type: "question", text: checked.value.prompt, data: checked.value as unknown as BlockData });
    }
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
   * Store-level block ops from the user's editor or from an Undo (spec §9.3): no markdown, no rev check.
   * Batches over the per-call limit are split, so each part is its own transaction.
   */
  function saveBlocks(ref: string, ops: BlockOp[], actor: Actor = "user"): Result<BlockOpsResult> {
    return withStore(async (db) => {
      const id = artifactId(ref);
      if (!id) return fail("unknown_ref", `Expected doc:<id> or quiz:<id>, got "${ref}".`);
      if (!ops.length) return fail("bad_input", "Nothing to save.");
      let result: BlockOpsResult = { rev: 0, changed: [], inserted: [], deleted: [] };
      for (let start = 0; start < ops.length; start += LIMITS.opsPerCall) {
        const part = await db.applyBlockOps(id, ops.slice(start, start + LIMITS.opsPerCall), actor);
        result = {
          rev: part.rev,
          changed: [...result.changed, ...part.changed],
          inserted: [...result.inserted, ...part.inserted],
          deleted: [...result.deleted, ...part.deleted],
        };
      }
      return result;
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
    return createArtifact("doc", title.slice(0, LIMITS.titleChars), "", true, actor, parsed.blocks);
  }

  /** Change events for the UI. Attaches when the store opens; does not open it. */
  function onChange(listener: (change: StoreChange) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
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
  };
}

export type DocsApi = ReturnType<typeof createDocsApi>;
