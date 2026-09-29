// WebMCP adapter (spec §4, §12). Each call runs: validate → kill switch → presence → run → kill switch again → log.
// Tools are thin: they validate input with zod and call GuideApi, which the UI shares.
import * as z from "zod";
import type { ActivityInput } from "../api/activity";
import type { GuideApi } from "../api/guide-api";
import { compact, fail, isFailure, type Result, type Undo, type WriteResult } from "../api/result";

/** What a tool call gets besides its input. `signal` aborts when the agent cancels the call. */
export interface RunOptions {
  signal?: AbortSignal;
}

export interface Tool<Input extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  /** What the agent sees: what the tool does, when to use it instead of its neighbours, and an example for complex input. */
  description: string;
  input: Input;
  /** Read-only tools carry `readOnlyHint` and keep working when assistant control is off. */
  readOnly: boolean;
  /** Results can carry text the user wrote or pasted into docs (WebMCP `untrustedContentHint`). */
  untrustedContent?: boolean;
  /** Some calls delete or overwrite the user's content, even if restorably (MCP `destructiveHint`). */
  destructive?: boolean;
  /** Repeating a call with the same input changes nothing more (MCP `idempotentHint`). */
  idempotent?: boolean;
  run(input: z.output<Input>, api: GuideApi, options: RunOptions): Result<object> | Promise<Result<object>>;
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

/** One line per issue. For a union, the option that matched the value's type explains more than "Invalid input". */
function describeIssue(issue: z.core.$ZodIssue, path: PropertyKey[] = issue.path): string {
  if (issue.code === "invalid_union") {
    const matched = issue.errors.find((errors) => errors.length && !errors.every((inner) => inner.code === "invalid_type" && inner.path.length === 0));
    if (matched) return describeIssue(matched[0], [...path, ...matched[0].path]);
  }
  return `${path.length ? path.join(".") : "input"}: ${issue.message}`;
}
function describeIssues(issues: z.core.$ZodIssue[]) {
  return issues
    .slice(0, MAX_ISSUES)
    .map((issue) => describeIssue(issue))
    .join("; ");
}

/** Presence, toasts and the activity log are bookkeeping: a failure there must not turn a finished call into a thrown error. */
function quietly(what: string, run: () => void) {
  try {
    run();
  } catch (error) {
    console.error(`Tool bookkeeping failed (${what})`, error);
  }
}

export function createToolRunner({ tools, api, control, presence, activity }: RunnerDeps) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  let running = 0;

  async function execute(tool: Tool, input: unknown, options: RunOptions): Promise<Result<object>> {
    try {
      return await tool.run(input, api, options);
    } catch (error) {
      console.error(`Tool ${tool.name} failed`, error);
      return fail("internal", `${tool.name} hit a bug in the page: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * The user switched control off while an async write was running (a store boot can take seconds).
   * What already landed is undone, so switching off always wins.
   */
  function switchedOff(undo: Undo | undefined) {
    let undone = false;
    if (undo)
      quietly("undo after switch-off", () => {
        undo.run();
        undone = true;
      });
    return fail(
      "agent_control_off",
      `The user switched off assistant control while this call ran, so ${undone ? "its change was undone" : "it stopped; check get_context for what changed"}.`,
    );
  }

  /** Run one tool call. Always resolves; problems come back as `{ error }`. */
  async function call(name: string, args: unknown, options: RunOptions = {}): Promise<object> {
    const tool = byName.get(name);
    if (!tool) return fail("bad_input", `Unknown tool "${name}".`, [...byName.keys()]);
    const parsed = tool.input.safeParse(args ?? {});
    if (!parsed.success) return fail("bad_input", describeIssues(parsed.error.issues));
    if (options.signal?.aborted) return fail("not_available", "The call was cancelled before it ran.");
    if (tool.readOnly) return compact(await execute(tool, parsed.data, options));
    if (!control.on) return fail("agent_control_off", "The user has switched off assistant control in About. Read tools still work.");
    running++;
    quietly("presence", () => presence?.begin(tool.name));
    let result: Result<object>;
    try {
      result = await execute(tool, parsed.data, options);
    } finally {
      running--;
    }
    if (isFailure(result)) {
      quietly("presence", () => presence?.end());
      return compact(result);
    }
    const { undo, ...data } = result as WriteResult;
    if (!control.on) {
      const off = switchedOff(undo);
      quietly("presence", () => presence?.end());
      return off;
    }
    quietly("activity", () => activity?.append({ by: "agent", kind: tool.name, ref: typeof data.at === "string" ? data.at : undefined, said: data.said }));
    quietly("presence", () => presence?.end(data.said, undo));
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

/* ---------- Registration ---------- */

/**
 * WebMCP's hints (`readOnlyHint`, `untrustedContentHint`, `consequentialHint`), plus MCP's
 * (`destructiveHint`, `idempotentHint`, `openWorldHint`) for bridges such as MCP-B. Browsers ignore
 * members their WebIDL does not define.
 */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  untrustedContentHint: boolean;
  consequentialHint: boolean;
  openWorldHint: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface RegisteredTool {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: ToolAnnotations;
  execute(input: unknown, options?: { signal?: AbortSignal }): Promise<object>;
}

export interface ModelContextLike {
  /** Spec: returns a Promise that rejects on a duplicate or invalid name, a denied policy, and so on. Older previews returned nothing. */
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

export function annotations(tool: Tool): ToolAnnotations {
  const hints = { readOnlyHint: tool.readOnly, untrustedContentHint: tool.untrustedContent ?? false, consequentialHint: false, openWorldHint: false };
  return tool.readOnly ? hints : { ...hints, destructiveHint: tool.destructive ?? false, idempotentHint: tool.idempotent ?? false };
}

/** The plain result object is the tool's output: the spec serializes any JSON value, and ChatGPT keeps objects as they are. */
export function toolDefinition(tool: Tool, runner: ToolRunner): RegisteredTool {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: inputSchema(tool.input),
    annotations: annotations(tool),
    execute: (input, options) => runner.call(tool.name, input, { signal: options?.signal }),
  };
}

/** ChatGPT rejects with an empty plain object, so say what little there is. */
function describeReason(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  try {
    return typeof reason === "string" ? reason : (JSON.stringify(reason) ?? String(reason));
  } catch {
    return String(reason);
  }
}

/**
 * Register every tool; aborting `signal` unregisters them. Resolves with the names of tools the browser
 * refused (empty when all registered), after logging each refusal. Never rejects.
 */
export async function registerTools(modelContext: ModelContextLike, runner: ToolRunner, signal: AbortSignal): Promise<string[]> {
  // An async wrapper turns a synchronous throw from an older preview into a rejection too.
  const settled = await Promise.allSettled(runner.tools.map(async (tool) => modelContext.registerTool(toolDefinition(tool, runner), { signal })));
  const failed: string[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") return;
    failed.push(runner.tools[i].name);
    console.warn(`Could not register the ${runner.tools[i].name} tool: ${describeReason(result.reason)}`);
  });
  return failed;
}
