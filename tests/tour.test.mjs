import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

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
const { createTourRunner, TOUR_LIMITS } = await bundle(`export * from "./src/api/tour.ts";`);

/** A clock that only moves when the test says so. */
function fakeClock() {
  let now = 0,
    nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(run, ms) {
      const id = nextId++;
      timers.set(id, { run, at: now + ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    get pending() {
      return timers.size;
    },
    /** Advance time, firing due timers in order. */
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = end;
    },
  };
}

function fakeNarration() {
  const calls = [];
  return {
    calls,
    shown: null,
    show(stop) {
      calls.push(["show", stop.text, stop.stop, stop.of, stop.paused]);
      this.shown = stop;
    },
    setPaused(paused) {
      calls.push(["paused", paused]);
      if (this.shown) this.shown = { ...this.shown, paused };
    },
    hide() {
      calls.push(["hide"]);
      this.shown = null;
    },
  };
}

function setup() {
  const clock = fakeClock();
  const narration = fakeNarration();
  const events = [];
  const tour = createTourRunner({ narration, clock, onEvent: (event) => events.push(event) });
  const played = [];
  const stops = [
    { say: "The retina", seconds: 4, id: "a" },
    { say: "The LGN", seconds: 6, id: "b" },
    { say: "", seconds: 2, id: "c" },
  ];
  const start = () =>
    tour.start(stops, (stop, index) => {
      played.push([stop.id, index, tour.driving, clock.now()]);
    });
  return { clock, narration, events, tour, played, start };
}

test("tour limits match the spec", () => {
  assert.deepEqual(TOUR_LIMITS, { stops: 20, say: 280, seconds: { min: 2, max: 30, default: 6 } });
});

test("stops run in order, each for its own seconds, and the caption follows", () => {
  const { clock, narration, events, tour, played, start } = setup();
  start();
  assert.deepEqual(played, [["a", 0, true, 0]], "The first stop runs at once, while the tour is driving.");
  assert.equal(tour.driving, false);
  assert.deepEqual(tour.status(), { stop: 1, of: 3, paused: false });
  assert.deepEqual(narration.calls, [["show", "The retina", 1, 3, false]]);
  clock.tick(3999);
  assert.equal(played.length, 1);
  clock.tick(1);
  assert.deepEqual(played.at(-1), ["b", 1, true, 4000]);
  assert.deepEqual(narration.calls.at(-1), ["show", "The LGN", 2, 3, false]);
  clock.tick(6000);
  assert.deepEqual(played.at(-1), ["c", 2, true, 10000]);
  assert.deepEqual(narration.calls.at(-1), ["show", "", 3, 3, false]);
  clock.tick(2000);
  assert.equal(played.length, 3);
  assert.equal(tour.active, false);
  assert.equal(tour.status(), null);
  assert.deepEqual(narration.calls.at(-1), ["hide"]);
  assert.deepEqual(events, [{ kind: "ended", by: "agent", stop: 3, of: 3 }]);
  assert.equal(clock.pending, 0);
});

test("pausing holds the stop and keeps its time left; user input pauses, it does not stop", () => {
  const { clock, narration, events, tour, played, start } = setup();
  start();
  clock.tick(1500);
  assert.equal(tour.pause("user"), true, "A user orbit, click or key pauses the tour.");
  assert.equal(tour.pause("user"), false, "Pausing twice does nothing.");
  assert.deepEqual(tour.status(), { stop: 1, of: 3, paused: true });
  assert.deepEqual(narration.calls.at(-1), ["paused", true]);
  assert.deepEqual(events, [{ kind: "paused", by: "user", stop: 1, of: 3 }]);
  clock.tick(60_000);
  assert.equal(played.length, 1, "Nothing advances while paused.");
  assert(tour.active && narration.shown, "The tour and its caption stay.");
  assert.equal(tour.resume("user"), true);
  assert.deepEqual(narration.calls.at(-1), ["paused", false]);
  clock.tick(2499);
  assert.equal(played.length, 1);
  clock.tick(1);
  assert.equal(played.length, 2, "The stop finishes its remaining 2.5 s after resuming.");
  assert.deepEqual(
    events.map((event) => event.kind),
    ["paused", "resumed"],
  );
});

test("skip moves on (a paused tour stays paused); skipping the last stop ends the tour", () => {
  const { clock, narration, events, tour, played, start } = setup();
  start();
  tour.pause();
  assert.equal(tour.next("user"), true);
  assert.deepEqual(played.at(-1).slice(0, 2), ["b", 1]);
  assert.deepEqual(narration.calls.at(-1), ["show", "The LGN", 2, 3, true]);
  clock.tick(60_000);
  assert.equal(played.length, 2, "Still paused after the skip.");
  tour.resume();
  clock.tick(6000);
  assert.equal(played.at(-1)[0], "c");
  tour.next("user");
  assert.equal(tour.active, false);
  assert.deepEqual(narration.calls.at(-1), ["hide"]);
  assert.deepEqual(
    events.map((event) => [event.kind, event.by, event.stop]),
    [
      ["paused", "agent", 1],
      ["skipped", "user", 1],
      ["resumed", "agent", 2],
      ["ended", "user", 3],
    ],
  );
});

test("stop ends the tour, clears the caption and cancels the timer", () => {
  const { clock, narration, events, tour, played, start } = setup();
  start();
  clock.tick(1000);
  assert.equal(tour.stop("user"), true);
  assert.equal(tour.active, false);
  assert.equal(narration.shown, null);
  assert.deepEqual(narration.calls.at(-1), ["hide"]);
  assert.equal(clock.pending, 0);
  clock.tick(60_000);
  assert.equal(played.length, 1, "No stop runs after stop.");
  assert.deepEqual(events, [{ kind: "closed", by: "user", stop: 1, of: 3 }]);
  assert.equal(tour.stop(), false, "Stopping twice does nothing.");
  assert.equal(tour.pause(), false);
  assert.equal(tour.next(), false);
});

test("prev and restart replay earlier stops; a new tour replaces the old one", () => {
  const { clock, tour, played, start } = setup();
  start();
  assert.equal(tour.prev(), false, "No stop before the first.");
  clock.tick(4000);
  assert.equal(tour.prev(), true);
  assert.deepEqual(played.map((entry) => entry[0]).join(""), "aba");
  clock.tick(4000);
  tour.pause();
  assert.equal(tour.restart(), true);
  assert.deepEqual(tour.status(), { stop: 1, of: 3, paused: false }, "Restart plays again from stop 1.");
  const other = [];
  tour.start([{ say: "Only", seconds: 2 }], (stop) => other.push(stop.say));
  assert.deepEqual(other, ["Only"]);
  assert.deepEqual(tour.status(), { stop: 1, of: 1, paused: false });
  clock.tick(10_000);
  assert.equal(played.length, 5, "The replaced tour's timer never fires.");
  assert.equal(tour.active, false);
  assert.throws(() => tour.start([], () => {}), /at least one stop/);
});

test("a stop that throws ends the tour instead of leaving it stuck", (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const { clock, narration, tour } = setup();
  tour.start(
    [
      { say: "ok", seconds: 2 },
      { say: "boom", seconds: 2 },
    ],
    (stop) => {
      if (stop.say === "boom") throw new Error("boom");
    },
  );
  clock.tick(2000);
  assert.equal(tour.active, false);
  assert.equal(tour.driving, false);
  assert.deepEqual(narration.calls.at(-1), ["hide"]);
  assert.equal(logged.mock.callCount(), 1);
});
