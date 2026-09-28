import * as z from "zod";
import { DETAILS } from "../../api/guide-content";
import { refField } from "../schemas";
import { defineTool } from "../webmcp";

export const readTool = defineTool({
  name: "read",
  title: "Read the guide",
  description:
    "Content at a ref. detail: brief (default, short), full (every section, key fact, signal route) or sources (citations with URLs). Region links in the text look like [text](region:id) and work as refs.",
  readOnly: true,
  input: z.strictObject({
    ref: refField("For example step:vision/3, region:lgn#mechanism, topic:hearing, help."),
    detail: z.enum(DETAILS).optional().describe("brief (default), full or sources. markdown and results are for docs and quizzes."),
  }),
  run: (input, api) => api.read(input.ref, input.detail),
});
