// Agent presence (spec §12): an "Assistant" pill at the top left of the stage while a write tool runs and
// for 2 s after, with its last `said` line, plus a toast for each action (with Undo when it can be undone).
// The toast is the existing #toast live region, so screen readers hear each action once; the pill is visual.
import type { Undo } from "../api/result";
import { toast } from "./dom";

const LINGER_MS = 2000;

export function createPresence(pill: HTMLElement) {
  const said = pill.querySelector<HTMLElement>(".agent-said");
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function hide() {
    clearTimeout(hideTimer);
    pill.classList.remove("visible", "working");
  }

  return {
    begin() {
      clearTimeout(hideTimer);
      pill.classList.add("visible", "working");
    },
    end(text?: string, undo?: Undo) {
      pill.classList.remove("working");
      if (text) {
        if (said) said.textContent = text;
        toast(text, undo);
      }
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, LINGER_MS);
    },
    hide,
  };
}

export type Presence = ReturnType<typeof createPresence>;
