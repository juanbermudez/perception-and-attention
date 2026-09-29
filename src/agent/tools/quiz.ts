import * as z from "zod";
import { resolveRef } from "../../model/refs";
import { LIMITS } from "../../store/limits";
import { refField, regionIdSchema, viewPatchField } from "../schemas";
import { defineTool } from "../webmcp";

const text = (max: number) => z.string().trim().min(1).max(max);
const itemText = text(LIMITS.promptChars);

/** A guide place, checked against the guide, with suggestions for near misses. */
const showMeRef = refField("A guide place; region questions default to the answer").superRefine((ref, context) => {
  const resolved = resolveRef(ref);
  if (!("error" in resolved)) return;
  const options = resolved.error.options?.length ? `; closest: ${resolved.error.options.join(", ")}` : "";
  context.addIssue({ code: "custom", message: `${resolved.error.message.replace(/\.$/, "")}${options}` });
});

/**
 * Where the Show me button goes after an answer. Named show_me in the tool input so it cannot be mistaken
 * for the quiz's own ref; stored as the question's `ref` and `view`.
 */
const showMe = z
  .strictObject({ ref: showMeRef.optional(), view: viewPatchField("A set_view patch, applied after ref").optional() })
  .describe("Where Show me goes after the answer");

/** Long enough for a paragraph; with every other field at its maximum, a question still fits in one block. */
const EXPLAIN_CHARS = 2000;

const base = {
  prompt: itemText.describe("Inline markdown; region links as [text](region:id)"),
  explain: text(EXPLAIN_CHARS).optional().describe("Shown after the answer"),
  show_me: showMe.optional(),
};

/** The store keeps a question as JSON in one block; say which question is too big instead of failing the whole create later. */
function fitsInBlock(question: object, context: z.RefinementCtx) {
  const size = JSON.stringify(question).length;
  if (size > LIMITS.charsPerBlock)
    context.addIssue({
      code: "custom",
      message: `this question is ${size} characters as stored; a block holds ${LIMITS.charsPerBlock}. Shorten explain, the choices or the items.`,
    });
}

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
    fitsInBlock(question, context);
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
    fitsInBlock(question, context);
  });

export const questionSchema = z.discriminatedUnion("kind", [
  choiceQuestion,
  z.strictObject({ kind: z.literal("truefalse"), ...base, answer: z.boolean() }).superRefine(fitsInBlock),
  regionQuestion,
  z
    .strictObject({ kind: z.literal("order"), ...base, items: z.array(itemText).min(3).max(8).describe("In the correct order; the card shuffles them") })
    .superRefine(fitsInBlock),
  z
    .strictObject({
      kind: z.literal("recall"),
      ...base,
      answer: itemText.describe("The model answer. The user types theirs, reveals this, and marks it Got it or Missed it"),
    })
    .superRefine(fitsInBlock),
]);

type QuestionInput = z.output<typeof questionSchema>;
/** The stored shape: show_me's place and view become the question's `ref` and `view`. */
function storedQuestion({ show_me, ...question }: QuestionInput) {
  return { ...question, ...(show_me?.ref === undefined ? {} : { ref: show_me.ref }), ...(show_me?.view === undefined ? {} : { view: show_me.view }) };
}

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
      show: z.boolean().optional().describe("create only. Default true: show the quiz card now"),
      ref: refField("open, close and reset: the quiz, e.g. quiz:k3f9").optional(),
    })
    .superRefine((input, context) => {
      if (input.action === "create") {
        if (input.title === undefined) context.addIssue({ code: "custom", path: ["title"], message: "create needs a title" });
        if (input.questions === undefined) context.addIssue({ code: "custom", path: ["questions"], message: "create needs questions" });
        if (input.ref !== undefined) context.addIssue({ code: "custom", path: ["ref"], message: "ref applies to open, close and reset, not create" });
      } else {
        if (input.ref === undefined) context.addIssue({ code: "custom", path: ["ref"], message: `${input.action} needs ref` });
        for (const field of ["title", "questions", "show"] as const)
          if (input[field] !== undefined) context.addIssue({ code: "custom", path: [field], message: `${field} applies to create, not ${input.action}` });
      }
    }),
  // Validation above guarantees the fields each action needs.
  run: (input, api) =>
    api.quiz(
      input.action === "create"
        ? { action: "create", title: input.title!, questions: input.questions!.map(storedQuestion), open: input.show }
        : { action: input.action, ref: input.ref! },
    ),
});
