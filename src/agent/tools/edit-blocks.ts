import * as z from "zod";
import { QUESTION_KINDS } from "../../model/quiz";
import { LIMITS } from "../../store/limits";
import { refField, viewPatchSchema } from "../schemas";
import { defineTool } from "../webmcp";

const blockId = z.string().trim().min(1).max(40).describe("A block id from outline or read (b7x2k or block:b7x2k)");
const anchor = z.string().trim().min(1).max(40).describe('A block id, "start" or "end"');
const rev = z.number().int().min(1).describe("The block's rev from outline or read; a stale rev rejects the whole batch");
const md = z.string().max(LIMITS.charsPerBlock * 4);

/** The quiz tool owns the full question grammar; here the page checks it (kind, prompt and the kind's fields). */
const question = z
  .looseObject({
    kind: z.enum(QUESTION_KINDS),
    prompt: z.string().trim().min(1).max(LIMITS.promptChars),
  })
  .describe("A quiz question, as the quiz tool takes it: { kind, prompt, ... }");

const opSchema = z.discriminatedUnion("op", [
  z
    .strictObject({
      op: z.literal("insert"),
      after: anchor.optional().describe('Where: a block id, "start" or "end" (default)'),
      md: md.optional().describe("Markdown; several blocks are inserted in order"),
      view: z
        .union([z.literal("current"), viewPatchSchema])
        .optional()
        .describe('"current" saves the live 3D view as a view block, or give a view patch'),
      question: question.optional(),
    })
    .refine((op) => [op.md, op.view, op.question].filter((value) => value !== undefined).length === 1, {
      message: "insert takes exactly one of md, view or question",
    }),
  z.strictObject({ op: z.literal("update"), id: blockId, md: md.describe("The block's new markdown (one block)"), rev }),
  z.strictObject({
    op: z.literal("replace"),
    id: blockId,
    find: z.string().min(1).max(LIMITS.charsPerBlock).describe("Exact text; the first match is replaced"),
    with: z.string().max(LIMITS.charsPerBlock),
    rev,
  }),
  z.strictObject({ op: z.literal("delete"), id: blockId }),
  z.strictObject({ op: z.literal("move"), id: blockId, after: anchor }),
  z.strictObject({
    op: z.literal("set"),
    id: blockId,
    data: z.record(z.string(), z.unknown()).describe("View, question, code ({ lang }), to-do ({ checked }) or callout ({ tone }) data"),
    rev,
  }),
]);

export const editBlocksTool = defineTool({
  name: "edit_blocks",
  title: "Edit a doc's blocks",
  description: `Edit one doc or quiz in a single transaction: 1–${LIMITS.opsPerCall} ops applied in order (insert, update, replace, delete, move, set). update, replace and set need the block's rev from outline or read; a stale rev rejects the whole batch with the block's current text. A block the user is typing in returns locked_by_user. insert { view: "current" } saves the live 3D view. The user can undo the batch.`,
  readOnly: false,
  untrustedContent: true,
  destructive: true,
  input: z.strictObject({
    ref: refField("doc:<id> or quiz:<id>"),
    ops: z.array(opSchema).min(1).max(LIMITS.opsPerCall),
  }),
  run: (input, api) => api.editBlocks(input as Parameters<typeof api.editBlocks>[0]),
});
