// Docs on the page (spec §8, §9): doc windows with the editor, the "Notes" list in the dock,
// downloads, importing dropped .md files, and the window port the agent's tools use. It connects
// the docs API (store), the window manager, the doc editor, the 3D view and the activity log.
//
// Nothing here opens the store until someone uses docs: the Notes button, an agent's doc tool, or
// saved windows from an earlier visit (remembered with one localStorage flag).

import type { ActivityLog } from "../api/activity";
import { type ApiError, type DocListing, type DocsApi, isApiError } from "../api/docs-api";
import type { WindowCommand, WindowInfo, WindowsPort } from "../api/guide-api";
import { fail, isFailure, type Result } from "../api/result";
import type { ViewOutcome } from "../api/view-api";
import type { RegionId } from "../content/types";
import { regionById } from "../model/inline";
import { resolveRef } from "../model/refs";
import { LIMITS } from "../store/limits";
import type { Artifact, Block, BlockData } from "../store/types";
import { type BlockEditor, createDocEditor, type DocEditorHost } from "./doc-editor";
import { toast } from "./dom";
import type { Explorer } from "./explorer";
import type { Layout, SizeName, Slot } from "./window-geometry";
import { createWindowManager, KIND_ICONS, type WindowKind, type WindowState } from "./windows";

export const DOCS_FLAG = "perception-attention:docs";
const RENAME_MS = 700;
const PERSIST_WARNED = "perception-attention:persist-warned";
const TRASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>';

type SettingStorage = Pick<Storage, "getItem" | "setItem">;

export interface DocsUiDeps {
  docs: DocsApi;
  stage: HTMLElement;
  notesButton: HTMLButtonElement;
  view?: { apply(patch: unknown): ViewOutcome; capture(): Record<string, unknown> };
  explorer: Pick<Explorer, "goTo" | "watchRegionHover">;
  activity: ActivityLog;
  /** True while an agent's tool runs, so its window changes are not logged as the user's. */
  agentActive: () => boolean;
  storage: SettingStorage | null;
  /** Stage 5: question blocks as inline quiz cards (otherwise a read-only preview). */
  renderQuestion?: DocEditorHost["renderQuestion"];
}

interface DocWindow {
  id: string;
  ref: string;
  kind: WindowKind;
  title: string;
  editor: BlockEditor;
  pane: HTMLElement;
  titleInput: HTMLInputElement;
  meta: HTMLElement;
  banner: HTMLElement;
  ready: HTMLElement;
  lastEdit: { at: number; by: "user" | "agent" };
  /** The tag on this editor's own saves, so their change events are not taken for someone else's. */
  origin: string;
  /** Saves a title that is still waiting for its debounce. */
  flushTitle: () => void;
}

interface OpenRequest {
  at?: Slot;
  size?: SizeName;
  block?: string;
  focus?: boolean;
  rect?: { x?: number; y?: number; w?: number; h?: number };
  state?: WindowState;
  z?: number;
}

function ago(ms: number): string {
  const seconds = (Date.now() - ms) / 1000;
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function lastEdit(artifact: Artifact): { at: number; by: "user" | "agent" } {
  const latest = artifact.blocks.reduce<Block | null>((best, block) => (!best || block.updatedAt > best.updatedAt ? block : best), null);
  return latest && latest.updatedAt >= artifact.updatedAt - 1000
    ? { at: latest.updatedAt, by: latest.updatedBy }
    : { at: artifact.updatedAt, by: artifact.createdBy };
}

function artifactIdOf(ref: string): string | null {
  const resolved = resolveRef(ref);
  return "ref" in resolved && (resolved.ref.kind === "doc" || resolved.ref.kind === "quiz") ? resolved.ref.id : null;
}

const isMarkdownFile = (file: File) => /\.(md|markdown|txt)$/i.test(file.name) || file.type === "text/markdown" || file.type === "text/plain";

function saveFile(file: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function createDocsUi({ docs, stage, notesButton, view, explorer, activity, agentActive, storage, renderQuestion }: DocsUiDeps) {
  const docWindows = new Map<string, DocWindow>();
  /** While windows from an earlier visit come back, which is not a user action to log. */
  let restoring = false;
  const pending = new Map<string, Promise<Result<{ ref: string; title: string }>>>();

  let layoutWarned = false;
  let editors = 0;
  const windows = createWindowManager({
    stage,
    onLayout: (rows) => {
      if (docs.status().store === "unopened") return;
      void docs.saveWindows(rows).then((saved) => {
        if (!isApiError(saved)) return;
        console.warn("Could not save the window layout", saved.error.message);
        // Once per visit: the windows still work, they just will not come back after a reload.
        if (!layoutWarned) toast(`Window positions could not be saved: ${saved.error.message}`);
        layoutWarned = true;
      });
    },
    onEvent: (event) => {
      if (agentActive() || restoring) return;
      activity.append({ by: "user", kind: `window_${event.kind}`, ref: event.ref });
    },
  });

  function remember(key = DOCS_FLAG) {
    try {
      storage?.setItem(key, "1");
    } catch {
      // Storage blocked: windows are not restored on the next visit.
    }
  }
  function remembered(key = DOCS_FLAG) {
    try {
      return storage?.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  /** Whether docs may exist, so agent searches include them only then. */
  const present = () => docs.status().store !== "unopened" || remembered();

  /** The storage banner (spec §11.1) in a doc window or the Notes list; hidden while docs save normally. */
  function renderBanner(element: HTMLElement) {
    const status = docs.status();
    const banner = "banner" in status ? status.banner : undefined;
    element.hidden = !banner;
    if (!banner) {
      element.replaceChildren();
      return;
    }
    const text = document.createElement("b");
    text.textContent = banner.text;
    element.replaceChildren(text, banner.detail ? ` ${banner.detail}` : "");
    if ("reason" in status && status.reason === "freed") {
      const reload = document.createElement("button");
      reload.type = "button";
      reload.className = "banner-reload";
      reload.textContent = "Reload";
      reload.addEventListener("click", () => location.reload());
      element.append(" ", reload);
    }
  }

  function statusText(): string {
    const status = docs.status();
    return "store" in status && status.store === "memory" ? "Not saved" : "Saved";
  }

  /* ---------- Doc windows ---------- */

  function paneFor(artifact: Artifact & { ref: string }): {
    pane: HTMLElement;
    titleInput: HTMLInputElement;
    meta: HTMLElement;
    banner: HTMLElement;
    ready: HTMLElement;
    host: HTMLElement;
  } {
    const pane = document.createElement("div");
    pane.className = "doc-pane";
    pane.innerHTML = `<p class="doc-banner" hidden></p>
      <div class="doc-ready" hidden><span></span><button type="button" class="doc-ready-button">Download</button></div>
      <div class="doc-scroll"><div class="doc-column">
        <input class="doc-title" type="text" maxlength="200" aria-label="Title" placeholder="Untitled" spellcheck="true">
        <p class="doc-meta"></p>
        <div class="doc-editor-host"></div>
      </div></div>`;
    const titleInput = pane.querySelector<HTMLInputElement>(".doc-title")!;
    titleInput.value = artifact.title;
    return {
      pane,
      titleInput,
      meta: pane.querySelector<HTMLElement>(".doc-meta")!,
      banner: pane.querySelector<HTMLElement>(".doc-banner")!,
      ready: pane.querySelector<HTMLElement>(".doc-ready")!,
      host: pane.querySelector<HTMLElement>(".doc-editor-host")!,
    };
  }

  function renderMeta(window: DocWindow) {
    window.meta.textContent = `Edited ${ago(window.lastEdit.at)} · ${window.lastEdit.by === "agent" ? "Assistant" : "You"}`;
    renderBanner(window.banner);
  }

  function showView(data: BlockData, caption: string) {
    if (!view) {
      toast("The 3D view is not running in this browser.");
      return;
    }
    const result = view.apply(data);
    if (isFailure(result)) toast(result.error.message);
    else toast(`Showing: ${caption}`, result.undo);
  }

  function logSaved(ref: string, ids: string[]) {
    if (ids.length === 1) activity.append({ by: "user", kind: "edited", ref: `block:${ids[0]}` });
    else activity.append({ by: "user", kind: "edited", ref, said: `${ids.length} blocks` });
  }

  // Quizzes open in the doc editor for now, with read-only question previews. Stage 5's quiz card can
  // branch on `loaded.kind === "quiz"` here and pass its own WindowBody to `windows.open`.
  async function createWindow(ref: string, request: OpenRequest): Promise<Result<{ ref: string; title: string }>> {
    const loaded = await docs.load(ref);
    if (isApiError(loaded)) return loaded as unknown as Result<{ ref: string; title: string }>;
    remember();
    const existing = docWindows.get(loaded.id);
    if (existing) return showExisting(existing, request);
    const parts = paneFor(loaded);
    let window: DocWindow;
    const origin = `editor:${++editors}`;
    const editor = createDocEditor(
      loaded.blocks,
      {
        save: (ops) => docs.saveBlocks(loaded.ref, ops, "user", { origin }),
        fetch: async () => {
          const artifact = await docs.load(loaded.ref);
          return isApiError(artifact) ? null : artifact.blocks;
        },
        captureView: () => view?.capture() ?? null,
        showView,
        onSaved: (ids) => {
          window.lastEdit = { at: Date.now(), by: "user" };
          renderMeta(window);
          logSaved(loaded.ref, ids);
        },
        onStatus: (status, message) => {
          windows.setStatus(loaded.ref, status === "saving" ? "Saving…" : status === "error" ? "Not saved" : statusText());
          if (status === "error" && message) console.warn(`Could not save ${loaded.ref}:`, message);
        },
        onSaveFailed: (message) =>
          toast(`Could not save “${window.title}”: ${message} Your edits stay in the window.`, { label: "Try again", run: () => void editor.flush() }),
        notify: (message) => toast(message),
        onEscape: () => windows.minimize(loaded.ref, true),
        renderQuestion,
      },
      { label: loaded.title },
    );
    parts.host.append(editor.element);
    window = {
      id: loaded.id,
      ref: loaded.ref,
      kind: loaded.kind,
      title: loaded.title,
      editor,
      pane: parts.pane,
      titleInput: parts.titleInput,
      meta: parts.meta,
      banner: parts.banner,
      ready: parts.ready,
      lastEdit: lastEdit(loaded),
      origin,
      flushTitle: () => {},
    };
    docWindows.set(loaded.id, window);
    wirePane(window);
    renderMeta(window);
    windows.open({
      ref: loaded.ref,
      kind: loaded.kind,
      title: loaded.title,
      body: {
        element: parts.pane,
        focusTarget: () =>
          window.titleInput.value === "Untitled" || !window.titleInput.value ? window.titleInput : window.pane.querySelector<HTMLElement>(".doc-body"),
        download: () => void docs.doc({ action: "download", ref: loaded.ref }, "user"),
        close: () => {
          window.flushTitle();
          editor.destroy();
          docWindows.delete(loaded.id);
        },
        beforeClose: () =>
          !editor.unsaved ||
          confirm(`Some edits in “${window.title}” could not be saved. Close the window and lose them? Download the doc first to keep them.`),
      },
      at: request.at,
      size: request.size,
      rect: request.rect,
      state: request.state,
      z: request.z,
      focus: request.focus,
    });
    windows.setStatus(loaded.ref, statusText());
    if (request.focus && window.titleInput.value === "Untitled") window.titleInput.select();
    if (request.block) requestAnimationFrame(() => editor.reveal(request.block as string));
    return { ref: loaded.ref, title: loaded.title };
  }

  function showExisting(window: DocWindow, request: OpenRequest): Result<{ ref: string; title: string }> {
    windows.open({
      ref: window.ref,
      kind: window.kind,
      title: window.title,
      body: { element: window.pane },
      at: request.at,
      size: request.size,
      focus: request.focus,
    });
    if (request.block) requestAnimationFrame(() => window.editor.reveal(request.block as string));
    return { ref: window.ref, title: window.title };
  }

  /** Opens (or shows) an artifact's window. Concurrent opens of one doc share the same load. */
  function openWindow(ref: string, request: OpenRequest = {}): Promise<Result<{ ref: string; title: string }>> {
    const id = artifactIdOf(ref);
    if (!id) return Promise.resolve(fail("bad_input", `Windows show docs and quizzes: doc:<id> or quiz:<id>, not ${ref}.`));
    const existing = docWindows.get(id);
    if (existing) return Promise.resolve(showExisting(existing, request));
    const waiting = pending.get(id);
    if (waiting) return waiting;
    const loading = createWindow(ref, request).finally(() => pending.delete(id));
    pending.set(id, loading);
    return loading;
  }

  function wirePane(window: DocWindow) {
    let renameTimer: ReturnType<typeof setTimeout> | undefined;
    const rename = () => {
      clearTimeout(renameTimer);
      renameTimer = undefined;
      const title = window.titleInput.value.trim();
      if (!title || title === window.title) return;
      window.title = title;
      windows.setTitle(window.ref, title);
      void docs.doc({ action: "rename", ref: window.ref, title }, "user").then((result) => {
        if (isApiError(result)) toast(result.error.message);
        else activity.append({ by: "user", kind: "renamed", ref: window.ref, said: title });
      });
    };
    window.titleInput.addEventListener("input", () => {
      clearTimeout(renameTimer);
      renameTimer = setTimeout(rename, RENAME_MS);
    });
    window.flushTitle = () => {
      if (renameTimer !== undefined) rename();
    };
    window.titleInput.addEventListener("blur", rename);
    window.titleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        rename();
        window.editor.focus("start");
      }
    });
    window.ready.querySelector("button")!.addEventListener("click", () => {
      window.ready.hidden = true;
      void docs.doc({ action: "download", ref: window.ref }, "user");
    });
    // Region links in docs work like the guide's: hover previews the region, click opens it.
    explorer.watchRegionHover(window.pane);
    window.pane.addEventListener("click", (event) => {
      const mention = (event.target as HTMLElement).closest<HTMLElement>(".region-mention");
      const region = mention?.dataset.region ? regionById(mention.dataset.region) : undefined;
      if (!region) return;
      event.preventDefault();
      explorer.goTo({ kind: "region", path: null, id: region.id as RegionId });
    });
  }

  /* ---------- Store changes ---------- */

  docs.onChange((change) => {
    if (change.kind === "storage") {
      if (change.reason === "freed") {
        // M8: this tab ran in memory because another had the database; that tab has let go.
        for (const window of docWindows.values()) renderBanner(window.banner);
        if (!notesPanel.hidden) renderBanner(notesPanel.querySelector<HTMLElement>(".notes-banner")!);
        toast("Your saved docs are free now. Reload to open them; notes made in this tab are not kept.", { label: "Reload", run: () => location.reload() });
        return;
      }
      if (remembered(PERSIST_WARNED)) return;
      remember(PERSIST_WARNED);
      toast("This browser may clear saved notes when it runs low on space. Download notes you want to keep.");
      return;
    }
    if (change.kind === "blocks") {
      const window = docWindows.get(change.artifactId);
      if (!window) return;
      // The editor's own saves come back tagged; it already shows them. Other writes as the user (Undo, restore) still refresh it.
      if (change.origin === window.origin) return;
      window.lastEdit = { at: Date.now(), by: change.actor };
      renderMeta(window);
      void window.editor.refresh();
      return;
    }
    if (change.kind !== "artifact") return;
    remember();
    if (!notesPanel.hidden) void renderNotes();
    const window = docWindows.get(change.id);
    if (!window) return;
    if (change.deleted) {
      windows.close(window.ref);
      return;
    }
    void docs.load(window.ref).then((artifact) => {
      if (isApiError(artifact) || artifact.title === window.title) return;
      window.title = artifact.title;
      windows.setTitle(window.ref, artifact.title);
      if (document.activeElement !== window.titleInput) window.titleInput.value = artifact.title;
    });
  });
  setInterval(() => {
    for (const window of docWindows.values()) renderMeta(window);
  }, 60_000);

  /* ---------- Leaving the page ---------- */

  // Edits wait 400 ms, titles 700 ms and the layout 400 ms before they save. Save them now when the page
  // is hidden or unloaded (a reload, closing the tab), so the last words typed are not lost (M5).
  function flushAll() {
    for (const window of docWindows.values()) {
      window.flushTitle();
      void window.editor.flush();
    }
    windows.flush();
  }
  addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });

  /* ---------- Downloads ---------- */

  /** docs-api's download hook. Without a user gesture (an agent's call) the window offers a button instead. */
  function download(file: string, text: string, ref: string): boolean {
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (activation?.isActive) {
      saveFile(file, text);
      return true;
    }
    void openWindow(ref, { focus: false }).then(() => {
      const id = artifactIdOf(ref);
      const window = id ? docWindows.get(id) : undefined;
      if (!window) return;
      window.ready.querySelector("span")!.textContent = `${file} is ready.`;
      window.ready.hidden = false;
    });
    return false;
  }

  /* ---------- Import by dropping a file ---------- */

  async function importFile(file: File) {
    const created = await docs.importDoc(await file.text(), file.name);
    if (isApiError(created)) toast(`Could not import ${file.name}: ${created.error.message}`);
    else {
      toast(`Imported ${file.name}`);
      activity.append({ by: "user", kind: "imported", ref: created.ref });
    }
  }

  const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes("Files");
  stage.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    stage.classList.add("drop-ready");
  });
  stage.addEventListener("dragleave", (event) => {
    if (!stage.contains(event.relatedTarget as Node | null)) stage.classList.remove("drop-ready");
  });
  stage.addEventListener("drop", (event) => {
    stage.classList.remove("drop-ready");
    if (event.defaultPrevented || !hasFiles(event)) return;
    event.preventDefault();
    const files = [...(event.dataTransfer?.files ?? [])].filter(isMarkdownFile);
    if (!files.length) {
      toast("Drop a Markdown (.md) file to import it as a doc.");
      return;
    }
    for (const file of files.slice(0, 5)) void importFile(file);
  });

  /* ---------- The Notes list ---------- */

  const notesPanel = document.createElement("section");
  notesPanel.className = "notes-panel framed-card";
  notesPanel.id = "notes-panel";
  notesPanel.setAttribute("role", "dialog");
  notesPanel.setAttribute("aria-label", "Notes");
  notesPanel.hidden = true;
  notesPanel.innerHTML = `<div class="notes-surface card-surface">
    <header class="notes-head"><h2>Notes</h2><button type="button" class="notes-new">New note</button></header>
    <p class="notes-banner" hidden></p>
    <ul class="notes-list" aria-label="Your notes"></ul>
    <footer class="notes-foot"><label class="notes-import"><input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple>Import .md</label><span>or drop a file on the page</span></footer>
  </div>`;
  stage.append(notesPanel);
  notesButton.setAttribute("aria-controls", notesPanel.id);
  notesButton.setAttribute("aria-expanded", "false");
  const notesList = notesPanel.querySelector<HTMLElement>(".notes-list")!;

  function placeNotes() {
    const box = stage.getBoundingClientRect();
    const button = notesButton.getBoundingClientRect();
    notesPanel.style.top = `${button.bottom - box.top + 10}px`;
    notesPanel.style.right = `${Math.max(12, box.right - button.right - 4)}px`;
  }

  /** Every page of a listing: the store keeps up to 200 docs, and a page holds 100. */
  async function listAll(deleted: boolean): Promise<DocListing[] | ApiError> {
    const all: DocListing[] = [];
    let cursor: string | undefined;
    do {
      const page = await docs.outlineDocs({ limit: 100, cursor, deleted });
      if (isApiError(page)) return page;
      all.push(...page.docs);
      cursor = page.cursor;
    } while (cursor);
    return all;
  }

  function noteItem(doc: DocListing): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "note-item";
    item.innerHTML = `<button type="button" class="note-row" data-ref="${doc.ref}">${KIND_ICONS[doc.kind]}<span class="note-title"></span><span class="note-meta"></span></button><button type="button" class="note-delete" data-delete="${doc.ref}">${TRASH_ICON}</button>`;
    item.querySelector(".note-title")!.textContent = doc.title;
    item.querySelector(".note-meta")!.textContent = `${ago(Date.parse(doc.updated))}${doc.open || doc.minimized ? " · open" : ""}`;
    const remove = item.querySelector<HTMLButtonElement>(".note-delete")!;
    remove.setAttribute("aria-label", `Delete ${doc.title}`);
    remove.title = "Delete";
    return item;
  }

  function deletedItem(doc: DocListing): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "note-item is-deleted";
    item.innerHTML = `<span class="note-row">${KIND_ICONS[doc.kind]}<span class="note-title"></span><span class="note-meta"></span></span><button type="button" class="note-restore" data-restore="${doc.ref}">Restore</button>`;
    item.querySelector(".note-title")!.textContent = doc.title;
    const days = Math.max(0, Math.ceil((Date.parse(doc.purge ?? "") - Date.now()) / 86_400_000));
    item.querySelector(".note-meta")!.textContent = `${days} ${days === 1 ? "day" : "days"} left`;
    item.querySelector(".note-restore")!.setAttribute("aria-label", `Restore ${doc.title}`);
    return item;
  }

  /** "Recently deleted": docs deleted in the last 30 days, with Restore. Stays open across renders once opened. */
  let deletedOpen = false;
  function deletedSection(deleted: DocListing[]): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "notes-deleted";
    const details = document.createElement("details");
    details.open = deletedOpen;
    details.addEventListener("toggle", () => {
      deletedOpen = details.open;
    });
    details.innerHTML = `<summary>Recently deleted (${deleted.length})</summary><p class="notes-deleted-note">Deleted notes are kept for ${LIMITS.purgeAfterDays} days, then removed for good.</p>`;
    const list = document.createElement("ul");
    list.append(...deleted.map(deletedItem));
    details.append(list);
    item.append(details);
    return item;
  }

  async function renderNotes() {
    const [listed, deleted] = await Promise.all([listAll(false), listAll(true)]);
    const banner = notesPanel.querySelector<HTMLElement>(".notes-banner")!;
    renderBanner(banner);
    if (isApiError(listed)) {
      const item = document.createElement("li");
      item.className = "notes-empty";
      item.textContent = listed.error.message;
      notesList.replaceChildren(item);
      return;
    }
    const items: HTMLLIElement[] = listed.map(noteItem);
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "notes-empty";
      empty.textContent = "No notes yet. Start one, or import a Markdown file.";
      items.push(empty);
    }
    if (!isApiError(deleted) && deleted.length) items.push(deletedSection(deleted));
    notesList.replaceChildren(...items);
  }

  function openNotes() {
    if (!notesList.children.length) notesList.innerHTML = '<li class="notes-empty">Loading…</li>';
    placeNotes();
    notesPanel.hidden = false;
    notesButton.setAttribute("aria-expanded", "true");
    void renderNotes().then(() => (notesPanel.querySelector<HTMLElement>("button.note-row") ?? notesPanel.querySelector<HTMLElement>(".notes-new"))?.focus());
  }

  function closeNotes(refocus = true) {
    if (notesPanel.hidden) return;
    notesPanel.hidden = true;
    notesButton.setAttribute("aria-expanded", "false");
    if (refocus) notesButton.focus({ preventScroll: true });
  }

  notesButton.addEventListener("click", () => (notesPanel.hidden ? openNotes() : closeNotes()));
  notesPanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeNotes();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const rows = [...notesPanel.querySelectorAll<HTMLElement>("button.note-row")];
      const index = rows.indexOf(document.activeElement as HTMLElement);
      if (!rows.length) return;
      event.preventDefault();
      rows[(index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length].focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!notesPanel.hidden && !notesPanel.contains(event.target as Node) && !notesButton.contains(event.target as Node)) closeNotes(false);
  });
  function restoreDoc(ref: string) {
    void docs.doc({ action: "restore", ref }, "user").then((result) => {
      if (isApiError(result)) return toast(`Could not restore: ${result.error.message}`);
      activity.append({ by: "user", kind: "restored", ref });
      toast(result.said);
      if (!notesPanel.hidden) void renderNotes();
    });
  }

  function deleteDoc(ref: string) {
    void docs.doc({ action: "delete", ref }, "user").then((result) => {
      if (isApiError(result)) return toast(result.error.message);
      activity.append({ by: "user", kind: "deleted", ref });
      toast(`${result.said}. Find it under Recently deleted.`, { label: "Undo", run: () => restoreDoc(ref) });
      void renderNotes();
    });
  }

  /** The trash button asks once: the first click arms it ("Delete?"), a second click within 4 s deletes. */
  let armed: { button: HTMLButtonElement; timer: ReturnType<typeof setTimeout> } | null = null;
  function disarm() {
    if (!armed) return;
    clearTimeout(armed.timer);
    armed.button.classList.remove("armed");
    armed.button.innerHTML = TRASH_ICON;
    armed.button.setAttribute("aria-label", armed.button.dataset.label ?? "Delete");
    armed = null;
  }
  function arm(button: HTMLButtonElement) {
    disarm();
    button.dataset.label = button.getAttribute("aria-label") ?? "Delete";
    button.classList.add("armed");
    button.textContent = "Delete?";
    button.setAttribute("aria-label", `${button.dataset.label}: press again to confirm`);
    armed = { button, timer: setTimeout(disarm, 4000) };
    button.addEventListener("blur", () => armed?.button === button && disarm(), { once: true });
  }

  notesPanel.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>("button.note-row");
    const remove = target.closest<HTMLButtonElement>(".note-delete");
    const restore = target.closest<HTMLElement>(".note-restore");
    if (row?.dataset.ref) {
      closeNotes(false);
      void openWindow(row.dataset.ref, { focus: true }).then((opened) => {
        if ("error" in opened) toast(opened.error.message);
      });
    } else if (remove?.dataset.delete) {
      if (armed?.button !== remove) return arm(remove);
      disarm();
      deleteDoc(remove.dataset.delete);
    } else if (restore?.dataset.restore) {
      restoreDoc(restore.dataset.restore);
    } else if (target.closest(".notes-new")) {
      closeNotes(false);
      void docs.doc({ action: "create", title: "Untitled", markdown: "" }, "user").then((created) => {
        if (isApiError(created)) toast(created.error.message);
        else activity.append({ by: "user", kind: "created", ref: created.ref });
      });
    }
  });
  notesPanel.querySelector<HTMLInputElement>(".notes-import input")!.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])].filter(isMarkdownFile);
    input.value = "";
    closeNotes(false);
    for (const file of files.slice(0, 5)) void importFile(file);
  });

  /* ---------- The port for agent tools ---------- */

  const find = (ref: string) => {
    const id = artifactIdOf(ref);
    return id ? docWindows.get(id) : undefined;
  };
  const noWindow = (ref: string) => fail("not_available", `${ref} has no window. Open it with window({ action: "open", ref: "${ref}" }).`);

  const port: WindowsPort = {
    list: (): WindowInfo[] => windows.list(),
    editing() {
      for (const window of docWindows.values()) {
        const id = window.editor.editing();
        if (id) return id;
      }
      return null;
    },
    open: (ref, options = {}) => openWindow(ref, { ...options, focus: false }),
    command(action: WindowCommand, ref: string) {
      const window = find(ref);
      if (!window) return noWindow(ref);
      if (action === "close") windows.close(window.ref);
      else if (action === "minimize") windows.minimize(window.ref);
      else if (action === "restore") windows.restore(window.ref);
      else windows.focus(window.ref);
      return { ref: window.ref, title: window.title };
    },
    place(ref: string, at?: Slot, size?: SizeName) {
      const window = find(ref);
      if (!window) return noWindow(ref);
      windows.place(window.ref, at, size);
      return { ref: window.ref, title: window.title };
    },
    arrange: (layout: Layout) => windows.arrange(layout),
  };

  /** Brings back the windows of an earlier visit, on idle, only if docs were used before. */
  function restoreWindows() {
    if (!remembered()) return;
    const run = async () => {
      const rows = await docs.loadWindows();
      if (isApiError(rows)) return;
      restoring = true;
      try {
        for (const row of [...rows].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)))
          await openWindow(row.ref, { rect: { x: row.x, y: row.y, w: row.w, h: row.h }, state: row.state, z: row.z, focus: false });
      } finally {
        restoring = false;
      }
    };
    const idle = (globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(() => void run(), { timeout: 3000 });
    else setTimeout(() => void run(), 1200);
  }

  return {
    port,
    present,
    download,
    /** docs-api's open hook: user actions move focus into the window; agent calls do not. */
    open: (ref: string) => void openWindow(ref, { focus: !agentActive() }),
    isLocked: (blockId: string) => [...docWindows.values()].some((window) => window.editor.isLocked(blockId)),
    restoreWindows,
    openNotes,
    windows,
  };
}

export type DocsUi = ReturnType<typeof createDocsUi>;
