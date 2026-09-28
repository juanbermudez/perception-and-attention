import type { PathId, RegionId } from "./content/types";
import type { AttentionSettings } from "./model/attention";
import { defaultLayers, type Isolation, type LabelMode, type LayerEffect, type LayerId } from "./model/view";

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
  /** Labels on or off; the same as `labelMode !== "none"`. Turning labels on restores the automatic label rules. */
  labels: boolean;
  /** auto: per-topic label sets · focus: selected and isolated regions · all: every visible marker · none. */
  labelMode: LabelMode;
  xray: boolean;
  skull: boolean;
  /** Temporal bones around the inner ear, shown in the hearing topic. */
  bones: boolean;
  /** Dim routes and regions the current walkthrough step is not about. */
  spotlight: boolean;
  /** Presence per layer, 0 (gone) to 1 (normal). It multiplies the topic and zoom rules. */
  layers: Record<LayerId, number>;
  /** How layer presence changes render: points dissolve at random, or everything fades evenly. */
  layerEffect: LayerEffect;
  /** Regions shown on their own; everything else drops to `keep`. */
  isolate: Isolation | null;
  /** A region the camera was pointed at without navigating (highlight and view gap follow it). The next navigation clears it. */
  viewFocus: RegionId | null;
  /** On the overview, the topic being previewed (its name is hovered or focused); null shows every system. */
  homeFocus: PathId | null;
}

export function createState(reducedMotion: boolean): ExplorerState {
  const state: ExplorerState = {
    path: "attention",
    overview: true,
    step: 0,
    selected: "pfc",
    playing: !reducedMotion,
    speed: 2,
    simTime: 0,
    labelMode: "auto",
    get labels() {
      return this.labelMode !== "none";
    },
    set labels(on: boolean) {
      if (on !== this.labels) this.labelMode = on ? "auto" : "none";
    },
    xray: true,
    skull: true,
    bones: true,
    spotlight: true,
    layers: defaultLayers(),
    layerEffect: "dissolve",
    isolate: null,
    viewFocus: null,
    homeFocus: null,
    focus: 65,
    enabledSenses: { vision: true, hearing: true, touch: true },
    priority: "balanced",
    controlNetwork: true,
  };
  return state;
}
