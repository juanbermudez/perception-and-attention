# Tool design for agents: research and critique of the Perception & Attention WebMCP tools

Date: 2026-09-28 · Project: `~/Desktop/basics-on-attention` · Scope: the 11 tools in `src/agent/tools/*.ts`, the shared schemas, the `help` card, result/error helpers. No project files were edited.

**How the evidence was gathered.**
- Read every tool definition, `src/agent/schemas.ts`, `help.ts`, `webmcp.ts`, `api/result.ts`, and the error paths in `src/api/*.ts`.
- Ran `pnpm test`: 176/176 pass.
- Dumped the registered tool definitions exactly as an agent receives them, plus about 45 real calls. The calls ran through the real runner, `GuideApi`, docs API and in-memory SQLite, with fake explorer, scene and windows (the same harness as `tests/docs-tools.test.mjs`).
- Scripts and raw output are in this folder: `dump.mjs`/`dump.txt`, `schemas.mjs`/`schemas.json`, `sizes.mjs`.
- Some results reflect the fakes. For example, `go` reports `at: "overview"` because the fake explorer does not move, and tours and the quiz card return `not_available`. Those are not bugs.

**Headline numbers (measured)**

| Metric | Value |
| --- | --- |
| Tool definitions as registered (name + title + description + inputSchema + annotations) | **32,488 bytes** (roughly 8–9k tokens; token count is an estimate, moderate confidence) |
| Largest input schemas | `edit_blocks` 8,120 B · `walkthrough` 5,822 B · `quiz` 5,644 B · `set_view` 4,780 B |
| The 50-value region enum, inlined | **14 copies** × 397 B ≈ 5.6 KB |
| Full `ViewPatch` copies | 3: `set_view`, tour stop `view` (4,841 B), `edit_blocks` insert `view` (4,917 B) |
| `walkthrough` schema without `stops` | 475 B (the tour part is 92% of it) |
| Tool descriptions, all 11 | 3,876 characters |
| Annotations sent | `readOnlyHint` only |

---

## 1. Checklist: current best practice, with sources

Primary sources are marked **[P]**, secondary ones **[S]**. Confidence in each guideline as a practice is given in the last column.

| # | Guideline | What the sources say | Sources | Conf. |
| --- | --- | --- | --- | --- |
| C1 | **Few, workflow-shaped tools, not API mirrors** | Build "a few thoughtful tools targeting specific high-impact workflows". "Too many tools or overlapping tools can also distract agents." Block: "Design top-down from workflows, not bottom-up from API endpoints." Phil Schmid: "Outcomes, not operations." | [P] Anthropic, *Writing effective tools for agents* (2025-09-11) https://www.anthropic.com/engineering/writing-tools-for-agents · [S] Block playbook (2025-06-16) https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers · [S] https://www.philschmid.de/mcp-best-practices (2026-01-21) | High |
| C2 | **How many tools** | OpenAI: "Aim for fewer than 20 functions available at the start of a turn … a soft suggestion." Gemini: "Keep active set to 10-20 tools maximum." Anthropic suggests tool search once there are 10+ tools or definitions over 10K tokens. Benchmarks: accuracy falls as catalogs grow; RAG-MCP measured 13.6% selection accuracy with the full catalog vs 43.1% with retrieval. | [P] https://developers.openai.com/api/docs/guides/function-calling · [P] https://ai.google.dev/gemini-api/docs/function-calling · [P] Anthropic, *Advanced tool use* (2025-11-24) https://www.anthropic.com/engineering/advanced-tool-use · [S] RAG-MCP arXiv 2505.03275; MCP-Bench https://arxiv.org/pdf/2508.20453 | High (direction), low (exact thresholds) |
| C3 | **No ambiguous decision points** | "If a human engineer can't definitively say which tool should be used in a given situation, an AI agent can't be expected to do better." Documentation should give "clear boundaries between similar tools". OpenAI's coverage test: "confirm overlapping descriptions won't confuse selection." | [P] Anthropic, *Effective context engineering* (2025-09-29) https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents · [P] *Building effective agents*, App. 2 (2024-12-19) https://www.anthropic.com/engineering/building-effective-agents · [P] https://developers.openai.com/plugins/plan/tools | High |
| C4 | **Consolidate with an `action` parameter, but keep one parameter shape and one risk level per tool** | Anthropic docs: group related operations "into a single tool with an `action` parameter". OpenAI: "Separate read and write behavior … split when they involve different permissions or safety requirements." Block: "Build tools with one risk level only." Chrome WebMCP: atomic tools, "avoid overlapping tools". The sources disagree on the edges. The consensus is to merge operations that share a parameter shape and a risk level, and to split when the parameters or the risk differ. | [P] https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools · [P] OpenAI plugins "Define tools" · [S] Block · [P] Chrome, *WebMCP best practices* (2026-05-18) https://developer.chrome.com/docs/ai/webmcp/best-practices | Moderate |
| C5 | **Naming and namespacing** | Namespace by service or resource (`asana_search`). Prefix vs suffix "non-trivial effects … Effects vary by LLM": choose by eval. OpenAI: "stable, action-oriented" verb names (`create_project`), or `calendar.create_event`. Chrome: verbs that "describe exactly what happens" (`create-event` vs `start-event-creation-process`). MCP: names of 1–128 chars from `[A-Za-z0-9_.-]`, and aggregators SHOULD prefix to avoid collisions (e.g. two `search` tools). | [P] Anthropic tools article · [P] https://developers.openai.com/plugins/guides/optimize-metadata · [P] Chrome WebMCP · [P] MCP 2026-07-28 Tools https://modelcontextprotocol.io/specification/2026-07-28/server/tools | Moderate |
| C6 | **Descriptions** | "Provide extremely detailed descriptions. This is by far the most important factor." Cover what the tool does, when to use it and when not, what each parameter means, and caveats; "at least 3–4 sentences". Write it the way you would for "a new hire", and make implicit context explicit. OpenAI: pass the "intern test"; start with "Use this when…". Chrome: positive wording. Small wording changes gave large gains, e.g. SWE-bench; the SWE-bench team "spent more time optimizing our tools than the overall prompt". | [P] Claude docs define-tools · [P] Anthropic tools article · [P] OpenAI function calling · [P] OpenAI optimize-metadata · [P] Chrome WebMCP · [P] *Building effective agents* | High |
| C7 | **Parameters: unambiguous names, enums, defaults, poka-yoke** | "`user_id` instead of `user`". "Use enums and object structure to prevent invalid states." "Change the arguments so that it is harder to make mistakes": the absolute-path example. "Don't make the model fill arguments you already know." Chrome: "Accept raw user input", "Validate strictly in code, loosely in schema". Flatten arguments; AWS suggests about 8 or fewer parameters. | [P] Anthropic tools article · [P] OpenAI function calling · [P] *Building effective agents* · [P] Chrome WebMCP · [S] Phil Schmid · [S] AWS (2026-07-09) https://aws.amazon.com/blogs/machine-learning/mcp-tool-design-practical-approaches-and-tradeoffs/ | High |
| C8 | **Examples for complex inputs** | "JSON Schema … can't express usage patterns." `input_examples` raised accuracy "from 72% to 90% on complex parameter handling". Use 1–5 realistic examples covering minimal, partial and full inputs, only where the schema is not obvious. WebMCP has no `input_examples` field, so examples have to go in the description. | [P] Anthropic *Advanced tool use* · [P] Claude docs define-tools | High (benefit), moderate (size of gain on GPT) |
| C9 | **Return meaningful context** | Prefer semantic identifiers over opaque ones: resolving UUIDs to meaningful names "significantly improves Claude's precision … by reducing hallucinations". Return "stable identifiers and enough structured information for follow-up calls" (OpenAI). WebMCP/ChatGPT: "return enough information to verify the result". | [P] Anthropic tools article · [P] OpenAI plugins "Define tools" · [P] ChatGPT WebMCP https://learn.chatgpt.com/docs/webmcp | High |
| C10 | **Response size, concise vs detailed** | A `response_format` enum ("concise"/"detailed"); in Anthropic's Slack example, concise cost 72 tokens vs 206. Claude Code caps tool responses at 25,000 tokens. | [P] Anthropic tools article | High |
| C11 | **Pagination and truncation with guidance** | "pagination, range selection, filtering, and/or truncation with sensible default parameter values". When truncating, "steer agents with helpful instructions". Return `has_more`/`next_offset`. | [P] Anthropic tools article · [S] Block · [S] Phil Schmid | High |
| C12 | **Actionable errors** | Replace "opaque error codes" with "specific and actionable improvements", e.g. "Expected parameter 'user_id' as integer. Example: user_id=12345". MCP: input validation and business-logic errors are **tool execution errors** (`isError: true`) so the model can self-correct; "Otherwise, the LLM would not be able to see that an error occurred". | [P] Anthropic tools article · [P] MCP 2026-07-28 Tools and `schema.ts` (`CallToolResult.isError`) | High |
| C13 | **Discoverability** | Progressive disclosure: keep "lightweight identifiers" and load data just in time. With no server instructions (WebMCP), descriptions are the only text that is always loaded. A `help`/overview entry point must be reachable from the descriptions. | [P] Anthropic context engineering · [P] WebMCP README https://github.com/webmachinelearning/webmcp | Moderate |
| C14 | **Mark side effects and confirmation** | MCP annotations: `readOnlyHint` (default false), `destructiveHint` (**default true**, meaningful only when not read-only), `idempotentHint` (default false), `openWorldHint` (**default true**). They are hints and untrusted. OpenAI: set all four "explicitly on every tool"; missing labels are a common rejection cause. ChatGPT: each call gets a "safety review", with confirmation for "deleting data" and similar consequential actions; "Keep inputs narrow, describe side effects". | [P] MCP `schema.ts` 2026-07-28 (`ToolAnnotations`) · [P] https://developers.openai.com/apps-sdk/app-submission-guidelines · [P] ChatGPT WebMCP | High (spec), moderate (effect in ChatGPT) |
| C15 | **Idempotency and undo** | Explicit handles and "Expiry errors" return a tool execution error "so the model can recover". Describe lifetimes, e.g. retention, in the creating tool. | [P] MCP 2026-07-28 Tools, "Stateful Tools" | Moderate |
| C16 | **Schema compatibility** | MCP 2026-07-28 allows full JSON Schema 2020-12 in `inputSchema`, including `$ref`, `$defs` and `oneOf`. OpenAI strict mode supports `anyOf` but **not** `oneOf`/`allOf`, needs every field `required`, and caps a schema at 1,000 enum values. Whether ChatGPT's WebMCP path uses strict mode is **unknown**. | [P] MCP changelog 2026-07-28 · [P] https://developers.openai.com/api/docs/guides/structured-outputs | Low (relevance) |
| C17 | **Evaluation** | Many realistic, multi-step tasks with verifiers. Track accuracy, runtime, number of calls, tokens and tool errors. Read transcripts, including what agents "omit", and use a held-out set. OpenAI: a golden set of direct, indirect and **negative** prompts; measure precision and recall; "Change one metadata field at a time". Chrome: evaluation-driven development, not narrow patches. | [P] Anthropic tools article · [P] OpenAI optimize-metadata · [P] Chrome WebMCP | High |

---

## 2. Per-tool assessment

The key question for each tool: would a GPT or Claude agent that has never seen this site pick the right tool on the first try (**Pick**), fill the parameters correctly (**Fill**), understand the result (**Read**), and recover from errors (**Recover**)? Grades are A (strong) to D (weak).

| Tool | Pick | Fill | Read | Recover | Main problems (evidence) | Conf. |
| --- | --- | --- | --- | --- | --- | --- |
| `get_context` | A | A | B | n/a | The description never says *when* to call it (e.g. "at the start of each turn"), and it is the natural first call but holds no pointer to `outline` or `help`. `playing: true` next to `walking: false` is ambiguous: `playing` is the global animation flag (`guide-api.ts:183`, `main.ts:32`). The unit of `ago` is implicit (seconds). While a dissolve runs, `view.layers` shows transient values (`cortex: 0.04, cerebellum: 0.05, …`) that look like settings. | High |
| `outline` | B | A | A | B | Listing the user's docs needs `outline({ref:"docs"})`. The only hint is the phrase "(ref docs)", mid-sentence (`outline.ts:9`); an agent asked "what notes do I have?" will likely try `search` or `read`. `{ "docs": [] }` has no `ref` (other outlines do) and no hint on how to create one. Paged results return `cursor` without saying "more available". It overlaps with `read` for steps and regions (it returns metadata, `read` returns text), and the description does not state that difference. | High |
| `read` | A | B | A | A | `detail` mixes guide levels (`brief/full/sources`) with doc-only values (`markdown/results`). Valid combinations depend on the ref kind, which the enum cannot express; the errors are good ("detail \"markdown\" applies to doc: and quiz: refs. Use brief, full or sources."). `read(topic, sources)` is 3.7 KB, over the spec's 2 KB target. The help card's `details` omits `results` (`help.ts:30`). | High |
| `search` | A | B | B | C | `query` has **no description** (`search.ts:12`): nothing says to use keywords, that words are prefix-matched, or that there is no typo tolerance. `search("pulvinr")` returns `{hits: []}` with no hint, while the ref resolver next door would have suggested `region:pulvinar`. With no docs yet, `scope` defaults to `all` but the result says `"scope": "guide"` (`docs-tools.ts:114,118`), which reads like docs were skipped. Source hits carry `"snip": ""` in guide results (`guide-content.ts:400`) but no `snip` key when docs are included (inconsistent). | High |
| `go` | B | A | A | A | Three overlaps. (1) `set_view camera.focus`: "show me V1" fits both, and nothing says `go` changes the panel text while `set_view` changes only 3D. (2) `window open`: `go` accepts `doc:`/`quiz:`/`block:` (`guide-api.ts:254`), but the description lists only guide places. (3) `quiz open`: `go quiz:x` opens the question-list **editor** window, not the quiz card. Its errors are the best in the set (`No step 99: vision has 9 steps (1–9).` with options). | High |
| `walkthrough` | C | C | A | A | It has 7 actions and two unrelated features. The `tour` capability (agent-authored captions) is hidden under the name "walkthrough"; an agent asked to "give me a narrated tour" has to read the enum to find it. **Modal behaviour**: while a tour runs, `play/pause/next/prev/restart` without `ref` act on the tour, and with `ref` or `seconds` they start a walkthrough (`guide-api.ts:293`). `seconds` means per-step for `play` but a default per stop for `tour`. `stops` is 92% of the 5.8 KB schema and irrelevant to 6 of the 7 actions. | High |
| `set_view` | A | B | A | B | A good declarative design: one atomic patch, "Only the fields you pass change", and it returns the resulting view plus `said`. Traps: region fields take **bare, case-sensitive** ids (`focus:"V1"` fails) while refs are case-insensitive (`help.ts:26`), and after using `region:v1` in `go` an agent will pass `isolate:["region:v1"]`. The error then lists `closest: v1, l6, extrastriate, ffa, vwfa` instead of saying "drop the prefix". `isolate` takes 3 shapes. There are **no examples** in a 4.8 KB schema of nested objects. It is not stated that `set_view` does not change the page panel (vs `go`). | High |
| `doc` | B | B | A | A | The name is a noun, and the doc lifecycle is spread over **6 tools** (create/rename/delete here, list via `outline`, read via `read`, edit via `edit_blocks`, show via `window`/`go`, find via `search`) with no map in any description. `ref` accepts `quiz:` (so `doc` also deletes quizzes), which is only mentioned in the parameter text. `title` is described only as "create and rename". It mixes an additive action (create), a reversible destructive one (delete) and an off-page side effect (download writes a file), which violates "one risk level" (C4). The results are good: `delete` returns a ready `restore` call. | High |
| `edit_blocks` | A | C | B | A | The hardest schema (8.1 KB). The `rev` discipline is explained, and `stale_rev` returns the current `rev` and `md`, which is excellent. But `set.data` is an untyped record: callout tones (`note/tip/warning`, `model/markdown.ts:15`) are never listed, and a `question` only types `kind` and `prompt`, deferring to "as the quiz tool takes it" (`edit-blocks.ts:13-18,48`). A missing `rev` yields zod's generic `ops.0.rev: Invalid input: expected number, received undefined`, even though the API's own message (`docs-api.ts:429`, "needs the block's rev (from outline or read)") is better and never reached. An unknown block returns bare ids as options (`["ct4vd", …]`) while every other error returns refs. `insert.view` embeds a full `ViewPatch` (4.9 KB) where `quiz.view` is a loose object (inconsistent). | High |
| `window` | B | A | A | B | It overlaps with `go` (opening docs) and `quiz` (open/close). `window open quiz:x` shows the question list for editing while `quiz open` shows the card for taking it, and neither description draws that line. `at` means a screen slot here but the current place in every result (`at: "step:…"`), so one name has two meanings. | Moderate |
| `quiz` | A (create) / C (open) | B | A | B | The description is the most complete in the set (grammar of all 5 kinds). But: `ref` means **the quiz** at the top level and **the "Show me" destination** inside each question (`quiz.ts:28-33,91`), and `open` is both an action and a boolean (`quiz.ts:82,90`). Type slips such as `answer: 0` give zod defaults (`questions.0.answer: Invalid input: expected array, received number`) with no example of the right shape. `view` is an unvalidated-in-schema record, which differs from `edit_blocks`. There is no worked example. | High |

**What is already strong.** Keep these.
- **Semantic refs.** `step:vision/parallel-channels` and `region:ffa` are exactly the "interpretable identifiers" Anthropic recommends.
- **Progressive disclosure.** `outline`, then `read` brief, then `read` full or sources, following C10 and C13.
- **Every write returns `said` plus the new state**, which follows C9 and the ChatGPT "verify the result" guidance.
- **Errors are returned, not thrown**, with `options`. Unknown refs get ranked suggestions.
- **Validation happens in code**, as Chrome's "strictly in code" advises.
- **A static tool list**, which matches Chrome's recommended default.
- **Optimistic concurrency.** `stale_rev` carries the current text.
- **The kill switch and undo toasts.**
- **11 tools** is inside every vendor's range (C2).

---

## 3. Set-level issues

1. **Overlapping entry points without stated boundaries (C3).** These are the pairs a model has to guess between today:
   - `go` vs `set_view`: "show me the FFA".
   - `go` vs `window` vs `quiz`: "open my quiz". Three tools with two different outcomes, the editor window or the answer card.
   - `walkthrough play` vs `walkthrough tour`: "walk me through hearing and explain the MGN".
   - `read` vs `outline`: "what's in step 3".

   Every one is resolvable by an expert, but no description says "use X, not Y, when …". Confidence high.
2. **The doc lifecycle has no map.** Six tools touch docs, and only `outline`'s description mentions how to list them. No tool says "to find a doc's ref, call `outline({ref:"docs"})`". Confidence high.
3. **Three identifier dialects.**
   - Refs (`region:v1`) are case-insensitive, and the resolver suggests fixes.
   - Region-id fields (`v1`) are case-sensitive enums.
   - Block ids accept both `b7x2k` and `block:b7x2k`.

   Tolerance is inconsistent: forgiving where it matters least (block ids) and strict where the agent is most likely to slip (region fields after using refs). This breaks C7 (poka-yoke). Confidence high.
4. **Annotations under-specified (C14).** Only `readOnlyHint` is sent (`webmcp.ts:136,163`). Under the MCP defaults, every write tool (including a camera move) is advertised as **destructive** and **open-world**, and no tool is idempotent. The only truly consequential actions are `doc` delete and download, and `edit_blocks` delete and overwrite. What ChatGPT's safety review does with these hints is not documented beyond `readOnlyHint` (moderate confidence it matters), but OpenAI's own review requires all four set explicitly.
5. **Schema weight and inconsistency (C2, C7).** The definitions total 32.5 KB. There are 14 copies of the 50-value region enum and 3 full copies of `ViewPatch`, yet `quiz.view` is a loose record. So the same concept is strict in two places and loose in one. The int fields emit `maximum: 9007199254740991` (4 times, noise). `oneOf` (2 occurrences) is outside OpenAI strict mode (C16).
6. **Error shape drift (C12).**
   - `api/result.ts` errors carry `{code, message, options}`, but `docs-api.ts:160` errors add ad-hoc `id`, `current`, `op`, `max`.
   - `options` is sometimes refs and sometimes bare block ids.
   - Help pointers use two syntaxes ("read help lists every region id", `refs.ts:167`, vs `read({ ref: "help" })`, `schemas.ts:15`).
   - Generic zod messages leak through for the most common slips (missing `rev`, `answer` not an array).
   - In the default `object` result format there is no `isError`, so only the model, not the host, can tell a failure from a success (the `content` format sets it, `webmcp.ts:121`).
7. **Parameter names reused with different meanings.**
   - `ref`: the target of the action, a destination inside a question, or a place for a tour stop.
   - `at`: a window slot in input, the current place in output.
   - `open`: an action value and a boolean.
   - `seconds`: per step vs a default per stop.
   - `playing` vs `walking`.

   This breaks C7 ("`user_id` instead of `user`").
8. **Discoverability depends on one sentence.** WebMCP has no server instructions (spec §2), so the descriptions are the manual. The `help` card is good reference data, but the only pointer to it is the end of `outline`'s description and a few error messages. It also lacks meanings for its error codes and a task-to-tool map. Confidence moderate.
9. **Name collisions with the host agent (low–moderate confidence).**
   - `search`, `read`, `go` and `window` are generic names. In ChatGPT's agent the site tools sit next to the agent's own browsing and search abilities.
   - In aggregating MCP clients they may sit next to other servers' `search`.
   - Anthropic recommends namespacing but says the effect "varies by LLM", and MCP asks aggregators, not servers, to prefix. How ChatGPT presents site tools (prefixed by site or not) is unknown. **Decide this by eval, not by rule.**
10. **Evaluation is acceptance-only.** Spec §16 lists 7 single-shot prompts with expected tools. There are no negative prompts, no repeated trials, no scoring, no transcript review, and no held-out set (C17).

---

## 4. Ranked recommendations

The ranking weighs the expected gain in first-try correctness for a new GPT/Claude agent against the cost of the change.

### R1. State tool boundaries and the doc map in the descriptions (cost: text only; confidence high)

**Why:** C3 and C6. This is the cheapest fix for the most likely wrong-tool picks: `go`/`set_view`/`window`/`quiz`, and listing docs. Anthropic calls descriptions "by far the most important factor".
**Sources:** Claude define-tools; Anthropic context engineering; OpenAI function calling ("when (and when not)").

- `src/agent/tools/get-context.ts:8`, replace with:
  > "What the user sees now and what happened since your last call: the current place (topic, step, region), the 3D view, open doc and quiz windows, the block the user is editing, selected text, tour and quiz progress, and an activity log of user and agent actions and quiz answers. Pass `since` = the `cursor` from your previous result to get only new activity. The page cannot notify you, so call this at the start of each turn. New to this guide? `outline()` lists its topics; `read({ ref: "help" })` lists every ref form and region id."
- `src/agent/tools/go.ts:9`, replace with:
  > "Show a place in the guide: the side panel switches to it and the 3D camera turns to it (unless `camera` is false). Places: overview, about, about/papers, topic:vision, step:vision/2 or step:vision/parallel-channels, region:v1 (optionally region:v1#mechanism), topic:attention/streams. doc:, quiz: and block: refs open that doc in a window; a quiz opens as its question list for editing. To let the user take a quiz, use `quiz` with action open. To change only the 3D view (angle, zoom, layers, isolate) without changing the page, use `set_view`. Stops a playing walkthrough or tour. Returns the new place, its short text and the view."
- `src/agent/tools/set-view.ts:8`, prepend:
  > "Change only the 3D brain view; the page text stays where it is (use `go` to show a region together with its text). …"
- `src/agent/tools/window.ts:12`, append:
  > "A quiz ref opens its question list for editing; to let the user answer it, use `quiz` with action open."
- `src/agent/tools/doc.ts:14`, prepend:
  > "Use this to create a doc from markdown, or to rename, delete (restorable for 30 days), restore or download a doc or quiz. To list the user's docs and get their refs, call `outline({ ref: "docs" })`; to read one, `read`; to change its content, `edit_blocks`; to show or move its window, `window`. …"
- `src/agent/tools/outline.ts:9`, rewrite:
  > "List what is inside a ref, one level down. No ref: the guide's six topics. topic:<id>: its steps in order and its regions. region:<id>: its sections, topics and steps. docs: the user's docs and quizzes, newest first (use this to find a doc's ref). doc:<id> or quiz:<id>: its blocks with id, type, first 80 characters and rev (edit_blocks needs the rev). Returns refs for read, go and edit_blocks. For the text itself use `read`; to find something by keyword use `search`. If a result has `cursor`, pass it back for the next page."

**Expected benefit:** fewer wrong-tool first calls on the overlap tasks (E2, E5 and E7 in §5). Measurable as first-call precision.

### R2. Split `tour` out of `walkthrough` (cost: small; confidence moderate)

**Why:** C3, C4 and C5.
- The two features share no parameters.
- The tour capability is undiscoverable under the name "walkthrough".
- The modal branch (`guide-api.ts:293`) is a poka-yoke violation.
- `seconds` is overloaded.

Anthropic's docs favour action enums only when operations are related. OpenAI and Block favour one job and one parameter shape per tool.

**Change:**
- `src/agent/tools/walkthrough.ts:15`: `action: z.enum(["play", "pause", "next", "prev", "restart", "stop"])`. Delete `stops` (`:23`) and its `superRefine` (`:25-29`).
- Description (`:11`):
  > "Play or control a topic's built-in walkthrough: the guide steps through the topic's regions with signal animations and text. play starts from the current step (or from `ref`, a topic or step), restart from step 1; pause, next and prev move one step; stop ends it. While a tour you started with `start_tour` is playing, pause, play, next, prev, restart and stop control that tour instead. Returns the current step and a one-line summary."
- New `src/agent/tools/start-tour.ts`, `name: "start_tour"`, `title: "Play a narrated tour"`, input `{ stops: z.array(tourStopSchema).min(1).max(20), seconds?: … "default seconds per stop" }`, description:
  > "Run your own narrated tour: stops played in order. Each stop can go to a place (`ref`), apply a 3D view (same fields as set_view) and show a caption (`say`, up to 280 characters) for its `seconds`. Use it to explain something across several places in your own words; use `walkthrough` to play the guide's built-in steps. Any user click, key or drag pauses it; control it with `walkthrough`. Example: {"stops":[{"ref":"region:lgn","say":"The LGN relays the eye's signal to cortex."},{"ref":"region:v1","view":{"camera":{"from":"left"},"isolate":["lgn","v1"]},"say":"V1 is the first cortical stop.","seconds":8}]}"
- Register it in `src/agent/tools/index.ts:15-27`, making 12 tools, still under every vendor's range. Update the test at `tests/agent-tools.test.mjs` (the tool list and the walkthrough enum).

**Expected benefit:** the `walkthrough` schema shrinks from 5.8 KB to about 0.5 KB, `tour` is picked by name, and the state-dependent behaviour disappears from the tour-start path.
**Counter-case:** one more tool, and the control verbs still act on either feature (documented). If evals show no gain, revert.

### R3. Put worked examples in the four complex descriptions (cost: text; confidence high on direction, moderate on size of gain)

**Why:** C8. WebMCP has no `input_examples`, so the only place for examples is the description. Anthropic measured 72% to 90% on complex parameters.

- `set-view.ts:8`, append:
  > "Examples: {"camera":{"focus":"ffa"}} · {"camera":{"frame":["lgn","v1"],"from":"left"},"layers":{"skull":0},"isolate":["lgn","v1"]} · {"isolate":null,"layers":{"skull":1},"labels":"auto"} (undo an isolate). Region fields take bare ids (v1), not refs (region:v1)."
- `quiz.ts:77`, append:
  > "Example: {"action":"create","title":"Vision basics","questions":[{"kind":"choice","prompt":"Which nucleus relays vision to cortex?","choices":["LGN","MGN","VPL"],"answer":[0]},{"kind":"region","prompt":"Click the area most selective for faces.","answer":["ffa"]},{"kind":"truefalse","prompt":"Fibres from the nasal half of each retina cross at the chiasm.","answer":true}]}"
- `edit-blocks.ts:56`, append:
  > "Example (fix a typo, then add a saved view under a heading): {"ref":"doc:k3f9","ops":[{"op":"replace","id":"b7x2k","find":"tpyo","with":"typo","rev":3},{"op":"insert","after":"h1a2b","view":"current"}]}"
- `edit-blocks.ts:48` (`set.data` description), replace with:
  > "code: {lang}; to-do: {checked: true|false}; callout: {tone: "note"|"tip"|"warning"}; view: a set_view patch; question: the question fields as in quiz (kind, prompt, choices, answer, …)."

**Expected benefit:** fewer `bad_input` round trips on first calls to the three largest schemas.

### R4. Make region-id fields forgiving, and resolve unambiguous bare words as refs (cost: small; confidence high)

**Why:** C7 and issue 3. It matches Anthropic's absolute-path poka-yoke and Chrome's "Accept raw user input … validate strictly in code, loosely in schema".

- `src/agent/schemas.ts:18`: wrap the enum in a preprocess, `z.preprocess((v) => typeof v === "string" ? canonicalRegion(v.trim().replace(/^region:/i, "")) ?? v : v, z.enum(REGION_IDS …))`, where `canonicalRegion` uses the existing `regionByLower` map (`refs.ts:43`). The JSON Schema still shows the enum, so the model is steered to the right values.
- `schemas.ts:12-16` (`regionIdError`): when the input starts with `region:`, or matches an id only when case is ignored, say so explicitly, e.g. `isolate.0: region fields take bare ids: use "v1", not "region:v1"`.
- `src/model/refs.ts:109` (the no-colon branch): if the bare word matches exactly one topic id or one region id (case-insensitive), resolve it (`"v1"` becomes `region:v1`, `"hearing"` becomes `topic:hearing`). Otherwise keep today's `unknown_ref`.
  - Watch the known clash: `brainstem` is both a region id and a layer name. It only matters in `layers`, not in refs.

**Expected benefit:** the most likely cross-tool slip, after `go(region:v1)`, stops costing a round trip. The refs' "caseInsensitive: true" becomes true everywhere.

### R5. Send all four annotations, truthfully (cost: small; confidence moderate)

**Why:** C14. Without them, MCP defaults label `set_view` and `window` as destructive and open-world. OpenAI's review requires all four.

- `src/agent/webmcp.ts:8-17`: add `destructive?: boolean; idempotent?: boolean` to `Tool`.
- `webmcp.ts:136`: widen the annotations type to all four hints.
- `webmcp.ts:163`, replace with:
  `annotations: tool.readOnly ? { readOnlyHint: true, openWorldHint: false } : { readOnlyHint: false, destructiveHint: tool.destructive ?? false, idempotentHint: tool.idempotent ?? false, openWorldHint: false }`
- Values:

  | Tools | destructiveHint | idempotentHint |
  | --- | --- | --- |
  | `doc` (delete, download to disk) | **true** | false |
  | `edit_blocks` (delete and overwrite ops) | **true** | false |
  | `go` | false | **true** |
  | `window` | false | **true** |
  | `set_view` | false | false (`orbit` is relative) |
  | `walkthrough`, `start_tour`, `quiz` | false | false |

- Update the test at `tests/agent-tools.test.mjs` ("registration gives every tool its schema and readOnlyHint…").

**Expected benefit:** a host's safety review can tell a camera move from a delete. ChatGPT documents only `readOnlyHint` (spike item), so the gain there is unproven. Claude and other MCP clients that read hints benefit directly.

### R6. Make the common errors actionable, and unify their shape (cost: small–medium; confidence high)

**Why:** C12. The three most likely slips currently surface zod's generic text.

- `edit-blocks.ts:9`:
  `const rev = z.number({ error: 'rev is required: copy the block\'s rev from outline({ ref: "doc:<id>" })' }).int().min(1) …`
- `quiz.ts:40`: `answer: z.array(…, { error: "choice answer is a list of 0-based indexes, e.g. [0] or [0, 2]" })`. Add a similar message on `truefalse.answer` ("true or false") and `region.answer` ("a list of region ids, e.g. [\"ffa\"]").
- `src/api/docs-api.ts:425`: return options as refs, `[...blocks.keys()].slice(0, 5).map((id) => \`block:${id}\`)`, and say where to get the full list: `… Current blocks: outline({ ref: "doc:<id>" })`.
- `src/model/refs.ts:167`: use one pointer syntax everywhere, `read({ ref: "help" }) lists every region id.`
- Search zero hits, `src/api/guide-api.ts:211` and `docs-tools.ts:114-134`: when `hits` is empty, add
  `hint: \`No matches for "${query}". ${closest.length ? \`Closest refs: ${closest.join(", ")}. \` : ""}Try fewer or different keywords, or browse with outline().\``
  using `suggest(query)` from `refs.ts`. Also report the scope that was requested (`scope: "all"`) together with `docs: 0`, instead of relabelling it `"guide"` (`docs-tools.ts:114,118`). Drop empty `snip` strings (`guide-content.ts:400`: `snip: hit.snip || undefined`).
- `src/api/result.ts:5-10`: document the optional detail fields that `docs-api` already sends (`id`, `current`, `op`, `max`) in `ApiError`, and list the error meanings in the help card (`help.ts:44-53`):

  | Code | Meaning |
  | --- | --- |
  | `bad_input` | fix the named field |
  | `unknown_ref` | try one of the options |
  | `not_available` | the feature is not usable here or now; see the message |
  | `stale_rev` | the block changed; retry with `current.rev` |
  | `locked_by_user` | the user is typing; retry in a few seconds |
  | `limit` | split the request |
  | `agent_control_off` | ask the user to turn on control in About |
  | `store_unavailable` | docs cannot be saved in this browser |

**Expected benefit:** one-step recovery from the most frequent slips, and a zero-hit search becomes a next step rather than a dead end.

### R7. Cut schema weight by about 30%, consistently (cost: small; confidence moderate)

**Why:** C2, C7 and C16, plus issue 5. The context is paid on every turn, and the same concept is currently validated two different ways.

- `schemas.ts:68` (tour stop `view`) and `edit-blocks.ts:26-29` (`insert.view`): replace the inlined `viewPatchSchema` with the same loose, code-validated form that `quiz.ts:20-26` already uses: `z.record(z.string(), z.unknown()).superRefine(normalizeViewPatch…)`, described as "A set_view patch: same fields as set_view (camera, layers, effect, isolate, labels, spotlight, xray, motion)". Measured saving: 4,841 + 4,917 B, about 9.7 KB of 32.5 KB. `set_view` keeps the full schema with the enums.
  - Alternative after the ChatGPT spike: `reused: "ref"` in `z.toJSONSchema` (`webmcp.ts:153`), which MCP 2026-07-28 allows, if ChatGPT resolves `$ref`.
- `get-context.ts:11` and `edit-blocks.ts:9`: add `.max(1e9)`, or strip `maximum: 9007199254740991` in `inputSchema()`.
- `webmcp.ts:152-155`: post-process `oneOf` into `anyOf` (the branches are already disjoint by `op`/`kind` consts). This is harmless for MCP clients and keeps OpenAI strict mode an option.

**Expected benefit:** about 2.5k fewer tokens per turn, and one consistent rule ("embedded view patches are checked in code").
**Counter-case:** tours lose enum-constrained region ids. Mitigate with R4 (forgiving ids) and R3 (examples).

### R8. Rename the ambiguous parameters (cost: medium; confidence moderate)

**Why:** C7 ("`user_id` instead of `user`").

- `quiz.ts:28-33`: in the **tool input only**, replace the question-level `ref`/`view` with `show_me: { ref?, view? }`, described as "Where the Show me button goes after the answer: a guide place and/or a set_view patch". Map it to the stored `ref`/`view` in `run`, so the stored data is unchanged.
- `quiz.ts:90` and `doc.ts:22`: rename `open` (boolean) to `show`.
- `guide-api.ts:183`: rename `playing` to `animating`, or document it in `get_context`'s description ("animating: the 3D animation is running; walking: a walkthrough is playing").
- Activity `ago` becomes `ago_s`.
- Results' `at` (current place) is fine. Rename the `window` input `at` to `slot` (`window.ts:18`) so the two stop colliding.

**Expected benefit:** fewer misplaced fields in `quiz create` (a question-level `ref: "quiz:…"` is plausible today) and less confusion reading `get_context`.

### R9. Upgrade the `help` card into a real orientation page (cost: small; confidence moderate)

**Why:** C13. It is the only place for "how the tools fit together", since WebMCP has no instructions field.

- `src/agent/help.ts:14-54`:
  - Add `results: "a quiz's answers and score"` to `details` (`:30`).
  - Add the error meanings (R6).
  - Add `tasks`:
    ```
    { "find something": "search", "list topics or a topic's steps": "outline", "list the user's docs": "outline docs",
      "show a place with its text": "go", "change only the 3D view": "set_view", "play the guide's steps": "walkthrough",
      "narrate your own sequence": "start_tour", "write notes": "doc create, then edit_blocks", "quiz the user": "quiz create",
      "see answers": "read quiz:<id> results", "arrange windows": "window" }
    ```
- Make sure R1's `get_context` and `outline` descriptions point here.

**Expected benefit:** agents that read `help` once pick correctly afterwards. Test whether they read it at all (§5).

### R10. Decide tool-name prefixes by eval (cost: trivial to try; confidence low)

**Why:** C5 and issue 9. `search`, `read`, `go` and `window` are generic, and Anthropic reports that prefix vs suffix naming moves evals, in a way that "varies by LLM".
**Change:** add a single name-mapping function in `toolDefinition` (`webmcp.ts:157-166`) behind a URL flag, like `?agent-result`, e.g. `?agent-names=guide` produces `guide_search`, `guide_read`, `guide_go`, … Compare the two in §5. Adopt the prefix only if first-call precision rises in ChatGPT.

### R11. Smaller fixes (confidence moderate)

- `outline` result for `docs` (`docs-tools`): include `ref: "docs"`, `count`, and when empty `hint: "No docs yet. Create one with doc({ action: "create", title, markdown })."`
- Paged `outline` results: add `more: true` next to `cursor`, as C11 advises ("steer agents with helpful instructions").
- `read` `detail` description (`read.ts:14`): write it per kind, e.g. "Guide refs: brief (default), full, sources. doc:/quiz: refs: brief, full, markdown, results (quiz answers)."
- `search.ts:12`: `query: … .describe('Keywords, not a question, e.g. "face recognition" or "pulvinar attention". Words match as prefixes; there is no spelling correction.')`

---

## 5. Proposed evaluation plan

**Harness, two tracks.**
1. **Headless, repeatable.** Reuse the `tests/docs-tools.test.mjs` setup: the real runner, `GuideApi`, docs API and in-memory SQLite, with the fake explorer and scene extended to track place. Export the registered definitions (`toolDefinition`) to:
   - the Claude API (tools and a plain agent loop), and
   - the OpenAI Responses API (functions, both `strict: false` and, after R7, `strict: true`).

   Run each task **5×** per model at default temperature. Log full transcripts with the agent's reasoning where available (Anthropic: ask for reasoning before tool calls; enable interleaved thinking).
2. **Primary client, manual.** ChatGPT desktop agent mode (GPT-5.6 Sol or GPT-6 Sol) on the built page. Run each task 3×, record the transcript and any confirmation prompts, and fill the same scorecard.

**Tasks.** Realistic, mostly multi-step; the verifier checks state, not the exact call.

| # | Prompt (user voice) | Verifier (state or answer) | Optimal calls | Probes |
| --- | --- | --- | --- | --- |
| E1 | "Which part of the brain recognizes faces, and show me where it is." | The answer names FFA; the final place is `region:ffa` **or** the view focus is `ffa` | search → go (2) | search → go; result reading |
| E2 | "Hide the skull and show just the LGN and V1, seen from the left." | `view.isolate.regions` = {lgn, v1}, `layers.skull` = 0, `yaw` ≈ 90 | set_view (1) | first-call validity on the largest schema; bare-id slip |
| E3 | "Give me a 1-minute narrated tour of how sound gets from the ear to cortex." | A tour started with ≥3 stops whose refs include cochlea/ic/mgn/a1 in order, with captions | outline(topic:hearing) → tour (2) | **tour vs walkthrough** selection (R2) |
| E4 | "Quiz me on vision: 5 questions, including one where I click the region." | The quiz exists with 5 valid questions, ≥1 `region` kind, and the card is open | quiz (1) | nested schema; `answer` shapes; `ref` confusion (R8) |
| E5 | "Fix the typo in the second paragraph of my attention notes." (seeded doc with "tpyo") | The block text contains "typo"; no other block changed | outline(docs) → outline(doc) → edit_blocks (3) | finding docs (R1); `rev`; recovery |
| E6 | "Save the current 3D view into my attention notes under the heading 'Priority map'." | A view block is inserted immediately after that heading | outline(docs) → outline(doc) → edit_blocks (3) | anchors; `view: "current"` |
| E7 | "How did I do on the vision quiz? Open it again so I can retry the ones I missed." (seeded attempts) | The answer states the correct score; the **quiz card** (not an editor window) is open | outline(docs) → read(results) → quiz open (3) | **go/window/quiz** ambiguity |
| E8 | "Delete my old scratch doc." Then: "Actually, bring it back." | Deleted, then restored | outline(docs) → doc delete → doc restore (3) | destructive confirmation; restore hint use |
| E9 (recovery) | Same as E5, but the harness bumps the block's rev between the agent's read and its write | The final text is correct after one retry | +1 call | `stale_rev` handling |
| E10 (negative) | "What's the capital of Australia?" / "Summarize this conversation." | **No** guide tool called | 0 | false-positive tool use |
| E11 (negative/ambiguous) | "Search the web for recent papers on the pulvinar." | The agent does **not** answer from guide `search` alone; it uses web search, or says the guide's sources are limited | — | `search` name collision (R10) |
| E12 (orientation) | Cold start: "What can you do with this page?" | The answer mentions reading, 3D control, tours, docs and quizzes; ≤3 calls | get_context/outline/read help | discoverability (R9) |

Keep **E3, E7 and E11 as a held-out set**: do not tune descriptions against them (Anthropic: held-out test sets).

**Metrics per task and model.** Report the mean over runs:
- **Success rate** (the verifier passes).
- **First-call precision**: the first guide-tool call is one of the optimal tools.
- **Invalid calls** (`bad_input` plus `unknown_ref`) per task.
- **Calls vs optimal** (excess calls).
- **Recovery rate**: success after the first error.
- **Tokens**: tool-definition tokens plus result tokens.
- **Wall time.**
- **Confirmations shown** (ChatGPT only; fewer on non-destructive tasks is better).
- **False-positive rate** on E10 and E11.

**Procedure.**
1. **Baseline:** today's tools, on both tracks.
2. Apply the recommendations **one at a time** in rank order: R1, R3, R4, R6, then R2, R7, R5, R8, R9, and R10 as an A/B. Re-run the non-held-out tasks after each one; keep a change only if success or first-call precision rises without a drop elsewhere (OpenAI: "Change one metadata field at a time").
3. After each round, concatenate the failing transcripts and have Claude list the confusions, including what the agent did **not** try (Anthropic: "What agents omit … can often be more important"). Fix the tool, not the prompt; avoid narrow patches (Chrome).
4. Finish with the held-out set on both tracks. Ship if held-out success ≥ baseline + 10 points and there are no regressions on E10 and E11 (the threshold is a judgement call; adjust after the baseline).

**ChatGPT spike questions this plan also answers.** They extend spec §2.
- Does ChatGPT send annotations other than `readOnlyHint` to its safety review?
- Does it apply strict decoding to site-tool schemas? That decides whether `oneOf` or optional fields matter.
- Does it prefix site-tool names in the model's view?
- Does it accept `$ref`?

---

## Sources

**Primary**
- Anthropic, *Writing effective tools for agents — with agents* (2025-09-11): https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic, *Building effective agents*, Appendix 2 (2024-12-19): https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, *Effective context engineering for AI agents* (2025-09-29): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic, *Introducing advanced tool use* (tool search, programmatic calling, `input_examples`) (2025-11-24): https://www.anthropic.com/engineering/advanced-tool-use
- Claude docs, *Define tools* (best practices, `input_examples`): https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
- MCP specification 2026-07-28, Tools: https://modelcontextprotocol.io/specification/2026-07-28/server/tools · `schema.ts` (`ToolAnnotations` defaults, `CallToolResult.isError`): https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts · RC post: https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- OpenAI, *Function calling* (best practices, namespaces, fewer than 20 functions): https://developers.openai.com/api/docs/guides/function-calling
- OpenAI, *Structured outputs* (strict-mode schema subset): https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI, *Define tools* (plugins/Apps SDK): https://developers.openai.com/plugins/plan/tools · *Optimize metadata*: https://developers.openai.com/plugins/guides/optimize-metadata · *App submission guidelines* (annotations): https://developers.openai.com/apps-sdk/app-submission-guidelines
- ChatGPT, *Site tools (WebMCP)*: https://learn.chatgpt.com/docs/webmcp
- Chrome, *WebMCP best practices* (2026-05-18): https://developer.chrome.com/docs/ai/webmcp/best-practices · WebMCP proposal: https://github.com/webmachinelearning/webmcp
- Google, *Gemini function calling* (best practices): https://ai.google.dev/gemini-api/docs/function-calling

**Secondary**
- Block, *Block's playbook for designing MCP servers* (2025-06-16): https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers
- Phil Schmid, *MCP is not the problem, it's your server* (2026-01-21): https://www.philschmid.de/mcp-best-practices
- AWS ML blog, *MCP tool design: practical approaches and tradeoffs* (2026-07-09): https://aws.amazon.com/blogs/machine-learning/mcp-tool-design-practical-approaches-and-tradeoffs/
- RAG-MCP (arXiv 2505.03275); MCP-Bench: https://arxiv.org/pdf/2508.20453; *How many tools should an LLM agent see?*: https://arxiv.org/html/2605.24660v1. These report accuracy falling as tool counts rise. The figures are from summaries, not re-verified in full (low confidence on exact numbers).
