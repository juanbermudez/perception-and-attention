# Basics on Attention

A review of some basics of human attention and the sensory pathways it acts on, with an interactive 3D brain. It covers six topics — vision, hearing, touch, cortex–thalamus feedback, attention, and speech and language — each as a short step-by-step walkthrough.

The build is a single self-contained HTML file with no network requests at runtime.

## Run

```sh
pnpm install
pnpm preview        # builds dist/index.html and serves it at http://localhost:8769
```

Open `dist/index.html` directly in a WebGL-capable browser as an alternative.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm build` | Bundle into `dist/index.html` |
| `pnpm check` | Type-check |
| `pnpm test` | Content, anatomy, attention-model, callout and motion tests |
| `pnpm lint` / `pnpm format` | Biome |

## Layout

```
src/
  main.ts            entry point: wires the UI, scene and shared state
  state.ts           view state shared by the UI and the scene
  index.html         page template (styles and script are inlined at build)
  styles.css
  content/           all text: topics, regions, region guides, sources, About copy
  model/             pure logic: attention normalization, motion springs, callout layout
  scene/             Three.js scene, geometry helpers, shaders
  ui/                controller, templates, About dialog, popovers, panel resize, keyboard
  data/              atlas and skull geometry derived from Z-Anatomy
tests/               node:test suites
scripts/             build, local server, atlas and skull preparation
provenance/          source hashes, transforms and bounds for the derived geometry
docs/                science fact-check notes
```

## Content and accuracy

Text lives in `src/content/`. It summarizes published research and textbooks and was checked against primary papers and reviews in September 2026; `docs/science-factcheck.md` lists each claim with its verdict and citation. Routes, particle motion and brightness are illustrations, not measurements.

## Regenerating geometry

Normal builds use the checked-in files in `src/data/`. To regenerate them, obtain the FBX inputs and repository tree identified in `provenance/anatomy.json`, then run `node scripts/prepare-atlas.mjs /path/to/inputs` and `node scripts/prepare-skull.mjs`.

## Credits

Anatomy from [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) (CC BY-SA 4.0; inner-ear meshes CC BY-NC-SA 4.0), based on BodyParts3D. Built with [math](https://github.com/pmndrs/math) by Isaac Mason and [Three.js](https://threejs.org/). See `ATTRIBUTION.md`.
