# Perception & Attention

An open-source, interactive review of some basics of human perception and attention. A 3D brain built from a reference anatomy atlas shows six topics, each as a short step-by-step walkthrough:

1. **Vision**: from the eye to visual cortex, then the two streams that identify objects (including areas for faces, places, bodies and words) and guide action
2. **Hearing**: from the ear to auditory cortex
3. **Touch**: from skin and muscles to touch cortex
4. **Cortex–thalamus feedback**: how the cortex adjusts its own input
5. **Attention**: how the brain sets priorities
6. **Speech and language**: hearing and producing speech

The build is a single self-contained HTML file. It makes no network requests at runtime.

## Why

Neuroscience is not my field of work. I like reading about human behaviour and performance, and when I came across Robert Sapolsky's work some years ago, I started going deeper into the topic.

I made this guide as a refresher on some details of human attention that I wanted to look into. I think learning about behavioural biology and neuroscience can provide a lot of insight into systems design. After all, if we look at it from the point of view of [the bitter lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html), human intelligence is the result of a multi-billion-year research effort that produced all kinds of adaptations.

I also wanted to try [math](https://github.com/pmndrs/math), a library by Isaac Mason ([X](https://x.com/isaac_mason_), [GitHub](https://github.com/isaac-mason)). It is good. The guide was built with it using Claude Opus 5.5 and GPT-6 Sol. More of my thoughts are at [zeph.computer](https://zeph.computer) and on [X](https://x.com/jbermudez5).

This is a first version; I expect to keep adding detail.

## What it does

- **Walkthroughs.** Each step highlights one region, sends a signal along the routes involved, and explains what happens there with one key fact. Play advances through the steps automatically.
- **Spotlight.** Routes, regions and labels the current step is not about are dimmed.
- **Region guides.** The Region tab lists a topic's regions with a one-line description; each opens a short guide with its sources. Hovering a region name in the panel turns the camera to it; moving away returns the view.
- **Attention streams.** In the Attention topic, a simplified normalization model shows how giving one sense priority reduces the others without switching them off.
- **Labels outside the head.** Callouts are placed in columns beside the head, 14 px apart when there is room, and joined to their regions by two-segment leader lines: a 45° bend out of the region, then a horizontal run to the label.

## Accuracy

The text summarizes published research and textbooks. It was checked against primary papers and review articles in September 2026; [`docs/science-factcheck.md`](docs/science-factcheck.md) lists each claim with its verdict, confidence, species and citation. Every DOI in the content was resolved against Crossref. When a finding comes from animal studies, the text says so; when researchers disagree, the text says so.

Routes, particle motion and brightness are illustrations, not measurements. Small nuclei that the atlas does not segment (TRN, pulvinar, superior olive, VPL, dorsal column nuclei) are shown as markers at approximate positions. Functional areas it does not segment (MT, IT, FFA, PPA, EBA, VWFA) are placed from typical group-average MNI coordinates and snapped onto the gyrus or sulcus they lie in; individual locations vary by several millimetres. This is an educational resource, not a clinical reference.

## Getting started

Requires Node 22+ and pnpm 8.

```sh
pnpm install
pnpm preview      # build, then serve dist/ at http://localhost:8769
```

`dist/index.html` also opens directly in a WebGL-capable browser.

| Script | What it does |
| --- | --- |
| `pnpm build` | Bundle everything into `dist/index.html` |
| `pnpm preview` | Build and serve `dist/` locally |
| `pnpm check` | Type-check with TypeScript |
| `pnpm test` | Run the `node:test` suites in `tests/` |
| `pnpm lint` | Lint and format-check with Biome |
| `pnpm format` | Apply Biome formatting and safe fixes |

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
  scene/               Three.js
    brain-scene.ts     Builds the scene and runs the frame loop
    geometry.ts        Atlas decoding, surface sampling, route curves
    materials.ts       Point and highlight shaders
  ui/
    explorer.ts        Controller: overview, topics, steps, panels, hover previews
    templates.ts       HTML builders for the side panel and dock
    about.ts           About dialog (About, Papers, Code, Models)
    dom.ts             Element lookup, escaping, [[region|text]] links, toasts
    icons.ts, keyboard.ts, panel-resize.ts
  data/                Atlas and skull geometry derived from Z-Anatomy; functional-area positions
tests/                 Content, anatomy, attention, callout and motion tests
scripts/               build, local server, atlas, skull and functional-area preparation
provenance/            Source hashes, transforms and bounds for the derived geometry
docs/                  Science fact-check notes
```

## How it works

**State and loop.** `ExplorerState` holds the current topic, step, selected region and a few view flags. The UI writes it; the scene reads it on every frame and eases toward it with critically damped springs, so changes never jump.

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
- **New step:** add it to a topic's `steps` in `pathways.ts`. Give it a `fact`. Add a `signal` if the default hop from the previous step is wrong. The tests check that every signal follows a drawn edge.
- **New source:** add it to `sources.ts` or `guideSources` in `region-guides.ts` and reference its `id`.

Run `pnpm test` after editing. It checks that every region has a guide, every link and source resolves, and every step signal follows a drawn edge.

## Regenerating geometry

Normal builds use the checked-in files in `src/data/`. To regenerate them, obtain the two FBX inputs and the repository tree JSON identified in `provenance/anatomy.json`, then run:

```sh
node scripts/prepare-atlas.mjs /path/to/inputs
node scripts/prepare-skull.mjs
```

`src/data/functional-areas.json` is generated from the atlas by `node scripts/place-functional-areas.mjs`, which lists each area's source coordinate and the mesh it is snapped to.

## Credits and licenses

- **Anatomy:** [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) by Gauthier Kervyn and contributors, based on BodyParts3D. The derived geometry keeps CC BY-SA 4.0; the inner-ear (cochlea) meshes keep CC BY-NC-SA 4.0 (non-commercial). See [`ATTRIBUTION.md`](ATTRIBUTION.md).
- **Libraries:** [math](https://github.com/pmndrs/math) by Isaac Mason and [Three.js](https://threejs.org/), both MIT.
- **Code license:** not yet chosen.
