# Perception & Attention

An open-source, interactive review of some basics of human perception and attention. A 3D brain built from a reference anatomy atlas shows six topics, each as a short step-by-step walkthrough:

1. **Vision**: from the eye to visual cortex, then the two streams that identify objects (including areas for faces, places, bodies and words) and guide action
2. **Touch**: the touch and position route and the pain and temperature route, through the thalamus to S1, S2, the posterior insula and the cingulate cortex
3. **Hearing**: from the ear to auditory cortex, the belt and parabelt, the "what" and "where" streams, and the feedback that turns down the ear's amplification
4. **Speech and language**: hearing and producing speech
5. **Cortex–thalamus feedback**: layer 6 feedback that adjusts the thalamic relay, and the layer 5 route through the pulvinar
6. **Attention**: goal-driven networks (prefrontal cortex, frontal eye fields, parietal cortex), networks for unexpected and important events, arousal from the locus coeruleus, the superior colliculus and the thalamus

The four perception topics come first; the last two cover how the brain controls its own input, ending with attention.

The build is a single self-contained HTML file. It makes no network requests at runtime.

## Why

I made this guide as a refresher on some details of human attention that I wanted to revisit while working on a personal project. When I came across [math](https://github.com/pmndrs/math), a library by Isaac Mason ([X](https://x.com/isaac_mason_), [GitHub](https://github.com/isaac-mason)), it seemed like a great way to make it visual.

Behavioural biology and neuroscience began as a personal interest, but once I got into AI and model architecture, I came to see nature as the GOAT at applying the ["bitter lesson"](http://www.incompleteideas.net/IncIdeas/BitterLesson.html). For all our technological progress, we still struggle to match its designs; after all, it has been tweaking and selecting candidates for far longer than we have been around.

I am in awe of what autoregressive models have made possible, but I believe composition and specialization can lead to systems that are both more efficient and more capable.

It might also be that being GPU poor has made me biased. 😅

Either way, I am enjoying the process a lot.

This is a first version; I expect to keep adding detail.

## What it does

- **Layout.** A rail of topic icons runs down the left edge, the explanation panel sits beside it (drag its edge to resize it) and the 3D view fills the rest. On the overview each topic's row lines up with its icon in the rail. On narrow screens the panel moves under the 3D view.
- **Walkthroughs.** Each step highlights one region, sends a signal along the routes involved, and explains what happens there with one key fact. Play advances through the steps automatically.
- **Spotlight.** Routes, regions and labels the current step is not about are dimmed.
- **Region guides.** The Regions tab lists a topic's regions with a one-line description; each opens as a page of the panel, with its sources, and the panel's back button returns to the list or the step it came from. Hovering a region name in the panel turns the camera to it; moving away returns the view.
- **Attention streams.** In the Attention topic, a simplified normalization model shows how giving one sense priority reduces the others without switching them off.
- **Labels outside the head.** Callouts are placed in columns beside the head, 14 px apart when there is room, and joined to their regions by two-segment leader lines: a 45° bend out of the region, then a horizontal run to the label.
- **Links to a place.** The URL hash follows what you are looking at (`#/vision/parallel-channels`, `#/hearing/region/soc`), so a reload or a shared link opens the same step or region.
- **Assistant tools.** In browsers with site tools (WebMCP), an assistant can read the guide a level at a time, search it, navigate, play walkthroughs, change the 3D view in one call (camera, dissolving layers, isolating regions, labels) and run captioned tours that pause when you orbit, click or press a key. Its actions show in an "Assistant" pill and a toast with Undo; going home or to another topic resets its view; About has a switch that turns its control off. See [`docs/agent-surface-spec.md`](docs/agent-surface-spec.md).

## Accuracy

The text summarizes published research and textbooks. It was checked against primary papers and review articles in September 2026; [`docs/science-factcheck.md`](docs/science-factcheck.md) lists the claims that were checked, each with its verdict, confidence, species and citation. Every DOI in the content was resolved against Crossref. The text aims to say when a finding comes from animal studies and when researchers disagree.

Routes, particle motion and brightness are illustrations, not measurements. Small nuclei that the atlas does not segment (TRN, pulvinar, superior olive, VPL, dorsal column nuclei, locus coeruleus) are shown as markers at approximate positions. The spinal cord is not loaded, so it is represented by a marker at the lower end of the medulla. Functional areas it does not segment (for example MT, the FFA, the frontal eye fields, S2 and the auditory belt) are placed by scaling typical group-average MNI coordinates to the atlas’s bounding box, then snapping each to the gyrus or sulcus it usually lies in; individual locations vary by a centimetre or more (up to about 2–3 cm for MT). This is an educational resource, not a clinical reference.

## Getting started

Requires Node 22+ and pnpm 8.

```sh
pnpm install
pnpm preview      # build, then serve dist/ at http://localhost:8769
```

Notes are saved in the browser's storage for one origin, so the server sends requests for `127.0.0.1` and other host names to `http://localhost:8769`.

`dist/index.html` also opens directly in a WebGL-capable browser (notes then last only until the tab closes).

| Script | What it does |
| --- | --- |
| `pnpm build` | Bundle everything into `dist/index.html` |
| `pnpm preview` | Build and serve `dist/` locally |
| `pnpm check` | Type-check with TypeScript |
| `pnpm test` | Run the `node:test` suites in `tests/` |
| `pnpm lint` | Lint and format-check with Biome |
| `pnpm format` | Apply Biome formatting and safe fixes |

To try the assistant tools in any browser, open the page with `?agent=shim`, then call them from the console: `await agentDebug.call("outline", { ref: "topic:vision" })`. `agentDebug.tools()` lists them with their input schemas.

The inspection hooks `explorerDebug` (state, frames, label placement, the view API) and `docsDebug` (the docs API) are installed only when the URL has `?debug` or `?agent=shim`. They act directly, without the assistant switch, presence or the activity log, so ordinary visits do not get them.

**WebMCP in Chrome and Edge.** During the WebMCP origin trial, Chrome and Edge give a page `document.modelContext` only on an origin registered for the trial (or with the browser's WebMCP flag on); the ChatGPT desktop app does not need this. Register the hosted origin for [Chrome's WebMCP origin trial](https://developer.chrome.com/blog/ai-webmcp-origin-trial) and for Edge's, then build with both tokens:

```sh
WEBMCP_OT_TOKEN=<chrome token> WEBMCP_OT_TOKEN_EDGE=<edge token> pnpm build
```

The build adds one `<meta http-equiv="origin-trial">` per token. A token works only on the origin it was registered for, so it does nothing for a local or `file://` copy. Without the variables the page is unchanged.

## Project structure

```
src/
  main.ts              Entry point: creates the state, UI, scene and debug hooks
  state.ts             View state shared by the UI (writes) and the scene (reads every frame)
  index.html           Page template; build inlines styles.css and the bundled script
  styles.css
  content/             All text and data about the brain
    types.ts           Region, Pathway, Step, Edge, Source
    regions.ts         Region names and positions (atlas anchors)
    pathways.ts        The six topics: intro, steps, key facts, routes, sources
    region-guides.ts   Per-region guide text and its sources
    region-anatomy.ts  Which atlas meshes to highlight for each region
    sources.ts         Topic-level references
    site.ts            Overview and About copy, model notes
  model/               Pure logic with no DOM or WebGL, covered by tests
    attention.ts       Normalization model of attention; region pulse
    activity.ts        Critically damped springs and exponential decay
    callouts.ts        Label placement outside the head
    refs.ts            Ref grammar (topic:, step:, region:, …), suggestions, URL hash
    search.ts          Tokenizer and scorer for guide search
    topics.ts          Topic helpers: step signals, regions per topic
    markdown.ts        Markdown ↔ doc blocks; the escaped, allow-listed inline renderer
    quiz.ts            Quiz question types and validation
  agent/               WebMCP adapter, tool definitions, help card, kill switch, dev shim
  api/                 GuideApi (outline, read, search, go, walkthrough, context), view API, tour runner (no DOM)
    docs-api.ts        Docs and quizzes: create, edit blocks, outline, read, attempts, windows
  store/               Local SQLite (WASM) store for docs, in a worker (OPFS, or memory)
    engine.ts          All reads and writes over one connection; one transaction per batch
    migrations.ts      Schema, gated on user_version
    client.ts          Starts the worker from the bundled source; storage mode and tab lock
    worker.ts          Loads sqlite-wasm from the embedded binary and serves engine calls
  scene/               Three.js
    brain-scene.ts     Builds the scene and runs the frame loop
    geometry.ts        Atlas decoding, surface sampling, route curves
    materials.ts       Point and highlight shaders
  ui/
    explorer.ts        Controller: overview, topics, steps, panels, hover previews
    templates.ts       HTML builders for the side panel and the rail
    about.ts           About dialog (About, Papers, Code, Models) and the assistant switch
    agent-presence.ts  "Assistant" pill and action toasts
    dom.ts             Element lookup, escaping, [[region|text]] links, toasts
    icons.ts, keyboard.ts, panel-resize.ts
  data/                Atlas and skull geometry derived from Z-Anatomy; functional-area positions
tests/                 Content, anatomy, attention, callout, motion, store, markdown and docs tests
scripts/               build (bundles the store worker and embeds sqlite3.wasm), local server, atlas, skull and functional-area preparation
provenance/            Source hashes, transforms and bounds for the derived geometry
docs/                  Science fact-check notes
```

## How it works

**State and loop.** `ExplorerState` holds the current topic, step, selected region and a few view flags. The UI writes it; the scene reads it on every frame and eases toward it, mostly with critically damped springs, so changes do not jump (with reduced motion, camera moves are instant).

**Signals.** Each step can declare a `signal`: a list of hops, each a list of `[from, to]` region pairs that travel together. Without one, a step sends a single hop from the previous step's region. Routes with the same `stage` fire together, so both eyes or both ears activate at once. Arriving signals add to a region's activity, which then decays exponentially (τ = 0.9 s).

**Region activity.** Each activity point flashes at random times at a rate proportional to its region's activity and fades after each flash. This is a visual cartoon, not a neuron simulation.

**Attention model.** `model/attention.ts` computes each sense's response as R = A·E / (σ + Σ A·E), a simplified form of the normalization model of attention (Reynolds & Heeger, 2009), with σ = 1 and an attention gain of up to 3×.

**Labels.** `model/callouts.ts` measures the projected head outline, splits labels into left and right columns, and stacks each column so labels keep the vertical order of their regions. That keeps leader lines from crossing. Labels are fanned out vertically from the head's centre (1.3×) so leaders leave their regions at an angle, and are spaced 14 px apart; a crowded column shrinks the gap to 4 px before it overflows. Each leader bends at 45° next to its region, then runs horizontally into the label. Labels near the mouse scale up (to 1.28×) and come forward with a soft shadow; the effect falls off within 90 px and is off while dragging, on touch, and with reduced motion.

**Camera.** Focusing a region eases the camera along an orbit to a preset viewing direction for that region. A hover preview saves the current view and returns to it afterwards.

**View gap.** While a region is shown, the particle shaders open a channel from the camera to it (`scene/materials.ts`). Skull and brain points in front of the region are pushed sideways out of the channel, points behind it dim, and the translucent surfaces are cut the same way. The channel follows the camera as you orbit, so the region stays visible from any angle. Moving to another region closes the channel, re-centres it and parts the particles again, so you see them move out of the way. Eyes, ears and their nerves are left in place. Zooming in past the default distance also fades the skull and outer brain.

## Editing content

All text lives in `src/content/`.

- **Links to regions:** write `[[regionId|visible text]]` in any body text to make a button that focuses that region.
- **External links:** in About copy, write `[label](https://…)`.
- **New step:** add it to a topic's `steps` in `pathways.ts`. Give it a `key` (a slug unique in the topic; links and refs use it, so do not rename it) and a `fact`. Add a `signal` if the default hop from the previous step is wrong. The tests check that every signal follows a drawn edge.
- **New source:** add it to `sources.ts` or `guideSources` in `region-guides.ts` and reference its `id`.

Run `pnpm test` after editing. It checks that every region has a guide, every link and source resolves, and every step signal follows a drawn edge.

## Regenerating geometry

Normal builds use the checked-in files in `src/data/`. To regenerate them, put the two FBX inputs and the repository tree JSON identified in `provenance/anatomy.json` in `work/anatomy/` (git-ignored), then run:

```sh
node scripts/prepare-atlas.mjs
node scripts/prepare-skull.mjs
```

`src/data/functional-areas.json` is generated from the atlas by `node scripts/place-functional-areas.mjs`, which lists each area's source coordinate and the mesh it is snapped to.

## Credits and licenses

- **Anatomy:** [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) by Gauthier Kervyn and contributors, based on BodyParts3D. The derived geometry keeps CC BY-SA 4.0; the inner-ear (cochlea) meshes keep CC BY-NC-SA 4.0 (non-commercial). See [`ATTRIBUTION.md`](ATTRIBUTION.md).
- **Libraries:** [math](https://github.com/pmndrs/math) by Isaac Mason and [Three.js](https://threejs.org/), both MIT. [SQLite Wasm](https://sqlite.org/wasm) (SQLite is public domain; the npm wrapper is Apache-2.0; the Emscripten glue is MIT) and [marked](https://marked.js.org/) (MIT) for local docs.
- **Code license:** [MIT](LICENSE). The anatomy data in `src/data/` keeps its own licenses above.
- **Source:** [github.com/juanbermudez/perception-and-attention](https://github.com/juanbermudez/perception-and-attention).
