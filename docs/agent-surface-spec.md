# Agent surface over WebMCP: spec

Status: draft for review · Written 2026-09-27 · Updated 2026-09-28 for commits up to `e3760b2` (see §4.1), and for the tool fixes from the 2026-09-28 review (see §2.1) · Stages: [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) · Evaluation: [`agent-evals.md`](agent-evals.md)

## TL;DR

Perception & Attention becomes a shared surface that the user and an agent can both work on. The page registers **12 WebMCP tools**. With them, an agent in the ChatGPT desktop browser can:

- read the guide a level at a time
- navigate it, run walkthroughs and narrate its own tours
- control the 3D camera and layers (dissolve, isolate) in one declarative call
- create and edit markdown docs and quizzes, shown in floating windows

Docs persist locally in **SQLite (WASM, OPFS)**. They can sync to Turso or D1 later through the same schema.

Every tool is a thin adapter over an internal `GuideApi`, and the UI calls that same API. WebMCP is an optional doorway. The features work without it.

---

## 1. Goals and non-goals

**Goals**

1. An agent can find, read and navigate every part of the guide, with **progressive disclosure**: an outline first, a short read next, full text and sources only on request.
2. An agent can drive the 3D view with **compact commands**. Camera, layers, isolation and labels change together in one call.
3. The agent and the user share **floating windows**. Windows hold markdown docs made of addressable blocks, plus quizzes. The agent can list, search, open, edit, minimize and close them. The user edits the same docs in a clean, Linear-style editor and downloads them as `.md`.
4. Docs, quizzes, attempts and window layout **persist**.
5. The user stays in charge. Agent actions are visible and undoable, and the agent can be switched off.

**Non-goals (v1)**

- Multi-user collaboration or real-time co-editing between people.
- Remote sync. It is designed for here and built later.
- Exposing the guide to agents that are not on the page. That needs a remote MCP server; see §15.
- Changing the science content or its accuracy rules.

---

## 2. Platform constraints (checked 2026-09-27)

These facts shape the design. Sources are listed in §18.

| Fact | Design consequence |
| --- | --- |
| ChatGPT supports WebMCP only in the **desktop app's built-in browser**, for ChatGPT Work and Codex. It requires **GPT-5.6 Sol or GPT-6 Sol**; Luna has it disabled. It is **not available in Enterprise/Edu** and depends on rollout. | Most visitors will never see the tools. Every feature needs a human UI, and the tools must be a thin layer on top. |
| Tools are JavaScript functions registered on the **top-level page**. Tools inside **iframes are not discovered**. The **declarative (HTML form) API is not supported** in ChatGPT. | Register tools from `main.ts`. If the guide is ever embedded in another site through an iframe, the tools disappear. Don't rely on forms. |
| WebMCP has **tools only**: no MCP resources, prompts or skills. The page cannot push events to the agent. | Content is served through read-only tools. User activity is exposed through a polled `get_context` with a cursor. |
| Tools belong to the page that registered them. "Tools used on one page won't automatically be available on others." | **No full-page navigations.** Routing stays hash-only, inside one document. |
| ChatGPT treats tool definitions and results as **untrusted content**. It reviews each request before running it and asks for confirmation on consequential actions (purchases, deletions, permissions). | Results are factual data, never instructions. Deletes are soft and restorable, so they are low-stakes. The `help` card is reference data. It is not a "skill". |
| The API is `document.modelContext.registerTool(tool, { signal })`, which **returns a Promise** that rejects on a duplicate or invalid name, a denied `tools` policy or an agent cluster that is not origin-keyed. Unregister by aborting the signal. The ChatGPT example returns a **plain object** and sets `annotations: { readOnlyHint: true }`. The spec serializes any JSON value as the result. | Feature-detect `document.modelContext` first, then `navigator.modelContext`, because older drafts used it. Await every registration; results are plain objects (§2.1). |
| Users can turn site tools off in ChatGPT under **Settings > Browser > Permissions**. | We add our own in-page switch as well (§12). |

**Spike questions (Stage 1, day 1):**

- Plain object or `content[]` results?
- Does `readOnlyHint` change how calls are reviewed?
- Is `$ref` supported inside `inputSchema`? Until this is confirmed, inline everything.
- Do tools stay registered after hash changes?
- Is OPFS available in the ChatGPT browser? This one blocks Stage 3.

**Spike status (2026-09-28): still pending.** Stage 1 was built without access to the ChatGPT desktop browser, so none of the questions above has an answer yet. Until the spike runs, Stage 1 makes the safe choices and keeps each one switchable:

- Results are plain objects. This is now decided (§2.1); the `content[]` mode and `?agent-result=content` are gone.
- Read tools set `annotations: { readOnlyHint: true }`; write tools set it to `false`. The full set of hints is in §6.
- Input schemas are fully inlined (no `$ref`), with `additionalProperties: false`.
- Routing uses `history.replaceState` on the hash only, so the document never changes.

**Stage 3 spike results (2026-09-28, `@sqlite.org/sqlite-wasm` 3.53.4-build1):**

| Question | Answer |
| --- | --- |
| Does sqlite-wasm with `opfs-sahpool` load from the single-file build? | **Yes.** The build bundles `src/store/worker.ts` (sqlite JS + our engine) as an IIFE string, embeds `sqlite3.wasm` gzipped and base64-encoded inside it, and the page starts it from a Blob URL. Checked in Chromium 152 (the Claude desktop browser pane) and in headless Chrome: first boot 80–330 ms including gunzip, wasm compile and opening OPFS. |
| Does the init accept an embedded binary? | Use Emscripten's **`instantiateWasm`** hook with the decompressed bytes. `wasmBinary` alone is not enough: Emscripten still evaluates `new URL("sqlite3.wasm", import.meta.url)`, which throws in a Blob worker. |
| Does data survive? | Yes: across reloads, across a full browser restart (fixed Chrome profile), and across six reloads that re-open the store as early as `DOMContentLoaded`. |
| Second tab | The Web Lock (`pa-db`, `ifAvailable`) sends it to memory mode with reason `other-tab`. |
| `file://` | Chrome starts the Blob worker; the store runs in memory mode (reason `file`). Other browsers are untested. |
| Can the page detect OPFS support? | Only partly. `createSyncAccessHandle` exists **only inside workers**, so the page checks `navigator.storage.getDirectory` and the worker falls back to memory if the pool cannot be installed. |
| Hazard found | When `installOpfsSAHPoolVfs()` cannot acquire a file handle, sqlite-wasm calls `removeVfs()`, which **deletes the pool directory, database included**. The worker therefore first opens and closes every pool file itself, retrying for up to 2 s; only then does it install the VFS. We could not reproduce the race in Chrome, so this is a guard, not a fix for an observed bug. |
| COOP/COEP | Not needed. The SharedArrayBuffer-based `opfs` and `opfs-wl` VFSes are disabled through `sqlite3ApiConfig`, which also silences their startup warnings. |
| ChatGPT desktop browser | **Not yet checked.** Run the checks in `IMPLEMENTATION_PLAN.md` Stage 3 there. |

### 2.1 Review follow-up (2026-09-28)

The review in [`reviews/2026-09-28`](reviews/2026-09-28/README.md) checked the adapter against the current WebMCP draft (`webmcp.md`, items G1–G12) and against tool-design practice (`tool-design.md`, R1–R11). What changed, and what was left:

| Item | Decision |
| --- | --- |
| G1 `registerTool` returns a Promise | `registerTools` awaits every registration with `Promise.allSettled`, logs each refusal by tool name (ChatGPT rejects with an empty `{}`), and on any refusal aborts the controller so no partial list stays registered. `startAgentSurface().registered` is a Promise. The `?agent=shim` polyfill's `registerTool` is async and refuses what the spec refuses (duplicate names, names outside `[A-Za-z0-9_.-]{1,128}`, empty descriptions, an aborted signal). |
| G3, R5 annotations | See §6. `untrustedContentHint` is set on the tools that return doc text. **Check in ChatGPT that flagged results still reach the model**: the spec lets a client hide them. |
| G4, R7 schema weight | The ViewPatch is spelled out once, on `set_view`. Tour stops, `edit_blocks` inserts and a question's Show me take a loose object checked in code by `normalizeViewPatch`. zod's safe-integer bounds and `propertyNames` are dropped, and `oneOf` is written as `anyOf`. Definitions went from 33.6 KB to 26.9 KB, with some of the room spent on longer descriptions. |
| G6 budgets | Every description is at most 500 characters (a test enforces it). The `help` card is 2.5 KB (was 3.1 KB): region ids without names. |
| G8 cancellation | `execute(input, { signal })` passes the signal to the tool. ChatGPT passes none. |
| G9 result format | **Plain objects.** The spec serializes any JSON value, ChatGPT keeps objects, and MCP-B wraps plain values itself; `content[]` double-encoded JSON inside a string. |
| G11 | The `handle.unregister` path for pre-March drafts is gone. The `navigator.modelContext` fallback stays while Chrome 149 is in use. |
| G2 origin-trial token | Not in the tool layer: the build injects an origin-trial meta tag for the hosted origin (separate build work), and the token must be registered for that origin. A token cannot help a `file://` copy. |
| G5 dynamic registration on the kill switch | **Not done.** The case for it rests on one dated ChatGPT probe that saw the tool list refresh; the `agent_control_off` error already tells the agent why a write failed, and `get_context` reports `control: "off"`. Revisit if the spike confirms that ChatGPT re-reads the list. |
| G12 presence from `toolactivated` events | **Not done.** ChatGPT's `modelContext` has no `addEventListener`, and the runner already drives presence. Low value. |
| R2 tours | Split out of `walkthrough` into `start_tour` (§6.6). |
| R10 name prefixes | **Not done.** Decide by the evaluation in [`agent-evals.md`](agent-evals.md), not by rule. |

---

## 3. Key decisions, with the strongest case against each

**D1. Build on an internal `GuideApi`; WebMCP is an adapter.**
The case against: this is an extra layer, and for one host we could call the explorer directly.
Why we do it anyway: the UI, keyboard, tests, the dev shim and any future remote MCP server all need the same commands. OpenAI's own guidance says to reuse application logic rather than duplicate it in WebMCP handlers. The explorer already acts as a controller, so the API mostly exposes and names what exists.

**D2. Twelve tools, and one declarative `set_view` for everything in 3D.**
The case against: one tool with a large schema is harder for a model than small `orbit`, `zoom` and `dissolve` tools.
Why we do it anyway: the user asked for compact combined commands. A partial patch (for example "camera plus layers plus isolate") is atomic, idempotent, and a natural fit for this codebase: the UI writes state and the scene eases toward it with springs. Read-only tools stay separate from write tools so they can carry `readOnlyHint`.
Tools share an `action` parameter only when the actions share a parameter shape. Tours were split from `walkthrough` into `start_tour` for that reason: the two features shared no parameters, and the tour capability was hidden under the walkthrough name. Multi-action tools (`doc`, `window`, `quiz`) keep one annotation set for all their actions, so `doc` is marked destructive for its `delete`.
Rejected: a string DSL (`"focus v1; dissolve skull"`). It has no schema validation, so it produces more model errors and needs a second parser.

**D3. SQLite (WASM) in the browser, not IndexedDB.**
The case against: for local-only notes this is heavy. It adds about 1.3 MB of base64 WASM, a worker, and OPFS edge cases. IndexedDB would cost 0 KB.
Why we do it anyway: you want Turso or D1 later, and one SQL schema that works locally and remotely avoids a data-model rewrite. **If sync is never built, this is over-engineering (moderate confidence).** Stage 3 starts with a spike and can fall back to IndexedDB behind the same `Store` interface.

**D4. The editor is ProseMirror (Tiptap core, vanilla), with a flat schema of one top-level node per block.**
The case against: a per-block textarea editor is far simpler and maps 1:1 to rows. But while editing it shows raw `**markdown**`, so it will not feel like Linear. Linear's editor is built on ProseMirror (moderate confidence).
Why we do it anyway: WYSIWYG editing is an explicit requirement. The flat schema (lists as flat items with `indent`) keeps one node per block row, which removes the usual tree-mapping pain.
Fallback: if integration fails after 3 attempts, ship the textarea editor behind the same `BlockEditor` interface.

**D5. Blocks are the unit for everything: docs, quizzes, tours later.**
A quiz is an artifact whose blocks are `question` blocks, and a "3D view" inside a doc is a `view` block. The same `outline`, `read`, `search` and `edit_blocks` tools therefore work on all of them.

**D6. The single-file, no-network build stays the default.**
WebMCP makes no network requests (tools run in the page), and local SQLite needs none either. Remote sync is opt-in and must be disclosed in About.

---

## 4. Architecture

```
            ChatGPT agent (built-in browser)             User
                     │  WebMCP tool calls                  │ clicks, keys, edits
                     ▼                                     ▼
 src/agent/   webmcp.ts ─ tools/*.ts          src/ui/  explorer · windows · doc-editor · quiz-card · narration
                     │  validate → run → encode             │
                     └──────────────┬───────────────────────┘
                                    ▼
 src/api/     guide-api · view-api · docs-api · activity        (commands + queries, no DOM)
                     │                         │
                     ▼                         ▼
 src/scene/   brain-scene (pose, layers,    src/store/  Store interface → sqlite worker (OPFS | memory)
              dissolve, isolate)                         → remote adapter (later)
 src/model/   refs · view math · markdown ↔ blocks · quiz grading · search scoring   (pure, tested in Node)
```

**New modules**

| Path | Responsibility |
| --- | --- |
| `src/agent/webmcp.ts` | Feature-detect, await registration of every tool with an `AbortSignal`, emit annotations, and wrap each call: validate, kill switch, presence, run, kill switch again, log. |
| `src/agent/tools/*.ts` | One file per tool: name, description, zod input schema, `readOnly` and the other hints, and `run(input, api, { signal })`. |
| `src/agent/help.ts` | Builds the `help` reference card from content (ids, layers, grammar). |
| `src/api/guide-api.ts` | `outline`, `read`, `search`, `go`, `walkthrough`, `context`. |
| `src/api/view-api.ts` | Normalize a `ViewPatch`, apply it to state and scene, report the resulting view, keep a view stack for undo. |
| `src/api/docs-api.ts` | Artifacts, block ops, quizzes, attempts, windows. It calls `Store`. |
| `src/api/activity.ts` | Activity ring with `seq` cursor (memory in Stage 1, store-backed from Stage 3). |
| `src/model/refs.ts` | Parse, format and resolve refs, with suggestions. |
| `src/model/view.ts` | Yaw/pitch/zoom ↔ camera vectors, presets, frame fit, patch precedence. |
| `src/model/markdown.ts` | Markdown ↔ blocks and the inline renderer (escaped, allow-listed). |
| `src/model/quiz.ts` | Question validation and grading. |
| `src/model/search.ts` | Tokenize and score. Used for guide content and doc rows. |
| `src/store/*` | `Store` interface, worker RPC client, sqlite worker, migrations. |
| `src/ui/windows.ts` | Floating window manager, tray, slots, persistence. |
| `src/ui/doc-editor.ts` | Tiptap flat-block editor and block ↔ node sync. |
| `src/ui/quiz-card.ts` | Quiz card mode and region pick mode. |
| `src/ui/narration.ts` | Caption bar for agent tours. |
| `src/ui/agent-presence.ts` | "Assistant" pill, action toasts with Undo. |

**Changes to existing modules**

- `state.ts` gains `layers`, `layerEffect`, `isolate`, `viewFocus` and `labelMode` (§7). The existing `labels` flag becomes `labelMode !== "none"`.
- `ui/explorer.ts` exposes `snapshot()` (panel, shown region, expanded step, walking) and `showStreams()`. It accepts a step duration instead of the fixed `STEP_SECONDS`, and syncs `location.hash` through `history.replaceState`.
- `scene/brain-scene.ts` gains `pose()`, `setPose()`, `frameRegions()`, per-layer presence, the dissolve shader chunk, multi-region highlight, label modes, and `visibleRegions()`.
- `main.ts` wires the store, windows and agent adapter. Region clicks go through a pick-mode interceptor (§10).
- New dependencies, each justified: `@sqlite.org/sqlite-wasm` (D3), `@tiptap/core` + `@tiptap/pm` (D4), `marked` (a block lexer for markdown import), and `zod` v4. Zod is the single source for TypeScript types, JSON Schema (`z.toJSONSchema`) and runtime validation, so the three never drift apart.

### 4.1 Codebase changes since the first draft

These landed in parallel content and visual work. Build on them rather than on the earlier code.

| Change | Where | What it means here |
| --- | --- | --- |
| **Topic order** is now vision, touch, hearing, speech, loop, attention. Number keys 1–6 and the Attention streams (vision, touch, sound) follow it. | `content/pathways.ts`, `model/attention.ts` | `outline(guide)` lists topics in this order. A test locks it. |
| **Content expansion.** Vision gained 5 steps and 6 regions (`mt`, `it`, `ffa`, `ppa`, `eba`, `vwfa`). Touch, Hearing, Feedback and Attention were then expanded the same way: 11 more regions (`fef`, `sc`, `tpj`, `lc`, `dorsalHorn`, `s2`, `postInsula`, `belt`, `astg`, `vlpfc`, `l5`), 50 in total, and new or renumbered steps. The `insula` marker moved onto the circular sulcus. Clicking a region that appears in two steps now stays on the current step. | `content/*` | **Step numbers are not stable.** See §5.1. Region ids and counts must be derived from `regions`, never hard-coded. |
| **Placed functional areas.** Areas the atlas does not segment are placed from group MNI coordinates, snapped to an atlas mesh. The TPJ is in the right hemisphere. | `scripts/place-functional-areas.mjs`, `src/data/functional-areas.json` | `focusRegion` picks the side from the region's z sign, so `side: "right"` regions already frame correctly. |
| **Detail routes.** Routes beyond the main relay path have `detail: true` and show only inside their own topic. Visibility is one pure function. | `routeWeight()` in `model/attention.ts` | Isolate (§7.3) must go through `routeWeight`, or an isolated pair from another topic shows no route. |
| **View gap v2.** Radius 1.05. Points in front of the region are pushed out by 2.2 times how far inside the channel they sit, and fade less; points behind the region dim to about 30%. Changing the gap's region closes the gap, re-centres it and parts it again (about 1.3 s). | `scene/materials.ts` (`createViewGap`, `applyViewGap`), `gapRegion` in `brain-scene.ts` | Every `viewFocus` change replays that animation. Tours with short stops should expect it. The dissolve alpha must multiply with the gap's `vGap`/`fade`, not replace it. |
| **Label lift.** Labels near the mouse scale up to 1.28× with a shadow and come forward. It is driven by a `--lift` CSS variable from `labelProximity()`, and is off while dragging, on touch and with reduced motion. Mouse hover no longer changes the border; `:focus-visible` still does. | `model/callouts.ts`, `.region-label` in `styles.css` | Label modes (§7.4) and pick mode (§10) inherit it. Windows are siblings of the orbit surface, so `pointerleave` already clears the lift when the pointer enters a window. |
| **Stable label sides.** A label restarts its fade only when its final column changes between frames. | `layoutCallouts` | None. |
| **Markers.** The dot (r 0.018) and wire sphere (r 0.075) are white; only the halo takes the topic colour. | `brain-scene.ts` | The `markers` layer and pick mode should keep this contrast with the coloured highlight. |
| **Context highlights.** In a topic, every region in its steps and routes keeps a steady highlight at weight 0.28; only the selected region is at 1 and pulses. Routes outside the current step dim to 0.24 (was 0.14). Highlight layers come from `highlightLayerFor(id)`, cached per anatomy key and shared by regions with the same parts. | `brain-scene.ts` (`highlightLayerFor`, `contextHighlights`, `CONTEXT_HIGHLIGHT`, `SPOT_DIM_ROUTE`) | The multi-region highlight for isolate (§7.3) should build on `highlightLayerFor` and add a third weight level, not replace this. |
| **Label press.** A mouse press keeps 85% of a label's proximity lift; only a real drag (movement over 5 px, or two pointers) turns the lift off. | `LABEL_PRESS` in `brain-scene.ts` | Pick mode inherits it. |
| **Step selection.** Selecting a region that appears in two steps stays on the current step if it matches (Hearing uses `soc` in steps 3 and 9). | `selectRegion` in `ui/explorer.ts` | `go(region:*)` gets this for free; `step:` refs are unaffected. |
| **Overview systems map.** On the plain overview every topic's regions glow faintly in its colour (a region shared by topics takes the first topic's colour); markers and labels are hidden. Pointing at a topic in the intro list or the rail sets `state.homeFocus`, which brightens that system, runs its routes and shows its labels. The map yields to a hover preview, `viewFocus` or isolate. | `brain-scene.ts` (`homeColour`, `topicLayers`, `HOME_GLOW`), `state.homeFocus`, `ui/explorer.ts` | `go(overview)` shows the map; an agent can preview a topic there by setting `homeFocus` in a later view patch field if wanted. |
| **Content accuracy audit in progress.** Independent reviewers are checking the new text; fixes will change wording in `content/*`, not ids or structure. | `content/*` | Tests and fixtures should not assert on prose. |
| **Motion helpers.** `stepWeight(motion, target, dt, reduced, smoothTime?)` and `stepPoint()` for unclamped vec3 springs. | `model/activity.ts` | Use these for presence springs and camera-free position easing. |
| **Debug hooks** (installed only with `?debug` or `?agent=shim`). `explorerDebug.viewGap` exposes the live gap uniforms. `labels()` includes `weight` and `fade`. `diagnostics().viewGap` reports amount, focus and radius. | `main.ts`, `brain-scene.ts` | The shim (§16) can reuse these for checks. |

---

## 5. Shared vocabulary

### 5.1 Refs

One address format is used by every tool.

```
overview                      the overview panel
about | about/papers | about/code | about/models
topic:<path>                  path ∈ vision | touch | hearing | speech | loop | attention (UI order)
topic:attention/streams       the Streams panel
step:<path>/<n>               n is 1-based, as shown in the UI
region:<id>[#section]         section ∈ summary | mechanism | role | connections | limit | sources
source:<id>
docs                          the user's artifacts
doc:<id> | quiz:<id>          an artifact
block:<id>                    one block (ids are unique across artifacts)
help                          agent reference card
```

- Refs are case-insensitive.
- A bare word that is exactly one topic id or one region id resolves as that ref: `vision` is `topic:vision`, `V1` is `region:v1`, `v1#role` is `region:v1#role`.
- Extra segments are rejected (`step:vision/2/x`, `region:v1#role#x`), with the ref without them as the suggestion.
- An unknown ref returns `unknown_ref` with up to 5 suggestions. Suggestions are ranked by edit distance on ids and by substring matches on labels. For example, `region:visual cortex` suggests `region:v1` and `region:extrastriate`.
- **Fields that accept only regions take region ids**, listed as an enum in the schema, for example `isolate: ["v1", "lgn"]`. They also accept `V1` and `region:v1`, since an agent that just used `go(region:v1)` will pass that form. Another kind of ref in a region field gets an error saying so. Fields named `ref` take refs.
- Guide text rewrites `[[v1|primary visual cortex]]` as `[primary visual cortex](region:v1)`. Agents read these as normal links and can pass the ref straight to `go`.
- **Step numbers shift when content changes** (the expansion in §4.1 renumbers Touch, Hearing, Feedback and Attention). Live tool calls can use `step:<path>/<n>`, but anything stored (doc `view` blocks, quiz `ref`s, saved tours, the hash) should store a stable form. Proposal: give each `Step` a `key` slug in content (for example `step:vision/parallel-channels`), accept both forms in `refs.ts`, and always store the key. A test checks that keys are unique per topic.

### 5.2 Layers

`LayerId` covers the scene objects that already exist. Presence runs from 0 (gone) to 1 (normal). It **multiplies** the opacity rules that are already there, so topic gating keeps working (for example, ears appear only in hearing).

| Layer | Scene objects today | Notes |
| --- | --- | --- |
| `skull` | skull points | also follows `state.skull` |
| `cortex` | cortex surface mesh + cortex point cloud | `xray` sets the base level |
| `cerebellum` | point group `lower` | |
| `brainstem` | point group `stem` | a layer, not the region of the same name |
| `deep` | surface `deep` + deep cloud | thalamus, geniculate bodies, colliculi |
| `eyes`, `optic` | point groups `eye`, `optic` | vision gated |
| `ears`, `auditory_nerve`, `temporal_bone` | `ear`, `auditory-nerve`, `bone` | hearing gated; `temporal_bone` also follows `state.bones` |
| `routes` | route lines + flow particles | always fade, even when the effect is dissolve (lines don't dissolve well) |
| `activity` | activity clusters | |
| `markers` | marker dots, halos, wire spheres | dot and wire sphere are white; the halo takes the topic colour |
| `labels` | callout labels + leaders | see `labels` mode; labels lift toward the mouse (§4.1) |
| `floor` | orbit ring + specks | |

`get_context.view.gated` lists layers that are hidden by the current topic, so the agent knows why a layer with presence 1 is invisible.

### 5.3 View spec (`ViewPatch`)

This one type is used by `set_view`, tour stops, `view` blocks and quiz "Show me" links. Only `set_view` spells it out in its JSON Schema. The others take a plain object that the view API's own rules (`normalizeViewPatch`) check, with the same forgiving region ids, so every entry point accepts exactly the same patches.

```ts
type Side = "front" | "back" | "left" | "right" | "top" | "bottom";
interface ViewPatch {
  camera?: {
    reset?: boolean;            // back to the overview framing
    focus?: RegionId;           // one region, from its preset side (same as selecting it)
    frame?: RegionId[];         // fit 1–12 regions in view
    from?: Side;                // anatomical side
    yaw?: number;               // absolute degrees: 0 front, 90 left, -90 right, 180 back
    pitch?: number;             // absolute degrees: 90 top; clamped to [-59, 89]
    orbit?: [number, number];   // relative [yaw, pitch] degrees
    zoom?: number;              // 1 = overview distance; 2 = twice as close; clamped to [0.66, 7.4]
  };
  layers?: Partial<Record<LayerId, number>>;   // presence 0–1
  effect?: "dissolve" | "fade";                // how layer changes render; default "dissolve"
  isolate?: RegionId[] | { regions: RegionId[]; keep?: number } | null;   // keep = context left, default 0.08
  labels?: "auto" | "focus" | "all" | "none";
  spotlight?: boolean;
  xray?: boolean;
  motion?: "smooth" | "instant";               // reduced motion forces instant
}
```

**Camera precedence** within one patch runs in this order: `reset` → `focus` / `frame` (these set the target) → `from` / `yaw` / `pitch` (absolute direction) → `orbit` (relative) → `zoom`. Fields that are left out keep their current values. `focus` and `frame` are mutually exclusive (`bad_input`).

---

## 6. Tool catalog

**Conventions**

- Results are compact JSON. Defaults and nulls are omitted.
- Every write tool returns `said`, a one-line summary for the user and the agent (for example, "Framed LGN and V1 from the left at 1.4×; skull dissolved"), plus the new state fragment so the agent can verify it.
- Errors are **returned, not thrown**: `{ error: { code, message, options? } }`. The codes are `bad_input`, `unknown_ref`, `not_available`, `stale_rev`, `locked_by_user`, `limit`, `agent_control_off`, `store_unavailable` and `internal` (a bug in the page, not in the call). Docs errors can add `id`, `op`, `current` or `max`. The `help` card says what each code asks of the agent.
- The commonest slips get messages that say how to fix them: a missing `rev`, a quiz `answer` of the wrong shape, another kind of ref in a region field. Pointers to the reference card use one syntax, `read({ ref: "help" })`.
- Lists take a `limit` (default 20, max 100) and return a `cursor`, with `more: true`, while more remains.
- Target size for a typical result is **under 2 KB**; the `help` card is allowed 2.5 KB.
- **Descriptions** (what the agent sees) say what the tool does, which neighbouring tool to use instead and when, and, for `set_view`, `quiz`, `edit_blocks` and `start_tour`, give a worked example that a test runs through validation. Each is at most 500 characters (Chrome's guideline), without em-dashes.
- **Parameter names mean one thing.** `ref` is always the target of the action; a question's Show me place is `show_me.ref`. `show` is the boolean for showing what was created; `open` is only an action. `slot` is a window position; `at` in results is always the current place.

**Annotations.** WebMCP defines `readOnlyHint`, `untrustedContentHint` and `consequentialHint`; MCP bridges such as MCP-B also read MCP's `destructiveHint`, `idempotentHint` and `openWorldHint`, and browsers ignore members their WebIDL does not define. Every tool sends the WebMCP three and `openWorldHint: false` (nothing leaves the page); write tools also send `destructiveHint` and `idempotentHint`. `consequentialHint` stays false: deletes are soft, restorable for 30 days and undoable.

| Tool | readOnly | untrustedContent (returns doc text) | destructive | idempotent |
| --- | --- | --- | --- | --- |
| `get_context`, `outline`, `read`, `search` | ✓ | ✓ | – | – |
| `go`, `window` | | | false | **true** |
| `walkthrough`, `start_tour`, `set_view`, `quiz` | | | false | false |
| `doc`, `edit_blocks` | | ✓ | **true** | false |

| # | Tool | Read-only | One-line description (what the agent sees) |
| --- | --- | --- | --- |
| 1 | `get_context` | ✓ | What the user sees now and what happened since the last call; call it at the start of each turn. Points to `outline()` and `read({ ref: "help" })`. |
| 2 | `outline` | ✓ | What is inside a ref, one level down: topics, a topic's steps and regions, the user's docs (`docs`, the way to find a doc's ref; `deleted: true` lists deleted ones), a doc's blocks with revs. Docs and blocks carry `by` (user or agent) and `imported`. |
| 3 | `read` | ✓ | The text at a ref. `detail` per kind: guide refs brief, full, sources; doc and quiz refs brief, full, markdown, results. |
| 4 | `search` | ✓ | Find guide content and the user's docs by keyword; a search with no hits returns a hint with the closest refs. |
| 5 | `go` | | Show a place: the panel and the camera move together. Doc refs open a window; `quiz open` lets the user take a quiz; `set_view` changes only the 3D view. |
| 6 | `walkthrough` | | Play, pause, next, prev, restart or stop a topic's built-in walkthrough; the same verbs control a running tour. |
| 7 | `start_tour` | | Play the agent's own narrated stops: a place, a view patch and a caption each. |
| 8 | `set_view` | | Change only the 3D view in one call: camera, layer presence with dissolve/fade, isolate, labels. Only passed fields change. |
| 9 | `doc` | | Create (from markdown), rename, delete (restorable 30 days), restore or download a doc; names the tools for listing, reading, editing and showing it. |
| 10 | `edit_blocks` | | Batch block edits on one doc or quiz in one transaction. Updates need the block's `rev`. |
| 11 | `window` | | Open, close, minimize, restore, focus, place or tile the floating windows. A quiz ref opens its question list for editing. |
| 12 | `quiz` | | Create a quiz and show it in a card; open, close or reset one. Graded in the page. |

### 6.1 `get_context`

```ts
input:  { since?: string }   // the cursor from the previous call, "<epoch>.<seq>"
```
```json
{
  "at": "step:vision/4", "title": "Primary visual cortex (V1)", "panel": "walkthrough",
  "selected": "v1", "animating": false, "walking": false,
  "view": { "focus": "v1", "yaw": -152, "pitch": 12, "zoom": 1.06, "layers": { "skull": 0.1 }, "gated": ["ears", "auditory_nerve", "temporal_bone"] },
  "windows": [{ "ref": "doc:k3f9", "title": "Vision notes", "state": "open", "focused": true }],
  "editing": "block:b7x2k",
  "selection": { "ref": "step:vision/4", "text": "Only ganglion cells send output to the brain." },
  "tour": { "stop": 3, "of": 7, "paused": true },
  "activity": [{ "seq": 41, "by": "user", "kind": "answered", "ref": "block:q2", "ok": false, "ago_s": 12 }],
  "cursor": "mfx3k2a.41",
  "store": "local"
}
```

The activity log records user navigation, user block edits, quiz answers, window changes, and user orbit/zoom (debounced to 1 s, coalesced). Hovers are not logged because they are too noisy. Each call returns at most 30 entries.

- `walking`: a walkthrough is playing. `animating`: the 3D signal animation runs (Space pauses it).
- `seq` restarts at 1 on every page load, so the cursor carries the load's `epoch`. A cursor from an earlier load (or anything that is not a cursor) returns the latest entries and a `reset` note instead of silently skipping what happened after the reload.

### 6.2 `outline`

```ts
input: { ref?: string /* default "guide" */, limit?: number, cursor?: string }
```

| ref | Returns |
| --- | --- |
| `guide` | `overview`, the 6 topics `{ ref, title, steps }`, `about`, `docs { count }` |
| `topic:*` | `{ steps: [{ ref, title, region }], regions: [...], also: [...] }` (walkthrough regions, then route-only regions, as in `topicRegions`) |
| `region:*` | available sections, the topics it appears in, and its steps |
| `docs` | `[{ ref, kind, title, blocks, updated, open }]`, newest first; the description names this as the way to find a doc's ref |
| `doc:*` / `quiz:*` | `{ rev, blocks: [{ id, type, text /* first 80 chars */, rev }] }`, the compact block list |
| `help` | same as `read help` |

### 6.3 `read`

```ts
input: { ref: string, detail?: "brief" | "full" | "sources" | "markdown" | "results" }
```

| Kind | brief (default) | full | sources | other |
| --- | --- | --- | --- | --- |
| topic | subtitle + intro | + summary (`insight`), caveat, step titles | topic sources with URLs | |
| step | title + body | + key fact, signal route in words ("retina → chiasm → LGN"), region brief | region guide sources | |
| region | summary + where | all sections; the role in the current topic (or all roles, if not in a topic) | guide sources | `#section` reads one section |
| doc / quiz | title + outline | every block `{ id, type, md, rev, data? }` | | `markdown`: the export text; `results`: quiz attempts |
| help | reference card: ref grammar, topics, every region id (50 today; generated from `regions`), details, the view patch in brief, limits, a task-to-tool map, and what each error code asks for; about 2.5 KB | | | |

Bundled fact-check verdicts could be added to `full` later (§15).

### 6.4 `search`

```ts
input: { query: string, scope?: "guide" | "docs" | "all", limit?: number /* default 10 */ }
```
```json
{ "hits": [{ "ref": "region:pulvinar", "title": "Pulvinar", "snip": "…coordinates activity between cortical areas…" }] }
{ "hits": [], "hint": "No matches for \"pulvinr\". Closest refs: region:pulvinar. Try fewer or different keywords, or browse with outline()." }
```

- `query` is keywords, not a question. Words match as prefixes; there is no spelling correction, which is why a search with no hits names the closest refs (`noMatchesHint` in `guide-content.ts`, shared by guide and doc search). An empty `snip` is left out.

One scorer (`model/search.ts`) handles both sources.

- **Guide:** an in-memory index built at startup. Field weights: title 3, fact 2, body 1. Prefix matching is on.
- **Docs:** the store returns live block rows and the same scorer ranks them.
- This is enough for up to a few thousand blocks. FTS5 is the upgrade path.

### 6.5 `go`

```ts
input: { ref: string, camera?: boolean /* default true */ }
```

- Maps to the existing explorer calls: `showIntro`, `selectPath`, `setStep`, `showRegion`, and `showStreams` (new).
- `about*` opens the About dialog on that tab.
- `doc:` and `quiz:` open or focus their window. `block:` opens its window, scrolls to the block and flashes it.
- A running walkthrough or tour stops, which matches the UI.

It returns `{ at, title, brief, view, said }`, so the agent does not need a second read.

### 6.6 `walkthrough` and `start_tour`

```ts
walkthrough: {
  action: "play" | "pause" | "next" | "prev" | "restart" | "stop";
  ref?: string;          // play and restart: a topic or step; default the current topic
  seconds?: number;      // play and restart: per step, 3–20, default 5.5
}
start_tour: {
  stops: { ref?: string; view?: ViewPatch; say?: string /* ≤280 */; seconds?: number /* 2–30 */ }[]; // 1–20
  seconds?: number;      // for stops without their own, 2–30, default 6
}
```

- `start_tour` runs the stops in order. At each stop: `go(ref)`, then `set_view(view)`. The `say` text shows in a narration bar at the bottom of the stage ("Assistant tour · 3/7", with pause, skip and close). Every stop is checked before the first one plays.
- Any user orbit, click or key **pauses** the tour; it does not stop it. `get_context.tour` reports progress.
- While a tour runs, `walkthrough` `pause`, `play`, `next`, `prev`, `restart` and `stop` control the tour. `play` or `restart` with a `ref` or `seconds` starts a walkthrough instead, which ends the tour; so does `go`.
- `play` reuses the existing timer and progress-dot fill. The only change is that `seconds` replaces `STEP_SECONDS`.
- Each tool checks `seconds` against its own range: 3–20 per walkthrough step, 2–30 per tour stop.

### 6.7 `set_view`

```ts
input: ViewPatch   // §5.3
```
```json
{ "view": { "frame": ["lgn", "v1"], "yaw": 90, "pitch": 10, "zoom": 1.4, "layers": { "skull": 0, "cortex": 0 }, "isolate": { "regions": ["lgn", "v1"], "keep": 0.08 } },
  "said": "Framed LGN and V1 from the left at 1.4×; dissolved everything else." }
```

- If the user is mid-gesture (OrbitControls between `start` and `end`), the camera part returns `locked_by_user` and the rest of the patch still applies.
- Each call pushes the previous view onto a 10-deep stack, so the agent's toast offers **Undo** ("Back to previous view").

### 6.8 `doc`

```ts
input:
  | { action: "create"; title: string; markdown?: string; show?: boolean /* default true: open it in a window */ }
  | { action: "rename"; ref: string; title: string }
  | { action: "delete" | "restore" | "download"; ref: string }
```

- `create` parses the markdown into blocks (§9.2) and returns `{ ref, blocks: [{ id, type, text, rev }] }`.
- `delete` is soft and returns `{ said, restore: "doc({ action: 'restore', ref })" }`.
- `download` saves `<slug>.md`. If the browser blocks a download that wasn't started by a user gesture, the window shows a **Download ready** button and the tool returns `{ said: "Download ready in the window" }`. The agent can always get the text with `read(detail: "markdown")`.

### 6.9 `edit_blocks`

```ts
input: {
  ref: string;   // doc:* or quiz:*
  ops: (                                                          // 1–50, applied in order, one transaction
    | { op: "insert"; after?: string /* block id | "start" | "end" (default) */; md?: string; view?: "current" | ViewPatch; question?: Question /* show_me or stored ref/view */ }
    | { op: "update"; id: string; md: string; rev: number }
    | { op: "replace"; id: string; find: string; with: string; rev: number }   // exact, first match
    | { op: "delete"; id: string }
    | { op: "move"; id: string; after: string }
    | { op: "set"; id: string; data: object; rev: number }          // code {lang}, to-do {checked}, callout {tone: note|tip|warning}, view, question
  )[];
}
```
```json
{ "rev": 13, "changed": [{ "id": "b2q9x", "rev": 4 }], "inserted": [{ "id": "b8m1c", "type": "p", "text": "The LGN…", "rev": 1 }], "deleted": [] }
```

- An `insert` with `md` can contain several blocks, and they are inserted in order.
- `view: "current"` captures the live view as a `view` block.
- **A stale `rev` rejects the whole batch** with `stale_rev { id, current: { rev, md } }`.
- A block the user is editing (focused, and typed in within the last 5 s) returns `locked_by_user`.
- Deletes keep history, and block Undo works from the agent toast.

### 6.10 `quiz`

```ts
type ShowMe = { ref?: string; view?: ViewPatch };   // where Show me goes after the answer
type Question =
  | { kind: "choice"; prompt: string; choices: string[] /* 2–6 */; answer: number[]; explain?: string; show_me?: ShowMe }
  | { kind: "truefalse"; prompt: string; answer: boolean; explain?: string; show_me?: ShowMe }
  | { kind: "region"; prompt: string; answer: RegionId[]; choices?: RegionId[]; explain?: string; show_me?: ShowMe }  // click the brain
  | { kind: "order"; prompt: string; items: string[] /* 3–8, correct order; shuffled on display */; explain?: string; show_me?: ShowMe }
  | { kind: "recall"; prompt: string; answer: string; explain?: string; show_me?: ShowMe };  // self-graded
input:
  | { action: "create"; title: string; questions: Question[] /* 1–30 */; show?: boolean /* default true */ }
  | { action: "open" | "close" | "reset"; ref: string }
```

- A `choice` question with more than one index in `answer` renders as multi-select.
- Prompts are at most 300 characters and support inline markdown and region links. `explain` is at most 2,000 characters, and each question must fit in one 8,000-character block as stored; the schema checks both, so a valid call never fails in the store.
- The tool input names the Show me destination `show_me`, so it cannot be mistaken for the quiz's own `ref`. It is stored as the question's `ref` and `view`, which is what `read(full)` returns; `edit_blocks` accepts either form.
- To edit questions after creation, use `edit_blocks` (`set` on a question block).
- `read(ref, "results")` returns `{ summary: { answered, correct, of }, questions: [{ id, kind, attempts, correct, last }] }`.

### 6.11 `window`

```ts
input: {
  action: "open" | "close" | "minimize" | "restore" | "focus" | "place" | "arrange";
  ref?: string;                                           // doc:* | quiz:* | block:*
  slot?: "left" | "right" | "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  size?: "s" | "m" | "l";
  layout?: "tile" | "stack";                              // for arrange
}
```

The agent never deals in pixels. Named slots and sizes are resolved against the stage rectangle.

---

## 7. Canvas control

### 7.1 Coordinates and camera model

Scene axes are derived from `focusRegion` presets and the test that places the right medulla at `z < 0`. **Verify them in Stage 2's first test:**

- anterior (front) is **−X**, posterior (back) is **+X**
- superior (top) is **+Y**
- left is **+Z**, right is **−Z**

Agent-facing angles:

- `yaw` is the camera direction around Y, measured from the front toward the left: `dir = (−cos yaw, ·, sin yaw)`.
- `pitch` is elevation.
- OrbitControls limits the polar angle to `[0.001, 0.83π]`, so **pitch is clamped to [−59°, 89°]**. "bottom" means pitch −59°, and the model can't be seen from directly below.

| Side | yaw | pitch |
| --- | --- | --- |
| front | 0 | 10 |
| left | 90 | 10 |
| right | −90 | 10 |
| back | 180 | 10 |
| top | 0 | 88 |
| bottom | 0 | −59 |

**Zoom:** `distance = homeDistance / zoom`, clamped to the controls' `[1.6, 18]`. With the skull shown, `homeDistance ≈ 11.9`, so zoom runs from about 0.66 to 7.4.

- **Gotcha:** the existing zoom fade starts below 0.92 × home, which is zoom > 1.09. It is complete at 0.5 × home, which is zoom ≥ 2.
- So zooming in already dissolves the skull and cortex on its own. `get_context.view.layers` reports the **effective** presence, so the agent isn't surprised.

**Focus:** reuse `focusRegion(id, true)` exactly, with its lookAt and per-region preset directions. Presets now include a view from below for areas on the underside of the temporal lobe (`ffa`, `ppa`, `vwfa`, `it`) and a posterior-lateral view for `mt` and `eba`; the side follows the region's hemisphere. It sets `state.viewFocus`, which drives the highlight and view gap without changing the step or panel. This is a persistent version of what `previewRegion` does. The next navigation clears it.

**Frame:**

- target = centroid of the region positions
- radius = the largest distance from the centroid + 0.4
- distance = radius / sin(vfov / 2) × 1.15, using `camera.fov` after `resize()`
- the direction is the current direction, or `from`/`yaw`/`pitch` if they are given

**Scene API additions:**

```ts
pose(): { target: Vec3; yaw: number; pitch: number; distance: number; zoom: number };
setPose(pose: Partial<{ target: Vec3; yaw: number; pitch: number; distance: number }>, instant?: boolean): void;  // wraps animateCamera
frameRegions(ids: RegionId[]): { target: Vec3; distance: number };
visibleRegions(): { id: RegionId; x: number; y: number }[];   // from the marker projection already computed each frame
```

**Rules to preserve:**

- Agent camera moves set the `userOrbited` equivalent, so overview auto-rotate stops.
- They update `contextDistance = distance / 0.94`, so the next step focus keeps the agent's zoom.
- A user gesture cancels an agent camera animation. This already happens through `focusStarted = -1`.

### 7.2 Layer presence and the dissolve effect

- State: `layers: Record<LayerId, number>` (default 1) and `layerEffect: "dissolve" | "fade"`.
- Each layer has its own presence spring (`createWeight` / `stepWeight`), so changes ease like everything else. There is **no duration parameter**, which keeps the feel consistent and the API small.
- Target presence = `layers[id]` × isolate factor (§7.3).

**Point materials** (`pointMaterial`, `skullPointMaterial`) get a `presence` and a `dissolve` uniform, **per material, not in the shared view-gap uniforms**.

- Each point gets a stable seed from a hash of its object-space position, `fract(sin(dot(p, k)) * 43758.5)`.
- In dissolve mode, `alpha *= smoothstep(seed − 0.06, seed + 0.06, presence)`. Points within 0.06 of the threshold get a small brightening ("ember") so the edge reads as dissolving rather than dimming.
- In fade mode, `alpha *= presence`.

**Surface materials** (MeshPhong) use the same threshold on a hash of `floor(vGapWorld * 40)`, which gives cell-sized flakes.

- **Gotcha:** `applyViewGap` already owns `onBeforeCompile`. Compose both injections in one hook, and set `customProgramCacheKey`. Otherwise three.js can reuse the wrong program across materials.

**Routes** fade (they use `LineBasicMaterial`). Activity, markers and labels use their existing opacity paths, multiplied by presence.

With reduced motion, the springs snap (`stepWeight(..., reduced)` already does this), so there are no animated dissolves.

### 7.3 Isolate

`state.isolate: { regions: RegionId[]; keep: number } | null`

**Highlights:** a multi-region highlight.

- `highlightLayerFor(id)` already returns one cached layer per anatomy key, and topic regions already sit at the context weight (0.28, §4.1). Add isolated regions as a set at weight 1 alongside `selectedHighlight`; while isolate is on, context highlights outside the set go to `keep`.
- The selected region stays emphasized too.

**Anatomy layers:** target presence = `min(layers[id], keep)`, using the current `layerEffect`.

**Routes:**

- Kept only if both ends are in the set. Compute visibility through `routeWeight()` with an isolate override, so detail routes from another topic can appear when both of their ends are isolated.
- All other routes go to `keep`. This reuses the spotlight machinery by overriding `spotRoutes` and `spotRegions` while isolate is on.

**Markers and labels:** only isolated regions show them, whatever the topic's label rules. Isolated regions that are not in the current topic still get markers and highlights, because both exist for every region id.

**View gap:** stays on `viewFocus ?? selected`. With isolate on, the surrounding anatomy is already mostly gone, so one gap focus is enough. Any change of that focus replays the gap's close, re-centre and re-open sequence (§4.1).

### 7.4 Label modes

| Mode | Shows |
| --- | --- |
| `auto` | today's rules (per-topic label sets, with lift near the mouse) |
| `focus` | selected + isolated regions only |
| `all` | every visible marker |
| `none` | no labels (`state.labels = false`) |

---

## 8. Floating windows

**Placement and pointer events**

- One `#windows` layer inside `.brain-stage`, as a **sibling of `#orbit-surface`**. Pointer events on windows never reach OrbitControls.
- The layer is `pointer-events: none` and each window is `auto`.

**Anatomy of a window**

- A header with a kind icon, the title, save state ("Saved", "Not saved"), and minimize, download and close buttons.
- The body, and a resize grip.
- Quiz windows default to size `s` in card mode.

**Moving and resizing**

- Dragging uses pointer capture on the header.
- Windows are constrained so at least 48 px stays inside the stage.
- Slots and sizes: `s` 320×380, `m` 440×540, `l` 600×min(760, stage − 40).

**Stacking and minimizing**

- Focusing a window raises it.
- At most 8 windows are open; the oldest one auto-minimizes.
- Minimized windows become chips in a tray at the bottom-left of the stage.

**Persistence:** geometry and state go in the `windows` table and are restored on load.

**Mobile (width < 720 px):**

- Windows become bottom sheets, one at a time, with no dragging.
- The quiz card docks above the inspector drawer.

**Accessibility:**

- Each window is `role="dialog"` with `aria-modal="false"` and a labelled title.
- Esc minimizes the focused window.
- Alt+Shift+arrow keys move it by 16 px. Focus returns to the opener.
- Agent actions are announced through the existing `#toast` live region.

**Known v1 limit:** windows can cover callout labels. `layoutCallouts` does not know about windows yet.

*As built (Stage 4):* slots start 16 px below the stage top; the topic rail sits beside the stage, so nothing covers its top edge. Windows from an earlier visit come back on idle, and only for visitors who used docs before (a localStorage flag), so the store never boots for anyone else. The entry point for users is a **Notes** button in the dock, with a small list (new, open, delete with Undo, import). Docs are not in the URL hash; open windows come back from the store instead.

---

## 9. Docs (markdown in blocks)

### 9.1 Block types

Blocks form a flat list, and each row is one block.

| Type | Markdown | Data |
| --- | --- | --- |
| `h1` `h2` `h3` | `#`, `##`, `###` | |
| `p` | text | |
| `bullet`, `number` | `- `, `1. ` | `indent` 0–3 |
| `todo` | `- [ ] ` / `- [x] ` | `{ checked }` |
| `quote` | `> ` | |
| `callout` | `> [!note]`, `> [!tip]`, `> [!warning]` | `{ tone }` |
| `code` | fenced | `{ lang }` |
| `table` | GFM table | rendered; edited as source |
| `divider` | `---` | |
| `view` | `<!-- view {json} -->` + a readable line | `ViewPatch` |
| `question` | `<!-- question {json} -->` + readable question | `Question` |

**Inline syntax:** bold, italic, code, strike, http(s) links, and **region links** `[text](region:v1)`. Region links render as the existing `.region-mention` buttons, so the hover preview works in docs as well.

### 9.2 Markdown in and out

**Import** (from `doc.create`, `insert.md`, or a dropped `.md` file):

- `marked.lexer` produces top-level tokens, and each token becomes a block. List items become one block each, with `indent`.
- HTML comments are parsed only for the `view` and `question` metadata patterns. Other raw HTML becomes escaped text.

**Export:**

- `view` and `question` blocks write the HTML-comment metadata followed by a readable line, for example `**3D view:** LGN and V1 from the left, skull dissolved`. The markdown reads cleanly anywhere and round-trips back into the guide.
- Answers are included for quiz export.
- The first line is `<!-- perception-attention doc:k3f9 exported 2026-09-27 -->`.
- *As built:* the title follows as `# Title`, and importing a file that starts with the header takes it back as the title. A question's readable part ends with `<!-- /question -->`, so import skips it. Text that would read as block syntax ("# ", "- ", "1. ", ">", "---" at a line start) is backslash-escaped on export and unescaped on import, so export → import gives the same blocks. Known lossy cases: leading spaces on a line, blank lines inside a paragraph or list item, list indents with no parent item, and empty paragraphs.
- *As built:* in `read(full)`, `view` and `question` blocks show their caption or prompt as `md`, with the JSON in `data`. An `update` whose `md` is a plain paragraph changes only the text (a bullet stays a bullet), and list blocks keep their indent.

**Inline rendering** uses our own small renderer:

- Everything is escaped first.
- Only the allow-listed syntax is turned into HTML.
- Links must be `http(s):` or `region:`.

This matches `richText` and `linkedText` in `ui/dom.ts`.

### 9.3 Editor (Linear-style)

**Visual design**

- Body text is 15 px on a 1.6 line height, in the existing Avenir Next stack. The content column is at most 680 px wide.
- Headings are weight 600 with tight tracking. Muted meta sits under the title ("Edited 2 min ago · Assistant").
- Code uses the `--card` background. Callouts get a left accent in `--path-color`.
- There are no borders on focused blocks, only a `--hover` wash on hover.

**Editing**

- Markdown input rules: `# `, `- `, `1. `, `[] `, `> `, three backticks, `---`.
- Shortcuts: ⌘B, ⌘I, ⌘E (code), ⌘K (link).
- A `/` slash menu to pick block types.
- A block handle ⋮⋮ for drag-to-reorder and a menu: Turn into, Duplicate, Copy link (`block:` ref), Delete.
- Tab and Shift+Tab indent lists. ⌘⇧↑ and ⌘⇧↓ move a block.
- Esc enters block selection; Backspace then deletes the selection.

**Agent edits:** the block gets a 1.2 s accent wash, and a small gutter dot ("Edited by assistant") stays until the user focuses that block.

**Sync:**

- **Editor → store:** changed top-level node ids are collected per transaction, debounced 400 ms, and written with `rev + 1`. The user is the local authority, so there is no rev check.
- **Store → editor:** agent ops replace the node with that id in a transaction. The user's own block is protected by `locked_by_user` (§6.9).

**Title:** editable at the top. It maps to `artifacts.title`.

**Question blocks inside docs** render as small inline quiz cards. This comes free from D5.

*As built (Stage 4):* Tiptap core with the flat schema in `src/editor/schema.ts`; the textarea fallback was not needed. Store changes by others are applied as the smallest step (attributes in place, only the changed stretch of text), so the cursor keeps its place even in the block that changed. The lock covers unsaved blocks and the block the user typed in within 5 s. Esc selects the block; a second Esc minimizes the window (ProseMirror swallows Escape, so the editor passes it on). Question blocks show a read-only preview until Stage 5's inline card replaces it (`renderQuestion`).

---

## 10. Quizzes

A quiz is an artifact of `kind: "quiz"`. Its blocks are optional intro paragraphs plus `question` blocks.

**Card mode** (the draggable overlay):

- One question at a time, with progress dots in the style of `.step-dot`.
- Keys 1–6 choose an answer, Enter submits, → goes to the next question. **Conflict:** `ui/keyboard.ts` maps 1–6 to topics and ←/→ to steps whenever focus is not in a control. The card must handle these keys itself and stop propagation, or `setupKeyboard` must skip them while a quiz card is active.
- Feedback shows ✓ or ✗, the explanation, and **Show me**, which runs `go(ref)` and then any `view` on the question.
- The end screen shows the score and a "Retry the ones I missed" option.

**Region questions (pick mode):**

- The canvas gets a crosshair cursor, and markers show for `choices` (default: the regions of the question's topic).
- Clicking a marker or label answers. Esc cancels.
- Implementation: `main.ts` routes the scene's `onRegion` callback through `pick.active ? pick.resolve(id) : explorer.showRegion(id)`.
- **A11y fallback:** a "Choose from a list" button.

**Order questions:** drag handles, plus ↑ and ↓ buttons.

**Recall questions:** the user types an answer, reveals the model answer, then marks "Got it" or "Missed it".

**Grading** is pure (`model/quiz.ts`), and every submission writes a row to `attempts`.

**Answer keys** live in the block data. The card never renders an answer before submission. The agent can see answers through `read(full)`.

---

## 11. Persistence

### 11.1 Storage modes

| Mode | Engine | When | User-visible |
| --- | --- | --- | --- |
| `local` | sqlite-wasm, `opfs-sahpool` VFS, in a dedicated worker | secure origin (https or localhost) with OPFS | nothing; it just saves |
| `memory` | same engine, `:memory:` | `file://`, private mode, no OPFS, or docs already open in another tab | banner: "Not saved in this browser. Download docs to keep them." |
| `remote` | Turso or D1 through a small server | later, opt-in | disclosed in About |

**Why `opfs-sahpool`:** it runs only in a worker, but it needs **no COOP/COEP headers**, so it works on static hosts.

**Multi-tab:** the pool is exclusive. Take `navigator.locks.request("pa-db", { ifAvailable: true })`, and if the lock isn't available, drop to `memory` mode with a banner.

**Single-file build:**

- Bundle the worker as a string and start it from a Blob URL. The Blob inherits the page origin, so OPFS works.
- Embed `sqlite3.wasm` gzipped and base64-encoded, decompress it with `DecompressionStream`, and pass it through Emscripten's `instantiateWasm` hook (spike results in §2).

**Startup:**

- Boot the worker lazily, at first docs, quiz or doc-search use, or on idle after first paint.
- Call `navigator.storage.persist()` when the first doc is created.

### 11.2 Schema (SQLite dialect; the same schema runs on Turso/libSQL and D1)

```sql
PRAGMA user_version = 1;
CREATE TABLE artifacts (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('doc', 'quiz')),
  title       TEXT NOT NULL,
  rev         INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT NOT NULL CHECK (created_by IN ('user', 'agent')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE TABLE blocks (
  id           TEXT PRIMARY KEY,
  artifact_id  TEXT NOT NULL REFERENCES artifacts(id),
  ord          INTEGER NOT NULL,
  type         TEXT NOT NULL,
  indent       INTEGER NOT NULL DEFAULT 0,
  text         TEXT NOT NULL DEFAULT '',   -- inline markdown
  data         TEXT,                       -- JSON for view, question, code, todo, callout
  rev          INTEGER NOT NULL DEFAULT 1,
  updated_by   TEXT NOT NULL CHECK (updated_by IN ('user', 'agent')),
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX blocks_by_artifact ON blocks (artifact_id, ord) WHERE deleted_at IS NULL;
CREATE TABLE block_history (
  block_id TEXT NOT NULL, rev INTEGER NOT NULL, text TEXT NOT NULL, data TEXT,
  updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (block_id, rev)
);
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY, artifact_id TEXT NOT NULL, block_id TEXT NOT NULL,
  answer TEXT NOT NULL, correct INTEGER, answered_at INTEGER NOT NULL
);
CREATE TABLE windows (
  artifact_id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('open', 'minimized')),
  x REAL, y REAL, w REAL, h REAL, z INTEGER
);
CREATE TABLE activity (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL,
  kind TEXT NOT NULL, ref TEXT, summary TEXT
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

- **Ordering:** `ord` is an integer. An insert renumbers the following blocks in the same transaction, which is fine at 500 blocks or fewer. A fractional index is only worth it once sync exists.
- **Retention:** keep the last 20 history revs per block and the last 500 activity rows. Soft-deleted artifacts are purged 30 days after `deleted_at`, on startup. Until then the Notes list shows them under Recently deleted, with Restore. `read` of a long doc (`full` or `markdown`) returns `truncated: true` with a hint instead of the whole doc.
- **IDs:** base36 random. Artifacts get 4 characters (`k3f9`) and blocks get 5 (`b7x2k`), with a collision retry. Short ids are cheap in tokens and readable in ChatGPT's review UI.
- **Migrations:** an ordered list in `store/migrations.ts`, gated on `user_version`.

### 11.3 `Store` interface (sketch)

```ts
interface Store {
  readonly mode: "local" | "memory" | "remote";
  listArtifacts(opts: { kind?: "doc" | "quiz"; includeDeleted?: boolean; limit: number; cursor?: string }): Promise<Page<ArtifactSummary>>;
  getArtifact(id: string): Promise<Artifact | null>;                 // with live blocks
  createArtifact(input: NewArtifact, actor: Actor): Promise<Artifact>;
  updateArtifact(id: string, patch: { title?: string; deleted?: boolean }, actor: Actor): Promise<ArtifactSummary>;
  applyBlockOps(artifactId: string, ops: BlockOp[], actor: Actor): Promise<BlockOpsResult>;   // one transaction; throws StaleRev / Limit
  searchRows(): Promise<{ id: string; artifactId: string; text: string }[]>;
  recordAttempt(attempt: NewAttempt): Promise<void>;
  saveWindows(windows: WindowRow[]): Promise<void>;
  appendActivity(entry: ActivityEntry): Promise<number>;
  onChange(listener: (change: StoreChange) => void): () => void;
}
```

**As built (Stage 3):**

- Markdown is parsed in the page (`docs-api`), so store ops carry block content. Store-level ops add `restore` (undo a block delete) and `revert` (undo an edit from `block_history`), and `update` takes either a whole block or `text` alone, which keeps the type, indent and data.
- `rev` is checked only when sent. The docs API requires it from the agent; the user's editor may omit it (§9.3).
- Extra read methods: `blockHistory`, `locateBlock`, `listAttempts`, `listWindows`, `listActivity`, `getSetting`/`setSetting`. `searchRows` also returns the artifact kind and title and the block type. `mode` comes with a `reason` for the banner.
- Soft-deleted blocks keep their `ord`; `restore` puts them back there, which is exact when undo runs in reverse order.
- `block_history` has no `type` column, so `revert` restores text and data, not a type change.
- A saved database that fails to open or migrate is left untouched, and the store runs in memory with reason `failed`.
- Titles are limited to 200 characters (not in §13).

### 11.4 Remote sync (later, designed now)

- The local store stays the source of truth. The activity and block-op log doubles as an **outbox**.
- A small server exposes `POST /sync { since, ops }` → `{ ops, cursor }`. Conflicts resolve last-writer-wins per block by `(rev, updated_at)`. The losing version is kept as a duplicate block marked with a "Conflict" callout.
- **Never ship a Turso token to the page.** The server holds it: a Cloudflare Worker, a Vercel function, or **ChatGPT Sites**. Sites includes D1 (SQLite dialect, so the same schema works) and "Sign in with ChatGPT" for identity.
- Turso's own browser sync SDK may replace the custom protocol. Evaluate it when this stage starts (low confidence on its current API).

---

## 12. Shared-surface rules

- **Presence:** an "Assistant" pill at the top-left of the stage shows while a write tool runs and for 2 s after, with the last `said` line. Each write also shows a toast, with **Undo** where it applies: view stack, block history, doc restore.
- **User wins:**
  - User gestures cancel agent camera animations and pause tours.
  - Agent edits to the block the user is typing in are rejected with `locked_by_user`.
  - Agent `set_view` camera changes are rejected mid-gesture.
- **Kill switch:** About → "Let assistants control this guide", stored in `settings` (or in localStorage before the store exists).
  - When off, write tools return `agent_control_off`. Read tools keep working.
  - It is shared by every tab of the guide: a `storage` event carries a change to the other tabs, which stop their tours and hide presence.
  - A write that is still running when the switch goes off (a store boot can take seconds) does not land quietly: the runner checks again after it finishes, undoes what landed, and returns `agent_control_off`. Store writes get a second guard inside the docs API, just before they commit (part of the docs fixes).
  - Tools stay registered, because the list is static and predictable.
- **Static tool list:** all 12 tools register at startup, all or none: if the browser refuses one, the rest are unregistered and each refusal is logged by name. Tools that don't apply in the current state return `not_available` with a reason, for example Streams outside the Attention topic. We avoid `toolchange` churn: one dated probe saw ChatGPT refresh its list after registration and abort, but that is not confirmed for the current build (§2.1, G5).
- **Hash routing:** `go` and the UI keep `location.hash` in sync (`#/vision/4`, `#/region/v1`, `#/doc/k3f9`) through `replaceState`. Reload restores the place. Tools survive because the document never changes.

---

## 13. Security and privacy

- **Validate every tool input** with zod: unknown properties are rejected, and ranges and enums are enforced.
- **Limits:**
  - ≤ 200 artifacts
  - ≤ 500 blocks per artifact
  - ≤ 8,000 characters per block
  - ≤ 50 ops per `edit_blocks` call
  - ≤ 30 questions per quiz
  - ≤ 20 tour stops
  - ≤ 280 characters per caption
- **Rendering:** agent- and user-authored markdown goes through the escaped, allow-listed renderer. There is no raw HTML, no `javascript:` or `data:` links, and external links get `rel="noopener noreferrer"`.
- **Results are data:** only `help` contains usage guidance, and it is written as reference material. Doc text is user content, which may include pasted text, so the tools that return it (`read`, `search`, `outline`, `get_context`, `doc`, `edit_blocks`) carry `untrustedContentHint`. ChatGPT already treats tool results as untrusted.
- **No secrets in the page.** Remote credentials live only on a server.
- **No network by default.** The About "Code" tab keeps saying so. When sync is enabled, it says that too.

---

## 14. Performance and size budgets

**Bundle growth:**

- about 1.3 MB for sqlite3.wasm as base64 (**measured: 525 KiB**, gzipped before base64; the worker string with the sqlite JS and our engine is 760 KiB)
- about 250–350 KB for Tiptap and ProseMirror
- about 40 KB for marked (**measured: 45 KB**, plus 25 KB for the Stage 3 modules)
- about 15–60 KB for zod

`dist/index.html` goes from about 5.6 MB today to about 7.3 MB. Heavy modules are instantiated lazily. **Measured after Stage 3:** 5,648 KiB → 6,477 KiB (+829 KiB). The store worker starts only on the first docs call. **Measured after Stage 4:** 6,815 KiB → 7,199 KiB (+384 KiB; Tiptap core and ProseMirror are about 285 KiB of it).

**Frame loop:**

- Presence and isolate add O(layers + markers) work per frame.
- **No per-frame allocations.** Reuse the temp vectors, as the scene already does.
- Dissolve costs one hash per vertex in existing shaders.

**Latency targets:**

- read tools under 20 ms
- store ops under 50 ms
- `set_view` returns before the animation finishes; `said` describes the target

---

## 15. Later (not scheduled)

- **Remote sync** (§11.4) and Sign in with ChatGPT when hosted on ChatGPT Sites.
- **Saved tours:** a doc made of `view` and `p` blocks gets a "Play as tour" button, so tours need no new storage.
- **Thumbnails for view blocks.** This needs a capture right after render, or `preserveDrawingBuffer`.
- **Fact-check confidence in `read(full)`:** bundle the verdicts from `docs/science-factcheck.md`.
- **FTS5** if docs grow beyond a few thousand blocks.
- **A remote MCP server** over the same `GuideApi` content, plus a build-time `llms.txt` and markdown export. This is the only way to reach agents that are not on the page.
- **Occlusion-aware callouts,** so labels avoid open windows.

---

## 16. Testing strategy

**Pure modules** use the existing pattern: esbuild bundles the TypeScript and the test imports it from a data URL, under `node --test`.

- `refs`: parse, format, resolve, suggestions.
- `view`: yaw/pitch ↔ direction round trip for all 6 sides against the anatomical axes; zoom clamps and fade thresholds; frame fit keeps every region inside the frustum; patch precedence.
- `markdown`: round trip for every block type, including view/question comments; hostile input (HTML, `javascript:` links).
- `quiz`: validation and grading for all 5 kinds.
- `search`: ranking and field weights.
- Result compaction and size (under 2 KB for the fixture set).

**Store:** sqlite-wasm in Node, in-memory. Covers migrations, `applyBlockOps` atomicity, `stale_rev`, `ord` renumbering, soft delete and restore, and history trimming.

**Tool handlers:** run against a fake `GuideApi` (dependency injection). Covers schema fixtures (valid and invalid), error shapes, annotations, the description budget, the worked examples in descriptions (each must pass validation), registration against a spec-shaped model context (Promises, refusals, abort), and the kill switch across tabs and mid-call.

**GuideApi end to end:** the real `GuideApi`, view API, tour runner and **real explorer** (`ui/explorer.ts` on an inert DOM, `tests/support/explorer-dom.mjs`), so navigation rules are never re-implemented in a test double. Only the scene, caption bar and clocks are fakes.

**In the browser without ChatGPT:**

- `?agent=shim` installs a `document.modelContext` polyfill and `window.agentDebug.call(name, args)`.
- The same tools run in any browser, including Claude's built-in browser, for scripted checks and screenshots.
- With `?debug` or `?agent=shim`, `explorerDebug.advance()` renders frames in background tabs. `explorerDebug.viewGap`, `labels()` (with `weight` and `fade`) and `diagnostics().viewGap` help check the view gap and callouts.

**Evaluation:** the 12-task plan in [`agent-evals.md`](agent-evals.md) (headless and in ChatGPT, with negative and held-out tasks and a scorecard) replaces pass/fail acceptance as the measure of tool-design changes.

**Acceptance in the ChatGPT desktop browser** (GPT-5.6 Sol or GPT-6 Sol), one prompt per capability:

1. "What does this guide cover?" → `outline`
2. "Walk me through hearing, and stop at the MGN to explain it in more depth." → `go`, `walkthrough` or `start_tour`, `read`
3. "Show only the LGN and V1 from the left and dissolve everything else." → `set_view` with isolate
4. "Make a 5-question quiz on vision with one click-the-region question." → `quiz`
5. "Put my notes on attention in a doc, with a 3D view of the priority map." → `doc`, `edit_blocks` with `view: "current"`
6. "Find everything about the pulvinar in the guide and my notes." → `search`
7. "Fix the typo in the second paragraph of my notes." → `outline`, then `edit_blocks` `replace` with `rev`

**Existing tests keep passing, unchanged.** They now also cover topic order, detail-route visibility (`routeWeight`), label proximity and the placement of functional areas on their atlas meshes.

---

## 17. Open decisions

| Decision | Default until told otherwise |
| --- | --- |
| Hosting target: static https host, ChatGPT Sites, or own domain. This decides the remote adapter (D1 on Sites, Turso elsewhere). | static https host, local-only v1 |
| Editor: Tiptap flat-block (D4) or textarea blocks | Tiptap, with textarea as the fallback |
| Agent control default | on, with presence pill and kill switch |
| Keep the single-file, no-network promise | yes; sync is opt-in |

## 18. Sources

- ChatGPT Learn, Site tools (WebMCP): https://learn.chatgpt.com/docs/webmcp
- ChatGPT Learn, Sites: https://learn.chatgpt.com/docs/sites
- WebMCP proposal (W3C Web Machine Learning CG): https://github.com/webmachinelearning/webmcp
- Search Engine Journal, "ChatGPT Adds WebMCP Support For Interactive Websites": https://www.searchenginejournal.com/chatgpt-adds-webmcp-support/587237/
