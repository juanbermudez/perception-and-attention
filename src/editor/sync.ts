// Editor ↔ store sync for docs (spec §9.3). Pure: tested in Node with ProseMirror docs.
//
// Editor → store: ids whose nodes changed are collected per transaction; a debounced save diffs the
// doc against `base` (what the store last had) and writes deletes, inserts (with editor-chosen ids),
// moves and updates without revs, because the user is the local authority.
// Store → editor: after the user's pending changes are saved, the store's blocks replace the nodes
// that someone else changed. Nodes the user is still editing, or has not saved yet, are kept.

import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import type { Transform } from "@tiptap/pm/transform";
import { stayingIds } from "../model/sequence";
import type { BlockContent, BlockOp } from "../store/types";
import { blockToNode, contentKey, type EditorBlock } from "./convert";

export { stayingIds };

/** What the store holds, as far as the editor knows: block order and each block's content key. */
export interface SyncBase {
  order: string[];
  keys: Map<string, string>;
}

export function baseFrom(blocks: readonly (BlockContent & { id: string })[]): SyncBase {
  return { order: blocks.map((block) => block.id), keys: new Map(blocks.map((block) => [block.id, contentKey(block)])) };
}

/** Ids of top-level nodes that are new or differ between two docs. */
export function changedIds(before: PMNode, after: PMNode): Set<string> {
  const previous = new Map<string, PMNode>();
  before.forEach((node) => {
    if (node.attrs.id) previous.set(String(node.attrs.id), node);
  });
  const changed = new Set<string>();
  after.forEach((node) => {
    const id = node.attrs.id ? String(node.attrs.id) : "";
    if (!id) return;
    const old = previous.get(id);
    if (!old || !old.eq(node)) changed.add(id);
  });
  return changed;
}

const content = ({ id: _id, ...rest }: EditorBlock): BlockContent => rest;

/**
 * Store ops that turn `base` into the editor's blocks: deletes first, then inserts and moves in
 * document order (each lands after the block before it), then updates of changed blocks.
 * Only `dirty` blocks are compared, so text the editor would write differently is left alone.
 */
export function planSave(base: SyncBase, blocks: readonly EditorBlock[], dirty: ReadonlySet<string>): BlockOp[] {
  const present = new Set(blocks.map((block) => block.id));
  const known = new Set(base.order);
  const ops: BlockOp[] = [];
  for (const id of base.order) if (!present.has(id)) ops.push({ op: "delete", id });
  const stay = stayingIds(
    base.order.filter((id) => present.has(id)),
    blocks.filter((block) => known.has(block.id)).map((block) => block.id),
  );
  let after = "start";
  let insert: Extract<BlockOp, { op: "insert" }> | null = null;
  for (const block of blocks) {
    if (!known.has(block.id)) {
      if (insert) insert.blocks.push({ id: block.id, ...content(block) });
      else {
        insert = { op: "insert", after, blocks: [{ id: block.id, ...content(block) }] };
        ops.push(insert);
      }
    } else {
      insert = null;
      if (!stay.has(block.id)) ops.push({ op: "move", id: block.id, after });
    }
    after = block.id;
  }
  for (const block of blocks)
    if (known.has(block.id) && dirty.has(block.id) && contentKey(block) !== base.keys.get(block.id))
      ops.push({ op: "update", id: block.id, block: content(block) });
  return ops;
}

/** The base after a save of `blocks` succeeded: the store now holds them, in this order. */
export function savedBase(base: SyncBase, blocks: readonly EditorBlock[], saved: ReadonlySet<string>): SyncBase {
  const keys = new Map<string, string>();
  for (const block of blocks) {
    const known = base.keys.get(block.id);
    keys.set(block.id, saved.has(block.id) || known === undefined ? contentKey(block) : known);
  }
  return { order: blocks.map((block) => block.id), keys };
}

/** One entry of the doc the editor should show: keep its node, or replace it with a stored block. */
export type TargetEntry = { id: string; keep: true } | { id: string; block: EditorBlock };

export interface ReconcilePlan {
  target: TargetEntry[];
  /** Blocks someone else inserted or changed, for the agent-edit highlight. */
  foreign: string[];
  /** The new base: exactly what the store holds. */
  base: SyncBase;
}

/**
 * The doc to show after the store changed. Stored order wins; blocks the user changed and has not
 * saved (`dirty`) keep their node, and blocks only the editor has (not saved yet) stay after the
 * block they follow in the editor. Blocks the store deleted go, unless the user is editing them.
 */
export function planReconcile(base: SyncBase, editor: readonly EditorBlock[], stored: readonly EditorBlock[], dirty: ReadonlySet<string>): ReconcilePlan {
  const inEditor = new Set(editor.map((block) => block.id));
  const inStore = new Set(stored.map((block) => block.id));
  const known = new Set(base.order);
  const target: TargetEntry[] = [];
  const foreign: string[] = [];
  for (const block of stored) {
    if (inEditor.has(block.id)) {
      if (dirty.has(block.id) || base.keys.get(block.id) === contentKey(block)) target.push({ id: block.id, keep: true });
      else {
        target.push({ id: block.id, block });
        foreign.push(block.id);
      }
    } else if (!known.has(block.id)) {
      // Someone else added it.
      target.push({ id: block.id, block });
      foreign.push(block.id);
    }
    // Known but gone from the editor: the user deleted it and the save is pending.
  }
  // Editor-only blocks: new ones not saved yet, or ones the store deleted while the user edited them.
  let at = 0;
  for (const block of editor) {
    const index = target.findIndex((entry) => entry.id === block.id);
    if (index >= 0) {
      at = index + 1;
      continue;
    }
    if (inStore.has(block.id)) continue;
    if (known.has(block.id) && !dirty.has(block.id)) continue;
    target.splice(at, 0, { id: block.id, keep: true });
    at++;
  }
  return { target, foreign, base: baseFrom(stored) };
}

function indexOfId(doc: PMNode, id: string, from: number): number {
  for (let index = from; index < doc.childCount; index++) if (doc.child(index).attrs.id === id) return index;
  return -1;
}

function positionOf(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

/**
 * Changes one top-level node into `fresh` with the smallest steps: attributes in place, and only
 * the changed stretch of its content, so a cursor elsewhere in the block keeps its place.
 */
function updateNode(tr: Transform, from: number, node: PMNode, fresh: PMNode) {
  if (fresh.type !== node.type) {
    tr.replaceWith(from, from + node.nodeSize, fresh);
    return;
  }
  if (!fresh.sameMarkup(node)) tr.setNodeMarkup(from, undefined, fresh.attrs, fresh.marks);
  const start = node.content.findDiffStart(fresh.content);
  if (start === null) return;
  const end = node.content.findDiffEnd(fresh.content);
  if (!end) return;
  let { a, b } = end;
  const overlap = start - Math.min(a, b);
  if (overlap > 0) {
    a += overlap;
    b += overlap;
  }
  tr.replace(from + 1 + start, from + 1 + a, fresh.slice(start, b));
}

/**
 * Makes the doc's top-level nodes match `target`, touching only nodes that change: kept nodes stay
 * the same objects, so a cursor inside them maps through unchanged.
 */
export function applyTarget(tr: Transform, schema: Schema, target: readonly TargetEntry[], freshId: () => string): void {
  target.forEach((entry, index) => {
    const doc = tr.doc;
    const found = indexOfId(doc, entry.id, index);
    const fresh = "block" in entry ? blockToNode(schema, entry.block) : null;
    if (found < 0) {
      if (fresh) tr.insert(positionOf(doc, index), fresh);
      return;
    }
    const node = doc.child(found);
    if (found !== index) {
      const from = positionOf(doc, found);
      tr.delete(from, from + node.nodeSize);
      tr.insert(positionOf(tr.doc, index), fresh ?? node);
      return;
    }
    if (fresh && !fresh.eq(node)) updateNode(tr, positionOf(doc, index), node, fresh);
  });
  const kept = Math.min(target.length, tr.doc.childCount);
  if (tr.doc.childCount > kept) {
    if (kept === 0) tr.replaceWith(0, tr.doc.content.size, schema.nodes.paragraph.create({ id: freshId() }));
    else tr.delete(positionOf(tr.doc, kept), tr.doc.content.size);
  }
}
