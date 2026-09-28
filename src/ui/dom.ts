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
/** A short status line over the stage. With an action (for example Undo) it stays longer and takes clicks. */
export function toast(message: string, action?: { label: string; run: () => void }) {
  const node = byId("toast");
  node.textContent = message;
  const hide = () => node.classList.remove("visible", "actionable");
  if (action) {
    const button = document.createElement("button");
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      hide();
      action.run();
    });
    node.append(" ", button);
  }
  node.classList.toggle("actionable", Boolean(action));
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 6000 : 3400);
}

/** Arrow keys, Home and End move between the buttons of a tab list. */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  return null;
}
