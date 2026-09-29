// One address format for every tool (spec §5.1): parse, format and resolve refs, suggest
// close matches for unknown ones, and map UI places to refs and URL hashes.
// Every id list is derived from content, so new regions, steps and topics need no code change.
import { pathways } from "../content/pathways";
import { guideSources, regionGuides } from "../content/region-guides";
import { regions } from "../content/regions";
import { sources } from "../content/sources";
import type { PathId, RegionId } from "../content/types";
import { createSearchIndex, editDistance, type SearchDoc, type SearchIndex } from "./search";

export const ABOUT_TABS = ["about", "papers", "code", "models"] as const;
export type AboutTab = (typeof ABOUT_TABS)[number];
export const REGION_SECTIONS = ["summary", "mechanism", "role", "connections", "limit", "sources"] as const;
export type RegionSection = (typeof REGION_SECTIONS)[number];

export const REGION_IDS = Object.keys(regions) as RegionId[];
export const TOPIC_IDS = pathways.map((path) => path.id);
/** Hash segments that follow a topic and are not step keys. */
export const RESERVED_STEP_KEYS = ["region", "regions", "streams"];

export type Ref =
  | { kind: "guide" }
  | { kind: "overview" }
  | { kind: "about"; tab: AboutTab }
  | { kind: "topic"; path: PathId }
  | { kind: "streams" }
  /** `index` is 0-based; refs show it 1-based. */
  | { kind: "step"; path: PathId; index: number }
  | { kind: "region"; id: RegionId; section?: RegionSection }
  | { kind: "source"; id: string }
  | { kind: "docs" }
  | { kind: "doc" | "quiz" | "block"; id: string }
  | { kind: "help" };

export interface RefFailure {
  error: { code: "unknown_ref" | "bad_input"; message: string; options?: string[] };
}
export type RefResult = { ref: Ref } | RefFailure;

const MAX_SUGGESTIONS = 5;
const ARTIFACT_ID = /^[a-z0-9]{1,16}$/i;
const byLower = <T extends string>(ids: readonly T[]) => new Map(ids.map((id) => [id.toLowerCase(), id]));
const regionByLower = byLower(REGION_IDS);
const topicByLower = byLower(TOPIC_IDS);
const topic = (id: PathId) => pathways.find((path) => path.id === id)!;

/* ---------- Formatting ---------- */

export const topicRef = (path: PathId) => `topic:${path}`;
export const regionRef = (id: RegionId) => `region:${id}`;
/** The stable form, `step:<topic>/<key>`: always use this for anything stored. */
export const stepRef = (path: PathId, index: number) => `step:${path}/${topic(path).steps[index].key}`;
export const STREAMS_REF = "topic:attention/streams";

export function formatRef(ref: Ref): string {
  switch (ref.kind) {
    case "guide":
    case "overview":
    case "docs":
    case "help":
      return ref.kind;
    case "about":
      return ref.tab === "about" ? "about" : `about/${ref.tab}`;
    case "topic":
      return topicRef(ref.path);
    case "streams":
      return STREAMS_REF;
    case "step":
      return stepRef(ref.path, ref.index);
    case "region":
      return ref.section ? `${regionRef(ref.id)}#${ref.section}` : regionRef(ref.id);
    default:
      return `${ref.kind}:${ref.id}`;
  }
}

/* ---------- Guide text ---------- */

const REGION_LINK = /\[\[([a-zA-Z0-9]+)\|([^\]]+)\]\]/g;
/** Guide text for agents: `[[v1|primary visual cortex]]` becomes `[primary visual cortex](region:v1)`. */
export function markdownLinks(text: string): string {
  return text.replace(REGION_LINK, (_, id: string, label: string) => (id in regions ? `[${label}](${regionRef(id as RegionId)})` : label));
}
/** Guide text with region links reduced to their visible words. */
export function plainText(text: string): string {
  return text.replace(REGION_LINK, "$2");
}

/* ---------- Resolving ---------- */

const unknown = (message: string, options: string[] = []): RefFailure => ({
  error: { code: "unknown_ref", message, ...(options.length ? { options: options.slice(0, MAX_SUGGESTIONS) } : {}) },
});

/** Parse and check a ref against content. Case-insensitive. Unknown refs come back with up to 5 suggestions. */
export function resolveRef(input: string): RefResult {
  const text = input.trim();
  const lower = text.toLowerCase();
  if (lower === "guide" || lower === "overview" || lower === "help" || lower === "docs") return { ref: { kind: lower } };
  if (lower === "about" || lower.startsWith("about/")) {
    const tab = lower === "about" ? "about" : lower.slice(6);
    if ((ABOUT_TABS as readonly string[]).includes(tab)) return { ref: { kind: "about", tab: tab as AboutTab } };
    return unknown(
      `No About tab "${tab}".`,
      ABOUT_TABS.map((t) => formatRef({ kind: "about", tab: t })),
    );
  }
  const colon = lower.indexOf(":");
  if (colon < 0) return unknown(`"${text}" is not a ref. Refs look like topic:vision, step:vision/2 or region:v1.`, suggest(text));
  const kind = lower.slice(0, colon);
  const rest = text.slice(colon + 1).trim();
  switch (kind) {
    case "topic":
      return resolveTopic(rest);
    case "step":
      return resolveStep(rest);
    case "region":
      return resolveRegion(rest);
    case "source":
      return resolveSource(rest);
    case "doc":
    case "quiz":
    case "block":
      if (ARTIFACT_ID.test(rest)) return { ref: { kind, id: rest.toLowerCase() } };
      return { error: { code: "bad_input", message: `${kind} ids are 1–16 letters or digits, for example ${kind}:k3f9.` } };
    default:
      return unknown(`Unknown ref kind "${kind}".`, ["topic:vision", "step:vision/1", "region:v1", "source:hubel-wiesel", "help"]);
  }
}

function resolveTopic(rest: string): RefResult {
  const lower = rest.toLowerCase();
  if (lower === "attention/streams") return { ref: { kind: "streams" } };
  const path = topicByLower.get(lower);
  if (path) return { ref: { kind: "topic", path } };
  return unknown(`No topic "${rest}". Topics: ${TOPIC_IDS.join(", ")}.`, suggest(rest, ["topic"]));
}

function resolveStep(rest: string): RefResult {
  const [pathPart, stepPart = "", ...extra] = rest.split("/").map((part) => part.trim());
  if (extra.length) return extraSegments(`step:${rest}`, `step:${pathPart}/${stepPart}`, "Step refs look like step:vision/2.");
  const path = topicByLower.get(pathPart.toLowerCase());
  if (!path) return unknown(`No topic "${pathPart}". Step refs look like step:vision/2 or step:vision/parallel-channels.`, suggest(pathPart, ["topic"]));
  const steps = topic(path).steps;
  const range = `${path} has ${steps.length} steps (1–${steps.length})`;
  if (/^\d+$/.test(stepPart)) {
    const n = Number(stepPart);
    if (n >= 1 && n <= steps.length) return { ref: { kind: "step", path, index: n - 1 } };
    return unknown(`No step ${n}: ${range}.`, [stepRef(path, n < 1 ? 0 : steps.length - 1)]);
  }
  const index = steps.findIndex((step) => step.key === stepPart.toLowerCase());
  if (index >= 0) return { ref: { kind: "step", path, index } };
  const close = steps
    .map((step, i) => ({ i, distance: editDistance(step.key, stepPart.toLowerCase()) }))
    .filter((entry) => entry.distance <= Math.max(2, stepPart.length / 3))
    .sort((a, b) => a.distance - b.distance)
    .map((entry) => stepRef(path, entry.i));
  const matches = suggestionIndex()
    .search(stepPart.replace(/-/g, " "), { kinds: ["step"], limit: 20 })
    .map((hit) => hit.ref)
    .filter((ref) => ref.startsWith(`step:${path}/`));
  return unknown(`No step "${stepPart}" in ${path}: ${range}, or use a step key.`, unique([...close, ...matches]));
}

function resolveRegion(rest: string): RefResult {
  const [idPart, sectionPart, ...extra] = rest.split("#").map((part) => part.trim());
  if (extra.length) return extraSegments(`region:${rest}`, `region:${idPart}#${sectionPart}`, "Region refs look like region:v1#mechanism.");
  const id = regionByLower.get(idPart.toLowerCase());
  if (!id) return unknown(`No region "${idPart}". read help lists every region id.`, suggest(idPart, ["region"]));
  if (sectionPart === undefined) return { ref: { kind: "region", id } };
  const section = sectionPart.toLowerCase() as RegionSection;
  if (REGION_SECTIONS.includes(section)) return { ref: { kind: "region", id, section } };
  return unknown(
    `No section "${sectionPart}". Sections: ${REGION_SECTIONS.join(", ")}.`,
    REGION_SECTIONS.map((s) => `${regionRef(id)}#${s}`),
  );
}

/** A typo such as step:vision/2/x must not quietly resolve to a different ref; name the ref without the extra part when it works. */
function extraSegments(text: string, head: string, example: string): RefFailure {
  const resolved = resolveRef(head);
  return unknown(`Extra segment in "${text}". ${example}`, "ref" in resolved ? [formatRef(resolved.ref)] : []);
}

const sourceIds = unique([...sources.map((source) => source.id), ...guideSources.map((source) => source.id)]);
const sourceByLower = byLower(sourceIds);
function resolveSource(rest: string): RefResult {
  const id = sourceByLower.get(rest.toLowerCase());
  if (id) return { ref: { kind: "source", id } };
  return unknown(`No source "${rest}".`, suggest(rest, ["source"]));
}

/* ---------- Suggestions ---------- */

let refIndex: SearchIndex | undefined;
/** Names, ids and keys of every guide ref, built on first use. */
function suggestionIndex(): SearchIndex {
  if (refIndex) return refIndex;
  const docs: SearchDoc[] = [];
  for (const path of pathways) {
    docs.push({ ref: topicRef(path.id), kind: "topic", title: path.title, fields: { title: `${path.id} ${path.title} ${path.short}`, body: path.subtitle } });
    path.steps.forEach((step, i) => {
      docs.push({ ref: stepRef(path.id, i), kind: "step", title: step.title, fields: { title: `${step.key.replace(/-/g, " ")} ${step.title}` } });
    });
  }
  for (const id of REGION_IDS) {
    const { label, short, name } = regions[id];
    docs.push({
      ref: regionRef(id),
      kind: "region",
      title: label,
      fields: { title: `${id} ${label} ${short} ${name}`, body: plainText(regionGuides[id].summary) },
    });
  }
  for (const source of [...sources, ...guideSources]) {
    if (docs.some((doc) => doc.ref === `source:${source.id}`)) continue;
    docs.push({ ref: `source:${source.id}`, kind: "source", title: source.title, fields: { title: `${source.id.replace(/-/g, " ")} ${source.title}` } });
  }
  refIndex = createSearchIndex(docs);
  return refIndex;
}

const idsByKind = (kind: string) => (kind === "topic" ? TOPIC_IDS : kind === "region" ? REGION_IDS : kind === "source" ? sourceIds : []);
const refFor = (kind: string, id: string) => `${kind}:${id}`;

/** Close ids first (edit distance), then name matches. */
export function suggest(query: string, kinds: string[] = ["topic", "region", "step", "source"]): string[] {
  const lower = query.trim().toLowerCase();
  if (!lower) return [];
  const close: { ref: string; distance: number }[] = [];
  for (const kind of kinds)
    for (const id of idsByKind(kind)) {
      const distance = editDistance(id.toLowerCase(), lower);
      if (distance === 0 || distance <= Math.min(2, Math.floor(id.length / 3))) close.push({ ref: refFor(kind, id), distance });
    }
  close.sort((a, b) => a.distance - b.distance);
  const named = suggestionIndex()
    .search(lower, { kinds, limit: MAX_SUGGESTIONS })
    .map((hit) => hit.ref);
  return unique([...close.map((entry) => entry.ref), ...named]).slice(0, MAX_SUGGESTIONS);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/* ---------- Places and the URL hash ---------- */

/** Where the user is in the panel. The hash and `get_context.at` are derived from it. */
export type Place =
  | { kind: "overview" }
  | { kind: "step"; path: PathId; index: number }
  | { kind: "regions"; path: PathId }
  /** `path` null: the current topic if it covers the region, else the first topic that does. */
  | { kind: "region"; path: PathId | null; id: RegionId }
  | { kind: "streams" };

export function placeRef(place: Place): Ref {
  switch (place.kind) {
    case "overview":
    case "streams":
      return { kind: place.kind };
    case "step":
      return { kind: "step", path: place.path, index: place.index };
    case "regions":
      return { kind: "topic", path: place.path };
    case "region":
      return { kind: "region", id: place.id };
  }
}

/** Where `go` takes the user for a ref, or null for refs without a place in the panel. */
export function refPlace(ref: Ref): Place | null {
  switch (ref.kind) {
    case "guide":
    case "overview":
      return { kind: "overview" };
    case "streams":
      return { kind: "streams" };
    case "topic":
      return { kind: "step", path: ref.path, index: 0 };
    case "step":
      return { kind: "step", path: ref.path, index: ref.index };
    case "region":
      return { kind: "region", path: null, id: ref.id };
    default:
      return null;
  }
}

/** `#/vision/parallel-channels`, `#/hearing/region/soc`, `#/vision/regions`, `#/attention/streams`; the overview has none. */
export function placeHash(place: Place): string {
  switch (place.kind) {
    case "overview":
      return "";
    case "streams":
      return "#/attention/streams";
    case "step":
      return `#/${place.path}/${topic(place.path).steps[place.index].key}`;
    case "regions":
      return `#/${place.path}/regions`;
    case "region":
      return place.path ? `#/${place.path}/region/${place.id}` : `#/region/${place.id}`;
  }
}

/** The place a hash names. Also accepts step numbers (`#/vision/3`). Null when it names nothing. */
export function parseHash(hash: string): Place | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(hash.replace(/^#\/?/, ""));
  } catch {
    // A malformed escape such as "#/vision/50%" names nothing; it must never stop the page from starting.
    return null;
  }
  const parts = decoded
    .split("/")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length || (parts.length === 1 && parts[0] === "overview")) return { kind: "overview" };
  if (parts[0] === "region" && parts.length === 2) {
    const id = regionByLower.get(parts[1]);
    return id ? { kind: "region", path: null, id } : null;
  }
  const path = topicByLower.get(parts[0]);
  if (!path || parts.length > 3) return null;
  if (parts.length === 1) return { kind: "step", path, index: 0 };
  if (parts[1] === "streams") return path === "attention" && parts.length === 2 ? { kind: "streams" } : null;
  if (parts[1] === "regions") return parts.length === 2 ? { kind: "regions", path } : null;
  if (parts[1] === "region") {
    const id = regionByLower.get(parts[2] ?? "");
    return id ? { kind: "region", path, id } : null;
  }
  if (parts.length !== 2) return null;
  const resolved = resolveStep(`${path}/${parts[1]}`);
  return "ref" in resolved && resolved.ref.kind === "step" ? { kind: "step", path, index: resolved.ref.index } : null;
}
