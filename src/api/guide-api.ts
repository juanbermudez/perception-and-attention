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
  stepRef,
  TOPIC_IDS,
  topicRef,
} from "../model/refs";
import { pathwayById, WALK_SECONDS } from "../model/topics";
import type { ActivityLog } from "./activity";
import { type Detail, DOCS_LATER, outline, type Page, read, refTitle, searchGuide } from "./guide-content";
import { fail, isFailure, type Result, type WriteResult } from "./result";

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
  now?: () => number;
}

export type WalkAction = "play" | "pause" | "next" | "prev" | "restart";
export interface WalkInput {
  action: WalkAction;
  ref?: string;
  seconds?: number;
}

const SELECTION_CHARS = 500;
const PANELS: Record<Panel, string> = { guide: "walkthrough", region: "region", streams: "streams" };

export function createGuideApi({ explorer, about, activity, playing, agentControl, now = Date.now }: GuideApiDeps) {
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
      about: aboutTab ? formatRef({ kind: "about", tab: aboutTab }) : undefined,
      selection: selection ? { ref: selection.place ? placeText(selection.place) : undefined, text: selection.text.slice(0, SELECTION_CHARS) } : undefined,
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
  function arrived(extra: { said: string; brief?: string; undo?: WriteResult["undo"] }) {
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
    if (about.tab()) about.close();
    explorer.goTo(place, { camera, section: ref.kind === "region" ? ref.section : undefined });
    const { snapshot, path } = context();
    const moved = placeText(before) !== placeText(snapshot.place);
    return arrived({
      said: describePlace(snapshot.place, path),
      brief: briefText(ref, path),
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

  function walkthrough({ action, ref, seconds }: WalkInput): Result<WriteResult> {
    const startsWalk = action === "play" || action === "restart";
    if (ref !== undefined && !startsWalk) return fail("bad_input", `ref applies to play and restart, not ${action}.`);
    if (seconds !== undefined && !startsWalk) return fail("bad_input", `seconds applies to play and restart, not ${action}.`);
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
        // Play needs the Walkthrough tab; restart and a new topic start from their step.
        if (target || action === "restart" || snapshot.panel !== "guide") explorer.goTo({ kind: "step", path: topic, index });
        explorer.startWalk(seconds ?? WALK_SECONDS.default);
        const after = explorer.snapshot();
        return arrived({
          said: `Playing ${stepWords(topic, after.step)}, ${after.seconds} s per step.`,
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

  return {
    context: getContext,
    outline: (ref?: string, page?: Page) => outline(ref, page),
    read: (ref: string, detail?: Detail) => read(ref, detail, { path: context().path }),
    search,
    go,
    walkthrough,
  };
}

const pathwayRefs = () => TOPIC_IDS.map(topicRef);

export type GuideApi = ReturnType<typeof createGuideApi>;
