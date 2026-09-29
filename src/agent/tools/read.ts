import * as z from "zod";
import { DETAILS } from "../../api/guide-content";
import { refField } from "../schemas";
import { defineTool } from "../webmcp";

export const readTool = defineTool({
  name: "read",
  title: "Read the guide",
  description:
    "Content at a ref. detail: brief (default, short), full (every section, key fact, signal route; every block of a doc with id, markdown and rev), sources (citations with URLs), markdown (a doc as a .md file) or results (a quiz's answers). Region links in the text look like [text](region:id) and work as refs.",
  readOnly: true,
  untrustedContent: true,
  input: z.strictObject({
    ref: refField("For example step:vision/3, region:lgn#mechanism, topic:hearing, doc:k3f9, block:b7x2k, help."),
    detail: z.enum(DETAILS).optional().describe("brief (default), full or sources; markdown and results are for docs and quizzes"),
  }),
  run: (input, api) => api.read(input.ref, input.detail),
});
