// The explanation panel's resize handle (src/ui/panel-resize.ts): a size the user set stays inside the
// bounds when the window changes, and never overrides the stylesheet's narrower default on smaller screens.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, test } from "node:test";
import { build } from "esbuild";
import { installDom, StubEvent } from "./dom-stub.mjs";

async function bundle(source) {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const page = await readFile("src/index.html", "utf8");
// Some code reads the media queries when it is loaded, so a DOM is installed before importing it.
installDom(page);
const { setupPanelResize, PANEL_SIZE_KEYS } = await bundle(`export { setupPanelResize, PANEL_SIZE_KEYS } from "./src/ui/panel-resize.ts";`);

let dom, workspace, handle, narrow, compact, stored;
/** localStorage, reduced to a Map. */
const memoryStorage = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), map };
};
/** The stylesheet, reduced to what sizes the panel: an inline size wins over the media-query defaults. */
function layout() {
  // The rail beside the panel is 56 px wide on wide screens.
  dom.document.getElementById("rail").rect = () => ({ width: narrow.matches ? 48 : 56, height: dom.window.innerHeight });
  const inspector = dom.document.getElementById("inspector");
  inspector.rect = () => {
    const width = workspace.style.getPropertyValue("--inspector-width");
    const height = workspace.style.getPropertyValue("--drawer-height");
    return {
      width: narrow.matches ? dom.window.innerWidth : width ? Number.parseFloat(width) : compact.matches ? 332 : 400,
      height: narrow.matches ? (height ? Number.parseFloat(height) : 0.46 * dom.window.innerHeight) : dom.window.innerHeight,
    };
  };
}
/** Resize the window: media queries first, then the resize event (browsers may do either first). */
function resizeTo(width, height = dom.window.innerHeight) {
  Object.assign(dom.window, { innerWidth: width, innerHeight: height });
  narrow.set(width <= 740);
  compact.set(width <= 1000);
  dom.window.dispatchEvent(new StubEvent("resize"));
}
function start(width, height = 900, storage = null) {
  stored = storage;
  dom = installDom(page, { width, height });
  workspace = dom.document.querySelector(".workspace");
  handle = dom.document.getElementById("inspector-resize");
  narrow = dom.media("(max-width: 740px)");
  compact = dom.media("(max-width: 1000px)");
  narrow.matches = width <= 740;
  compact.matches = width <= 1000;
  layout();
  setupPanelResize(storage);
}
const key = (name) => handle.dispatchEvent(new StubEvent("keydown", { key: name, bubbles: true }));
const inlineWidth = () => workspace.style.getPropertyValue("--inspector-width");
const inlineHeight = () => workspace.style.getPropertyValue("--drawer-height");
const now = () => handle.getAttribute("aria-valuenow");

beforeEach(() => start(1400));

test("arrow keys, Home and End resize the panel within its bounds", () => {
  assert.equal(now(), "400");
  // The handle is on the panel's right edge, toward the 3D view: ArrowRight widens the panel.
  key("ArrowRight");
  assert.equal(inlineWidth(), "424px");
  key("ArrowLeft");
  key("ArrowLeft");
  assert.equal(inlineWidth(), "376px");
  key("End");
  assert.equal(inlineWidth(), "560px");
  key("Home");
  assert.equal(inlineWidth(), "300px");
  assert.equal(handle.getAttribute("aria-valuemax"), "560");
});

test("a width the user set is kept, within the new bounds, when the window crosses into the narrower default", () => {
  key("End");
  assert.equal(inlineWidth(), "560px");
  resizeTo(900);
  assert.equal(inlineWidth(), "424px", "900 px less the 56 px rail and 420 px of stage.");
});

test("the width the user picks is saved and comes back on the next visit, clamped to the window", () => {
  start(1400, 900, memoryStorage());
  key("ArrowRight");
  assert.equal(stored.map.get(PANEL_SIZE_KEYS.width), "424");
  // Next visit: the saved width applies before any interaction.
  start(1400, 900, memoryStorage({ [PANEL_SIZE_KEYS.width]: "480" }));
  assert.equal(inlineWidth(), "480px");
  assert.equal(now(), "480");
  // A smaller window clamps it; the saved choice is kept, so it returns when the window grows again.
  resizeTo(900);
  assert.equal(inlineWidth(), "424px");
  assert.equal(stored.map.get(PANEL_SIZE_KEYS.width), "480");
  resizeTo(1400);
  assert.equal(inlineWidth(), "480px");
});

test("the narrow layout keeps its own saved drawer height, and bad saved values are ignored", () => {
  start(700, 900, memoryStorage({ [PANEL_SIZE_KEYS.width]: "480", [PANEL_SIZE_KEYS.height]: "300" }));
  assert.equal(inlineHeight(), "300px");
  assert.equal(inlineWidth(), "");
  start(1400, 900, memoryStorage({ [PANEL_SIZE_KEYS.width]: "wide" }));
  assert.equal(inlineWidth(), "");
  assert.equal(now(), "400");
});

test("a width the user set is clamped again when the window shrinks", () => {
  start(990);
  key("End");
  assert.equal(inlineWidth(), "514px", "990 px less the 56 px rail and 420 px of stage.");
  resizeTo(800);
  assert.equal(inlineWidth(), "324px", "The rail and at least 420 px of stage stay beside the panel.");
  assert.equal(now(), "324");
  assert.equal(handle.getAttribute("aria-valuemax"), "324");
});

test("on narrow screens the drawer height is clamped when the window gets shorter", () => {
  start(700, 900);
  assert.equal(handle.getAttribute("aria-orientation"), "horizontal");
  key("End");
  assert.equal(inlineHeight(), "640px");
  resizeTo(700, 600);
  assert.equal(inlineHeight(), "340px");
});

test("without a size set by the user, a resize leaves the stylesheet in charge", () => {
  resizeTo(1100);
  resizeTo(900);
  assert.equal(inlineWidth(), "");
  assert.equal(now(), "332");
});
