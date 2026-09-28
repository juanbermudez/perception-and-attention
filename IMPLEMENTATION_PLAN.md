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

**Status**: In Progress (core done; tool wrappers pending Stage 1)
- Done (`webmcp/stage2`): `model/view.ts`, `api/view-api.ts` (`createViewApi(state, scene)`: `apply`, `undo`, `current`), scene pose API, layer presence with dissolve/fade, isolate, multi-region highlight, label modes, `viewFocus`, `ui/narration.ts`. Tests in `tests/view.test.mjs`. Manual access: `explorerDebug.view(patch)`, `undoView()`, `currentView()`, `routes()`, `narrate(text, stop, of)`.
- Pending (needs Stage 1): the `set_view` tool (zod schema over `ViewPatch`; `apply` already returns `{ view, said, skipped? }` or `{ error }`), `walkthrough` `tour`/`stop` with a tour runner that drives the caption bar (`narration.onAction`) and pauses on user input, `get_context.view` from `current()`, Undo in the agent toast (`undo()`), and the kill switch around `apply`.

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

**Status**: Not Started

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
