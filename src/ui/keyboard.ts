// Global shortcuts. Native keyboard behaviour wins while a control has focus.
import { pathways } from "../content/pathways";
import type { ExplorerState } from "../state";
import { toast } from "./dom";
import type { Explorer } from "./explorer";

export function setupKeyboard(state: ExplorerState, explorer: Explorer, setPlaying: (value: boolean) => void, dialogOpen: () => boolean) {
  window.addEventListener("keydown", (event) => {
    if (dialogOpen() || event.altKey || event.ctrlKey || event.metaKey) return;
    if ((event.target as HTMLElement).closest('input, textarea, select, button, a, [contenteditable], [role="separator"]')) return;
    if (event.code === "Space") {
      event.preventDefault();
      setPlaying(!state.playing);
      toast(state.playing ? "Animation on" : "Animation paused");
    } else if (/^[1-6]$/.test(event.key)) {
      explorer.selectPath(pathways[Number(event.key) - 1].id);
    } else if (!state.overview && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      explorer.setStep(state.step + (event.key === "ArrowRight" ? 1 : -1));
    }
  });
}
