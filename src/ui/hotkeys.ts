// A small keyboard button in the corner of the 3D view. It opens a card of the shortcuts for moving the
// view and the guide, drawn as keys, so they can be found without opening About. ? opens it too.

const KEYBOARD_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg>';

const keys = (...names: string[]) => names.map((name) => `<kbd>${name}</kbd>`).join("");
const or = '<span class="hotkeys-or">or</span>';
const mouse = (text: string) => `<span class="hotkeys-mouse">${text}</span>`;

/** Text fields and editable text keep "?" for typing. */
const typing = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]") != null;

export function setupHotkeys(stage: HTMLElement, searchKeys: string[]) {
  const rows: [string, string][] = [
    ["Turn the view", `${mouse("Drag")}${or}${keys("←", "→", "↑", "↓")}`],
    ["Move the view", `${keys("Shift")}${mouse("+ drag")}${or}${mouse("+ arrows")}`],
    ["Zoom", `${mouse("Scroll")}${or}${keys("+", "−")}`],
    ["Previous or next step", keys("←", "→")],
    ["Play or pause", keys("Space")],
    ["Open a topic", `${keys("1")}<span class="hotkeys-or">to</span>${keys("6")}`],
    ["Search", keys(...searchKeys)],
    ["Show these shortcuts", keys("?")],
  ];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hotkeys-button";
  button.setAttribute("aria-label", "Keyboard shortcuts");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "hotkeys-card");
  button.innerHTML = KEYBOARD_ICON;
  const card = document.createElement("section");
  card.className = "hotkeys-card";
  card.id = "hotkeys-card";
  card.setAttribute("aria-label", "Keyboard shortcuts");
  card.hidden = true;
  card.innerHTML = `<h2>Shortcuts</h2><dl>${rows.map(([action, input]) => `<div><dt>${action}</dt><dd>${input}</dd></div>`).join("")}</dl>
    <p class="hotkeys-note">The arrow keys turn the view once it has focus: press Tab until it is outlined. Otherwise they change the step.</p>`;
  stage.append(button, card);

  function toggle(show = card.hidden) {
    card.hidden = !show;
    button.setAttribute("aria-expanded", String(show));
  }
  button.addEventListener("click", () => toggle());
  // Escape or a press anywhere else closes it.
  document.addEventListener("pointerdown", (event) => {
    if (!card.hidden && !card.contains(event.target as Node) && !button.contains(event.target as Node)) toggle(false);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !card.hidden) {
      toggle(false);
      button.focus({ preventScroll: true });
    } else if (event.key === "?" && !event.metaKey && !event.ctrlKey && !typing(event.target) && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      toggle();
    }
  });
  return { toggle };
}
