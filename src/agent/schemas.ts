// Shared zod pieces for tool inputs. Enums come from content, never from hard-coded lists.
import * as z from "zod";
import { TOUR_LIMITS } from "../api/tour";
import type { RegionId } from "../content/types";
import { canonicalRegion, REGION_IDS, STREAMS_REF, suggest } from "../model/refs";
import {
  DEFAULT_KEEP,
  LABEL_MODES,
  LAYER_IDS,
  type LabelMode,
  type LayerId,
  MAX_FRAME,
  normalizeViewPatch,
  PITCH_MAX,
  PITCH_MIN,
  SIDE_IDS,
  type Side,
} from "../model/view";
import { LIST_LIMIT, SEARCH_LIMIT } from "./help";

export const refField = (description: string) => z.string().trim().min(1).max(200).describe(description);

/** "unknown region id "visual cortex"; closest: v1, …": a near miss names the ids to use. */
function regionIdError(input: unknown) {
  if (input === undefined) return "a region id is required";
  if (typeof input !== "string") return `expected a region id such as "v1", got ${JSON.stringify(input)}`;
  const prefix = /^\s*([a-z]+):/i.exec(input)?.[1].toLowerCase();
  const text = prefix ? input.slice(input.indexOf(":") + 1).trim() : input.trim();
  const closest = suggest(text, ["region"]).map((ref) => ref.slice("region:".length));
  const hint = closest.length ? `; closest: ${closest.join(", ")}` : `; every id is listed in read({ ref: "help" })`;
  if (prefix && prefix !== "region") return `region fields take region ids such as "v1", not ${prefix}: refs${hint}`;
  return `unknown region id ${JSON.stringify(text)}${hint}`;
}
/** Region ids as the schema lists them. */
export const regionIdEnum = z.enum(REGION_IDS as [RegionId, ...RegionId[]], { error: (issue) => regionIdError(issue.input) });
/**
 * For fields that take only regions (spec §5.1). Forgiving on input: "V1" and "region:v1" both mean v1, so a
 * ref copied from go or read works here too. The JSON Schema still lists the exact ids.
 */
export const regionIdSchema = z.preprocess((value) => (typeof value === "string" ? (canonicalRegion(value) ?? value) : value), regionIdEnum);
export const listLimit = z.number().int().min(1).max(LIST_LIMIT.max).describe(`Default ${LIST_LIMIT.default}`);
export const searchLimit = z.number().int().min(1).max(SEARCH_LIMIT.max).describe(`Default ${SEARCH_LIMIT.default}`);

/* ---------- ViewPatch (spec §5.3), in full for set_view ---------- */

const presence = z.number().min(0).max(1);
const regionList = (max: number) => z.array(regionIdSchema).max(max);

const cameraSchema = z
  .strictObject({
    reset: z.boolean().optional().describe("Start from the overview framing"),
    focus: regionIdSchema.optional().describe("One region, from its preset side, as selecting it does. Not with frame."),
    frame: regionList(MAX_FRAME).min(1).optional().describe(`Fit 1–${MAX_FRAME} regions in view. Not with focus.`),
    from: z
      .enum(SIDE_IDS as [Side, ...Side[]])
      .optional()
      .describe("Anatomical side to look from"),
    yaw: z.number().min(-360).max(360).optional().describe("Degrees: 0 front, 90 left, -90 right, 180 back"),
    pitch: z.number().min(-90).max(90).optional().describe(`Elevation in degrees, clamped to ${PITCH_MIN}…${PITCH_MAX}`),
    orbit: z.array(z.number().min(-360).max(360)).length(2).optional().describe("Relative [yaw, pitch] degrees; positive turns left and up"),
    zoom: z.number().positive().max(20).optional().describe("1 = overview distance, 2 = twice as close; clamped to about 0.66–7.4"),
  })
  .refine((camera) => camera.focus === undefined || camera.frame === undefined, { message: "focus and frame cannot be used together; use one" })
  .describe("Applied in order: reset, focus or frame, from/yaw/pitch, orbit, zoom. Fields left out keep their values.");

const layerShape = Object.fromEntries(LAYER_IDS.map((id) => [id, presence.optional()])) as Record<LayerId, z.ZodOptional<typeof presence>>;

const isolateSchema = z
  .union([regionList(REGION_IDS.length), z.strictObject({ regions: regionList(REGION_IDS.length), keep: presence.optional() }), z.null()], {
    error: "isolate takes a list of region ids, { regions, keep }, or null",
  })
  .describe(`Show only these regions with their routes, markers and labels; the rest drops to keep (default ${DEFAULT_KEEP}). null or [] stops.`);

export const viewPatchSchema = z.strictObject({
  camera: cameraSchema.optional(),
  layers: z.strictObject(layerShape).optional().describe("Presence per layer: 0 gone, 1 normal. Layers the topic hides stay hidden."),
  effect: z.enum(["dissolve", "fade"]).optional().describe("How layer changes render; default dissolve"),
  isolate: isolateSchema.optional(),
  labels: z
    .enum(LABEL_MODES as [LabelMode, ...LabelMode[]])
    .optional()
    .describe("auto: the topic's labels; focus: shown and isolated regions; all; none"),
  spotlight: z.boolean().optional().describe("Dim what the current step is not about (default on)"),
  xray: z.boolean().optional().describe("See-through cortex (default on)"),
  motion: z.enum(["smooth", "instant"]).optional().describe("Default smooth; reduced motion is always instant"),
});

/* ---------- A view patch inside another tool's input ---------- */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const regionOrSelf = (value: unknown) => (typeof value === "string" ? (canonicalRegion(value) ?? value) : value);
const regionsOrSelf = (value: unknown) => (Array.isArray(value) ? value.map(regionOrSelf) : value);

/** The same forgiving region ids as set_view ("V1", "region:v1") in camera.focus, camera.frame and isolate. */
function canonicalViewRegions(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const view = { ...value };
  if (isRecord(view.camera)) {
    const camera = { ...view.camera };
    if (camera.focus !== undefined) camera.focus = regionOrSelf(camera.focus);
    if (camera.frame !== undefined) camera.frame = regionsOrSelf(camera.frame);
    view.camera = camera;
  }
  if (Array.isArray(view.isolate)) view.isolate = regionsOrSelf(view.isolate);
  else if (isRecord(view.isolate) && view.isolate.regions !== undefined) view.isolate = { ...view.isolate, regions: regionsOrSelf(view.isolate.regions) };
  return view;
}

/**
 * A set_view patch inside another tool's input: tour stops, saved view blocks and a question's Show me.
 * The JSON Schema spells the ViewPatch out once, on set_view; here it is a plain object that the view
 * API's own rules check, so a tour stop and set_view accept exactly the same patches.
 */
export const viewPatchField = (description: string) =>
  z
    .preprocess(
      canonicalViewRegions,
      z.record(z.string(), z.unknown()).superRefine((view, context) => {
        const checked = normalizeViewPatch(view);
        if ("error" in checked) {
          const options = checked.error.options?.length ? ` Options: ${checked.error.options.join(", ")}.` : "";
          context.addIssue({ code: "custom", message: `${checked.error.message}${options}` });
        }
      }),
    )
    .describe(description);

export const tourStopSchema = z.strictObject({
  ref: refField(`Where the stop goes: overview, topic:*, step:*, region:* or ${STREAMS_REF}`).optional(),
  view: viewPatchField("A set_view patch (same fields as set_view), applied after going to ref").optional(),
  say: z.string().trim().max(TOUR_LIMITS.say).optional().describe("Caption shown during the stop"),
  seconds: z.number().min(TOUR_LIMITS.seconds.min).max(TOUR_LIMITS.seconds.max).optional().describe(`Default ${TOUR_LIMITS.seconds.default}`),
});
