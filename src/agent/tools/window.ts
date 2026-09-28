import * as z from "zod";
import { LAYOUTS, SIZES, SLOTS } from "../../ui/window-geometry";
import { refField } from "../schemas";
import { defineTool } from "../webmcp";

const ACTIONS = ["open", "close", "minimize", "restore", "focus", "place", "arrange"] as const;

export const windowTool = defineTool({
  name: "window",
  title: "Arrange the doc windows",
  description:
    "Open, close, minimize, restore, focus or place the floating windows that show docs and quizzes, or arrange all open ones (tile or stack). Places are named slots and sizes (s, m, l), never pixels. A block ref opens its doc and scrolls to it. Without ref, commands act on the focused window. Closing keeps the doc; delete it with doc.",
  readOnly: false,
  input: z
    .strictObject({
      action: z.enum(ACTIONS),
      ref: refField("doc:<id>, quiz:<id> or block:<id>. Default: the focused window (required for open).").optional(),
      at: z.enum(SLOTS).optional().describe("open and place: where on the stage"),
      size: z.enum(SIZES).optional().describe("open and place: s 320×380, m 440×540, l 600 wide and tall"),
      layout: z.enum(LAYOUTS).optional().describe("arrange only: tile (default) or stack"),
    })
    .superRefine((input, context) => {
      const placing = input.action === "open" || input.action === "place";
      for (const field of ["at", "size"] as const)
        if (!placing && input[field] !== undefined)
          context.addIssue({ code: "custom", path: [field], message: `${field} applies to open and place, not ${input.action}` });
      if (input.action !== "arrange" && input.layout !== undefined)
        context.addIssue({ code: "custom", path: ["layout"], message: `layout applies to arrange, not ${input.action}` });
      if (input.action === "arrange" && input.ref !== undefined)
        context.addIssue({ code: "custom", path: ["ref"], message: "arrange acts on every open window" });
      if (input.action === "open" && input.ref === undefined) context.addIssue({ code: "custom", path: ["ref"], message: "open needs ref" });
      if (input.action === "place" && input.at === undefined && input.size === undefined)
        context.addIssue({ code: "custom", path: ["at"], message: "place needs at, size or both" });
    }),
  run: (input, api) => api.window(input),
});
