// The agent tools. All register at startup and stay registered (spec §12: a static tool list).
import type { Tool } from "../webmcp";
import { docTool } from "./doc";
import { editBlocksTool } from "./edit-blocks";
import { getContextTool } from "./get-context";
import { goTool } from "./go";
import { outlineTool } from "./outline";
import { readTool } from "./read";
import { searchTool } from "./search";
import { setViewTool } from "./set-view";
import { walkthroughTool } from "./walkthrough";
import { windowTool } from "./window";

export const tools = [getContextTool, outlineTool, readTool, searchTool, goTool, walkthroughTool, setViewTool, docTool, editBlocksTool, windowTool] as Tool[];
