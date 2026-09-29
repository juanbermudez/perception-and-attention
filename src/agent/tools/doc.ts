import * as z from "zod";
import { LIMITS } from "../../store/limits";
import { refField } from "../schemas";
import { defineTool } from "../webmcp";

const ACTIONS = ["create", "rename", "delete", "restore", "download"] as const;
/** A whole doc of markdown: up to 500 blocks of 8,000 characters is far more than a tool call carries. */
const MARKDOWN_CHARS = 200_000;

export const docTool = defineTool({
  name: "doc",
  title: "Create or manage a doc",
  description:
    "Create a markdown doc for the user (it opens in a floating window), rename it, delete it (restorable for 30 days), restore it, or download it as .md. Markdown becomes blocks: headings, paragraphs, lists, to-dos, quotes, callouts (> [!tip]), code, tables, dividers. Link regions as [text](region:v1). Returns the doc ref and its blocks with ids and revs for edit_blocks.",
  readOnly: false,
  untrustedContent: true,
  destructive: true,
  input: z
    .strictObject({
      action: z.enum(ACTIONS),
      ref: refField("doc:<id> or quiz:<id>; for every action except create").optional(),
      title: z.string().trim().min(1).max(LIMITS.titleChars).optional().describe("create and rename"),
      markdown: z.string().max(MARKDOWN_CHARS).optional().describe("create only: the doc's content"),
      open: z.boolean().optional().describe("create only: open it in a window (default true)"),
    })
    .superRefine((input, context) => {
      const needs = (field: "ref" | "title", when: boolean) => {
        if (when && input[field] === undefined) context.addIssue({ code: "custom", path: [field], message: `${input.action} needs ${field}` });
        if (!when && input[field] !== undefined && !(field === "title" && input.action === "rename"))
          context.addIssue({ code: "custom", path: [field], message: `${field} does not apply to ${input.action}` });
      };
      needs("ref", input.action !== "create");
      needs("title", input.action === "create" || input.action === "rename");
      for (const field of ["markdown", "open"] as const)
        if (input.action !== "create" && input[field] !== undefined)
          context.addIssue({ code: "custom", path: [field], message: `${field} applies to create, not ${input.action}` });
    }),
  run: (input, api) => api.doc(input as Parameters<typeof api.doc>[0]),
});
