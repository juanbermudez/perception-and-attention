# Implementation plan: agent surface over WebMCP

Spec: [`docs/agent-surface-spec.md`](docs/agent-surface-spec.md). Each stage ships on its own: it compiles, passes `pnpm check`, `pnpm lint` and `pnpm test`, and leaves the guide fully usable without an agent.

**Updated 2026-09-27 for commits up to `e5114be`.** Spec §4.1 lists what changed: topic order, detail routes, view gap v2, label lift, white markers, and an ongoing content expansion.

**Updated 2026-09-28 for `e3760b2`:** context highlights (§4.1), label press, step selection. Isolate's multi-region highlight builds on `highlightLayerFor`.

**Sequencing:** the content expansion from the other session is committed (50 regions; steps renumbered in Touch, Hearing, Feedback and Attention). Derive every region id, step count and topic list from content at runtime.

## Stage 1: Guide API and WebMCP adapter

**Goal**: An agent in the ChatGPT desktop browser can discover the guide's tools. It can read content with progressive disclosure, navigate, and run the built-in walkthroughs.

**Scope**
- Spike (first): which result format works (plain object or `content[]`), whether `readOnlyHint` affects review, whether `$ref` works in schemas, and whether tools survive hash changes. Record the answers in the spec §2.
- Code: `model/refs.ts`, `model/search.ts`, `api/guide-api.ts`, `api/activity.ts` (in memory), `agent/webmcp.ts`, `agent/help.ts`.
- Tools: `get_context`, `outline`, `read`, `search`, `go`, `walkthrough` (play, pause, next, prev, restart).
- Explorer: `snapshot()`, `showStreams()`, step duration as a parameter, hash routing.
- Content: a stable `key` slug on every `Step`; refs accept `step:<path>/<n>` or `step:<path>/<key>`, and anything stored uses the key (spec §5.1).
- UI: presence pill, action toasts, kill switch in About.
- Dev access: `?agent=shim` polyfill and `window.agentDebug`.

**Success Criteria**
- All 6 tools work through the shim in any browser, and in the ChatGPT desktop browser with GPT-5.6 Sol or GPT-6 Sol.
- Acceptance prompts 1, 2 and 6 (spec §16) succeed.
- Typical results are under 2 KB, and errors return codes with suggestions.
- Reload restores the place from the hash. Existing tests pass unchanged.

**Tests**
- refs parse, format and resolve, including suggestions for unknown ids.
- Step keys are unique per topic, and `step:<path>/<n>` and `step:<path>/<key>` resolve to the same step.
- The region enum and the `help` card are generated from `regions` (no hard-coded count).
- outline and read shapes for every ref kind and detail level.
- `[[id|text]]` is rewritten to `[text](region:id)`.
- search ranking and field weights.
- tool input validation fixtures.
- kill switch blocks write tools only.

**Status**: Complete in code (branch `webmcp/stage1`); the ChatGPT spike and the acceptance prompts in the ChatGPT desktop browser are still pending (spec §2). 45 new tests (`refs`, `search`, `guide-api`, `agent-tools`); the 5 existing test files are unchanged.

Notes for review:
- Step refs in results use the key form (`step:vision/parallel-channels`) plus `n` and `of`; `step:vision/3` is accepted everywhere.
- `go` toasts offer Undo (back to the previous place). The spec lists Undo only for views, blocks and docs.
- `go(region:*)` opens the region in the current topic if the topic covers it, else in the first topic that teaches it.
- `get_context` reports `at`, `title`, `panel`, `topic`, `step`, `n`, `of`, `selected`, `playing`, `walking`, `seconds`, `about`, `selection`, `control` and the activity page. View, windows and tour fields come in Stages 2–4.
- Doc, quiz and block refs parse; the tools return `not_available` until Stage 3.
- `read(about/papers, full)` lists source refs per topic, not all ~240 citations (that was 37 KB). Topics, steps and regions give titles and URLs with `detail: "sources"`.
- Sizes: typical results are under 2 KB (tested); `help` is about 2.8 KB and a region's `full` read up to about 2.6 KB.
- zod adds about 94 KiB (the spec estimated 15–60 KB); `dist/index.html` grows from 5635 to 5765 KiB.

## Stage 2: Canvas control

**Goal**: One compact `set_view` call moves the camera, sets layer presence with dissolve or fade, isolates regions and sets labels. Agents can also run captioned tours.

**Scope**
- `model/view.ts`: sides, yaw/pitch/zoom mapping, frame fit, patch precedence.
- `api/view-api.ts`, with a 10-deep view stack for Undo.
- Scene: `pose`, `setPose`, `frameRegions`, `visibleRegions`, per-layer presence springs, dissolve shader chunk (composed with the view gap, plus `customProgramCacheKey`), multi-region highlight, isolate, label modes.
  - The dissolve alpha multiplies with the view gap's existing `vGap` (points) and `fade` (skull) factors, and with `gapMask` on surfaces.
  - `viewFocus` feeds the existing `gapRegion` logic, so each focus change replays the gap's close, re-centre and re-open sequence (about 1.3 s).
  - Isolate computes route visibility through `routeWeight()` (`model/attention.ts`) with an isolate override, so `detail` routes from other topics can show.
  - Label modes keep the proximity lift (`labelProximity`, `--lift`) and the white markers.
  - Isolate adds a weight-1 set on top of the existing context highlights (`highlightLayerFor`, `CONTEXT_HIGHLIGHT`).
- State: `layers`, `layerEffect`, `isolate`, `viewFocus`, `labelMode`.
- Tools: `set_view`, `walkthrough` `tour` and `stop`, and the view fields in `get_context`.
- UI: `ui/narration.ts` caption bar.

**Success Criteria**
- Acceptance prompt 3 succeeds.
- The 6 sides point the camera at the anatomically correct side.
- Dissolve looks like a dissolve, and reduced motion snaps instead.
- A user gesture cancels agent camera moves and pauses tours.
- There are no per-frame allocations, and frame time is unchanged within noise.

**Tests**
- First test: verify the anatomical axes (−X front, +Y top, +Z left).
- Right-hemisphere regions (for example the planned TPJ) focus from the right; ventral areas (`ffa`, `ppa`, `vwfa`, `it`) focus from below within the pitch clamp.
- yaw/pitch ↔ direction round trip, and zoom clamps and fade thresholds.
- Frame fit keeps all regions inside the frustum.
- Patch precedence, and `focus` plus `frame` rejected together.
- Isolate route filtering, including a `detail` route from another topic.
- The existing motion tests.

**Status**: Complete in code (branches `webmcp/stage2` and `webmcp/stage2-tools`); acceptance prompt 3 in the ChatGPT desktop browser is still pending with the spike (spec §2).
- Core (`webmcp/stage2`): `model/view.ts`, `api/view-api.ts` (`createViewApi(state, scene)`: `apply`, `undo`, `current`), scene pose API, layer presence with dissolve/fade, isolate, multi-region highlight, label modes, `viewFocus`, `ui/narration.ts`. Manual access: `explorerDebug.view(patch)`, `undoView()`, `currentView()`, `routes()`, `narrate(text, stop, of)`.
- Tools (`webmcp/stage2-tools`):
  - `set_view`: a zod schema over `ViewPatch` (region, layer, side and label enums from content; `focus` with `frame` rejected), over `view-api`. Returns `{ view, said }`; mid-gesture the camera part comes back as `skipped.camera` (`locked_by_user`) and the rest applies. The toast offers "Back to previous view".
  - `walkthrough` `tour` and `stop`: `api/tour.ts` runs 1–20 stops in order (`go(ref)`, then the stop's view), 2–30 s each (default 6, or the call's `seconds`), with the caption bar. Every stop is checked before the first plays. Any user pointer down, wheel or key (not Tab or modifiers) pauses it; the bar's pause, skip and close work; `go`, a new walkthrough, `stop` and the kill switch end it. User tour actions and the natural end go to the activity log; tour navigation is not logged as the user's.
  - `get_context.view` (from `current()`: focus, yaw, pitch, zoom, effective layers, isolate, labels, gated) and `get_context.tour` (`{ stop, of, paused }`); `go` results include `view`.
  - Going home or into another topic resets `layers`, `layerEffect`, `isolate`, `labelMode` and `viewFocus` (`clearViewOnNavigate`, called by the explorer). A tour stop navigates first and applies its view after, so its own settings win.
  - `view-api` errors use Stage 1's `ApiError`/`fail`; the local `ViewError` is gone.
  - `help` lists the view grammar, angles and the tour limits.
- Tests: `tests/tour.test.mjs` (runner, fake clock), `tests/view-tools.test.mjs` (tool runner + GuideApi + view API + tour runner against a fake scene and explorer), and new fixtures in `tests/agent-tools.test.mjs`. 73 tests in all.

Notes for review:
- Four Stage 1 assertions in `tests/agent-tools.test.mjs` described the Stage 1 surface and had to change: the tool list (7 tools), the `walkthrough` action enum (adds `tour`, `stop`), `{ action: "stop" }` (now valid) and the unknown-tool example (`set_view` → `doc`).
- While a tour is active, `walkthrough` `pause`, `play`, `next`, `prev` and `restart` without `ref` or `seconds` act on the tour. With a `ref` or `seconds`, `play` and `restart` start a topic walkthrough and end the tour. The spec only lists `tour` and `stop` for tours.
- A `set_view` that only moves the camera, sent mid-gesture, returns `{ error: locked_by_user }`, since nothing applied.
- Tour stops accept only places (overview, topic, step, region, streams), not About, sources or help.
- Region fields are exact ids (schema enums), so `"V1"` is rejected with `closest: v1`; the view API itself still accepts any case.
- Inlined schemas are large: `set_view` about 4.8 KB and `walkthrough` about 5.8 KB, mostly the 50-id region enum repeated. `$ref` would shrink them once the spike confirms support. `help` is about 2.9 KB.

## Stage 3: Local store and artifacts API

**Goal**: Docs and quizzes persist in SQLite (WASM, OPFS), and agents can create, list, read, search and batch-edit blocks. A minimal read-only window shows the results.

**Scope**
- Spike (first): prove `@sqlite.org/sqlite-wasm` with `opfs-sahpool` loads from the single-file build (Blob worker, embedded wasm) and works in the ChatGPT browser. If it doesn't, fall back to IndexedDB behind `Store`.
- Store: `store/` interface, worker RPC, migrations, `memory` fallback, Web Lock for multiple tabs.
- `model/markdown.ts`: markdown ↔ blocks and the safe inline renderer.
- `api/docs-api.ts`.
- Tools: `doc`, `edit_blocks`, and the docs parts of `outline`, `read` and `search`.
- The activity log moves into the store.

**Success Criteria**
- Docs survive a reload on https and localhost.
- `file://` and a second tab fall back to memory mode, with a banner.
- `stale_rev` rejects the whole batch.
- Acceptance prompt 7 works headlessly.
- The build grows by no more than about 1.5 MB.

**Tests**
- Store suite in Node (in-memory sqlite-wasm): migrations, atomic ops, `ord` renumbering, soft delete and restore, history trimming.
- markdown round trip for every block type.
- Hostile markdown cases.
- Enforcement of every limit.

**Status**: In Progress — core done; tool wrappers pending.

**Done on `webmcp/stage3`**
- Spike: sqlite-wasm with `opfs-sahpool` works from the single-file build (results in spec §2 and §14). The build grew by 829 KiB (5,648 → 6,477 KiB).
- `src/store/`: `Store` interface, engine, migrations, worker, RPC client, storage mode and banner, tab lock. `src/model/markdown.ts`, `src/model/quiz.ts` (types and validation; grading is Stage 5), `src/api/docs-api.ts`.
- `main.ts` exposes `window.docsDebug` (the docs API). The store boots on its first call, so the guide is unchanged until a doc is made.
- Tests: `tests/store.test.mjs`, `tests/markdown.test.mjs`, `tests/docs-api.test.mjs` (45 tests; acceptance prompt 7 runs headlessly).

**For the integrator**
- Tool wrappers: `doc` → `docs.doc(input)`; `edit_blocks` → `docs.editBlocks(input)`; `outline(docs)` → `docs.outlineDocs()`; `outline(doc:*|quiz:*)` → `docs.outlineArtifact(ref)`; `read(doc:*|quiz:*, detail)` → `docs.read(ref, detail)`; `search(scope: docs)` scores `docs.searchRows()` with `model/search.ts`; `go(block:*)` and `window` use `docs.locate(ref)`. Every method returns `{ error: { code, message, ... } }` instead of throwing.
- Wire the hooks in `createDocsApi`: `currentView` (Stage 2 view API, for `view: "current"`), `isLocked` and `open` (Stage 4), `download`.
- `get_context.store` comes from `docs.status()`, which never boots the store.
- Activity log: this branch does not have Stage 1's `src/api/activity.ts`, so it was not moved. The store has `appendActivity` and `listActivity` with the same semantics (seq cursor, at most 30 per read, last 500 kept). Keep the in-memory ring as the source for `get_context`, and mirror entries into the store only once it is open; logging to the store from page load would boot the worker for every visitor.
- Replace the ref parsing in `docs-api.ts` (`artifactId`, `blockId`) with `model/refs.ts`.
- Browser checks still to run, including in the ChatGPT desktop browser: `pnpm preview`, then `await docsDebug.doc({ action: "create", title: "T", markdown: "- a" })`, reload, and `await docsDebug.outlineDocs()` lists it with `docsDebug.status().store === "local"`. A second tab reports `memory` / `other-tab`. `dist/index.html` opened from disk reports `memory` / `file`.

## Stage 4: Floating windows and the doc editor

**Goal**: The user and the agent share floating, minimizable doc windows with a clean, Linear-style block editor. Docs download as `.md`.

**Scope**
- `ui/windows.ts`: drag, resize, minimize, tray, slots, z-order, persistence, mobile sheets, accessibility.
- Tool: `window`.
- `ui/doc-editor.ts`: Tiptap flat schema, block ids, slash menu, input rules, handles, keyboard map, agent-edit wash and gutter dot, `locked_by_user`.
- `view` blocks with a Show button, and `view: "current"` inserts.
- `.md` download, and import by dropping a file.

**Success Criteria**
- Acceptance prompt 5 succeeds.
- Agent edits appear live, without breaking the user's cursor.
- Pointer events on windows never orbit the brain.
- The exported markdown reads cleanly in another viewer and re-imports losslessly.
- If Tiptap fails after 3 attempts, the textarea editor ships behind the same `BlockEditor` interface.

**Tests**
- Window geometry math (constraining and slot resolution).
- Converting a ProseMirror document to block diffs, run headless with prosemirror-model.
- Export/import fixtures.

**Status**: Not Started

## Stage 5: Quizzes

**Goal**: Agents create quizzes that appear in a draggable card. The user answers by choosing, ordering, recalling, or clicking regions on the brain, and results are readable by the agent.

**Scope**
- `model/quiz.ts`.
- Tool: `quiz`.
- `read(detail: "results")`.
- `ui/quiz-card.ts`: card mode, feedback, Show me, retry of missed questions.
- Pick mode wired through `main.ts`, with a list fallback.
- Keyboard: the card owns 1–6, Enter and → while it is active; `ui/keyboard.ts` skips its topic and step shortcuts then (they conflict today).
- Attempts stored.
- Question blocks rendered inline in docs.

**Success Criteria**
- Acceptance prompt 4 succeeds, including a click-the-region question.
- Answers are never shown before submission.
- Results match the attempts that were stored.

**Tests**
- Validation and grading for all 5 kinds.
- The results summary.
- Pick-mode routing (whether the interceptor is active or not).
- Keys 1–6 answer the card and do not switch topics while it is open.

**Status**: Not Started
