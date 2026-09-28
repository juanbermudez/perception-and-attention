// Shared zod pieces for tool inputs. Enums come from content, never from hard-coded lists.
import * as z from "zod";
import { TOUR_LIMITS } from "../api/tour";
import type { RegionId } from "../content/types";
import { REGION_IDS, STREAMS_REF, suggest } from "../model/refs";
import { DEFAULT_KEEP, LABEL_MODES, LAYER_IDS, type LabelMode, type LayerId, MAX_FRAME, PITCH_MAX, PITCH_MIN, SIDE_IDS, type Side } from "../model/view";
import { LIST_LIMIT, SEARCH_LIMIT } from "./help";

export const refField = (description: string) => z.string().trim().min(1).max(200).describe(description);

/** "unknown region id "V1"; closest: v1" — region fields are exact ids, so a near miss names the id to use. */
function regionIdError(input: unknown) {
  if (input === undefined) return "a region id is required";
  const closest = typeof input === "string" ? suggest(input, ["region"]).map((ref) => ref.slice("region:".length)) : [];
  return `unknown region id ${JSON.stringify(input)}${closest.length ? `; closest: ${closest.join(", ")}` : `; every id is listed in read({ ref: "help" })`}`;
}
/** For fields that accept only regions: bare ids, not refs (spec §5.1). */
export const regionIdSchema = z.enum(REGION_IDS as [RegionId, ...RegionId[]], { error: (issue) => regionIdError(issue.input) });
export const listLimit = z.number().int().min(1).max(LIST_LIMIT.max).describe(`Default ${LIST_LIMIT.default}`);
export const searchLimit = z.number().int().min(1).max(SEARCH_LIMIT.max).describe(`Default ${SEARCH_LIMIT.default}`);

/* ---------- ViewPatch (spec §5.3), for set_view and tour stops ---------- */

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

export const tourStopSchema = z.strictObject({
  ref: refField(`Where the stop goes: overview, topic:*, step:*, region:* or ${STREAMS_REF}`).optional(),
  view: viewPatchSchema.optional().describe("Applied after going to ref, as set_view does"),
  say: z.string().trim().max(TOUR_LIMITS.say).optional().describe("Caption shown during the stop"),
  seconds: z.number().min(TOUR_LIMITS.seconds.min).max(TOUR_LIMITS.seconds.max).optional().describe(`Default ${TOUR_LIMITS.seconds.default}`),
});
