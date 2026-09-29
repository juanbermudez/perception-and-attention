// Runs the real explorer (src/ui/explorer.ts) in Node, so tests drive the same navigation code as the page
// instead of a copy that can drift from it. The DOM here is inert: every element accepts any property and
// any method call, finds nothing and draws nothing. Timers are the caller's: use node:test mock timers.

/** An element that takes every write and answers every method with null (querySelectorAll with []). */
function inertElement() {
  const own = {
    children: [],
    dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  return new Proxy(own, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "symbol") return undefined;
      return key === "querySelectorAll" ? () => [] : () => null;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

/** Install the globals explorer.ts touches. Each test file runs in its own process, so this stays local. */
export function installInertDom() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, inertElement());
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: element,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => inertElement(),
    activeElement: null,
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.location = { pathname: "/", search: "", hash: "" };
  globalThis.history = {
    state: null,
    replaceState(_state, _title, url) {
      globalThis.location.hash = String(url).replace(/^[^#]*/, "");
    },
  };
  globalThis.getSelection = () => null;
  globalThis.Element ??= class Element {};
  globalThis.requestAnimationFrame = () => 0;
}

/**
 * The scene as the explorer sees it. Selecting a region or going home clears an agent's view focus, as
 * brain-scene.ts does; nothing else is drawn.
 */
export function inertScene(state) {
  return {
    focusRegion() {
      state.viewFocus = null;
    },
    reset() {
      state.viewFocus = null;
    },
    sendVolley() {},
    previewRegion() {},
    endPreview() {},
  };
}

/** Record goTo calls as "<kind>:<path>/<index or id>" (or "overview") with their options, and pass them on. */
export function recordGoTo(explorer) {
  const calls = [];
  const goTo = explorer.goTo;
  return Object.assign(Object.create(explorer), {
    calls,
    goTo(target, options) {
      calls.push([target.kind === "overview" ? "overview" : `${target.kind}:${target.path ?? ""}/${target.index ?? target.id ?? ""}`, options]);
      goTo(target, options);
    },
  });
}
