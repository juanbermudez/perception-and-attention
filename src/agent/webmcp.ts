// WebMCP adapter (spec §4, §12). Each call runs: validate → kill switch → presence → run → log → encodeResult.
// Tools are thin: they validate input with zod and call GuideApi, which the UI shares.
import * as z from "zod";
import type { ActivityInput } from "../api/activity";
import type { GuideApi } from "../api/guide-api";
import { compact, fail, isFailure, type Result, type Undo, type WriteResult } from "../api/result";

export interface Tool<Input extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  /** What the agent sees. Factual, one or two sentences. */
  description: string;
  input: Input;
  /** Read-only tools carry `readOnlyHint` and keep working when assistant control is off. */
  readOnly: boolean;
  run(input: z.output<Input>, api: GuideApi): Result<object> | Promise<Result<object>>;
}

export function defineTool<Input extends z.ZodType>(tool: Tool<Input>): Tool<Input> {
  return tool;
}

/** The "Assistant" pill and action toasts. */
export interface PresencePort {
  begin(tool: string): void;
  end(said?: string, undo?: Undo): void;
}

export interface RunnerDeps {
  tools: Tool[];
  api: GuideApi;
  control: { readonly on: boolean };
  presence?: PresencePort;
  activity?: { append(entry: ActivityInput): number };
}

const MAX_ISSUES = 3;

function describeIssues(issues: z.core.$ZodIssue[]) {
  return issues
    .slice(0, MAX_ISSUES)
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "input"}: ${issue.message}`)
    .join("; ");
}

export function createToolRunner({ tools, api, control, presence, activity }: RunnerDeps) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  let running = 0;

  async function execute(tool: Tool, input: unknown): Promise<Result<object>> {
    try {
      return await tool.run(input, api);
    } catch (error) {
      console.error(`Tool ${tool.name} failed`, error);
      return fail("not_available", `${tool.name} failed inside the page: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Run one tool call. Always resolves; problems come back as `{ error }`. */
  async function call(name: string, args: unknown): Promise<object> {
    const tool = byName.get(name);
    if (!tool) return fail("bad_input", `Unknown tool "${name}".`, [...byName.keys()]);
    const parsed = tool.input.safeParse(args ?? {});
    if (!parsed.success) return fail("bad_input", describeIssues(parsed.error.issues));
    if (tool.readOnly) return compact(await execute(tool, parsed.data));
    if (!control.on) return fail("agent_control_off", "The user has switched off assistant control in About. Read tools still work.");
    running++;
    presence?.begin(tool.name);
    let result: Result<object>;
    try {
      result = await execute(tool, parsed.data);
    } finally {
      running--;
    }
    if (isFailure(result)) {
      presence?.end();
      return compact(result);
    }
    const { undo, ...data } = result as WriteResult;
    activity?.append({ by: "agent", kind: tool.name, ref: typeof data.at === "string" ? data.at : undefined, said: data.said });
    presence?.end(data.said, undo);
    return compact(data);
  }

  return {
    call,
    tools,
    /** True while a write tool runs, so the UI can tell agent navigation from the user's. */
    get running() {
      return running > 0;
    },
  };
}

export type ToolRunner = ReturnType<typeof createToolRunner>;

/* ---------- Result encoding ---------- */

/**
 * "object" returns the plain result, as in ChatGPT's WebMCP example. "content" returns MCP-style
 * `{ content: [{ type: "text", text }] }`, as in the WebMCP README. The ChatGPT spike (spec §2) decides;
 * until then `?agent-result=content` switches without a rebuild.
 */
export type ResultFormat = "object" | "content";
export const DEFAULT_RESULT_FORMAT: ResultFormat = "object";

export function resultFormat(search: string): ResultFormat {
  return new URLSearchParams(search).get("agent-result") === "content" ? "content" : DEFAULT_RESULT_FORMAT;
}

export function encodeResult(result: object, format: ResultFormat = DEFAULT_RESULT_FORMAT): object {
  if (format === "object") return result;
  return { content: [{ type: "text", text: JSON.stringify(result) }], ...(isFailure(result) ? { isError: true } : {}) };
}

export function decodeResult(encoded: unknown): unknown {
  const content = (encoded as { content?: { type: string; text: string }[] } | null)?.content;
  return Array.isArray(content) && content[0]?.type === "text" ? JSON.parse(content[0].text) : encoded;
}

/* ---------- Registration ---------- */

export interface RegisteredTool {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute(input: unknown): Promise<object>;
}

export interface ModelContextLike {
  registerTool(tool: RegisteredTool, options?: { signal?: AbortSignal }): unknown;
}

/** `document.modelContext`, or `navigator.modelContext` from older drafts. */
export function findModelContext(): ModelContextLike | null {
  const candidates = [(document as { modelContext?: unknown }).modelContext, (navigator as { modelContext?: unknown }).modelContext];
  for (const candidate of candidates) if (typeof (candidate as ModelContextLike | undefined)?.registerTool === "function") return candidate as ModelContextLike;
  return null;
}

/** JSON Schema for a tool input, fully inlined (no `$ref` until the spike confirms support). */
export function inputSchema(input: z.ZodType): object {
  const { $schema: _, ...schema } = z.toJSONSchema(input, { io: "input", reused: "inline" });
  return schema;
}

export function toolDefinition(tool: Tool, runner: ToolRunner, format: ResultFormat = DEFAULT_RESULT_FORMAT): RegisteredTool {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: inputSchema(tool.input),
    annotations: { readOnlyHint: tool.readOnly },
    execute: async (input) => encodeResult(await runner.call(tool.name, input), format),
  };
}

/** Register every tool once. Aborting `signal` unregisters them. */
export function registerTools(modelContext: ModelContextLike, runner: ToolRunner, signal: AbortSignal, format: ResultFormat = DEFAULT_RESULT_FORMAT) {
  for (const tool of runner.tools) {
    const handle = modelContext.registerTool(toolDefinition(tool, runner, format), { signal });
    // Some earlier drafts returned a handle instead of taking a signal.
    const unregister = (handle as { unregister?: () => void } | undefined)?.unregister;
    if (typeof unregister === "function") signal.addEventListener("abort", () => unregister.call(handle), { once: true });
  }
}
