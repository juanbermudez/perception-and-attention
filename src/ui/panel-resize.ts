// Drag or arrow-key resizing along the panel's edge, between it and the 3D view. On narrow screens the
// panel sits below the stage, so the same handle resizes its height instead. The size the user picks is
// remembered in this browser, one for each layout.
//
// The size follows a target through a critically damped spring (math/time, as the 3D view's motion
// does): a drag or a key sets the target and the panel eases to it, and a new target mid-way retargets
// smoothly. Past the minimum or maximum a drag keeps going with growing resistance (a rubber band, at
// most RUBBER_LIMIT px), and on release the panel springs back to the bound. Window and layout changes
// apply at once, and with reduced motion every change does, clamped, without the band.
import { clamp } from "math";
import { spring } from "math/time";
import { byId } from "./dom";

type SettingStorage = Pick<Storage, "getItem" | "setItem">;

export const PANEL_SIZE_KEYS = { width: "perception-attention:panel-width", height: "perception-attention:drawer-height" };

/** How far past a bound the rubber band can stretch, in px. */
export const RUBBER_LIMIT = 72;
/** Seconds to catch up with a drag (quick, but it still reads as following), a key, and a release. */
const FOLLOW = 0.06,
  STEP = 0.12,
  SETTLE = 0.16;

/**
 * Inside [min, max] the value itself. Beyond a bound it keeps following with growing resistance and never
 * gets more than `limit` px past it (the curve iOS uses for scroll views, with c = 0.55).
 */
export function rubberBand(value: number, min: number, max: number, limit = RUBBER_LIMIT) {
  const stretch = (over: number) => (1 - 1 / ((over * 0.55) / limit + 1)) * limit;
  if (value > max) return max + stretch(value - max);
  if (value < min) return min - stretch(min - value);
  return value;
}

export interface PanelResizeOptions {
  /** Ease sizes through the spring; false applies every change at once (tests). Reduced motion also turns it off. */
  animate?: boolean;
  /** The frame scheduler; tests pass one they step by hand. */
  requestFrame?: (callback: (time: number) => void) => void;
}

export function setupPanelResize(storage: SettingStorage | null = null, options: PanelResizeOptions = {}) {
  const NARROW = matchMedia("(max-width: 740px)");
  // The stylesheet's narrower default panel width starts here (styles.css, @media (max-width: 1000px)).
  const COMPACT = matchMedia("(max-width: 1000px)");
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");
  const requestFrame = options.requestFrame ?? ((callback: (time: number) => void) => requestAnimationFrame(callback));
  const animating = () => options.animate !== false && !REDUCED.matches;
  const workspace = document.querySelector<HTMLElement>(".workspace");
  if (!workspace) throw new Error("Missing .workspace");
  const panel = byId("inspector");
  const handle = byId("inspector-resize");
  let gesture: { pointerId: number; start: number; size: number } | null = null;

  const bounds = () => {
    if (NARROW.matches) {
      const max = Math.max(180, window.innerHeight - 260);
      return { min: Math.min(220, max), max };
    }
    // The rail and at least 420 px of 3D view stay beside the panel.
    const rail = document.getElementById("rail")?.getBoundingClientRect().width ?? 0;
    return { min: 300, max: Math.max(300, Math.min(560, window.innerWidth - rail - 420)) };
  };
  const within = (value: number) => {
    const { min, max } = bounds();
    return Math.round(clamp(value, min, max));
  };
  const property = () => (NARROW.matches ? "--drawer-height" : "--inspector-width");
  const currentSize = () => {
    const rect = panel.getBoundingClientRect();
    return NARROW.matches ? rect.height : rect.width;
  };

  function updateHandle(size = currentSize()) {
    const { min, max } = bounds();
    const now = Math.round(size);
    handle.setAttribute("aria-orientation", NARROW.matches ? "horizontal" : "vertical");
    handle.setAttribute("aria-valuemin", String(min));
    handle.setAttribute("aria-valuemax", String(Math.round(max)));
    handle.setAttribute("aria-valuenow", String(now));
    handle.setAttribute("aria-valuetext", `${now} pixels ${NARROW.matches ? "tall" : "wide"}`);
  }

  const sizeKey = () => (NARROW.matches ? PANEL_SIZE_KEYS.height : PANEL_SIZE_KEYS.width);
  /** The size the user last picked for this layout, if the browser kept it. */
  function savedSize(): number | null {
    try {
      const value = Number(storage?.getItem(sizeKey()) ?? Number.NaN);
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  }
  function remember(size: number) {
    try {
      storage?.setItem(sizeKey(), String(size));
    } catch {
      // Private mode or blocked storage: the size still applies for this visit.
    }
  }

  /* ---------- The spring ---------- */

  const motion = spring.create(0);
  let target = 0,
    smoothTime = STEP,
    running = false,
    lastTime = 0;
  const show = (size: number) => workspace.style.setProperty(property(), `${Math.round(size * 10) / 10}px`);

  /** Apply a size at once (a window or layout change, or reduced motion). */
  function setNow(value: number) {
    const size = within(value);
    target = size;
    motion.value = size;
    motion.velocity = 0;
    show(size);
    updateHandle(size);
  }

  /** Ease toward a target; one already on its way retargets from where it is, keeping its speed. */
  function moveTo(value: number, seconds: number) {
    if (!animating()) return setNow(value);
    if (!running) {
      motion.value = currentSize();
      motion.velocity = 0;
      running = true;
      lastTime = 0;
      requestFrame(tick);
    }
    target = value;
    smoothTime = seconds;
    updateHandle(within(value));
  }

  function tick(time: number) {
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    spring.damp(motion, target, smoothTime, dt);
    const settled = Math.abs(motion.value - target) < 0.2 && Math.abs(motion.velocity) < 2;
    if (settled) {
      motion.value = target;
      motion.velocity = 0;
    }
    show(motion.value);
    if (!settled || gesture) requestFrame(tick);
    else running = false;
  }

  /**
   * After a load, a window resize or a change of layout: the user's size for this layout, kept inside the
   * new bounds (so it comes back when the window grows again); without one, the stylesheet's default.
   */
  function fitSize() {
    const set = workspace?.style.getPropertyValue(property());
    const size = savedSize() ?? (set ? currentSize() : null);
    if (size !== null) setNow(size);
    else {
      target = currentSize();
      updateHandle();
    }
  }

  /* ---------- Drag and keys ---------- */

  function finish() {
    if (!gesture) return;
    if (handle.hasPointerCapture(gesture.pointerId)) handle.releasePointerCapture(gesture.pointerId);
    gesture = null;
    workspace?.classList.remove("resizing");
    // Back inside the bounds, springing from wherever the band left it.
    const size = within(target);
    remember(size);
    moveTo(size, SETTLE);
  }

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    // Start from where the panel is heading, so grabbing it mid-animation does not jump.
    gesture = { pointerId: event.pointerId, start: NARROW.matches ? event.clientY : event.clientX, size: running ? within(target) : currentSize() };
    handle.setPointerCapture(event.pointerId);
    workspace.classList.add("resizing");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    // The panel grows as the pointer moves right, toward the 3D view (or up on narrow screens).
    const raw = NARROW.matches ? gesture.size + gesture.start - event.clientY : gesture.size + event.clientX - gesture.start;
    const { min, max } = bounds();
    moveTo(animating() ? rubberBand(raw, min, max) : raw, FOLLOW);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(type, finish);
  handle.addEventListener("keydown", (event) => {
    const grow = NARROW.matches ? "ArrowUp" : "ArrowRight";
    const shrink = NARROW.matches ? "ArrowDown" : "ArrowLeft";
    if (![grow, shrink, "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const { min, max } = bounds();
    const size = within(event.key === "Home" ? min : event.key === "End" ? max : within(target || currentSize()) + (event.key === grow ? 24 : -24));
    remember(size);
    moveTo(size, STEP);
  });
  window.addEventListener("resize", () => {
    finish();
    fitSize();
  });
  // Between the wide and the narrow layout the handle changes axis: the other axis's size is dropped,
  // and this layout's saved size (if any) applies.
  NARROW.addEventListener("change", () => {
    workspace.style.removeProperty("--inspector-width");
    workspace.style.removeProperty("--drawer-height");
    fitSize();
  });
  COMPACT.addEventListener("change", fitSize);
  fitSize();
}
