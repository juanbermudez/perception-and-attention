import { clamp } from "math";
import type { Edge, PathId, RegionId, SenseId } from "../content/types";

export interface AttentionSettings {
  enabledSenses: Record<SenseId, boolean>;
  priority: SenseId | "balanced";
  controlNetwork: boolean;
  focus: number;
}
export const sensoryStreams: { id: SenseId; name: string; color: string; region: RegionId }[] = [
  { id: "vision", name: "Vision", color: "#77e8db", region: "v1" },
  { id: "hearing", name: "Sound", color: "#ed9bcc", region: "a1" },
  { id: "touch", name: "Touch", color: "#89bdf4", region: "s1" },
];
const senseRegions: Partial<Record<RegionId, SenseId>> = {
  retina: "vision",
  retinaR: "vision",
  chiasm: "vision",
  lgn: "vision",
  v1: "vision",
  l6: "vision",
  extrastriate: "vision",
  mt: "vision",
  it: "vision",
  ffa: "vision",
  ppa: "vision",
  eba: "vision",
  vwfa: "vision",
  pulvinar: "vision",
  cochlea: "hearing",
  cochleaR: "hearing",
  brainstem: "hearing",
  brainstemR: "hearing",
  soc: "hearing",
  socR: "hearing",
  ic: "hearing",
  icR: "hearing",
  mgn: "hearing",
  mgnR: "hearing",
  a1: "hearing",
  a1R: "hearing",
  medulla: "touch",
  vpl: "touch",
  s1: "touch",
};
export function senseForRegion(id: RegionId) {
  return senseRegions[id];
}

// Normalization model of attention (Reynolds & Heeger, 2009), reduced to one
// number per stream: R_i = A_i·E_i / (σ + Σ_j A_j·E_j). E is the stimulus drive
// (1 while a stream is shown), A the attention gain. Boosting one stream enlarges
// the shared denominator, so the others are suppressed without being switched off.
export const NORMALIZATION_SIGMA = 1;
export const MAX_ATTENTION_GAIN = 3;
export function attentionGain(focus: number) {
  return 1 + (MAX_ATTENTION_GAIN - 1) * clamp(focus / 100, 0, 1);
}
export function streamResponses(settings: AttentionSettings): Record<SenseId, number> {
  const gain = attentionGain(settings.focus);
  let pool = NORMALIZATION_SIGMA;
  for (const stream of sensoryStreams) pool += (settings.priority === stream.id ? gain : 1) * (settings.enabledSenses[stream.id] ? 1 : 0);
  const out = {} as Record<SenseId, number>;
  for (const stream of sensoryStreams) out[stream.id] = ((settings.priority === stream.id ? gain : 1) * (settings.enabledSenses[stream.id] ? 1 : 0)) / pool;
  return out;
}
/** Response of one stream when all three are shown and none is prioritized. */
export const BALANCED_RESPONSE = 1 / (NORMALIZATION_SIGMA + sensoryStreams.length);
const BALANCED_WEIGHT = 0.7;

export function attentionWeight(path: PathId, edge: Edge, settings: AttentionSettings): number {
  if (path === "attention") {
    if (!settings.controlNetwork) return 0;
    const sense = edge.channel;
    return sense && !settings.enabledSenses[sense] ? 0 : 1;
  }
  if (path !== "vision" && path !== "hearing" && path !== "touch") return 0;
  if (!settings.enabledSenses[path]) return 0;
  // Map the model's response onto route brightness; balanced streams sit at 0.7.
  return clamp((streamResponses(settings)[path] / BALANCED_RESPONSE) * BALANCED_WEIGHT, 0.12, 1);
}

const OVERVIEW_PATHS = new Set<PathId>(["vision", "hearing", "touch"]);

/** Brightness of one route in the current view; 0 hides it. */
export function routeWeight(path: PathId, edge: Edge, view: AttentionSettings & { overview: boolean; path: PathId }): number {
  // Detail routes (e.g. beyond V1) would crowd the overview and the Attention streams.
  if (edge.detail) return !view.overview && path === view.path ? 1 : 0;
  if (view.overview) return OVERVIEW_PATHS.has(path) ? 0.7 : 0;
  if (view.path === "attention") return attentionWeight(path, edge, view);
  return path === view.path ? 1 : 0;
}

export function regionPulse(seconds: number, reducedMotion = false): number {
  // Opacity pulses between 50% and 95% over 4.5 s; steady at the midpoint with reduced motion.
  return reducedMotion ? 0.725 : 0.725 + 0.225 * Math.cos((seconds * Math.PI * 2) / 4.5);
}
