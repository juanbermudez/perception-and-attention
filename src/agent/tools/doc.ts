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
    'Create a doc from markdown (it opens in a window), or rename, delete (restorable for 30 days), restore or download a doc or quiz. To list the user\'s docs and their refs, call outline({ ref: "docs" }); to read one, read; to change its content, edit_blocks; to show or move its window, window. Markdown becomes blocks: headings, paragraphs, lists, to-dos, quotes, callouts (> [!tip]), code, tables, dividers. Link regions as [text](region:v1). Returns the ref and blocks with ids and revs.',
  readOnly: false,
  untrustedContent: true,
  destructive: true,
  input: z
    .strictObject({
      action: z.enum(ACTIONS),
      ref: refField("doc:<id> or quiz:<id>; for every action except create").optional(),
      title: z.string().trim().min(1).max(LIMITS.titleChars).optional().describe("create and rename"),
      markdown: z.string().max(MARKDOWN_CHARS).optional().describe("create only: the doc's content"),
      show: z.boolean().optional().describe("create only: show it in a window (default true)"),
    })
    .superRefine((input, context) => {
      const needs = (field: "ref" | "title", when: boolean) => {
        if (when && input[field] === undefined) context.addIssue({ code: "custom", path: [field], message: `${input.action} needs ${field}` });
        if (!when && input[field] !== undefined && !(field === "title" && input.action === "rename"))
          context.addIssue({ code: "custom", path: [field], message: `${field} does not apply to ${input.action}` });
      };
      needs("ref", input.action !== "create");
      needs("title", input.action === "create" || input.action === "rename");
      for (const field of ["markdown", "show"] as const)
        if (input.action !== "create" && input[field] !== undefined)
          context.addIssue({ code: "custom", path: [field], message: `${field} applies to create, not ${input.action}` });
    }),
  run: ({ show, ...input }, api) => api.doc({ ...input, ...(show === undefined ? {} : { open: show }) } as Parameters<typeof api.doc>[0]),
});
