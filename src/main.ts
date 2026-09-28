import { browserStorage, createAgentControl } from "./agent/control";
import { startAgentSurface } from "./agent/index";
import { createActivityLog } from "./api/activity";
import { createDocsApi } from "./api/docs-api";
import { createGuideApi } from "./api/guide-api";
import { createTourRunner } from "./api/tour";
import { createViewApi, type ViewApi, type ViewOutcome } from "./api/view-api";
import { createBrainScene } from "./scene/brain-scene";
import { createState } from "./state";
import { browserStore } from "./store/client";
import { setupAbout } from "./ui/about";
import { createPresence } from "./ui/agent-presence";
import { byId } from "./ui/dom";
import { createExplorer } from "./ui/explorer";
import { setupKeyboard } from "./ui/keyboard";
import { createNarration } from "./ui/narration";
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
// Captions for assistant tours.
const narration = createNarration(byId("scene-title").closest<HTMLElement>(".brain-stage")!);

let view: ViewApi | undefined;
try {
  const scene = createBrainScene(byId("canvas-container"), byId("region-labels"), state, (id) => explorer.showRegion(id));
  explorer.attachScene(scene);
  view = createViewApi(state, scene);
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
const tour = createTourRunner({
  narration,
  onEvent: (event) => {
    // The agent's own tour controls are logged as its tool calls; the user's, and the natural end, are logged here.
    if (event.by === "user" || event.kind === "ended") activity.append({ by: event.by, kind: `tour_${event.kind}`, said: `Stop ${event.stop} of ${event.of}` });
  },
});
narration.onAction((action) => {
  if (action === "pause") tour.pause("user");
  else if (action === "resume") tour.resume("user");
  else if (action === "skip") tour.next("user");
  else tour.stop("user");
});
// Any user orbit, click or key pauses a tour (it does not end it). The caption bar's buttons, Tab and modifier keys do not.
const QUIET_KEYS = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "CapsLock"]);
for (const type of ["pointerdown", "wheel", "keydown"] as const)
  window.addEventListener(
    type,
    (event) => {
      if (!tour.active || tour.paused || (event.target instanceof Node && narration.element.contains(event.target))) return;
      if (event instanceof KeyboardEvent && QUIET_KEYS.has(event.key)) return;
      tour.pause("user");
    },
    { capture: true, passive: true },
  );
const api = createGuideApi({ explorer, about, activity, playing: () => state.playing, agentControl: () => agentControl.on, view, tour });
const agent = startAgentSurface({ api, control: agentControl, presence, activity, search: location.search });
explorer.onEvent((event) => {
  // Agent navigation is logged once, as its tool call (or its tour); autoplay is not a user action.
  if (!event.auto && !agent.runner.running && !tour.driving) activity.append({ by: "user", kind: event.kind, ref: event.ref });
});
agentControl.onChange((on) => {
  activity.append({ by: "user", kind: "agent_control", on });
  if (!on) {
    presence.hide();
    tour.stop("user");
  }
});

const noScene: ViewOutcome = { error: { code: "not_available", message: "The 3D view is not running." } };
// Inspection hooks for automated checks: render frames in background tabs, read label placement,
// and drive the view API by hand, e.g. explorerDebug.view({ camera: { frame: ["lgn", "v1"], from: "left" } }).
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
    routes: () => explorer.scene?.routesSnapshot(),
    get viewGap() {
      return explorer.scene?.viewGap;
    },
    snapshot: () => explorer.snapshot(),
    view: (patch: unknown) => view?.apply(patch) ?? noScene,
    undoView: () => view?.undo() ?? noScene,
    currentView: () => view?.current(),
    pose: () => explorer.scene?.pose(),
    visibleRegions: () => explorer.scene?.visibleRegions(),
    narrate: (text: string, stop = 1, of = 1) => narration.show({ text, stop, of }),
    narration,
    tour,
  },
});

// Docs and quizzes (Stage 3 core). The store boots on first use, so the guide is unchanged
// until a doc is made. The `doc`/`edit_blocks` tools and the windows wrap this API later.
Object.defineProperty(window, "docsDebug", { value: createDocsApi({ store: browserStore }) });
