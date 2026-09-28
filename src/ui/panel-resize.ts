// Drag or arrow-key resizing along the panel's framed edge. On narrow screens the
// panel sits below the stage, so the same handle resizes its height instead.
import { byId } from "./dom";

const NARROW = matchMedia("(max-width: 740px)");

export function setupPanelResize(onResize: () => void) {
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
    return { min: 300, max: Math.max(300, Math.min(560, window.innerWidth - 420)) };
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
    onResize();
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
    // The panel grows as the pointer moves left (or up on narrow screens).
    setSize(gesture.size + gesture.start - (gesture.vertical ? event.clientY : event.clientX));
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(type, finish);
  handle.addEventListener("keydown", (event) => {
    const grow = NARROW.matches ? "ArrowUp" : "ArrowLeft";
    const shrink = NARROW.matches ? "ArrowDown" : "ArrowRight";
    if (![grow, shrink, "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const { min, max } = bounds();
    setSize(event.key === "Home" ? min : event.key === "End" ? max : currentSize() + (event.key === grow ? 24 : -24));
  });
  window.addEventListener("resize", () => {
    finish();
    updateHandle();
  });
  NARROW.addEventListener("change", () => {
    workspace.style.removeProperty("--inspector-width");
    workspace.style.removeProperty("--drawer-height");
    updateHandle();
  });
  updateHandle();
}
