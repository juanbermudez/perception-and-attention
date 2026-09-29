// Global shortcuts (src/ui/keyboard.ts): ←/→ steps, 1–6 topics and Space for the animation work wherever
// focus is, except for keys the focused control handles itself.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, test } from "node:test";
import { build } from "esbuild";
import { installDom } from "./dom-stub.mjs";

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
const { createShortcutHandler } = await bundle(`export { createShortcutHandler } from "./src/ui/keyboard.ts";`);
const page = await readFile("src/index.html", "utf8");

let dom, calls, state, handle;
beforeEach(() => {
  dom = installDom(page);
  // Controls the page does not have yet: a link, a text box, editable text and a disclosure summary.
  dom.document.body.innerHTML += `<a id="link" href="https://example.org">Paper</a><a id="anchor">No href</a>
    <input id="text"><textarea id="area"></textarea><div contenteditable="true"><p id="editable">Note</p></div>
    <details><summary id="summary">Sources</summary></details><div id="plain" tabindex="0"></div>`;
  calls = [];
  state = { overview: false, step: 2, playing: true };
  const explorer = {
    selectPath: (id) => calls.push(`topic ${id}`),
    setStep: (index) => calls.push(`step ${index}`),
  };
  handle = createShortcutHandler(
    state,
    explorer,
    (value) => calls.push(`playing ${value}`),
    () => false,
  );
});

const byId = (id) => dom.document.getElementById(id);
/** Press a key with `target` focused; returns the calls it made and whether it prevented the default. */
function press(target, key, extra = {}) {
  calls = [];
  const code = key === " " ? "Space" : /^\d$/.test(key) ? `Digit${key}` : key;
  let prevented = false;
  handle({
    key,
    code,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target,
    preventDefault: () => {
      prevented = true;
    },
    ...extra,
  });
  return { calls, prevented };
}

test("with nothing focused, arrows change the step, digits the topic and Space the animation", () => {
  const body = dom.document.body;
  assert.deepEqual(press(body, "ArrowRight"), { calls: ["step 3"], prevented: true });
  assert.deepEqual(press(body, "ArrowLeft"), { calls: ["step 1"], prevented: true });
  assert.deepEqual(press(body, "2").calls, ["topic touch"]);
  assert.deepEqual(press(body, " "), { calls: ["playing false"], prevented: true });
});

test("after a click leaves a button focused, arrows and digits still work", () => {
  for (const id of ["step-next", "home-button", "step-play", "about-button"]) {
    assert.deepEqual(press(byId(id), "ArrowRight").calls, ["step 3"], `ArrowRight on #${id}`);
    assert.deepEqual(press(byId(id), "ArrowLeft").calls, ["step 1"], `ArrowLeft on #${id}`);
    assert.deepEqual(press(byId(id), "6").calls, ["topic attention"], `6 on #${id}`);
  }
  // An element inside a button (the Play label) counts as the button.
  assert.deepEqual(press(byId("step-play-label"), "ArrowRight").calls, ["step 3"]);
});

test("Space and Enter stay with a focused button or summary, which act on them natively", () => {
  for (const id of ["step-next", "step-play-label", "summary"]) {
    assert.deepEqual(press(byId(id), " "), { calls: [], prevented: false }, `Space on #${id}`);
    assert.deepEqual(press(byId(id), "Enter"), { calls: [], prevented: false }, `Enter on #${id}`);
  }
});

test("a link keeps Enter; Space and the other shortcuts still work on it", () => {
  assert.deepEqual(press(byId("link"), "Enter").calls, []);
  assert.deepEqual(press(byId("link"), " ").calls, ["playing false"]);
  assert.deepEqual(press(byId("link"), "ArrowRight").calls, ["step 3"]);
  assert.deepEqual(press(byId("anchor"), " ").calls, ["playing false"], "An anchor without href is not a link.");
});

test("text fields, editable text and the panel's resize handle keep every key", () => {
  for (const id of ["text", "area", "editable", "attention-gain", "inspector-resize"])
    for (const key of ["ArrowRight", "ArrowLeft", "3", " "]) assert.deepEqual(press(byId(id), key), { calls: [], prevented: false }, `${key} on #${id}`);
});

test("tabs keep the arrow keys that move between them; digits still switch topics", () => {
  const tab = byId("region-tab");
  assert.deepEqual(press(tab, "ArrowRight").calls, []);
  assert.deepEqual(press(tab, "ArrowLeft").calls, []);
  assert.deepEqual(press(tab, "4").calls, ["topic speech"]);
});

test("a key another control already handled is not a shortcut", () => {
  assert.deepEqual(press(byId("plain"), "ArrowRight", { defaultPrevented: true }).calls, []);
});

test("modifier keys, an open dialog and the overview limit the shortcuts", () => {
  assert.deepEqual(press(dom.document.body, "ArrowRight", { metaKey: true }).calls, []);
  assert.deepEqual(press(dom.document.body, "2", { altKey: true }).calls, []);
  state.overview = true;
  assert.deepEqual(press(dom.document.body, "ArrowRight").calls, [], "No steps on the overview.");
  assert.deepEqual(press(dom.document.body, "1").calls, ["topic vision"]);
  const blocked = createShortcutHandler(
    state,
    { selectPath: () => calls.push("topic"), setStep: () => calls.push("step") },
    () => {},
    () => true,
  );
  calls = [];
  blocked({ key: "1", code: "Digit1", altKey: false, ctrlKey: false, metaKey: false, target: dom.document.body, preventDefault() {} });
  assert.deepEqual(calls, []);
});

test("a key owner (the open quiz card) sees its keys first", () => {
  const owner = { owns: (event) => event.key === "1", handle: () => calls.push("owner") };
  const owned = createShortcutHandler(
    state,
    { selectPath: () => calls.push("topic"), setStep: () => {} },
    () => {},
    () => false,
    () => owner,
  );
  calls = [];
  owned({ key: "1", code: "Digit1", altKey: false, ctrlKey: false, metaKey: false, target: byId("step-next"), preventDefault() {} });
  assert.deepEqual(calls, ["owner"]);
});
