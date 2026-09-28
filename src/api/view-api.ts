// View commands for agents and the UI: validate a ViewPatch, apply it to the shared state and
// the scene, report the resulting view with a one-line `said`, and keep a stack for Undo.
// No DOM: the scene is passed in, so this runs against a fake scene in Node tests.
import type { Vec3 } from "math";
import { regions } from "../content/regions";
import type { RegionId } from "../content/types";
import {
  type CameraPatch,
  cameraPose,
  effectiveLayers,
  gatedLayers,
  hasCameraChange,
  type Isolation,
  LAYER_IDS,
  type LabelMode,
  type LayerEffect,
  type LayerId,
  type NormalizedPatch,
  nearestSide,
  normalizeViewPatch,
  type Pose,
  round,
  type Side,
  zoomNearness,
} from "../model/view";
import type { ExplorerState } from "../state";
import { type ApiError, fail, type Result, type WriteResult } from "./result";

export const VIEW_STACK_DEPTH = 10;
/** The Undo label on the agent's toast after a view change. */
export const VIEW_UNDO_LABEL = "Back to previous view";

/** The part of the brain scene the view API drives (implemented by createBrainScene). */
export interface ViewScene {
  /** The camera pose, or its destination while animating. */
  pose(): Pose & { zoom: number };
  homePose(): Pose;
  focusPose(id: RegionId): Pose;
  frameRegions(ids: readonly RegionId[]): { target: Vec3; distance: number };
  setPose(pose: Partial<Pose>, instant?: boolean): void;
  snapLayers(): void;
  readonly gesturing: boolean;
  readonly homeDistance: number;
}

/** A compact view description; defaults are left out. */
export interface ViewReport {
  focus?: RegionId;
  frame?: RegionId[];
  yaw: number;
  pitch: number;
  zoom: number;
  /** After a change: the presence that was set. In `current()`: the effective presence (setting × isolate × zoom fade). */
  layers?: Partial<Record<LayerId, number>>;
  effect?: "fade";
  isolate?: Isolation;
  labels?: Exclude<LabelMode, "auto">;
  spotlight?: false;
  xray?: false;
  /** Layers the topic hides whatever their presence (ears outside hearing, for example). */
  gated?: LayerId[];
}
/** `undo` (when present) goes back to the view before this change; the tool runner hands it to the toast. */
export interface ViewResult extends WriteResult {
  view: ViewReport;
  /** Parts of the patch that were not applied; the rest was. */
  skipped?: { camera: ApiError };
}
export type ViewOutcome = Result<ViewResult>;

interface ViewSnapshot {
  pose: Pose;
  viewFocus: RegionId | null;
  layers: Record<LayerId, number>;
  layerEffect: LayerEffect;
  isolate: Isolation | null;
  labelMode: LabelMode;
  spotlight: boolean;
  xray: boolean;
}

const LOCKED = "The user is moving the view, so the camera was left as it is.";
const SIDE_SAID: Record<Side, string> = { front: "the front", back: "behind", left: "the left", right: "the right", top: "above", bottom: "below" };
const LABELS_SAID: Record<LabelMode, string> = {
  auto: "labels back to the topic's own",
  focus: "labels only on the shown and isolated regions",
  all: "all labels shown",
  none: "labels hidden",
};

/** Short region name for running text ("LGN · visual relay" → "LGN"). */
export function regionName(id: RegionId) {
  return regions[id].short.split(" · ")[0];
}
export function listNames(names: readonly string[], max = 4) {
  if (names.length > max) return `${names.slice(0, max - 1).join(", ")} and ${names.length - max + 1} more`;
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
const percent = (value: number) => `${Math.round(value * 100)}%`;
const zoomText = (zoom: number) => `${Number(zoom.toFixed(1))}×`;

export function createViewApi(state: ExplorerState, scene: ViewScene) {
  const stack: ViewSnapshot[] = [];

  function snapshot(): ViewSnapshot {
    const { target, yaw, pitch, distance } = scene.pose();
    return {
      pose: { target, yaw, pitch, distance },
      viewFocus: state.viewFocus,
      layers: { ...state.layers },
      layerEffect: state.layerEffect,
      isolate: state.isolate,
      labelMode: state.labelMode,
      spotlight: state.spotlight,
      xray: state.xray,
    };
  }

  function moveCamera(camera: CameraPatch, instant: boolean) {
    const pose = cameraPose(
      camera,
      { current: scene.pose(), home: () => scene.homePose(), focus: (id) => scene.focusPose(id), frame: (ids) => scene.frameRegions(ids) },
      scene.homeDistance,
    );
    // Focus points the highlight and view gap at the region without navigating; the next navigation clears it.
    if (camera.focus) state.viewFocus = camera.focus;
    else if (camera.reset || (camera.frame && state.viewFocus && !camera.frame.includes(state.viewFocus))) state.viewFocus = null;
    scene.setPose(pose, instant);
    return pose;
  }

  function applyState(patch: NormalizedPatch) {
    // Replace rather than mutate, so the scene can tell changes apart by reference.
    if (patch.layers) state.layers = { ...state.layers, ...patch.layers };
    if (patch.effect) state.layerEffect = patch.effect;
    if (patch.isolate !== undefined) state.isolate = patch.isolate && { regions: [...patch.isolate.regions], keep: patch.isolate.keep };
    if (patch.labels) state.labelMode = patch.labels;
    if (patch.spotlight !== undefined) state.spotlight = patch.spotlight;
    if (patch.xray !== undefined) state.xray = patch.xray;
  }

  function report(pose: Pose, options: { frame?: RegionId[]; effective?: boolean; gated?: (id: LayerId) => boolean } = {}): ViewReport {
    const view = {} as ViewReport;
    if (state.viewFocus) view.focus = state.viewFocus;
    if (options.frame) view.frame = [...options.frame];
    view.yaw = round(pose.yaw);
    view.pitch = round(pose.pitch);
    view.zoom = round(scene.homeDistance / pose.distance, 2);
    const layers: Partial<Record<LayerId, number>> = options.effective
      ? effectiveLayers(state.layers, state.isolate, zoomNearness(pose.distance, scene.homeDistance))
      : {};
    if (!options.effective) for (const id of LAYER_IDS) if (state.layers[id] !== 1) layers[id] = round(state.layers[id], 2);
    if (Object.keys(layers).length) view.layers = layers;
    if (state.layerEffect === "fade") view.effect = "fade";
    if (state.isolate) view.isolate = { regions: [...state.isolate.regions], keep: state.isolate.keep };
    if (state.labelMode !== "auto") view.labels = state.labelMode;
    if (!state.spotlight) view.spotlight = false;
    if (!state.xray) view.xray = false;
    const gated = gatedLayers(state).filter((id) => options.gated?.(id) ?? true);
    if (gated.length) view.gated = gated;
    return view;
  }

  function describeCamera(camera: CameraPatch, view: ViewReport) {
    const turned = camera.from !== undefined || camera.yaw !== undefined || camera.pitch !== undefined || camera.orbit !== undefined;
    if (!camera.focus && !camera.frame && !camera.reset && !turned) return `zoomed to ${zoomText(view.zoom)}`;
    let text = camera.focus
      ? `focused on ${regionName(camera.focus)}`
      : camera.frame
        ? `framed ${listNames(camera.frame.map(regionName))}`
        : camera.reset
          ? "back to the overview framing"
          : "now viewing";
    if (turned) {
      const side = camera.from ?? nearestSide(view.yaw, view.pitch);
      text += side ? ` from ${SIDE_SAID[side]}` : ` at yaw ${view.yaw}°, pitch ${view.pitch}°`;
    }
    if (camera.zoom !== undefined || camera.frame || camera.focus || (turned && camera.reset))
      text += `${turned && !camera.from ? "," : ""} at ${zoomText(view.zoom)}`;
    return text;
  }

  function describeLayers(layers: Partial<Record<LayerId, number>>) {
    const groups = new Map<string, string[]>();
    for (const id of LAYER_IDS) {
      const value = layers[id];
      if (value === undefined) continue;
      const verb = value === 0 ? (state.layerEffect === "dissolve" ? "dissolved" : "faded out") : value === 1 ? "restored" : `at ${percent(value)}`;
      groups.set(verb, [...(groups.get(verb) ?? []), id.replace("_", " ")]);
    }
    return [...groups].map(([verb, names]) => `${listNames(names)} ${verb}`);
  }

  function describe(patch: NormalizedPatch, view: ViewReport, moved: boolean, cameraSkipped: boolean) {
    const parts: string[] = [];
    if (cameraSkipped) parts.push("kept the camera still while you move it");
    else if (moved && patch.camera) parts.push(describeCamera(patch.camera, view));
    if (patch.layers) parts.push(...describeLayers(patch.layers));
    else if (patch.effect) parts.push(`layer changes now ${patch.effect}`);
    if (patch.isolate !== undefined) {
      const effect = state.layerEffect === "dissolve" ? "dissolved" : "faded";
      parts.push(
        patch.isolate
          ? `isolated ${listNames(patch.isolate.regions.map(regionName))}, ${effect} the rest${patch.isolate.keep > 0.1 ? ` to ${percent(patch.isolate.keep)}` : ""}`
          : "stopped isolating",
      );
    }
    if (patch.labels) parts.push(LABELS_SAID[patch.labels]);
    if (patch.spotlight !== undefined) parts.push(`spotlight ${patch.spotlight ? "on" : "off"}`);
    if (patch.xray !== undefined) parts.push(`x-ray ${patch.xray ? "on" : "off"}`);
    if (!parts.length) return "View unchanged.";
    const text = parts.join("; ");
    return `${text[0].toUpperCase()}${text.slice(1)}.`;
  }

  function withSkipped(result: ViewResult, skipped: boolean): ViewResult {
    return skipped ? { ...result, skipped: { camera: { code: "locked_by_user", message: LOCKED } } } : result;
  }

  /**
   * Apply a ViewPatch (spec §5.3). Only the fields given change. Returns before the camera arrives; `said`
   * describes the target. Mid-gesture the camera part is skipped (`locked_by_user`) and the rest applies;
   * a patch that only moves the camera then fails as a whole.
   */
  function apply(input: unknown): ViewOutcome {
    const normalized = normalizeViewPatch(input);
    if ("error" in normalized) return normalized;
    const { patch } = normalized;
    const cameraAsked = hasCameraChange(patch.camera),
      cameraSkipped = cameraAsked && scene.gesturing;
    const changesState =
      patch.layers !== undefined ||
      patch.effect !== undefined ||
      patch.isolate !== undefined ||
      patch.labels !== undefined ||
      patch.spotlight !== undefined ||
      patch.xray !== undefined;
    if (cameraSkipped && !changesState) return fail("locked_by_user", LOCKED);
    let entry: ViewSnapshot | undefined;
    if ((cameraAsked && !cameraSkipped) || changesState) {
      entry = snapshot();
      stack.push(entry);
      if (stack.length > VIEW_STACK_DEPTH) stack.shift();
    }
    const pose = cameraAsked && !cameraSkipped && patch.camera ? moveCamera(patch.camera, patch.instant) : scene.pose();
    applyState(patch);
    if (patch.instant) scene.snapLayers();
    const touched = new Set(Object.keys(patch.layers ?? {}));
    const view = report(pose, { frame: cameraAsked && !cameraSkipped ? patch.camera?.frame : undefined, gated: (id) => touched.has(id) });
    const result = withSkipped({ view, said: describe(patch, view, cameraAsked && !cameraSkipped, cameraSkipped) }, cameraSkipped);
    // The toast's Undo reverses this change only while it is still the latest one.
    if (entry)
      result.undo = {
        label: VIEW_UNDO_LABEL,
        run: () => {
          if (stack.at(-1) === entry) undo();
        },
      };
    return result;
  }

  /** Return to the view before the last change (camera, layers, isolate, labels). */
  function undo(): ViewOutcome {
    const previous = stack.pop();
    if (!previous) return fail("not_available", "There is no earlier view to go back to.");
    const cameraSkipped = scene.gesturing;
    if (!cameraSkipped) scene.setPose(previous.pose);
    state.viewFocus = previous.viewFocus;
    state.layers = previous.layers;
    state.layerEffect = previous.layerEffect;
    state.isolate = previous.isolate;
    state.labelMode = previous.labelMode;
    state.spotlight = previous.spotlight;
    state.xray = previous.xray;
    const view = report(cameraSkipped ? scene.pose() : previous.pose, { gated: () => false });
    return withSkipped(
      { view, said: cameraSkipped ? "Back to the previous view, except the camera, which you are moving." : "Back to the previous view." },
      cameraSkipped,
    );
  }

  return {
    apply,
    undo,
    /** The view as rendered once it settles: effective layer presence and every gated layer (for get_context). */
    current(): ViewReport {
      return report(scene.pose(), { effective: true });
    },
    /** How many views Undo can go back. */
    get depth() {
      return stack.length;
    },
  };
}
export type ViewApi = ReturnType<typeof createViewApi>;
