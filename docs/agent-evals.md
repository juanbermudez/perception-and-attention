# Agent tool evaluation: checklist and scorecard

Status: ready to run · Written 2026-09-28 · Source: the plan in [`reviews/2026-09-28/tool-design.md`](reviews/2026-09-28/tool-design.md) §5, updated for the 12 tools · Contract: [`agent-surface-spec.md`](agent-surface-spec.md)

This measures whether an agent that has never seen the guide picks the right tool, fills it correctly, reads the result and recovers from errors. Use it to judge every change to tool names, descriptions, schemas or results: run the baseline, change one thing, run again.

---

## 1. Tracks

| Track | Where | Runs per task | What it is for |
| --- | --- | --- | --- |
| **A. Headless** | The real runner, `GuideApi`, docs API and in-memory SQLite in Node, with the inert-DOM explorer from `tests/support/explorer-dom.mjs` and a fake scene. Tool definitions exported with `toolDefinition()` and sent to the Claude API (a plain tool loop) and the OpenAI Responses API (functions, `strict: false`, and `strict: true` once the schemas allow it). | 5 per model, default temperature | Repeatable numbers; transcripts with reasoning |
| **B. ChatGPT** | The ChatGPT desktop app's built-in browser, agent mode, GPT-5.6 Sol or GPT-6 Sol, on the built page served over https or `localhost` | 3 | The client that matters; confirmation prompts; how hints are treated |

Log every transcript in full. For track A, ask the model to reason before each tool call, or turn on interleaved thinking.

## 2. Setup checklist

- [ ] `pnpm install && pnpm build`, then `pnpm preview`. Note the exact origin (`127.0.0.1` and `localhost` keep separate docs).
- [ ] Track B: open the page in the ChatGPT desktop browser. Check that Settings > Browser > Permissions allows site tools, and that About > "Let assistants control this guide" is on.
- [ ] For seeding and checking by hand, open a second copy with `?agent=shim` in any browser: `window.agentDebug.call(name, args)` runs a tool exactly as an agent would.
- [ ] Record the commit, the date, the model and the track in the scorecard header.
- [ ] Start every task from a fresh page (reload) unless the task says otherwise, and reseed its docs.

### Seeds

Run these through `agentDebug.call` on the page under test before the tasks that need them (or create the same docs by hand in Notes).

```js
// E5, E9: attention notes with a typo in the second paragraph
await agentDebug.call("doc", { action: "create", title: "Attention notes", show: false,
  markdown: "# Attention notes\n\nAttention selects what reaches awareness.\n\nThe pulvinar may coordinate activty between cortical areas.\n\n## Priority map\n\nSalience and goals combine." });
// E6 uses the same doc: it has a "Priority map" heading.

// E7: a vision quiz with answers on record
const quiz = await agentDebug.call("quiz", { action: "create", title: "Vision quiz", show: false, questions: [
  { kind: "choice", prompt: "Which nucleus relays vision to V1?", choices: ["LGN", "MGN", "VPL"], answer: [0] },
  { kind: "truefalse", prompt: "Nasal fibres cross at the chiasm.", answer: true },
  { kind: "region", prompt: "Click the face area.", answer: ["ffa"] } ] });
// Then answer it in the card: question 1 right, question 2 wrong, question 3 right (score 2 of 3).

// E8: a doc to delete
await agentDebug.call("doc", { action: "create", title: "Old scratch", markdown: "scratch", show: false });
```

## 3. Tasks

The verifier checks the page's state or the agent's answer, never the exact calls. "Optimal" is the shortest correct sequence; it is used for the excess-call metric, not for pass or fail.

**Held-out set: E3, E7 and E11.** Do not tune descriptions against them. Run them only at the baseline and at the end.

| # | Prompt (user voice) | Seed | Verifier | Optimal calls | Probes |
| --- | --- | --- | --- | --- | --- |
| E1 | "Which part of the brain recognizes faces, and show me where it is." | none | The answer names the FFA, and `get_context` has `at: "region:ffa"` or `view.focus: "ffa"` | search → go (2) | search then go; reading results |
| E2 | "Hide the skull and show just the LGN and V1, seen from the left." | none | `get_context.view`: `isolate.regions` is {lgn, v1}, `layers.skull` is 0, `yaw` is about 90 | set_view (1) | first-call validity on the largest schema; region id forms |
| E3 *(held out)* | "Give me a 1-minute narrated tour of how sound gets from the ear to cortex." | none | A tour started with at least 3 stops whose refs include cochlea, ic, mgn and a1 in that order, each with a caption (`get_context.tour` during the run; the transcript for the stops) | outline(topic:hearing) → start_tour (2) | start_tour vs walkthrough |
| E4 | "Quiz me on vision: 5 questions, including one where I click the region." | none | A quiz with 5 valid questions, at least one `region` kind, and its card open (`get_context.quiz`) | quiz (1) | nested schema; answer shapes; `show_me` vs the quiz ref |
| E5 | "Fix the typo in the second paragraph of my attention notes." | attention notes | The second paragraph says "activity", not "activty"; no other block changed (`read(doc, full)` before and after) | outline(docs) → outline(doc) → edit_blocks (3) | finding a doc's ref; `rev`; recovery |
| E6 | "Save the current 3D view into my attention notes under the heading 'Priority map'." | attention notes | A `view` block directly after the "Priority map" heading | outline(docs) → outline(doc) → edit_blocks (3) | anchors; `view: "current"` |
| E7 *(held out)* | "How did I do on the vision quiz? Open it again so I can retry the ones I missed." | vision quiz with 2 of 3 right | The answer says 2 of 3 and names the missed question; the **quiz card** is open (`get_context.quiz`), not an editor window | outline(docs) → read(results) → quiz open (3) | go vs window vs quiz |
| E8 | "Delete my old scratch doc." Then, as a second message: "Actually, bring it back." | old scratch | Deleted after the first message; restored after the second (`outline({ ref: "docs" })`) | outline(docs) → doc delete → doc restore (3) | delete confirmation; use of the returned `restore` |
| E9 (recovery) | Same as E5. Between the agent's read and its write, bump the block's rev (edit the paragraph by hand, or `edit_blocks` it from the shim) | attention notes | Final text correct after one retry that used `current.rev` from `stale_rev` | E5 + 1 | stale_rev handling |
| E10 (negative) | "What's the capital of Australia?" Then: "Summarize this conversation." | none | **No** guide tool called | 0 | false-positive tool use |
| E11 *(held out, negative)* | "Search the web for recent papers on the pulvinar." | none | The agent does not answer from guide `search` alone: it uses web search, or says the guide's sources are limited and dated | none required | `search` name collision (R10) |
| E12 (orientation) | Cold start: "What can you do with this page?" | none | The answer mentions reading, 3D control, walkthroughs or tours, docs and quizzes, in 3 calls or fewer | get_context / outline / read help | discoverability of `help` |

### Checking state by hand

```js
const ctx = await agentDebug.call("get_context", {});
ctx.at; ctx.view; ctx.tour; ctx.quiz; ctx.windows;          // E1, E2, E3, E4, E7
await agentDebug.call("outline", { ref: "docs" });            // E8, and to find refs
await agentDebug.call("read", { ref: "doc:<id>", detail: "full" });     // E5, E6, E9
await agentDebug.call("read", { ref: "quiz:<id>", detail: "results" }); // E7
```

## 4. Metrics

Per task and model, report the mean over runs.

| Metric | Definition |
| --- | --- |
| Success | The verifier passes |
| First-call precision | The first guide-tool call is one of the optimal tools |
| Invalid calls | `bad_input` plus `unknown_ref` results in the task |
| Excess calls | Guide-tool calls minus the optimal count |
| Recovery | Success after the first error, over tasks that had an error |
| Tokens | Tool-definition tokens plus result tokens (track A) |
| Wall time | From prompt to final answer |
| Confirmations | Confirmation prompts shown (track B); fewer is better on non-destructive tasks |
| False positives | Any guide tool called in E10; guide-only answer in E11 |

## 5. Procedure

1. **Baseline:** the tools at the commit under test, both tracks, all 12 tasks.
2. Change **one** thing at a time (one description, one schema field, one name). Re-run the non-held-out tasks after each change. Keep it only if success or first-call precision rises and nothing else drops.
3. After each round, put the failing transcripts together and list the confusions, including what the agent did **not** try. Fix the tool, not the prompt, and avoid patches that only fit one task.
4. Finish with the held-out set on both tracks. Ship when held-out success is at least baseline + 10 points and E10 and E11 do not regress (a judgement call; adjust after the baseline).

Candidate changes still open: tool-name prefixes (`guide_search`, `guide_read`, … behind a URL flag; R10), dynamic registration on the kill switch (G5), and `$ref` for the region enum once ChatGPT is known to resolve it.

## 6. Questions this also answers about ChatGPT

- [ ] Does ChatGPT use annotations other than `readOnlyHint` in its safety review?
- [ ] Does `untrustedContentHint` spotlight, sanitize or **hide** doc text? (If hidden, E5, E6 and E7 fail; drop the hint from `read` first.)
- [ ] Does it decode site-tool arguments strictly? That decides whether `anyOf` and optional fields matter.
- [ ] Does it prefix site-tool names in the model's view?
- [ ] Does it accept `$ref` in `inputSchema`?
- [ ] Does it refresh the tool list after registration and after abort (G5)?
- [ ] Does it pass a cancellation `signal` to `execute`?

## 7. Scorecard

Copy this block per run. Commit: `_______` · Date: `_______` · Track: A / B · Model: `_______` · Change under test: `_______`

| # | Runs | Success | First-call precision | Invalid calls | Excess calls | Recovery | Tokens | Time | Confirmations | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | /5 | | | | | | | | | |
| E2 | /5 | | | | | | | | | |
| E3 *(held out)* | /5 | | | | | | | | | |
| E4 | /5 | | | | | | | | | |
| E5 | /5 | | | | | | | | | |
| E6 | /5 | | | | | | | | | |
| E7 *(held out)* | /5 | | | | | | | | | |
| E8 | /5 | | | | | | | | | |
| E9 | /5 | | | | | | | | | |
| E10 | /5 | | n/a | | | n/a | | | | false positives: |
| E11 *(held out)* | /5 | | n/a | | | n/a | | | | false positives: |
| E12 | /5 | | | | | | | | | |
| **Mean** | | | | | | | | | | |

Transcript folder for this run: `_______`
