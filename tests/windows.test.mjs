// Window geometry (spec §8, plan Stage 4): named slots and sizes, constraining, cascading and arranging.
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const result = await build({
  stdin: { contents: `export * from "./src/ui/window-geometry.ts";`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const g = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);

const DESKTOP = { width: 1280, height: 800 };
const SMALL = { width: 760, height: 520 };
const inside = (rect, stage) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= stage.width && rect.y + rect.h <= stage.height;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("sizes: s 320×380, m 440×540, l 600×min(760, stage − 40), shrunk to fit small stages", () => {
  assert.deepEqual(g.sizeFor("s", DESKTOP), { w: 320, h: 380 });
  assert.deepEqual(g.sizeFor("m", DESKTOP), { w: 440, h: 540 });
  assert.deepEqual(g.sizeFor("l", DESKTOP), { w: 600, h: DESKTOP.height - g.TOP_INSET - g.MARGIN });
  assert.deepEqual(g.sizeFor("l", { width: 1600, height: 1200 }), { w: 600, h: 760 });
  const small = g.sizeFor("l", SMALL);
  assert(small.w <= SMALL.width - 2 * g.MARGIN && small.h <= SMALL.height - g.TOP_INSET - g.MARGIN);
  const tiny = g.sizeFor("m", { width: 200, height: 150 });
  assert.deepEqual(tiny, g.MIN_SIZE, "Never smaller than the minimum.");
});

test("every slot resolves inside the stage, below the dock, on its side", () => {
  for (const stage of [DESKTOP, SMALL])
    for (const size of g.SIZES)
      for (const slot of g.SLOTS) {
        const rect = g.slotRect(slot, g.sizeFor(size, stage), stage);
        assert(inside(rect, stage), `${slot} ${size} ${JSON.stringify(rect)}`);
        assert(rect.y >= g.TOP_INSET, `${slot} ${size} clears the dock`);
      }
  const size = g.sizeFor("s", DESKTOP);
  const at = (slot) => g.slotRect(slot, size, DESKTOP);
  assert.equal(at("left").x, g.MARGIN);
  assert.equal(at("right").x + size.w, DESKTOP.width - g.MARGIN);
  assert.equal(at("top-left").y, g.TOP_INSET);
  assert.equal(at("bottom-right").y + size.h, DESKTOP.height - g.MARGIN);
  assert(Math.abs(at("center").x + size.w / 2 - DESKTOP.width / 2) <= 1);
  for (const slot of g.SLOTS) assert.equal(g.nearestSlot(at(slot), DESKTOP), slot, slot);
});

test("constrain keeps at least 48 px and the header inside, and sizes sane", () => {
  const stage = DESKTOP;
  const far = g.constrain({ x: 5000, y: 5000, w: 400, h: 300 }, stage);
  assert.equal(far.x, stage.width - g.MIN_VISIBLE);
  assert.equal(far.y, stage.height - g.MIN_VISIBLE);
  const off = g.constrain({ x: -5000, y: -80, w: 400, h: 300 }, stage);
  assert.equal(off.x + off.w, g.MIN_VISIBLE);
  assert.equal(off.y, 0, "The header never goes above the stage.");
  const shrunk = g.constrain({ x: 0, y: 0, w: 10, h: 10 }, stage);
  assert.deepEqual([shrunk.w, shrunk.h], [g.MIN_SIZE.w, g.MIN_SIZE.h]);
  const huge = g.constrain({ x: 0, y: 0, w: 9000, h: 9000 }, stage);
  assert.deepEqual([huge.w, huge.h], [stage.width, stage.height]);
});

test("new windows cascade off windows already in the same place", () => {
  const first = g.slotRect("right", g.sizeFor("m", DESKTOP), DESKTOP);
  const second = g.cascade(first, [first], DESKTOP);
  assert.notDeepEqual([second.x, second.y], [first.x, first.y]);
  const third = g.cascade(first, [first, second], DESKTOP);
  assert.notDeepEqual([third.x, third.y], [second.x, second.y]);
  assert.deepEqual(g.cascade(first, [], DESKTOP), first);
  for (const rect of [second, third]) assert(inside(rect, DESKTOP));
});

test("arrange: tile gives non-overlapping rects inside the free area; stack cascades", () => {
  for (const count of [1, 2, 3, 4, 5, 8]) {
    const rects = g.arrange("tile", count, DESKTOP);
    assert.equal(rects.length, count);
    for (const rect of rects) assert(inside(rect, DESKTOP) && rect.y >= g.TOP_INSET, JSON.stringify(rect));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert(!overlap(rects[i], rects[j]), `${count}: ${i} and ${j} overlap`);
  }
  const stack = g.arrange("stack", 3, DESKTOP);
  assert.equal(stack[1].x - stack[0].x, 28);
  assert.equal(stack[1].y - stack[0].y, 28);
  assert.deepEqual(g.arrange("tile", 0, DESKTOP), []);
});

test("mobile below 720 px", () => {
  assert.equal(g.isMobile(719), true);
  assert.equal(g.isMobile(720), false);
  assert.equal(g.MAX_OPEN, 8);
});
