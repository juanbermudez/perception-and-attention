import { createViewApi, type ViewApi, type ViewOutcome } from "./api/view-api";
import { createBrainScene } from "./scene/brain-scene";
import { createState } from "./state";
import { setupAbout } from "./ui/about";
import { byId } from "./ui/dom";
import { createExplorer } from "./ui/explorer";
import { setupKeyboard } from "./ui/keyboard";
import { createNarration } from "./ui/narration";
import { setupPanelResize } from "./ui/panel-resize";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const state = createState(reducedMotion.matches);

const about = setupAbout();
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
// Captions for assistant tours; the tour runner arrives with the agent tools.
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
explorer.showIntro();

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
    view: (patch: unknown) => view?.apply(patch) ?? noScene,
    undoView: () => view?.undo() ?? noScene,
    currentView: () => view?.current(),
    pose: () => explorer.scene?.pose(),
    visibleRegions: () => explorer.scene?.visibleRegions(),
    narrate: (text: string, stop = 1, of = 1) => narration.show({ text, stop, of }),
    narration,
  },
});
