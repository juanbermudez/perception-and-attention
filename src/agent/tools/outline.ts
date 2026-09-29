import * as z from "zod";
import { listLimit, refField } from "../schemas";
import { defineTool } from "../webmcp";

export const outlineTool = defineTool({
  name: "outline",
  title: "Outline the guide",
  description:
    "List what is inside a ref, one level down. No ref: the guide's topics. topic:<id>: its steps in order and its regions. region:<id>: its sections, topics and steps. docs: the user's docs and quizzes, newest first (use this to find a doc's ref). doc:<id> or quiz:<id>: its blocks with id, type, first 80 characters and rev (edit_blocks needs the rev). For the text itself use read; to find something by keyword, search. If a result has more, pass its cursor back for the next page.",
  readOnly: true,
  untrustedContent: true,
  input: z.strictObject({
    ref: refField("Default guide. For example topic:vision, region:lgn, docs or doc:k3f9.").optional(),
    limit: listLimit.optional(),
    cursor: z.string().max(20).optional().describe("From the previous result, for the next page"),
  }),
  run: (input, api) => api.outline(input.ref, { limit: input.limit, cursor: input.cursor }),
});
