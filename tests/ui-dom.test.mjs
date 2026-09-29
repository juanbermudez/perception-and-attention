// The HTML helpers in src/ui/dom.ts (escaping, [[region|text]] buttons, [label](url) links) and the stage
// toast, on the DOM stub.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, mock, test } from "node:test";
import { build } from "esbuild";
import { installDom, label, StubEvent } from "./dom-stub.mjs";

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
const { escapeHtml, linkedText, richText, toast, regions } = await bundle(`
  export { escapeHtml, linkedText, richText, toast } from "./src/ui/dom.ts";
  export { regions } from "./src/content/regions.ts";
`);
const page = await readFile("src/index.html", "utf8");

/* ---------- HTML helpers ---------- */

test("escapeHtml escapes the five HTML-significant characters and nothing else", () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>Tom & Jerry</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;");
  assert.equal(escapeHtml("V1 · visual cortex → 10%"), "V1 · visual cortex → 10%");
  assert.equal(escapeHtml("&amp;"), "&amp;amp;", "Already-escaped text is escaped again, not trusted.");
});

test("linkedText turns [[region|label]] into a region button and escapes everything around it", () => {
  const html = linkedText("Signals reach [[v1|primary visual cortex]] & <b>more</b>.");
  assert.equal(
    html,
    `Signals reach <button class="region-mention" data-region="v1" aria-label="Show ${escapeHtml(regions.v1.label)}">primary visual cortex</button> &amp; &lt;b&gt;more&lt;/b&gt;.`,
  );
});

test("linkedText escapes the label and leaves unknown regions as plain, escaped text", () => {
  assert.equal(linkedText("[[v1|<img src=x onerror=alert(1)>]]").includes("<img"), false);
  assert.equal(linkedText("See [[notARegion|this]] now"), "See [[notARegion|this]] now");
  assert.equal(linkedText('[[v1"><script>|x]]'), "[[v1&quot;&gt;&lt;script&gt;|x]]", "Ids are letters and digits only.");
  assert.equal(linkedText("[[v1|a]][[lgn|b]]").match(/<button/g).length, 2);
});

test("richText links only http(s) URLs and escapes labels and the surrounding text", () => {
  assert.equal(
    richText("Read [the paper](https://doi.org/10.1/x) <now>."),
    'Read <a href="https://doi.org/10.1/x" target="_blank" rel="noopener noreferrer">the paper</a> &lt;now&gt;.',
  );
  assert.equal(richText("[x](javascript:alert(1))"), "[x](javascript:alert(1))");
  assert.equal(richText('[x](https://a.b/"onmouseover="y)').includes('"onmouseover'), false, "A quote in the URL cannot break out of href.");
  assert.equal(richText("[<b>bold</b>](https://a.b)").includes("<b>"), false);
});

/* ---------- Toast ---------- */

let dom;
beforeEach(() => {
  dom = installDom(page);
  mock.timers.reset();
  mock.timers.enable({ apis: ["setTimeout"] });
});
const node = () => dom.document.getElementById("toast");
const actionButton = () => node().querySelector(".toast-action");
const shown = () => node().classList.contains("visible");

test("a plain toast shows its message and hides after 3.4 s", () => {
  toast("Animation paused");
  assert.equal(node().textContent, "Animation paused");
  assert(shown());
  mock.timers.tick(3399);
  assert(shown());
  mock.timers.tick(1);
  assert(!shown());
});

test("when an action toast hides, its button leaves the page, so an invisible Undo cannot be reached", () => {
  let runs = 0;
  toast("Note deleted.", { label: "Undo", run: () => runs++ });
  assert.equal(actionButton()?.textContent, "Undo");
  assert(node().classList.contains("actionable"));
  mock.timers.tick(6000);
  assert(!shown());
  assert(!node().classList.contains("actionable"));
  assert.equal(label(actionButton()), "null");
  assert.equal(runs, 0);
});

test("clicking the action runs it once, hides the toast and returns focus to where the user was", () => {
  const notes = dom.document.getElementById("notes-button");
  notes.focus();
  let runs = 0;
  toast("Note deleted.", { label: "Undo", run: () => runs++ });
  actionButton().focus();
  actionButton().dispatchEvent(new StubEvent("click", { bubbles: true }));
  assert.equal(runs, 1);
  assert(!shown());
  assert.equal(label(actionButton()), "null");
  assert.equal(label(dom.document.activeElement), label(notes));
});

test("the timer waits while the pointer is on the toast and starts again when it leaves", () => {
  toast("Note deleted.", { label: "Undo", run: () => {} });
  node().dispatchEvent(new StubEvent("pointerenter"));
  mock.timers.tick(30_000);
  assert(shown(), "Hidden while the pointer was on it.");
  node().dispatchEvent(new StubEvent("pointerleave"));
  mock.timers.tick(5999);
  assert(shown());
  mock.timers.tick(1);
  assert(!shown());
});

test("the timer waits while the action has keyboard focus", () => {
  toast("Note deleted.", { label: "Undo", run: () => {} });
  actionButton().focus();
  mock.timers.tick(30_000);
  assert(shown(), "Hidden while its button had focus.");
  dom.document.getElementById("about-button").focus();
  mock.timers.tick(6000);
  assert(!shown());
});

test("a new toast replaces the old one and its action", () => {
  let first = 0;
  toast("Note deleted.", { label: "Undo", run: () => first++ });
  toast("Animation on");
  assert.equal(node().textContent, "Animation on");
  assert.equal(label(actionButton()), "null");
  assert(!node().classList.contains("actionable"));
  mock.timers.tick(3400);
  assert(!shown());
  assert.equal(first, 0);
});
