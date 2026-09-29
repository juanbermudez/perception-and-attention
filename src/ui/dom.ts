import { regions } from "../content/regions";
import type { RegionId } from "../content/types";

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: #${id}`);
  return node as T;
}

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => entities[char]);
}

export function externalLink(label: string, url: string) {
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

/** Escaped text where [[regionId|label]] becomes a button that focuses that region. */
export function linkedText(text: string) {
  let html = "";
  let offset = 0;
  for (const match of text.matchAll(/\[\[([a-zA-Z0-9]+)\|([^\]]+)\]\]/g)) {
    html += escapeHtml(text.slice(offset, match.index));
    const id = match[1] as RegionId;
    html +=
      id in regions
        ? `<button class="region-mention" data-region="${id}" aria-label="Show ${escapeHtml(regions[id].label)}">${escapeHtml(match[2])}</button>`
        : escapeHtml(match[0]);
    offset = (match.index ?? 0) + match[0].length;
  }
  return html + escapeHtml(text.slice(offset));
}

/** Escaped text where [label](https://…) becomes an external link. */
export function richText(text: string) {
  return escapeHtml(text).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label: string, url: string) => externalLink(label, url));
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastDelay = 0;
/** While the pointer or keyboard focus is on the toast, it stays up; it hides a full delay after both leave. */
const toastHeld = { pointer: false, focus: false };
/** Where keyboard focus goes back to when the toast's action goes away while it has focus. */
let toastReturn: HTMLElement | null = null;
const toastsWired = new WeakSet<HTMLElement>();

function armToast(node: HTMLElement) {
  clearTimeout(toastTimer);
  toastTimer = undefined;
  if (!toastHeld.pointer && !toastHeld.focus && node.classList.contains("visible")) toastTimer = setTimeout(() => hideToast(node), toastDelay);
}

/** Remove the action button, so a faded toast leaves nothing clickable or focusable behind. */
function removeToastAction(node: HTMLElement) {
  const button = node.querySelector(".toast-action");
  if (!button) return;
  const hadFocus = button.contains(document.activeElement);
  button.remove();
  toastHeld.focus = false;
  if (hadFocus) toastReturn?.focus({ preventScroll: true });
}

function hideToast(node: HTMLElement) {
  clearTimeout(toastTimer);
  toastTimer = undefined;
  node.classList.remove("visible", "actionable");
  toastHeld.pointer = false;
  removeToastAction(node);
}

function wireToast(node: HTMLElement) {
  if (toastsWired.has(node)) return;
  toastsWired.add(node);
  const hold = (key: keyof typeof toastHeld, on: boolean) => {
    toastHeld[key] = on;
    armToast(node);
  };
  node.addEventListener("pointerenter", () => hold("pointer", true));
  node.addEventListener("pointerleave", () => hold("pointer", false));
  node.addEventListener("focusin", (event) => {
    if (!toastHeld.focus) toastReturn = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    hold("focus", true);
  });
  node.addEventListener("focusout", (event) => {
    if (!node.contains(event.relatedTarget as Node | null)) hold("focus", false);
  });
}

/** A short status line over the stage. With an action (for example Undo) it stays longer and takes clicks. */
export function toast(message: string, action?: { label: string; run: () => void }) {
  const node = byId("toast");
  wireToast(node);
  removeToastAction(node);
  node.textContent = message;
  // A plain toast takes no pointer events, so the pointer cannot be holding it.
  toastHeld.pointer &&= Boolean(action);
  if (action) {
    const button = document.createElement("button");
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      hideToast(node);
      action.run();
    });
    node.append(" ", button);
  }
  node.classList.toggle("actionable", Boolean(action));
  node.classList.add("visible");
  toastDelay = action ? 6000 : 3400;
  armToast(node);
}

/** Arrow keys, Home and End move between the buttons of a tab list. */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  return null;
}
