import * as z from "zod";
import { resolveRef } from "../../model/refs";
import { normalizeViewPatch } from "../../model/view";
import { LIMITS } from "../../store/limits";
import { refField, regionIdSchema } from "../schemas";
import { defineTool } from "../webmcp";

const text = (max: number) => z.string().trim().min(1).max(max);
const itemText = text(LIMITS.promptChars);

/** Where "Show me" goes. Checked against the guide, with suggestions for near misses. */
const showMeRef = refField("Show me goes here after the answer (region questions: default the answer)").superRefine((ref, context) => {
  const resolved = resolveRef(ref);
  if (!("error" in resolved)) return;
  const options = resolved.error.options?.length ? `; closest: ${resolved.error.options.join(", ")}` : "";
  context.addIssue({ code: "custom", message: `${resolved.error.message.replace(/\.$/, "")}${options}` });
});

/** A set_view patch, checked by the view API's own rules; kept loose here so the schema stays small. */
const showMeView = z
  .record(z.string(), z.unknown())
  .superRefine((view, context) => {
    const checked = normalizeViewPatch(view);
    if ("error" in checked) context.addIssue({ code: "custom", message: checked.error.message });
  })
  .describe("A set_view patch Show me applies after ref");

const base = {
  prompt: itemText.describe("Inline markdown; region links as [text](region:id)"),
  explain: text(LIMITS.charsPerBlock).optional().describe("Shown after the answer"),
  ref: showMeRef.optional(),
  view: showMeView.optional(),
};

const choiceQuestion = z
  .strictObject({
    kind: z.literal("choice"),
    ...base,
    choices: z.array(itemText).min(2).max(6),
    answer: z.array(z.number().int().min(0).max(5)).min(1).max(6).describe("0-based indexes of the correct choices; more than one makes it multi-select"),
  })
  .superRefine((question, context) => {
    const outside = question.answer.find((index) => index >= question.choices.length);
    if (outside !== undefined)
      context.addIssue({ code: "custom", path: ["answer"], message: `index ${outside} is past the last choice (${question.choices.length - 1})` });
  });

const regionQuestion = z
  .strictObject({
    kind: z.literal("region"),
    ...base,
    answer: z.array(regionIdSchema).min(1).max(12).describe("Region ids that count as right; the user clicks one region"),
    choices: z.array(regionIdSchema).min(2).max(12).optional().describe("The regions marked on the brain. Default: the regions of the question's topic"),
  })
  .superRefine((question, context) => {
    const missing = question.choices ? question.answer.filter((id) => !question.choices!.includes(id)) : [];
    if (missing.length)
      context.addIssue({ code: "custom", path: ["choices"], message: `choices must include every answer region (missing ${missing.join(", ")})` });
  });

export const questionSchema = z.discriminatedUnion("kind", [
  choiceQuestion,
  z.strictObject({ kind: z.literal("truefalse"), ...base, answer: z.boolean() }),
  regionQuestion,
  z.strictObject({ kind: z.literal("order"), ...base, items: z.array(itemText).min(3).max(8).describe("In the correct order; the card shuffles them") }),
  z.strictObject({
    kind: z.literal("recall"),
    ...base,
    answer: itemText.describe("The model answer. The user types theirs, reveals this, and marks it Got it or Missed it"),
  }),
]);

export const quizTool = defineTool({
  name: "quiz",
  title: "Quiz the user",
  description:
    "Create a quiz and show it in a draggable card on the page, one question at a time; or open, close or reset (start again from question 1) a quiz. Kinds: choice (answer = correct 0-based indexes; more than one makes it multi-select), truefalse, region (the user clicks a region on the 3D brain; answer = region ids that count), order (items in the correct order; shown shuffled) and recall (the user types, reveals the model answer and marks it). The page grades answers and stores every attempt: read the quiz with detail results for scores; get_context shows answers as they come in. Edit questions later with edit_blocks (set on a question block).",
  readOnly: false,
  // One object at the root (WebMCP input schemas must be type "object"); the action decides which fields apply.
  input: z
    .strictObject({
      action: z.enum(["create", "open", "close", "reset"]),
      title: text(LIMITS.titleChars).optional().describe("create only"),
      questions: z
        .array(questionSchema)
        .min(1)
        .max(LIMITS.questionsPerQuiz)
        .optional()
        .describe(`create only: 1–${LIMITS.questionsPerQuiz} questions, asked in this order`),
      open: z.boolean().optional().describe("create only. Default true: show the quiz card now"),
      ref: refField("open, close and reset: the quiz, e.g. quiz:k3f9").optional(),
    })
    .superRefine((input, context) => {
      if (input.action === "create") {
        if (input.title === undefined) context.addIssue({ code: "custom", path: ["title"], message: "create needs a title" });
        if (input.questions === undefined) context.addIssue({ code: "custom", path: ["questions"], message: "create needs questions" });
        if (input.ref !== undefined) context.addIssue({ code: "custom", path: ["ref"], message: "ref applies to open, close and reset, not create" });
      } else {
        if (input.ref === undefined) context.addIssue({ code: "custom", path: ["ref"], message: `${input.action} needs ref` });
        for (const field of ["title", "questions", "open"] as const)
          if (input[field] !== undefined) context.addIssue({ code: "custom", path: [field], message: `${field} applies to create, not ${input.action}` });
      }
    }),
  // Validation above guarantees the fields each action needs.
  run: (input, api) =>
    api.quiz(
      input.action === "create"
        ? { action: "create", title: input.title!, questions: input.questions!, open: input.open }
        : { action: input.action, ref: input.ref! },
    ),
});
