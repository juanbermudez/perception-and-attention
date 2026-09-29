import * as z from "zod";
import { WALK_SECONDS } from "../../model/topics";
import { refField } from "../schemas";
import { defineTool } from "../webmcp";

export const walkthroughTool = defineTool({
  name: "walkthrough",
  title: "Play a topic's walkthrough",
  description:
    "Play or control a topic's built-in walkthrough, which steps through its regions with signal animations and text. play starts from the current step (or from ref, a topic or step) and restart from step 1; pause holds; next and prev move one step; stop ends it. While a tour from start_tour is running, pause, play, next, prev, restart and stop control that tour instead. Returns the current place and a one-line summary.",
  readOnly: false,
  input: z
    .strictObject({
      action: z.enum(["play", "pause", "next", "prev", "restart", "stop"]),
      ref: refField("play and restart only: a topic or step ref. Default the open topic.").optional(),
      seconds: z
        .number()
        .min(WALK_SECONDS.min)
        .max(WALK_SECONDS.max)
        .optional()
        .describe(`play and restart only: seconds per step, default ${WALK_SECONDS.default}`),
    })
    .superRefine((input, context) => {
      if (input.action === "play" || input.action === "restart") return;
      for (const field of ["ref", "seconds"] as const)
        if (input[field] !== undefined)
          context.addIssue({ code: "custom", path: [field], message: `${field} applies to play and restart, not ${input.action}` });
    }),
  run: (input, api) => api.walkthrough(input),
});
