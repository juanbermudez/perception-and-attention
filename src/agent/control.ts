// The kill switch (spec §12): "Let assistants control this guide" in About. When it is off, write tools
// return agent_control_off and read tools keep working. Kept in localStorage until the store exists (Stage 3).

export const AGENT_CONTROL_KEY = "perception-attention:agent-control";

type SettingStorage = Pick<Storage, "getItem" | "setItem">;

export function createAgentControl(storage: SettingStorage | null) {
  const listeners = new Set<(on: boolean) => void>();
  let on = read();

  function read() {
    try {
      return storage?.getItem(AGENT_CONTROL_KEY) !== "off";
    } catch {
      return true;
    }
  }

  return {
    get on() {
      return on;
    },
    set(next: boolean) {
      if (next === on) return;
      on = next;
      try {
        storage?.setItem(AGENT_CONTROL_KEY, on ? "on" : "off");
      } catch {
        // Private mode or blocked storage: the switch still works for this visit.
      }
      for (const listener of listeners) listener(on);
    },
    onChange(listener: (on: boolean) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type AgentControl = ReturnType<typeof createAgentControl>;

/** localStorage when the browser allows it. */
export function browserStorage(): SettingStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
