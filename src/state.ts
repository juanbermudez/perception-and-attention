import type { PathId, RegionId } from "./content/types";
import type { AttentionSettings } from "./model/attention";

/** View state shared by the UI (which writes it) and the scene (which reads it every frame). */
export interface ExplorerState extends AttentionSettings {
  path: PathId;
  /** True while the overview is shown: all senses flow and nothing is selected. */
  overview: boolean;
  step: number;
  selected: RegionId;
  playing: boolean;
  /** Simulation speed multiplier. */
  speed: number;
  /** Simulated seconds; advances only while playing. */
  simTime: number;
  labels: boolean;
  xray: boolean;
  skull: boolean;
  /** Temporal bones around the inner ear, shown in the hearing topic. */
  bones: boolean;
  /** Dim routes and regions the current walkthrough step is not about. */
  spotlight: boolean;
}

export function createState(reducedMotion: boolean): ExplorerState {
  return {
    path: "attention",
    overview: true,
    step: 0,
    selected: "pfc",
    playing: !reducedMotion,
    speed: 2,
    simTime: 0,
    labels: true,
    xray: true,
    skull: true,
    bones: true,
    spotlight: true,
    focus: 65,
    enabledSenses: { vision: true, hearing: true, touch: true },
    priority: "balanced",
    controlNetwork: true,
  };
}
