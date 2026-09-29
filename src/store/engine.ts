// The store's logic over one SQLite connection. Synchronous and DOM-free: it runs inside the
// worker (OPFS or :memory:) and directly in Node tests. Every write is one transaction, so a batch
// of block ops commits together or not at all (spec §6.9, §11).

import { LIMITS } from "./limits";
import { migrate } from "./migrations";
import { type Bind, type SqlDb, type SqlRow, type SqlValue, transaction } from "./sql";
import {
  type ActivityEntry,
  type ActivityRow,
  type Actor,
  type Anchor,
  type Artifact,
  type ArtifactKind,
  type ArtifactSummary,
  type Attempt,
  BLOCK_TYPES,
  type Block,
  type BlockContent,
  type BlockData,
  type BlockOp,
  type BlockOpsResult,
  type BlockType,
  CALLOUT_TONES,
  type HistoryEntry,
  type InsertedBlock,
  LIST_TYPES,
  type ListOptions,
  type NewArtifact,
  type NewAttempt,
  type Page,
  type SearchRow,
  StoreError,
  type WindowRow,
} from "./types";

export interface EngineOptions {
  now?: () => number;
  /** Random base36 id of the given length; injectable so tests can force collisions. */
  randomId?: (length: number) => string;
}

const DAY_MS = 86_400_000;
const ARTIFACT_ID_LENGTH = 4;
const BLOCK_ID_LENGTH = 5;
const ID_ATTEMPTS = 12;
const RESERVED_IDS = new Set(["start", "end"]);
const TEXT_TYPES = new Set<BlockType>(["h1", "h2", "h3", "p", "bullet", "number", "todo", "quote", "callout", "view", "question"]);
const SINGLE_LINE_TYPES = new Set<BlockType>(["h1", "h2", "h3", "view"]);
const ARTIFACT_COLUMNS = `a.id, a.kind, a.title, a.rev, a.created_by, a.created_at, a.updated_at, a.deleted_at, w.state AS window,
  (SELECT count(*) FROM blocks b WHERE b.artifact_id = a.id AND b.deleted_at IS NULL) AS block_count`;

export function randomBase36(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = "";
  for (const byte of bytes) id += (byte % 36).toString(36);
  return id;
}

/** Opens the store on a connection: migrates, purges expired soft deletes and trims the activity log. */
export function openEngine(db: SqlDb, options: EngineOptions = {}) {
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  const engine = createEngine(db, options);
  engine.maintain();
  return engine;
}

export type Engine = ReturnType<typeof createEngine>;

export function createEngine(db: SqlDb, options: EngineOptions = {}) {
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? randomBase36;

  const rows = (sql: string, bind?: Bind) => db.selectObjects(sql, bind);
  const row = (sql: string, bind?: Bind): SqlRow | undefined => db.selectObjects(sql, bind)[0];
  const value = (sql: string, bind?: Bind) => db.selectValue(sql, bind);
  // oo1's exec() rejects an explicit `undefined` options argument.
  const run = (sql: string, bind?: Bind) => (bind ? db.exec(sql, { bind }) : db.exec(sql));
  const count = (sql: string, bind?: Bind) => Number(value(sql, bind) ?? 0);

  function newId(table: "artifacts" | "blocks", length: number, wanted?: unknown): string {
    // The user's editor names new blocks itself so it can keep editing them while they save; a taken or malformed id is replaced.
    if (typeof wanted === "string" && wanted.length === length && /^[0-9a-z]+$/.test(wanted) && !RESERVED_IDS.has(wanted))
      if (value(`SELECT 1 FROM ${table} WHERE id = ?`, [wanted]) === undefined) return wanted;
    for (let attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
      const id = randomId(length);
      if (RESERVED_IDS.has(id) || !/^[0-9a-z]+$/.test(id)) continue;
      if (value(`SELECT 1 FROM ${table} WHERE id = ?`, [id]) === undefined) return id;
    }
    throw new StoreError("limit", `Could not allocate a unique ${table === "artifacts" ? "artifact" : "block"} id.`);
  }

  // ── Rows ↔ objects ────────────────────────────────────────────────────────────────────────────

  function toSummary(record: SqlRow): ArtifactSummary {
    const summary: ArtifactSummary = {
      id: String(record.id),
      kind: record.kind as ArtifactKind,
      title: String(record.title),
      rev: Number(record.rev),
      blockCount: Number(record.block_count ?? 0),
      createdBy: record.created_by as Actor,
      createdAt: Number(record.created_at),
      updatedAt: Number(record.updated_at),
    };
    if (record.deleted_at !== null && record.deleted_at !== undefined) summary.deletedAt = Number(record.deleted_at);
    if (record.window) summary.window = record.window as ArtifactSummary["window"];
    return summary;
  }

  function toBlock(record: SqlRow): Block {
    const block: Block = {
      id: String(record.id),
      type: record.type as BlockType,
      indent: Number(record.indent),
      text: String(record.text),
      rev: Number(record.rev),
      updatedBy: record.updated_by as Actor,
      updatedAt: Number(record.updated_at),
    };
    if (typeof record.data === "string") block.data = JSON.parse(record.data) as BlockData;
    return block;
  }

  // ── Validation ────────────────────────────────────────────────────────────────────────────────

  function checkTitle(title: unknown): string {
    if (typeof title !== "string" || !title.trim()) throw new StoreError("bad_input", "A title is required.");
    const clean = title.trim().replace(/\s+/g, " ");
    if (clean.length > LIMITS.titleChars) throw new StoreError("limit", `Titles are at most ${LIMITS.titleChars} characters (got ${clean.length}).`);
    return clean;
  }

  function checkText(text: string, what: string) {
    if (text.length > LIMITS.charsPerBlock)
      throw new StoreError("limit", `${what} is ${text.length} characters; a block holds at most ${LIMITS.charsPerBlock}.`, { max: LIMITS.charsPerBlock });
  }

  function encodeData(data: BlockData | undefined): string | null {
    if (data === undefined) return null;
    const json = JSON.stringify(data);
    checkText(json, "Block data");
    return json;
  }

  const isObject = (input: unknown): input is BlockData => typeof input === "object" && input !== null && !Array.isArray(input);

  /** Validates and normalizes one block's type-specific data. */
  function normalizeData(type: BlockType, data: unknown): BlockData | undefined {
    if (data !== undefined && !isObject(data)) throw new StoreError("bad_input", `Data for a ${type} block must be an object.`);
    switch (type) {
      case "todo":
        return { checked: data?.checked === true };
      case "callout": {
        const tone = data?.tone ?? "note";
        if (!CALLOUT_TONES.includes(tone as never)) throw new StoreError("bad_input", `Callout tone must be one of ${CALLOUT_TONES.join(", ")}.`);
        return { tone };
      }
      case "code": {
        const lang = data?.lang ?? "";
        if (typeof lang !== "string" || !/^[\w+#.-]{0,32}$/.test(lang))
          throw new StoreError("bad_input", "Code language must be a short word such as ts or python.");
        return lang ? { lang } : undefined;
      }
      case "view":
        if (!data) throw new StoreError("bad_input", "A view block needs view data.");
        return data;
      case "question": {
        if (!data || typeof data.kind !== "string" || typeof data.prompt !== "string")
          throw new StoreError("bad_input", "A question block needs question data with a kind and a prompt.");
        // The docs API checks the whole question; this keeps a text edit (replace, update) from breaking its prompt.
        const prompt = data.prompt.trim();
        if (!prompt || prompt.length > LIMITS.promptChars)
          throw new StoreError("bad_input", `A question prompt is 1–${LIMITS.promptChars} characters (this would make ${prompt.length}).`);
        return data;
      }
      default:
        if (data !== undefined && Object.keys(data).length > 0) throw new StoreError("bad_input", `${type} blocks have no data.`);
        return undefined;
    }
  }

  interface Content {
    type: BlockType;
    indent: number;
    text: string;
    data: string | null;
  }

  /** Validates block content and returns the row values. Question text mirrors the prompt. */
  function normalize(content: BlockContent): Content {
    if (!isObject(content)) throw new StoreError("bad_input", "Each block must be an object.");
    const type = content.type;
    if (!BLOCK_TYPES.includes(type)) throw new StoreError("bad_input", `Unknown block type "${String(type)}".`, { options: [...BLOCK_TYPES] });
    let indent = content.indent ?? 0;
    if (!LIST_TYPES.includes(type)) indent = 0;
    else if (!Number.isInteger(indent) || indent < 0 || indent > LIMITS.indentMax)
      throw new StoreError("bad_input", `List indent must be a whole number from 0 to ${LIMITS.indentMax}.`);
    if (typeof content.text !== "string" && content.text !== undefined) throw new StoreError("bad_input", "Block text must be a string.");
    const data = normalizeData(type, content.data);
    let text = type === "divider" ? "" : (content.text ?? "");
    if (type === "question") text = String(data?.prompt ?? "");
    if (SINGLE_LINE_TYPES.has(type)) text = text.replace(/\s*\n\s*/g, " ");
    checkText(text, `The ${type} block's text`);
    return { type, indent, text, data: encodeData(data) };
  }

  /** Text-only edits keep the block's type, indent and data; question prompts stay in sync. */
  function withText(block: Block, text: string): BlockContent {
    if (!TEXT_TYPES.has(block.type) && block.type !== "code" && block.type !== "table")
      throw new StoreError("bad_input", `${block.type} blocks have no text to edit.`);
    const data = block.type === "question" ? { ...block.data, prompt: text } : block.data;
    return { type: block.type, indent: block.indent, text, data };
  }

  // ── Artifacts ─────────────────────────────────────────────────────────────────────────────────

  function artifactRow(id: string, includeDeleted = false): SqlRow {
    const record = row(`SELECT ${ARTIFACT_COLUMNS} FROM artifacts a LEFT JOIN windows w ON w.artifact_id = a.id WHERE a.id = ?`, [id]);
    if (!record) throw new StoreError("unknown_ref", `No doc or quiz with id ${id}.`);
    if (record.deleted_at !== null && !includeDeleted)
      throw new StoreError("unknown_ref", `${record.kind}:${id} is deleted. Restore it first.`, { deleted: true });
    return record;
  }

  function liveArtifactCount() {
    return count("SELECT count(*) FROM artifacts WHERE deleted_at IS NULL");
  }

  function listArtifacts(options: ListOptions = {}): Page<ArtifactSummary> {
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? LIMITS.listDefault), 1), LIMITS.listMax);
    const where = ["1 = 1"];
    const bind: SqlValue[] = [];
    if (options.kind) {
      where.push("a.kind = ?");
      bind.push(options.kind);
    }
    if (options.onlyDeleted) where.push("a.deleted_at IS NOT NULL");
    else if (!options.includeDeleted) where.push("a.deleted_at IS NULL");
    const total = count(`SELECT count(*) FROM artifacts a WHERE ${where.join(" AND ")}`, bind.length ? [...bind] : undefined);
    if (options.cursor) {
      const match = /^([0-9a-z]+)\.([0-9a-z]+)$/.exec(options.cursor);
      if (!match) throw new StoreError("bad_input", "That cursor is not valid. Start again without one.");
      const updated = Number.parseInt(match[1], 36);
      where.push("(a.updated_at < ? OR (a.updated_at = ? AND a.id > ?))");
      bind.push(updated, updated, match[2]);
    }
    bind.push(limit + 1);
    const records = rows(
      `SELECT ${ARTIFACT_COLUMNS} FROM artifacts a LEFT JOIN windows w ON w.artifact_id = a.id
       WHERE ${where.join(" AND ")} ORDER BY a.updated_at DESC, a.id ASC LIMIT ?`,
      bind,
    );
    const items = records.slice(0, limit).map(toSummary);
    const last = items.at(-1);
    return records.length > limit && last ? { items, cursor: `${last.updatedAt.toString(36)}.${last.id}`, total } : { items, total };
  }

  function getArtifact(id: string, options: { includeDeleted?: boolean } = {}): Artifact | null {
    const record = row(`SELECT ${ARTIFACT_COLUMNS} FROM artifacts a LEFT JOIN windows w ON w.artifact_id = a.id WHERE a.id = ?`, [id]);
    if (!record || (record.deleted_at !== null && !options.includeDeleted)) return null;
    const blocks = rows("SELECT * FROM blocks WHERE artifact_id = ? AND deleted_at IS NULL ORDER BY ord", [id]).map(toBlock);
    return { ...toSummary(record), blocks };
  }

  function createArtifact(input: NewArtifact, actor: Actor): Artifact {
    if (!isObject(input) || (input.kind !== "doc" && input.kind !== "quiz")) throw new StoreError("bad_input", 'Artifact kind must be "doc" or "quiz".');
    const title = checkTitle(input.title);
    const blocks = input.blocks ?? [];
    if (!Array.isArray(blocks)) throw new StoreError("bad_input", "Blocks must be a list.");
    if (blocks.length > LIMITS.blocksPerArtifact)
      throw new StoreError("limit", `A ${input.kind} holds at most ${LIMITS.blocksPerArtifact} blocks (got ${blocks.length}).`, {
        max: LIMITS.blocksPerArtifact,
      });
    const id = transaction(db, () => {
      if (liveArtifactCount() >= LIMITS.artifacts)
        throw new StoreError("limit", `There are already ${LIMITS.artifacts} docs and quizzes. Delete one first.`, { max: LIMITS.artifacts });
      const artifactId = newId("artifacts", ARTIFACT_ID_LENGTH);
      const at = now();
      run("INSERT INTO artifacts (id, kind, title, rev, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)", [
        artifactId,
        input.kind,
        title,
        actor,
        at,
        at,
      ]);
      insertBlocks(artifactId, 0, blocks.map(normalize), actor, at);
      checkQuestionCount(artifactId);
      return artifactId;
    });
    return getArtifact(id)!;
  }

  function updateArtifact(id: string, patch: { title?: string; deleted?: boolean }, _actor: Actor): ArtifactSummary {
    transaction(db, () => {
      const record = artifactRow(id, true);
      const deleted = record.deleted_at !== null;
      const at = now();
      if (patch.title !== undefined) {
        if (deleted) throw new StoreError("unknown_ref", `${record.kind}:${id} is deleted. Restore it first.`, { deleted: true });
        run("UPDATE artifacts SET title = ?, rev = rev + 1, updated_at = ? WHERE id = ?", [checkTitle(patch.title), at, id]);
      }
      if (patch.deleted === true && !deleted) run("UPDATE artifacts SET deleted_at = ?, updated_at = ? WHERE id = ?", [at, at, id]);
      if (patch.deleted === false && deleted) {
        if (liveArtifactCount() >= LIMITS.artifacts)
          throw new StoreError("limit", `There are already ${LIMITS.artifacts} docs and quizzes. Delete one before restoring.`, { max: LIMITS.artifacts });
        run("UPDATE artifacts SET deleted_at = NULL, updated_at = ? WHERE id = ?", [at, id]);
      }
    });
    return toSummary(artifactRow(id, true));
  }

  // ── Blocks ────────────────────────────────────────────────────────────────────────────────────

  const liveBlockCount = (artifactId: string) => count("SELECT count(*) FROM blocks WHERE artifact_id = ? AND deleted_at IS NULL", [artifactId]);

  function checkQuestionCount(artifactId: string) {
    const questions = count("SELECT count(*) FROM blocks WHERE artifact_id = ? AND deleted_at IS NULL AND type = 'question'", [artifactId]);
    if (questions > LIMITS.questionsPerQuiz)
      throw new StoreError("limit", `A quiz holds at most ${LIMITS.questionsPerQuiz} questions (this would make ${questions}).`, {
        max: LIMITS.questionsPerQuiz,
      });
  }

  function blockRow(artifactId: string, id: string, deleted = false): SqlRow {
    const record = row("SELECT * FROM blocks WHERE id = ? AND artifact_id = ?", [id, artifactId]);
    if (!record) throw new StoreError("unknown_ref", `No block ${id} in ${artifactId}.`);
    if ((record.deleted_at !== null) !== deleted)
      throw new StoreError(deleted ? "bad_input" : "unknown_ref", deleted ? `Block ${id} is not deleted.` : `Block ${id} is deleted.`, { deleted: !deleted });
    return record;
  }

  function checkRev(record: SqlRow, rev: number | undefined) {
    if (rev === undefined || rev === Number(record.rev)) return;
    const block = toBlock(record);
    throw new StoreError("stale_rev", `Block ${block.id} is at rev ${block.rev}, not ${rev}. Read it again and retry.`, {
      id: block.id,
      current: { rev: block.rev, block },
    });
  }

  function anchorPosition(artifactId: string, after: Anchor | undefined): number {
    if (after === undefined || after === "end") return liveBlockCount(artifactId);
    if (after === "start") return 0;
    return Number(blockRow(artifactId, after).ord) + 1;
  }

  /** Dense ordering: live blocks hold ord 0…n-1. Opening or closing a gap renumbers the blocks after it. */
  function openGap(artifactId: string, at: number, size: number) {
    run("UPDATE blocks SET ord = ord + ? WHERE artifact_id = ? AND deleted_at IS NULL AND ord >= ?", [size, artifactId, at]);
  }
  function closeGap(artifactId: string, at: number) {
    run("UPDATE blocks SET ord = ord - 1 WHERE artifact_id = ? AND deleted_at IS NULL AND ord > ?", [artifactId, at]);
  }

  function recordHistory(id: string, rev: number, content: Content, actor: Actor, at: number) {
    run("INSERT INTO block_history (block_id, rev, text, data, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [
      id,
      rev,
      content.text,
      content.data,
      actor,
      at,
    ]);
    run("DELETE FROM block_history WHERE block_id = ? AND rev <= ?", [id, rev - LIMITS.historyPerBlock]);
  }

  function insertBlocks(artifactId: string, at: number, contents: Content[], actor: Actor, time: number, wanted: unknown[] = []): InsertedBlock[] {
    openGap(artifactId, at, contents.length);
    return contents.map((content, index) => {
      const id = newId("blocks", BLOCK_ID_LENGTH, wanted[index]);
      run(
        `INSERT INTO blocks (id, artifact_id, ord, type, indent, text, data, rev, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, artifactId, at + index, content.type, content.indent, content.text, content.data, actor, time],
      );
      recordHistory(id, 1, content, actor, time);
      return { id, type: content.type, text: content.text, rev: 1 };
    });
  }

  function writeContent(record: SqlRow, content: Content, actor: Actor, at: number): number {
    const rev = Number(record.rev) + 1;
    run("UPDATE blocks SET type = ?, indent = ?, text = ?, data = ?, rev = ?, updated_by = ?, updated_at = ? WHERE id = ?", [
      content.type,
      content.indent,
      content.text,
      content.data,
      rev,
      actor,
      at,
      String(record.id),
    ]);
    recordHistory(String(record.id), rev, content, actor, at);
    return rev;
  }

  function applyBlockOps(artifactId: string, ops: BlockOp[], actor: Actor): BlockOpsResult {
    if (!Array.isArray(ops) || ops.length === 0) throw new StoreError("bad_input", "Send at least one op.");
    if (ops.length > LIMITS.opsPerCall)
      throw new StoreError("limit", `At most ${LIMITS.opsPerCall} ops per call (got ${ops.length}). Split the batch.`, { max: LIMITS.opsPerCall });
    return transaction(db, () => {
      const artifact = artifactRow(artifactId);
      const at = now();
      const changed = new Map<string, number>();
      const inserted = new Map<string, InsertedBlock>();
      const deleted: string[] = [];
      const noteWrite = (id: string, rev: number, content?: Content) => {
        const fresh = inserted.get(id);
        if (fresh) inserted.set(id, content ? { id, type: content.type, text: content.text, rev } : fresh);
        else changed.set(id, rev);
      };

      ops.forEach((op, index) => {
        try {
          if (!isObject(op)) throw new StoreError("bad_input", "Each op must be an object.");
          switch (op.op) {
            case "insert": {
              if (!Array.isArray(op.blocks) || op.blocks.length === 0) throw new StoreError("bad_input", "An insert needs at least one block.");
              const contents = op.blocks.map(normalize);
              const wanted = op.blocks.map((block) => (block as { id?: unknown }).id);
              for (const block of insertBlocks(artifactId, anchorPosition(artifactId, op.after), contents, actor, at, wanted)) inserted.set(block.id, block);
              break;
            }
            case "update": {
              const record = blockRow(artifactId, op.id);
              checkRev(record, op.rev);
              const hasText = typeof op.text === "string";
              if (hasText === (op.block !== undefined)) throw new StoreError("bad_input", "An update takes either text or a block, not both.");
              const content = normalize(hasText ? withText(toBlock(record), op.text as string) : (op.block as BlockContent));
              noteWrite(op.id, writeContent(record, content, actor, at), content);
              break;
            }
            case "replace": {
              const record = blockRow(artifactId, op.id);
              checkRev(record, op.rev);
              if (typeof op.find !== "string" || !op.find || typeof op.with !== "string")
                throw new StoreError("bad_input", "replace needs non-empty find text and a with string.");
              const block = toBlock(record);
              const found = block.text.indexOf(op.find);
              if (found < 0)
                throw new StoreError("bad_input", `Block ${op.id} does not contain "${op.find.slice(0, 60)}".`, { text: block.text.slice(0, 200) });
              const content = normalize(withText(block, block.text.slice(0, found) + op.with + block.text.slice(found + op.find.length)));
              noteWrite(op.id, writeContent(record, content, actor, at), content);
              break;
            }
            case "set": {
              const record = blockRow(artifactId, op.id);
              checkRev(record, op.rev);
              const block = toBlock(record);
              const content = normalize({ type: block.type, indent: block.indent, text: block.text, data: op.data });
              noteWrite(op.id, writeContent(record, content, actor, at), content);
              break;
            }
            case "revert": {
              const record = blockRow(artifactId, op.id);
              checkRev(record, op.rev);
              const past = row("SELECT text, data FROM block_history WHERE block_id = ? AND rev = ?", [op.id, op.to]);
              if (!past) throw new StoreError("bad_input", `Block ${op.id} has no saved rev ${op.to}.`, { kept: historyRevs(op.id) });
              const block = toBlock(record);
              const data = typeof past.data === "string" ? (JSON.parse(past.data) as BlockData) : undefined;
              const content = normalize({ type: block.type, indent: block.indent, text: String(past.text), data });
              noteWrite(op.id, writeContent(record, content, actor, at), content);
              break;
            }
            case "delete": {
              const record = blockRow(artifactId, op.id);
              checkRev(record, op.rev);
              run("UPDATE blocks SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?", [at, actor, at, op.id]);
              closeGap(artifactId, Number(record.ord));
              changed.delete(op.id);
              if (!inserted.delete(op.id)) deleted.push(op.id);
              break;
            }
            case "restore": {
              const record = blockRow(artifactId, op.id, true);
              const position = op.after === undefined ? Math.min(Number(record.ord), liveBlockCount(artifactId)) : anchorPosition(artifactId, op.after);
              openGap(artifactId, position, 1);
              run("UPDATE blocks SET deleted_at = NULL, ord = ?, updated_by = ?, updated_at = ? WHERE id = ?", [position, actor, at, op.id]);
              const deletedHere = deleted.indexOf(op.id);
              if (deletedHere >= 0) deleted.splice(deletedHere, 1);
              else inserted.set(op.id, { id: op.id, type: record.type as BlockType, text: String(record.text), rev: Number(record.rev) });
              break;
            }
            case "move": {
              const record = blockRow(artifactId, op.id);
              if (op.after === op.id) throw new StoreError("bad_input", "A block cannot move after itself.");
              closeGap(artifactId, Number(record.ord));
              run("UPDATE blocks SET ord = -1 WHERE id = ?", [op.id]);
              // The moving block is still live, so "end" is one less than the live count.
              const position = op.after === "end" ? liveBlockCount(artifactId) - 1 : anchorPosition(artifactId, op.after);
              openGap(artifactId, position, 1);
              run("UPDATE blocks SET ord = ? WHERE id = ?", [position, op.id]);
              if (!inserted.has(op.id)) changed.set(op.id, Number(record.rev));
              break;
            }
            default:
              throw new StoreError("bad_input", `Unknown op "${String((op as { op?: unknown }).op)}".`, {
                options: ["insert", "update", "replace", "delete", "move", "set", "restore", "revert"],
              });
          }
        } catch (error) {
          if (error instanceof StoreError) throw new StoreError(error.code, `Op ${index + 1}: ${error.message}`, { ...error.details, op: index + 1 });
          throw error;
        }
      });

      const blocks = liveBlockCount(artifactId);
      if (blocks > LIMITS.blocksPerArtifact)
        throw new StoreError("limit", `A ${artifact.kind} holds at most ${LIMITS.blocksPerArtifact} blocks; this batch would make ${blocks}.`, {
          max: LIMITS.blocksPerArtifact,
        });
      checkQuestionCount(artifactId);
      const rev = Number(artifact.rev) + 1;
      run("UPDATE artifacts SET rev = ?, updated_at = ? WHERE id = ?", [rev, at, artifactId]);
      return { rev, changed: [...changed].map(([id, blockRev]) => ({ id, rev: blockRev })), inserted: [...inserted.values()], deleted };
    });
  }

  function historyRevs(blockId: string): number[] {
    return rows("SELECT rev FROM block_history WHERE block_id = ? ORDER BY rev", [blockId]).map((record) => Number(record.rev));
  }

  function blockHistory(blockId: string): HistoryEntry[] {
    return rows("SELECT * FROM block_history WHERE block_id = ? ORDER BY rev DESC", [blockId]).map((record) => {
      const entry: HistoryEntry = {
        rev: Number(record.rev),
        text: String(record.text),
        updatedBy: record.updated_by as Actor,
        updatedAt: Number(record.updated_at),
      };
      if (typeof record.data === "string") entry.data = JSON.parse(record.data) as BlockData;
      return entry;
    });
  }

  function locateBlock(blockId: string): { artifactId: string; kind: ArtifactKind } | null {
    const record = row(
      `SELECT b.artifact_id, a.kind FROM blocks b JOIN artifacts a ON a.id = b.artifact_id
       WHERE b.id = ? AND b.deleted_at IS NULL AND a.deleted_at IS NULL`,
      [blockId],
    );
    return record ? { artifactId: String(record.artifact_id), kind: record.kind as ArtifactKind } : null;
  }

  function searchRows(): SearchRow[] {
    return rows(
      `SELECT b.id, b.artifact_id, a.kind, a.title, b.type, b.text FROM blocks b JOIN artifacts a ON a.id = b.artifact_id
       WHERE b.deleted_at IS NULL AND a.deleted_at IS NULL ORDER BY a.updated_at DESC, a.id, b.ord`,
    ).map((record) => ({
      id: String(record.id),
      artifactId: String(record.artifact_id),
      kind: record.kind as ArtifactKind,
      title: String(record.title),
      type: record.type as BlockType,
      text: String(record.text),
    }));
  }

  // ── Attempts, windows, activity, settings ─────────────────────────────────────────────────────

  function recordAttempt(attempt: NewAttempt): number {
    const block = row("SELECT type FROM blocks WHERE id = ? AND artifact_id = ? AND deleted_at IS NULL", [attempt.blockId, attempt.artifactId]);
    if (!block) throw new StoreError("unknown_ref", `No question ${attempt.blockId} in ${attempt.artifactId}.`);
    if (block.type !== "question") throw new StoreError("bad_input", `Block ${attempt.blockId} is not a question.`);
    const answer = JSON.stringify(attempt.answer ?? null);
    checkText(answer, "The answer");
    const correct = attempt.correct === undefined || attempt.correct === null ? null : attempt.correct ? 1 : 0;
    run("INSERT INTO attempts (artifact_id, block_id, answer, correct, answered_at) VALUES (?, ?, ?, ?, ?)", [
      attempt.artifactId,
      attempt.blockId,
      answer,
      correct,
      now(),
    ]);
    return Number(value("SELECT last_insert_rowid()"));
  }

  function listAttempts(artifactId: string): Attempt[] {
    return rows("SELECT * FROM attempts WHERE artifact_id = ? ORDER BY id", [artifactId]).map((record) => ({
      id: Number(record.id),
      artifactId: String(record.artifact_id),
      blockId: String(record.block_id),
      answer: JSON.parse(String(record.answer)),
      correct: record.correct === null ? null : Number(record.correct) === 1,
      answeredAt: Number(record.answered_at),
    }));
  }

  const finiteOrNull = (input: unknown) => (typeof input === "number" && Number.isFinite(input) ? input : null);

  /** Replaces the saved window layout with `windows` (spec §8 persistence). */
  function saveWindows(windows: WindowRow[]) {
    if (!Array.isArray(windows)) throw new StoreError("bad_input", "Windows must be a list.");
    if (windows.length > LIMITS.artifacts) throw new StoreError("limit", `At most ${LIMITS.artifacts} windows.`);
    transaction(db, () => {
      run("DELETE FROM windows");
      for (const window of windows) {
        if (window.state !== "open" && window.state !== "minimized") throw new StoreError("bad_input", 'Window state must be "open" or "minimized".');
        if (value("SELECT 1 FROM artifacts WHERE id = ? AND deleted_at IS NULL", [window.artifactId]) === undefined)
          throw new StoreError("unknown_ref", `No doc or quiz with id ${window.artifactId}.`);
        run("INSERT INTO windows (artifact_id, state, x, y, w, h, z) VALUES (?, ?, ?, ?, ?, ?, ?)", [
          window.artifactId,
          window.state,
          finiteOrNull(window.x),
          finiteOrNull(window.y),
          finiteOrNull(window.w),
          finiteOrNull(window.h),
          Number.isInteger(window.z) ? (window.z as number) : null,
        ]);
      }
    });
  }

  function listWindows(): WindowRow[] {
    return rows("SELECT w.*, a.kind FROM windows w JOIN artifacts a ON a.id = w.artifact_id WHERE a.deleted_at IS NULL ORDER BY w.z").map((record) => {
      const window: WindowRow = { artifactId: String(record.artifact_id), kind: record.kind as ArtifactKind, state: record.state as WindowRow["state"] };
      for (const key of ["x", "y", "w", "h", "z"] as const) if (record[key] !== null) window[key] = Number(record[key]);
      return window;
    });
  }

  function appendActivity(entry: ActivityEntry): number {
    if (!isObject(entry) || (entry.actor !== "user" && entry.actor !== "agent") || typeof entry.kind !== "string" || !entry.kind)
      throw new StoreError("bad_input", "Activity needs an actor and a kind.");
    run("INSERT INTO activity (at, actor, kind, ref, summary) VALUES (?, ?, ?, ?, ?)", [
      entry.at ?? now(),
      entry.actor,
      entry.kind.slice(0, 40),
      entry.ref?.slice(0, 200) ?? null,
      entry.summary?.slice(0, LIMITS.captionChars) ?? null,
    ]);
    const seq = Number(value("SELECT last_insert_rowid()"));
    run("DELETE FROM activity WHERE seq <= ?", [seq - LIMITS.activityRows]);
    return seq;
  }

  /** The most recent entries after `since`, oldest first, at most 30 (spec §6.1). */
  function listActivity(since = 0, limit: number = LIMITS.activityPerRead): ActivityRow[] {
    const take = Math.min(Math.max(Math.trunc(limit), 1), LIMITS.activityPerRead);
    return rows("SELECT * FROM (SELECT * FROM activity WHERE seq > ? ORDER BY seq DESC LIMIT ?) ORDER BY seq", [since, take]).map((record) => {
      const entry: ActivityRow = { seq: Number(record.seq), at: Number(record.at), actor: record.actor as Actor, kind: String(record.kind) };
      if (record.ref !== null) entry.ref = String(record.ref);
      if (record.summary !== null) entry.summary = String(record.summary);
      return entry;
    });
  }

  function getSetting(key: string): string | null {
    const stored = value("SELECT value FROM settings WHERE key = ?", [key]);
    return stored === undefined || stored === null ? null : String(stored);
  }

  function setSetting(key: string, stored: string) {
    if (typeof key !== "string" || !key || key.length > 64) throw new StoreError("bad_input", "Setting keys are 1–64 characters.");
    if (typeof stored !== "string") throw new StoreError("bad_input", "Setting values are strings.");
    checkText(stored, "The setting");
    run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [key, stored]);
  }

  /** Startup housekeeping (spec §11.2): purge artifacts deleted over 30 days ago and trim the activity log. */
  function maintain(): { purged: string[] } {
    const cutoff = now() - LIMITS.purgeAfterDays * DAY_MS;
    return transaction(db, () => {
      const purged = rows("SELECT id FROM artifacts WHERE deleted_at IS NOT NULL AND deleted_at <= ?", [cutoff]).map((record) => String(record.id));
      for (const id of purged) {
        run("DELETE FROM block_history WHERE block_id IN (SELECT id FROM blocks WHERE artifact_id = ?)", [id]);
        run("DELETE FROM blocks WHERE artifact_id = ?", [id]);
        run("DELETE FROM attempts WHERE artifact_id = ?", [id]);
        run("DELETE FROM windows WHERE artifact_id = ?", [id]);
        run("DELETE FROM artifacts WHERE id = ?", [id]);
      }
      const last = Number(value("SELECT max(seq) FROM activity") ?? 0);
      run("DELETE FROM activity WHERE seq <= ?", [last - LIMITS.activityRows]);
      return { purged };
    });
  }

  return {
    listArtifacts,
    getArtifact,
    createArtifact,
    updateArtifact,
    applyBlockOps,
    blockHistory,
    locateBlock,
    searchRows,
    recordAttempt,
    listAttempts,
    saveWindows,
    listWindows,
    appendActivity,
    listActivity,
    getSetting,
    setSetting,
    maintain,
  };
}
