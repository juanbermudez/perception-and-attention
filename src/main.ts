import { browserStorage, createAgentControl } from "./agent/control";
import { startAgentSurface } from "./agent/index";
import { createActivityLog } from "./api/activity";
import { createGuideApi } from "./api/guide-api";
import { createBrainScene } from "./scene/brain-scene";
import { createState } from "./state";
import { setupAbout } from "./ui/about";
import { createPresence } from "./ui/agent-presence";
import { byId } from "./ui/dom";
import { createExplorer } from "./ui/explorer";
import { setupKeyboard } from "./ui/keyboard";
import { setupPanelResize } from "./ui/panel-resize";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const state = createState(reducedMotion.matches);

const agentControl = createAgentControl(browserStorage());
const about = setupAbout(agentControl);
const explorer = createExplorer(state, reducedMotion, () => about.open());
const setPlaying = (value: boolean) => {
  state.playing = value;
};
setupKeyboard(state, explorer, setPlaying, about.isOpen);
setupPanelResize();
byId("about-button").addEventListener("click", () => about.open());
reducedMotion.addEventListener("change", (event) => {
  if (!event.matches) return;
  setPlaying(false);
  explorer.stopWalk();
});

try {
  explorer.attachScene(createBrainScene(byId("canvas-container"), byId("region-labels"), state, (id) => explorer.showRegion(id)));
  byId("loading").remove();
} catch (error) {
  console.error("Brain view initialization failed", error);
  byId("loading").innerHTML =
    '<div class="error-message">This browser could not start the 3D brain. Try a browser with WebGL enabled. The written topics are still available.</div>';
}
// Reload restores the place from the hash (#/vision/parallel-channels); the snapshot settles it before logging starts.
explorer.restore(location.hash);
explorer.snapshot();

// Agent surface (spec §4): tools over GuideApi, an activity log the agent polls, presence and a kill switch.
const activity = createActivityLog();
const presence = createPresence(byId("agent-presence"));
const api = createGuideApi({ explorer, about, activity, playing: () => state.playing, agentControl: () => agentControl.on });
const agent = startAgentSurface({ api, control: agentControl, presence, activity, search: location.search });
explorer.onEvent((event) => {
  // Agent navigation is logged once, as its tool call; autoplay is not a user action.
  if (!event.auto && !agent.runner.running) activity.append({ by: "user", kind: event.kind, ref: event.ref });
});
agentControl.onChange((on) => {
  activity.append({ by: "user", kind: "agent_control", on });
  if (!on) presence.hide();
});

// Inspection hooks for automated checks: render frames in background tabs, read label placement.
Object.defineProperty(window, "explorerDebug", {
  value: {
    state,
    get walking() {
      return explorer.walking;
    },
    diagnostics: () => explorer.scene?.diagnostics(),
    advance: (frames = 1) => explorer.scene?.advance(frames),
    labels: () => explorer.scene?.labelsSnapshot(),
    head: () => explorer.scene?.headSnapshot(),
    get viewGap() {
      return explorer.scene?.viewGap;
    },
    snapshot: () => explorer.snapshot(),
  },
});
