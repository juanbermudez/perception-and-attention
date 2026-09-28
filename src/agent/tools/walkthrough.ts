import * as z from "zod";
import { WALK_SECONDS } from "../../model/topics";
import { refField } from "../schemas";
import { defineTool } from "../webmcp";

export const walkthroughTool = defineTool({
  name: "walkthrough",
  title: "Play a topic walkthrough",
  description:
    "Control a topic's built-in walkthrough, which steps through its regions with signals in 3D: play (from the current step, or from ref), pause, next, prev, or restart (from step 1). seconds sets the time per step.",
  readOnly: false,
  input: z.strictObject({
    action: z.enum(["play", "pause", "next", "prev", "restart"]),
    ref: refField("play and restart only: a topic or step ref. Default the open topic.").optional(),
    seconds: z
      .number()
      .min(WALK_SECONDS.min)
      .max(WALK_SECONDS.max)
      .optional()
      .describe(`play and restart only: seconds per step, default ${WALK_SECONDS.default}`),
  }),
  run: (input, api) => api.walkthrough(input),
});
