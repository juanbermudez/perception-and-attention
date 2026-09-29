// Drag or arrow-key resizing along the panel's framed edge, between it and the 3D view. On narrow
// screens the panel sits below the stage, so the same handle resizes its height instead. The size the
// user picks is remembered in this browser, one for each layout.
import { byId } from "./dom";

type SettingStorage = Pick<Storage, "getItem" | "setItem">;

export const PANEL_SIZE_KEYS = { width: "perception-attention:panel-width", height: "perception-attention:drawer-height" };

export function setupPanelResize(storage: SettingStorage | null = null) {
  const NARROW = matchMedia("(max-width: 740px)");
  // The stylesheet's narrower default panel width starts here (styles.css, @media (max-width: 1000px)).
  const COMPACT = matchMedia("(max-width: 1000px)");
  const workspace = document.querySelector<HTMLElement>(".workspace");
  if (!workspace) throw new Error("Missing .workspace");
  const panel = byId("inspector");
  const handle = byId("inspector-resize");
  let gesture: { pointerId: number; start: number; size: number; vertical: boolean } | null = null;

  const bounds = () => {
    if (NARROW.matches) {
      const max = Math.max(180, window.innerHeight - 260);
      return { min: Math.min(220, max), max };
    }
    // The rail and at least 420 px of 3D view stay beside the panel.
    const rail = document.getElementById("rail")?.getBoundingClientRect().width ?? 0;
    return { min: 300, max: Math.max(300, Math.min(560, window.innerWidth - rail - 420)) };
  };
  const currentSize = () => {
    const rect = panel.getBoundingClientRect();
    return NARROW.matches ? rect.height : rect.width;
  };

  function updateHandle() {
    const { min, max } = bounds();
    const size = Math.round(currentSize());
    handle.setAttribute("aria-orientation", NARROW.matches ? "horizontal" : "vertical");
    handle.setAttribute("aria-valuemin", String(min));
    handle.setAttribute("aria-valuemax", String(Math.round(max)));
    handle.setAttribute("aria-valuenow", String(size));
    handle.setAttribute("aria-valuetext", `${size} pixels ${NARROW.matches ? "tall" : "wide"}`);
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

  /** Set the size within the current bounds; `remember` keeps it for the next visit. */
  function setSize(value: number, remember = false) {
    const { min, max } = bounds();
    const size = Math.round(Math.max(min, Math.min(max, value)));
    workspace?.style.setProperty(NARROW.matches ? "--drawer-height" : "--inspector-width", `${size}px`);
    if (remember)
      try {
        storage?.setItem(sizeKey(), String(size));
      } catch {
        // Private mode or blocked storage: the size still applies for this visit.
      }
    updateHandle();
  }

  /**
   * After a load, a window resize or a change of layout: the user's size for this layout, kept inside the
   * new bounds (so it comes back when the window grows again); without one, the stylesheet's default.
   */
  function fitSize() {
    const set = workspace?.style.getPropertyValue(NARROW.matches ? "--drawer-height" : "--inspector-width");
    const size = savedSize() ?? (set ? currentSize() : null);
    if (size !== null) setSize(size);
    else updateHandle();
  }

  function finish() {
    if (gesture && handle.hasPointerCapture(gesture.pointerId)) handle.releasePointerCapture(gesture.pointerId);
    gesture = null;
    workspace?.classList.remove("resizing");
  }

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    const vertical = NARROW.matches;
    gesture = { pointerId: event.pointerId, start: vertical ? event.clientY : event.clientX, size: currentSize(), vertical };
    handle.setPointerCapture(event.pointerId);
    workspace.classList.add("resizing");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    // The panel grows as the pointer moves right, toward the 3D view (or up on narrow screens).
    setSize(gesture.vertical ? gesture.size + gesture.start - event.clientY : gesture.size + event.clientX - gesture.start, true);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(type, finish);
  handle.addEventListener("keydown", (event) => {
    const grow = NARROW.matches ? "ArrowUp" : "ArrowRight";
    const shrink = NARROW.matches ? "ArrowDown" : "ArrowLeft";
    if (![grow, shrink, "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const { min, max } = bounds();
    setSize(event.key === "Home" ? min : event.key === "End" ? max : currentSize() + (event.key === grow ? 24 : -24), true);
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
