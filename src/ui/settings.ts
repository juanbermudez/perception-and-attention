// Settings popover: layer toggles, camera views, reset and fullscreen.
import type { ExplorerState } from "../state";
import { byId, toast } from "./dom";
import type { Explorer } from "./explorer";

type View = "front" | "left" | "right" | "top" | "ear";

function setToggle(id: string, value: boolean) {
  const button = byId(id);
  button.classList.toggle("active", value);
  button.setAttribute("aria-pressed", String(value));
}

export function setupSettings(state: ExplorerState, explorer: Explorer) {
  const toggles: [id: string, key: "labels" | "xray" | "skull" | "bones"][] = [
    ["labels-toggle", "labels"],
    ["tissue-toggle", "xray"],
    ["skull-toggle", "skull"],
    ["bone-toggle", "bones"],
  ];
  for (const [id, key] of toggles) {
    byId(id).addEventListener("click", () => {
      state[key] = !state[key];
      setToggle(id, state[key]);
      if (key === "labels") document.body.classList.toggle("labels-hidden", !state.labels);
    });
  }

  function setPlaying(value: boolean) {
    state.playing = value;
    setToggle("play-toggle", value);
  }
  byId("play-toggle").addEventListener("click", () => setPlaying(!state.playing));
  setPlaying(state.playing);

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    button.addEventListener("click", () => {
      if (button.dataset.view === "ear") explorer.selectRegion("cochlea");
      explorer.scene?.setView(button.dataset.view as View);
    });
  }
  byId("reset-view").addEventListener("click", () => {
    explorer.scene?.reset();
    toast("Back to the starting view");
  });
  byId("fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector(".workspace")?.requestFullscreen();
    } catch {
      toast("Fullscreen is unavailable here. You can still orbit and zoom.");
    }
  });

  return { setPlaying };
}
