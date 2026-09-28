// Floating windows for docs and quizzes (spec §8). One `#windows` layer sits inside `.brain-stage` as
// a sibling of `#orbit-surface`, so pointer events on windows never reach the orbit controls. The
// layer ignores the pointer; each window and the tray of minimized chips take it.
//
// Windows drag by the header (pointer capture), resize from the corner grip, stack by focus, and
// keep at least 48 px inside the stage. Below 720 px they are bottom sheets, one at a time.
// Geometry is pure (`window-geometry.ts`); this module applies it to the DOM and reports the layout
// for persistence.

import type { WindowInfo } from "../api/guide-api";
import {
  arrange,
  cascade,
  constrain,
  isMobile,
  type Layout,
  MAX_OPEN,
  MOBILE_WIDTH,
  type Rect,
  type SizeName,
  type Slot,
  type StageSize,
  sizeFor,
  slotRect,
} from "./window-geometry";

export type WindowKind = "doc" | "quiz";
export type WindowState = "open" | "minimized";

/** What a window shows. The manager owns the frame; the body owns its content. */
export interface WindowBody {
  element: HTMLElement;
  /** Where focus goes when the window opens or is restored. */
  focusTarget?(): HTMLElement | null;
  /** The header's download button; hidden when absent. */
  download?(): void;
  /** The window closed (not minimized): flush and release. */
  close?(): void;
}

export interface OpenOptions {
  ref: string;
  kind: WindowKind;
  title: string;
  body: WindowBody;
  at?: Slot;
  size?: SizeName;
  /** A saved rect (from the store) instead of a slot. */
  rect?: Partial<Rect>;
  state?: WindowState;
  z?: number;
  /** Move keyboard focus into the window (user actions); agents leave focus where it is. */
  focus?: boolean;
}

export interface WindowLayoutRow {
  ref: string;
  state: WindowState;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export type WindowEvent = { kind: "opened" | "closed" | "minimized" | "restored"; ref: string; title: string };

interface Managed {
  ref: string;
  kind: WindowKind;
  title: string;
  state: WindowState;
  rect: Rect;
  z: number;
  node: HTMLElement;
  titleNode: HTMLElement;
  status: HTMLElement;
  chip: HTMLButtonElement | null;
  body: WindowBody;
  opener: Element | null;
}

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
export const KIND_ICONS: Record<WindowKind, string> = {
  doc: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>'),
  quiz: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.1"/>'),
};
const ICONS = {
  download: svg('<path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/>'),
  minimize: svg('<path d="M6 12h12"/>'),
  close: svg('<path d="m6 6 12 12M6 18 18 6"/>'),
};
const MOVE_STEP = 16;
const PERSIST_MS = 400;

let windowCount = 0;

export function createWindowManager({
  stage,
  onLayout,
  onEvent,
}: {
  stage: HTMLElement;
  /** Called (debounced) with every window's geometry and state, for the store. */
  onLayout: (rows: WindowLayoutRow[]) => void;
  onEvent?: (event: WindowEvent) => void;
}) {
  const layer = document.createElement("div");
  layer.id = "windows";
  layer.className = "windows-layer";
  const tray = document.createElement("div");
  tray.className = "window-tray";
  tray.setAttribute("role", "toolbar");
  tray.setAttribute("aria-label", "Minimized windows");
  tray.hidden = true;
  layer.append(tray);
  // A sibling of the orbit surface: events on windows never reach the orbit controls.
  stage.querySelector("#orbit-surface")?.after(layer);
  if (!layer.isConnected) stage.append(layer);

  const windows = new Map<string, Managed>();
  let topZ = 0;
  let focusedRef: string | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  const mobileQuery = matchMedia(`(max-width: ${MOBILE_WIDTH - 1}px)`);

  const stageSize = (): StageSize => ({ width: layer.clientWidth || stage.clientWidth, height: layer.clientHeight || stage.clientHeight });
  const mobile = () => isMobile(innerWidth);

  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => onLayout(layout()), PERSIST_MS);
  }

  function layout(): WindowLayoutRow[] {
    return [...windows.values()].map((window) => ({ ref: window.ref, state: window.state, ...window.rect, z: window.z }));
  }

  function place(window: Managed) {
    const { x, y, w, h } = window.rect;
    // Sheets on phones take their size from CSS.
    if (mobile()) Object.assign(window.node.style, { left: "", top: "", width: "", height: "", zIndex: String(window.z) });
    else Object.assign(window.node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, zIndex: String(window.z) });
  }

  function raise(window: Managed) {
    if (window.z !== topZ || topZ === 0) window.z = ++topZ;
    focusedRef = window.ref;
    for (const other of windows.values()) other.node.classList.toggle("focused", other === window);
    place(window);
  }

  function renderTray() {
    const minimized = [...windows.values()].filter((window) => window.state === "minimized");
    tray.hidden = minimized.length === 0;
    for (const window of windows.values()) {
      if (window.state === "minimized" && !window.chip) {
        const chip = document.createElement("button");
        chip.className = "tray-chip";
        chip.addEventListener("click", () => restore(window.ref, true));
        window.chip = chip;
      }
      if (window.state === "open" && window.chip) {
        window.chip.remove();
        window.chip = null;
      }
      if (window.chip) {
        window.chip.innerHTML = `${KIND_ICONS[window.kind]}<span></span>`;
        window.chip.querySelector("span")!.textContent = window.title;
        window.chip.title = `Restore ${window.title}`;
        tray.append(window.chip);
      }
    }
  }

  function build(options: OpenOptions): Managed {
    const node = document.createElement("section");
    const id = `window-${++windowCount}`;
    node.className = `doc-window framed-card kind-${options.kind}`;
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "false");
    node.setAttribute("aria-labelledby", `${id}-title`);
    node.dataset.ref = options.ref;
    node.innerHTML = `<div class="window-surface card-surface">
      <header class="window-head">
        <span class="window-kind">${KIND_ICONS[options.kind]}</span>
        <h2 class="window-title" id="${id}-title"></h2>
        <span class="window-status" aria-live="off"></span>
        <div class="window-actions">
          <button class="window-button" data-action="download" aria-label="Download as Markdown" title="Download .md" hidden>${ICONS.download}</button>
          <button class="window-button" data-action="minimize" aria-label="Minimize" title="Minimize (Esc)">${ICONS.minimize}</button>
          <button class="window-button" data-action="close" aria-label="Close" title="Close">${ICONS.close}</button>
        </div>
      </header>
      <div class="window-body"></div>
      <div class="window-grip" aria-hidden="true"></div>
    </div>`;
    const titleNode = node.querySelector<HTMLElement>(".window-title")!;
    titleNode.textContent = options.title;
    node.querySelector(".window-body")!.append(options.body.element);
    const download = node.querySelector<HTMLButtonElement>('[data-action="download"]')!;
    download.hidden = !options.body.download;
    const window: Managed = {
      ref: options.ref,
      kind: options.kind,
      title: options.title,
      state: "open",
      rect: { x: 0, y: 0, w: 0, h: 0 },
      z: 0,
      node,
      titleNode,
      status: node.querySelector<HTMLElement>(".window-status")!,
      chip: null,
      body: options.body,
      opener: document.activeElement,
    };
    wire(window);
    return window;
  }

  function wire(window: Managed) {
    const { node } = window;
    const head = node.querySelector<HTMLElement>(".window-head")!;
    node.addEventListener("pointerdown", () => raise(window), { capture: true });
    node.addEventListener("focusin", () => {
      if (focusedRef !== window.ref) raise(window);
    });
    node.querySelector(".window-actions")!.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]")?.dataset.action;
      if (action === "minimize") minimize(window.ref, true);
      else if (action === "close") close(window.ref, true);
      else if (action === "download") window.body.download?.();
    });
    node.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        minimize(window.ref, true);
        return;
      }
      if (event.altKey && event.shiftKey && event.key.startsWith("Arrow") && !mobile()) {
        event.preventDefault();
        const dx = event.key === "ArrowLeft" ? -MOVE_STEP : event.key === "ArrowRight" ? MOVE_STEP : 0;
        const dy = event.key === "ArrowUp" ? -MOVE_STEP : event.key === "ArrowDown" ? MOVE_STEP : 0;
        window.rect = constrain({ ...window.rect, x: window.rect.x + dx, y: window.rect.y + dy }, stageSize());
        place(window);
        persist();
      }
    });
    drag(
      head,
      window,
      (start, dx, dy) => ({ ...start, x: start.x + dx, y: start.y + dy }),
      (target) => Boolean(target.closest("button, input, a")),
    );
    drag(node.querySelector<HTMLElement>(".window-grip")!, window, (start, dx, dy) => ({ ...start, w: start.w + dx, h: start.h + dy }));
  }

  /** Pointer-captured drags on `handle` that turn the pointer offset into a new rect. */
  function drag(handle: HTMLElement, window: Managed, next: (start: Rect, dx: number, dy: number) => Rect, ignore?: (target: HTMLElement) => boolean) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || mobile() || ignore?.(event.target as HTMLElement)) return;
      event.preventDefault();
      const start = { ...window.rect };
      const [x0, y0] = [event.clientX, event.clientY];
      handle.setPointerCapture(event.pointerId);
      window.node.classList.add("dragging");
      const move = (moveEvent: PointerEvent) => {
        window.rect = constrain(next(start, moveEvent.clientX - x0, moveEvent.clientY - y0), stageSize());
        place(window);
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        window.node.classList.remove("dragging");
        persist();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("lostpointercapture", end, { once: true });
    });
  }

  function focusInside(window: Managed) {
    const target = window.body.focusTarget?.() ?? window.node.querySelector<HTMLElement>(".window-button[data-action='minimize']");
    target?.focus({ preventScroll: true });
  }

  /** Keeps at most 8 windows open (the least recently focused one minimizes) and one sheet on phones. */
  function makeRoom(keep: Managed) {
    const open = [...windows.values()].filter((window) => window.state === "open" && window !== keep).sort((a, b) => a.z - b.z);
    const limit = mobile() ? 0 : MAX_OPEN - 1;
    while (open.length > limit) minimize(open.shift()!.ref, false);
  }

  function returnFocus(window: Managed) {
    if (!window.node.contains(document.activeElement)) return;
    const opener =
      window.opener instanceof HTMLElement && window.opener !== document.body && window.opener.isConnected && !window.node.contains(window.opener)
        ? window.opener
        : null;
    (opener ?? document.getElementById("notes-button"))?.focus({ preventScroll: true });
  }

  /* ---------- Commands ---------- */

  function open(options: OpenOptions): Managed {
    const existing = windows.get(options.ref);
    if (existing) {
      if (existing.state === "minimized") restore(existing.ref, options.focus ?? false);
      else raise(existing);
      if (options.at || options.size) placeAt(existing.ref, options.at, options.size);
      if (options.focus) focusInside(existing);
      return existing;
    }
    const window = build(options);
    const stageNow = stageSize();
    const size = options.size ? sizeFor(options.size, stageNow) : sizeFor(options.kind === "quiz" ? "s" : "m", stageNow);
    const saved = options.rect;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y))
      window.rect = constrain({ x: saved.x as number, y: saved.y as number, w: saved.w ?? size.w, h: saved.h ?? size.h }, stageNow);
    else {
      const others = [...windows.values()].filter((other) => other.state === "open").map((other) => other.rect);
      window.rect = cascade(slotRect(options.at ?? "right", size, stageNow), others, stageNow);
    }
    windows.set(window.ref, window);
    layer.insertBefore(window.node, tray);
    if (options.z) {
      window.z = options.z;
      topZ = Math.max(topZ, options.z);
      place(window);
    } else raise(window);
    if (options.state === "minimized") {
      window.state = "minimized";
      window.node.hidden = true;
      renderTray();
    } else {
      makeRoom(window);
      if (options.focus) focusInside(window);
    }
    persist();
    onEvent?.({ kind: "opened", ref: window.ref, title: window.title });
    return window;
  }

  function minimize(ref: string, byUser: boolean): boolean {
    const window = windows.get(ref);
    if (!window) return false;
    if (window.state === "minimized") return true;
    returnFocus(window);
    window.state = "minimized";
    window.node.hidden = true;
    if (focusedRef === ref) focusedRef = null;
    renderTray();
    persist();
    if (byUser) onEvent?.({ kind: "minimized", ref, title: window.title });
    return true;
  }

  function restore(ref: string, focus: boolean): boolean {
    const window = windows.get(ref);
    if (!window) return false;
    const wasMinimized = window.state === "minimized";
    window.state = "open";
    window.node.hidden = false;
    window.rect = constrain(window.rect, stageSize());
    raise(window);
    makeRoom(window);
    renderTray();
    if (focus) focusInside(window);
    persist();
    if (wasMinimized && focus) onEvent?.({ kind: "restored", ref, title: window.title });
    return true;
  }

  function close(ref: string, byUser: boolean): boolean {
    const window = windows.get(ref);
    if (!window) return false;
    returnFocus(window);
    window.body.close?.();
    window.node.remove();
    window.chip?.remove();
    windows.delete(ref);
    if (focusedRef === ref) focusedRef = null;
    renderTray();
    persist();
    if (byUser) onEvent?.({ kind: "closed", ref, title: window.title });
    return true;
  }

  function placeAt(ref: string, at?: Slot, size?: SizeName): boolean {
    const window = windows.get(ref);
    if (!window) return false;
    const stageNow = stageSize();
    const dimensions = size ? sizeFor(size, stageNow) : { w: window.rect.w, h: window.rect.h };
    window.rect = at ? slotRect(at, dimensions, stageNow) : constrain({ ...window.rect, ...dimensions }, stageNow);
    if (window.state === "minimized") restore(ref, false);
    else raise(window);
    persist();
    return true;
  }

  function arrangeAll(kind: Layout): number {
    const open = [...windows.values()].filter((window) => window.state === "open").sort((a, b) => a.z - b.z);
    const rects = arrange(kind, open.length, stageSize());
    open.forEach((window, index) => {
      window.rect = rects[index];
      raise(window);
    });
    persist();
    return open.length;
  }

  // Keep windows reachable when the stage changes size, and switch between floating and sheets.
  new ResizeObserver(() => {
    const size = stageSize();
    for (const window of windows.values()) {
      window.rect = constrain(window.rect, size);
      place(window);
    }
  }).observe(layer);
  mobileQuery.addEventListener("change", () => {
    layer.classList.toggle("sheets", mobile());
    for (const window of windows.values()) place(window);
    if (!mobile()) return;
    const top = [...windows.values()].filter((window) => window.state === "open").sort((a, b) => b.z - a.z)[0];
    if (top) makeRoom(top);
  });
  layer.classList.toggle("sheets", mobile());

  return {
    layer,
    open,
    has: (ref: string) => windows.has(ref),
    isOpen: (ref: string) => windows.get(ref)?.state === "open",
    minimize: (ref: string, byUser = false) => minimize(ref, byUser),
    restore: (ref: string, focus = false) => restore(ref, focus),
    close: (ref: string, byUser = false) => close(ref, byUser),
    focus(ref: string, moveFocus = false) {
      const window = windows.get(ref);
      if (!window) return false;
      if (window.state === "minimized") return restore(ref, moveFocus);
      raise(window);
      if (moveFocus) focusInside(window);
      return true;
    },
    place: placeAt,
    arrange: arrangeAll,
    setTitle(ref: string, title: string) {
      const window = windows.get(ref);
      if (!window) return;
      window.title = title;
      window.titleNode.textContent = title;
      if (window.chip) renderTray();
    },
    setStatus(ref: string, text: string) {
      const window = windows.get(ref);
      if (window) window.status.textContent = text;
    },
    title: (ref: string) => windows.get(ref)?.title,
    /** Windows for get_context, in stacking order (front last). */
    list(): WindowInfo[] {
      return [...windows.values()]
        .sort((a, b) => a.z - b.z)
        .map((window) => ({
          ref: window.ref,
          title: window.title,
          state: window.state,
          focused: focusedRef === window.ref && window.state === "open" ? true : undefined,
        }));
    },
    focusedRef: () => focusedRef,
    layout,
  };
}

export type WindowManager = ReturnType<typeof createWindowManager>;
