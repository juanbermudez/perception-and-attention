// Starts the agent surface: builds the tool runner, installs the dev shim on `?agent=shim`, and registers
// the tools when the browser offers a model context. Without one, nothing here touches the page.
import type { ActivityLog } from "../api/activity";
import type { GuideApi } from "../api/guide-api";
import { installAgentDebug, installModelContextShim } from "./shim";
import { agentTools } from "./tools";
import { createToolRunner, findModelContext, type PresencePort, registerTools } from "./webmcp";

export interface AgentSurfaceDeps {
  api: GuideApi;
  control: { readonly on: boolean };
  presence: PresencePort;
  activity: ActivityLog;
  /** location.search: `agent=shim` installs the dev shim. */
  search: string;
}

export function startAgentSurface({ api, control, presence, activity, search }: AgentSurfaceDeps) {
  const runner = createToolRunner({ tools: agentTools, api, control, presence, activity });
  if (new URLSearchParams(search).get("agent") === "shim") installAgentDebug(runner, installModelContextShim());
  const controller = new AbortController();
  const modelContext = findModelContext();
  // All or nothing: a partial tool list would leave the agent planning with tools that are missing.
  // The guide must work without the agent surface, so a refusal is logged, never thrown.
  const registered = modelContext
    ? registerTools(modelContext, runner, controller.signal).then((failed) => {
        if (failed.length) controller.abort();
        return failed.length === 0;
      })
    : Promise.resolve(false);
  return {
    runner,
    /** Resolves true once every tool is registered; false without a model context or after a refusal. */
    registered,
    stop: () => controller.abort(),
  };
}
