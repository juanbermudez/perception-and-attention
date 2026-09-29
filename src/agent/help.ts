// The `help` reference card (spec §6.3): ref grammar, topics, every region id, read details, limits,
// which tool does what, and what each error code asks for. Generated from content, so it never lists a
// region or topic that does not exist. It is reference data, written as facts, not instructions.
import { TOUR_LIMITS } from "../api/tour";
import { pathways } from "../content/pathways";
import { REGION_IDS, REGION_SECTIONS } from "../model/refs";
import { WALK_SECONDS } from "../model/topics";
import { MAX_FRAME, PITCH_MAX, PITCH_MIN } from "../model/view";

export const LIST_LIMIT = { default: 20, max: 100 };
export const SEARCH_LIMIT = { default: 10, max: 50 };

export function helpCard() {
  return {
    ref: "help",
    refs: [
      "guide | overview | help | docs",
      "about | about/papers | about/code | about/models",
      "topic:<topic> | topic:attention/streams",
      "step:<topic>/<n> (1-based) or step:<topic>/<key>; results use the key",
      `region:<id>[#${REGION_SECTIONS.join("|")}]; a bare topic or region id works too`,
      "source:<id> | doc:<id> | quiz:<id> | block:<id>",
    ],
    caseInsensitive: true,
    topics: Object.fromEntries(pathways.map((path) => [path.id, `${path.title} · ${path.steps.length} steps`])),
    // Ids only, to keep the card small: read or search gives each region's name.
    regions: REGION_IDS.join(" "),
    details: {
      brief: "default, short",
      full: "every section, key fact and signal route; every block of a doc",
      sources: "citations with URLs",
      markdown: "a doc as .md",
      results: "a quiz's answers and score",
    },
    view: `One patch for set_view, tour stops and saved views; only given fields change. Camera order: reset, focus|frame, from/yaw/pitch, orbit, zoom. yaw 0 front, 90 left, -90 right, 180 back; pitch ${PITCH_MIN}..${PITCH_MAX}; zoom 1 = overview. Going home or to another topic resets layers, isolate and labels.`,
    limits: {
      walkthroughSeconds: [WALK_SECONDS.min, WALK_SECONDS.max],
      tourStops: TOUR_LIMITS.stops,
      stopSeconds: [TOUR_LIMITS.seconds.min, TOUR_LIMITS.seconds.max],
      sayChars: TOUR_LIMITS.say,
      frameRegions: MAX_FRAME,
      listLimit: LIST_LIMIT.max,
      searchLimit: SEARCH_LIMIT.max,
    },
    tasks: {
      "catch up on what the user did": "get_context",
      "find something": "search",
      "list topics or a topic's steps": "outline",
      "list the user's docs": "outline docs",
      "show a place with its text": "go",
      "change only the 3D view": "set_view",
      "play a topic's steps": "walkthrough",
      "narrate your own sequence": "start_tour",
      "write notes": "doc create, then edit_blocks",
      "quiz the user": "quiz create",
      "see quiz answers": "read quiz:<id> results",
      "arrange windows": "window",
    },
    errors: {
      bad_input: "fix the named field",
      unknown_ref: "try one of the options",
      not_available: "not usable here or now; the message says why",
      stale_rev: "the block changed; retry with current.rev",
      locked_by_user: "the user is typing there; retry in a few seconds",
      limit: "split the request",
      agent_control_off: "assistant control is off in About; read tools still work",
      store_unavailable: "docs cannot be saved in this browser",
      internal: "a bug in the page, not in your call",
    },
  };
}
