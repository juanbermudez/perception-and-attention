import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({ entryPoints: ["src/model/activity.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { createWeight, createColor, stepWeight, stepColor, stepPoint, relax } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const advance = (motion, target, seconds, fps = 60, reduced = false) => {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) stepWeight(motion, target, 1 / fps, reduced);
  return motion.value;
};

const weight = createWeight();
for (const target of [1, 0]) {
  for (let frame = 0; frame < 120; frame++) {
    const previous = weight.value;
    stepWeight(weight, target, 1 / 60);
    assert(weight.value >= 0 && weight.value <= 1);
    assert(target === 1 ? weight.value >= previous : weight.value <= previous, "A fixed target should settle without bouncing.");
  }
  assert.equal(weight.value, target);
}
const frameRates = [30, 60, 120].map((fps) => advance(createWeight(), 1, 0.4, fps));
assert(Math.max(...frameRates) - Math.min(...frameRates) < 1e-10, "Transition depends on frame rate.");
console.log("PASS activity enters and exits monotonically; 30/60/120 Hz converge to the same brightness.");

const interrupted = createWeight();
advance(interrupted, 1, 0.15);
const continued = { value: interrupted.value, velocity: interrupted.velocity };
const restarted = createWeight(interrupted.value);
stepWeight(interrupted, 0, 1 / 60);
stepWeight(continued, 0, 1 / 60);
stepWeight(restarted, 0, 1 / 60);
assert.deepEqual(interrupted, continued, "Retargeting discarded current velocity.");
assert.notEqual(interrupted.value, restarted.value, "Interrupted motion restarted from rest.");
for (let frame = 0; frame < 900; frame++) {
  stepWeight(interrupted, frame % 13 < 7 ? 1 : 0, 1 / 60);
  assert(Number.isFinite(interrupted.value) && Number.isFinite(interrupted.velocity));
  assert(interrupted.value >= 0 && interrupted.value <= 1);
}
assert.equal(advance(interrupted, 0, 2), 0);
const frozen = { ...interrupted };
stepWeight(interrupted, 1, 0);
assert.deepEqual(interrupted, frozen);
const stalled = createWeight(),
  capped = createWeight();
stepWeight(stalled, 1, 5);
stepWeight(capped, 1, 0.05);
assert.deepEqual(stalled, capped, "A stalled frame skipped the transition.");
console.log("PASS rapid retargeting preserves motion, remains bounded, and settles; zero delta and stalled frames are stable.");

const color = createColor([0.8, 0.2, 0.1]),
  output = color.value,
  velocity = color.velocity;
const target = [0.1, 0.4, 0.9];
stepColor(color, target, 1 / 60);
assert.equal(color.value, output);
assert.equal(color.velocity, velocity);
assert(color.value[0] < 0.8 && color.value[0] > 0.1);
assert(color.value[2] > 0.1 && color.value[2] < 0.9);
for (let frame = 0; frame < 120; frame++) stepColor(color, target, 1 / 60);
assert.deepEqual(color.value, target);
const black = [0, 0, 0];
stepColor(color, black, 1 / 60);
assert(color.value.every((value, axis) => value > 0 && value < target[axis]));
for (let frame = 0; frame < 120; frame++) stepColor(color, black, 1 / 60);
assert.deepEqual(color.value, black);
assert.deepEqual(target, [0.1, 0.4, 0.9], "A target tuple was mutated.");
assert.equal(color.value, output);
console.log("PASS RGB transitions crossfade and fade out using the same caller-owned tuples.");

const standard = createWeight(),
  reduced = createWeight();
advance(standard, 1, 0.2);
advance(reduced, 1, 0.2, 60, true);
assert(reduced.value > standard.value && reduced.value > 0.97);
const firstReduced = createWeight();
stepWeight(firstReduced, 1, 1 / 60, true);
assert(firstReduced.value > 0 && firstReduced.value < 1, "Reduced motion should retain brief feedback.");
console.log("PASS reduced motion retains a brief fade and settles faster.");

// Leaky integration: exact exponential decay, independent of frame rate.
const decayed = [30, 60, 120].map((fps) => {
  let v = 1;
  for (let i = 0; i < fps; i++) v = relax(v, 1 / fps, 0.9);
  return v;
});
for (const v of decayed) assert(Math.abs(v - Math.exp(-1 / 0.9)) < 1e-12);
assert.equal(relax(0.5, 0, 0.9), 0.5);
console.log("PASS region activity decays exponentially (τ = 0.9 s) and identically at 30/60/120 Hz.");

// Positions (the view-gap focus) ease like colours but are not clamped to 0–1.
{
  const point = createColor([0, 0, 0]),
    goal = [2.5, -1.2, 0.8];
  for (let frame = 0; frame < 180; frame++) stepPoint(point, goal, 1 / 60);
  for (let axis = 0; axis < 3; axis++) assert(Math.abs(point.value[axis] - goal[axis]) < 0.01, `axis ${axis}: ${point.value[axis]}`);
  const standard = createColor([0, 0, 0]),
    reducedPoint = createColor([0, 0, 0]);
  for (let frame = 0; frame < 12; frame++) {
    stepPoint(standard, goal, 1 / 60);
    stepPoint(reducedPoint, goal, 1 / 60, true);
  }
  assert(Math.abs(reducedPoint.value[0] - goal[0]) < Math.abs(standard.value[0] - goal[0]), "Reduced motion should settle faster.");
  console.log("PASS positions ease to targets outside 0–1 and settle faster with reduced motion.");
}
