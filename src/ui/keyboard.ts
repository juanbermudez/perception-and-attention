// Global shortcuts. They work wherever focus is, except for keys the focused control acts on itself: text
// fields and the resize handle keep every key, buttons keep Space and Enter, links keep Enter, and tabs keep
// the arrows. A key owner (the open quiz card) takes its keys first, so 1–6, Enter and → answer the quiz
// instead of switching topics or steps.
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
  /** Set when a handler nearer the target already acted on the key. */
  defaultPrevented?: boolean;
  preventDefault(): void;
}

/** Controls that keep every key: text entry, editable text and the panel's resize handle. */
const KEEPS_ALL_KEYS = 'input, textarea, select, [contenteditable], [role="separator"]';
/** Controls that act on Enter, and (except links) on Space. */
const ACTIVATES = 'button, summary, a[href], [role="button"], [role="switch"], [role="tab"]';
const TAB_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

/** Whether the focused element does something with this key itself, so it is not a shortcut there. */
export function keyIsNative(target: EventTarget | null, event: Pick<KeyLike, "key" | "code">): boolean {
  const element = target as HTMLElement | null;
  if (!element?.closest) return false;
  if (element.closest(KEEPS_ALL_KEYS)) return true;
  const control = element.closest(ACTIVATES);
  if (!control) return false;
  if (event.key === "Enter") return true;
  if (event.code === "Space") return !control.matches("a[href]");
  return control.matches('[role="tab"]') && TAB_KEYS.has(event.key);
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
    if (event.defaultPrevented || keyIsNative(event.target, event)) return;
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
