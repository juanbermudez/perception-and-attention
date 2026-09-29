// Tooltips for the rail's icon buttons. The rail scrolls on short windows, which would clip a tooltip drawn
// inside it, so one fixed element is placed beside whichever button is pointed at or reached with Tab.
// The buttons carry their own aria-label; the tooltip is only for sighted users.

export function setupRailTips(rail: HTMLElement) {
  const tip = document.createElement("div");
  tip.className = "rail-tip";
  tip.hidden = true;
  tip.setAttribute("aria-hidden", "true");
  document.body.append(tip);

  function show(button: HTMLElement) {
    const rect = button.getBoundingClientRect();
    tip.textContent = button.dataset.tip ?? "";
    tip.style.left = `${Math.round(rect.right + 10)}px`;
    tip.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    tip.hidden = false;
  }
  const hide = () => {
    tip.hidden = true;
  };
  const tipTarget = (node: EventTarget | null) => (node as HTMLElement | null)?.closest?.<HTMLElement>("[data-tip]") ?? null;

  rail.addEventListener("pointerover", (event) => {
    const button = tipTarget(event.target);
    if (button && event.pointerType === "mouse") show(button);
  });
  rail.addEventListener("pointerout", (event) => {
    const button = tipTarget(event.target);
    if (button && !button.contains(event.relatedTarget as Node | null)) hide();
  });
  rail.addEventListener("focusin", (event) => {
    const button = tipTarget(event.target);
    if (button?.matches(":focus-visible")) show(button);
  });
  rail.addEventListener("focusout", hide);
  rail.addEventListener("scroll", hide, { passive: true });
  rail.addEventListener("click", hide);
  return { tip, hide };
}
