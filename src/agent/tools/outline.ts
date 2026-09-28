import * as z from "zod";
import { listLimit, refField } from "../schemas";
import { defineTool } from "../webmcp";

export const outlineTool = defineTool({
  name: "outline",
  title: "Outline the guide",
  description:
    "The structure under a ref, one level at a time: the guide's topics, a topic's steps and regions, a region's sections and steps. Start with no ref. The ref grammar and every region id: read({ ref: \"help\" }).",
  readOnly: true,
  input: z.strictObject({
    ref: refField("Default guide. For example topic:vision or region:lgn.").optional(),
    limit: listLimit.optional(),
    cursor: z.string().max(20).optional().describe("From the previous result, for the next page"),
  }),
  run: (input, api) => api.outline(input.ref, { limit: input.limit, cursor: input.cursor }),
});
