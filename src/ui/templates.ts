// HTML builders for the side panel and the rail. Pure functions of content and state.
import { pathways } from "../content/pathways";
import { guideSources, regionGuides } from "../content/region-guides";
import { regions } from "../content/regions";
import { overview } from "../content/site";
import { sources } from "../content/sources";
import type { Pathway, RegionId } from "../content/types";
import { type AttentionSettings, MAX_ATTENTION_GAIN, NORMALIZATION_SIGMA, sensoryStreams, streamResponses } from "../model/attention";
import { topicRegions } from "../model/topics";
import { escapeHtml, linkedText } from "./dom";
import { arrowIcon, chevronIcon, topicIcon } from "./icons";

const sourceLink = (title: string, url: string, note = "") =>
  `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>${note ? `<span>${escapeHtml(note)}</span>` : ""}</li>`;

/** The rail's topic buttons: icons only, named for assistive tech and shown as a tooltip on hover or focus. */
export function railButtonsHtml() {
  return pathways
    .map(
      (path) =>
        `<button class="rail-button pathway-button" data-path="${path.id}" style="--path-color:${path.color}" aria-pressed="false" aria-label="${escapeHtml(path.title)}" data-tip="${escapeHtml(path.title)}">${topicIcon(path.icon)}</button>`,
    )
    .join("");
}

/**
 * The overview. Its title and topic rows sit on the rail's rhythm, so each row lines up with its icon in the
 * rail (which is why the rows carry no icons of their own); the introduction follows the list.
 */
export function introHtml() {
  const topics = pathways
    .map(
      (path, i) =>
        `<li><button class="journey" data-path="${path.id}" style="--path-color:${path.color}"><span class="journey-text"><b>${i + 1}. ${escapeHtml(path.title)}</b><span>${escapeHtml(path.subtitle)}</span></span>${chevronIcon("journey-arrow")}</button></li>`,
    )
    .join("");
  return `<div class="intro">
    <h2 class="intro-title" id="intro-title">${escapeHtml(overview.title)}</h2>
    <ol class="journey-list" aria-label="Topics">${topics}</ol>
    <div class="intro-lede-block">${overview.lede.map((p) => `<p class="intro-lede">${linkedText(p)}</p>`).join("")}</div>
  </div>`;
}

export function stepsHtml(path: Pathway) {
  return path.steps
    .map((step, i) => {
      const fact = step.fact ? `<p class="step-fact"><b>Key fact</b>${linkedText(step.fact)}</p>` : "";
      return `<li class="path-step">
        <h3><button class="step-toggle" id="step-toggle-${i}" data-step="${i}" aria-expanded="false" aria-controls="step-body-${i}"><span class="step-number">${i + 1}</span><span>${escapeHtml(step.title)}</span></button></h3>
        <div class="step-body" id="step-body-${i}" role="region" aria-labelledby="step-toggle-${i}" aria-hidden="true" inert><div class="step-body-inner"><div class="step-copy">
          <p>${linkedText(step.body)}</p>${fact}
          <button class="step-region-link" data-open-region="${step.region}">More about ${escapeHtml(regions[step.region].name)} ${arrowIcon}</button>
        </div></div></div>
      </li>`;
    })
    .join("");
}

export function stepDotsHtml(path: Pathway) {
  return path.steps
    .map(
      (step, i) =>
        `<button class="step-dot" data-step="${i}" aria-label="Step ${i + 1}: ${escapeHtml(step.title)}" title="${i + 1}. ${escapeHtml(step.title)}"></button>`,
    )
    .join("");
}

export function pathAfterHtml(path: Pathway) {
  const refs = path.sourceIds
    .map((id) => sources.find((source) => source.id === id))
    .filter((source) => source !== undefined)
    .map((source) => sourceLink(source.title, source.url, `${source.author} — ${source.note}`))
    .join("");
  return `<section class="big-picture"><h3>Summary</h3><p>${linkedText(path.insight)}</p></section>
    <details class="after-block"><summary>Anatomical accuracy</summary><p>${linkedText(path.caveat)}</p></details>
    <details class="after-block"><summary>Sources</summary><ul class="source-list">${refs}</ul></details>`;
}

export function regionListHtml(path: Pathway, selected: RegionId) {
  const row = (id: RegionId) =>
    `<li><button class="region-row${id === selected ? " current" : ""}" data-open-region="${id}"><span class="region-row-name">${escapeHtml(regions[id].label)}</span><span class="region-row-text">${escapeHtml(stripLinks(regionGuides[id].summary))}</span></button></li>`;
  const { inSteps, onRoutes } = topicRegions(path);
  const others = onRoutes.length ? `<h3 class="region-list-heading">Also shown</h3><ul class="region-list">${onRoutes.map(row).join("")}</ul>` : "";
  return `<p class="panel-lede">Regions in this topic. Select one to open its page.</p><ul class="region-list">${inSteps.map(row).join("")}</ul>${others}`;
}

const stripLinks = (text: string) => text.replace(/\[\[[a-zA-Z0-9]+\|([^\]]+)\]\]/g, "$1");

/** A region's page in the panel. The panel's header carries its name, where it is, and the way back. */
export function regionHtml(id: RegionId, path: Pathway) {
  const guide = regionGuides[id];
  const role = guide.roles[path.id];
  // data-section matches the ref sections (region:v1#mechanism), so `go` can scroll to one.
  const section = (key: string, title: string, body: string) =>
    `<section class="drawer-section" data-section="${key}"><h4>${title}</h4><p>${linkedText(body)}</p></section>`;
  const refs = guide.sourceIds
    .map((sourceId) => guideSources.find((source) => source.id === sourceId))
    .filter((source) => source !== undefined)
    .map((source) => sourceLink(source.title, source.url))
    .join("");
  return `<p class="drawer-intro" data-section="summary">${linkedText(guide.summary)}</p>
    ${section("mechanism", "How it works", guide.mechanism)}
    ${role ? section("role", `In ${escapeHtml(path.title.toLowerCase())}`, role) : ""}
    ${section("connections", "Connections", guide.connections)}
    ${section("limit", "Anatomical accuracy", guide.limit)}
    ${refs ? `<section class="drawer-section" data-section="sources"><h4>Sources</h4><ul class="source-list">${refs}</ul></section>` : ""}`;
}

export function streamRowsHtml() {
  return sensoryStreams
    .map(
      (stream) =>
        `<div class="sensory-row" style="--stream-color:${stream.color}"><button class="layer-button" data-sense="${stream.id}" aria-pressed="true"><i class="stream-dot"></i>${stream.name}</button><button class="stream-action" data-only="${stream.id}" aria-label="Show only the ${stream.name.toLowerCase()} stream">Only</button><button class="stream-action" data-study="${stream.id}" aria-label="Open the ${stream.name.toLowerCase()} topic">Topic ${arrowIcon}</button></div>`,
    )
    .join("");
}

export function priorityButtonsHtml() {
  return [{ id: "balanced", name: "None" }, ...sensoryStreams]
    .map((item) => `<button data-priority="${item.id}" aria-pressed="${item.id === "balanced"}">${item.name}</button>`)
    .join("");
}

export function normalizationHtml(settings: AttentionSettings) {
  const responses = streamResponses(settings);
  const maxResponse = MAX_ATTENTION_GAIN / (NORMALIZATION_SIGMA + MAX_ATTENTION_GAIN);
  const rows = sensoryStreams
    .map(
      (stream) =>
        `<div class="norm-row" style="--stream-color:${stream.color}"><span>${stream.name}</span><div class="norm-track"><div class="norm-fill" style="width:${((responses[stream.id] / maxResponse) * 100).toFixed(1)}%"></div></div><output>${responses[stream.id].toFixed(2)}</output></div>`,
    )
    .join("");
  return `${rows}<figcaption><code>R = A·E / (σ + Σ A·E)</code>Each stream’s response (R) is its input (E) multiplied by its attention gain (A), divided by a constant (σ) plus the sum of A·E over all streams, its own included. Increasing one stream’s gain increases the total, so the other streams’ responses go down, but not to zero. The equation comes from the normalization model of attention (Reynolds &amp; Heeger, 2009), which describes competition between stimuli within visual cortex, where the total is weighted by distance in space and feature. Using it across senses is an illustration: attending to one sense does increase activity in its sensory cortex and reduce it in the others, but it is not established that normalization causes this. Illustrative values, σ = ${NORMALIZATION_SIGMA}.</figcaption>`;
}
