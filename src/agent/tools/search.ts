import * as z from "zod";
import { searchLimit } from "../schemas";
import { defineTool } from "../webmcp";

export const searchTool = defineTool({
  name: "search",
  title: "Search the guide",
  description:
    "Search the guide's topics, steps, regions and sources, and the user's docs. Returns refs with short snippets, best first; doc hits are block refs with the doc they are in.",
  readOnly: true,
  untrustedContent: true,
  input: z.strictObject({
    query: z.string().trim().min(1).max(200),
    scope: z.enum(["guide", "docs", "all"]).optional().describe("guide, docs, or all (default)"),
    limit: searchLimit.optional(),
  }),
  run: (input, api) => api.search(input.query, input.scope, input.limit),
});
