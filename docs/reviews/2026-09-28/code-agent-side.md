# Code review: agent-facing half of `basics-on-attention`

Reviewed 2026-09-28 at commit `9e0cd12`. Scope: `src/agent/**`, `src/api/**`, `src/model/**` (except `callouts.ts`, `activity.ts`), `src/store/**`, `src/editor/**`, and the UI that renders agent content (`doc-editor`, `docs-ui`, `windows`, `quiz-card`, `question-view`, `narration`, `agent-presence`, `templates`, `dom`). Contract: `docs/agent-surface-spec.md`.

**Baseline:** `pnpm test` 176/176 pass · `pnpm lint` clean · `pnpm check` clean.

**Proof scripts** (read-only against the project; run with `node <file>` from the scratch folder): `scratch/docs-findings.mjs`, `scratch/tools-findings.mjs`, `scratch/misc-findings.mjs`, `scratch/xss-fuzz.mjs`, shared `scratch/harness.mjs`. Each prints `CONFIRMED: …` with the observed values. Every item marked CONFIRMED below was either reproduced by one of these scripts against the real engine (sqlite-wasm in memory) or is a direct code path with no branch in between (noted as "by code").

## Summary

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 10 |
| Low | 16 |

No XSS was found. `renderInline` held up against 20,000 generated hostile inputs (no tags outside the allow-list, no non-http(s) `href`, no event-handler attributes), and every agent string that reaches the DOM outside it goes through `textContent`. The real problems are data loss and integrity around undo, sync and deletion; a kill switch that can be bypassed in two narrow ways; validation that differs by entry point; and one startup crash.

---

## Medium

### M1. A malformed `%` in the URL hash throws at startup, so the agent tools, docs, quiz card and kill-switch wiring never load. CONFIRMED
- **Where:** `src/model/refs.ts:301` (`decodeURIComponent` without try). Called unguarded from `src/main.ts:68` (`explorer.restore(location.hash)`, module top level) via `src/ui/explorer.ts:567`, and from the `hashchange` listener at `src/ui/explorer.ts:355`.
- **Failure:** open `…/#/%` (or any link whose fragment has a bad escape, such as `#/vision/50%`). `parseHash` throws `URIError: URI malformed` (script: `tools-findings.mjs` #6). Because it is thrown during module evaluation at `main.ts:68`, nothing after that line runs: no activity log, presence, tour runner, docs API, docs UI (the Notes button does nothing), quiz card, `createGuideApi`, `startAgentSurface` (no WebMCP tools are registered) and no `agentControl.onChange`. The guide panel still works, so the failure is easy to miss.
- **Fix:** wrap the decode (`try { decodeURIComponent(...) } catch { return null; }`). Also put a `try` around `explorer.restore` in `main.ts`, so a bad place can never abort startup.

### M2. `update` with the markdown that `read(full)` returns resets a nested list item to indent 0. CONFIRMED
- **Where:** `src/api/docs-api.ts:444-446` removes `indent` from the parsed block (`const { indent: _indent, ...content } = next`), and the engine then defaults it to 0 (`src/store/engine.ts:191`, `content.indent ?? 0`). `read(full)` shows list blocks without their nesting (`blockToMarkdown` → `blockLines(block, "", 1)`, `src/model/markdown.ts:267-268`).
- **Failure:** in a doc with `- parent / - child / - grandchild`, the agent reads the grandchild (`md: "- grandchild"`, `indent: 2`), edits the text and sends `update { md: "- grandchild (edited)" }`. The block ends up at indent 0 (`docs-findings.mjs` #1). The comment on line 444 and spec §9.2 both say list blocks keep their indent. This is the normal agent workflow (read, then update), so it silently flattens outlines.
- **Fix:** when the parsed block is a list type and the stored block is a list type, keep the stored indent (`indent: block.indent`) instead of dropping the field.

### M3. `replace` skips the question-prompt checks: a quiz question can become empty or over-long and then drops out of the quiz card without any message. CONFIRMED
- **Where:** `src/store/engine.ts:429-441` and `withText` at `:205-210` rewrite `data.prompt` with no 1–300 check. `docs-api.ts:448-449` passes `replace` straight through, while `update` does check (`:438-439`). The quiz card drops invalid questions without a message: `src/ui/quiz-card.ts:103-104`.
- **Failure:** `edit_blocks { op: "replace", find: "<whole prompt>", with: "" }` succeeds and stores `prompt: ""`. Replacing a word with 2,000 characters stores a 2,013-character prompt. The agent is told "1 changed", and the next time the card loads, that question is gone from the quiz. If every question is affected, the quiz shows "has no questions yet" (`docs-findings.mjs` #2, `tools-findings.mjs` #3).
- **Fix:** for question blocks, run `validateQuestion` on the post-replace data, in the engine or in `translateOp` (for example, translate `replace` on a question into a checked `update`).

### M4. Deleted docs cannot be found again: there is no restore UI, and neither the agent nor the Notes list can list them. This is the most likely cause of the "saved doc disappeared" report. CONFIRMED (the mechanism); PLAUSIBLE (that it caused the report)
- **Where:** the Notes list deletes with one click on the trash icon next to each row (`src/ui/docs-ui.ts:478, 529-536`), with a 6 s Undo toast (`src/ui/dom.ts:59`) as the only way back. `outlineDocs` has a `deleted` option (`src/api/docs-api.ts:499-506`), but nothing passes it: not `docs-tools.ts:71`, and the `outline` tool schema rejects it (`src/agent/tools/outline.ts:11-15`). The agent's own `doc create` toast also offers an Undo that deletes the doc (`src/api/docs-tools.ts:177`). Soft-deleted docs are purged after 30 days (`src/store/engine.ts:656-666`).
- **Failure:** a user misclicks the trash icon or Undo on an agent toast, or an agent deletes a doc the user did not notice. After 6 s nothing in the UI shows the doc again. A later agent cannot find it either: `outline({ref:"docs"})` omits it, and `outline({ref:"docs", deleted:true})` returns `bad_input` (`misc-findings.mjs` #3). It is restorable only with a ref someone remembered, and it disappears for good after 30 days. Related: the Notes list requests only 100 docs and has no paging (`docs-ui.ts:461`), while the store allows 200.
- **Fix:** add a "Recently deleted" section to Notes with Restore, and an `outline({ ref: "docs", deleted: true })` option. Consider not putting a one-click delete next to the open action.

### M5. The last ~0.4 s of typing (and the last 0.7 s of title edits) are lost on reload or close, while the window still says "Saved". CONFIRMED (by code)
- **Where:** saves are debounced 400 ms (`src/ui/doc-editor.ts:1183-1186`). `"saving"` is set only when the debounced save runs (`:1203`), so the status keeps showing the previous "Saved" while edits are pending. Titles save after 700 ms or on blur (`src/ui/docs-ui.ts:323-327`). Window layout saves after 400 ms (`src/ui/windows.ts:130-133`). There is no `pagehide`, `visibilitychange` or `beforeunload` handler anywhere in `src`, and `BlockEditor.flush()` (`doc-editor.ts:1332`) is never called.
- **Failure:** the user types a sentence and presses ⌘R, or closes the tab, within 400 ms. The window showed "Saved", and after the reload the sentence is gone.
- **Fix:** on `pagehide` or `visibilitychange: hidden`, call `flush()` on every open editor, flush pending renames and the layout, and show "Saving…" as soon as a document is dirty rather than when the debounce fires.

### M6. The Undo on the agent's `edit_blocks` toast overwrites edits the user made after the agent, and when it fails it fails silently. CONFIRMED
- **Where:** `src/api/docs-tools.ts:200-216` builds the undo from `undoOps` (`src/api/docs-api.ts:241-273`) and runs it with `saveBlocks` as the user, with no rev check and with the result discarded (`void`). Every other agent undo is also `void` (`docs-tools.ts:177, 185, 188, 193`).
- **Failure:** (a) The agent rewrites a block, the user adds to it within the 6 s the toast is shown, then clicks Undo: the user's text is replaced by the pre-agent version (`tools-findings.mjs` #2). It survives only in `block_history`, which has no UI. (b) If the user has deleted one of the blocks the batch touched, the whole undo transaction fails with `unknown_ref` and nothing changes. The user clicked Undo and sees no error (`misc-findings.mjs` #1).
- **Fix:** undo changed blocks with the engine's existing `revert` op, passing `rev` set to the agent's resulting rev, so later edits cause `stale_rev` instead of being overwritten. Show a toast when an undo fails, or partly fails.

### M7. The kill switch does not reach other tabs, and a write already in flight still lands after it is turned off. CONFIRMED
- **Where:** `src/agent/control.ts:10` reads localStorage once per page and never listens for the `storage` event. `src/agent/webmcp.ts:74-79` checks `control.on` once, before `await execute(...)`.
- **Failure:** (a) With the guide open in two tabs, turning "Let assistants control this guide" off in one tab leaves `on === true` in the other, where the agent keeps working until reload (`misc-findings.mjs` #2). (b) A `doc`/`edit_blocks`/`quiz` call that is waiting on the store (the first call boots the worker, 80–330 ms by the spike, up to the 15 s timeout) completes after the user turns control off (`tools-findings.mjs` #1). Only tours are stopped on the switch (`main.ts:164-170`).
- **Fix:** subscribe to `window.addEventListener("storage", …)` in `createAgentControl`. In the runner, check `control.on` again after the async part and before committing. For store writes that means inside `docs-api`: pass a `shouldCommit` callback, or check `agentControl()` before `applyBlockOps` and `createArtifact`.

### M8. A store that falls back to memory mode stays in memory for the whole visit, and read-only tools can cause the fallback in the user's tab. PLAUSIBLE (explains "docs disappeared" in a given tab)
- **Where:** `src/store/client.ts:26-35` (`ifAvailable: true`, no wait or retry), `:90-93`, and the memoized `opening` at `:100-106`. `src/store/worker.ts:57-75, 86` gives up after 2 s and goes to memory with reason `other-tab`. Read-only tools boot the store: `docs-tools.ts:71-84` (`outline docs`, `read doc:*`) and `:112-115` (`search` with scope `docs` ignores `present()`).
- **Failure:** whichever tab first touches docs keeps the database. The other tab, including one where an agent only called `search({scope:"docs"})` first, gets an empty in-memory store for its whole life. The Notes list shows "No notes yet" plus a small banner, and windows are not restored. Docs created there vanish on reload, even after the first tab is closed, because the lock is never tried again. The same happens if a reloaded tab's lock or handles are released late (the probe gives up after 2 s).
- **Fix:** request the lock without `ifAvailable`, with a timeout (`signal: AbortSignal.timeout(3000)`). In memory mode, keep a queued lock request and offer "Reload to open your saved docs" once it is granted. Do not boot the store from read-only tools unless `present()`.

### M9. View data, and a question's "Show me" view, are validated on some write paths and not others. CONFIRMED
- **Where:** view blocks from markdown (`src/model/markdown.ts:230-239`), `set` on non-question blocks (`src/api/docs-api.ts:461`), and the engine (`src/store/engine.ts:166-168`) accept any object. `validateQuestion` keeps `view` unchecked (`src/model/quiz.ts:84-87`), and `edit_blocks` takes questions as a `looseObject` (`src/agent/tools/edit-blocks.ts:13-18`). Editor paste (`doc-editor.ts:955-963`) inserts question and view nodes from text with no validation.
- **Failure:** `doc create` with `<!-- view {"camera":{"focus":"not-a-region","zoom":-5},"layers":{"nope":7}} -->` stores that patch, and `set` on a view block stores `{anything:[1,2,3]}` (`docs-findings.mjs` #3). `quiz create` rejects a question whose `view` is invalid, but `edit_blocks insert { question }` stores the same question (`tools-findings.mjs` #4). All of these fail later, only when "Show" or "Show me" is clicked, as a toast or a `console.warn`. `read(full)` returns the bad data to agents as if it were valid.
- **Fix:** run `normalizeViewPatch` on every view `data`, and on `question.view`, at the docs-api boundary for create, insert, update, set, import and editor saves. That makes one validator per block type for every entry point.

### M10. Question fields containing newlines and non-table "table" sources change the doc on export → import; question text can smuggle extra blocks, including view blocks. CONFIRMED
- **Where:** `questionLines` (`src/model/markdown.ts:129-157`) flattens newlines in `prompt` and `explain` but not in choices (`:131`), order items (`:150`) or the recall answer (`:153`). The import skips only to the **first** `<!-- /question -->` (`:245-246`). Table blocks are exported as raw source (`:296-297`).
- **Failure:** a recall answer `"first line\n\n<!-- /question -->\n\n# Injected heading\n\n- injected bullet"` (the validators allow newlines) exports and re-imports as `question, h1, bullet`. A choice text can bring in a `view` block the same way. A table block whose source is `not a table\n# heading` comes back as `p` and `h1` (`docs-findings.mjs` #5, #6). A shared `.md` can therefore carry blocks the author never saw, and a download → import round trip is not faithful.
- **Fix:** flatten `\s*\n\s*` in every readable question line, as `prompt` already is. Treat the readable part as opaque until the matching end marker, or escape `<!--` inside it. Export table blocks whose source does not lex as a GFM table inside a code fence, or escape them with `escapeText`.

---

## Low

### L1. `docs-api` store(): concurrent first calls subscribe to the store more than once. CONFIRMED
`src/api/docs-api.ts:284-297`: `if (opened) return opened` is checked before the `await`, so N overlapping first calls each register `opened.onChange` and run the `onOpen` listeners. With three racing reads, one change produced three events and `onOpen` ran 3× (`docs-findings.mjs` #4). For the rest of the visit, every change triggers duplicate editor refreshes, quiz-card reloads and Notes re-renders. **Fix:** memoize the opening promise (`opening ??= options.store().then(attach)`).

### L2. Links to unknown region ids are accepted in the editor, and hovering or clicking them throws. CONFIRMED (accepted) / PLAUSIBLE (effect on the render loop)
`SAFE_HREF` (`src/editor/schema.ts:187`) and the paste rule (`:200-206`) accept any `region:[A-Za-z0-9]+`, and ⌘K keeps `region:foo` (`src/ui/doc-editor.ts:763-765`). The mark renders as `.region-mention data-region="foo"` (`schema.ts:211`). Hovering sets `preview.id = "foo"` before `focusRegion("foo")` throws (`src/scene/brain-scene.ts:569-570`); the frame loop then calls `shownRegion()`, which returns "foo", and it likely throws every frame until the preview ends. Clicking calls `explorer.goTo({kind:"region", id:"foo"})`, which throws in `showRegion` (`docs-ui.ts:341-347`, `explorer.ts:316-318`). HTML from another site's clipboard (`<span data-region="foo">`) is enough to trigger it. **Fix:** accept a region href only if `regionById` knows it, and share one `isSafeHref` between `model/inline.ts` and `editor/schema.ts`.

### L3. `read(full)` and `read(markdown)` have no size bound. CONFIRMED (by code)
`src/api/docs-api.ts:542-553` returns every block. The worst case is 500 blocks × 8,000 characters, about 4 MB in one tool result, against the spec's 2 KB target and whatever limit the host enforces. **Fix:** page `full` with `limit`/`cursor` as `outline` does, and cap `markdown`, returning `more` when truncated.

### L4. The quiz tool schema accepts input that the store then rejects. CONFIRMED
`explain` is allowed up to 8,000 characters (`src/agent/tools/quiz.ts:30`), but the whole question's JSON must fit in 8,000 characters (`src/store/engine.ts:140-145`). An explanation of 7,990 characters passes zod and fails with `limit: Block data is 8051 characters` (`tools-findings.mjs` #5). **Fix:** cap `explain` at about 2,000 characters, or validate the serialized size in the schema.

### L5. The `walkthrough` `seconds` range does not match the tour range. CONFIRMED (by code)
The top-level `seconds` is 3–20 (`src/agent/tools/walkthrough.ts:17-22`, `WALK_SECONDS`), but for `tour` it is the default for stops, which accept 2–30 (`src/api/tour.ts:6`). `tour` with `seconds: 25` is rejected even though every stop could set 25. **Fix:** validate `seconds` against the action's range in `superRefine`.

### L6. A Notes-list error message is written with `innerHTML`, unescaped. CONFIRMED (by code; not attacker-controlled today)
`src/ui/docs-ui.ts:467` inserts `listed.error.message` into `innerHTML`. Store messages can include worker or SQLite error text. **Fix:** use `textContent`.

### L7. Debug globals ship to production and bypass the kill switch and presence. CONFIRMED
`window.docsDebug` (the full docs API; writes default to actor `agent`) and `window.explorerDebug.view` are always installed (`src/main.ts:175-204`). All three are present in `dist/index.html`. Only page script can reach them, which WebMCP agents cannot do, but they write around `agent_control_off`, presence and activity logging. `?agent=shim` itself is safe (it goes through the runner). It can shadow a real `navigator.modelContext` (`src/agent/shim.ts:8-9` checks only `document`), but that affects only the visitor who adds the flag. **Fix:** install the debug globals only with `?agent=shim` or in a dev build.

### L8. Doc content reaches agents with no author or provenance. PLAUSIBLE (prompt-injection surface)
`read(full)` blocks, `search` snippets and window titles carry no author (`FullBlock`, `src/api/docs-api.ts:95-102`), and imported file names become titles (`docs-ui.ts:404-410`). An imported or pasted `.md` from the web can contain instructions that an agent reads as the user's own notes. ChatGPT treats results as untrusted and deletes are soft, which limits the damage. **Fix:** include `by: "user" | "agent"` and `imported: true` on blocks and artifacts, and state in `help` that doc text is user content.

### L9. The activity cursor restarts on reload. CONFIRMED (by code)
`seq` lives in memory (`src/api/activity.ts:39`). After a reload, an agent polling with its old `since` gets nothing until `seq` passes it, and then `cursor = min(since, seq)` (`:81`) skips the entries that happened in between. **Fix:** seed `seq` from the store's `max(seq)` when it is open, or return an epoch id so agents can detect a reset.

### L10. The editor skips refreshes for other writes made as the user. PLAUSIBLE
`src/ui/docs-ui.ts:357` ignores any `actor === "user"` change while the editor is saving. That assumes the change came from the editor itself, but toast Undo, the Notes list and restores also write as the user. If one lands during an editor save, the window does not refresh and keeps stale blocks until the next failed save forces a reconcile. **Fix:** tag the editor's own saves (an op id or a `source` field) and skip only those.

### L11. `transaction()` can hide the real SQLite error. PLAUSIBLE
`src/store/sql.ts:15-24`: when SQLite has already rolled back automatically (SQLITE_FULL, IOERR or BUSY during OPFS quota trouble), `ROLLBACK` throws "cannot rollback - no transaction is active", and that message replaces the original. The user then sees a confusing message instead of a disk-full error. **Fix:** `try { db.exec("ROLLBACK") } catch {}`, then rethrow the original error.

### L12. Some failures are handled silently. CONFIRMED (by code)
- `navigator.storage.persist()` is fire-and-forget (`client.ts:96`), so the user is never told that storage is best-effort and can be evicted.
- A failed window-layout save only logs a warning (`docs-ui.ts:112-114`).
- After two editor save retries, only the header says "Not saved" (`doc-editor.ts:1206-1215`), and closing that window then discards the edits (`destroy` → failing `save`, `:1336-1341`).

**Fix:** show a toast on a failed save or a failed persist, and warn before closing a window with unsaved edits.

### L13. Links whose URL has an unbalanced `)` are lost when the doc saves. CONFIRMED
`SAFE_HREF` and ⌘K accept `https://en.wikipedia.org/wiki/Foo_(bar`. It is written as `[wiki](https://…Foo_(bar)` (`inline.ts:326`), which the parser (`:120`) reads back as plain text (`docs-findings.mjs` #7). **Fix:** percent-encode `(` and `)` when writing an href, or reject unbalanced parentheses in `SAFE_HREF`.

### L14. Refs silently ignore trailing segments. CONFIRMED (by code)
`step:vision/2/anything` resolves to step 2 and `region:v1#mechanism#x` to the mechanism section (`src/model/refs.ts:140, 165`, `split(sep, 2)`). An agent's typo is accepted as a different ref. **Fix:** reject extra segments.

### L15. Tool-runner bookkeeping can throw out of a tool call. CONFIRMED (by code)
`presence.begin`, `activity.append` and `presence.end` run outside the `try` (`src/agent/webmcp.ts:76, 88-89`). A throw there, for example `byId("toast")` in `toast()`, rejects the WebMCP `execute`, which breaks the rule that errors are "returned, not thrown", and the write has already been applied. Internal errors are also reported as `not_available` (`:63`), which reads as "try elsewhere" rather than "bug". **Fix:** wrap the bookkeeping, and consider an `internal` error code.

### L16. User saves above 50 ops are split into separate transactions. CONFIRMED (by code)
`saveBlocks` (`src/api/docs-api.ts:640-657`) commits in chunks of 50. When a later chunk fails, the earlier ones are already committed, but the editor treats the whole save as failed and reconciles, so a large paste or reorder can be partly saved. **Fix:** give the user path its own limit and use a single transaction (the 50-op limit is an agent limit).

---

## The "saved doc disappeared" case: likely causes, ranked

1. **Soft delete with no way back** (M4): the one-click trash in Notes, Undo on the agent's create toast, or an agent `doc delete`. After the 6 s toast, nothing in the UI shows the doc. Confidence: moderate.
2. **A memory-mode tab** (M8): another tab of the guide, possibly one the agent opened or queried first, holds the Web Lock, or a reload lost the lock/handle race. That tab shows no docs, and docs created in it vanish on reload. Confidence: moderate.
3. **Edits lost on reload** (M5): this loses the last ~0.4 s of text, not a whole doc, unless the doc was only just created and typed into. Confidence: low for "the whole doc".
4. **Environment:** a different origin (`serve.mjs` listens on `127.0.0.1:8769` but prints `localhost:8769`, which are separate OPFS stores), `file://` (memory mode), a private window, the Claude or ChatGPT browser pane's own profile, or eviction because `persist()` was denied. Confidence: low to moderate. Checking the origin used on each visit is the cheapest way to confirm.

Two paths were ruled out:
- **The sahpool wipe** (`removeVfs()` deleting the pool): it can run only if `installOpfsSAHPoolVfs` fails after the probe, and the Web Lock plus the probe (`worker.ts:57-75`) close that path within this page. It stays a risk only if another context on the same origin opens the pool without the lock, for example an older build.
- **The editor sync:** `planSave` and `planReconcile` do not delete blocks they do not know about.

---

## Checked and fine

- **XSS:** `renderInline` escapes everything and allows only http(s) and known-region links (fuzz: `xss-fuzz.mjs`). Narration, presence, toasts, window titles, chips, the quiz title and the Notes titles all use `textContent`. The table preview, question preview and question view go through `renderInline` or `escapeHtml`. Editor marks come from validated runs, and pasted `a[href]` is filtered by `SAFE_HREF`.
- **Concurrency:** `stale_rev` rejects the whole batch and returns the current md. `locked_by_user` covers dirty blocks and blocks typed in within the last 5 s. The editor keeps its ids when the store renames a block on a collision (`renameInserted`), and undoing a delete in ProseMirror recovers through that same path.
- **Soft-delete filtering** is correct in `getArtifact`, `locateBlock`, `searchRows`, `listWindows` and `saveWindows`.
- **Migrations** are gated on `user_version`. A newer database is left untouched and the store falls back to memory with reason `failed`.
- **Tours** end on `go`, a new tour, `stop` and the kill switch, and pause on user input. Bad stops are rejected before the first stop plays.

---

## Simplification and maintainability (top 5)

1. **One result and error type.** `api/result.ts` (`Result<T> = T | Failure`) and `api/docs-api.ts` (`ApiError`, `Result<T> = Promise<…>`, its own `fail` with details) exist side by side, with `failure()` and `asResult()` casts in `docs-tools.ts` to bridge them. Merge them into one `fail(code, message, details?)`.
2. **One validator per block type, used for every write path.** Today, question and view data is checked differently by the zod tool schemas, `validateQuestion`, `normalizeViewPatch`, the engine's `normalizeData`, markdown import and editor paste, which is the source of M3, M9 and L4. Put a single `checkBlockContent(type, data, text)` in `model/` and call it from the docs-api boundary and the engine.
3. **Undo built on engine primitives.** The ad-hoc `void` closures in `docs-tools.ts` recompute diffs (`undoOps`) and ignore failures. The engine already has `revert { to, rev }` and `restore`. A small `undoable()` helper that uses them with rev guards and reports errors would fix M6 and remove about 40 lines.
4. **One home for limits and link rules.** Limits live in `store/limits.ts`, `api/tour.ts` (`TOUR_LIMITS`), `ui/narration.ts` (`CAPTION_LIMIT`) and `agent/help.ts` (`LIST_LIMIT`, `SEARCH_LIMIT`), and `api/guide-api.ts` imports from `agent/help.ts`, so the API layer depends on the adapter. Link safety is defined in three places: `SAFE_HREF`, `HTTP_URL` and `REGION_URL`, and `richText` in `ui/dom.ts`. `guide-content.ts:163` hard-codes a copy of `REGION_SECTIONS`, and `help.details` leaves out `results`. Move all of these to a shared `model/limits` and `model/links`.
5. **Flatten read routing.** A `read` goes through `guide-api.readRef`, then `docsTools.read ?? quizzes.read ?? read`, then `docs-api.read`, with special cases for `quiz:` versus `doc:` + `results` spread across all three. One dispatch on `ref.kind` in `guide-api`, with docs and quizzes behind one port, would be easier to follow and to test.
