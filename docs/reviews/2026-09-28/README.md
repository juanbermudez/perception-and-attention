# Review, 2026-09-28

Four independent passes at commit `9e0cd12`. Proof scripts referenced in the reports lived in a session scratch folder and are not kept.

| Report | Scope | Result |
| --- | --- | --- |
| [webmcp.md](webmcp.md) | Current WebMCP spec and client support vs `src/agent/webmcp.ts` | Works in ChatGPT; 5 gaps |
| [tool-design.md](tool-design.md) | Agent tool-design practice vs the 11 tools, plus an eval plan | Sound; overlapping tools lack stated boundaries |
| [code-agent-side.md](code-agent-side.md) | `src/agent`, `src/api`, `src/model`, `src/store`, `src/editor`, doc/quiz UI | 0 critical, 0 high, 10 medium, 16 low; no XSS |
| [code-guide-side.md](code-guide-side.md) | Scene, UI, content integrity, build, tests | 0 critical, 0 high, 10 medium, 17 low |

**One conflict between the reports.** `tool-design.md` R5 proposes MCP's `destructiveHint`, `idempotentHint` and `openWorldHint`. WebMCP defines only `readOnlyHint`, `untrustedContentHint`, `consequentialHint` and `debugging` (`webmcp.md` §1.2). Send the WebMCP set; MCP's extra hints only help MCP bridges such as MCP-B.

## Priority order

### 1. Bugs
- A malformed `%` in the URL hash stops agent tools, Notes and quizzes from loading (`refs.ts:301`).
- Keyboard shortcuts stop working after clicking any button (`keyboard.ts:39`).
- An agent `update` flattens nested list items (`docs-api.ts:444`).
- The kill switch misses other tabs and in-flight writes (`control.ts:10`, `webmcp.ts:74`).
- Typing in the last 0.4 s is lost on reload (no flush on `pagehide`).
- Deleted docs can't be found again; this is the likely cause of the "vanished doc" (no Recently deleted list).
- Undo on an agent edit overwrites the user's later edits (`docs-tools.ts:200`).
- A cerebellar lobule is built as cortex (regex `Angular_` in `prepare-atlas.mjs:81`).
- `registerTool()` promises are not awaited (`webmcp.ts:171`).
- Question and view data are validated on some write paths and not others (one validator per block type).

### 2. Agent tool design
- Say in each description which tool to use when (`go`, `set_view`, `window`, `quiz`), and how to find docs.
- Worked examples in `set_view`, `quiz`, `edit_blocks` and tours.
- Accept `region:v1` and `V1` in region fields.
- Actionable errors for common slips, and a hint when a search finds nothing.
- `untrustedContentHint` on tools that return user doc text; test in ChatGPT first.
- Consider splitting `tour` out of `walkthrough`.
- Cut the schema by about 30% (the view patch is inlined three times).
- Drop the unused `content[]` result mode.
- Measure with the 12-task evaluation plan before and after.

### 3. Performance and size
- Index the atlas geometry, saving about 2 MiB (27% of the page).
- Stop the label layout thrash (1.1 ms per frame).
- Idle the render loop when nothing moves.
- Handle WebGL context loss and restore.

### 4. Accessibility
- Focus drops to the page body on navigation.
- 3D labels come before the dock in tab order.
- Dimmed labels are below AA contrast.
- The 3D view can't be moved from the keyboard.

### 5. Hygiene
- Gate `docsDebug` and `explorerDebug` behind a flag.
- Add a Chrome/Edge origin-trial token for the hosted build.
- Add tests for the scene and the explorer.

## Status (2026-09-29)

Everything above is fixed on main except:
- The Chrome and Edge origin-trial token. The build injects it from `WEBMCP_OT_TOKEN`, but a token has to be registered for the hosted origin.
- The evaluation in ChatGPT. Run [`docs/agent-evals.md`](../../agent-evals.md) there, and also check that doc text marked `untrustedContentHint` still reaches the model.
- `brain-scene.ts` is not split into modules.
- `scripts/` is not type-checked, because that needs `@types/node`.
