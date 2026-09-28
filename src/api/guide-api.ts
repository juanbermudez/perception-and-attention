// GuideApi (spec §4, D1): the commands and queries behind the agent tools. No DOM: it talks to the
// explorer and the About dialog through small ports, so the UI, the tools and the tests share one path.
import { SEARCH_LIMIT } from "../agent/help";
import type { PathId, RegionId } from "../content/types";
import {
  type AboutTab,
  formatRef,
  type Place,
  placeRef,
  type Ref,
  type RegionSection,
  refPlace,
  resolveRef,
  STREAMS_REF,
  stepRef,
  TOPIC_IDS,
  topicRef,
} from "../model/refs";
import { pathwayById, WALK_SECONDS } from "../model/topics";
import { normalizeViewPatch } from "../model/view";
import type { ActivityLog } from "./activity";
import { type Detail, DOCS_LATER, outline, type Page, read, refTitle, searchGuide } from "./guide-content";
import { fail, isFailure, type Result, type WriteResult } from "./result";
import { TOUR_LIMITS, type TourRunner, type TourStop } from "./tour";
import type { ViewApi } from "./view-api";

export type Panel = "guide" | "region" | "streams";

/** What the explorer shows. `place` is what the hash and `get_context.at` describe. */
export interface ExplorerSnapshot {
  overview: boolean;
  path: PathId;
  /** 0-based. */
  step: number;
  selected: RegionId;
  panel: Panel;
  /** Region open in the Region tab; null while the tab lists the topic's regions. */
  region: RegionId | null;
  walking: boolean;
  /** Seconds per step while walking. */
  seconds: number;
  place: Place;
}

export interface ExplorerPort {
  snapshot(): ExplorerSnapshot;
  goTo(place: Place, options?: { camera?: boolean; section?: RegionSection }): void;
  startWalk(seconds?: number): void;
  stopWalk(): void;
  /** Text the user selected in the panel, and where. */
  selection(): { place: Place | null; text: string } | null;
}

export interface AboutPort {
  open(tab: AboutTab): void;
  close(): void;
  /** The open tab, or null while the dialog is closed. */
  tab(): AboutTab | null;
}

export interface GuideApiDeps {
  explorer: ExplorerPort;
  about: AboutPort;
  activity: ActivityLog;
  /** Whether the signal animation is running (Space pauses it). */
  playing: () => boolean;
  /** Whether the user lets assistants control the guide (About). */
  agentControl: () => boolean;
  /** The 3D view; missing when WebGL could not start. */
  view?: Pick<ViewApi, "apply" | "current">;
  /** Captioned agent tours; missing where there is no caption bar. */
  tour?: TourRunner;
  now?: () => number;
}

export type WalkAction = "play" | "pause" | "next" | "prev" | "restart" | "tour" | "stop";
export interface TourStopInput {
  ref?: string;
  /** A ViewPatch, applied after going to `ref`. */
  view?: unknown;
  say?: string;
  seconds?: number;
}
export interface WalkInput {
  action: WalkAction;
  ref?: string;
  seconds?: number;
  stops?: TourStopInput[];
}
interface PlannedStop extends TourStop {
  place?: Place;
  section?: RegionSection;
  view?: unknown;
}

const SELECTION_CHARS = 500;
const PANELS: Record<Panel, string> = { guide: "walkthrough", region: "region", streams: "streams" };

export function createGuideApi({ explorer, about, activity, playing, agentControl, view, tour, now = Date.now }: GuideApiDeps) {
  const context = () => {
    const snapshot = explorer.snapshot();
    return { snapshot, path: snapshot.overview ? null : snapshot.path };
  };
  const placeText = (place: Place) => formatRef(placeRef(place));
  const stepCount = (path: PathId) => pathwayById(path).steps.length;
  const briefText = (ref: Ref, path: PathId | null) => {
    const brief = read(formatRef(ref), "brief", { path });
    return isFailure(brief) ? undefined : (brief as { text?: string }).text;
  };

  /* ---------- Queries ---------- */

  function getContext(since?: number) {
    const { snapshot, path } = context();
    const at = placeRef(snapshot.place);
    const log = activity.since(since);
    const selection = explorer.selection();
    const aboutTab = about.tab();
    const inTopic = path !== null;
    return {
      at: formatRef(at),
      title: refTitle(at),
      panel: inTopic ? (snapshot.panel === "region" && !snapshot.region ? "regions" : PANELS[snapshot.panel]) : undefined,
      topic: inTopic ? topicRef(path) : undefined,
      step: inTopic ? stepRef(path, snapshot.step) : undefined,
      n: inTopic ? snapshot.step + 1 : undefined,
      of: inTopic ? stepCount(path) : undefined,
      selected: inTopic ? snapshot.selected : undefined,
      playing: playing(),
      walking: snapshot.walking,
      seconds: snapshot.walking ? snapshot.seconds : undefined,
      view: view?.current(),
      about: aboutTab ? formatRef({ kind: "about", tab: aboutTab }) : undefined,
      selection: selection ? { ref: selection.place ? placeText(selection.place) : undefined, text: selection.text.slice(0, SELECTION_CHARS) } : undefined,
      tour: tour?.status() ?? undefined,
      control: agentControl() ? undefined : "off",
      activity: log.entries.map((entry) => ({
        seq: entry.seq,
        by: entry.by,
        kind: entry.kind,
        ref: entry.ref,
        said: entry.said,
        on: entry.on,
        ago: Math.max(0, Math.round((now() - entry.time) / 1000)),
      })),
      cursor: log.cursor,
      more: log.more || undefined,
    };
  }

  function search(query: string, scope: "guide" | "docs" | "all" = "all", limit = SEARCH_LIMIT.default): Result<object> {
    if (scope === "docs") return fail("not_available", DOCS_LATER);
    return { scope: "guide", hits: searchGuide(query, limit) };
  }

  /* ---------- Commands ---------- */

  /** Describe where the user is now, after a command. */
  function arrived<Extra extends { said: string }>(extra: Extra) {
    const { snapshot, path } = context();
    const at = placeRef(snapshot.place);
    return {
      at: formatRef(at),
      title: refTitle(at),
      n: path ? snapshot.step + 1 : undefined,
      of: path ? stepCount(path) : undefined,
      walking: snapshot.walking,
      ...extra,
    };
  }

  /** Agent navigation, a new walkthrough or a new tour replaces a tour in progress. */
  function endTour() {
    return tour?.stop("agent") ? " Ended the tour." : "";
  }

  function stepWords(path: PathId, index: number) {
    const topic = pathwayById(path);
    return `${topic.title} step ${index + 1} of ${topic.steps.length}: ${topic.steps[index].title}`;
  }

  function go(refText: string, camera = true): Result<WriteResult> {
    const resolved = resolveRef(refText);
    if (isFailure(resolved)) return resolved;
    const { ref } = resolved;
    if (ref.kind === "about") {
      about.open(ref.tab);
      return { at: formatRef(ref), title: refTitle(ref), said: `Opened About: ${refTitle(ref)}.` };
    }
    if (ref.kind === "help") return fail("not_available", "help is reference data with no page. Read it with read({ ref: 'help' }).");
    if (ref.kind === "source") {
      const cited = outline(formatRef(ref)) as { cited?: string[] };
      return fail("not_available", "Sources have no page of their own. Read the source, or go to a topic or region that cites it.", cited.cited ?? []);
    }
    const place = refPlace(ref);
    if (!place) return fail("not_available", DOCS_LATER);
    const before = explorer.snapshot().place;
    const ended = endTour();
    if (about.tab()) about.close();
    explorer.goTo(place, { camera, section: ref.kind === "region" ? ref.section : undefined });
    const { snapshot, path } = context();
    const moved = placeText(before) !== placeText(snapshot.place);
    return arrived({
      said: `${describePlace(snapshot.place, path)}${ended}`,
      brief: briefText(ref, path),
      view: view?.current(),
      undo: moved ? { label: "Undo", run: () => explorer.goTo(before) } : undefined,
    });
  }

  function describePlace(place: Place, path: PathId | null): string {
    switch (place.kind) {
      case "overview":
        return "Opened the overview.";
      case "streams":
        return "Opened the Attention streams.";
      case "step":
        return `Opened ${stepWords(place.path, place.index)}.`;
      case "regions":
        return `Opened the regions of ${pathwayById(place.path).title}.`;
      case "region":
        return `Showed ${refTitle({ kind: "region", id: place.id })}${path ? ` in ${pathwayById(path).title}` : ""}.`;
    }
  }

  function walkthrough({ action, ref, seconds, stops }: WalkInput): Result<WriteResult> {
    if (stops !== undefined && action !== "tour") return fail("bad_input", `stops applies to tour, not ${action}.`);
    if (action === "tour") return startTour(stops, ref, seconds);
    const startsWalk = action === "play" || action === "restart";
    if (ref !== undefined && !startsWalk) return fail("bad_input", `ref applies to play and restart, not ${action}.`);
    if (seconds !== undefined && !startsWalk) return fail("bad_input", `seconds applies to play and restart, not ${action}.`);
    if (action === "stop") return stopPlaying();
    // While a tour runs, the plain controls act on it; play or restart with a ref or seconds starts a topic walkthrough instead.
    if (tour?.active && ref === undefined && seconds === undefined) return controlTour(action);
    let target: Place | null = null;
    if (ref !== undefined) {
      const resolved = resolveRef(ref);
      if (isFailure(resolved)) return resolved;
      target = resolved.ref.kind === "topic" || resolved.ref.kind === "step" ? refPlace(resolved.ref) : null;
      if (!target) return fail("bad_input", "Walkthroughs play a topic. Pass a topic or step ref.", pathwayRefs());
      if (action === "restart" && target.kind === "step") target = { ...target, index: 0 };
    }
    const { snapshot, path } = context();
    if (!target && !path) return fail("not_available", "No topic is open. Pass ref with the topic to play.", pathwayRefs());
    if (action !== "pause" && about.tab()) about.close();
    const topic = target?.kind === "step" ? target.path : (path as PathId);
    const current = snapshot.step;
    const last = stepCount(topic) - 1;
    switch (action) {
      case "play":
      case "restart": {
        const index = action === "restart" ? 0 : target?.kind === "step" ? target.index : current;
        const ended = endTour();
        // Play needs the Walkthrough tab; restart and a new topic start from their step.
        if (target || action === "restart" || snapshot.panel !== "guide") explorer.goTo({ kind: "step", path: topic, index });
        explorer.startWalk(seconds ?? WALK_SECONDS.default);
        const after = explorer.snapshot();
        return arrived({
          said: `Playing ${stepWords(topic, after.step)}, ${after.seconds} s per step.${ended}`,
          brief: briefText({ kind: "step", path: topic, index: after.step }, topic),
        });
      }
      case "pause":
        if (!snapshot.walking) return arrived({ said: "The walkthrough was already paused." });
        explorer.stopWalk();
        return arrived({ said: `Paused at ${stepWords(topic, current)}.` });
      case "next":
      case "prev": {
        const index = current + (action === "next" ? 1 : -1);
        if (index < 0 || index > last)
          return fail("not_available", `Already at the ${action === "next" ? "last" : "first"} step (${current + 1} of ${last + 1}).`);
        explorer.goTo({ kind: "step", path: topic, index });
        return arrived({ said: `${stepWords(topic, index)}.`, brief: briefText({ kind: "step", path: topic, index }, topic) });
      }
    }
  }

  /* ---------- Tours ---------- */

  /** Check every stop before the first one plays, so a bad stop never leaves a tour half run. */
  function planTour(stops: TourStopInput[], seconds: number | undefined): Result<PlannedStop[]> {
    const planned: PlannedStop[] = [];
    for (const [i, stop] of stops.entries()) {
      const at = `stops.${i}`;
      if (stop.ref === undefined && stop.view === undefined && !stop.say) return fail("bad_input", `${at}: give the stop a ref, a view or say text.`);
      const next: PlannedStop = { say: stop.say?.trim() ?? "", seconds: stop.seconds ?? seconds ?? TOUR_LIMITS.seconds.default };
      if (next.say.length > TOUR_LIMITS.say) return fail("limit", `${at}.say: captions are at most ${TOUR_LIMITS.say} characters.`);
      if (next.seconds < TOUR_LIMITS.seconds.min || next.seconds > TOUR_LIMITS.seconds.max)
        return fail("bad_input", `${at}.seconds: ${TOUR_LIMITS.seconds.min}–${TOUR_LIMITS.seconds.max} seconds per stop.`);
      if (stop.ref !== undefined) {
        const resolved = resolveRef(stop.ref);
        if (isFailure(resolved)) return fail(resolved.error.code, `${at}.ref: ${resolved.error.message}`, resolved.error.options);
        const place = refPlace(resolved.ref);
        if (!place)
          return fail("bad_input", `${at}.ref: tour stops go to places in the guide (overview, a topic, step or region, or ${STREAMS_REF}), not ${stop.ref}.`);
        next.place = place;
        if (resolved.ref.kind === "region") next.section = resolved.ref.section;
      }
      if (stop.view !== undefined) {
        if (!view) return fail("not_available", "The 3D view is not running, so tour stops cannot change it.");
        const checked = normalizeViewPatch(stop.view);
        if ("error" in checked) return fail(checked.error.code, `${at}.view: ${checked.error.message}`, checked.error.options);
        next.view = stop.view;
      }
      planned.push(next);
    }
    return planned;
  }

  /** One stop: go to its place, then apply its view (so the stop's view wins over what navigation resets). */
  function playStop(stop: PlannedStop) {
    if (about.tab()) about.close();
    if (stop.place) explorer.goTo(stop.place, { camera: true, section: stop.section });
    if (stop.view !== undefined) view?.apply(stop.view);
    // Settle the route now, while the tour is driving, so the page does not log this navigation as the user's.
    explorer.snapshot();
  }

  function startTour(stops: TourStopInput[] | undefined, ref: string | undefined, seconds: number | undefined): Result<WriteResult> {
    if (!tour) return fail("not_available", "Tours need the caption bar, which this page does not have.");
    if (ref !== undefined) return fail("bad_input", "ref applies to play and restart. Give each tour stop its own ref.");
    if (!stops?.length) return fail("bad_input", `tour needs stops: 1–${TOUR_LIMITS.stops} of { ref?, view?, say?, seconds? }.`);
    if (stops.length > TOUR_LIMITS.stops) return fail("limit", `A tour has at most ${TOUR_LIMITS.stops} stops.`);
    const planned = planTour(stops, seconds);
    if (isFailure(planned)) return planned;
    explorer.stopWalk();
    tour.start(planned, playStop);
    const total = planned.reduce((sum, stop) => sum + stop.seconds, 0);
    return arrived({
      said: `Started a ${planned.length}-stop tour, about ${Math.round(total)} s.`,
      tour: tour.status() ?? undefined,
      view: view?.current(),
    });
  }

  function controlTour(action: Exclude<WalkAction, "tour" | "stop">): Result<WriteResult> {
    const runner = tour as TourRunner;
    const where = () => {
      const status = runner.status();
      return status ? `stop ${status.stop} of ${status.of}` : "the end";
    };
    const report = (said: string) => arrived({ said, tour: runner.status() ?? undefined });
    switch (action) {
      case "pause":
        return report(runner.pause() ? `Paused the tour at ${where()}.` : `The tour was already paused at ${where()}.`);
      case "play":
        return report(runner.resume() ? `Resumed the tour at ${where()}.` : `The tour is already playing, at ${where()}.`);
      case "next":
        runner.next();
        return report(runner.active ? `Tour ${where()}.` : "That was the last stop, so the tour ended.");
      case "prev":
        if (!runner.prev()) return fail("not_available", "Already at the first stop of the tour.");
        return report(`Back to tour ${where()}.`);
      case "restart":
        runner.restart();
        return report(`Restarted the tour at ${where()}.`);
    }
  }

  /** `stop`: end a tour and a playing walkthrough. */
  function stopPlaying(): WriteResult {
    const status = tour?.status();
    const { snapshot, path } = context();
    const parts: string[] = [];
    if (status) {
      tour?.stop("agent");
      parts.push(`ended the tour at stop ${status.stop} of ${status.of}`);
    }
    if (snapshot.walking && path) {
      explorer.stopWalk();
      parts.push(`stopped the walkthrough at ${stepWords(path, snapshot.step)}`);
    }
    const said = parts.length ? parts.join(" and ") : "nothing was playing";
    return arrived({ said: `${said[0].toUpperCase()}${said.slice(1)}.` });
  }

  /* ---------- 3D view ---------- */

  function setView(patch: unknown): Result<WriteResult> {
    if (!view) return fail("not_available", "The 3D view is not running in this browser.");
    return view.apply(patch);
  }

  return {
    context: getContext,
    outline: (ref?: string, page?: Page) => outline(ref, page),
    read: (ref: string, detail?: Detail) => read(ref, detail, { path: context().path }),
    search,
    go,
    walkthrough,
    setView,
  };
}

const pathwayRefs = () => TOPIC_IDS.map(topicRef);

export type GuideApi = ReturnType<typeof createGuideApi>;
