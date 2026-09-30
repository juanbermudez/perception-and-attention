// The command palette: ⌘K (Ctrl+K), / or the search button in the rail. Fuzzy search over every topic,
// step, region and paper. Its layout follows beUI's command palette (beui.dev), drawn with this guide's
// tokens: a blurred backdrop, one card with the search field, results grouped by kind, a highlight that
// slides to the active row, and a footer of keys. It opens at once, since it is launched to be typed
// into, and fades out on close (interface-design motion guidance). Focus stays in the field; the arrow
// keys move the active row (aria-activedescendant).
import { fuzzySearch, prepare } from "../model/fuzzy";
import { GROUP_LIMITS, type PaletteGroup, type PaletteItem, paletteItems } from "../model/palette";
import type { Place } from "../model/refs";
import { closeDialog, escapeHtml } from "./dom";

const GROUP_ORDER: PaletteGroup[] = ["Topics", "Regions", "Steps", "Papers"];
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>';

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** The keys that open the palette, as shown to the user. */
export const paletteKeys = () => (isMac() ? ["⌘", "K"] : ["Ctrl", "K"]);

/** Text fields and editable text keep "/" for typing. */
const typing = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]") != null;

export function createCommandPalette({ go, trigger }: { go: (place: Place) => void; trigger: HTMLElement }) {
  const items = paletteItems();
  const index = prepare(items);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  const dialog = document.createElement("dialog");
  dialog.className = "palette";
  dialog.setAttribute("aria-label", "Search the guide");
  dialog.innerHTML = `<div class="palette-card">
    <label class="palette-search">${SEARCH_ICON}<span class="sr-only">Search the guide</span><input id="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Search topics, steps, regions and papers"><kbd aria-hidden="true">Esc</kbd></label>
    <div class="palette-results"><span class="palette-highlight" aria-hidden="true" hidden></span><div id="palette-list" role="listbox" aria-label="Results"></div></div>
    <footer class="palette-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>move</span><span><kbd>↵</kbd>open</span><span><kbd>Esc</kbd>close</span></footer>
  </div>`;
  document.body.append(dialog);
  const input = dialog.querySelector<HTMLInputElement>("#palette-input")!;
  const list = dialog.querySelector<HTMLElement>("#palette-list")!;
  const results = dialog.querySelector<HTMLElement>(".palette-results")!;
  const highlight = dialog.querySelector<HTMLElement>(".palette-highlight")!;
  let shown: PaletteItem[] = [];
  let active = 0;

  /** With no query, the six topics; otherwise each kind's best few, the kind with the best match first. */
  function resultsFor(query: string): PaletteItem[] {
    if (!query.trim()) return items.filter((item) => item.group === "Topics");
    const groups = new Map<PaletteGroup, { best: number; items: PaletteItem[] }>();
    for (const { entry, score } of fuzzySearch(index, query, 400)) {
      const group = groups.get(entry.group) ?? { best: score, items: [] };
      if (group.items.length < GROUP_LIMITS[entry.group]) group.items.push(entry);
      groups.set(entry.group, group);
    }
    return [...groups.entries()]
      .sort(([a, first], [b, second]) => second.best - first.best || GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b))
      .flatMap(([, group]) => group.items);
  }

  function optionHtml(item: PaletteItem, i: number) {
    const dot = `<i class="palette-dot"${item.color ? ` style="--dot:${item.color}"` : ""}></i>`;
    const body = `${dot}<span class="palette-label">${escapeHtml(item.label)}</span>${item.detail ? `<span class="palette-detail">${escapeHtml(item.detail)}</span>` : ""}${item.url ? '<span class="palette-out" aria-hidden="true">↗</span>' : ""}`;
    const attributes = `class="palette-item" id="palette-option-${i}" role="option" aria-selected="false" data-index="${i}"`;
    // Papers are real links, so they open in a new tab wherever the guide runs.
    return item.url
      ? `<a ${attributes} href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" tabindex="-1">${body}</a>`
      : `<div ${attributes}>${body}</div>`;
  }

  function render() {
    const query = input.value;
    shown = resultsFor(query);
    if (!shown.length) {
      list.innerHTML = `<p class="palette-empty">No matches for “${escapeHtml(query.trim())}”. Try fewer or different words.</p>`;
      highlight.hidden = true;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    let html = "",
      group = "",
      open = false;
    shown.forEach((item, i) => {
      if (item.group !== group) {
        if (open) html += "</div>";
        group = item.group;
        html += `<div role="group" aria-labelledby="palette-group-${i}"><div class="palette-group" id="palette-group-${i}">${group}</div>`;
        open = true;
      }
      html += optionHtml(item, i);
    });
    list.innerHTML = `${html}</div>`;
    results.scrollTop = 0;
    setActive(0, false);
  }

  /** Mark a row active and move the highlight to it: a short slide, or none on a new list. */
  function setActive(i: number, slide = true) {
    if (!shown.length) return;
    active = (i + shown.length) % shown.length;
    list.querySelector('[aria-selected="true"]')?.setAttribute("aria-selected", "false");
    const option = list.querySelector<HTMLElement>(`#palette-option-${active}`);
    if (!option) return;
    option.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", option.id);
    highlight.hidden = false;
    highlight.classList.toggle("instant", !slide || reduced.matches);
    highlight.style.transform = `translateY(${option.offsetTop}px)`;
    highlight.style.height = `${option.offsetHeight}px`;
    option.scrollIntoView({ block: "nearest" });
  }

  function choose(i: number) {
    const item = shown[i];
    if (!item) return;
    if (item.url) list.querySelector<HTMLAnchorElement>(`#palette-option-${i}`)?.click();
    close();
    if (item.place) go(item.place);
  }

  function open() {
    if (dialog.open) {
      input.select();
      return;
    }
    // Not over another modal, such as About.
    if (document.querySelector("dialog[open]")) return;
    dialog.classList.remove("closing");
    input.value = "";
    render();
    dialog.showModal();
    input.focus();
    trigger.setAttribute("aria-expanded", "true");
  }

  function close() {
    if (!dialog.open) return;
    trigger.setAttribute("aria-expanded", "false");
    closeDialog(dialog);
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(active + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    }
  });
  // The pointer moves the highlight only when it moves, so a list scrolling under a still mouse keeps its row.
  list.addEventListener("pointermove", (event) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>(".palette-item");
    if (option && Number(option.dataset.index) !== active) setActive(Number(option.dataset.index));
  });
  list.addEventListener("click", (event) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>(".palette-item");
    if (!option) return;
    const i = Number(option.dataset.index);
    // A paper's link opens itself; everything else is a place in the guide.
    if (shown[i]?.url) close();
    else choose(i);
  });
  // Escape fades it out too, when the browser lets the page handle it (after a user gesture).
  dialog.addEventListener("cancel", (event) => {
    if (!event.cancelable) return;
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  trigger.addEventListener("click", open);
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (dialog.open) close();
      else open();
    } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !typing(event.target) && !dialog.open) {
      event.preventDefault();
      open();
    }
  });

  return { open, close, isOpen: () => dialog.open };
}
