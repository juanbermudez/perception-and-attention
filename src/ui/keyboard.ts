// Global shortcuts. Native keyboard behaviour wins while a control has focus. A key owner (the open quiz
// card) takes its keys first, so 1–6, Enter and → answer the quiz instead of switching topics or steps.
import { pathways } from "../content/pathways";
import type { ExplorerState } from "../state";
import { toast } from "./dom";
import type { Explorer } from "./explorer";

/** The parts of a keydown event the shortcuts read. */
export interface KeyLike {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

/** A part of the UI that takes some keys while it is open. It sees them before the guide's shortcuts. */
export interface KeyOwner {
  owns(event: KeyLike): boolean;
  handle(event: KeyLike): void;
}

export function createShortcutHandler(
  state: Pick<ExplorerState, "overview" | "step" | "playing">,
  explorer: Pick<Explorer, "selectPath" | "setStep">,
  setPlaying: (value: boolean) => void,
  dialogOpen: () => boolean,
  keyOwner: () => KeyOwner | null = () => null,
) {
  return (event: KeyLike) => {
    if (dialogOpen() || event.altKey || event.ctrlKey || event.metaKey) return;
    const owner = keyOwner();
    if (owner?.owns(event)) {
      owner.handle(event);
      return;
    }
    if ((event.target as HTMLElement | null)?.closest?.('input, textarea, select, button, a, [contenteditable], [role="separator"]')) return;
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
  };
}

export function setupKeyboard(
  state: ExplorerState,
  explorer: Explorer,
  setPlaying: (value: boolean) => void,
  dialogOpen: () => boolean,
  keyOwner?: () => KeyOwner | null,
) {
  window.addEventListener("keydown", createShortcutHandler(state, explorer, setPlaying, dialogOpen, keyOwner));
}
