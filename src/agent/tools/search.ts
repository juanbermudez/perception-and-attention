import * as z from "zod";
import { searchLimit } from "../schemas";
import { defineTool } from "../webmcp";

export const searchTool = defineTool({
  name: "search",
  title: "Search the guide",
  description:
    "Find guide topics, steps, regions and sources, and the user's docs, by keyword. Returns refs with short snippets, best first; doc hits are block refs with the doc they are in. Then read a hit for its text, or go to show it. With no hits, the result has a hint with the closest refs.",
  readOnly: true,
  untrustedContent: true,
  input: z.strictObject({
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe('Keywords, not a question, e.g. "face recognition" or "pulvinar attention". Words match as prefixes; there is no spelling correction.'),
    scope: z.enum(["guide", "docs", "all"]).optional().describe("guide, docs, or all (default)"),
    limit: searchLimit.optional(),
  }),
  run: (input, api) => api.search(input.query, input.scope, input.limit),
});
