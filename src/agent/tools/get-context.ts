import * as z from "zod";
import { defineTool } from "../webmcp";

export const getContextTool = defineTool({
  name: "get_context",
  title: "What the user is looking at",
  description:
    "What the user is looking at now (topic, step, panel, region, 3D view, tour progress, open doc windows, the block they are editing, selected text) and what they and you did since `since`, the cursor from your previous call. The page cannot notify you, so call this to catch up.",
  readOnly: true,
  untrustedContent: true,
  input: z.strictObject({
    since: z.number().int().min(0).optional().describe("The cursor from your previous get_context. Omit to get the latest 30 actions."),
  }),
  run: (input, api) => api.context(input.since),
});
