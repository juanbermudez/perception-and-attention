import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

async function bundle(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const [view, { routeWeight, isolateKeepsRoute }, { pathways, regions }, { createViewApi, VIEW_STACK_DEPTH }, { createState }] = await Promise.all([
  bundle("src/model/view.ts"),
  bundle("src/model/attention.ts"),
  bundle("src/content/index.ts"),
  bundle("src/api/view-api.ts"),
  bundle("src/state.ts"),
]);
const {
  SIDES,
  SIDE_IDS,
  LAYER_IDS,
  PITCH_MIN,
  PITCH_MAX,
  MIN_DISTANCE,
  MAX_DISTANCE,
  anglesFromDirection,
  anglesFromOrbit,
  cameraPose,
  defaultLayers,
  directionFromAngles,
  distanceForZoom,
  effectiveLayers,
  focusPreset,
  frameFit,
  gatedLayers,
  homeCamera,
  layerZoomFade,
  nearestSide,
  normalizeViewPatch,
  normalizeYaw,
  orbitFromAngles,
  presenceTarget,
  stageFov,
  zoomLimits,
  zoomNearness,
} = view;
const atlas = JSON.parse(await readFile("src/data/atlas-data.json", "utf8"));
const close = (actual, expected, tolerance, message) =>
  assert(Math.abs(actual - expected) <= tolerance, `${message ?? ""} expected ${expected}, got ${actual}`);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const length = Math.hypot(...a);
  return a.map((v) => v / length);
};
const at = (id) => regions[id].position;

// 1. Anatomical axes, which every side and angle below depends on: −X front, +Y top, +Z left.
{
  assert(at("retina")[0] < at("v1")[0] && at("pfc")[0] < at("v1")[0] && at("chiasm")[0] < at("lgn")[0], "The eyes and frontal lobe should be at −X.");
  assert(
    at("s1")[1] > at("medulla")[1] && at("motor")[1] > at("cochlea")[1] && at("fef")[1] > at("dorsalHorn")[1],
    "Cortex should be above the brainstem (+Y).",
  );
  let pairs = 0;
  for (const name of Object.keys(atlas.landmarks)) {
    const right = `${name.slice(0, -1)}r`;
    if (!name.endsWith("l") || !(right in atlas.landmarks)) continue;
    assert(atlas.landmarks[name].center[2] > 0 && atlas.landmarks[right].center[2] < 0, `${name}: left parts should be at +Z.`);
    pairs++;
  }
  assert(pairs > 20);
  for (const [left, right] of [
    ["retina", "retinaR"],
    ["cochlea", "cochleaR"],
    ["a1", "a1R"],
    ["mgn", "mgnR"],
  ])
    assert(at(left)[2] > 0 && at(right)[2] < 0, `${left} should be on the left (+Z).`);
  assert(at("medulla")[2] < 0, "The touch route starts in the right medulla (z < 0).");
  // The six sides put the camera on that side of the head.
  const d = (side) => directionFromAngles([0, 0, 0], SIDES[side].yaw, SIDES[side].pitch);
  assert(dot(d("front"), sub(at("retina"), at("v1"))) > 0, "Front camera should be on the eyes' side.");
  assert(dot(d("back"), sub(at("v1"), at("retina"))) > 0, "Back camera should be on V1's side.");
  assert(dot(d("left"), sub(at("a1"), at("a1R"))) > 0, "Left camera should be on the left A1's side.");
  assert(dot(d("right"), sub(at("a1R"), at("a1"))) > 0, "Right camera should be on the right A1's side.");
  assert(d("top")[1] > 0.99 && d("bottom")[1] < -0.85);
  console.log(
    `PASS anatomical axes: −X front, +Y top, +Z left (${pairs} paired atlas parts); the right medulla has z < 0; the six sides face the right anatomy.`,
  );
}

// 2. yaw/pitch ↔ direction ↔ OrbitControls angles, for all six sides and a sweep.
{
  const check = (yaw, pitch, label) => {
    const direction = directionFromAngles([0, 0, 0], yaw, pitch);
    close(Math.hypot(...direction), 1, 1e-12, `${label} unit length`);
    const back = anglesFromDirection(direction);
    close(back.pitch, pitch, 1e-9, `${label} pitch`);
    close(normalizeYaw(back.yaw - yaw), 0, 1e-9, `${label} yaw`);
    // OrbitControls places the camera at (sin φ sin θ, cos φ, sin φ cos θ) around the target.
    const { theta, phi } = orbitFromAngles(yaw, pitch);
    const orbit = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
    for (let axis = 0; axis < 3; axis++) close(orbit[axis], direction[axis], 1e-12, `${label} orbit axis ${axis}`);
    const again = anglesFromOrbit(theta, phi);
    close(again.pitch, pitch, 1e-9);
    close(normalizeYaw(again.yaw - yaw), 0, 1e-9);
  };
  for (const side of SIDE_IDS) {
    check(SIDES[side].yaw, SIDES[side].pitch, side);
    assert.equal(nearestSide(SIDES[side].yaw, SIDES[side].pitch), side);
  }
  for (let yaw = -179; yaw <= 180; yaw += 17) for (let pitch = PITCH_MIN; pitch <= PITCH_MAX; pitch += 13) check(yaw, pitch, `${yaw}/${pitch}`);
  // The pitch limits match OrbitControls' polar limits [0.001, 0.83π].
  assert(orbitFromAngles(0, PITCH_MIN).phi <= Math.PI * 0.83 && orbitFromAngles(0, PITCH_MAX).phi >= 0.001);
  assert(orbitFromAngles(0, PITCH_MIN - 1).phi > Math.PI * 0.83, "−59° should be the lowest reachable pitch.");
  assert.equal(normalizeYaw(270), -90);
  assert.equal(normalizeYaw(-180), 180);
  console.log("PASS yaw/pitch ↔ direction ↔ orbit angles round-trip for all 6 sides and a sweep; pitch limits match the orbit controls.");
}

// 3. Zoom: relative to the overview distance, clamped by the controls; the zoom fade thresholds.
{
  const target = [0, 0, 0],
    position = [0, 0, 0];
  homeCamera(0.4, target, position);
  const home = Math.hypot(...sub(position, target));
  close(home, 11.9, 0.01, "overview distance with the skull");
  const limits = zoomLimits(home);
  close(limits.min, 0.66, 0.005);
  close(limits.max, 7.44, 0.005);
  assert.equal(distanceForZoom(1, home), home);
  assert.equal(distanceForZoom(2, home), home / 2);
  assert.equal(distanceForZoom(50, home), MIN_DISTANCE);
  assert.equal(distanceForZoom(0.1, home), MAX_DISTANCE);
  // The outer layers start fading past zoom 1/0.92 ≈ 1.09 and are fully faded from zoom 2.
  assert.equal(zoomNearness(home / 1.08, home), 0);
  assert(zoomNearness(home / 1.1, home) > 0);
  assert(zoomNearness(home / 1.98, home) < 1);
  assert.equal(zoomNearness(home / 2, home), 1);
  assert.equal(zoomNearness(home / 7, home), 1);
  assert.deepEqual(effectiveLayers(defaultLayers(), null, 0), {});
  assert.deepEqual(effectiveLayers(defaultLayers(), null, 1), { skull: 0.12, cortex: 0.3, cerebellum: 0.35, brainstem: 0.65, deep: 0.65 });
  for (const id of ["eyes", "routes", "markers", "labels"]) assert.equal(layerZoomFade(id, 1), 1);
  console.log(
    `PASS zoom maps to distance (home ${home.toFixed(2)}, zoom ${limits.min.toFixed(2)}–${limits.max.toFixed(2)}); fade starts past 1.09× and completes at 2×.`,
  );
}

// 4. Frame fit keeps every region inside the view frustum, from any side, at any stage shape.
{
  const inView = (point, fit, direction, fov, aspect) => {
    const camera = fit.target.map((v, axis) => v + direction[axis] * fit.distance);
    const forward = direction.map((v) => -v),
      right = unit(cross(forward, [0, 1, 0])),
      up = cross(right, forward);
    const offset = sub(point, camera),
      depth = dot(offset, forward),
      tan = Math.tan((fov * Math.PI) / 360);
    return depth > 0.1 && Math.abs(dot(offset, right) / (depth * tan * aspect)) <= 1 && Math.abs(dot(offset, up) / (depth * tan)) <= 1;
  };
  const sets = [
    ["lgn", "v1"],
    ["retina", "retinaR", "v1"],
    ["cochlea", "cochleaR", "a1", "a1R", "mgn", "mgnR"],
    ["tpj"],
    ["pfc", "dorsalHorn", "v1"],
    Object.keys(regions),
  ];
  let checks = 0;
  for (const aspect of [0.45, 0.8, 1.25, 1.8, 2.6])
    for (const ids of sets) {
      const points = ids.map(at),
        fov = stageFov(aspect),
        fit = frameFit(points, fov, aspect);
      assert(fit.distance >= MIN_DISTANCE && fit.distance < MAX_DISTANCE, `${ids.length} regions at aspect ${aspect}: distance ${fit.distance}`);
      for (const side of SIDE_IDS)
        for (const point of points) {
          assert(
            inView(point, fit, directionFromAngles([0, 0, 0], SIDES[side].yaw, SIDES[side].pitch), fov, aspect),
            `${ids.join(",")} from ${side}, aspect ${aspect}`,
          );
          checks++;
        }
    }
  assert.equal(frameFit([at("tpj")], stageFov(1.6), 1.6).distance, MIN_DISTANCE, "One region frames as close as the controls allow.");
  console.log(
    `PASS frame fit keeps every region in the frustum (${checks} checks: 6 sets, 6 sides, 5 aspects, up to all ${Object.keys(regions).length} regions).`,
  );
}

// 5. ViewPatch validation and camera precedence: reset → focus/frame → from/yaw/pitch → orbit → zoom.
{
  const error = (patch) => normalizeViewPatch(patch).error;
  assert.equal(error({ camera: { focus: "v1", frame: ["lgn"] } })?.code, "bad_input", "focus and frame together must be rejected");
  assert.deepEqual(error({ camera: { focus: "visual cortex" } })?.options, ["v1"], "Unknown ids suggest regions by name.");
  assert.equal(error({ camera: { frame: [] } })?.code, "bad_input");
  assert.equal(error({ camera: { frame: Object.keys(regions).slice(0, 13) } })?.code, "bad_input");
  assert.equal(error({ camera: { from: "above" } })?.code, "bad_input");
  assert.equal(error({ camera: { zoom: 0 } })?.code, "bad_input");
  assert.equal(error({ camera: { orbit: [10] } })?.code, "bad_input");
  assert.equal(error({ camera: { spin: 1 } })?.code, "bad_input");
  assert.equal(error({ layers: { skull: 1.5 } })?.code, "bad_input");
  assert(error({ layers: { brain: 0 } })?.options.includes("cortex"), "Unknown layers list the valid ones.");
  assert.equal(error({ isolate: { regions: ["v1"], keep: 2 } })?.code, "bad_input");
  assert.equal(error({ labels: "some" })?.code, "bad_input");
  assert.equal(error({ zoom: 2 })?.code, "bad_input", "Unknown top-level fields are rejected.");
  assert.equal(error("v1")?.code, "bad_input");
  const ok = (patch) => normalizeViewPatch(patch).patch;
  assert.equal(ok({ camera: { focus: "V1" } }).camera.focus, "v1", "Region ids are case-insensitive.");
  assert.deepEqual(ok({ camera: { frame: ["lgn", "LGN", "v1"] } }).camera.frame, ["lgn", "v1"]);
  assert.deepEqual(ok({ isolate: ["lgn", "v1"] }).isolate, { regions: ["lgn", "v1"], keep: 0.08 });
  assert.deepEqual(ok({ isolate: { regions: ["tpj"], keep: 0.2 } }).isolate, { regions: ["tpj"], keep: 0.2 });
  assert.equal(ok({ isolate: [] }).isolate, null);
  assert.equal(ok({ isolate: null }).isolate, null);
  assert.equal(ok({}).isolate, undefined, "Left out means unchanged.");
  assert.equal(ok({ motion: "instant" }).instant, true);

  const homeDistance = 11.9;
  const source = {
    current: { target: [1, 1, 1], yaw: 45, pitch: 20, distance: 8 },
    home: () => ({ target: [0, 0.4, 0], yaw: 60, pitch: 14, distance: homeDistance }),
    focus: () => ({ target: [2, 0, 0], yaw: -30, pitch: -10, distance: 5 }),
    frame: () => ({ target: [3, 3, 3], distance: 6 }),
  };
  const pose = (camera) => cameraPose(camera, source, homeDistance);
  const same = (actual, expected, label) => {
    assert.deepEqual(actual.target, expected.target, `${label} target`);
    for (const key of ["yaw", "pitch", "distance"]) close(actual[key], expected[key], 1e-9, `${label} ${key}`);
  };
  same(pose({ zoom: 2 }), { target: [1, 1, 1], yaw: 45, pitch: 20, distance: homeDistance / 2 }, "zoom only keeps the rest");
  same(pose({ reset: true }), { target: [0, 0.4, 0], yaw: 60, pitch: 14, distance: homeDistance }, "reset");
  same(pose({ reset: true, from: "top", yaw: 30, orbit: [10, -20], zoom: 2 }), { target: [0, 0.4, 0], yaw: 40, pitch: 68, distance: 5.95 }, "full chain");
  same(pose({ focus: "v1" }), { target: [2, 0, 0], yaw: -30, pitch: -10, distance: 5 }, "focus preset");
  same(pose({ focus: "v1", from: "left" }), { target: [2, 0, 0], yaw: 90, pitch: 10, distance: 5 }, "focus then side");
  same(pose({ reset: true, focus: "v1" }), { target: [2, 0, 0], yaw: -30, pitch: -10, distance: 5 }, "focus overrides reset");
  same(pose({ frame: ["lgn"] }), { target: [3, 3, 3], yaw: 45, pitch: 20, distance: 6 }, "frame keeps the direction");
  same(pose({ reset: true, frame: ["lgn"] }), { target: [3, 3, 3], yaw: 60, pitch: 14, distance: 6 }, "frame after reset");
  same(pose({ frame: ["lgn"], zoom: 1 }), { target: [3, 3, 3], yaw: 45, pitch: 20, distance: homeDistance }, "zoom overrides the fit");
  same(pose({ from: "left", pitch: 40 }), { target: [1, 1, 1], yaw: 90, pitch: 40, distance: 8 }, "pitch overrides the side's pitch");
  assert.equal(pose({ pitch: -80 }).pitch, PITCH_MIN);
  assert.equal(pose({ orbit: [0, 200] }).pitch, PITCH_MAX);
  assert.equal(pose({ yaw: 270 }).yaw, -90);
  assert.equal(pose({ orbit: [200, 0] }).yaw, -115);
  assert.equal(pose({ zoom: 100 }).distance, MIN_DISTANCE);
  console.log(
    "PASS view patches: bad input rejected (focus + frame together, unknown ids and fields); camera precedence reset → focus/frame → side/yaw/pitch → orbit → zoom, with clamps.",
  );
}

// 6. Isolate: routes between isolated regions show even outside their topic, one per connection.
{
  const settings = { enabledSenses: { vision: true, hearing: true, touch: true }, priority: "balanced", controlNetwork: true, focus: 65 };
  const at = (path, overview, regions) => ({ ...settings, path, overview, isolate: regions ? { regions, keep: 0.08 } : null });
  const all = pathways.flatMap((path) => path.edges.map((edge) => ({ path: path.id, edge })));
  const edge = (path, from, to) => pathways.find((p) => p.id === path).edges.find((e) => e.from === from && e.to === to);
  // A detail route from another topic.
  const v1mt = edge("vision", "v1", "mt");
  assert(v1mt.detail);
  assert.equal(routeWeight("vision", v1mt, at("attention", false, null), all), 0);
  assert.equal(routeWeight("vision", v1mt, at("attention", false, ["v1", "mt"]), all), 1);
  assert.equal(routeWeight("vision", v1mt, at("attention", false, ["v1"]), all), 0, "One isolated end is not enough.");
  assert.equal(routeWeight("vision", v1mt, at("attention", true, ["mt", "v1"]), all), 1, "Also from the overview.");
  const ffa = edge("vision", "extrastriate", "ffa");
  assert(ffa.detail && routeWeight("vision", ffa, at("hearing", false, ["extrastriate", "ffa"]), all) === 1);
  // LGN → V1 exists in Vision and in the thalamocortical loop: only one shows.
  const vision = edge("vision", "lgn", "v1"),
    loop = edge("loop", "lgn", "v1");
  const iso = ["lgn", "v1"];
  assert.deepEqual([routeWeight("vision", vision, at("vision", false, iso), all), routeWeight("loop", loop, at("vision", false, iso), all)], [1, 0]);
  assert.deepEqual([routeWeight("vision", vision, at("loop", false, iso), all), routeWeight("loop", loop, at("loop", false, iso), all)], [0, 1]);
  assert.deepEqual([routeWeight("vision", vision, at("speech", false, iso), all), routeWeight("loop", loop, at("speech", false, iso), all)], [1, 0]);
  // Routes outside the set keep their topic weight; the scene dims them to `keep` because isolate doesn't keep them.
  const retina = edge("vision", "retina", "chiasm");
  assert.equal(routeWeight("vision", retina, at("vision", false, iso), all), 1);
  assert(!isolateKeepsRoute(retina, { regions: iso, keep: 0.08 }) && isolateKeepsRoute(vision, { regions: iso, keep: 0.08 }));
  // Without isolate nothing changes, in any topic or the overview.
  for (const path of pathways)
    for (const overview of [false, true]) {
      const plain = { ...settings, path: path.id, overview };
      for (const route of all) assert.equal(routeWeight(route.path, route.edge, at(path.id, overview, null), all), routeWeight(route.path, route.edge, plain));
    }
  // Anatomy drops to `keep`; routes, markers and labels are filtered per region instead.
  const layers = { ...defaultLayers(), skull: 0 };
  const isolate = { regions: iso, keep: 0.08 };
  assert.equal(presenceTarget(layers, isolate, "skull"), 0);
  assert.equal(presenceTarget(layers, isolate, "cortex"), 0.08);
  assert.equal(presenceTarget(layers, isolate, "routes"), 1);
  assert.equal(presenceTarget(layers, null, "cortex"), 1);
  console.log(
    "PASS isolate shows routes between isolated regions across topics (including detail routes), one per connection; other routes and anatomy drop to keep.",
  );
}

// 7. Focus presets look from the region's own side; ventral areas from below, within the pitch limit.
{
  const target = [0, 0, 0],
    direction = [0, 0, 0];
  for (const id of Object.keys(regions)) {
    focusPreset(id, 0.4, target, direction);
    const z = at(id)[2];
    assert(z < 0 ? direction[2] < 0 : direction[2] > 0, `${id} should be seen from its own hemisphere.`);
  }
  for (const id of ["tpj", "retinaR", "cochleaR", "a1R", "mgnR", "medulla", "dorsalHorn"]) {
    focusPreset(id, 0.4, target, direction);
    const { yaw } = anglesFromDirection(direction);
    assert(at(id)[2] < 0 && yaw < 0 && yaw > -180, `${id}: right-hemisphere region seen from yaw ${yaw.toFixed(0)}.`);
  }
  focusPreset("tpj", 0.4, target, direction);
  close(anglesFromDirection(direction).yaw, -90, 20, "TPJ is framed from the right");
  for (const id of ["ffa", "ppa", "vwfa", "it"]) {
    focusPreset(id, 0.4, target, direction);
    const { yaw, pitch } = anglesFromDirection(direction);
    assert(pitch < -15 && pitch >= PITCH_MIN, `${id}: pitch ${pitch.toFixed(1)} should look up from below, within the limit.`);
    assert(yaw > 0, `${id} is a left-hemisphere area.`);
  }
  console.log("PASS focus presets: every region is framed from its own hemisphere; the TPJ from the right; FFA, PPA, VWFA and IT from below within −59°.");
}

// 8. The view API against a fake scene: apply, report, said, Undo, and the user-gesture lock.
{
  const homeDistance = 11.9;
  const scene = {
    gesturing: false,
    homeDistance,
    moves: [],
    snaps: 0,
    current: { target: [0, 0.4, 0], yaw: 60.6, pitch: 14.4, distance: homeDistance },
    pose() {
      return { ...this.current, target: [...this.current.target], zoom: homeDistance / this.current.distance };
    },
    homePose: () => ({ target: [0, 0.4, 0], yaw: 60.6, pitch: 14.4, distance: homeDistance }),
    focusPose(id) {
      const target = [0, 0, 0],
        direction = [0, 0, 0];
      focusPreset(id, 0.4, target, direction);
      return { target, ...anglesFromDirection(direction), distance: 11.2 };
    },
    frameRegions(ids) {
      const fit = frameFit(ids.map(at), stageFov(1.6), 1.6);
      return { target: fit.target, distance: fit.distance };
    },
    setPose(next, instant = false) {
      this.current = { ...this.current, ...next };
      this.moves.push({ ...next, instant });
    },
    snapLayers() {
      this.snaps++;
    },
  };
  const state = createState(false);
  // No patch applied: the defaults leave the guide as it was.
  assert.deepEqual(state.layers, defaultLayers());
  assert.equal(state.layerEffect, "dissolve");
  assert.equal(state.isolate, null);
  assert.equal(state.viewFocus, null);
  assert.equal(state.labelMode, "auto");
  assert.equal(state.labels, true);
  for (const id of LAYER_IDS) assert.equal(presenceTarget(state.layers, state.isolate, id), 1);

  const api = createViewApi(state, scene);
  const first = api.apply({ camera: { frame: ["lgn", "v1"], from: "left" }, layers: { skull: 0, cortex: 0 }, isolate: ["lgn", "v1"] });
  assert.equal(first.error, undefined);
  assert.deepEqual(first.view.frame, ["lgn", "v1"]);
  assert.deepEqual([first.view.yaw, first.view.pitch], [90, 10]);
  assert(first.view.zoom > 1, `framing LGN and V1 should zoom in (${first.view.zoom})`);
  assert.deepEqual(first.view.layers, { skull: 0, cortex: 0 });
  assert.deepEqual(first.view.isolate, { regions: ["lgn", "v1"], keep: 0.08 });
  assert.equal(
    first.said,
    `Framed LGN and V1 from the left at ${Number(first.view.zoom.toFixed(1))}×; skull and cortex dissolved; isolated LGN and V1, dissolved the rest.`,
  );
  assert(JSON.stringify(first).length < 2048, "Results should stay under 2 KB.");
  assert.equal(scene.moves.length, 1);
  assert.equal(api.depth, 1);
  // Effective presence in current(): the isolate cap and the zoom fade are included.
  const now = api.current();
  assert.equal(now.layers.skull, 0);
  assert(now.layers.cerebellum <= 0.08 && now.layers.routes === undefined);
  assert.equal(now.gated, undefined, "The overview hides no layer.");
  state.overview = false;
  state.path = "vision";
  assert.deepEqual(api.current().gated, ["ears", "auditory_nerve", "temporal_bone"]);
  assert.deepEqual(gatedLayers({ ...state, path: "hearing" }), ["eyes", "optic"]);
  state.path = "attention";
  state.overview = true;

  // focus + frame is rejected as a whole: nothing changes and nothing is pushed.
  const before = JSON.stringify(state);
  assert.equal(api.apply({ camera: { focus: "v1", frame: ["lgn"] }, layers: { skull: 1 } }).error.code, "bad_input");
  assert.equal(JSON.stringify(state), before);
  assert.equal(api.depth, 1);
  // Focus points the highlight and view gap at a region without navigating.
  const focused = api.apply({ camera: { focus: "tpj" } });
  assert.equal(state.viewFocus, "tpj");
  assert.equal(focused.view.focus, "tpj");
  assert(focused.view.yaw < -45, "TPJ is in the right hemisphere.");
  assert.match(focused.said, /^Focused on TPJ at [\d.]+×\.$/);
  // A user gesture blocks the camera part only.
  scene.gesturing = true;
  const locked = api.apply({ camera: { yaw: 0 }, labels: "all" });
  assert.equal(locked.skipped.camera.code, "locked_by_user");
  assert.equal(state.labelMode, "all");
  assert.equal(scene.moves.length, 2, "The camera must not move mid-gesture.");
  assert.match(locked.said, /^Kept the camera still while you move it; all labels shown\.$/);
  scene.gesturing = false;
  // labels stays a boolean view of labelMode.
  api.apply({ labels: "none" });
  assert.equal(state.labels, false);
  state.labels = true;
  assert.equal(state.labelMode, "auto");
  api.apply({ labels: "focus" });
  state.labels = true;
  assert.equal(state.labelMode, "focus", "Turning labels on keeps a mode that already shows labels.");
  // Instant motion snaps the camera and the layer springs.
  api.apply({ camera: { reset: true }, layers: { routes: 0.4 }, effect: "fade", motion: "instant" });
  assert.equal(scene.moves.at(-1).instant, true);
  assert.equal(scene.snaps, 1);
  assert.equal(state.viewFocus, null, "Reset clears the view focus.");
  // Undo walks back one view at a time.
  const depth = api.depth;
  assert.equal(api.undo().said, "Back to the previous view.");
  assert.equal(state.layers.routes, 1);
  assert.equal(state.layerEffect, "dissolve");
  assert.equal(state.labelMode, "focus");
  assert.equal(api.depth, depth - 1);
  while (api.depth) api.undo();
  assert.deepEqual(state.layers, defaultLayers());
  assert.equal(state.isolate, null);
  assert.equal(state.viewFocus, null);
  assert.equal(state.labelMode, "auto");
  assert.deepEqual(scene.current.target, [0, 0.4, 0]);
  assert.equal(api.undo().error.code, "not_available");
  // An empty patch changes nothing and leaves nothing to undo.
  assert.equal(api.apply({}).said, "View unchanged.");
  assert.equal(api.depth, 0);
  // The stack keeps the last 10 views.
  for (let i = 0; i < 15; i++) api.apply({ camera: { orbit: [10, 0] } });
  assert.equal(api.depth, VIEW_STACK_DEPTH);
  console.log(
    "PASS view API: applies and reports a patch in under 2 KB with a one-line summary; focus and reset set the view focus; a gesture blocks only the camera; Undo keeps 10 views.",
  );
}
