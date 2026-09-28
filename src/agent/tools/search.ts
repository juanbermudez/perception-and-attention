import * as z from "zod";
import { searchLimit } from "../schemas";
import { defineTool } from "../webmcp";

export const searchTool = defineTool({
  name: "search",
  title: "Search the guide",
  description: "Search the guide's topics, steps, regions and sources. Returns refs with short snippets, best first.",
  readOnly: true,
  input: z.strictObject({
    query: z.string().trim().min(1).max(200),
    scope: z.enum(["guide", "docs", "all"]).optional().describe("Default all. Docs are not available yet."),
    limit: searchLimit.optional(),
  }),
  run: (input, api) => api.search(input.query, input.scope, input.limit),
});
