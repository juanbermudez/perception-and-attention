// Dev access (spec §16): `?agent=shim` installs a `document.modelContext` polyfill and
// `window.agentDebug`, so every tool runs in any browser for scripted checks:
//   await agentDebug.call("outline", { ref: "topic:vision" })
import { decodeResult, encodeResult, inputSchema, type ModelContextLike, type RegisteredTool, type ResultFormat, type ToolRunner } from "./webmcp";

/** Install the polyfill unless the browser already has a model context. Returns the registry it fills. */
export function installModelContextShim(): Map<string, RegisteredTool> | null {
  const host = document as { modelContext?: unknown };
  if (host.modelContext) return null;
  const registry = new Map<string, RegisteredTool>();
  const shim: ModelContextLike = {
    registerTool(tool, options) {
      if (registry.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
      registry.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => registry.delete(tool.name), { once: true });
    },
  };
  Object.defineProperty(document, "modelContext", { value: shim, configurable: true });
  return registry;
}

/** `window.agentDebug`: call tools through the registered definitions, exactly as an agent would. */
export function installAgentDebug(runner: ToolRunner, registry: Map<string, RegisteredTool> | null, format: ResultFormat) {
  const raw = async (name: string, args: unknown = {}) => {
    const registered = registry?.get(name);
    return registered ? registered.execute(args) : encodeResult(await runner.call(name, args), format);
  };
  Object.defineProperty(window, "agentDebug", {
    configurable: true,
    value: {
      /** The decoded result, whatever the result format. */
      call: async (name: string, args: unknown = {}) => decodeResult(await raw(name, args)),
      /** The result exactly as the agent receives it. */
      raw,
      /** Name, read-only flag and JSON Schema of every tool. */
      tools: () => runner.tools.map((tool) => ({ name: tool.name, readOnly: tool.readOnly, inputSchema: inputSchema(tool.input) })),
      /** Size in bytes of a result as JSON, to check the 2 KB budget. */
      size: async (name: string, args: unknown = {}) => new TextEncoder().encode(JSON.stringify(await raw(name, args))).length,
      format,
    },
  });
}
