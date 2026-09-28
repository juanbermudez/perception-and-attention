import { clamp, type Vec3, vec3 } from "math";
import { mulberry32 } from "math/random";
import * as THREE from "three";
import { regions } from "../content/regions";
import type { Edge } from "../content/types";

/** Points sampled along each route curve. */
export const SAMPLES = 100;

// One seeded generator for all sampling, so the scene is identical on every load.
const random = mulberry32.create(1337);
export function sample() {
  return mulberry32.sample(random);
}

const _curve_b = vec3.create();
const _curve_c = vec3.create();
const _a = vec3.create();
const _b = vec3.create();
const _tangent = vec3.create();
const _normal = vec3.create();
const _binormal = vec3.create();

/** Cubic Bézier between two landmarks; `bend` offsets both control points. */
export function sampleEdge(out: Vec3, edge: Edge, t: number): Vec3 {
  const a = regions[edge.from].position;
  const d = regions[edge.to].position;
  vec3.lerp(_curve_b, a, d, 0.34);
  vec3.add(_curve_b, _curve_b, edge.bend);
  vec3.lerp(_curve_c, a, d, 0.67);
  vec3.add(_curve_c, _curve_c, edge.bend);
  return vec3.bezier(out, a, _curve_b, _curve_c, d, clamp(t, 0, 1));
}

/** Decode quantized atlas positions. Every part already has the same uniform transform. */
export function unpack(data: string, divisor = 1000): Float32Array {
  const raw = atob(data),
    bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const ints = new Int16Array(bytes.buffer);
  const values = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i++) values[i] = ints[i] / divisor;
  return values;
}
/** Area-weighted random points on a triangle soup (x,y,z × 3 per triangle). */
export function sampleSurface(values: Float32Array, count: number): Float32Array {
  const cumulative = new Float64Array(values.length / 9);
  let total = 0;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < cumulative.length; i++) {
    const j = i * 9;
    a.fromArray(values, j);
    b.fromArray(values, j + 3).sub(a);
    c.fromArray(values, j + 6).sub(a);
    total += b.cross(c).length() * 0.5;
    cumulative[i] = total;
  }
  const points = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const pick = sample() * total;
    let lo = 0,
      hi = cumulative.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cumulative[m] < pick) lo = m + 1;
      else hi = m;
    }
    const j = lo * 9,
      u = Math.sqrt(sample()),
      v = sample();
    for (let k = 0; k < 3; k++) points[i * 3 + k] = (1 - u) * values[j + k] + u * (1 - v) * values[j + 3 + k] + u * v * values[j + 6 + k];
  }
  return points;
}
// Carry a smooth perpendicular frame along each route, so the bundle has width
// from every angle. The anatomical centerline and both endpoints remain fixed.
export function bundleFrames(samples: Float32Array) {
  const normals = new Float32Array(samples.length),
    binormals = new Float32Array(samples.length);
  let length = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    vec3.fromBuffer(_a, samples, Math.max(0, i - 1) * 3);
    vec3.fromBuffer(_b, samples, Math.min(SAMPLES, i + 1) * 3);
    vec3.subtract(_tangent, _b, _a);
    if (vec3.squaredLength(_tangent) < 1e-10) vec3.set(_tangent, 0, 1, 0);
    vec3.normalize(_tangent, _tangent);
    if (i === 0) vec3.perpendicular(_normal, _tangent);
    else {
      vec3.scaleAndAdd(_normal, _normal, _tangent, -vec3.dot(_normal, _tangent));
      if (vec3.squaredLength(_normal) < 1e-6) vec3.perpendicular(_normal, _tangent);
      else vec3.normalize(_normal, _normal);
    }
    vec3.cross(_binormal, _tangent, _normal);
    vec3.normalize(_binormal, _binormal);
    vec3.toBuffer(normals, _normal, i * 3);
    vec3.toBuffer(binormals, _binormal, i * 3);
    if (i > 0) {
      vec3.fromBuffer(_a, samples, (i - 1) * 3);
      vec3.fromBuffer(_b, samples, i * 3);
      length += vec3.distance(_a, _b);
    }
  }
  return { normals, binormals, radius: clamp(length * 0.12, 0.035, 0.19) };
}
