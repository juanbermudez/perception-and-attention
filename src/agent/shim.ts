// Dev access (spec §16): `?agent=shim` installs a `document.modelContext` polyfill and
// `window.agentDebug`, so every tool runs in any browser for scripted checks:
//   await agentDebug.call("outline", { ref: "topic:vision" })
import { inputSchema, type ModelContextLike, type RegisteredTool, type ToolRunner } from "./webmcp";

/** The spec's name rule for `registerTool`. */
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const invalid = (message: string) => new DOMException(message, "InvalidStateError");

/**
 * Install the polyfill unless the browser already has a model context. Returns the registry it fills.
 * `registerTool` behaves as the spec's does: it returns a Promise that rejects on an aborted signal, a bad
 * or duplicate name, or an empty description, and aborting the signal unregisters the tool.
 */
export function installModelContextShim(): Map<string, RegisteredTool> | null {
  const host = document as { modelContext?: unknown };
  if (host.modelContext) return null;
  const registry = new Map<string, RegisteredTool>();
  const shim: ModelContextLike = {
    async registerTool(tool, options) {
      if (options?.signal?.aborted) throw options.signal.reason;
      if (!TOOL_NAME.test(tool.name)) throw invalid(`Invalid tool name "${tool.name}": 1–128 of A-Z, a-z, 0-9, _, . and -.`);
      if (!tool.description) throw invalid(`Tool ${tool.name} has no description.`);
      if (registry.has(tool.name)) throw invalid(`Tool already registered: ${tool.name}`);
      JSON.stringify(tool.inputSchema);
      registry.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => registry.delete(tool.name), { once: true });
    },
  };
  Object.defineProperty(document, "modelContext", { value: shim, configurable: true });
  return registry;
}

/** `window.agentDebug`: call tools through the registered definitions, exactly as an agent would. */
export function installAgentDebug(runner: ToolRunner, registry: Map<string, RegisteredTool> | null) {
  const call = async (name: string, args: unknown = {}) => {
    const registered = registry?.get(name);
    return registered ? registered.execute(args) : runner.call(name, args);
  };
  Object.defineProperty(window, "agentDebug", {
    configurable: true,
    value: {
      /** The result exactly as the agent receives it. */
      call,
      /** Name, read-only flag and JSON Schema of every tool. */
      tools: () => runner.tools.map((tool) => ({ name: tool.name, readOnly: tool.readOnly, inputSchema: inputSchema(tool.input) })),
      /** Size in bytes of a result as JSON, to check the 2 KB budget. */
      size: async (name: string, args: unknown = {}) => new TextEncoder().encode(JSON.stringify(await call(name, args))).length,
    },
  });
}
