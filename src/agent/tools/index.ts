// The agent tools. All register at startup and stay registered (spec §12: a static tool list).
import type { Tool } from "../webmcp";
import { getContextTool } from "./get-context";
import { goTool } from "./go";
import { outlineTool } from "./outline";
import { quizTool } from "./quiz";
import { readTool } from "./read";
import { searchTool } from "./search";
import { setViewTool } from "./set-view";
import { walkthroughTool } from "./walkthrough";

export const tools = [getContextTool, outlineTool, readTool, searchTool, goTool, walkthroughTool, setViewTool] as Tool[];

/** Stage 5. Kept apart from `tools` until the stages merge; the page registers `agentTools`. */
export const quizTools = [quizTool] as Tool[];

/** Every tool the page registers (spec §12: a static list). */
export const agentTools = [...tools, ...quizTools];
