import * as z from "zod";
import { refField } from "../schemas";
import { defineTool } from "../webmcp";

export const goTool = defineTool({
  name: "go",
  title: "Go to a place in the guide",
  description:
    "Navigate to a ref: overview, an About tab, a topic, a step, a region (optionally #section) or topic:attention/streams. Changes what the user sees; the 3D camera follows unless camera is false. Stops a playing walkthrough. Returns the new place and its brief text.",
  readOnly: false,
  idempotent: true,
  input: z.strictObject({
    ref: refField("For example step:hearing/mgn-relay, region:mgn or topic:vision."),
    camera: z.boolean().optional().describe("Default true: turn the 3D view to the place."),
  }),
  run: (input, api) => api.go(input.ref, input.camera),
});
