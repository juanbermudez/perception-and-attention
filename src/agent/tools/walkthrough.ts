import * as z from "zod";
import { TOUR_LIMITS } from "../../api/tour";
import { WALK_SECONDS } from "../../model/topics";
import { refField, tourStopSchema } from "../schemas";
import { defineTool } from "../webmcp";

export const walkthroughTool = defineTool({
  name: "walkthrough",
  title: "Play a walkthrough or a tour",
  description:
    "Control a topic's built-in walkthrough, which steps through its regions with signals in 3D: play (from the current step, or from ref), pause, next, prev, or restart (from step 1). tour plays your own captioned stops in order: each goes to its ref, applies its view, and shows say in a caption bar; any user click, key or orbit pauses it. stop ends a tour or walkthrough. While a tour runs, pause, play, next, prev and restart without ref act on the tour.",
  readOnly: false,
  input: z
    .strictObject({
      action: z.enum(["play", "pause", "next", "prev", "restart", "tour", "stop"]),
      ref: refField("play and restart only: a topic or step ref. Default the open topic.").optional(),
      seconds: z
        .number()
        .min(WALK_SECONDS.min)
        .max(WALK_SECONDS.max)
        .optional()
        .describe(`play and restart: seconds per step, default ${WALK_SECONDS.default}. tour: the default for stops without their own.`),
      stops: z.array(tourStopSchema).min(1).max(TOUR_LIMITS.stops).optional().describe(`tour only: 1–${TOUR_LIMITS.stops} stops, played in order`),
    })
    .superRefine((input, context) => {
      if (input.action === "tour" && input.stops === undefined) context.addIssue({ code: "custom", path: ["stops"], message: "tour needs stops" });
      if (input.action !== "tour" && input.stops !== undefined)
        context.addIssue({ code: "custom", path: ["stops"], message: `stops applies to tour, not ${input.action}` });
    }),
  run: (input, api) => api.walkthrough(input),
});
