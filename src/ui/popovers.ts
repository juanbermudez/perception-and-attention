// Settings and Info are native popovers, placed below their dock buttons.
import { byId } from "./dom";

export function setupPopovers() {
  const pairs = [
    { popover: byId("view-options"), button: byId("options-button") },
    { popover: byId("view-help"), button: byId("help-button") },
  ];

  function place(popover: HTMLElement, anchorButton: HTMLElement) {
    const anchor = anchorButton.getBoundingClientRect();
    const rect = popover.getBoundingClientRect();
    const width = rect.width || Number.parseFloat(getComputedStyle(popover).width);
    const height = rect.height || 360;
    popover.style.left = `${Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))}px`;
    // The dock sits at the top of the stage, so popovers open downward.
    popover.style.top = `${Math.max(8, Math.min(anchor.bottom + 10, window.innerHeight - height - 8))}px`;
  }

  function placeOpen() {
    for (const { popover, button } of pairs) if (popover.matches(":popover-open")) place(popover, button);
  }

  function hideAll() {
    for (const { popover } of pairs) if (popover.matches(":popover-open")) popover.hidePopover();
  }

  for (const { popover, button } of pairs) {
    popover.addEventListener("beforetoggle", (event) => {
      if ((event as ToggleEvent).newState === "open") place(popover, button);
    });
    popover.addEventListener("toggle", () => {
      const open = popover.matches(":popover-open");
      button.setAttribute("aria-expanded", String(open));
      if (open) place(popover, button);
    });
  }
  window.addEventListener("resize", placeOpen);

  return { placeOpen, hideAll };
}
