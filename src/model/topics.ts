// Pure questions about topics: which regions a topic covers, where a region is taught, and what a step's signal is.
import { pathways } from "../content/pathways";
import type { PathId, Pathway, RegionId, Signal } from "../content/types";

/** Seconds each walkthrough step stays on screen: the UI uses the default; agents may pick within the range. */
export const WALK_SECONDS = { min: 3, max: 20, default: 5.5 };

export function pathwayById(id: PathId): Pathway {
  const path = pathways.find((candidate) => candidate.id === id);
  if (!path) throw new Error(`Unknown topic: ${id}`);
  return path;
}

/** A step's signal, or by default a single hop from the previous step's region. */
export function signalFor(path: Pathway, index: number): Signal {
  const step = path.steps[index];
  if (step.signal) return step.signal;
  return index > 0 ? [[[path.steps[index - 1].region, step.region]]] : [];
}

/** Regions a topic covers: walkthrough regions in step order, then others drawn on its routes. */
export function topicRegions(path: Pathway) {
  const inSteps = [...new Set(path.steps.map((step) => step.region))];
  const onRoutes = [...new Set(path.edges.flatMap((edge) => [edge.from, edge.to]))].filter((id) => !inSteps.includes(id));
  return { inSteps, onRoutes };
}

export function topicHasRegion(path: Pathway, id: RegionId) {
  return path.steps.some((step) => step.region === id) || path.edges.some((edge) => edge.from === id || edge.to === id);
}

/** The first topic that teaches a region in a step, else the first that draws it on a route. */
export function hostTopic(id: RegionId): Pathway | undefined {
  return pathways.find((path) => path.steps.some((step) => step.region === id)) ?? pathways.find((path) => topicHasRegion(path, id));
}
