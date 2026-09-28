// About dialog: fixed tabs over one scrolling panel.
import type { AgentControl } from "../agent/control";
import { pathways } from "../content/pathways";
import { guideSources } from "../content/region-guides";
import { about, codeNotes, overview } from "../content/site";
import { sources } from "../content/sources";
import type { AboutTab } from "../model/refs";
import { byId, escapeHtml, externalLink, nextTabIndex, richText } from "./dom";
import { externalIcon } from "./icons";

const MIT_LICENSE = `The MIT License

Copyright © 2026 Isaac Mason (math)
Copyright © 2010-2026 three.js authors (Three.js)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`;

const paragraphs = (items: string[]) => items.map((p) => `<p>${richText(p)}</p>`).join("");
const sourceItem = (title: string, url: string, note = "") =>
  `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>${note ? `<span>${escapeHtml(note)}</span>` : ""}</li>`;
const credit = (title: string, url: string, attribution: string, links: string) =>
  `<article class="credit-item"><h4><a href="${url}" target="_blank" rel="noopener noreferrer">${title}${externalIcon}</a></h4><p>${attribution}</p><div class="credit-links">${links}</div></article>`;

const CONTROLS: [action: string, input: string][] = [
  ["Rotate", "Drag"],
  ["Pan", "Shift + drag"],
  ["Zoom", "Scroll or pinch"],
  ["Open a region", "Click a label"],
  ["Preview a region", "Hover its name in the panel"],
  ["Previous / next step", "<kbd>←</kbd><kbd>→</kbd>"],
  ["Pause animation", "<kbd>Space</kbd>"],
  ["Switch topic", "<kbd>1</kbd>–<kbd>6</kbd>"],
];

/** The kill switch (spec §12). Assistants can always read the guide; this decides whether they can change what you see. */
function assistantsSection(control: AgentControl) {
  return `<h3>Assistants</h3>
    <p>In browsers that offer site tools (WebMCP), such as the ChatGPT desktop app, an assistant can read this guide. When this switch is on, it can also open topics, steps and regions and play walkthroughs. Its actions appear next to an “Assistant” label at the top left of the 3D view.</p>
    <button class="agent-switch" id="agent-control" role="switch" aria-checked="${control.on}"><span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>Let assistants control this guide</button>`;
}

function aboutTab(control?: AgentControl) {
  const sections = about.sections.map((section) => `<h3>${escapeHtml(section.title)}</h3>${paragraphs(section.paragraphs)}`).join("");
  const controls = CONTROLS.map(([action, input]) => `<div><dt>${action}</dt><dd>${input}</dd></div>`).join("");
  return `${sections}<h3>Controls</h3><dl class="help-controls">${controls}</dl>${control ? assistantsSection(control) : ""}`;
}

function papersTab() {
  const listed = new Set<string>();
  const groups = pathways
    .map((path) => {
      const items = path.sourceIds
        .map((id) => sources.find((source) => source.id === id))
        .filter((source) => source !== undefined)
        .map((source) => {
          listed.add(source.url);
          return sourceItem(source.title, source.url, `${source.author} — ${source.note}`);
        })
        .join("");
      return `<h3>${escapeHtml(path.title)}</h3><ul class="source-list">${items}</ul>`;
    })
    .join("");
  const regionOnly = guideSources
    .filter((source) => !listed.has(source.url))
    .map((source) => sourceItem(source.title, source.url))
    .join("");
  return `<p>Papers, reviews and textbook chapters used for this review, grouped by topic. Each citation was checked against its DOI or PubMed record in September 2026.</p>${groups}<h3>Region details</h3><ul class="source-list">${regionOnly}</ul>`;
}

function codeTab() {
  const libraries = [
    credit(
      "math · pmndrs",
      "https://github.com/pmndrs/math",
      "© 2026 Isaac Mason · math 0.1.0",
      externalLink("MIT license", "https://github.com/pmndrs/math/blob/main/LICENSE"),
    ),
    credit(
      "Three.js",
      "https://threejs.org/",
      "© 2010–2026 three.js authors · Three.js 0.186.1",
      externalLink("MIT license", "https://github.com/mrdoob/three.js/blob/dev/LICENSE"),
    ),
  ].join("");
  return `<h3>How it is built</h3>${paragraphs(codeNotes.build)}
    <h3>How the animation works</h3><ul class="plain">${codeNotes.animation.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
    <h3>Libraries</h3>${libraries}
    <details class="credit-license"><summary>Software license notices</summary><pre>${escapeHtml(MIT_LICENSE)}</pre></details>`;
}

function modelsTab() {
  const models = [
    credit(
      "Z-Anatomy",
      "https://github.com/Z-Anatomy/Models-of-human-anatomy",
      "Gauthier Kervyn and contributors. FBX distribution: Lluís Vinent Juanico. Original BodyParts3D model: Kousaku Okubo; Blender add-on: Marcin Zielinski; Unity development: Lluís Vinent.",
      externalLink("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/") +
        externalLink("FBX models", "https://github.com/LluisV/Z-Anatomy/tree/PC-Version/Resources/Models/FBX"),
    ),
    credit(
      "BodyParts3D",
      "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/",
      "© The Database Center for Life Science. The Z-Anatomy adaptations keep their derivative license.",
      externalLink("Source license", "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html"),
    ),
    credit(
      "Anatomy of the Inner Ear",
      "https://github.com/Z-Anatomy/Models-of-human-anatomy#attributions",
      "University of Dundee School of Medicine. The cochlea meshes keep the upstream non-commercial share-alike license.",
      externalLink("CC BY-NC-SA 4.0", "https://creativecommons.org/licenses/by-nc-sa/4.0/"),
    ),
  ].join("");
  return `<h3>About the 3D model</h3>${paragraphs(overview.modelNotes)}
    <h3>Anatomy models</h3>${models}
    <article class="credit-item"><h4>Additional upstream credits</h4><p>Brainder / University of Washington; cranial nerves and foramina: University of Dundee, CAHID (CC BY 4.0).</p><div class="credit-links">${externalLink("Z-Anatomy attributions", "https://github.com/Z-Anatomy/Models-of-human-anatomy#attributions")}</div></article>
    <article class="credit-item"><h4>Changes made to the atlas</h4><p>Selected parts; one shared transform and uniform scale; quantized coordinates; surfaces sampled as particles; adjusted colours and opacity; added markers for functional areas and small nuclei, and illustrative route curves.</p></article>`;
}

export function setupAbout(control?: AgentControl) {
  const dialog = byId<HTMLDialogElement>("info-dialog");
  const panel = byId("about-panel");
  const tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>(".about-tab"));
  const panels: Record<AboutTab, () => string> = { about: () => aboutTab(control), papers: papersTab, code: codeTab, models: modelsTab };
  let returnFocus: HTMLElement | null = null;
  let shownTab: AboutTab = "about";

  function select(tab: AboutTab, focus = false) {
    shownTab = tab;
    for (const button of tabs) {
      const active = button.dataset.about === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active) {
        panel.setAttribute("aria-labelledby", button.id);
        if (focus) button.focus();
      }
    }
    panel.innerHTML = panels[tab]();
    panel.scrollTop = 0;
  }

  function open(tab: AboutTab = "about") {
    if (!dialog.open) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    select(tab);
    if (!dialog.open) dialog.showModal();
    tabs.find((button) => button.dataset.about === tab)?.focus({ preventScroll: true });
  }

  dialog.querySelector(".about-tabs")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".about-tab");
    if (button) select(button.dataset.about as AboutTab);
  });
  dialog.querySelector(".about-tabs")?.addEventListener("keydown", (event) => {
    const e = event as KeyboardEvent;
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = index < 0 ? null : nextTabIndex(e.key, index, tabs.length);
    if (next === null) return;
    e.preventDefault();
    select(tabs[next].dataset.about as AboutTab, true);
  });
  byId("dialog-close").addEventListener("click", () => dialog.close());
  panel.addEventListener("click", (event) => {
    const toggle = (event.target as HTMLElement).closest<HTMLButtonElement>("#agent-control");
    if (!toggle || !control) return;
    control.set(!control.on);
    toggle.setAttribute("aria-checked", String(control.on));
  });
  dialog.addEventListener("close", () => returnFocus?.focus());
  // Clicking the backdrop closes the dialog.
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) dialog.close();
  });

  return {
    open,
    close: () => dialog.close(),
    isOpen: () => dialog.open,
    /** The open tab, or null while the dialog is closed. */
    tab: () => (dialog.open ? shownTab : null),
  };
}
