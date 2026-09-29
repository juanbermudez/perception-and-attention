# Code review: guide-facing half of `basics-on-attention`

Scope: `src/scene/**`, `src/ui/{explorer,about,keyboard,panel-resize,pick-mode,window-geometry,templates,dom}.ts`, `src/model/{callouts,activity,attention}.ts`, `src/content/**` (integrity only), `src/main.ts`, `src/state.ts`, `src/styles.css`, `scripts/**`, `package.json`, `tsconfig.json`, `tests/**`.

Baseline: `pnpm test` 176/176 pass, `pnpm lint` clean (112 files), `pnpm check` clean. Git tree clean. No project files were modified. Proof scripts are in `scratchpad/review/scratch2/`. Runtime checks ran against a fresh scratch build of the same sources (byte-identical to `dist/index.html`, 7,412,155 B), served locally and driven in Chromium through `window.explorerDebug`.

Severity counts: **Critical 0 · High 0 · Medium 10 · Low 17** (27 findings), plus 1 PLAUSIBLE.

---

## Medium

### M1. A malformed `%` escape in the URL hash stops the app from starting — CONFIRMED
- **Where:** `src/model/refs.ts:301` (`decodeURIComponent` with no try/catch). Called from `src/ui/explorer.ts:567` (`restore`) via `src/main.ts:68`, and from the `hashchange` handler at `explorer.ts:354-357`.
- **Scenario:** Opening `…/#/vision/%E0%A4%A` (a truncated shared link, or a hand-typed `%`) throws `URIError: URI malformed` at the top level of `main.ts:68`. Nothing after that line runs: the activity log, tour, docs API, docs UI, Notes button, quiz card, agent surface and debug hooks are never set up. The 3D view and the panel still render, so the page looks fine, but Notes and quizzes silently do nothing. Reloading doesn't help, because the hash is still in the URL.
- **Proof:** In the browser, after a reload with that hash: `explorerDebug`, `docsDebug` and `document.modelContext` were all `undefined`, and the console logged `Uncaught URIError … at Object.restore`. `scratch2/hash.mjs` shows `parseHash("#/%E0%A4%A")` throws.
- **Fix:** In `parseHash`, catch the decode error and return `null`, e.g. `let raw; try { raw = decodeURIComponent(…) } catch { return null }`. Add a refs test for it.

### M2. Losing the WebGL context shows a message nobody sees, pauses the animation permanently, and adds a new message each time — CONFIRMED
- **Where:** `src/scene/brain-scene.ts:1425-1432`; `.error-message` CSS at `src/styles.css:1180-1187`.
- **Scenario:** Context loss is common on mobile (backgrounding the app), after GPU resets, and when too many contexts are open.
  1. The message is appended after the full-height canvas with `position: static`, so it lands at `y = stage height`, below the visible area of an `overflow: hidden` stage. The user sees a frozen or black canvas and no explanation.
  2. The handler calls `preventDefault()`, so the browser restores the context and three.js renders again. The message still says "Reload to restore it", and `state.playing` stays `false`, so the particles stay frozen until the user presses Space (nothing on screen tells them to).
  3. Each loss appends another message.
  4. While the context is lost, the frame loop keeps doing all its CPU work at 60 fps.
- **Proof:** Using `WEBGL_lose_context`: the message's rect was `y=622` with `viewport h=622`, so it was fully off-screen. After `restoreContext()`, the scene rendered again (screenshot), `playing` was `false`, and the message was still in the DOM. A second loss left 2 messages. 60 frames ran while the context was lost.
- **Fix:** Position the message as an absolutely placed overlay (reuse the `#loading` styling). Handle `webglcontextrestored`: remove the overlay and restore the previous `playing` value. Skip `frame()` while `renderer.getContext().isContextLost()`. Add the overlay only once.

### M3. Label layout reads and writes the DOM in the same loop, forcing up to 100 layouts per frame — CONFIRMED
- **Where:** `src/scene/brain-scene.ts:1295-1383`. Each marker is written to at 1299-1300 (`classList`, `aria-pressed`), 1369-1374 (`style.opacity`, `pointerEvents`, `disabled`, `hidden`), and then measured at 1380-1381 (`offsetWidth`/`offsetHeight`). This happens for all 50 markers, hidden ones included. After the loop come `getBoundingClientRect()` ×2 (1386-1388), `setAttribute("d","")` on every hidden leader (1391), and a second opacity write (1409-1411).
- **Scenario:** Each marker's write dirties style (`hidden`, `disabled` → `button:disabled{opacity}`), and the read that follows forces a synchronous style and layout. The cost scales with marker count and device speed.
- **Proof:** Instrumenting the getters in the vision topic: 50 `offsetWidth` + 50 `offsetHeight` + 2 `getBoundingClientRect` per frame. `offsetWidth` alone cost **1.10 ms per frame** on an Apple-silicon Mac, about 23% of the 4.7 ms total CPU per frame (including render submission). Low-end phones will be several times slower.
- **Fix:** Measure label sizes once, and again only when text or font changes (a `ResizeObserver` on the labels, or measure when a label is first shown). Skip hidden markers entirely. Write attributes and classes only when the value changes. Read the two rects before any writes in the frame.

### M4. The atlas stores every triangle's corners separately (each vertex ~6 times); indexing would cut ~2 MiB (27%) from the page — CONFIRMED
- **Where:** `scripts/prepare-atlas.mjs` `add()`/`pack()`, consumed by `brain-scene.ts:292-395` and `geometry.ts:unpack`.
- **Facts (esbuild metafile, `scratch2/bundle.mjs`):** the page is 7.17 MiB of JS plus 63 KiB of CSS. `atlas-data.json` is **4162 KiB (58%)**, `skull-data.json` 790 KiB (11%), the store worker 760 KiB (10.6%, of which the gzipped+base64 `sqlite3.wasm` is 525 KiB), and three.js 558 KiB. The page gzips to about 2.7 MiB. There are no source maps, no `process.env`, and the agent shim is under 2 KiB and gated behind `?agent=shim`.
- **Waste:** The triangle meshes store 501,612 vertices, of which only 83,556 are unique (**6.00× duplication**), for 3919 KiB of base64. Per-mesh indexed geometry (Int16 positions + Uint16 indices; the largest mesh has 7,051 unique vertices) comes to **~1959 KiB**, a saving of about 1.96 MiB (`scratch2/atlas-size.mjs`). The unindexed soup also makes `computeVertexNormals()` produce flat, faceted normals.
- **Fix:** Emit an index per mesh in `prepare-atlas.mjs` and use `geometry.setIndex`. `sampleSurface` needs to walk indexed triangles. The skull normals (395 KiB of Int16 × 3) could also be octahedral-encoded in 2 bytes each, for smaller gains.

### M5. A cerebellar structure is shipped as cerebral cortex because a regex also matches "quadr**angular_**" — CONFIRMED
- **Where:** `scripts/prepare-atlas.mjs:81`: `/…|Angular_|…/i`, where `Angular_` was meant for the angular gyrus. Case-insensitive, it matches `Anterior_quadrangular_lobule{l,r}`.
- **Scenario:** Both anterior quadrangular lobules (cerebellum) go into the `cortex` group as triangles, in addition to the `lower` (cerebellum) point cloud. As a result:
  - The cerebellum is drawn with the cortex surface shader and colour.
  - About 348 of the 38,000 "cortex" points land on the cerebellum (0.92% of cortex area), so cortical activity clusters can sample them.
  - Setting `layers.cerebellum = 0` leaves part of the cerebellum visible as "cortex", and fading the cortex layer fades part of the cerebellum.
  - It adds 306 KiB (313k base64 chars) to the bundle.
  - `atlas.dimensions` is unaffected, because the lobule's bounding box lies inside the rest of the cortex.
- **Proof:** `scratch2/quadrangular.mjs` shows the regex matches `angular_`. The atlas lists `Anterior_quadrangular_lobuler` twice, once as `cortex/triangles` and once as `lower/points`. `scratch2/integrity.mjs` reports the duplicate mesh names.
- **Fix:** Anchor the pattern (`/(^|_)Angular_gyrus/`, or an explicit list). Add a test that no mesh name is duplicated across groups and that no cerebellar name matches the cortex group.

### M6. Keyboard focus is dropped to `<body>` during normal navigation — CONFIRMED
- **Where:**
  - (a) `src/ui/explorer.ts:249-253` (`renderRegionList` replaces `#drawer-content` while focus is inside it: the "All regions" back-link).
  - (b) `explorer.ts:486` → `setPanel("guide")` hides the region drawer that contains the focused "← Back to step N" button.
  - (c) `brain-scene.ts:1371,1374` disables, then hides, a focused 3D label when the step changes (autoplay, arrow keys, or an agent).
- **Proof:** In the browser:
  - Focus the "All regions" button and activate it: `activeElement` becomes `BODY`.
  - Same with "Back to step".
  - Attention topic: focus the `cingulate` label at step 6, go to the next step: after about 120 frames the label is `hidden`, and `activeElement` is `BODY`.
- **Fix:** After re-rendering or switching panels, move focus to a stable target: the drawer's list heading, or the matching `.step-toggle`. In the scene, don't disable or hide a label that has focus (keep it until blur), or move focus to `#scene-title` or the region list.

### M7. After any mouse click on a button, the documented keyboard shortcuts stop working — CONFIRMED
- **Where:** `src/ui/keyboard.ts:39` ignores every key whose target is a `button` or `a`, not only Space and Enter.
- **Scenario:** Chrome and Firefox focus a button when it is clicked. After clicking a topic in the dock, "Next step", or a step dot, ←/→, 1–6 and Space do nothing until the user clicks empty space. These are the shortcuts the About dialog advertises (`about.ts` CONTROLS).
- **Proof:** A real click on "Next step" (step 1), then two real ArrowRight presses: the step stayed 1, and `activeElement` was `#step-next`.
- **Fix:** For button and link targets, let only keys with native behaviour (Space, Enter) through, and handle arrows and digits globally. Keep the existing exclusions for text inputs, `contenteditable`, the separator and tab lists (tab lists already `stopPropagation`).

### M8. Going back to the Overview keeps the Streams sense toggles, so the eyes or ears vanish while their routes still flow — CONFIRMED
- **Where:** `explorer.ts:64-81` (`showIntro` sets `state.path = "attention"` but doesn't reset `enabledSenses`). `brain-scene.ts:258-271` hides the eye, optic, ear and auditory-nerve layers through `visionShown` and `hearingShown` (`model/view.ts:209-214`), which read `enabledSenses` when `path === "attention"`. The overview route weights (`attention.ts:topicRouteWeight`) ignore `enabledSenses`.
- **Proof:** Go to Attention › Streams, turn Vision off, then click Overview. The screenshot shows the eyes and optic nerves gone while the teal vision routes still start from where the eyes were. Before the change, the same framing showed the eyes.
- **Fix:** Gate eyes and ears on `enabledSenses` only when `!state.overview` (for example `visionShown = path==="vision" || (path==="attention" && !overview && senses.vision) || overview`). Alternatively, reset the stream settings when leaving the Attention topic.

### M9. Brain-scene and explorer behaviour is not tested, and one fake has already drifted from the real code — CONFIRMED
- **Untested:** `src/scene/brain-scene.ts` (1,610 lines) has no tests. Its most intricate logic is pure and extractable but is buried in `frame()`: marker visibility (1305-1313), the label target rules (1355-1367), `regionSpot`, the volley state machine, and highlight weights. `src/ui/explorer.ts` (the navigation state machine, hash routing, walk timer, focus), `panel-resize.ts`, `about.ts`, `templates.ts` and the HTML helpers in `dom.ts` (`escapeHtml`, `linkedText`, `richText`) are also untested. None of M1, M2, M6, M7, M8 or L1–L3 would be caught.
- **Test that re-implements the code it stands in for:** `tests/view-tools.test.mjs:66-110` `fakeExplorer` copies `explorer.place()` and `goTo()` logic "as ui/explorer.ts does", and has already diverged. A `region` ref with no path uses `pathways.find(step region)` in the fake, whereas the real code (`explorer.ts:316`) stays in the current topic if it covers the region, else falls back to `hostTopic`, which includes route-only regions. For a route-only region such as `retinaR`, the fake would throw.
- **Tests that can't fail or that test unrealistic inputs:** `tests/windows.test.mjs:90` asserts the constant `MAX_OPEN === 8`. The tile test (`:76-86`) only uses a 1280×800 "stage", which the real stage never is (viewport minus the 332–560 px panel); see L7.
- **Fix:** Extract `markerVisible`, `labelTarget` and `regionSpot` as pure functions in `model/` and test them. Test `explorer.ts` against a tiny DOM stub, or through the real `createExplorer` with a jsdom-free fake `byId`. Replace `fakeExplorer` with the real controller. Test the tile layout on realistic stage sizes.

### M10. Region labels come before the main navigation in tab order, and the 3D view can't be used from the keyboard — CONFIRMED
- **Where:** `src/index.html`: `#region-labels` precedes `nav.dock`. `brain-scene.ts:777-812` creates labels in `regions` object order. OrbitControls never calls `listenToKeyEvents`, and the orbit surface isn't focusable.
- **Proof:** In the Attention topic, the first 11 tab stops are 3D labels in data order (v1, pfc, parietal, pulvinar, …), not spatial order, and only then comes the dock. The view can't be rotated, panned or zoomed without a pointer; only the agent API can move the camera.
- **Fix:** Move `#region-labels` after the dock in the DOM, or give the labels a single roving tab stop. Make `.orbit-surface` focusable with keyboard orbit and zoom (`controls.listenToKeyEvents`, plus +/−), and sort labels by screen position.

---

## Low

### L1. The overview keeps highlighting the last visited step's routes — CONFIRMED
- **Where:** `brain-scene.ts:996-1039`, 1206-1212. `spotRoutes`, `spotRegions` and `volley` are never cleared when going to the overview, and `reset()` (1510-1514) doesn't touch them. Route emphasis (`isStepEdge`) doesn't check `state.overview`.
- **Proof:** Overview after visiting Vision › V1: `vision:lgn>v1` opacity 0.091, other vision routes 0.0385. Overview after visiting the chiasm step: the `retina>chiasm` routes are 0.091 instead. The overview looks different depending on navigation history.
- **Fix:** Clear `spotRoutes`, `spotRegions` and `volley` in `reset()`, or gate `isStepEdge` on `!state.overview`.

### L2. Hovering a region name while the camera is still moving makes it return to the wrong place — CONFIRMED
- **Where:** `brain-scene.ts:564-578`. `previewRegion` saves the live `controls.target`/camera, not the animation's destination (`pose()` at 1439-1455 already handles this case correctly).
- **Proof:** Click Next step, hover a region link within 300 ms, then leave. The settled target was `[-0.623,-0.93,0.292]`, versus `[-0.267,-0.731,0]` without the hover.
- **Fix:** When `focusStarted >= 0`, save `focusTo`/`toTheta`/`toPhi`/`toDistance`.

### L3. A label that reappears slides across the head from its old position — CONFIRMED
- **Where:** `brain-scene.ts:1375-1379` resets `side` on hide but not `initialized` or `fade`. `callouts.ts:185-196` then glides it from its stale `labelX`. This contradicts the documented intent at `callouts.ts:177-178` ("jumps and fades in rather than sliding across the head").
- **Proof:** `scratch2/reshow.mjs`: a label hidden on the left and shown again on the right moves 238→523 px at 15 px per frame with `fade` 1.
- **Fix:** Set `marker.initialized = false` when hiding.

### L4. Spotlight-dimmed 3D labels fail text contrast — CONFIRMED
- **Where:** `brain-scene.ts:1409` (`lerp(0.45,1,spot)`), `.label-role` in `styles.css`.
- **Proof:** Measured on Vision › LGN, where labels outside the step render at opacity ≈0.61: the abbreviation is 3.84:1 and the role text 2.65:1 at 11.5 px. AA needs 4.5:1. These labels are interactive buttons.
- **Fix:** Dim with colour or border, not opacity. Keep the text at ≥4.5:1, or raise the minimum.

### L5. Device-pixel-ratio changes are ignored — CONFIRMED (by code)
- **Where:** `brain-scene.ts:181` calls `setPixelRatio` once. `materials.ts:77,94,106,119` bake `pixelRatio` into the uniforms at creation, and `resize()` (928-937) never updates either.
- **Scenario:** Browser zoom, or dragging the window between a 1× and a 2× display, leaves the canvas blurry or over-resolved, and point sizes wrong.
- **Fix:** Listen with `matchMedia(\`(resolution: ${devicePixelRatio}dppx)\`)`, and on change call `setPixelRatio` and update a shared `pixelRatio` uniform.

### L6. The render loop never idles — CONFIRMED (by code)
- **Where:** `brain-scene.ts:1416-1424`.
- **Scenario:** Even when paused, with reduced motion, and with the camera at rest, every frame re-uploads the particle and cluster buffers, rewrites 50 labels, and renders roughly 170k points. Also, about 7.8% of particle slots can never be lit (`tail ≥ trailCount`, 1229/1257) but are still uploaded and rasterized (`scratch2/kinds.mjs`). The result is battery drain on laptops and phones.
- **Fix:** Skip `frame()` when no spring is moving, `!playing`, and there is no camera or input change, or render on demand. Compact particle output to lit slots only.

### L7. Window tiling overlaps, and runs past the stage edge, at realistic stage sizes — CONFIRMED
- **Where:** `src/ui/window-geometry.ts:98-117` (`arrange` tile) together with `constrain`'s `MIN_SIZE` floor (76-82).
- **Proof:** `scratch2/tile.mjs`:
  - A 1024×768 viewport gives a 656×768 stage. Tiling 3 windows gives 2 overlapping pairs and 1 window past the edge.
  - Tiling 5–8 windows gives 3–5 overlaps.
  - A 1072×600 stage with 7–8 windows also overlaps.
  - `constrain` also turns non-finite `w`/`h` into `NaN` (`windows.ts:318` only checks `x`/`y`).
- **Fix:** Choose `cols` and `rows` so each cell is at least `MIN_SIZE`, and fall back to stack when they can't fit. Guard `Number.isFinite` in `constrain`.

### L8. The preview server crashes on a malformed URL — CONFIRMED
- **Where:** `scripts/serve.mjs:12` (`decodeURIComponent` runs outside the `try` in an async handler, so the rejection is unhandled).
- **Proof:** `curl http://127.0.0.1:8797/%E0%A4%A` kills the process, and the next request fails.
- **Fix:** Move the decode inside the `try` and return 400.

### L9. Debug and write-capable APIs are always exposed in production — CONFIRMED
- **Where:** `src/main.ts:175-204`. `window.docsDebug` exposes the full docs API (create, edit, delete); `window.explorerDebug` exposes state and view mutation.
- **Scenario:** Any injected or extension script gets a stable, documented API to edit the user's notes.
- **Fix:** Gate both behind `?debug` or a build flag, as the agent shim already is (`?agent=shim`).

### L10. Toast action buttons stay focusable and clickable after the toast fades — CONFIRMED (by code)
- **Where:** `src/ui/dom.ts:42-60` and `.stage-toast` at `styles.css:~440-461`. `hide()` only removes classes, so opacity goes to 0 but the button stays in the DOM and tab order.
- **Scenario:** A keyboard user can Tab to an invisible "Undo" and run it long after the toast is gone. Six seconds is also short for reaching the button by keyboard.
- **Fix:** Remove the button (or set `inert`/`hidden`) on hide. Pause the timer while the toast has focus or hover.

### L11. ARIA details on the 3D labels — CONFIRMED
- **Where:** `index.html` `#region-labels` has an `aria-label` but no role, so it is ignored. `brain-scene.ts:1300` toggles `aria-pressed` on navigation buttons every frame, so screen readers announce toggle state. `brain-scene.ts:808`: the accessible name "Explore Primary visual cortex (V1)" doesn't contain the visible text "V1 · visual cortex" (WCAG 2.5.3).
- **Fix:** Use `role="group"`. Replace `aria-pressed` with `aria-current="true"` on the shown region, written only on change. Start the accessible name with the visible text.

### L12. A resized panel width isn't re-clamped and overrides the responsive default — CONFIRMED (by code)
- **Where:** `src/ui/panel-resize.ts:73-76` only updates the ARIA values on `resize`. The inline `--inspector-width` on `.workspace` also beats the `@media (max-width:1000px)` `:root` value.
- **Scenario:** Widen the panel to 560 px on a wide window, then shrink the window to 900 px: the panel stays at 560 px and the stage drops to 340 px.
- **Fix:** Call `setSize(currentSize())` on resize.

### L13. The About › Papers "Region details" list has duplicates and uncited entries — CONFIRMED
- **Where:** `src/ui/about.ts:81-85` filters by URL but doesn't de-duplicate within `guideSources`.
- **Proof:** `scratch2/dupes.mjs`: three papers are listed twice (Wu 2019 `hidden-hearing-loss`/`-human`, Grothe 2010 `itd-coding`/`sound-localization-mechanisms`, Saal & Bensmaia 2014 `s1-coding`/`s1-convergence`). Six `guideSources` entries are never cited by any region guide yet appear under "Region details" (`crossmodal-shifts`, `optic-nerve-fibres`, `language-dominance`, `speech-planning-frontal`, `delayed-feedback`, `speech-production-model`).
- **Fix:** De-duplicate by URL. Remove or cite the orphan entries. Add an integrity test.

### L14. Content integrity is otherwise clean — CONFIRMED (informational)
`scratch2/integrity.mjs` checked the following, and all passed:
- Every region has a guide, anatomy and host topic, with a finite position.
- Every anatomy part exists in the atlas.
- Step keys and edges are unique per topic.
- Every step signal hop maps to an edge in its topic.
- Every `[[id|…]]` link resolves.
- Every pathway and guide `sourceIds` entry resolves.
- URLs are clean `https`.
- There are exactly 6 topics, which the 1–6 shortcut relies on.

The only problems found are M5, L13 and the two duplicated atlas mesh names behind M5, where `atlasParts` in `brain-scene.ts:414` keeps only the last entry.

### L15. Dead state and dead code — CONFIRMED (by code)
- `state.skull`, `state.bones` and `state.speed` are never written anywhere, so every `state.skull ? … : …` branch (for example `brain-scene.ts:528,539,966,1134`, `homeCamera`) and `surfaceVisible`'s bones gate are unreachable. The skull is actually controlled through `layers.skull`.
- `destroy()` (`brain-scene.ts:1595-1607`) is never called, and it would leak most geometries, materials, `glowTexture`, the label DOM and the context-loss listener.
- The intro `.region-mention` handler (`explorer.ts:454-456`) has no targets in the current content, and would snap back to `pfc` anyway (`brain-scene.ts:1063`).
- **Fix:** Delete these, or wire them up.

### L16. `brain-scene.ts` structure — CONFIRMED (maintainability)
- One 1,400-line closure, with a 370-line `frame()` that mixes anatomy fades, particles, activity, markers, DOM labels and camera.
- The per-group opacity targets are magic numbers written twice with different values. For example, the construction opacities (332: cortex 0.11) differ from the frame targets (1138: 0.065 or 0.26), so every load starts with a fade.
- The topic region set is computed three times (474, 484, `model/topics.ts:topicRegions`).
- `pathways.find` runs per frame and per marker (1050, 1323).
- There are small per-frame allocations: `regionSpot` closure, `clusters.forEach` closure, the array literal at 1367 per marker, `streamResponses` objects per route (`attention.ts:83`), and arrays and closures in `layoutCallouts` and `stackColumn`.
- **Fix:** Split into `scene/anatomy.ts`, `scene/routes.ts`, `scene/activity.ts`, `scene/markers.ts` and `scene/camera.ts`, with a named table of layer opacities. Cache the current pathway when `state.path` changes.

### L17. Minor build and config details
- `package.json` has no `engines` field, although `node --test "tests/*.test.mjs"` globbing needs Node ≥21.
- `zod` is `^4` while every other dependency is pinned exactly.
- `tsconfig` doesn't check `scripts/` or `tests/`.
- **Fix:** Add `"engines": {"node": ">=22"}`, pin `zod`, and optionally add a `checkJs` config for the scripts.

---

## PLAUSIBLE

### P1. Canvas may flash blank while the panel is being resized
- **Where:** `brain-scene.ts:928-940`. `renderer.setSize` inside the `ResizeObserver` callback clears the drawing buffer after that frame's `requestAnimationFrame` render. The observer runs after rAF in the rendering steps, so the cleared canvas can be painted until the next rAF.
- **Not verified:** Not captured visually.
- **Fix:** Call `renderer.render(scene, camera)` (or `frame(performance.now(), 0)`) right after `setSize`.

---

## Checked and not a problem
- **Shader programs:** `applySurfaceEffects` sets `customProgramCacheKey`. Counting `linkProgram` calls across all six topics, streams, layer, isolate and undo changes gave **0 recompiles**.
- **Listeners:** None are attached more than once. The scene's pointer listeners share an `AbortController`. `explorer.onEvent` replaces its listener. `hashchange` and `keydown` are registered once.
- **Reduced motion:** Behaviour is consistent: no volley (kicks instead), no sparkle, no auto-rotate, instant camera, instant callouts, `scroll-behavior: auto`, and CSS transitions off.
- **NaN risk in camera math:** `stageFov` clamps the aspect. `frameFit` and `halfFov` stay finite (at worst they clamp to max distance when the aspect is 0). `pose().zoom` always divides by a clamped distance ≥1.6. `zoomNearness` divides by `homeDistance > 0`.
- **Build output:** `build.mjs` output has no `</script` in any case, no `<script`, no source maps and no `process.env`.
- **Mobile layout (375×812, DPR 2):** 13 labels, none overlapping and none off-screen. The stage and drawer rows fill the viewport.
- **Contrast of static panel text:** Scanned in the Streams view; nothing below AA apart from L4.
