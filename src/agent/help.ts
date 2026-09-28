// The `help` reference card (spec §6.3): ref grammar, topics, every region id with its short name,
// read details and limits. Generated from content, so it never lists a region or topic that does not exist.
// It is reference data, written as facts, not instructions.
import { TOUR_LIMITS } from "../api/tour";
import { pathways } from "../content/pathways";
import { regions } from "../content/regions";
import { REGION_IDS, REGION_SECTIONS } from "../model/refs";
import { WALK_SECONDS } from "../model/topics";
import { MAX_FRAME, PITCH_MAX, PITCH_MIN } from "../model/view";

export const LIST_LIMIT = { default: 20, max: 100 };
export const SEARCH_LIMIT = { default: 10, max: 50 };

export function helpCard() {
  return {
    ref: "help",
    refs: [
      "guide | overview | help",
      "about | about/papers | about/code | about/models",
      "topic:<topic> | topic:attention/streams",
      "step:<topic>/<n> (1-based, as in the UI) or step:<topic>/<key>. Results use the key form; it stays valid when steps are renumbered.",
      `region:<id>[#${REGION_SECTIONS.join("|")}]`,
      "source:<id>",
      "docs | doc:<id> | quiz:<id> | block:<id>",
    ],
    caseInsensitive: true,
    links: "Guide text links regions as [text](region:<id>). The ref works in read and go.",
    topics: Object.fromEntries(pathways.map((path) => [path.id, `${path.title} · ${path.steps.length} steps`])),
    regions: Object.fromEntries(REGION_IDS.map((id) => [id, regions[id].short])),
    details: { brief: "default, short", full: "every section, key fact, signal route", sources: "citations with URLs", markdown: "a doc as .md" },
    docs: "Docs are lists of markdown blocks. update, replace and set in edit_blocks need the block's rev.",
    view: `set_view and tour stops take one view patch; only given fields change. Camera order: reset, focus|frame, from/yaw/pitch, orbit, zoom. yaw 0 front, 90 left, -90 right, 180 back; pitch ${PITCH_MIN}..${PITCH_MAX}; zoom 1 = overview. Going home or to another topic resets layers, isolate and labels.`,
    limits: {
      walkthroughSeconds: [WALK_SECONDS.min, WALK_SECONDS.max],
      tourStops: TOUR_LIMITS.stops,
      stopSeconds: [TOUR_LIMITS.seconds.min, TOUR_LIMITS.seconds.max],
      sayChars: TOUR_LIMITS.say,
      frameRegions: MAX_FRAME,
      listLimit: LIST_LIMIT.max,
      searchLimit: SEARCH_LIMIT.max,
    },
    control:
      "Write tools (go, walkthrough, set_view, doc, edit_blocks, window, quiz) return agent_control_off while the user has assistant control off in About. Read tools always work.",
    errors: [
      "bad_input",
      "unknown_ref (with options)",
      "not_available (with a reason)",
      "stale_rev",
      "locked_by_user",
      "limit",
      "agent_control_off",
      "store_unavailable",
    ],
  };
}
