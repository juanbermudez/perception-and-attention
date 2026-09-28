// The 3D brain: anatomy point clouds, signal routes, region activity and callout labels.
//
// createBrainScene builds everything once, then runs a single frame loop that reads the
// shared ExplorerState. In order, each frame:
//   1. highlights the selected (or hovered) region and moves the camera, and eases each
//      layer's presence (dissolve or fade) toward state.layers and state.isolate,
//   2. advances the walkthrough volley and decays region activity (leaky integrator),
//   3. draws particles along each route, dimming routes outside the step spotlight,
//   4. flickers region activity points at a rate set by their activity,
//   5. projects markers and lays out callout labels outside the head.
import { clamp, lerp, repeat, type Vec3, vec3 } from "math";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { pathways } from "../content/pathways";
import { regionAnatomy } from "../content/region-anatomy";
import { regions } from "../content/regions";
import type { Edge, PathId, RegionId, Signal } from "../content/types";
import atlas from "../data/atlas-data.json";
import skullData from "../data/skull-data.json";
import { ACTIVITY_CUTOFF, type ColorMotion, createColor, createWeight, relax, stepColor, stepPoint, stepWeight, type WeightMotion } from "../model/activity";
import { isolateKeepsRoute, regionPulse, routeWeight, senseForRegion, sensoryStreams } from "../model/attention";
import { type CalloutBounds, type LabelLayout, labelProximity, layoutCallouts, leaderPath, type Silhouette } from "../model/callouts";
import {
  anglesFromDirection,
  anglesFromOrbit,
  clampPitch,
  directionFromAngles,
  focusPreset,
  frameFit,
  hearingShown,
  homeCamera,
  type Isolation,
  LAYER_IDS,
  type LayerId,
  layerZoomFade,
  type Pose,
  presenceTarget,
  stageFov,
  visionShown,
  zoomNearness,
} from "../model/view";
import type { ExplorerState } from "../state";
import { bundleFrames, SAMPLES, sample, sampleEdge, sampleSurface, unpack } from "./geometry";
import {
  activityMaterial,
  applySurfaceEffects,
  createLayerPresence,
  createViewGap,
  highlightMaterial,
  type LayerPresence,
  pointMaterial,
  pointPresence,
  skullPointMaterial,
} from "./materials";

const PER_EDGE = 32;
const TRAIL = 14;
const CLUSTER_POINTS = 96;
const VOLLEY_PARTICLES = 16;
// Illustrative conduction speed in scene units per simulated second. Real axons
// cross these distances in a few milliseconds; the view is slowed ~1000-fold.
const FLOW_SPEED = 0.2;
// Region activity relaxes like a leaky integrator (τ·dr/dt = −r + input).
const ACTIVITY_TAU = 0.9;
// Each activity point fires stochastically at a rate set by its region's activity,
// then fades like a calcium-indicator transient.
const SPIKE_RATE = 7;
const GLOW_TAU = 0.35;
// The overview shows every sense flowing at once, labelled by relay and cortex.
const OVERVIEW_LABELS = new Set<RegionId>(["v1", "a1", "s1", "lgn", "mgn", "vpl", "retina", "cochlea"]);
// Zooming in fades the skull and outer brain so the region of interest stands out
// (zoomNearness and LAYER_ZOOM_KEEP in model/view.ts). Fading starts as soon as you
// zoom in past the default focus distance (0.94 of the overview) and is complete at half.
const LAYER_MARKERS = new Set<RegionId>(["l5", "l6"]);
const LABEL_PROXIMITY = 90; // px from a label where it starts to scale up
const LABEL_PRESS = 0.85; // share of the lift kept while the mouse button is down (about 1.24× instead of 1.28×)
// Walkthrough spotlight: routes and regions outside the current step fade to these levels.
const SPOT_DIM_ROUTE = 0.24;
const CONTEXT_HIGHLIGHT = 0.28; // highlight weight for the other regions of the current topic
const SPOT_DIM_REGION = 0.25;
const SPOT_DIM_MARKER = 0.3;
const _curve_point = vec3.create();
const _particle_a = vec3.create();
const _particle_b = vec3.create();
const _particle_position = vec3.create();
const _brain_point = vec3.create();
const _pose_target = vec3.create();
const _pose_direction = vec3.create();
const _home_position = vec3.create();
// Atlas groups and the layer each belongs to.
const GROUP_LAYERS: Record<string, LayerId> = {
  cortex: "cortex",
  deep: "deep",
  lower: "cerebellum",
  stem: "brainstem",
  eye: "eyes",
  optic: "optic",
  ear: "ears",
  "auditory-nerve": "auditory_nerve",
  bone: "temporal_bone",
};
function showPresence(uniforms: LayerPresence, presence: number, dissolve: number) {
  uniforms.presence.value = presence;
  uniforms.dissolve.value = dissolve;
  return presence > ACTIVITY_CUTOFF;
}

interface Route {
  path: PathId;
  edge: Edge;
  index: number;
  samples: Float32Array;
  color: THREE.Color;
  normals: Float32Array;
  binormals: Float32Array;
  radius: number;
  lines: THREE.LineSegments;
  material: THREE.LineBasicMaterial;
  visibleWeight: number;
  weight: WeightMotion;
  emphasis: WeightMotion;
  /** 1 inside the walkthrough spotlight, dimmed outside it. */
  spot: WeightMotion;
  length: number;
  rate: number;
}
interface Hop {
  routes: Set<Route>;
  duration: number;
  sources: RegionId[];
  targets: RegionId[];
}
interface Volley {
  hops: Hop[];
  hop: number;
  start: number;
}
interface ActivityCluster {
  id: RegionId;
  positions: Float32Array;
  surface: boolean;
  activity: ColorMotion;
  target: Vec3;
}
interface HighlightLayer {
  object: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  weight: WeightMotion;
  color: ColorMotion;
  target: Vec3;
}
interface Marker extends LabelLayout {
  id: RegionId;
  object: THREE.Mesh;
  halo: THREE.Sprite;
  label: HTMLButtonElement;
  pulse: THREE.Mesh;
  anchorZ: number;
  leader: SVGPathElement;
  presence: WeightMotion;
  selection: WeightMotion;
  labelWeight: WeightMotion;
  /** 0–1: how close the mouse is; scales the label up toward the viewer. */
  lift: WeightMotion;
  spot: WeightMotion;
  color: ColorMotion;
  colorTarget: Vec3;
  labelColor: string;
}

export function createBrainScene(container: HTMLElement, labelContainer: HTMLElement, state: ExplorerState, onRegion: (id: RegionId) => void) {
  const orbitSurface = container.parentElement!;
  const stage = container.closest(".brain-stage")!;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 80);
  camera.position.set(-4.8, 2.6, 8.5);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setClearColor(getComputedStyle(stage).getPropertyValue("--canvas").trim(), 1);
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, orbitSurface);
  controls.target.set(0, -0.1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.6;
  controls.maxDistance = 18;
  controls.enablePan = true;
  controls.maxPolarAngle = Math.PI * 0.83;
  controls.minPolarAngle = 0.001;
  let focusStarted = -1,
    contextDistance = camera.position.distanceTo(controls.target),
    homeDistance = contextDistance;
  const focusFrom = vec3.create(),
    focusTo = vec3.create(),
    focusTarget = vec3.create();
  const focusDirection = new THREE.Vector3(),
    viewFrom = new THREE.Vector3(),
    lookAt = vec3.create();
  const savedCamera = new THREE.Vector3(),
    savedTarget = new THREE.Vector3();
  const gestureCamera = new THREE.Vector3(),
    gestureTarget = new THREE.Vector3();
  let fromTheta = 0,
    toTheta = 0,
    fromPhi = 0,
    toPhi = 0,
    fromDistance = 0,
    toDistance = 0;
  function clearDamping() {
    savedCamera.copy(camera.position);
    savedTarget.copy(controls.target);
    controls.enableDamping = false;
    controls.update();
    camera.position.copy(savedCamera);
    controls.target.copy(savedTarget);
    controls.enableDamping = true;
    controls.update();
  }
  let userOrbited = false;
  /** True between OrbitControls start and end: the user is moving the view, so agent camera changes wait. */
  let gesturing = false;
  controls.autoRotateSpeed = -0.5;
  controls.addEventListener("start", () => {
    // A user gesture cancels any camera animation, including an agent's.
    focusStarted = -1;
    userOrbited = true;
    gesturing = true;
    gestureCamera.copy(camera.position);
    gestureTarget.copy(controls.target);
  });
  controls.addEventListener("end", () => {
    gesturing = false;
    if (camera.position.distanceToSquared(gestureCamera) > 1e-6 || controls.target.distanceToSquared(gestureTarget) > 1e-6)
      contextDistance = camera.position.distanceTo(controls.target);
  });
  function updateFocus(ms: number) {
    if (focusStarted < 0) return;
    const progress = reducedMotion.matches ? 1 : clamp((ms - focusStarted) / 900, 0, 1),
      ease = progress * progress * (3 - 2 * progress);
    vec3.lerp(focusTarget, focusFrom, focusTo, ease);
    controls.target.fromArray(focusTarget);
    const theta = lerp(fromTheta, toTheta, ease),
      phi = lerp(fromPhi, toPhi, ease),
      distance = lerp(fromDistance, toDistance, ease);
    camera.position.set(Math.sin(phi) * Math.sin(theta) * distance, Math.cos(phi) * distance, Math.sin(phi) * Math.cos(theta) * distance).add(controls.target);
    if (progress === 1) focusStarted = -1;
  }
  const world = new THREE.Group();
  scene.add(world);
  scene.add(new THREE.HemisphereLight("#d9e3fc", "#273149", 2.1));
  const light = new THREE.DirectionalLight("#f3f1ff", 2.3);
  light.position.set(-4, 6, 8);
  scene.add(light);
  const zoneColor = new THREE.Color();
  const hearingVisible = () => hearingShown(state);
  const visionVisible = () => visionShown(state);
  function surfaceVisible(group: string) {
    return group === "bone" ? hearingVisible() && state.bones : group !== "ear" || hearingVisible();
  }
  function pointsVisible(group: string) {
    return group === "bone"
      ? hearingVisible() && state.bones
      : group === "auditory-nerve"
        ? hearingVisible()
        : group === "eye" || group === "optic"
          ? visionVisible()
          : true;
  }
  const pointLayers: { group: string; layer: LayerId; object: THREE.Points; material: THREE.ShaderMaterial; presence: LayerPresence; opacity: WeightMotion }[] =
    [];
  // Skull and brain anatomy move out of the line of sight to the selected region.
  // Eyes, ears and their nerves are often the subject, so they stay in place.
  const viewGap = createViewGap();
  const gapFocus = createColor();
  const gapAmount = createWeight();
  let gapRegion: RegionId | null = null;
  const sensoryGroups = new Set(["eye", "optic", "ear", "auditory-nerve"]);
  const surfaceLayers: {
    group: string;
    layer: LayerId;
    object: THREE.Mesh;
    material: THREE.MeshPhongMaterial;
    presence: LayerPresence;
    opacity: WeightMotion;
  }[] = [];
  const cortexCount = 38000;
  let cortexPositions: Float32Array = new Float32Array(0);
  const groupNames = [...new Set(atlas.meshes.map((m) => m.group))];
  for (const group of groupNames) {
    const parts = atlas.meshes.filter((m) => m.group === group);
    const arrays = parts.map((m) => unpack(m.data));
    const count = arrays.reduce((sum, a) => sum + a.length, 0);
    const values = new Float32Array(count),
      colors = new Float32Array(count);
    let cursor = 0;
    parts.forEach((part, i) => {
      const a = arrays[i];
      values.set(a, cursor);
      const color =
        group === "cortex"
          ? /occipital|Calcarine|Lingual|Cuneus/i.test(part.name)
            ? "#75bdb3"
            : /frontal|Orbital|Straight/i.test(part.name)
              ? "#bb9b8e"
              : /temporal/i.test(part.name)
                ? "#b598b6"
                : "#a5a3c4"
          : group === "ear" || group === "auditory-nerve"
            ? "#ed9bcc"
            : group === "deep"
              ? "#bda0ff"
              : group === "bone"
                ? "#8caaa6"
                : group === "eye" || group === "optic"
                  ? "#77e8db"
                  : "#939caa";
      zoneColor.set(color);
      for (let j = 0; j < a.length; j += 3) zoneColor.toArray(colors, cursor + j);
      cursor += a.length;
    });
    if (parts[0].mode === "triangles") {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(values, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        transparent: true,
        opacity: group === "cortex" ? 0.11 : group === "deep" ? 0.02 : 0.55,
        shininess: 18,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const presence = createLayerPresence();
      applySurfaceEffects(material, presence, sensoryGroups.has(group) ? undefined : viewGap);
      const object = new THREE.Mesh(geo, material);
      world.add(object);
      surfaceLayers.push({
        group,
        layer: GROUP_LAYERS[group],
        object,
        material,
        presence,
        opacity: createWeight(surfaceVisible(group) ? material.opacity : 0),
      });
      if (group === "cortex") cortexPositions = sampleSurface(values, cortexCount);
      if (group === "deep") {
        const clouds = arrays.map((a, i) => sampleSurface(a, parts[i].name.startsWith("Thalamus") ? 2000 : 300));
        const positions = new Float32Array(clouds.reduce((n, a) => n + a.length, 0));
        let offset = 0;
        for (const cloud of clouds) {
          positions.set(cloud, offset);
          offset += cloud.length;
        }
        const colors = new Float32Array(positions.length);
        for (let i = 0; i < colors.length; i += 3)
          zoneColor
            .set("#bda0ff")
            .multiplyScalar(0.45 + sample() * 0.5)
            .toArray(colors, i);
        const particles = new THREE.BufferGeometry();
        particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        particles.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const cloudMaterial = pointMaterial(1.25, 0.42, false, sensoryGroups.has(group) ? undefined : viewGap);
        const cloud = new THREE.Points(particles, cloudMaterial);
        world.add(cloud);
        pointLayers.push({
          group,
          layer: GROUP_LAYERS[group],
          object: cloud,
          material: cloudMaterial,
          presence: pointPresence(cloudMaterial),
          opacity: createWeight(cloudMaterial.uniforms.opacity.value),
        });
      }
    } else {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(values, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = pointMaterial(group === "bone" ? 1.4 : 1.65, group === "bone" ? 0.28 : 0.7, false, sensoryGroups.has(group) ? undefined : viewGap);
      const object = new THREE.Points(geo, material);
      world.add(object);
      pointLayers.push({
        group,
        layer: GROUP_LAYERS[group],
        object,
        material,
        presence: pointPresence(material),
        opacity: createWeight(pointsVisible(group) ? material.uniforms.opacity.value : 0),
      });
    }
  }
  const cortexColors = new Float32Array(cortexPositions.length);
  for (let i = 0; i < cortexPositions.length; i += 3) {
    zoneColor
      .set("#a4afc4")
      .multiplyScalar(0.35 + sample() * 0.6)
      .toArray(cortexColors, i);
  }
  const cortexGeometry = new THREE.BufferGeometry();
  cortexGeometry.setAttribute("position", new THREE.BufferAttribute(cortexPositions, 3));
  cortexGeometry.setAttribute("color", new THREE.BufferAttribute(cortexColors, 3));
  const cortexMaterial = pointMaterial(1.3, 0.5, true, viewGap);
  const cortex = new THREE.Points(cortexGeometry, cortexMaterial);
  world.add(cortex);
  const cortexOpacity = createWeight(cortexMaterial.uniforms.opacity.value);
  const cortexPresence = pointPresence(cortexMaterial);

  // Selection illuminates the named atlas surface without inflating or moving
  // it. Geometry is cached on input, never resampled in the animation loop.
  const atlasParts = new Map(atlas.meshes.map((part) => [part.name, part]));
  const highlightCache = new Map<string, HighlightLayer>();
  const highlightLayers: HighlightLayer[] = [];
  const pathwayColors = new Map(pathways.map((path) => [path.id, new THREE.Color(path.color)]));
  const streamColors = Object.fromEntries(sensoryStreams.map((stream) => [stream.id, stream.color])) as Record<string, string>;
  const highlightTargetColor = new THREE.Color();
  const highlightTemplate = highlightMaterial();
  let highlightedRegion: RegionId | undefined, selectedHighlight: HighlightLayer;
  const selectionStart = performance.now();
  /** The highlight layer for a region's anatomy, created on first use and shared by regions with the same parts. */
  function highlightLayerFor(id: RegionId) {
    const key = regionAnatomy[id].parts.join("|");
    let layer = highlightCache.get(key);
    const sense = senseForRegion(id),
      color = state.path === "attention" && sense ? streamColors[sense] : pathways.find((path) => path.id === state.path)!.color;
    highlightTargetColor.set(color);
    if (!layer) {
      const clouds = regionAnatomy[id].parts.map((name) => {
        const part = atlasParts.get(name)!;
        const values = unpack(part.data);
        return part.mode === "triangles" ? sampleSurface(values, part.group === "cortex" ? 4000 : part.name.startsWith("Thalamus") ? 3200 : 1200) : values;
      });
      const positions = new Float32Array(clouds.reduce((n, cloud) => n + cloud.length, 0));
      let offset = 0;
      for (const cloud of clouds) {
        positions.set(cloud, offset);
        offset += cloud.length;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = highlightTemplate.clone();
      material.uniforms.color.value.copy(highlightTargetColor);
      material.uniforms.pulse.value = 0;
      const object = new THREE.Points(geometry, material);
      object.frustumCulled = false;
      object.renderOrder = 4;
      object.visible = false;
      world.add(object);
      const target = vec3.create();
      highlightTargetColor.toArray(target);
      layer = { object, weight: createWeight(), color: createColor(target), target };
      highlightCache.set(key, layer);
      highlightLayers.push(layer);
    }
    highlightTargetColor.toArray(layer.target);
    return layer;
  }
  function highlightRegion(id: RegionId) {
    selectedHighlight = highlightLayerFor(id);
    highlightedRegion = id;
  }
  // The other regions of the current topic keep a faint, steady highlight so the
  // flow stays readable while one region is selected.
  const contextHighlights = new Set<HighlightLayer>();
  let contextPath: PathId | null = null;
  function updateContextHighlights() {
    if (contextPath === state.path) return;
    contextPath = state.path;
    contextHighlights.clear();
    const path = pathways.find((p) => p.id === state.path)!;
    const ids = new Set<RegionId>([...path.steps.map((step) => step.region), ...path.edges.flatMap((edge) => [edge.from, edge.to])]);
    for (const id of ids) contextHighlights.add(highlightLayerFor(id));
  }
  // Isolated regions add a third level: full weight, steady, whatever the topic.
  // state.isolate is replaced (never mutated) when it changes, so a reference check is enough.
  const isolateHighlights = new Set<HighlightLayer>();
  let isolateSource: Isolation | null = null,
    isolatePath: PathId | null = null;
  function updateIsolateHighlights() {
    if (state.isolate === isolateSource && state.path === isolatePath) return;
    isolateSource = state.isolate;
    isolatePath = state.path;
    isolateHighlights.clear();
    if (state.isolate) for (const id of state.isolate.regions) isolateHighlights.add(highlightLayerFor(id));
  }
  highlightRegion(state.selected);

  const skullGeometry = new THREE.BufferGeometry();
  skullGeometry.setAttribute("position", new THREE.BufferAttribute(unpack(skullData.positions), 3));
  skullGeometry.setAttribute("normal", new THREE.BufferAttribute(unpack(skullData.normals, 32767), 3));
  const skullBrightness = new Float32Array(skullData.count);
  for (let i = 0; i < skullBrightness.length; i++) skullBrightness[i] = 0.55 + sample() * 0.45;
  skullGeometry.setAttribute("brightness", new THREE.BufferAttribute(skullBrightness, 1));
  const skullMaterial = skullPointMaterial(viewGap);
  const skull = new THREE.Points(skullGeometry, skullMaterial);
  skull.renderOrder = 1;
  world.add(skull);
  const skullOpacity = createWeight(skullMaterial.uniforms.opacity.value);
  const skullPresence = pointPresence(skullMaterial);
  // Frame the whole head when the skull is shown; preserve all atlas coordinates.
  const skullCenterY = (skullData.bounds.min[1] + skullData.bounds.max[1]) * 0.5;
  function resetOverview() {
    focusStarted = -1;
    clearDamping();
    homeCamera(state.skull, skullCenterY, _pose_target, _home_position);
    controls.target.fromArray(_pose_target);
    camera.position.fromArray(_home_position);
    controls.update();
    contextDistance = camera.position.distanceTo(controls.target);
    homeDistance = contextDistance;
  }
  function focusRegion(id: RegionId, focusCamera = false) {
    highlightRegion(id);
    if (!focusCamera) return;
    // Each region has a viewing direction that keeps it in front of the skull.
    focusPreset(id, state.skull ? skullCenterY : -0.1, lookAt, _pose_direction);
    viewFrom.fromArray(_pose_direction);
    animateCamera(lookAt, viewFrom, clamp(contextDistance * 0.94, controls.minDistance, controls.maxDistance));
  }
  /** Ease the camera to look at `target` from `direction` at `distance`, orbiting the short way round. */
  function animateCamera(target: Vec3, direction: THREE.Vector3, distance: number) {
    clearDamping();
    controls.target.toArray(focusFrom);
    vec3.copy(focusTo, target);
    focusDirection.copy(camera.position).sub(controls.target);
    fromDistance = focusDirection.length();
    focusDirection.normalize();
    fromTheta = Math.atan2(focusDirection.x, focusDirection.z);
    fromPhi = Math.acos(clamp(focusDirection.y, -1, 1));
    focusDirection.copy(direction).normalize();
    toTheta = fromTheta + repeat(Math.atan2(focusDirection.x, focusDirection.z) - fromTheta + Math.PI, Math.PI * 2) - Math.PI;
    toPhi = Math.acos(clamp(focusDirection.y, -1, 1));
    toDistance = distance;
    focusStarted = performance.now();
    updateFocus(focusStarted);
  }

  // Hovering a region name previews it: look at it and highlight it, then return
  // to the saved view when the pointer leaves.
  let preview: { id: RegionId; target: Vec3; direction: THREE.Vector3; distance: number } | null = null;
  function previewRegion(id: RegionId) {
    if (!preview) {
      const direction = camera.position.clone().sub(controls.target);
      preview = { id, target: controls.target.toArray() as Vec3, direction, distance: direction.length() };
    }
    preview.id = id;
    focusRegion(id, true);
  }
  function endPreview(restore = true) {
    if (!preview) return;
    const saved = preview;
    preview = null;
    if (!restore) return;
    animateCamera(saved.target, saved.direction, saved.distance);
  }
  /** The region the scene should treat as selected: a hover preview wins over an agent's view focus, which wins over the step. */
  const shownRegion = () => preview?.id ?? state.viewFocus ?? state.selected;
  resetOverview();

  // An understated orbit underneath makes the 3D space readable.
  const ringPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    ringPoints.push(new THREE.Vector3(3.05 * Math.cos(a), -2.9, 2.6 * Math.sin(a)));
  }
  const ringMaterial = new THREE.LineBasicMaterial({ color: "#686868", transparent: true, opacity: 0.16 });
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPoints), ringMaterial);
  world.add(ring);
  const speckPositions = new Float32Array(360 * 3),
    speckColors = new Float32Array(360 * 3);
  for (let i = 0; i < 360; i++) {
    vec3.set(_brain_point, (sample() - 0.5) * 12, (sample() - 0.5) * 9, (sample() - 0.5) * 7 - 3);
    vec3.toBuffer(speckPositions, _brain_point, i * 3);
    speckColors[i * 3] = 0.25;
    speckColors[i * 3 + 1] = 0.25;
    speckColors[i * 3 + 2] = 0.25;
  }
  const speckGeo = new THREE.BufferGeometry();
  speckGeo.setAttribute("position", new THREE.BufferAttribute(speckPositions, 3));
  speckGeo.setAttribute("color", new THREE.BufferAttribute(speckColors, 3));
  const speckMaterial = pointMaterial(1, 0.28);
  const specks = new THREE.Points(speckGeo, speckMaterial);
  scene.add(specks);
  const speckPresence = pointPresence(speckMaterial);

  const routes: Route[] = [];
  for (const path of pathways)
    path.edges.forEach((edge, index) => {
      const samples = new Float32Array((SAMPLES + 1) * 3);
      for (let i = 0; i <= SAMPLES; i++) {
        sampleEdge(_curve_point, edge, i / SAMPLES);
        vec3.toBuffer(samples, _curve_point, i * 3);
      }
      const frame = bundleFrames(samples);
      const segments: number[] = [];
      for (let strand = 0; strand < 11; strand++)
        for (let i = 0; i < SAMPLES; i++) {
          if (edge.kind === "feedback" && i % 9 > 4) continue;
          if (edge.kind === "inhibitory" && i % 5 > 0) continue;
          for (const k of [i, i + 1]) {
            const t = k / SAMPLES,
              spread = Math.sin(t * Math.PI) * frame.radius * 0.8;
            const angle = strand * 2.399963,
              radius = Math.sqrt(strand / 11) * spread;
            for (let axis = 0; axis < 3; axis++)
              segments.push(samples[k * 3 + axis] + (frame.normals[k * 3 + axis] * Math.cos(angle) + frame.binormals[k * 3 + axis] * Math.sin(angle)) * radius);
          }
        }
      const material = new THREE.LineBasicMaterial({ color: path.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
      const lines = new THREE.LineSegments(geometry, material);
      world.add(lines);
      let length = 0;
      for (let i = 1; i <= SAMPLES; i++) {
        vec3.fromBuffer(_particle_a, samples, (i - 1) * 3);
        vec3.fromBuffer(_particle_b, samples, i * 3);
        length += vec3.distance(_particle_a, _particle_b);
      }
      // Constant travel speed: a long route takes longer than a short one, within readable limits.
      const rate = clamp(FLOW_SPEED / length, 1 / 9, 1 / 2.5);
      routes.push({
        path: path.id,
        edge,
        index,
        samples,
        ...frame,
        color: new THREE.Color(path.color),
        lines,
        material,
        visibleWeight: 0,
        weight: createWeight(),
        emphasis: createWeight(),
        spot: createWeight(1),
        length,
        rate,
      });
    });
  const particleCount = routes.length * PER_EDGE * TRAIL;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleColors = new Float32Array(particleCount * 3);
  const particleSizes = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    const tail = i % TRAIL;
    particleSizes[i] = tail === 0 ? 3.6 : lerp(2.8, 1.4, tail / TRAIL);
  }
  const particleGeo = new THREE.BufferGeometry();
  const posAttribute = new THREE.BufferAttribute(particlePositions, 3).setUsage(THREE.DynamicDrawUsage);
  const colorAttribute = new THREE.BufferAttribute(particleColors, 3).setUsage(THREE.DynamicDrawUsage);
  particleGeo.setAttribute("position", posAttribute);
  particleGeo.setAttribute("color", colorAttribute);
  particleGeo.setAttribute("size", new THREE.BufferAttribute(particleSizes, 1));
  const particles = new THREE.Points(particleGeo, activityMaterial());
  particles.frustumCulled = false;
  particles.renderOrder = 3;
  world.add(particles);

  // Cortical sparkles follow the existing atlas surface; deep relays use small
  // illustrative clouds. These patches show involvement, not measured activation.
  const corticalIds = new Set<RegionId>([
    "v1",
    "l6",
    "l5",
    "fef",
    "tpj",
    "s2",
    "postInsula",
    "belt",
    "astg",
    "vlpfc",
    "pfc",
    "parietal",
    "extrastriate",
    "mt",
    "it",
    "ffa",
    "ppa",
    "eba",
    "vwfa",
    "a1",
    "a1R",
    "temporal",
    "spt",
    "frontal",
    "motor",
    "meaning",
    "s1",
    "insula",
    "cingulate",
  ]);
  // Areas a few millimetres apart get tighter patches so neighbours stay distinct.
  const smallAreas = new Set<RegionId>(["mt", "ffa", "ppa", "eba", "vwfa", "fef", "tpj", "s2", "postInsula", "belt", "astg", "vlpfc"]);
  const clusters: ActivityCluster[] = [];
  for (const id of Object.keys(regions) as RegionId[]) {
    const anchor = regions[id].position,
      surface = corticalIds.has(id),
      positions = new Float32Array(CLUSTER_POINTS * 3);
    const near: number[] = [];
    if (surface)
      for (let i = 0; i < cortexPositions.length; i += 3) {
        vec3.fromBuffer(_brain_point, cortexPositions, i);
        if (vec3.squaredDistance(_brain_point, anchor) < (smallAreas.has(id) ? 0.2 : 0.48) ** 2) near.push(i);
      }
    for (let i = 0; i < CLUSTER_POINTS; i++) {
      if (near.length) {
        const offset = near[Math.floor(sample() * near.length)];
        vec3.fromBuffer(_brain_point, cortexPositions, offset);
      } else {
        const z = sample() * 2 - 1,
          angle = sample() * Math.PI * 2,
          r = Math.cbrt(sample()) * (surface ? 0.32 : id.startsWith("cochlea") ? 0.065 : 0.13),
          xy = Math.sqrt(1 - z * z);
        vec3.set(_brain_point, anchor[0] + Math.cos(angle) * xy * r, anchor[1] + z * r, anchor[2] + Math.sin(angle) * xy * r);
      }
      vec3.toBuffer(positions, _brain_point, i * 3);
    }
    clusters.push({ id, positions, surface, activity: createColor(), target: vec3.create() });
  }
  const clusterPositions = new Float32Array(clusters.length * CLUSTER_POINTS * 3),
    clusterColors = new Float32Array(clusterPositions.length),
    clusterSizes = new Float32Array(clusters.length * CLUSTER_POINTS);
  clusters.forEach((cluster, i) => {
    clusterPositions.set(cluster.positions, i * CLUSTER_POINTS * 3);
  });
  for (let i = 0; i < clusterSizes.length; i++) clusterSizes[i] = 1.2 + sample() * 1.9;
  const clusterGeo = new THREE.BufferGeometry();
  clusterGeo.setAttribute("position", new THREE.BufferAttribute(clusterPositions, 3));
  const clusterColorAttribute = new THREE.BufferAttribute(clusterColors, 3).setUsage(THREE.DynamicDrawUsage);
  clusterGeo.setAttribute("color", clusterColorAttribute);
  clusterGeo.setAttribute("size", new THREE.BufferAttribute(clusterSizes, 1));
  const activityClusters = new THREE.Points(clusterGeo, activityMaterial());
  activityClusters.frustumCulled = false;
  activityClusters.renderOrder = 2;
  world.add(activityClusters);
  const regionEnergy = new Map<RegionId, number>();
  const regionColors = new Map<RegionId, THREE.Color>();

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 64;
  glowCanvas.height = 64;
  const g = glowCanvas.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "#ffffffa0");
  grad.addColorStop(0.15, "#ffffff55");
  grad.addColorStop(0.5, "#ffffff15");
  grad.addColorStop(1, "#ffffff00");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const markers: Marker[] = [];
  const leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leaders.classList.add("label-leaders");
  labelContainer.append(leaders);
  for (const id of Object.keys(regions) as RegionId[]) {
    const region = regions[id];
    // The dot and its wire sphere are white so they stand out against the coloured
    // region highlight; only the soft glow takes the topic colour.
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 12),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthTest: false }),
    );
    sphere.position.fromArray(region.position);
    sphere.renderOrder = 5;
    world.add(sphere);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, color: "#bda0ff", transparent: true, blending: THREE.AdditiveBlending, depthTest: false }),
    );
    halo.position.copy(sphere.position);
    halo.scale.set(0.6, 0.6, 0.6);
    world.add(halo);
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.15, wireframe: true, depthWrite: false, depthTest: false }),
    );
    pulse.position.copy(sphere.position);
    pulse.renderOrder = 5;
    world.add(pulse);
    const label = document.createElement("button");
    label.className = "region-label";
    label.hidden = true;
    const [abbr, role] = region.short.split(" · ");
    label.innerHTML = role ? `<span class="label-abbr">${abbr}</span><span class="label-role"> · ${role}</span>` : `<span class="label-abbr">${abbr}</span>`;
    label.dataset.region = id;
    label.draggable = false;
    label.setAttribute("aria-label", `Explore ${region.label}`);
    label.addEventListener("click", (e) => {
      if (e.detail === 0) onRegion(id);
    });
    labelContainer.append(label);
    const leader = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leaders.append(leader);
    const colorTarget = vec3.create();
    (halo.material as THREE.SpriteMaterial).color.toArray(colorTarget);
    markers.push({
      id,
      object: sphere,
      halo,
      label,
      pulse,
      labelX: 0,
      labelY: 0,
      labelWidth: 110,
      labelHeight: 26,
      targetX: 0,
      targetY: 0,
      side: 0,
      initialized: false,
      fade: 0,
      anchorX: 0,
      anchorY: 0,
      anchorZ: 0,
      leader,
      presence: createWeight(),
      selection: createWeight(),
      labelWeight: createWeight(),
      lift: createWeight(),
      spot: createWeight(1),
      color: createColor(colorTarget),
      colorTarget,
      labelColor: "",
    });
  }
  const projection = new THREE.Vector3();
  const inputEvents = new AbortController();
  const pointers = new Map<number, { x: number; y: number; region?: RegionId; moved: boolean }>();
  // Mouse position for label proximity; touch has no hover, so it is ignored.
  let hover: { x: number; y: number } | null = null;
  let multiplePointers = false;
  function pickMarker(x: number, y: number) {
    const rect = orbitSurface.getBoundingClientRect();
    let nearest: Marker | undefined,
      distance = 16 ** 2;
    for (const marker of markers) {
      if (!marker.object.visible || marker.anchorZ > 1 || marker.anchorZ < -1) continue;
      const d = (x - rect.left - marker.anchorX) ** 2 + (y - rect.top - marker.anchorY) ** 2;
      if (d < distance) {
        nearest = marker;
        distance = d;
      }
    }
    return nearest?.id;
  }
  orbitSurface.addEventListener(
    "pointerdown",
    (e) => {
      if (pointers.size === 0) multiplePointers = false;
      else multiplePointers = true;
      const label = (e.target as HTMLElement).closest<HTMLButtonElement>(".region-label");
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, region: label?.dataset.region as RegionId | undefined, moved: false });
      orbitSurface.style.cursor = "grabbing";
    },
    { capture: true, signal: inputEvents.signal },
  );
  orbitSurface.addEventListener(
    "pointermove",
    (e) => {
      const down = pointers.get(e.pointerId);
      if (down && (e.clientX - down.x) ** 2 + (e.clientY - down.y) ** 2 > 25) down.moved = true;
      hover = e.pointerType === "touch" ? null : { x: e.clientX, y: e.clientY };
      if (!pointers.size) orbitSurface.style.cursor = pickMarker(e.clientX, e.clientY) ? "pointer" : "grab";
    },
    { signal: inputEvents.signal },
  );
  orbitSurface.addEventListener(
    "pointerleave",
    () => {
      hover = null;
    },
    { signal: inputEvents.signal },
  );
  orbitSurface.addEventListener(
    "pointerup",
    (e) => {
      const down = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      orbitSurface.style.cursor = pointers.size ? "grabbing" : "grab";
      if (
        !down ||
        down.moved ||
        multiplePointers ||
        e.button !== 0 ||
        e.shiftKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.clientX - down.x) ** 2 + (e.clientY - down.y) ** 2 > 25
      )
        return;
      const id = down.region ?? pickMarker(e.clientX, e.clientY);
      if (id) onRegion(id);
    },
    { capture: true, signal: inputEvents.signal },
  );
  orbitSurface.addEventListener(
    "pointercancel",
    (e) => {
      pointers.delete(e.pointerId);
      multiplePointers = true;
      orbitSurface.style.cursor = "grab";
    },
    { signal: inputEvents.signal },
  );
  orbitSurface.addEventListener("dragstart", (e) => e.preventDefault(), { signal: inputEvents.signal });
  let width = 1,
    height = 1;
  function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    // Below a 1.25 aspect, widen the view so the head keeps side gutters for the
    // callout columns. Framing changes; atlas proportions and scale never do.
    camera.fov = stageFov(camera.aspect);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  let lastTime = 0;
  let frameId = 0;
  let frameCount = 0;
  let destroyed = false;
  const activeRegionIds = new Set<RegionId>();
  const attentionLabels = new Set<RegionId>(["pfc", "fef", "parietal", "tpj", "sc", "lc", "pulvinar", "extrastriate", "v1", "a1", "s1"]);
  const visibleMarkers: Marker[] = new Array(markers.length);
  // A few hundred surface points stand in for the head outline when placing callouts.
  function outlineSample(values: ArrayLike<number>, count: number) {
    const points = values.length / 3,
      out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const j = Math.floor((i * points) / count) * 3;
      out[i * 3] = values[j];
      out[i * 3 + 1] = values[j + 1];
      out[i * 3 + 2] = values[j + 2];
    }
    return out;
  }
  const skullOutline = outlineSample(skullGeometry.getAttribute("position").array, 480),
    cortexOutline = outlineSample(cortexPositions, 360);
  const head: Silhouette = { left: 0, right: 0, top: 0, bottom: 0 },
    calloutBounds: CalloutBounds = { width: 0, top: 0, bottom: 0, margin: 10 };
  const dock = stage.querySelector<HTMLElement>(".dock");
  function measureHead() {
    const outline = state.skull ? skullOutline : cortexOutline;
    head.left = Infinity;
    head.right = -Infinity;
    head.top = Infinity;
    head.bottom = -Infinity;
    for (let i = 0; i < outline.length; i += 3) {
      projection.set(outline[i], outline[i + 1], outline[i + 2]).project(camera);
      if (projection.z < -1 || projection.z > 1) continue;
      const x = (projection.x * 0.5 + 0.5) * width,
        y = (-projection.y * 0.5 + 0.5) * height;
      if (x < head.left) head.left = x;
      if (x > head.right) head.right = x;
      if (y < head.top) head.top = y;
      if (y > head.bottom) head.bottom = y;
    }
    if (!Number.isFinite(head.left)) {
      head.left = width * 0.35;
      head.right = width * 0.65;
      head.top = height * 0.3;
      head.bottom = height * 0.7;
    }
  }
  // Walkthrough volleys and the activity they leave behind.
  const impulse = new Map<RegionId, number>();
  let volley: Volley | null = null,
    volleyClock = 0;
  function kick(id: RegionId, amount: number) {
    impulse.set(id, Math.min(1.6, (impulse.get(id) ?? 0) + amount));
  }
  // Routes and regions the current step is about; everything else is dimmed.
  const spotRoutes = new Set<Route>();
  const spotRegions = new Set<RegionId>();
  function withStage(own: Route[], route: Route, into: Set<Route>) {
    into.add(route);
    // Staged routes carry both sides together (both eyes, both ears).
    if (route.edge.stage !== undefined) for (const other of own) if (other.edge.stage === route.edge.stage) into.add(other);
  }
  function sendVolley(hops: Signal, fallback: RegionId) {
    const own = routes.filter((route) => route.path === state.path);
    const built: Hop[] = [];
    for (const pairs of hops) {
      const chosen = new Set<Route>();
      for (const [from, to] of pairs) {
        const match = own.find((route) => route.edge.from === from && route.edge.to === to);
        if (match) withStage(own, match, chosen);
      }
      if (!chosen.size) continue;
      const longest = Math.max(...[...chosen].map((route) => route.length));
      built.push({
        routes: chosen,
        duration: clamp(longest / 1.5, 0.7, 1.7),
        sources: [...chosen].map((route) => route.edge.from),
        targets: [...chosen].map((route) => route.edge.to),
      });
    }
    spotRoutes.clear();
    spotRegions.clear();
    spotRegions.add(fallback);
    for (const hop of built) for (const route of hop.routes) spotRoutes.add(route);
    // A first step has no incoming signal; spotlight what leaves the region instead.
    if (!built.length) for (const route of own) if (route.edge.from === fallback) withStage(own, route, spotRoutes);
    for (const route of spotRoutes) {
      spotRegions.add(route.edge.from);
      spotRegions.add(route.edge.to);
    }
    if (!built.length || reducedMotion.matches) {
      volley = null;
      kick(fallback, 1);
      for (const hop of built) for (const id of hop.targets) kick(id, 0.8);
      return;
    }
    volley = { hops: built, hop: 0, start: volleyClock };
    for (const id of built[0].sources) kick(id, 0.45);
  }
  const clusterGlow = new Float32Array(clusters.length * CLUSTER_POINTS);
  // One presence spring per layer (spec §5.2), plus the fade ↔ dissolve blend.
  const layerPresence = {} as Record<LayerId, WeightMotion>;
  for (const id of LAYER_IDS) layerPresence[id] = createWeight(presenceTarget(state.layers, state.isolate, id));
  const dissolveMix = createWeight(state.layerEffect === "dissolve" ? 1 : 0);
  let snapPresence = false;
  function frame(ms: number, dt: number) {
    const simDt = state.playing ? dt * state.speed : 0;
    state.simTime += simDt;
    const time = state.simTime;
    const current = pathways.find((p) => p.id === state.path)!;
    const reduced = reducedMotion.matches,
      pulseAmount = regionPulse((ms - selectionStart) / 1000, reduced);
    const shown = shownRegion();
    const isolate = state.isolate;
    updateContextHighlights();
    updateIsolateHighlights();
    if (highlightedRegion !== shown) highlightRegion(shown);
    const selectedSense = senseForRegion(shown);
    if (state.path === "attention" && selectedSense) highlightTargetColor.set(streamColors[selectedSense]);
    else highlightTargetColor.copy(pathwayColors.get(state.path)!);
    highlightTargetColor.toArray(selectedHighlight.target);
    // A region is being shown: inside a topic, during a hover preview, or while an agent's view focus is set.
    const focusActive = !state.overview || preview !== null || state.viewFocus !== null;
    for (const layer of highlightLayers) {
      const selected = layer === selectedHighlight;
      const target =
        selected && focusActive
          ? 1
          : isolateHighlights.has(layer)
            ? 1
            : !state.overview && contextHighlights.has(layer)
              ? isolate
                ? Math.min(CONTEXT_HIGHLIGHT, isolate.keep)
                : CONTEXT_HIGHLIGHT
              : 0;
      const weight = stepWeight(layer.weight, target, dt, reduced);
      layer.object.visible = weight > ACTIVITY_CUTOFF;
      layer.object.material.uniforms.color.value.fromArray(stepColor(layer.color, layer.target, dt, reduced));
      // Only the selected region pulses; context regions hold a steady level.
      layer.object.material.uniforms.pulse.value = selected ? pulseAmount * weight : weight * 0.725;
    }
    // The overview turns slowly until someone takes hold of the model.
    controls.autoRotate = state.overview && state.playing && !reduced && !userOrbited && focusStarted < 0;
    updateFocus(ms);
    controls.update(dt);
    // 0 at the default distance, 1 when zoomed in close (smoothstep).
    const near = zoomNearness(camera.position.distanceTo(controls.target), homeDistance);
    // Layer presence: each layer eases toward its setting (capped while isolating).
    // With reduced motion the springs settle almost at once; `motion: "instant"` snaps them.
    for (const id of LAYER_IDS) {
      const motion = layerPresence[id],
        target = presenceTarget(state.layers, isolate, id);
      if (snapPresence) {
        motion.value = target;
        motion.velocity = 0;
      } else stepWeight(motion, target, dt, reduced);
    }
    const dissolveTarget = state.layerEffect === "dissolve" ? 1 : 0;
    if (snapPresence) {
      dissolveMix.value = dissolveTarget;
      dissolveMix.velocity = 0;
    }
    snapPresence = false;
    const dissolve = stepWeight(dissolveMix, dissolveTarget, dt, reduced);
    // The view gap parts the particles around the region being shown. Moving to
    // another region closes it, re-centres it while closed, and parts them again,
    // so the particles visibly move out of the way each time.
    viewGap.gapAmount.value = stepWeight(gapAmount, focusActive && gapRegion === shown ? 1 : 0, dt, reduced);
    if (gapAmount.value < 0.05 && gapRegion !== shown) {
      gapRegion = shown;
      vec3.copy(gapFocus.value, regions[shown].position);
      vec3.set(gapFocus.velocity, 0, 0, 0);
    }
    viewGap.gapFocus.value.fromArray(stepPoint(gapFocus, regions[gapRegion ?? shown].position, dt, reduced));
    // Presence multiplies the topic, x-ray and zoom rules below, so gating (ears only in hearing) still applies.
    cortexMaterial.uniforms.opacity.value = stepWeight(cortexOpacity, (state.xray ? 0.3 : 0.62) * layerZoomFade("cortex", near), dt, reduced);
    cortex.visible = showPresence(cortexPresence, layerPresence.cortex.value, dissolve) && cortexOpacity.value > ACTIVITY_CUTOFF;
    skullMaterial.uniforms.opacity.value = stepWeight(skullOpacity, state.skull ? 0.7 * layerZoomFade("skull", near) : 0, dt, reduced);
    skull.visible = showPresence(skullPresence, layerPresence.skull.value, dissolve) && skullOpacity.value > ACTIVITY_CUTOFF;
    for (const layer of surfaceLayers) {
      const target =
        layer.group === "cortex" ? (state.xray ? 0.065 : 0.26) : layer.group === "bone" ? 0.075 : layer.group === "ear" ? 0.95 : state.xray ? 0.02 : 0.045;
      layer.material.opacity = stepWeight(layer.opacity, surfaceVisible(layer.group) ? target * layerZoomFade(layer.layer, near) : 0, dt, reduced);
      layer.object.visible = showPresence(layer.presence, layerPresence[layer.layer].value, dissolve) && layer.opacity.value > ACTIVITY_CUTOFF;
    }
    for (const layer of pointLayers) {
      const target =
        layer.group === "bone" ? 0.28 : layer.group === "auditory-nerve" ? 0.8 : layer.group === "deep" ? (state.xray ? 0.42 : 0.6) : state.xray ? 0.5 : 0.72;
      layer.material.uniforms.opacity.value = stepWeight(
        layer.opacity,
        pointsVisible(layer.group) ? target * layerZoomFade(layer.layer, near) : 0,
        dt,
        reduced,
      );
      layer.object.visible = showPresence(layer.presence, layerPresence[layer.layer].value, dissolve) && layer.opacity.value > ACTIVITY_CUTOFF;
    }
    const floorPresence = layerPresence.floor.value;
    ringMaterial.opacity = 0.16 * floorPresence;
    ring.visible = floorPresence > ACTIVITY_CUTOFF;
    specks.visible = showPresence(speckPresence, floorPresence, dissolve);
    const routesPresence = layerPresence.routes.value,
      activityPresence = layerPresence.activity.value,
      markersPresence = layerPresence.markers.value,
      labelsPresence = layerPresence.labels.value;

    // The walkthrough volley runs on wall-clock time, so stepping still animates while the flow is paused.
    volleyClock += dt;
    let hop: Hop | undefined,
      hopProgress = 0;
    if (volley) {
      hop = volley.hops[volley.hop];
      hopProgress = (volleyClock - volley.start) / hop.duration;
      if (hopProgress >= 1) {
        for (const id of hop.targets) kick(id, 1);
        volley.hop++;
        volley.start = volleyClock;
        if (volley.hop >= volley.hops.length) {
          volley = null;
          hop = undefined;
        } else {
          hop = volley.hops[volley.hop];
          hopProgress = 0;
          for (const id of hop.sources) kick(id, 0.3);
        }
      }
    }
    for (const [id, value] of impulse) {
      const next = relax(value, dt, ACTIVITY_TAU);
      if (next < 0.002) impulse.delete(id);
      else impulse.set(id, next);
    }

    const spotOn = !state.overview && state.spotlight && spotRoutes.size + spotRegions.size > 0;
    // Isolate overrides the step spotlight: isolated regions (and the one shown) stay, the rest drop to `keep`.
    const regionSpot = (id: RegionId) =>
      isolate ? (isolate.regions.includes(id) || id === shown ? 1 : isolate.keep) : !spotOn || spotRegions.has(id) || id === shown ? 1 : SPOT_DIM_REGION;
    let offset = 0;
    regionEnergy.clear();
    regionColors.clear();
    activeRegionIds.clear();
    for (const route of routes) {
      const weight = routeWeight(route.path, route.edge, state, routes);
      if (weight > 0) {
        activeRegionIds.add(route.edge.from);
        activeRegionIds.add(route.edge.to);
      }
      route.visibleWeight = stepWeight(route.weight, weight, dt, reduced);
      const inVolley = hop?.routes.has(route) ?? false;
      const kept = isolateKeepsRoute(route.edge, isolate);
      const isStepEdge = inVolley || spotRoutes.has(route) || kept;
      const emphasis = stepWeight(route.emphasis, isStepEdge ? 1 : 0, dt, reduced);
      const spot = stepWeight(route.spot, isolate ? (kept ? 1 : isolate.keep) : !spotOn || spotRoutes.has(route) ? 1 : SPOT_DIM_ROUTE, dt, reduced);
      // Routes always fade (lines don't dissolve well).
      route.material.opacity = route.visibleWeight * spot * lerp(0.055, 0.13, emphasis) * routesPresence;
      route.lines.visible = route.material.opacity > 0.0001;
      if (route.visibleWeight < ACTIVITY_CUTOFF) continue;
      // Ongoing flow keeps both ends mildly active; volleys add impulses on arrival.
      const baseline = route.visibleWeight * spot * 0.32;
      if (baseline > (regionEnergy.get(route.edge.from) ?? 0)) {
        regionEnergy.set(route.edge.from, baseline);
        regionColors.set(route.edge.from, route.color);
      }
      if (baseline > (regionEnergy.get(route.edge.to) ?? 0)) {
        regionEnergy.set(route.edge.to, baseline);
        regionColors.set(route.edge.to, route.color);
      }
      if (routesPresence <= ACTIVITY_CUTOFF) continue;
      // A volley normally ignores the spotlight; while isolating it keeps to the isolated routes.
      const volleyScale = routesPresence * (isolate ? spot : 1);
      const stage = route.edge.stage ?? route.index;
      const trailCount = route.edge.kind === "inhibitory" ? 3 : route.edge.kind === "feedback" ? 9 : TRAIL;
      for (let p = 0; p < PER_EDGE; p++) {
        let t = repeat(time * route.rate * (1 + (p % 5) * 0.07) + p / PER_EDGE, 1);
        const packet = (0.5 + 0.5 * Math.cos((t - time * 0.16 + stage * 0.13) * Math.PI * 6)) ** 6;
        let strength = route.visibleWeight * spot * (0.16 + packet * 0.72) * routesPresence;
        if (inVolley && p < VOLLEY_PARTICLES) {
          t = hopProgress * 1.12 - p * 0.014;
          strength = route.visibleWeight * (t >= 0 && t <= 1 ? 1.6 : 0) * volleyScale;
        }
        const angle = p * 2.399963 + Math.sin(time * 0.65 + p) * 0.12,
          lane = Math.sqrt((p + 0.5) / PER_EDGE),
          u = Math.cos(angle),
          v = Math.sin(angle);
        for (let tail = 0; tail < TRAIL; tail++) {
          const raw = t - tail * 0.006,
            pt = clamp(raw, 0, 1);
          const s = pt * SAMPLES;
          const n = Math.min(SAMPLES - 1, Math.floor(s));
          vec3.fromBuffer(_particle_a, route.samples, n * 3);
          vec3.fromBuffer(_particle_b, route.samples, (n + 1) * 3);
          vec3.lerp(_particle_position, _particle_a, _particle_b, s - n);
          const spread = Math.sin(pt * Math.PI) * route.radius * lane * (inVolley && p < VOLLEY_PARTICLES ? 0.35 : 1);
          for (let axis = 0; axis < 3; axis++)
            _particle_position[axis] +=
              (lerp(route.normals[n * 3 + axis], route.normals[(n + 1) * 3 + axis], s - n) * u +
                lerp(route.binormals[n * 3 + axis], route.binormals[(n + 1) * 3 + axis], s - n) * v) *
              spread;
          vec3.toBuffer(particlePositions, _particle_position, offset);
          const alpha = raw > 0 && raw < 1 && tail < trailCount ? strength * (1 - tail / trailCount) ** 1.5 * (tail === 0 ? 1.35 : 0.6) : 0;
          particleColors[offset] = route.color.r * alpha;
          particleColors[offset + 1] = route.color.g * alpha;
          particleColors[offset + 2] = route.color.b * alpha;
          offset += 3;
        }
      }
    }
    particleGeo.setDrawRange(0, offset / 3);
    posAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    const pathColor = pathwayColors.get(state.path)!;
    clusters.forEach((cluster, index) => {
      let energy = ((regionEnergy.get(cluster.id) ?? 0) + (impulse.get(cluster.id) ?? 0) * 0.75) * regionSpot(cluster.id);
      if ((LAYER_MARKERS.has(cluster.id) && shown !== cluster.id) || (cluster.id === "v1" && LAYER_MARKERS.has(shown))) energy = 0;
      const activityColor = regionColors.get(cluster.id) ?? pathColor,
        level = Math.min(energy, 1.2);
      vec3.set(cluster.target, activityColor.r * level, activityColor.g * level, activityColor.b * level);
      const activity = stepColor(cluster.activity, cluster.target, dt, reduced);
      const rate = SPIKE_RATE * Math.min(1, energy),
        scale = cluster.surface ? 0.9 : 0.45;
      for (let p = 0; p < CLUSTER_POINTS; p++) {
        const g = index * CLUSTER_POINTS + p;
        let glow = relax(clusterGlow[g], simDt, GLOW_TAU);
        if (!reduced && simDt > 0 && sample() < rate * simDt) glow = 1;
        clusterGlow[g] = glow;
        const brightness = (reduced ? 0.6 : 0.3 + 0.7 * glow) * scale * activityPresence,
          i = g * 3;
        clusterColors[i] = activity[0] * brightness;
        clusterColors[i + 1] = activity[1] * brightness;
        clusterColors[i + 2] = activity[2] * brightness;
      }
    });
    clusterColorAttribute.needsUpdate = true;
    let visibleCount = 0;
    const labelMode = state.labelMode,
      labelsOn = state.labels && state.layers.labels > 0;
    for (const marker of markers) {
      const active = focusActive && marker.id === shown;
      const isolated = isolate?.regions.includes(marker.id) ?? false;
      marker.label.classList.toggle("selected", active);
      marker.label.setAttribute("aria-pressed", String(active));
      // While isolating, only isolated regions (and the one shown) keep markers, whatever the topic.
      // Layer 5 and 6 share V1's position, so only the one being shown (or isolated) gets a marker.
      const targetVisible =
        (isolate ? isolated || active : active || activeRegionIds.has(marker.id)) &&
        !(LAYER_MARKERS.has(marker.id) && !active && !isolated) &&
        !(marker.id === "v1" && LAYER_MARKERS.has(shown));
      const presence = stepWeight(marker.presence, targetVisible ? 1 : 0, dt, reduced),
        selection = stepWeight(marker.selection, active ? 1 : 0, dt, reduced);
      const spot = stepWeight(marker.spot, regionSpot(marker.id) === 1 ? 1 : SPOT_DIM_MARKER, dt, reduced);
      const visible = presence > ACTIVITY_CUTOFF && markersPresence > ACTIVITY_CUTOFF;
      marker.object.visible = visible;
      marker.halo.visible = visible;
      marker.pulse.visible = visible;
      const sense = senseForRegion(marker.id),
        col = state.path === "attention" && sense ? streamColors[sense] : current.color;
      if (targetVisible) {
        highlightTargetColor.set(col);
        highlightTargetColor.toArray(marker.colorTarget);
        if (marker.labelColor !== col) {
          marker.labelColor = col;
          marker.label.style.setProperty("--marker-color", col);
          marker.leader.style.setProperty("--marker-color", col);
        }
      }
      const objectMaterial = marker.object.material as THREE.MeshBasicMaterial,
        haloMaterial = marker.halo.material as THREE.SpriteMaterial,
        pulseMaterial = marker.pulse.material as THREE.MeshBasicMaterial;
      haloMaterial.color.fromArray(stepColor(marker.color, marker.colorTarget, dt, reduced));
      objectMaterial.opacity = presence * spot * markersPresence;
      haloMaterial.opacity = presence * spot * markersPresence;
      const energy = (regionEnergy.get(marker.id) ?? 0) + (impulse.get(marker.id) ?? 0) * 0.6;
      marker.object.scale.setScalar(lerp(1, 1.15, selection));
      marker.halo.scale.setScalar(lerp(0.26, 0.44, selection) + Math.min(energy, 1.2) * 0.18);
      marker.pulse.scale.setScalar(lerp(0.65, 1 + (pulseAmount - 0.5) * 0.3, selection));
      pulseMaterial.opacity = presence * spot * lerp(0.1, pulseAmount * 0.4, selection) * markersPresence;
      marker.object.getWorldPosition(projection);
      projection.project(camera);
      const x = (projection.x * 0.5 + 0.5) * width;
      const y = (-projection.y * 0.5 + 0.5) * height;
      marker.anchorX = x;
      marker.anchorY = y;
      marker.anchorZ = projection.z;
      const inView = projection.z <= 1 && projection.z >= -1 && x >= 8 && x <= width - 8 && y >= 8 && y <= height - 8;
      // Label modes: all visible markers; focus = the shown and isolated regions; auto = the
      // per-topic sets (every marker while isolating, since only isolated ones remain).
      const labelTarget =
        targetVisible &&
        labelsOn &&
        inView &&
        (labelMode === "all" ||
          (labelMode === "auto" && isolate !== null) ||
          active ||
          (labelMode === "focus"
            ? isolated
            : state.overview
              ? OVERVIEW_LABELS.has(marker.id)
              : state.path === "attention"
                ? attentionLabels.has(marker.id)
                : !["brainstemR", "socR", "icR", "mgnR"].includes(marker.id)));
      const labelOpacity = stepWeight(marker.labelWeight, labelTarget ? 1 : 0, dt, reduced);
      marker.label.style.opacity = labelOpacity.toFixed(3);
      marker.label.style.pointerEvents = labelTarget ? "auto" : "none";
      marker.label.disabled = !labelTarget;
      marker.leader.style.opacity = labelOpacity.toFixed(3);
      marker.leader.classList.toggle("selected", active);
      marker.label.hidden = !inView || labelOpacity <= ACTIVITY_CUTOFF;
      if (marker.label.hidden) {
        marker.side = 0;
        marker.lift.value = 0;
        marker.lift.velocity = 0;
      }
      marker.labelWidth = marker.label.offsetWidth || marker.labelWidth;
      marker.labelHeight = marker.label.offsetHeight || marker.labelHeight;
      if (!marker.label.hidden) visibleMarkers[visibleCount++] = marker;
    }
    // Callouts: columns just outside the projected head, kept below the dock.
    measureHead();
    const origin = labelContainer.getBoundingClientRect();
    calloutBounds.width = width;
    calloutBounds.top = dock ? dock.getBoundingClientRect().bottom - origin.top + 12 : 14;
    calloutBounds.bottom = Math.max(calloutBounds.top + 40, height - 14);
    layoutCallouts(visibleMarkers, visibleCount, head, calloutBounds, dt, reduced);
    for (const marker of markers) if (marker.label.hidden) marker.leader.setAttribute("d", "");
    // Labels near the mouse scale up and come forward. Off while dragging, since
    // labels slide under the pointer, and with reduced motion. A press without
    // movement only eases the lift slightly, as click feedback.
    let dragging = pointers.size > 1;
    for (const down of pointers.values()) if (down.moved) dragging = true;
    const hoverX = hover ? hover.x - origin.left : 0,
      hoverY = hover ? hover.y - origin.top : 0,
      proximityOn = hover !== null && !dragging && !reduced,
      pressScale = pointers.size ? LABEL_PRESS : 1;
    for (let i = 0; i < visibleCount; i++) {
      const marker = visibleMarkers[i];
      const lift = stepWeight(marker.lift, proximityOn ? labelProximity(marker, hoverX, hoverY, LABEL_PROXIMITY) * pressScale : 0, dt, reduced, 0.12);
      marker.label.style.setProperty("--lift", lift.toFixed(3));
      marker.label.style.zIndex = lift > 0.01 ? String(3 + Math.round(lift * 6)) : "";
      marker.label.style.left = `${marker.labelX.toFixed(1)}px`;
      marker.label.style.top = `${marker.labelY.toFixed(1)}px`;
      marker.leader.setAttribute("d", leaderPath(marker));
      const opacity = (marker.labelWeight.value * marker.fade * (marker.id === shown ? 1 : lerp(0.45, 1, marker.spot.value)) * labelsPresence).toFixed(3);
      marker.label.style.opacity = opacity;
      marker.leader.style.opacity = opacity;
    }
    renderer.render(scene, camera);
    frameCount++;
  }
  function animate(ms: number) {
    if (destroyed) return;
    frameId = requestAnimationFrame(animate);
    const dt = lastTime ? Math.min((ms - lastTime) / 1000, 0.05) : 0;
    lastTime = ms;
    if (document.hidden) return;
    frame(ms, dt);
  }
  frameId = requestAnimationFrame(animate);
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    state.playing = false;
    container.insertAdjacentHTML(
      "beforeend",
      '<div class="error-message">The 3D view was interrupted. Reload to restore it. The pathway explanations are still available.</div>',
    );
  });

  /* ---------- Pose: the camera in agent terms (yaw, pitch, distance; model/view.ts) ---------- */

  const poseOffset = new THREE.Vector3(),
    poseDirection = new THREE.Vector3();
  /** The camera pose, or where it is heading while a camera animation runs. */
  function pose(): Pose & { zoom: number } {
    const target = vec3.create();
    let theta: number, phi: number, distance: number;
    if (focusStarted >= 0) {
      vec3.copy(target, focusTo);
      theta = toTheta;
      phi = toPhi;
      distance = toDistance;
    } else {
      controls.target.toArray(target);
      poseOffset.copy(camera.position).sub(controls.target);
      distance = poseOffset.length();
      theta = Math.atan2(poseOffset.x, poseOffset.z);
      phi = Math.acos(clamp(poseOffset.y / Math.max(distance, 1e-9), -1, 1));
    }
    return { target, ...anglesFromOrbit(theta, phi), distance, zoom: homeDistance / distance };
  }
  /** The overview framing as a pose. */
  function homePose(): Pose {
    homeCamera(state.skull, skullCenterY, _pose_target, _home_position);
    vec3.subtract(_pose_direction, _home_position, _pose_target);
    return { target: vec3.clone(_pose_target), ...anglesFromDirection(_pose_direction), distance: vec3.length(_pose_direction) };
  }
  /** The pose selecting a region would animate to: its preset side, at the current context distance. */
  function focusPose(id: RegionId): Pose {
    focusPreset(id, state.skull ? skullCenterY : -0.1, _pose_target, _pose_direction);
    return {
      target: vec3.clone(_pose_target),
      ...anglesFromDirection(_pose_direction),
      distance: clamp(contextDistance * 0.94, controls.minDistance, controls.maxDistance),
    };
  }
  /** Target and distance that keep every listed region in view (uses the current field of view). */
  function frameRegions(ids: readonly RegionId[]) {
    const fit = frameFit(
      ids.map((id) => regions[id].position),
      camera.fov,
      camera.aspect,
    );
    return { target: fit.target, distance: fit.distance };
  }
  /**
   * Ease the camera to a pose; missing fields keep the current (or destination) values. Like a
   * user orbit it stops the overview auto-rotate, and the next step focus keeps its distance.
   * A user gesture cancels the animation.
   */
  function setPose(next: Partial<Pose>, instant = false) {
    const now = pose();
    directionFromAngles(_pose_direction, next.yaw ?? now.yaw, clampPitch(next.pitch ?? now.pitch));
    poseDirection.fromArray(_pose_direction);
    const distance = clamp(next.distance ?? now.distance, controls.minDistance, controls.maxDistance);
    // A hover preview would restore its saved view when the pointer leaves; the new pose wins.
    preview = null;
    userOrbited = true;
    contextDistance = distance / 0.94;
    animateCamera(next.target ?? now.target, poseDirection, distance);
    if (instant) updateFocus(focusStarted + 1000);
  }
  /** Regions with a visible marker on screen, in CSS pixels from the canvas's top-left (as of the last frame). */
  function visibleRegions() {
    const out: { id: RegionId; x: number; y: number }[] = [];
    for (const marker of markers) {
      if (!marker.object.visible || marker.anchorZ < -1 || marker.anchorZ > 1) continue;
      if (marker.anchorX < 0 || marker.anchorX > width || marker.anchorY < 0 || marker.anchorY > height) continue;
      out.push({ id: marker.id, x: Math.round(marker.anchorX), y: Math.round(marker.anchorY) });
    }
    return out;
  }

  return {
    /** Back to the overview framing (navigation: clears an agent's view focus). */
    reset() {
      state.viewFocus = null;
      resetOverview();
      if (state.overview) userOrbited = false;
    },
    /** Select a region in 3D (navigation: clears an agent's view focus). Hover previews keep it. */
    focusRegion(id: RegionId, focusCamera = false) {
      state.viewFocus = null;
      focusRegion(id, focusCamera);
    },
    pose,
    homePose,
    focusPose,
    frameRegions,
    setPose,
    visibleRegions,
    /** Make layer presence jump to its targets on the next frame instead of easing. */
    snapLayers() {
      snapPresence = true;
    },
    /** True while the user is orbiting, panning or zooming. */
    get gesturing() {
      return gesturing;
    },
    /** Camera-to-target distance of the overview framing; zoom 1. */
    get homeDistance() {
      return homeDistance;
    },
    sendVolley,
    previewRegion,
    endPreview,
    /** Render frames without requestAnimationFrame (hidden tabs, automated checks). */
    advance(frames = 1, step = 1 / 60) {
      for (let i = 0; i < frames; i++) {
        lastTime = 0;
        frame(performance.now(), step);
      }
    },
    labelsSnapshot() {
      return markers
        .filter((m) => !m.label.hidden)
        .map((m) => ({
          id: m.id,
          x: Math.round(m.labelX),
          y: Math.round(m.labelY),
          w: m.labelWidth,
          h: m.labelHeight,
          side: m.side,
          anchor: [Math.round(m.anchorX), Math.round(m.anchorY)],
          weight: Number(m.labelWeight.value.toFixed(3)),
          fade: Number(m.fade.toFixed(3)),
        }));
    },
    headSnapshot() {
      return { ...head };
    },
    /** Routes drawn in the last frame, brightest first ("topic:from>to" and line opacity). */
    routesSnapshot() {
      return routes
        .filter((route) => route.lines.visible)
        .sort((a, b) => b.material.opacity - a.material.opacity)
        .map((route) => ({ route: `${route.path}:${route.edge.from}>${route.edge.to}`, opacity: Number(route.material.opacity.toFixed(4)) }));
    },
    /** Live view-gap uniforms, for tuning from the console. */
    viewGap,
    diagnostics() {
      return {
        frames: frameCount,
        cortexPoints: cortexCount,
        skullPoints: skullData.count,
        skull: state.skull,
        routeCount: routes.length,
        particles: particleCount,
        width,
        height,
        renderCalls: renderer.info.render.calls,
        anatomy: "Z-Anatomy / BodyParts3D",
        cerebrumMillimetres: atlas.dimensions,
        camera: camera.position.toArray(),
        target: controls.target.toArray(),
        viewGap: { amount: viewGap.gapAmount.value, focus: viewGap.gapFocus.value.toArray(), radius: viewGap.gapRadius.value },
        presence: Object.fromEntries(LAYER_IDS.map((id) => [id, Number(layerPresence[id].value.toFixed(3))])),
        dissolve: Number(dissolveMix.value.toFixed(3)),
      };
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frameId);
      inputEvents.abort();
      observer.disconnect();
      controls.dispose();
      for (const layer of highlightLayers) {
        layer.object.geometry.dispose();
        layer.object.material.dispose();
      }
      highlightTemplate.dispose();
      renderer.dispose();
    },
  };
}
export type BrainScene = ReturnType<typeof createBrainScene>;
