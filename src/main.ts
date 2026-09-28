import { createDocsApi } from "./api/docs-api";
import { createBrainScene } from "./scene/brain-scene";
import { createState } from "./state";
import { browserStore } from "./store/client";
import { setupAbout } from "./ui/about";
import { byId } from "./ui/dom";
import { createExplorer } from "./ui/explorer";
import { setupKeyboard } from "./ui/keyboard";
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

try {
  explorer.attachScene(createBrainScene(byId("canvas-container"), byId("region-labels"), state, (id) => explorer.showRegion(id)));
  byId("loading").remove();
} catch (error) {
  console.error("Brain view initialization failed", error);
  byId("loading").innerHTML =
    '<div class="error-message">This browser could not start the 3D brain. Try a browser with WebGL enabled. The written topics are still available.</div>';
}
explorer.showIntro();

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
  },
});

// Docs and quizzes (Stage 3 core). The store boots on first use, so the guide is unchanged
// until a doc is made. The `doc`/`edit_blocks` tools and the windows wrap this API later.
Object.defineProperty(window, "docsDebug", { value: createDocsApi({ store: browserStore }) });
