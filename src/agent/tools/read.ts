import * as z from "zod";
import { DETAILS } from "../../api/guide-content";
import { refField } from "../schemas";
import { defineTool } from "../webmcp";

export const readTool = defineTool({
  name: "read",
  title: "Read the guide",
  description:
    'Content at a ref. Guide refs (overview, about, topic, step, region, region#section, source, help): brief (default), full (every section, key fact and signal route) or sources (citations with URLs). doc: and quiz: refs: brief, full (every block with id, markdown and rev), markdown (the .md file) or results (a quiz\'s answers and score). Region links in the text look like [text](region:id) and work as refs. To list what a ref contains, use outline. read({ ref: "help" }) is the reference card.',
  readOnly: true,
  untrustedContent: true,
  input: z.strictObject({
    ref: refField("For example step:vision/3, region:lgn#mechanism, topic:hearing, doc:k3f9, block:b7x2k, help."),
    detail: z.enum(DETAILS).optional().describe("Guide refs: brief (default), full, sources. doc: and quiz: refs: brief, full, markdown, results."),
  }),
  run: (input, api) => api.read(input.ref, input.detail),
});
