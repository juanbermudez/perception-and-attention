// Per-frame rules of the 3D scene: which markers and labels show, how much the step spotlight
// leaves of each region, and how strongly region highlights glow. Pure, so it is tested in
// Node (tests/scene-rules.test.mjs); scene/brain-scene.ts gathers a FrameView once per frame.
import type { PathId, RegionId } from "../content/types";
import type { ExplorerState } from "../state";
import { type Isolation, LAYER_IDS, type LabelMode } from "./view";

/** Layers 5 and 6 share V1's position, so only the one being shown (or isolated) gets a marker. */
export const LAYER_MARKERS: ReadonlySet<RegionId> = new Set<RegionId>(["l5", "l6"]);
/** Labels the Attention topic shows in the automatic label mode. */
export const ATTENTION_LABELS: ReadonlySet<RegionId> = new Set<RegionId>([
  "pfc",
  "fef",
  "parietal",
  "tpj",
  "sc",
  "lc",
  "pulvinar",
  "extrastriate",
  "v1",
  "a1",
  "s1",
]);
/** Right-hand relays whose left twin carries the label in the automatic mode. */
export const TWIN_LABELS: ReadonlySet<RegionId> = new Set<RegionId>(["brainstemR", "socR", "icR", "mgnR"]);
/** What the step spotlight leaves of a region outside the current step. */
export const SPOT_DIM_REGION = 0.25;
/** Highlight weight for the other regions of the current topic. */
export const CONTEXT_HIGHLIGHT = 0.28;
/** Overview map: every topic's regions glow faintly; the previewed topic brighter, the rest dimmer. */
export const HOME_GLOW = 0.24;
export const HOME_FOCUS = 0.6;
export const HOME_DIM = 0.06;

/** The view state the rules read, gathered once per frame. */
export interface FrameView {
  /** Region pick mode (a quiz question): markers and labels show for exactly these regions. */
  pick: readonly RegionId[] | null;
  /** The plain overview map: no hover preview, agent focus or isolate. */
  home: boolean;
  /** On the overview map, the topic being previewed. */
  homeTopic: PathId | null;
  /** The previewed topic's regions (null when none is previewed). */
  homeRegions: ReadonlySet<RegionId> | null;
  isolate: Isolation | null;
  /** The region the scene treats as selected. */
  shown: RegionId;
  /** A region is being shown: inside a topic, during a hover preview, or while an agent's view focus is set. */
  focusActive: boolean;
  /** Regions at either end of a route that is drawn. */
  activeRegions: ReadonlySet<RegionId>;
  path: PathId;
  labelMode: LabelMode;
  /** Labels are on and the labels layer is present. */
  labelsOn: boolean;
  /** The step spotlight is on and has something to spotlight. */
  spotOn: boolean;
  /** Regions in the current step. */
  spotRegions: ReadonlySet<RegionId>;
}

/** The marker of the region being shown. In pick mode nothing is marked as selected, so no marker stands out. */
export function markerActive(id: RegionId, view: FrameView) {
  return !view.pick && view.focusActive && id === view.shown;
}

/**
 * Whether a region's marker shows. In pick mode, exactly the offered regions. On the overview map,
 * only the previewed topic's regions. While isolating, the isolated regions and the one shown;
 * otherwise the one shown and every region a drawn route touches.
 */
export function markerVisible(id: RegionId, view: FrameView) {
  if (view.pick) return view.pick.includes(id);
  const active = markerActive(id, view),
    isolated = view.isolate?.regions.includes(id) ?? false;
  const listed = view.home ? (view.homeRegions?.has(id) ?? false) : view.isolate ? isolated || active : active || view.activeRegions.has(id);
  return listed && !(LAYER_MARKERS.has(id) && !active && !isolated) && !(id === "v1" && LAYER_MARKERS.has(view.shown));
}

/**
 * Whether a visible marker's label shows. Label modes: all = every visible marker; focus = the shown
 * and isolated regions; auto = the per-topic sets (every marker while isolating, since only
 * isolated ones remain); none = no labels.
 */
export function labelTarget(id: RegionId, view: FrameView, markerShown: boolean, inView: boolean) {
  if (!markerShown || !inView || !view.labelsOn) return false;
  if (view.labelMode === "all" || view.pick !== null || (view.labelMode === "auto" && view.isolate !== null) || markerActive(id, view)) return true;
  if (view.labelMode === "focus") return view.isolate?.regions.includes(id) ?? false;
  return (view.homeTopic ?? view.path) === "attention" ? ATTENTION_LABELS.has(id) : !TWIN_LABELS.has(id);
}

/**
 * How much of a region the step spotlight leaves: 1 for the step's regions and the one shown,
 * SPOT_DIM_REGION for the rest. Isolate overrides the spotlight: isolated regions (and the one shown)
 * stay, the rest drop to `keep`.
 */
export function regionSpot(id: RegionId, view: Pick<FrameView, "isolate" | "shown" | "spotOn" | "spotRegions">) {
  const isolate = view.isolate;
  if (isolate) return isolate.regions.includes(id) || id === view.shown ? 1 : isolate.keep;
  return !view.spotOn || view.spotRegions.has(id) || id === view.shown ? 1 : SPOT_DIM_REGION;
}

/**
 * Overview map glow of a region highlight: none without a topic colour, a low glow for every topic,
 * and while a topic is previewed, brighter for its regions and dimmer for the rest.
 */
export function homeHighlightWeight(hasColour: boolean, homeTopic: PathId | null, inTopic: boolean) {
  if (!hasColour) return 0;
  return homeTopic === null ? HOME_GLOW : inTopic ? HOME_FOCUS : HOME_DIM;
}

/**
 * Glow of a region highlight away from the overview map: full for the region shown and for isolated
 * regions; a steady context level for the topic's other regions (capped at `keep` while isolating).
 */
export function highlightWeight(
  selected: boolean,
  isolated: boolean,
  context: boolean,
  view: { focusActive: boolean; overview: boolean; isolate: Isolation | null },
) {
  if ((selected && view.focusActive) || isolated) return 1;
  if (view.overview || !context) return 0;
  return view.isolate ? Math.min(CONTEXT_HIGHLIGHT, view.isolate.keep) : CONTEXT_HIGHLIGHT;
}

/**
 * Everything in the shared state that the frame reads, as one string. The scene compares it on each
 * tick and draws again when it changes, since the UI, the view API and tours write the state without
 * telling the scene. simTime is left out: the frame writes it.
 */
export function sceneStateKey(state: ExplorerState) {
  const layers = LAYER_IDS.map((id) => state.layers[id]).join(",");
  const isolate = state.isolate ? `${state.isolate.regions.join(",")}@${state.isolate.keep}` : "-";
  const senses = `${+state.enabledSenses.vision}${+state.enabledSenses.hearing}${+state.enabledSenses.touch}`;
  return [
    state.overview,
    state.path,
    state.step,
    state.selected,
    state.playing,
    state.labelMode,
    state.xray,
    state.spotlight,
    layers,
    state.layerEffect,
    isolate,
    state.viewFocus,
    state.homeFocus,
    state.pick?.join(",") ?? "-",
    state.focus,
    senses,
    state.priority,
    state.controlNetwork,
  ].join("|");
}
