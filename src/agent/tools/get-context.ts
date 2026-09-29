import * as z from "zod";
import { defineTool } from "../webmcp";

export const getContextTool = defineTool({
  name: "get_context",
  title: "What the user is looking at",
  description:
    'What the user sees now and what happened since your last call: the place (topic, step, region), the 3D view, open doc and quiz windows, the block being edited, selected text, tour and quiz progress, and a log of user and agent actions and quiz answers. walking means a walkthrough plays; animating, the 3D signals move. The page cannot notify you, so call this at the start of each turn. New here? outline() lists the topics; read({ ref: "help" }) lists every ref form and region id.',
  readOnly: true,
  untrustedContent: true,
  input: z.strictObject({
    since: z.string().trim().max(40).optional().describe("The cursor from your previous get_context. Omit to get the latest 30 actions."),
  }),
  run: (input, api) => api.context(input.since),
});
