// Starts the agent surface: builds the tool runner, installs the dev shim on `?agent=shim`, and registers
// the tools when the browser offers a model context. Without one, nothing here touches the page.
import type { ActivityLog } from "../api/activity";
import type { GuideApi } from "../api/guide-api";
import { installAgentDebug, installModelContextShim } from "./shim";
import { agentTools } from "./tools";
import { createToolRunner, findModelContext, type PresencePort, registerTools, resultFormat } from "./webmcp";

export interface AgentSurfaceDeps {
  api: GuideApi;
  control: { readonly on: boolean };
  presence: PresencePort;
  activity: ActivityLog;
  /** location.search: `agent=shim` installs the dev shim; `agent-result=content` switches the result format. */
  search: string;
}

export function startAgentSurface({ api, control, presence, activity, search }: AgentSurfaceDeps) {
  const format = resultFormat(search);
  const runner = createToolRunner({ tools: agentTools, api, control, presence, activity });
  if (new URLSearchParams(search).get("agent") === "shim") installAgentDebug(runner, installModelContextShim(), format);
  const controller = new AbortController();
  const modelContext = findModelContext();
  if (modelContext) {
    try {
      registerTools(modelContext, runner, controller.signal, format);
    } catch (error) {
      // The guide must work without the agent surface.
      console.warn("Could not register the guide's tools", error);
      controller.abort();
    }
  }
  return { runner, registered: modelContext !== null && !controller.signal.aborted, stop: () => controller.abort() };
}
