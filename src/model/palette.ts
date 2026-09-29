// What the command palette searches: every topic, step, region and paper in the guide, each with the place
// it opens (or the paper's URL). Built from content, so a new step or region is searchable at once.
import { pathways } from "../content/pathways";
import { guideSources, regionGuides } from "../content/region-guides";
import { regions } from "../content/regions";
import { sources } from "../content/sources";
import type { RegionId } from "../content/types";
import type { SearchEntry } from "./fuzzy";
import type { Place } from "./refs";

export type PaletteGroup = "Topics" | "Steps" | "Regions" | "Papers";

export interface PaletteItem extends SearchEntry {
  id: string;
  group: PaletteGroup;
  /** The topic's colour, for the row's dot. */
  color?: string;
  place?: Place;
  url?: string;
}

/** How many results each group shows for a query. */
export const GROUP_LIMITS: Record<PaletteGroup, number> = { Topics: 6, Regions: 8, Steps: 8, Papers: 6 };

/** Running text without the [[id|text]] link markup. */
const plain = (text = "") => text.replace(/\[\[[a-zA-Z0-9]+\|([^\]]+)\]\]/g, "$1");

export function paletteItems(): PaletteItem[] {
  const topics = pathways.map(
    (path): PaletteItem => ({
      id: `topic:${path.id}`,
      group: "Topics",
      label: path.title,
      keywords: path.short,
      detail: path.subtitle,
      text: plain(`${path.intro} ${path.insight}`),
      color: path.color,
      place: { kind: "step", path: path.id, index: 0 },
    }),
  );
  const steps = pathways.flatMap((path) =>
    path.steps.map(
      (step, index): PaletteItem => ({
        id: `step:${path.id}/${step.key}`,
        group: "Steps",
        label: step.title,
        keywords: regions[step.region].label,
        detail: `${path.short} · step ${index + 1}`,
        text: plain(`${step.body} ${step.fact ?? ""}`),
        color: path.color,
        place: { kind: "step", path: path.id, index },
      }),
    ),
  );
  const regionItems = (Object.keys(regions) as RegionId[]).map((id): PaletteItem => {
    const region = regions[id];
    const guide = regionGuides[id];
    return {
      id: `region:${id}`,
      group: "Regions",
      label: region.label,
      keywords: `${region.short} ${region.name} ${id}`,
      detail: region.where,
      text: plain([guide.summary, guide.mechanism, guide.connections, ...Object.values(guide.roles)].join(" ")),
      place: { kind: "region", path: null, id },
    };
  });
  // Topic sources first (they carry authors), then region-guide papers not already listed; each URL once.
  const seen = new Set<string>();
  const papers: PaletteItem[] = [];
  for (const source of sources)
    if (!seen.has(source.url)) {
      seen.add(source.url);
      papers.push({ id: `source:${source.id}`, group: "Papers", label: source.title, keywords: source.author, detail: source.author, url: source.url });
    }
  for (const source of guideSources)
    if (!seen.has(source.url)) {
      seen.add(source.url);
      papers.push({ id: `source:${source.id}`, group: "Papers", label: source.title, url: source.url });
    }
  return [...topics, ...regionItems, ...steps, ...papers];
}
