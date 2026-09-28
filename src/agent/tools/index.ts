// The Stage 1 tools. All register at startup and stay registered (spec §12: a static tool list).
import type { Tool } from "../webmcp";
import { getContextTool } from "./get-context";
import { goTool } from "./go";
import { outlineTool } from "./outline";
import { readTool } from "./read";
import { searchTool } from "./search";
import { walkthroughTool } from "./walkthrough";

export const tools = [getContextTool, outlineTool, readTool, searchTool, goTool, walkthroughTool] as Tool[];
