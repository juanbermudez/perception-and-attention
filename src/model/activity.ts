import { clamp, type Vec3 } from "math";
import { spring, spring3 } from "math/time";

export const ACTIVITY_CUTOFF = 0.002;
export type WeightMotion = ReturnType<typeof spring.create>;
export type ColorMotion = ReturnType<typeof spring3.create>;

export function createWeight(value = 0): WeightMotion {
  return spring.create(clamp(value, 0, 1));
}
export function createColor(value: Vec3 = [0, 0, 0]): ColorMotion {
  return spring3.create(value);
}

// Caller-owned springs retain their current value and velocity when retargeted.
// Delta is wall-clock seconds, independent of playback speed and pause state.
// Critical damping gives continuity without bounce; exits settle sooner.
export function stepWeight(motion: WeightMotion, target: number, delta: number, reducedMotion = false): number {
  if (delta <= 0) return motion.value;
  const goal = clamp(target, 0, 1),
    seconds = clamp(delta, 0, 0.05);
  spring.damp(motion, goal, reducedMotion ? 0.07 : goal >= motion.value ? 0.28 : 0.2, seconds);
  const bounded = clamp(motion.value, 0, 1);
  if (bounded !== motion.value) {
    motion.value = bounded;
    motion.velocity = 0;
  }
  if (Math.abs(motion.value - goal) < 0.0001 && Math.abs(motion.velocity) < 0.001) {
    motion.value = goal;
    motion.velocity = 0;
  }
  return motion.value;
}

// Linear RGB stays in reusable tuples at the Three.js boundary. Fading toward
// black also lets an outgoing activity patch keep its color until it disappears.
export function stepColor(motion: ColorMotion, target: Vec3, delta: number, reducedMotion = false): Vec3 {
  if (delta <= 0) return motion.value;
  spring3.damp(motion, target, reducedMotion ? 0.07 : 0.24, clamp(delta, 0, 0.05));
  for (let axis = 0; axis < 3; axis++) {
    const bounded = clamp(motion.value[axis], 0, 1);
    if (bounded !== motion.value[axis]) {
      motion.value[axis] = bounded;
      motion.velocity[axis] = 0;
    }
    if (Math.abs(motion.value[axis] - target[axis]) < 0.0001 && Math.abs(motion.velocity[axis]) < 0.001) {
      motion.value[axis] = target[axis];
      motion.velocity[axis] = 0;
    }
  }
  return motion.value;
}

// Exact one-step solution of τ·dx/dt = −x, so decay is frame-rate independent.
export function relax(value: number, delta: number, tau: number): number {
  return delta <= 0 ? value : value * Math.exp(-delta / tau);
}
