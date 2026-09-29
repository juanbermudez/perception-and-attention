// One check per block type (spec §9.1), used on every write path: the agent's doc, edit_blocks and quiz
// tools, markdown import, and the editor's saves and pastes. Question and view blocks carry data that
// only the guide can check (region ids, refs, the view grammar), so the store engine, which runs in a
// worker without the guide's content, keeps to its own checks (types, indent, sizes, prompt length).
// Pure: tested in Node.

import { LIMITS } from "../store/limits";
import type { BlockContent, BlockData, BlockType } from "../store/types";
import { describeView } from "./markdown";
import { validateQuestion } from "./quiz";
import { normalizeViewPatch } from "./view";

const bad = (message: string, code: "bad_input" | "limit" = "bad_input") => ({ ok: false as const, message, code });

export type BlockCheck = { ok: true; value: { text: string; data?: BlockData } } | { ok: false; message: string; code: "bad_input" | "limit" };

/** Question and view data as the store keeps it: JSON of at most 8,000 characters. */
function sized(what: string, data: object, advice = "") {
  const size = JSON.stringify(data).length;
  if (size <= LIMITS.charsPerBlock) return null;
  const message = `${what} is ${size.toLocaleString("en")} characters when saved; a block holds at most ${LIMITS.charsPerBlock.toLocaleString("en")}.`;
  return bad(advice ? `${message} ${advice}` : message, "limit");
}

/**
 * Checks one block's content and returns the text and data to store. A question is cleaned by
 * `validateQuestion` and its text is its prompt; a view must be a valid view patch, and an empty
 * caption becomes its description. Other types pass through: the store checks them.
 */
export function checkBlockContent(type: BlockType, data: unknown, text: string): BlockCheck {
  switch (type) {
    case "question": {
      const checked = validateQuestion(data);
      if (!checked.ok) return bad(checked.message);
      const tooBig = sized("The question", checked.value, "Shorten explain, the choices or the items.");
      if (tooBig) return tooBig;
      return { ok: true, value: { text: checked.value.prompt, data: checked.value as unknown as BlockData } };
    }
    case "view": {
      const view = normalizeViewPatch(data);
      if ("error" in view) {
        const options = view.error.options?.length ? ` Options: ${view.error.options.join(", ")}.` : "";
        return bad(`The view is not valid: ${view.error.message}${options}`);
      }
      const tooBig = sized("The view", data as object);
      if (tooBig) return tooBig;
      const caption = text.replace(/\s*\n\s*/g, " ").trim();
      return { ok: true, value: { text: caption || describeView(data as BlockData), data: data as BlockData } };
    }
    default:
      return data === undefined ? { ok: true, value: { text } } : { ok: true, value: { text, data: data as BlockData } };
  }
}

/**
 * Checks a list of blocks in place (question and view blocks get their clean text and data). The
 * message names the block as people count them: "Question 2" is the second question.
 */
export function checkBlocks(blocks: BlockContent[]): { ok: true } | { ok: false; message: string; code: "bad_input" | "limit" } {
  const seen: Partial<Record<BlockType, number>> = {};
  for (const block of blocks) {
    const nth = (seen[block.type] ?? 0) + 1;
    seen[block.type] = nth;
    if (block.type !== "question" && block.type !== "view") continue;
    const checked = checkBlockContent(block.type, block.data, block.text ?? "");
    if (!checked.ok) return { ok: false, code: checked.code, message: `${block.type === "question" ? "Question" : "View"} ${nth}: ${checked.message}` };
    block.text = checked.value.text;
    block.data = checked.value.data;
  }
  return { ok: true };
}
