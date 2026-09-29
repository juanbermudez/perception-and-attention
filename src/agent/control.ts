// The kill switch (spec §12): "Let assistants control this guide" in About. When it is off, write tools
// return agent_control_off and read tools keep working. Kept in localStorage until the store exists (Stage 3),
// and shared by every tab of the guide: switching it in one tab switches it in the others.

export const AGENT_CONTROL_KEY = "perception-attention:agent-control";

type SettingStorage = Pick<Storage, "getItem" | "setItem">;
/** Where `storage` events arrive: the window, when there is one. */
type StorageEvents = Pick<EventTarget, "addEventListener">;

const windowEvents = (): StorageEvents | null => (typeof window === "undefined" ? null : window);

export function createAgentControl(storage: SettingStorage | null, events: StorageEvents | null = windowEvents()) {
  const listeners = new Set<(on: boolean) => void>();
  let on = read();

  function read() {
    try {
      return storage?.getItem(AGENT_CONTROL_KEY) !== "off";
    } catch {
      return true;
    }
  }

  function update(next: boolean) {
    if (next === on) return;
    on = next;
    for (const listener of listeners) listener(on);
  }

  // Another tab changed the setting (a null key means that tab cleared storage).
  events?.addEventListener("storage", (event) => {
    const key = (event as StorageEvent).key;
    if (key === AGENT_CONTROL_KEY || key === null) update(read());
  });

  return {
    get on() {
      return on;
    },
    set(next: boolean) {
      if (next === on) return;
      try {
        storage?.setItem(AGENT_CONTROL_KEY, next ? "on" : "off");
      } catch {
        // Private mode or blocked storage: the switch still works for this visit.
      }
      update(next);
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
