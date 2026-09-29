// The docs half of GuideApi (spec §6.1–§6.5, §6.8, §6.9, §6.11): doc refs in outline, read, search
// and go, and the `doc`, `edit_blocks` and `window` commands. It adapts the docs API (store) and the
// window port (UI) to the tool results: compact data, a `said` line, and an Undo for the toast.
// No DOM, so it runs against the real store engine in Node tests.

import { inlinePlainText } from "../model/inline";
import { formatRef, type Ref, resolveRef } from "../model/refs";
import { createSearchIndex, type SearchDoc } from "../model/search";
import type { Layout, SizeName, Slot } from "../ui/window-geometry";
import { type ApiError, type DocInput, type DocsApi, type EditBlocksInput, isApiError, undoOps } from "./docs-api";
import type { WindowCommand, WindowInput, WindowsPort } from "./guide-api";
import { guideHits, outline as guideOutline, type Page } from "./guide-content";
import { fail, type Result, type Undo, type WriteResult } from "./result";

export type { DocInput, DocsApi, EditBlocksInput };

export interface DocsToolsDeps {
  docs: DocsApi;
  windows?: WindowsPort;
  /** Whether docs may exist; when false, `search(all)` and `outline(guide)` do not open the store. */
  present: () => boolean;
}

type Maybe<T> = T | Promise<T>;
const quoted = (title: string) => `“${title}”`;
const NO_WINDOWS = "Doc windows are not available on this page.";
const WINDOW_REFS = "Windows hold docs and quizzes: pass doc:<id>, quiz:<id> or block:<id>.";
const ARTIFACT_KINDS = new Set(["docs", "doc", "quiz", "block"]);

function resolved(refText: string | undefined): Ref | null {
  const result = resolveRef(refText ?? "guide");
  return "ref" in result ? result.ref : null;
}

/** Why an Undo could not run, in the user's words. Block errors from the store name the block (`id`, `op`). */
function undoFailed(error: ApiError["error"]): string {
  if (error.code === "stale_rev" && error.id) return "Could not undo: you changed that text after the assistant did.";
  if (error.code === "unknown_ref" && error.op) return "Could not undo: a block the assistant changed has been deleted since.";
  return `Could not undo: ${error.message}`;
}

export function createDocsTools({ docs, windows, present }: DocsToolsDeps) {
  /**
   * The Undo on an agent's toast. It runs as the user through the docs API, whose ops carry revs, so
   * it never overwrites what the user changed since; when it cannot run, the user is told why.
   */
  function undoable(run: () => Promise<unknown>): Undo {
    return {
      label: "Undo",
      run: () =>
        void run().then(
          (result) => {
            if (isApiError(result)) docs.notify(undoFailed(result.error));
          },
          (error: unknown) => docs.notify(`Could not undo: ${error instanceof Error ? error.message : String(error)}`),
        ),
    };
  }

  /* ---------- Queries ---------- */

  function context() {
    const status = docs.status();
    const list = windows?.list() ?? [];
    const editing = windows?.editing();
    return {
      windows: list.length ? list : undefined,
      editing: editing ? `block:${editing}` : undefined,
      store: status.store === "unopened" ? undefined : status.store,
    };
  }

  /** `outline(guide)` gains the docs count; `docs`, `doc:*`, `quiz:*` and `block:*` come from the store. */
  function outline(refText: string | undefined, page: Page = {}): Maybe<Result<object>> | undefined {
    const ref = resolved(refText);
    if (!ref) return undefined;
    if (ref.kind === "guide" || ref.kind === "overview") {
      const base = guideOutline(refText, page);
      if ("error" in base) return base;
      if (!present()) return { ...base, docs: { ref: "docs", count: 0 } };
      return docs
        .outlineDocs({ limit: 100 })
        .then((listed) => (isApiError(listed) ? base : { ...base, docs: { ref: "docs", count: listed.docs.length, more: listed.cursor ? true : undefined } }));
    }
    if (ref.kind === "docs") return docs.outlineDocs({ limit: page.limit, cursor: page.cursor });
    if (ref.kind === "doc" || ref.kind === "quiz") return docs.outlineArtifact(`${ref.kind}:${ref.id}`, page);
    if (ref.kind === "block") return readBlock(ref.id, false);
    return undefined;
  }

  function read(refText: string, detail?: string): Maybe<Result<object>> | undefined {
    const ref = resolved(refText);
    if (!ref || !ARTIFACT_KINDS.has(ref.kind)) return undefined;
    if (ref.kind === "docs") return docs.outlineDocs();
    if (ref.kind !== "doc" && ref.kind !== "quiz" && ref.kind !== "block") return undefined;
    if (ref.kind === "block") return readBlock(ref.id, detail === "full");
    if (detail === "sources") return fail("bad_input", 'Docs and quizzes have no sources. Use detail "brief", "full", "markdown" or "results".');
    return docs.read(`${ref.kind}:${ref.id}`, (detail ?? "brief") as "brief");
  }

  /** One block with its doc: where it is and its markdown. */
  async function readBlock(id: string, full: boolean): Promise<Result<object>> {
    const found = await docs.locate(`block:${id}`);
    if (isApiError(found)) return found;
    const artifact = await docs.read(found.ref, "full");
    if (isApiError(artifact)) return artifact;
    const blocks = (artifact as { blocks: { id: string; type: string; md: string; rev: number; indent?: number; data?: object }[] }).blocks;
    const index = blocks.findIndex((block) => block.id === id);
    const block = blocks[index];
    if (!block) return fail("unknown_ref", `No block ${id}.`);
    return {
      ref: `block:${id}`,
      in: found.ref,
      title: (artifact as { title: string }).title,
      n: index + 1,
      of: blocks.length,
      type: block.type,
      md: block.md,
      rev: block.rev,
      indent: block.indent,
      data: full ? block.data : undefined,
    };
  }

  /** Guide and doc hits ranked by one scorer (spec §6.4); docs are searched only when they may exist. */
  async function search(query: string, scope: "docs" | "all", limit: number): Promise<Result<object>> {
    const guide = scope === "all" ? guideHits(query, limit) : [];
    if (scope === "all" && !present()) return { scope: "guide", hits: guide.map(({ ref, title, snip }) => ({ ref, title, snip })) };
    const rows = await docs.searchRows();
    if (isApiError(rows)) {
      if (scope === "docs") return rows;
      return { scope: "guide", hits: guide.map(({ ref, title, snip }) => ({ ref, title, snip })) };
    }
    const entries: SearchDoc[] = [];
    const artifacts = new Map<string, string>();
    for (const row of rows) {
      artifacts.set(row.in, row.title);
      const plain = row.type === "code" || row.type === "table" ? row.text : inlinePlainText(row.text);
      entries.push({ ref: row.ref, kind: "block", title: row.title, fields: /^h[1-3]$/.test(row.type) ? { title: plain, body: plain } : { body: plain } });
    }
    for (const [ref, title] of artifacts) entries.push({ ref, kind: ref.split(":")[0], title, fields: { title } });
    const within = new Map(rows.map((row) => [row.ref, row.in]));
    const docHits = createSearchIndex(entries)
      .search(query, { limit })
      .map((hit) => ({ ...hit, in: within.get(hit.ref) }));
    const hits = [...guide, ...docHits]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((hit) => ({ ref: hit.ref, in: "in" in hit ? hit.in : undefined, title: hit.title, snip: hit.snip || undefined }));
    return { scope, hits };
  }

  /* ---------- Commands ---------- */

  async function go(ref: Ref): Promise<Result<WriteResult>> {
    if (ref.kind === "docs") {
      const listed = await docs.outlineDocs({ limit: 5 });
      return fail("not_available", "Docs open in their own windows. Go to one of them.", isApiError(listed) ? [] : listed.docs.map((doc) => doc.ref));
    }
    if (!windows) return fail("not_available", NO_WINDOWS);
    const target = await windowTarget(formatRef(ref));
    if ("error" in target) return target;
    const opened = await windows.open(target.ref, { block: target.block });
    if ("error" in opened) return opened;
    return {
      at: target.block ? `block:${target.block}` : opened.ref,
      in: target.block ? opened.ref : undefined,
      title: opened.title,
      said: target.block ? `Showed the block in ${quoted(opened.title)}.` : `Opened ${quoted(opened.title)}.`,
      windows: windows.list(),
    };
  }

  /** A doc, quiz or block ref as the window it lives in. */
  async function windowTarget(refText: string): Promise<Result<{ ref: string; block?: string }>> {
    const ref = resolved(refText);
    if (!ref || (ref.kind !== "doc" && ref.kind !== "quiz" && ref.kind !== "block")) return fail("bad_input", WINDOW_REFS);
    if (ref.kind !== "block") return { ref: `${ref.kind}:${ref.id}` };
    const found = await docs.locate(`block:${ref.id}`);
    return isApiError(found) ? found : { ref: found.ref, block: found.block };
  }

  async function doc(input: DocInput): Promise<Result<WriteResult>> {
    const before = input.action === "rename" ? await docs.load(input.ref) : null;
    const result = await docs.doc(input, "agent");
    if (isApiError(result)) return result;
    const ref = result.ref;
    const out: WriteResult = { ...result };
    switch (input.action) {
      case "create":
        out.undo = undoable(() => docs.doc({ action: "delete", ref }, "user"));
        // The docs API asked the page to open it; wait for the window so the list includes it.
        if (windows && input.open !== false) {
          await windows.open(ref);
          out.windows = windows.list();
        }
        break;
      case "delete":
        out.undo = undoable(() => docs.doc({ action: "restore", ref }, "user"));
        break;
      case "restore":
        out.undo = undoable(() => docs.doc({ action: "delete", ref }, "user"));
        break;
      case "rename":
        if (before && !isApiError(before)) {
          const [title, given] = [before.title, result.title];
          out.undo = undoable(async () => {
            const now = await docs.load(ref);
            if (isApiError(now)) return now;
            if (now.title !== given) return fail("stale_rev", `the title changed to “${now.title}” after the assistant renamed it.`);
            return docs.doc({ action: "rename", ref, title }, "user");
          });
        }
        break;
    }
    return out;
  }

  async function editBlocks(input: EditBlocksInput): Promise<Result<WriteResult>> {
    const before = await docs.load(input.ref);
    const result = await docs.editBlocks(input, "agent");
    if (isApiError(result)) return result;
    const out: WriteResult = { ...result };
    if (!isApiError(before)) {
      const after = await docs.load(before.ref);
      if (!isApiError(after)) {
        const ops = undoOps(
          before.blocks,
          after.blocks.map((block) => block.id),
          result,
        );
        if (ops.length) out.undo = undoable(() => docs.saveBlocks(before.ref, ops));
      }
    }
    return out;
  }

  async function window(input: WindowInput): Promise<Result<WriteResult>> {
    if (!windows) return fail("not_available", NO_WINDOWS);
    const list = () => windows.list();
    if (input.action === "arrange") {
      const count = windows.arrange(input.layout ?? "tile");
      if (!count) return fail("not_available", "No windows are open to arrange.");
      return { windows: list(), said: `${input.layout === "stack" ? "Stacked" : "Tiled"} ${count} window${count === 1 ? "" : "s"}.` };
    }
    let refText = input.ref;
    if (!refText) {
      if (input.action === "open") return fail("bad_input", `open needs a ref. ${WINDOW_REFS}`);
      const focused = list().find((entry) => entry.focused) ?? list().find((entry) => entry.state === "open");
      if (!focused) return fail("not_available", "No window is open.");
      refText = focused.ref;
    }
    const target = await windowTarget(refText);
    if ("error" in target) return target;
    if (input.action === "open") {
      const opened = await windows.open(target.ref, { at: input.at, size: input.size, block: target.block });
      if ("error" in opened) return opened;
      return { windows: list(), said: `Opened ${quoted(opened.title)}${input.at ? ` at the ${input.at.replace("-", " ")}` : ""}.` };
    }
    if (input.action === "place") {
      const placed = windows.place(target.ref, input.at as Slot | undefined, input.size as SizeName | undefined);
      if ("error" in placed) return placed;
      const where = [input.at && `to the ${input.at.replace("-", " ")}`, input.size && `size ${input.size}`].filter(Boolean).join(", ");
      return { windows: list(), said: `Moved ${quoted(placed.title)} ${where}.` };
    }
    const done = windows.command(input.action as WindowCommand, target.ref);
    if ("error" in done) return done;
    const verbs: Record<WindowCommand, string> = { close: "Closed", minimize: "Minimized", restore: "Restored", focus: "Focused" };
    return { windows: list(), said: `${verbs[input.action as WindowCommand]} ${quoted(done.title)}.` };
  }

  return { context, outline, read, search, go, doc, editBlocks, window };
}

export type { Layout };
