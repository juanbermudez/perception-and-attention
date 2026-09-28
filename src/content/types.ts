import type { Vec3 } from "math";

export type PathId = "loop" | "attention" | "vision" | "hearing" | "speech" | "touch";
export type SenseId = "vision" | "hearing" | "touch";
export type RegionId =
  | "retina"
  | "retinaR"
  | "chiasm"
  | "lgn"
  | "v1"
  | "l6"
  | "trn"
  | "pfc"
  | "parietal"
  | "pulvinar"
  | "extrastriate"
  | "mt"
  | "it"
  | "ffa"
  | "ppa"
  | "eba"
  | "vwfa"
  | "cochlea"
  | "cochleaR"
  | "brainstem"
  | "brainstemR"
  | "soc"
  | "socR"
  | "ic"
  | "icR"
  | "mgn"
  | "mgnR"
  | "a1"
  | "a1R"
  | "temporal"
  | "spt"
  | "frontal"
  | "motor"
  | "meaning"
  | "medulla"
  | "vpl"
  | "s1"
  | "insula"
  | "cingulate";

/** label: full name · short: callout text · name: used in running text · where: location line. */
export interface Region {
  id: RegionId;
  label: string;
  short: string;
  name: string;
  where: string;
  position: Vec3;
}

/** A walkthrough signal: hops play in order; pairs inside a hop travel together. */
export type Signal = [RegionId, RegionId][][];

export interface Step {
  region: RegionId;
  title: string;
  body: string;
  fact?: string;
  /** Overrides the default signal (previous step region → this region). */
  signal?: Signal;
}

export interface Edge {
  from: RegionId;
  to: RegionId;
  /** Offset added to the Bézier control points, in scene units. */
  bend: Vec3;
  kind?: "feedback" | "inhibitory" | "branch";
  /** Routes with the same stage fire together (both eyes, both ears). */
  stage?: number;
  channel?: SenseId;
  /** Shown only inside its own topic, not in the overview or the Attention streams. */
  detail?: boolean;
}

export interface Pathway {
  id: PathId;
  title: string;
  short: string;
  subtitle: string;
  color: string;
  icon: string;
  intro: string;
  insight: string;
  caveat: string;
  steps: Step[];
  edges: Edge[];
  sourceIds: string[];
}

export interface Source {
  id: string;
  title: string;
  author: string;
  url: string;
  note: string;
}
