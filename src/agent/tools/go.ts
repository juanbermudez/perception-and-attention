import * as z from "zod";
import { refField } from "../schemas";
import { defineTool } from "../webmcp";

export const goTool = defineTool({
  name: "go",
  title: "Go to a place in the guide",
  description:
    "Show a place: the side panel switches to it and the 3D camera turns to it (unless camera is false). Places: overview, about, topic:vision, step:vision/2, region:v1 (or region:v1#mechanism), topic:attention/streams. doc:, quiz: and block: refs open a window; a quiz opens as its question list for editing (to let the user take it, use quiz open). To change only the 3D view, use set_view. Stops a walkthrough or tour. Returns the new place, its short text and the view.",
  readOnly: false,
  idempotent: true,
  input: z.strictObject({
    ref: refField("For example step:hearing/mgn-relay, region:mgn or topic:vision."),
    camera: z.boolean().optional().describe("Default true: turn the 3D view to the place."),
  }),
  run: (input, api) => api.go(input.ref, input.camera),
});
