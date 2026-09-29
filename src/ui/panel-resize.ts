// Drag or arrow-key resizing along the panel's framed edge, between it and the 3D view. On narrow
// screens the panel sits below the stage, so the same handle resizes its height instead.
import { byId } from "./dom";

export function setupPanelResize() {
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

  function setSize(value: number) {
    const { min, max } = bounds();
    const size = Math.round(Math.max(min, Math.min(max, value)));
    workspace?.style.setProperty(NARROW.matches ? "--drawer-height" : "--inspector-width", `${size}px`);
    updateHandle();
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
    setSize(gesture.vertical ? gesture.size + gesture.start - event.clientY : gesture.size + event.clientX - gesture.start);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(type, finish);
  handle.addEventListener("keydown", (event) => {
    const grow = NARROW.matches ? "ArrowUp" : "ArrowRight";
    const shrink = NARROW.matches ? "ArrowDown" : "ArrowLeft";
    if (![grow, shrink, "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const { min, max } = bounds();
    setSize(event.key === "Home" ? min : event.key === "End" ? max : currentSize() + (event.key === grow ? 24 : -24));
  });
  window.addEventListener("resize", () => {
    finish();
    // A size the user set stays inside the new bounds; without one, the stylesheet's default applies.
    if (workspace.style.getPropertyValue(NARROW.matches ? "--drawer-height" : "--inspector-width")) setSize(currentSize());
    else updateHandle();
  });
  // Crossing a breakpoint drops the size the user set, so the inline value never overrides that
  // breakpoint's default (it would, being more specific than the stylesheet's :root value).
  const resetSize = () => {
    workspace.style.removeProperty("--inspector-width");
    workspace.style.removeProperty("--drawer-height");
    updateHandle();
  };
  NARROW.addEventListener("change", resetSize);
  COMPACT.addEventListener("change", resetSize);
  updateHandle();
}
