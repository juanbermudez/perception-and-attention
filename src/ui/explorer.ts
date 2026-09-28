// Controller for the overview, topic walkthroughs, region guides and attention streams.
// It owns the side panel and dock, writes the shared state, and tells the scene what to show.
import { pathways } from "../content/pathways";
import { overview } from "../content/site";
import type { PathId, Pathway, RegionId, SenseId, Signal } from "../content/types";
import { attentionGain, sensoryStreams } from "../model/attention";
import type { BrainScene } from "../scene/brain-scene";
import type { ExplorerState } from "../state";
import { byId, linkedText, nextTabIndex, toast } from "./dom";
import {
  dockButtonsHtml,
  introHtml,
  normalizationHtml,
  pathAfterHtml,
  priorityButtonsHtml,
  regionHtml,
  regionListHtml,
  stepDotsHtml,
  stepsHtml,
  streamRowsHtml,
} from "./templates";

type Panel = "guide" | "region" | "streams";

/** Seconds each step stays on screen during autoplay. */
const STEP_SECONDS = 5.5;

/** A step's signal, or by default a single hop from the previous step's region. */
export function signalFor(path: Pathway, index: number): Signal {
  const step = path.steps[index];
  if (step.signal) return step.signal;
  return index > 0 ? [[[path.steps[index - 1].region, step.region]]] : [];
}

export function createExplorer(state: ExplorerState, reducedMotion: MediaQueryList, onOpenAbout: () => void) {
  const inspector = byId("inspector");
  const stepList = byId("path-steps");
  const stepDots = byId("step-progress");
  const body = byId("inspector-body");
  const playButton = byId("step-play");
  let scene: BrainScene | undefined;
  let panel: Panel = "guide";
  let expandedStep: number | null = 0;
  /** Region shown in the Region tab; null shows the list of regions. */
  let shownRegion: RegionId | null = null;
  let walkTimer: ReturnType<typeof setTimeout> | undefined;

  const current = () => pathways.find((path) => path.id === state.path) ?? pathways[0];
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let previewing: RegionId | null = null;
  /** Stop a hover preview. Without `restore`, the camera stays where the next action puts it. */
  function cancelPreview(restore = false) {
    clearTimeout(hoverTimer);
    if (previewing) scene?.endPreview(restore);
    previewing = null;
  }
  const smooth = (): ScrollBehavior => (reducedMotion.matches ? "auto" : "smooth");

  /* ---------- Overview ---------- */

  function showIntro() {
    cancelPreview();
    stopWalk();
    state.overview = true;
    state.path = "attention";
    state.selected = "pfc";
    shownRegion = null;
    byId("intro-view").hidden = false;
    byId("path-view").hidden = true;
    byId("intro-scroll").scrollTop = 0;
    byId("scene-title").textContent = overview.title;
    inspector.style.setProperty("--path-color", "var(--accent)");
    updateDock();
    scene?.reset();
  }

  function updateDock() {
    byId("home-button").setAttribute("aria-pressed", String(state.overview));
    for (const button of byId("pathway-list").querySelectorAll<HTMLButtonElement>("button")) {
      const active = !state.overview && button.dataset.path === state.path;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      if (active) button.scrollIntoView({ block: "nearest", inline: "nearest", behavior: smooth() });
    }
  }

  /* ---------- Topics and steps ---------- */

  function selectPath(id: PathId) {
    cancelPreview();
    stopWalk();
    state.overview = false;
    state.path = id;
    shownRegion = null;
    expandedStep = 0;
    const path = current();
    byId("intro-view").hidden = true;
    byId("path-view").hidden = false;
    inspector.style.setProperty("--path-color", path.color);
    byId("scene-title").textContent = path.title;
    byId("path-title").textContent = path.title;
    byId("path-subtitle").textContent = path.subtitle;
    byId("path-intro").innerHTML = linkedText(path.intro);
    stepList.innerHTML = stepsHtml(path);
    stepDots.innerHTML = stepDotsHtml(path);
    byId("path-after").innerHTML = pathAfterHtml(path);
    byId("streams-tab").hidden = id !== "attention";
    byId("ear-view").hidden = id !== "hearing";
    byId("bone-toggle").hidden = id !== "hearing";
    updateAttention();
    setPanel("guide");
    updateDock();
    setStep(0);
    body.scrollTop = 0;
  }

  function setStep(index: number, { camera = true, signal = true, keepWalking = false } = {}) {
    cancelPreview();
    const path = current();
    state.step = Math.max(0, Math.min(path.steps.length - 1, index));
    state.selected = path.steps[state.step].region;
    expandedStep = state.step;
    if (!keepWalking) stopWalk();
    scene?.focusRegion(state.selected, camera);
    if (signal) scene?.sendVolley(signalFor(path, state.step), state.selected);
    updateSteps();
    const open = stepList.children[state.step] as HTMLElement | undefined;
    if (open && panel === "guide") requestAnimationFrame(() => open.scrollIntoView({ block: "nearest", behavior: smooth() }));
  }

  function updateSteps() {
    const path = current();
    Array.from(stepList.children).forEach((item, index) => {
      const active = index === state.step && path.steps[index].region === state.selected;
      const expanded = index === expandedStep;
      item.classList.toggle("active", active);
      item.classList.toggle("done", index < state.step);
      item.classList.toggle("expanded", expanded);
      const toggle = item.querySelector(".step-toggle");
      toggle?.setAttribute("aria-expanded", String(expanded));
      toggle?.setAttribute("aria-current", active ? "step" : "false");
      const stepBody = item.querySelector(".step-body");
      stepBody?.setAttribute("aria-hidden", String(!expanded));
      stepBody?.toggleAttribute("inert", !expanded);
    });
    Array.from(stepDots.children).forEach((dot, index) => {
      dot.classList.toggle("active", index === state.step);
      dot.classList.toggle("done", index < state.step);
      dot.setAttribute("aria-current", index === state.step ? "step" : "false");
    });
    byId<HTMLButtonElement>("step-prev").disabled = state.step <= 0;
    byId<HTMLButtonElement>("step-next").disabled = state.step >= path.steps.length - 1;
    if (panel === "region") {
      if (shownRegion === null) renderRegionList();
      else if (shownRegion !== state.selected) renderRegion(state.selected);
    }
  }

  function selectRegion(id: RegionId, focusCamera = true) {
    const index = current().steps.findIndex((step) => step.region === id);
    if (index >= 0 && !state.overview) {
      setStep(index, { camera: focusCamera });
      return;
    }
    state.selected = id;
    stopWalk();
    scene?.focusRegion(id, focusCamera);
    updateSteps();
  }

  /* ---------- Autoplay: each step fires its own signal ---------- */

  function stopWalk() {
    clearTimeout(walkTimer);
    walkTimer = undefined;
    playButton.setAttribute("aria-pressed", "false");
    byId("step-play-label").textContent = "Play";
  }

  function scheduleWalk() {
    walkTimer = setTimeout(() => {
      if (state.step >= current().steps.length - 1) {
        stopWalk();
        toast("End of this topic.");
        return;
      }
      setStep(state.step + 1, { keepWalking: true });
      scheduleWalk();
    }, STEP_SECONDS * 1000);
  }

  function startWalk() {
    if (state.overview) return;
    playButton.setAttribute("aria-pressed", "true");
    byId("step-play-label").textContent = "Pause";
    const atEnd = state.step >= current().steps.length - 1;
    setStep(atEnd ? 0 : state.step, { keepWalking: true });
    scheduleWalk();
  }

  /* ---------- Panel tabs ---------- */

  function setPanel(next: Panel) {
    panel = next;
    // The Streams tab compares all senses, so the step spotlight is off there.
    state.spotlight = next !== "streams";
    for (const tab of document.querySelectorAll<HTMLButtonElement>(".panel-tab")) {
      const active = tab.dataset.panel === next;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    byId("guide-panel").hidden = next !== "guide";
    byId("region-drawer").hidden = next !== "region";
    byId("sensory-controls").hidden = next !== "streams";
    byId("step-controls").hidden = next === "streams";
    body.scrollTop = 0;
    if (next !== "region") shownRegion = null;
    if (next === "streams") updateAttention();
  }

  function renderRegion(id: RegionId) {
    shownRegion = id;
    byId("drawer-content").innerHTML = regionHtml(id, current());
  }

  function renderRegionList() {
    shownRegion = null;
    byId("drawer-content").innerHTML = regionListHtml(current(), state.selected);
  }

  function showRegionList() {
    setPanel("region");
    renderRegionList();
  }

  function showRegion(id: RegionId = state.selected) {
    if (state.overview) {
      // From the overview, open the first topic that features the region.
      const host =
        pathways.find((path) => path.steps.some((step) => step.region === id)) ??
        pathways.find((path) => path.edges.some((edge) => edge.from === id || edge.to === id));
      if (host) selectPath(host.id);
    }
    selectRegion(id);
    setPanel("region");
    renderRegion(id);
    byId("drawer-title").focus({ preventScroll: true });
  }

  /* ---------- Attention streams ---------- */

  function updateAttention() {
    const controls = byId("sensory-controls");
    for (const button of controls.querySelectorAll<HTMLButtonElement>("[data-sense]")) {
      button.setAttribute("aria-pressed", String(state.enabledSenses[button.dataset.sense as SenseId]));
    }
    for (const button of byId("attention-priority").querySelectorAll<HTMLButtonElement>("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.priority === state.priority));
    }
    byId("control-network").setAttribute("aria-pressed", String(state.controlNetwork));
    byId<HTMLInputElement>("attention-gain").value = String(state.focus);
    byId("attention-gain-value").textContent = `${attentionGain(state.focus).toFixed(1)}×`;
    byId("normalization").innerHTML = normalizationHtml(state);
  }

  function handleStreams(button: HTMLButtonElement) {
    const { sense, only, study, priority } = button.dataset;
    if (sense) state.enabledSenses[sense as SenseId] = !state.enabledSenses[sense as SenseId];
    if (only) {
      for (const stream of sensoryStreams) state.enabledSenses[stream.id] = stream.id === only;
      state.priority = only as SenseId;
      const region = sensoryStreams.find((stream) => stream.id === only)?.region;
      if (region) selectRegion(region, false);
    }
    if (study) {
      selectPath(study as SenseId);
      return;
    }
    if (priority) {
      state.priority = priority as SenseId | "balanced";
      if (state.priority !== "balanced") state.enabledSenses[state.priority] = true;
    }
    if (button.id === "control-network") state.controlNetwork = !state.controlNetwork;
    if (button.id === "show-all-streams") {
      for (const stream of sensoryStreams) state.enabledSenses[stream.id] = true;
      state.controlNetwork = true;
      state.priority = "balanced";
    }
    updateAttention();
  }

  /* ---------- Event wiring ---------- */

  byId("intro-scroll").innerHTML = introHtml();
  byId("pathway-list").innerHTML = dockButtonsHtml();
  byId("sensory-streams").innerHTML = streamRowsHtml();
  byId("attention-priority").innerHTML = priorityButtonsHtml();

  byId("pathway-list").addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-path]");
    if (button) selectPath(button.dataset.path as PathId);
  });
  byId("home-button").addEventListener("click", showIntro);
  byId("intro-about").addEventListener("click", onOpenAbout);
  byId("back-to-intro").addEventListener("click", () => {
    showIntro();
    byId("home-button").focus({ preventScroll: true });
  });
  byId("intro-scroll").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    cancelPreview();
    const topic = target.closest<HTMLButtonElement>(".journey");
    if (topic) selectPath(topic.dataset.path as PathId);
    else {
      const mention = target.closest<HTMLButtonElement>(".region-mention");
      if (mention) scene?.focusRegion(mention.dataset.region as RegionId, true);
    }
  });

  byId("step-prev").addEventListener("click", () => setStep(state.step - 1));
  byId("step-next").addEventListener("click", () => setStep(state.step + 1));
  playButton.addEventListener("click", () => (walkTimer ? stopWalk() : startWalk()));
  stepDots.addEventListener("click", (event) => {
    const dot = (event.target as HTMLElement).closest<HTMLButtonElement>(".step-dot");
    if (dot) setStep(Number(dot.dataset.step));
  });
  stepList.addEventListener("click", (event) => {
    const toggle = (event.target as HTMLElement).closest<HTMLButtonElement>(".step-toggle");
    if (!toggle) return;
    const index = Number(toggle.dataset.step);
    if (expandedStep === index && state.step === index) {
      expandedStep = null;
      updateSteps();
    } else setStep(index);
  });

  inspector.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || button.closest("#intro-scroll")) return;
    if (button.closest("#sensory-controls")) {
      handleStreams(button);
      return;
    }
    cancelPreview();
    if (button.dataset.openRegion) showRegion(button.dataset.openRegion as RegionId);
    else if (button.hasAttribute("data-region-list")) showRegionList();
    else if (button.hasAttribute("data-back-guide")) setPanel("guide");
    else if (button.dataset.region) {
      const id = button.dataset.region as RegionId;
      if (panel === "region" && shownRegion !== id) showRegion(id);
      else selectRegion(id);
    }
  });
  byId("attention-gain").addEventListener("input", (event) => {
    state.focus = Number((event.target as HTMLInputElement).value);
    updateAttention();
  });

  const panelTabs = document.querySelector(".panel-tabs");
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".panel-tab")) {
    tab.addEventListener("click", () => (tab.dataset.panel === "region" ? showRegionList() : setPanel(tab.dataset.panel as Panel)));
  }
  panelTabs?.addEventListener("keydown", (event) => {
    const e = event as KeyboardEvent;
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".panel-tab:not([hidden])"));
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next = index < 0 ? null : nextTabIndex(e.key, index, tabs.length);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (tabs[next].dataset.panel === "region") showRegionList();
    else setPanel(tabs[next].dataset.panel as Panel);
    tabs[next].focus();
  });

  // Hovering a region name in the panel previews it in 3D; leaving returns the view.
  const regionTarget = (node: EventTarget | null) =>
    (node as HTMLElement | null)?.closest<HTMLElement>(".region-mention, .step-region-link, .region-row") ?? null;
  inspector.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    const target = regionTarget(event.target);
    const id = (target?.dataset.region ?? target?.dataset.openRegion) as RegionId | undefined;
    if (!id) return;
    clearTimeout(hoverTimer);
    if (previewing === id) return;
    hoverTimer = setTimeout(() => {
      previewing = id;
      scene?.previewRegion(id);
    }, 140);
  });
  inspector.addEventListener("pointerout", (event) => {
    const target = regionTarget(event.target);
    if (!target || target.contains(event.relatedTarget as Node | null)) return;
    clearTimeout(hoverTimer);
    // A short grace period lets the pointer move to a neighbouring name without a round trip.
    hoverTimer = setTimeout(() => cancelPreview(true), 160);
  });

  return {
    attachScene(next: BrainScene) {
      scene = next;
    },
    get scene() {
      return scene;
    },
    get walking() {
      return walkTimer !== undefined;
    },
    showIntro,
    selectPath,
    selectRegion,
    showRegion,
    setStep,
    stopWalk,
  };
}

export type Explorer = ReturnType<typeof createExplorer>;
