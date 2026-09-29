import * as z from "zod";
import { QUESTION_KINDS } from "../../model/quiz";
import { LIMITS } from "../../store/limits";
import { CALLOUT_TONES } from "../../store/types";
import { refField, viewPatchField } from "../schemas";
import { defineTool } from "../webmcp";

const blockId = z.string().trim().min(1).max(40).describe("A block id from outline or read (b7x2k or block:b7x2k)");
const anchor = z.string().trim().min(1).max(40).describe('A block id, "start" or "end"');
const rev = z
  .number({
    error: (issue) =>
      issue.code !== "invalid_type"
        ? undefined
        : issue.input === undefined
          ? 'rev is required: copy the block\'s rev from outline({ ref: "doc:<id>" }) or read'
          : "rev is the block's rev, a whole number from outline or read",
  })
  .int()
  .min(1)
  .describe("The block's rev from outline or read; a stale rev rejects the whole batch");
const md = z.string().max(LIMITS.charsPerBlock * 4);

/** Question data takes the quiz tool's show_me, and the stored ref and view that read returns. */
function showMeToStored(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("show_me" in value)) return value;
  const { show_me, ...rest } = value as { show_me?: { ref?: unknown; view?: unknown } };
  return { ...rest, ...(show_me?.ref === undefined ? {} : { ref: show_me.ref }), ...(show_me?.view === undefined ? {} : { view: show_me.view }) };
}

/** The quiz tool owns the full question grammar; here the page checks it (kind, prompt and the kind's fields). */
const question = z
  .preprocess(
    showMeToStored,
    z.looseObject({
      kind: z.enum(QUESTION_KINDS),
      prompt: z.string().trim().min(1).max(LIMITS.promptChars),
    }),
  )
  .describe("A quiz question, as the quiz tool takes it: { kind, prompt, ... }");

const opSchema = z.discriminatedUnion("op", [
  z
    .strictObject({
      op: z.literal("insert"),
      after: anchor.optional().describe('Where: a block id, "start" or "end" (default)'),
      md: md.optional().describe("Markdown; several blocks are inserted in order"),
      view: z
        .union([z.literal("current"), viewPatchField("A set_view patch (same fields as set_view)")])
        .optional()
        .describe('"current" saves the live 3D view as a view block, or give a set_view patch'),
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
    data: z
      .preprocess(showMeToStored, z.record(z.string(), z.unknown()))
      .describe(
        `code {lang}; to-do {checked}; callout {tone: ${CALLOUT_TONES.join(", ")}}; view: a set_view patch; question: fields as in quiz (kind, prompt, answer, ...)`,
      ),
    rev,
  }),
]);

export const editBlocksTool = defineTool({
  name: "edit_blocks",
  title: "Edit a doc's blocks",
  description: `Edit one doc or quiz in one transaction: 1–${LIMITS.opsPerCall} ops in order (insert, update, replace, delete, move, set). update, replace and set need the block's rev from outline or read; a stale rev rejects the batch, returning the current text. A block the user is typing in returns locked_by_user. The user can undo the batch. Example (fix a typo, save the 3D view): {"ref":"doc:k3f9","ops":[{"op":"replace","id":"b7x2k","find":"tpyo","with":"typo","rev":3},{"op":"insert","after":"h1a2b","view":"current"}]}`,
  readOnly: false,
  untrustedContent: true,
  destructive: true,
  input: z.strictObject({
    ref: refField("doc:<id> or quiz:<id>"),
    ops: z.array(opSchema).min(1).max(LIMITS.opsPerCall),
  }),
  run: (input, api) => api.editBlocks(input as Parameters<typeof api.editBlocks>[0]),
});
