// View math for agent and UI camera control: anatomical sides, yaw/pitch/zoom ↔ orbit
// camera, focus presets, frame fit, layer presence and ViewPatch normalization.
// Pure, so it is tested in Node (tests/view.test.mjs).
//
// Scene axes: anterior (front) is −X, superior (top) is +Y, left is +Z.
// Agent angles: yaw turns around Y from the front toward the left (0 front, 90 left,
// −90 right, 180 back); pitch is elevation. The camera direction, from the target
// toward the camera, is (−cos yaw · cos pitch, sin pitch, sin yaw · cos pitch).
import { clamp, lerp, type Vec3, vec3 } from "math";
import { regions } from "../content/regions";
import type { PathId, RegionId, SenseId } from "../content/types";

export interface Angles {
  yaw: number;
  pitch: number;
}
export const SIDES = {
  front: { yaw: 0, pitch: 10 },
  left: { yaw: 90, pitch: 10 },
  right: { yaw: -90, pitch: 10 },
  back: { yaw: 180, pitch: 10 },
  top: { yaw: 0, pitch: 88 },
  bottom: { yaw: 0, pitch: -59 },
} as const satisfies Record<string, Angles>;
export type Side = keyof typeof SIDES;
export const SIDE_IDS = Object.keys(SIDES) as Side[];

/** Scene objects whose presence the view can change (spec §5.2). */
export const LAYER_IDS = [
  "skull",
  "cortex",
  "cerebellum",
  "brainstem",
  "deep",
  "eyes",
  "optic",
  "ears",
  "auditory_nerve",
  "temporal_bone",
  "routes",
  "activity",
  "markers",
  "labels",
  "floor",
] as const;
export type LayerId = (typeof LAYER_IDS)[number];
/** Anatomy layers drop to the isolate `keep` level; routes, activity, markers and labels are filtered per region instead. */
export const ANATOMY_LAYERS: ReadonlySet<LayerId> = new Set<LayerId>([
  "skull",
  "cortex",
  "cerebellum",
  "brainstem",
  "deep",
  "eyes",
  "optic",
  "ears",
  "auditory_nerve",
  "temporal_bone",
]);
export type LayerEffect = "dissolve" | "fade";
export type LabelMode = "auto" | "focus" | "all" | "none";
export const LABEL_MODES: readonly LabelMode[] = ["auto", "focus", "all", "none"];
export interface Isolation {
  regions: RegionId[];
  /** Presence left for everything outside the isolated regions. */
  keep: number;
}
export const DEFAULT_KEEP = 0.08;

export function defaultLayers(): Record<LayerId, number> {
  const layers = {} as Record<LayerId, number>;
  for (const id of LAYER_IDS) layers[id] = 1;
  return layers;
}

/* ---------- Camera limits (OrbitControls in brain-scene.ts) ---------- */

export const MIN_DISTANCE = 1.6;
export const MAX_DISTANCE = 18;
/** OrbitControls keeps the polar angle in [0.001, 0.83π], so elevation stays within these degrees. */
export const PITCH_MIN = -59;
export const PITCH_MAX = 89;
/** Zooming in past this fraction of the overview distance starts fading the outer layers… */
export const ZOOM_FADE_START = 0.92;
/** …and at this fraction the fade is complete. */
export const ZOOM_FADE_END = 0.5;
/** Presence kept at full zoom, per layer. Deep relays and brainstem stay more visible. */
export const LAYER_ZOOM_KEEP: Readonly<Partial<Record<LayerId, number>>> = { skull: 0.12, cortex: 0.3, cerebellum: 0.35, brainstem: 0.65, deep: 0.65 };
/** Frame fit: padding around the regions, in scene units, and the extra margin on the fitted distance. */
export const FRAME_PADDING = 0.4;
export const FRAME_MARGIN = 1.15;
export const MAX_FRAME = 12;

const DEG = Math.PI / 180;

/** Degrees wrapped to (−180, 180]. */
export function normalizeYaw(yaw: number) {
  const wrapped = ((((yaw + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}
export function clampPitch(pitch: number) {
  return clamp(pitch, PITCH_MIN, PITCH_MAX);
}

/** Unit vector from the target toward the camera. */
export function directionFromAngles(out: Vec3, yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch * DEG);
  return vec3.set(out, -Math.cos(yaw * DEG) * cosPitch, Math.sin(pitch * DEG), Math.sin(yaw * DEG) * cosPitch);
}
export function anglesFromDirection(direction: Vec3): Angles {
  const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  return {
    yaw: normalizeYaw(Math.atan2(direction[2], -direction[0]) / DEG),
    pitch: Math.asin(clamp(direction[1] / length, -1, 1)) / DEG,
  };
}
/** OrbitControls spherical angles (radians): theta around Y from +Z toward +X, phi down from +Y. */
export function orbitFromAngles(yaw: number, pitch: number) {
  return { theta: (yaw - 90) * DEG, phi: (90 - pitch) * DEG };
}
export function anglesFromOrbit(theta: number, phi: number): Angles {
  return { yaw: normalizeYaw(theta / DEG + 90), pitch: 90 - phi / DEG };
}

/** The anatomical side a view is closest to, or null if it is between sides. */
export function nearestSide(yaw: number, pitch: number, tolerance = 1): Side | null {
  for (const side of SIDE_IDS) {
    const angles = SIDES[side];
    const yawOff = Math.abs(normalizeYaw(yaw - angles.yaw));
    // Looking straight down or up, yaw barely changes the view.
    if (Math.abs(pitch - angles.pitch) <= tolerance && (yawOff <= tolerance || (side === "top" && pitch > 85))) return side;
  }
  return null;
}

/* ---------- Zoom ---------- */

/** Zoom is relative to the overview distance: 1 is the overview, 2 is twice as close. */
export function distanceForZoom(zoom: number, homeDistance: number) {
  return clamp(homeDistance / zoom, MIN_DISTANCE, MAX_DISTANCE);
}
export function zoomForDistance(distance: number, homeDistance: number) {
  return homeDistance / distance;
}
export function zoomLimits(homeDistance: number) {
  return { min: homeDistance / MAX_DISTANCE, max: homeDistance / MIN_DISTANCE };
}
/** 0 at the overview distance, 1 when zoomed in close (smoothstep); the scene fades outer layers by it. */
export function zoomNearness(distance: number, homeDistance: number) {
  const t = clamp((homeDistance * ZOOM_FADE_START - distance) / (homeDistance * (ZOOM_FADE_START - ZOOM_FADE_END)), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Opacity factor zooming applies to a layer, given zoomNearness. */
export function layerZoomFade(id: LayerId, near: number) {
  return lerp(1, LAYER_ZOOM_KEEP[id] ?? 1, near);
}

/* ---------- Framing ---------- */

/** Vertical field of view (degrees) for a stage aspect: below 1.25 it widens so callout columns keep side gutters. */
export function stageFov(aspect: number) {
  return (2 * Math.atan(Math.tan((37 * Math.PI) / 360) * Math.max(1, 1.25 / clamp(aspect, 0.25, 1.25))) * 180) / Math.PI;
}
/** The smaller of the vertical and horizontal half-angles, in radians. */
export function halfFov(fovDegrees: number, aspect: number) {
  const vertical = (fovDegrees * Math.PI) / 360;
  return Math.min(vertical, Math.atan(Math.tan(vertical) * aspect));
}
/** Fit points in view: look at their centroid from far enough that a padded bounding sphere fills the narrower field of view. */
export function frameFit(points: readonly Vec3[], fovDegrees: number, aspect: number) {
  const target = vec3.create();
  for (const point of points) vec3.add(target, target, point);
  vec3.scale(target, target, 1 / Math.max(1, points.length));
  let radius = 0;
  for (const point of points) radius = Math.max(radius, vec3.distance(target, point));
  radius += FRAME_PADDING;
  const distance = clamp((radius / Math.sin(halfFov(fovDegrees, aspect))) * FRAME_MARGIN, MIN_DISTANCE, MAX_DISTANCE);
  return { target, radius, distance };
}

/** The overview framing: the whole head, centred on the skull. */
export function homeCamera(skullCenterY: number, outTarget: Vec3, outPosition: Vec3) {
  vec3.set(outTarget, 0, skullCenterY, 0);
  vec3.set(outPosition, -5.65, skullCenterY + 2.95, 10.05);
}

/**
 * Where selecting a region looks, and the side it looks from, so the region stays in
 * front of the skull. The side follows the region's hemisphere (z sign).
 */
export function focusPreset(id: RegionId, centerY: number, outTarget: Vec3, outDirection: Vec3) {
  const region = regions[id].position,
    side = region[2] < 0 ? -1 : 1;
  vec3.set(outTarget, region[0] * 0.35, lerp(centerY, region[1], 0.35), region[2] * 0.35);
  if (id.startsWith("retina") || id === "chiasm") vec3.set(outDirection, -1, 0.18, side * 0.6);
  else if (id === "v1" || id === "l5" || id === "l6" || id === "extrastriate") vec3.set(outDirection, 0.75, 0.22, side);
  else if (id === "cingulate" || id === "motor" || id === "s1") vec3.set(outDirection, -0.15, 0.75, side);
  else if (id === "medulla" || id.startsWith("brainstem")) vec3.set(outDirection, 0.5, -0.16, side);
  // Areas on the underside of the temporal lobe are seen from below and to the side.
  else if (id === "ffa" || id === "ppa" || id === "vwfa" || id === "it") vec3.set(outDirection, 0.3, -0.6, side);
  else if (id === "mt" || id === "eba") vec3.set(outDirection, 0.45, 0.05, side);
  else vec3.set(outDirection, clamp(region[0] * 0.2, -0.6, 0.6), 0.22, side);
  return outDirection;
}

/* ---------- Layers ---------- */

type TopicView = { overview: boolean; path: PathId; enabledSenses: Record<SenseId, boolean> };
// The overview runs every sense's routes, so it shows every sense organ; only the Attention
// topic's Streams toggles turn them off.
export function visionShown(view: TopicView) {
  return view.overview || view.path === "vision" || (view.path === "attention" && view.enabledSenses.vision);
}
export function hearingShown(view: TopicView) {
  return view.overview || view.path === "hearing" || (view.path === "attention" && view.enabledSenses.hearing);
}
/** Layers the current topic or toggles hide, whatever their presence (eyes appear only with vision, ears only with hearing). */
export function gatedLayers(view: TopicView): LayerId[] {
  const gated: LayerId[] = [];
  if (!visionShown(view)) gated.push("eyes", "optic");
  if (!hearingShown(view)) gated.push("ears", "auditory_nerve", "temporal_bone");
  return gated;
}
/** Presence a layer eases toward: its own setting, capped at `keep` for anatomy while regions are isolated. */
export function presenceTarget(layers: Readonly<Record<LayerId, number>>, isolate: Isolation | null, id: LayerId) {
  const requested = layers[id];
  return isolate && ANATOMY_LAYERS.has(id) ? Math.min(requested, isolate.keep) : requested;
}
/** Presence as rendered once the view settles: setting × isolate × zoom fade. Only layers below 1 are listed. */
export function effectiveLayers(layers: Readonly<Record<LayerId, number>>, isolate: Isolation | null, near: number) {
  const out: Partial<Record<LayerId, number>> = {};
  for (const id of LAYER_IDS) {
    const value = presenceTarget(layers, isolate, id) * layerZoomFade(id, near);
    if (value < 0.995) out[id] = round(value, 2);
  }
  return out;
}

/* ---------- Navigation ---------- */

/** The view settings an agent changes with set_view that navigation restores. */
export interface AgentViewSettings {
  layers: Record<LayerId, number>;
  layerEffect: LayerEffect;
  isolate: Isolation | null;
  labelMode: LabelMode;
  viewFocus: RegionId | null;
}
export type NavigationTarget = { overview: true } | { overview: false; path: PathId };

/**
 * Going home, or into another topic, restores the default layers, isolation, label mode and view
 * focus, so an agent's view does not linger somewhere it no longer fits. Moving within a topic keeps
 * them. A tour stop navigates first and applies its own view after, so the stop's settings win.
 * Returns true if anything changed.
 */
export function clearViewOnNavigate(view: AgentViewSettings & { overview: boolean; path: PathId }, to: NavigationTarget) {
  if (!to.overview && !view.overview && view.path === to.path) return false;
  const layersChanged = LAYER_IDS.some((id) => view.layers[id] !== 1);
  const changed = layersChanged || view.layerEffect !== "dissolve" || view.isolate !== null || view.labelMode !== "auto" || view.viewFocus !== null;
  if (layersChanged) view.layers = defaultLayers();
  view.layerEffect = "dissolve";
  view.isolate = null;
  view.labelMode = "auto";
  view.viewFocus = null;
  return changed;
}

/* ---------- ViewPatch ---------- */

export interface CameraPatch {
  /** Back to the overview framing. */
  reset?: boolean;
  /** One region, from its preset side (as selecting it does). */
  focus?: RegionId;
  /** Fit 1–12 regions in view. */
  frame?: RegionId[];
  from?: Side;
  /** Absolute degrees: 0 front, 90 left, −90 right, 180 back. */
  yaw?: number;
  /** Absolute degrees, clamped to [−59, 89]. */
  pitch?: number;
  /** Relative [yaw, pitch] degrees: positive turns toward the left and up. */
  orbit?: [number, number];
  /** 1 = overview distance; 2 = twice as close. */
  zoom?: number;
}
export interface ViewPatch {
  camera?: CameraPatch;
  layers?: Partial<Record<LayerId, number>>;
  effect?: LayerEffect;
  isolate?: RegionId[] | { regions: RegionId[]; keep?: number } | null;
  labels?: LabelMode;
  spotlight?: boolean;
  xray?: boolean;
  motion?: "smooth" | "instant";
}
/** A validated patch: ids resolved, isolate in one shape, `isolate: undefined` means unchanged. */
export interface NormalizedPatch {
  camera?: CameraPatch;
  layers?: Partial<Record<LayerId, number>>;
  effect?: LayerEffect;
  isolate?: Isolation | null;
  labels?: LabelMode;
  spotlight?: boolean;
  xray?: boolean;
  instant: boolean;
}
export interface PatchError {
  code: "bad_input";
  message: string;
  options?: string[];
}
export interface Pose {
  target: Vec3;
  yaw: number;
  pitch: number;
  distance: number;
}

const PATCH_KEYS = new Set(["camera", "layers", "effect", "isolate", "labels", "spotlight", "xray", "motion"]);
const CAMERA_KEYS = new Set(["reset", "focus", "frame", "from", "yaw", "pitch", "orbit", "zoom"]);
const regionsByLowerId = new Map((Object.keys(regions) as RegionId[]).map((id) => [id.toLowerCase(), id]));

class BadInput extends Error {
  constructor(
    message: string,
    readonly options?: string[],
  ) {
    super(message);
  }
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function finite(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BadInput(`${field} must be a number.`);
  return value;
}
function unit(value: unknown, field: string) {
  const number = finite(value, field);
  if (number < 0 || number > 1) throw new BadInput(`${field} must be between 0 and 1.`);
  return number;
}
function bool(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new BadInput(`${field} must be true or false.`);
  return value;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new BadInput(`${field} must be one of: ${allowed.join(", ")}.`, [...allowed]);
  return value as T;
}
function onlyKeys(value: Record<string, unknown>, allowed: Set<string>, field: string) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new BadInput(`Unknown field ${field}${key}.`, [...allowed]);
}
/** Region ids are matched case-insensitively ("V1" → "v1", "retinar" → "retinaR"). */
export function regionIdFor(value: unknown): RegionId | undefined {
  return typeof value === "string" ? regionsByLowerId.get(value.toLowerCase()) : undefined;
}
function regionId(value: unknown, field: string): RegionId {
  const id = regionIdFor(value);
  if (id) return id;
  // Suggest ids whose id or name contains the text ("visual cortex" → v1).
  const text = String(value).toLowerCase();
  const options = (Object.keys(regions) as RegionId[]).filter(
    (candidate) => candidate.toLowerCase().includes(text) || `${regions[candidate].label} ${regions[candidate].short}`.toLowerCase().includes(text),
  );
  throw new BadInput(`${field}: unknown region id "${String(value)}".`, options.slice(0, 5));
}
function regionList(value: unknown, field: string, max: number) {
  if (!Array.isArray(value)) throw new BadInput(`${field} must be a list of region ids.`);
  if (value.length > max) throw new BadInput(`${field} takes at most ${max} regions.`);
  return [...new Set(value.map((item) => regionId(item, field)))];
}

function normalizeCamera(value: unknown): CameraPatch {
  if (!isRecord(value)) throw new BadInput("camera must be an object.");
  onlyKeys(value, CAMERA_KEYS, "camera.");
  if (value.focus !== undefined && value.frame !== undefined) throw new BadInput("camera.focus and camera.frame cannot be used together; use one.");
  const camera: CameraPatch = {};
  if (value.reset !== undefined) camera.reset = bool(value.reset, "camera.reset");
  if (value.focus !== undefined) camera.focus = regionId(value.focus, "camera.focus");
  if (value.frame !== undefined) {
    camera.frame = regionList(value.frame, "camera.frame", MAX_FRAME);
    if (!camera.frame.length) throw new BadInput("camera.frame needs at least one region.");
  }
  if (value.from !== undefined) camera.from = oneOf(value.from, SIDE_IDS, "camera.from");
  if (value.yaw !== undefined) camera.yaw = finite(value.yaw, "camera.yaw");
  if (value.pitch !== undefined) camera.pitch = finite(value.pitch, "camera.pitch");
  if (value.orbit !== undefined) {
    if (!Array.isArray(value.orbit) || value.orbit.length !== 2) throw new BadInput("camera.orbit must be [yaw, pitch] in degrees.");
    camera.orbit = [finite(value.orbit[0], "camera.orbit[0]"), finite(value.orbit[1], "camera.orbit[1]")];
  }
  if (value.zoom !== undefined) {
    camera.zoom = finite(value.zoom, "camera.zoom");
    if (camera.zoom <= 0) throw new BadInput("camera.zoom must be greater than 0.");
  }
  return camera;
}

function normalizeIsolate(value: unknown): Isolation | null {
  if (value === null) return null;
  const input = Array.isArray(value) ? { regions: value } : value;
  if (!isRecord(input)) throw new BadInput("isolate must be a list of region ids, { regions, keep }, or null.");
  onlyKeys(input, new Set(["regions", "keep"]), "isolate.");
  const ids = regionList(input.regions, "isolate.regions", Object.keys(regions).length);
  // An empty set isolates nothing, so it clears isolation.
  if (!ids.length) return null;
  return { regions: ids, keep: input.keep === undefined ? DEFAULT_KEEP : unit(input.keep, "isolate.keep") };
}

/** Validate a ViewPatch. Unknown fields and ids are rejected; zoom and pitch are clamped later, when the pose resolves. */
export function normalizeViewPatch(input: unknown): { patch: NormalizedPatch } | { error: PatchError } {
  try {
    if (!isRecord(input)) throw new BadInput("A view patch must be an object.");
    onlyKeys(input, PATCH_KEYS, "");
    const patch: NormalizedPatch = { instant: false };
    if (input.camera !== undefined) patch.camera = normalizeCamera(input.camera);
    if (input.layers !== undefined) {
      if (!isRecord(input.layers)) throw new BadInput("layers must map layer ids to presence (0–1).");
      patch.layers = {};
      for (const [key, value] of Object.entries(input.layers)) patch.layers[oneOf(key, LAYER_IDS, "layers key")] = unit(value, `layers.${key}`);
    }
    if (input.effect !== undefined) patch.effect = oneOf(input.effect, ["dissolve", "fade"] as const, "effect");
    if (input.isolate !== undefined) patch.isolate = normalizeIsolate(input.isolate);
    if (input.labels !== undefined) patch.labels = oneOf(input.labels, LABEL_MODES, "labels");
    if (input.spotlight !== undefined) patch.spotlight = bool(input.spotlight, "spotlight");
    if (input.xray !== undefined) patch.xray = bool(input.xray, "xray");
    if (input.motion !== undefined) patch.instant = oneOf(input.motion, ["smooth", "instant"] as const, "motion") === "instant";
    return { patch };
  } catch (error) {
    if (!(error instanceof BadInput)) throw error;
    return {
      error: error.options?.length ? { code: "bad_input", message: error.message, options: error.options } : { code: "bad_input", message: error.message },
    };
  }
}

/** True when the camera part asks for any change. */
export function hasCameraChange(camera: CameraPatch | undefined): camera is CameraPatch {
  return camera !== undefined && Object.keys(camera).length > 0;
}

/** What the scene provides to resolve a camera patch. */
export interface PoseSource {
  current: Pose;
  home: () => Pose;
  focus: (id: RegionId) => Pose;
  frame: (ids: readonly RegionId[]) => { target: Vec3; distance: number };
}
/**
 * The pose a camera patch starts from, by precedence: `reset` → the overview; then `focus`
 * (the region's preset side and distance) or `frame` (the fit's target and distance, keeping
 * the direction so far). Without either, the current pose.
 */
export function cameraBase(camera: CameraPatch, source: PoseSource): Pose {
  const base = camera.reset ? source.home() : source.current;
  if (camera.focus) return source.focus(camera.focus);
  if (!camera.frame) return base;
  const fit = source.frame(camera.frame);
  return { target: fit.target, yaw: base.yaw, pitch: base.pitch, distance: fit.distance };
}
/** Resolve a camera patch to the pose the camera should move to (spec §5.3 precedence). */
export function cameraPose(camera: CameraPatch, source: PoseSource, homeDistance: number): Pose {
  return resolvePose(cameraBase(camera, source), camera, homeDistance);
}

/**
 * Apply the direction and zoom parts of a camera patch to a base pose (see cameraBase), in
 * order: `from`, `yaw`/`pitch` (absolute), `orbit` (relative), `zoom`. Fields left out keep
 * the base's values.
 */
export function resolvePose(base: Pose, camera: CameraPatch, homeDistance: number): Pose {
  let yaw = base.yaw,
    pitch = base.pitch,
    distance = base.distance;
  if (camera.from) ({ yaw, pitch } = SIDES[camera.from]);
  if (camera.yaw !== undefined) yaw = camera.yaw;
  if (camera.pitch !== undefined) pitch = camera.pitch;
  if (camera.orbit) {
    yaw += camera.orbit[0];
    pitch = clampPitch(pitch) + camera.orbit[1];
  }
  if (camera.zoom !== undefined) distance = homeDistance / camera.zoom;
  return {
    target: vec3.clone(base.target),
    yaw: normalizeYaw(yaw),
    pitch: clampPitch(pitch),
    distance: clamp(distance, MIN_DISTANCE, MAX_DISTANCE),
  };
}

export function round(value: number, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale + 0;
}
