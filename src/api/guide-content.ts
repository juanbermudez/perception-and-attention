// Read-only views of the guide for agents: outline, read and search (spec §6.2–6.4).
// Progressive disclosure: outline lists one level, read "brief" is short, "full" and "sources" only on request.
// Pure functions of content and the open topic, so they are tested in Node.
import { helpCard, LIST_LIMIT, SEARCH_LIMIT } from "../agent/help";
import { pathways } from "../content/pathways";
import { guideSources, regionGuides } from "../content/region-guides";
import { regions } from "../content/regions";
import { about, codeNotes, overview } from "../content/site";
import { sources } from "../content/sources";
import type { PathId, RegionId } from "../content/types";
import { MAX_ATTENTION_GAIN, NORMALIZATION_SIGMA, sensoryStreams } from "../model/attention";
import {
  ABOUT_TABS,
  type AboutTab,
  formatRef,
  markdownLinks,
  plainText,
  type Ref,
  type RegionSection,
  regionRef,
  resolveRef,
  STREAMS_REF,
  stepRef,
  topicRef,
} from "../model/refs";
import { createSearchIndex, type SearchDoc, type SearchIndex } from "../model/search";
import { pathwayById, signalFor, topicRegions } from "../model/topics";
import { fail, type Result } from "./result";

export const DETAILS = ["brief", "full", "sources", "markdown", "results"] as const;
export type Detail = (typeof DETAILS)[number];
/** The topic open in the panel (null in the overview). A region's role follows it. */
export interface ReadContext {
  path: PathId | null;
}
export interface Page {
  limit?: number;
  cursor?: string;
}

export const DOCS_LATER = "Docs and quizzes are not available in this version of the guide.";
const ABOUT_TITLES: Record<AboutTab, string> = { about: "About", papers: "Papers", code: "Code", models: "Models" };
const STREAMS_TITLE = "Attention streams";

const paragraphs = (items: string[]) => items.map(markdownLinks).join("\n\n");
/** The compact name used in routes: "LGN" from "LGN · visual relay". */
const shortName = (id: RegionId) => regions[id].short.split(" · ")[0];
const isArtifact = (ref: Ref) => ref.kind === "docs" || ref.kind === "doc" || ref.kind === "quiz" || ref.kind === "block";

/* ---------- Sources ---------- */

function sourceEntry(id: string, withNote = false) {
  const source = sources.find((candidate) => candidate.id === id);
  if (source) return { ref: `source:${id}`, title: source.title, author: source.author, url: source.url, ...(withNote ? { note: source.note } : {}) };
  const guide = guideSources.find((candidate) => candidate.id === id);
  return guide ? { ref: `source:${id}`, title: guide.title, url: guide.url } : undefined;
}
const sourceList = (ids: string[], withNote = false) => ids.map((id) => sourceEntry(id, withNote)).filter((entry) => entry !== undefined);

/** Topics and regions that cite a source. */
function citedBy(id: string): string[] {
  const topics = pathways.filter((path) => path.sourceIds.includes(id)).map((path) => topicRef(path.id));
  const guides = (Object.keys(regionGuides) as RegionId[]).filter((region) => regionGuides[region].sourceIds.includes(id)).map(regionRef);
  return [...topics, ...guides];
}

/* ---------- Titles ---------- */

export function refTitle(ref: Ref): string {
  switch (ref.kind) {
    case "guide":
    case "overview":
      return overview.title;
    case "about":
      return ABOUT_TITLES[ref.tab];
    case "topic":
      return pathwayById(ref.path).title;
    case "streams":
      return STREAMS_TITLE;
    case "step":
      return pathwayById(ref.path).steps[ref.index].title;
    case "region":
      return regions[ref.id].label;
    case "source":
      return sourceEntry(ref.id)?.title ?? ref.id;
    case "help":
      return "Reference card";
    default:
      return formatRef(ref);
  }
}

/* ---------- Outline ---------- */

function paginate<T>(items: T[], { limit = LIST_LIMIT.default, cursor }: Page): Result<{ items: T[]; cursor?: string }> {
  const offset = cursor === undefined ? 0 : Number(cursor);
  if (!Number.isInteger(offset) || offset < 0 || offset > items.length)
    return fail("bad_input", `Bad cursor "${cursor}". Pass the cursor from the previous result.`);
  const slice = items.slice(offset, offset + limit);
  const next = offset + slice.length;
  return { items: slice, cursor: next < items.length ? String(next) : undefined };
}

const aboutRefs = ABOUT_TABS.map((tab) => formatRef({ kind: "about", tab }));

/** The structure under a ref, one level at a time. */
export function outline(refText = "guide", page: Page = {}): Result<object> {
  const resolved = resolveRef(refText);
  if ("error" in resolved) return resolved;
  const { ref } = resolved;
  switch (ref.kind) {
    case "guide":
    case "overview":
      return {
        ref: ref.kind,
        title: overview.title,
        topics: pathways.map((path) => ({ ref: topicRef(path.id), title: path.title, subtitle: path.subtitle, steps: path.steps.length })),
        about: aboutRefs,
        help: "help",
      };
    case "about":
      return { ref: formatRef(ref), tabs: ABOUT_TABS.map((tab) => ({ ref: formatRef({ kind: "about", tab }), title: ABOUT_TITLES[tab] })) };
    case "topic": {
      const path = pathwayById(ref.path);
      const steps = paginate(
        path.steps.map((step, i) => ({ ref: stepRef(path.id, i), n: i + 1, title: step.title, region: step.region })),
        page,
      );
      if ("error" in steps) return steps;
      const { inSteps, onRoutes } = topicRegions(path);
      return {
        ref: topicRef(path.id),
        title: path.title,
        steps: steps.items,
        cursor: steps.cursor,
        regions: inSteps,
        also: onRoutes,
        streams: path.id === "attention" ? STREAMS_REF : undefined,
      };
    }
    case "streams":
      return {
        ref: STREAMS_REF,
        title: STREAMS_TITLE,
        streams: sensoryStreams.map((stream) => ({ sense: stream.id, name: stream.name, region: stream.region })),
      };
    case "step": {
      const path = pathwayById(ref.path);
      const step = path.steps[ref.index];
      return {
        ref: stepRef(path.id, ref.index),
        n: ref.index + 1,
        of: path.steps.length,
        topic: topicRef(path.id),
        title: step.title,
        region: step.region,
        prev: ref.index > 0 ? stepRef(path.id, ref.index - 1) : undefined,
        next: ref.index < path.steps.length - 1 ? stepRef(path.id, ref.index + 1) : undefined,
      };
    }
    case "region": {
      const guide = regionGuides[ref.id];
      const sections = (["summary", "mechanism", "role", "connections", "limit", "sources"] as RegionSection[]).filter(
        (section) => (section !== "role" || Object.keys(guide.roles).length) && (section !== "sources" || guide.sourceIds.length),
      );
      const steps = pathways.flatMap((path) => path.steps.flatMap((step, i) => (step.region === ref.id ? [stepRef(path.id, i)] : [])));
      const topics = pathways.filter((path) => topicRegions(path).inSteps.includes(ref.id) || topicRegions(path).onRoutes.includes(ref.id));
      return { ref: regionRef(ref.id), title: regions[ref.id].label, sections, topics: topics.map((path) => topicRef(path.id)), steps };
    }
    case "source":
      return { ref: formatRef(ref), title: refTitle(ref), cited: citedBy(ref.id) };
    case "help":
      return helpCard();
    default:
      return fail("not_available", DOCS_LATER);
  }
}

/* ---------- Read ---------- */

const noSources = (ref: string) =>
  fail("bad_input", `${ref} has no sources of its own. Topics, steps and regions list theirs with detail "sources".`, [
    "topic:vision",
    "step:vision/1",
    "region:v1",
  ]);

/** Content at a ref. `brief` is short; `full` adds every section; `sources` lists citations. */
export function read(refText: string, detail: Detail = "brief", context: ReadContext = { path: null }): Result<object> {
  const resolved = resolveRef(refText);
  if ("error" in resolved) return resolved;
  const { ref } = resolved;
  if (isArtifact(ref)) return fail("not_available", DOCS_LATER);
  if (detail === "markdown" || detail === "results") return fail("bad_input", `detail "${detail}" applies to doc: and quiz: refs. Use brief, full or sources.`);
  switch (ref.kind) {
    case "guide":
    case "overview":
      return readOverview(detail);
    case "about":
      return readAbout(ref.tab, detail);
    case "topic":
      return readTopic(ref.path, detail);
    case "streams":
      return readStreams(detail);
    case "step":
      return readStep(ref.path, ref.index, detail);
    case "region":
      return ref.section ? readSection(ref.id, ref.section, context) : readRegion(ref.id, detail, context);
    case "source":
      return { ...sourceEntry(ref.id, true), cited: citedBy(ref.id) };
    default:
      return helpCard();
  }
}

function readOverview(detail: Detail): Result<object> {
  if (detail === "sources") return noSources("overview");
  const brief = { ref: "overview", title: overview.title, text: paragraphs(overview.lede) };
  if (detail === "brief") return brief;
  return {
    ...brief,
    topics: pathways.map((path) => ({ ref: topicRef(path.id), title: path.title, subtitle: path.subtitle })),
    model: overview.modelNotes,
  };
}

function readAbout(tab: AboutTab, detail: Detail): Result<object> {
  const ref = formatRef({ kind: "about", tab });
  const title = ABOUT_TITLES[tab];
  if (detail === "sources" && tab !== "papers") return noSources(ref);
  switch (tab) {
    case "about":
      if (detail === "brief") return { ref, title, text: paragraphs(about.sections[0].paragraphs), sections: about.sections.map((section) => section.title) };
      return { ref, title, sections: about.sections.map((section) => ({ title: section.title, text: paragraphs(section.paragraphs) })) };
    case "papers": {
      // About 240 citations: list refs here; read a topic, step or region with detail "sources" for titles and URLs.
      const listed = new Set(pathways.flatMap((path) => path.sourceIds.map((id) => sourceEntry(id)?.url)));
      const regionOnly = guideSources.filter((source) => !listed.has(source.url)).length;
      const text = "Papers, reviews and textbook chapters used for this guide, grouped by topic. Region guides cite more; read a region with detail sources.";
      if (detail === "brief")
        return { ref, title, text, topics: pathways.map((path) => ({ ref: topicRef(path.id), sources: path.sourceIds.length })), regionOnly };
      return {
        ref,
        title,
        text,
        topics: pathways.map((path) => ({ ref: topicRef(path.id), sources: path.sourceIds.map((id) => `source:${id}`) })),
        regionOnly,
      };
    }
    case "code":
      return detail === "brief"
        ? { ref, title, text: paragraphs(codeNotes.build) }
        : { ref, title, text: paragraphs(codeNotes.build), animation: codeNotes.animation };
    case "models":
      return { ref, title, text: paragraphs(detail === "brief" ? overview.modelNotes.slice(0, 1) : overview.modelNotes) };
  }
}

function readTopic(id: PathId, detail: Detail): Result<object> {
  const path = pathwayById(id);
  const ref = topicRef(id);
  if (detail === "sources") return { ref, sources: sourceList(path.sourceIds, true) };
  const brief = { ref, title: path.title, subtitle: path.subtitle, text: markdownLinks(path.intro) };
  if (detail === "brief") return brief;
  return {
    ...brief,
    summary: markdownLinks(path.insight),
    caveat: markdownLinks(path.caveat),
    steps: path.steps.map((step, i) => ({ ref: stepRef(id, i), title: step.title })),
  };
}

function readStreams(detail: Detail): Result<object> {
  if (detail === "sources") return noSources(STREAMS_REF);
  const brief = {
    ref: STREAMS_REF,
    title: STREAMS_TITLE,
    text: `A simplified normalization model of attention (Reynolds & Heeger, 2009). Each stream's response is R = A·E / (σ + Σ A·E), with σ = ${NORMALIZATION_SIGMA} and an attention gain A of up to ${MAX_ATTENTION_GAIN}×. Giving one sense priority lowers the others' responses without switching them off. Illustrative values.`,
  };
  if (detail === "brief") return brief;
  return { ...brief, streams: sensoryStreams.map((stream) => ({ sense: stream.id, name: stream.name, region: stream.region })) };
}

/** A step's signal in words, for example "chiasm → LGN" or "V1 → Higher visual areas, V1 → MT". */
export function routeWords(id: PathId, index: number): string | undefined {
  const chains: RegionId[][] = [];
  for (const hop of signalFor(pathwayById(id), index))
    for (const [from, to] of hop) {
      const last = chains.at(-1);
      if (last && last.at(-1) === from && hop.length === 1) last.push(to);
      else chains.push([from, to]);
    }
  return chains.length ? chains.map((chain) => chain.map(shortName).join(" → ")).join(", ") : undefined;
}

function readStep(id: PathId, index: number, detail: Detail): Result<object> {
  const path = pathwayById(id);
  const step = path.steps[index];
  const ref = stepRef(id, index);
  if (detail === "sources") return { ref, region: step.region, sources: sourceList(regionGuides[step.region].sourceIds) };
  const brief = { ref, n: index + 1, of: path.steps.length, topic: topicRef(id), title: step.title, region: step.region, text: markdownLinks(step.body) };
  if (detail === "brief") return brief;
  return {
    ...brief,
    fact: step.fact ? markdownLinks(step.fact) : undefined,
    route: routeWords(id, index),
    regionSummary: markdownLinks(regionGuides[step.region].summary),
  };
}

/** The role in the open topic when it has one, else every role. */
function rolesFor(id: RegionId, context: ReadContext): Record<string, string> {
  const roles = regionGuides[id].roles;
  const own = context.path ? roles[context.path] : undefined;
  const entries = own && context.path ? [[context.path, own]] : Object.entries(roles);
  return Object.fromEntries(entries.map(([path, text]) => [path, markdownLinks(text as string)]));
}

function readRegion(id: RegionId, detail: Detail, context: ReadContext): Result<object> {
  const region = regions[id];
  const guide = regionGuides[id];
  const ref = regionRef(id);
  if (detail === "sources") return { ref, sources: sourceList(guide.sourceIds) };
  const brief = { ref, title: region.label, where: region.where, text: markdownLinks(guide.summary) };
  if (detail === "brief") return brief;
  return {
    ref,
    title: region.label,
    where: region.where,
    summary: markdownLinks(guide.summary),
    mechanism: markdownLinks(guide.mechanism),
    roles: rolesFor(id, context),
    connections: markdownLinks(guide.connections),
    limit: markdownLinks(guide.limit),
    sources: guide.sourceIds.map((source) => `source:${source}`),
  };
}

function readSection(id: RegionId, section: RegionSection, context: ReadContext): Result<object> {
  const guide = regionGuides[id];
  const head = { ref: `${regionRef(id)}#${section}`, title: regions[id].label, section };
  if (section === "role") return { ...head, roles: rolesFor(id, context) };
  if (section === "sources") return { ...head, sources: sourceList(guide.sourceIds) };
  return { ...head, text: markdownLinks(guide[section]) };
}

/* ---------- Search ---------- */

function guideDocs(): SearchDoc[] {
  const docs: SearchDoc[] = [
    { ref: "overview", kind: "overview", title: overview.title, fields: { title: overview.title, body: plainText(overview.lede.join(" ")) } },
  ];
  for (const path of pathways) {
    docs.push({
      ref: topicRef(path.id),
      kind: "topic",
      title: path.title,
      fields: { title: `${path.title} ${path.short}`, fact: `${path.subtitle} ${plainText(path.insight)}`, body: plainText(`${path.intro} ${path.caveat}`) },
    });
    path.steps.forEach((step, i) => {
      docs.push({
        ref: stepRef(path.id, i),
        kind: "step",
        title: `${path.title} ${i + 1}: ${step.title}`,
        fields: { title: step.title, fact: plainText(step.fact ?? ""), body: plainText(step.body) },
      });
    });
  }
  for (const id of Object.keys(regions) as RegionId[]) {
    const region = regions[id];
    const guide = regionGuides[id];
    docs.push({
      ref: regionRef(id),
      kind: "region",
      title: region.label,
      fields: {
        title: `${region.label} ${region.short} ${id}`,
        fact: plainText(guide.summary),
        body: plainText([region.where, guide.mechanism, ...Object.values(guide.roles), guide.connections, guide.limit].join(" ")),
      },
    });
  }
  for (const source of sources) {
    docs.push({ ref: `source:${source.id}`, kind: "source", title: source.title, fields: { title: source.title, fact: `${source.author}. ${source.note}` } });
  }
  const topicSources = new Set(sources.map((source) => source.id));
  for (const source of guideSources) {
    if (!topicSources.has(source.id)) docs.push({ ref: `source:${source.id}`, kind: "source", title: source.title, fields: { title: source.title } });
  }
  return docs;
}

let guideIndex: SearchIndex | undefined;
/** Built on first use: about 330 entries. */
export function searchGuide(query: string, limit = SEARCH_LIMIT.default) {
  guideIndex ??= createSearchIndex(guideDocs());
  return guideIndex.search(query, { limit }).map((hit) => ({ ref: hit.ref, title: hit.title, snip: hit.snip }));
}
