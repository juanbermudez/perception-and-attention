# WebMCP: current state (2026-09-28) and review of `basics-on-attention`

Project reviewed: `~/Desktop/basics-on-attention`. No project files were changed. All line numbers refer to the working tree at `9e0cd12`.

How much to trust each claim:
- **Spec** means the normative CG draft (`index.bs`) or its explainer README.
- **Vendor doc** means the Chrome or OpenAI product documentation.
- **Probe** means a dated manual test by a third party (MCP-B) against a real ChatGPT build.
- **Blog** means community or opinion writing.

Confidence is marked H (high), M (moderate) or L (low).

---

## 1. The current API, with citations

Sources:
- Spec: [WebMCP Draft CG Report, dated 28 September 2026](https://webmachinelearning.github.io/webmcp/), source [`index.bs`](https://github.com/webmachinelearning/webmcp/blob/main/index.bs)
- Explainer: [README](https://github.com/webmachinelearning/webmcp)
- Change history: [commit log for `index.bs`](https://github.com/webmachinelearning/webmcp/commits/main/index.bs)

### 1.1 Where the API lives

- It is `document.modelContext`: `partial interface Document { [SecureContext, SameObject] readonly attribute ModelContext modelContext; }`.
- The getter moved from `Navigator` to `Document` on 2026-05-27 (commit `c7b5c702`).
- `navigator.modelContext` is no longer in the spec. [MCP-B](https://docs.mcp-b.ai/) calls it a "deprecated compatibility alias". Community blogs say Chrome 150 kept it as an alias and Chrome 153 removed it (Blog, L).

### 1.2 `ModelContext` IDL (spec, H)

```webidl
[Exposed=Window, SecureContext]
interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options = {});
  Promise<sequence<RegisteredTool>> getTools(optional ModelContextGetToolOptions options = {});
  Promise<DOMString> executeTool(RegisteredTool tool, optional any inputObject, optional ModelContextExecuteToolOptions options = {});
  attribute EventHandler ontoolchange;
  attribute EventHandler ontoolactivated;
  attribute EventHandler ontoolcancel;
};
dictionary ModelContextTool {
  required DOMString name; USVString title; required DOMString description;
  object inputSchema; required ToolExecuteCallback execute; ToolAnnotations annotations;
};
dictionary ToolAnnotations {
  boolean readOnlyHint = false; boolean untrustedContentHint = false;
  boolean consequentialHint = false; boolean debugging = false;
};
dictionary ToolExecuteCallbackOptions { required AbortSignal signal; };
callback ToolExecuteCallback = Promise<any> (object inputObject, ToolExecuteCallbackOptions options);
dictionary ModelContextRegisterToolOptions { sequence<USVString> exposedTo; AbortSignal signal; };
```

### 1.3 Names that no longer exist (spec history, H)

| Removed | When | Commit |
| --- | --- | --- |
| `provideContext()` and `clearContext()` | 2026-03-05 | `fe84c677` |
| `unregisterTool(name)`; aborting the registration `signal` replaces it | 2026-03-26 | `6708e339` |
| `ModelContextClient` and `client.requestUserInteraction()`; `execute` now receives `(input, { signal })` | 2026-06-11 | `067a1c90` |

- Chrome's [secure-tools page](https://developer.chrome.com/docs/ai/webmcp/secure-tools) still says the draft "includes `requestUserInteraction()`". That is stale.
- The README's Open Questions list user elicitation as unresolved ([#165](https://github.com/webmachinelearning/webmcp/issues/165), [#50](https://github.com/webmachinelearning/webmcp/issues/50)).
- `destructiveHint`, `idempotentHint` and `openWorldHint` are **MCP** annotations, not WebMCP ones. The spec only has `readOnlyHint`, `untrustedContentHint`, `consequentialHint` (added 2026-09-03, `7b3f50f3`) and `debugging` (added 2026-09-17, `8a82bb78`; Chrome 156+).

### 1.4 How `registerTool()` behaves (spec, H)

- It returns a **Promise**. `registerTool()` became Promise-returning on 2026-06-08 (`ec37ec48`).
- The promise rejects in these cases:
  - `InvalidStateError`:
    - the document is not fully active;
    - a tool with the same name is already registered;
    - the name is empty, longer than 128 characters, or uses characters outside `[A-Za-z0-9_.-]`;
    - the description is empty.
  - `SecurityError` if the agent cluster is **not origin-keyed** (for example `Origin-Agent-Cluster: ?0` or `document.domain` enabled) and the scheme is not `file:`. This gate was added 2026-06-05 (`4733c275`).
  - `NotAllowedError` if the `tools` Permissions Policy is denied. The default allowlist is `'self'`, so cross-origin iframes need `allow="tools"`.
  - Whatever `JSON.stringify(inputSchema)` throws.
  - The abort reason, if the signal was already aborted.
- `inputSchema` is only JSON-serialized. The algorithm does not validate it as JSON Schema, although the domintro note says an "invalid" schema rejects.
- The browser **does not validate call arguments** against `inputSchema` either ([issue #92](https://github.com/webmachinelearning/webmcp/issues/92) is open).
- To unregister, abort `options.signal`. Since Chrome 153, unregistering does not cancel executions already in flight (commits `fca7462d` and `321d83cc`).

### 1.5 Execution and results (spec, H)

- `execute(inputObject, { signal })` is called. Its fulfilled value is JSON-serialized and becomes the result.
- **Any JSON value is valid**: an object, string, number, and so on. The spec does not require a `content[]` shape.
- The README example returns MCP-style `{ content: [{ type: "text", text }] }`. Chrome's examples return plain strings. ChatGPT's example returns a plain object.
- **Errors:**
  - If `execute` rejects or returns something that cannot be serialized, the caller gets `completionSteps(null, false)`. `executeTool()` then rejects with a bare `UnknownError`.
  - The error message is **not** forwarded; the spec only says to "optionally report a warning to the console".
  - So, per the spec, errors the agent must see have to be returned as values.
- **Cancellation:**
  - The tool's `options.signal` aborts when the caller aborts.
  - A `toolcancel` event (a `ToolCancelEvent` with `toolName`) then fires on `document.modelContext`.
  - `toolactivated` fires when execution starts.

### 1.6 Events (spec, H)

- `toolchange` fires when tools are registered or unregistered.
- `toolactivated` and `toolcancel` were added 2026-09-17 (`f5645e9a`).
- Chrome stops supporting `window.ontoolactivated` and `window.ontoolcancel` from Chrome 156 ([Chrome declarative doc](https://developer.chrome.com/docs/ai/webmcp/declarative-api)).

### 1.7 Declarative API

- The spec section is "entirely a TODO". The details are in the [declarative explainer](https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md) and [Chrome's doc](https://developer.chrome.com/docs/ai/webmcp/declarative-api).
- Form attributes:
  - `<form toolname tooldescription>` registers a tool;
  - `toolparamdescription` describes a field;
  - `toolautosubmit` submits the form automatically.
- `SubmitEvent.agentInvoked` tells the page an agent submitted, and `SubmitEvent.respondWith(promise)` returns the tool's output.
- **ChatGPT does not support it** ([OpenAI](https://learn.chatgpt.com/docs/webmcp)).

### 1.8 Security model and limits

- Requirements:
  - a secure context;
  - an origin-keyed agent cluster (`file:` is exempt);
  - the `tools` Permissions Policy.
- `exposedTo` shares a tool with other origins, and `getTools({ fromOrigins })` reads them.
- Tools are per `Document`. A same-document (hash) navigation keeps the Document and its tools; a cross-document navigation drops them.
- The only hard limit in the spec is **128 characters for the name**. [Issue #73](https://github.com/webmachinelearning/webmcp/issues/73) discusses other limits.
- The spec's §Security describes these threats:
  - tool poisoning;
  - output injection;
  - misrepresentation of intent;
  - over-parameterization.
- It names these mitigations:
  - `untrustedContentHint` (spotlighting, sanitizing or *hiding* untrusted output);
  - `consequentialHint` (mandatory confirmation);
  - `Permissions-Policy: tools=()`.

---

## 2. Client support

| Client | Status (2026-09-28) | API it reads | Result format it takes | Known gotchas | Source |
| --- | --- | --- | --- | --- | --- |
| **ChatGPT desktop built-in browser**, for ChatGPT Work and Codex | Shipping, subject to rollout. Needs GPT-5.6 Sol or GPT-6 Sol; Luna has WebMCP disabled. Not available in Enterprise or Edu. Users can turn it off in Settings > Browser > Permissions. | `document.modelContext` only; `navigator.modelContext` is `undefined` (probe) | **Any JSON value.** A 2026-08-27 probe saw objects, arrays and primitives preserved and `undefined` turned into `null`. `BigInt` and circular values fail. Thrown errors reach the agent as "Browser Use encountered an error…: Error: <msg>". | - Only a subset of the API. - No declarative tools. - No tools inside iframes, same-origin or not. - Every call gets a safety review, and definitions and results are treated as untrusted. - Tools vanish on navigation. - **Arguments are not checked against the schema**: missing required fields, wrong types, extra properties and out-of-range values all reached the handler. - The `signal` option was **absent**. - `ModelContext` is a plain object **without `addEventListener` or `ontoolchange`**. - Registration errors reject with an empty plain `Object`, not a `DOMException`. - The tool listing includes `readOnlyHint` and `untrustedContentHint`; `consequentialHint` came after the probe. - The **tool list refreshed after dynamic registration and after abort**. - `Permissions-Policy: tools=()` was **not** enforced. | [OpenAI Site tools](https://learn.chatgpt.com/docs/webmcp) (vendor doc); [MCP-B Codex probe](https://docs.mcp-b.ai/reference/webmcp/codex-site-tools) and [fixtures](https://github.com/WebMCP-org/npm-packages/tree/main/docs/research/codex-site-tools-2026-08-27) (probe, one build, M) |
| **Chrome** | Dev trial from 146 behind `chrome://flags/#enable-webmcp-testing`. **Origin trial in 149–156**; a third-party-token OT extension was filed 2026-09-28. **Without a token or the flag, `document.modelContext` is `undefined`.** | `document.modelContext`. Chrome 149 only had `navigator`, per blogs (L). | Any JSON; Chrome's examples return strings | - Needs an origin-keyed cluster (`Origin-Agent-Cluster: ?0` disables it). - Cross-origin iframes need `allow="tools"`. - DevTools Application ▸ WebMCP panel. - The Model Context Tool Inspector extension (Gemini 3 Flash) is for testing. - Which Chrome end-user agent actually calls tools in stable is not documented. | [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp), [imperative](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [Chrome Status](https://chromestatus.com/feature/5117755740913664), [OT blog](https://developer.chrome.com/blog/ai-webmcp-origin-trial), [DevTools](https://developer.chrome.com/docs/devtools/application/webmcp) |
| **Edge** | Origin trial in Edge 150 | As Chrome | As Chrome (assumed) | Which Edge agent consumes tools is not verified | [implementation-status.md](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md) |
| **Brave** | Experimental, in Leo AI | ? | ? | Not verified | same |
| **Firefox, Safari** | Standards-position requests only | – | – | – | same |
| **MCP-B** (`@mcp-b/webmcp-polyfill`, `@mcp-b/global`, Rook extension) | Polyfill plus MCP bridge. Latest `@mcp-b/global` is 5.1.0 | `document.modelContext`. Also mirrors a native `navigator` context onto `document`. | "Existing MCP responses pass through unchanged. Raw strings become text content, while other JSON values become text content plus `structuredContent`" (documented for the React hook; core assumed to match, M) | - Adds MCP-only extras (`outputSchema`, `destructiveHint`, and so on) as extensions. - Its type inference treats `$ref` and `oneOf` as `unknown`; this is a TypeScript typing limit, not a runtime one. | [docs.mcp-b.ai](https://docs.mcp-b.ai/), [llms-full](https://docs.mcp-b.ai/llms-full.txt) |

---

## 3. Best practices

S = spec or explainer; V = vendor doc (Chrome or OpenAI); B = blog or opinion.

1. **Count and budget.** Every tool's name, description and schema costs tokens. Too many tools cause confusion, or browsers may drop tools. There is no hard limit. (S: [README §Tool Strategy and Budget](https://github.com/webmachinelearning/webmcp#tool-strategy-and-budget); V: [Chrome best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices))
2. **Static first, dynamic when state changes.** Register statically for simple apps. Register and unregister according to page state for complex, multi-state apps. (S: README; V: Chrome: "Register tools when they're useful in a certain page state, then unregister when the tool is no longer usable" and "For most applications, static registration should be the default approach.")
3. **One function per tool, no overlap.** Use verbs that separate doing from starting (`create-event` versus `start-event-creation-process`). (S and V)
4. **Descriptions** should say what the tool does and when to use it. Use positive framing and "trust the agent"; don't script step-by-step procedures. (S and V)
5. **Minimize work for the model.** Accept raw input, use natural-language enum values, and describe every parameter. (S and V)
6. **Validate strictly in code, loosely in schema.** Return actionable errors so the agent can self-correct. (S and V) ChatGPT does not validate against the schema (probe), so code validation is essential.
7. **Fail gracefully.** Give context-aware recovery messages, never generic errors or silence. (V: [Build effective tools](https://developer.chrome.com/docs/ai/webmcp/build-tools); [Evals](https://developer.chrome.com/docs/ai/webmcp/evals) asks whether the error says "retry" or "critical")
8. **Keep the UI in sync.** Update the page immediately; agents and people share the session. (S and V) OpenAI: "describe side effects, and return enough information to verify the result."
9. **Annotations:** (V: [Chrome secure-tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools); S: §mitigations)
   - `readOnlyHint` on tools that don't change state;
   - `untrustedContentHint` on tools that return user-generated or external content;
   - `consequentialHint` on significant, real-world or irreversible actions.
10. **Character budgets** (V: Chrome secure-tools, "subject to change"):
    - ≤ 500 characters per tool description;
    - ≤ 150 characters per parameter description;
    - ≤ 30 characters per tool or parameter name;
    - ≤ **1.5K characters per tool output**.
11. **Prompt injection.** Tool descriptions and results are untrusted to the agent. Don't put instructions in results. Don't expose tools to untrusted origins; the default, with no `exposedTo`, is right. (S §Security; V: OpenAI and Chrome)
12. **User confirmation.** No page-side API exists any more (`requestUserInteraction` was removed). Confirmation belongs to the client, driven by `consequentialHint` and its own policy. OpenAI says normal confirmation policies apply to "sending messages, making purchases, deleting data, or changing permissions." (S and V)
13. **Register in the top-level document.** ChatGPT ignores iframes; don't rely on declarative forms for ChatGPT. (V: OpenAI)
14. **Feature detection:** `typeof document.modelContext?.registerTool === "function"`, then `await registerTool(...)`. (V: OpenAI example; probe)
15. **Evals.** Test tool selection in isolation, check the call order end to end, and check mid-chain failures. (V: Chrome evals)
16. **Don't trust mocked capability tests.** One site shipped for three months with no OT token and unit tests that stubbed `document.modelContext`. (B: [ModelPiper, 2026-08-01](https://modelpiper.com/blog/webmcp-chrome-api-migration-mocked-tests))

---

## 4. Our gaps, ranked by impact

Tool definitions were generated with `z.toJSONSchema` exactly as `inputSchema()` does, and measured:

| Tool | Description (chars) | Schema (chars) |
| --- | --- | --- |
| walkthrough | 454 | 5,834 |
| set_view | 383 | 4,789 |
| edit_blocks | 385 | 8,129 |
| quiz | 648 | 5,647 |
| the other 7 tools | ≤ 369 | ≤ 729 |
| **All 11 tools (name, title, description, schema)** | | **≈32,100 chars, ≈8K tokens** |

### G1. `registerTool()` is treated as synchronous; rejections are unhandled and `registered` can be wrong

**Where:**
- `src/agent/webmcp.ts:140-142`: `registerTool(...): unknown`
- `src/agent/webmcp.ts:169-176`: no `await`
- `src/agent/index.ts:24-33`: the sync `try/catch`, and `registered` computed before settlement
- `src/agent/shim.ts:12-16`: the shim throws synchronously and returns `undefined`
- `tests/agent-tools.test.mjs:299-320`: the mock copies the sync shape

**What breaks:**
- In the spec, Chrome and ChatGPT, failures reject the promise:
  - duplicate or invalid names;
  - `NotAllowedError` from `allow`/`tools=()`;
  - `SecurityError` when the host sends `Origin-Agent-Cluster: ?0`;
  - schema serialization errors.
- Those rejections escape the `try/catch` as unhandled rejections. `startAgentSurface` still reports `registered: true`, and a partial registration is not rolled back.
- ChatGPT rejects with an empty plain `{}`, so logs show nothing useful.
- The happy path in ChatGPT works, so this is correctness and debuggability, not an outage.

**Fix:**
- Make `registerTools` async.
- For each tool, run `await Promise.resolve(modelContext.registerTool(def, { signal }))`. `Promise.resolve` covers old sync previews.
- Use `Promise.allSettled`. On any rejection, log `tool.name` plus `String(reason)` or `JSON.stringify(reason)`, then abort the controller.
- Have `startAgentSurface` return `registered` as a promise, or set it after settlement.
- Make the shim's `registerTool` `async`: reject on duplicates, empty names or descriptions, and names outside `/^[A-Za-z0-9_.-]{1,128}$/`.
- Update the test mock to return promises and add a rejection test.

**Source:** spec IDL `Promise<undefined> registerTool(...)` and algorithm steps (S, H); [OpenAI example uses `await`](https://learn.chatgpt.com/docs/webmcp) (V); probe "Named cases rejected with a plain `Object`" (probe, M).

**Confidence:** H that the code differs from the spec. M on real-world impact.

### G2. No origin-trial token, so the guide registers nothing for ordinary Chrome or Edge users (secondary target only)

**Where:**
- The build (`scripts/build.mjs`) and `dist/index.html`: there is no `<meta http-equiv="origin-trial">`. A grep of `src/` and `scripts/` for `origin-trial` finds nothing.
- `src/agent/index.ts:23` silently finds no context.

**What breaks:**
- On Chrome 149–156 without the flag, `document.modelContext` is `undefined`. The guide exposes no tools to Chrome's agent or to the inspector extension. Edge 150 is the same.
- ChatGPT is not affected.
- Tokens are tied to an origin, so this can't help a `file://` copy.

**Fix:**
- Register the site's origin for the [WebMCP OT](https://developer.chrome.com/blog/ai-webmcp-origin-trial), and do the same for Edge's OT.
- Inject the token meta tag in `scripts/build.mjs` for the hosted build only.
- Note in About that WebMCP in Chrome needs the hosted origin.

**Source:** [Chrome WebMCP get started](https://developer.chrome.com/docs/ai/webmcp#get_started) (V); [Chrome Status](https://chromestatus.com/feature/5117755740913664), OT 149–156 (V); [ModelPiper](https://modelpiper.com/blog/webmcp-chrome-api-migration-mocked-tests) (B).

**Confidence:** H.

### G3. Tools that return user-authored doc text lack `untrustedContentHint`

**Where:**
- `src/agent/webmcp.ts:14-15, 136, 163`: only `readOnlyHint` is ever emitted.
- The tools that echo user content:
  - `read` (a doc's markdown);
  - `search` (doc snippets);
  - `outline` (heading snippets, `docs-api.ts:539`);
  - `get_context` (the selection, up to 500 characters, `guide-api.ts:188`, and the block being edited);
  - `edit_blocks` (returns the current block text on `stale_rev`);
  - `doc` (returns blocks).

**Why:**
- Docs are user content and "may include pasted text" (our own spec, §13), which is the spec's own output-injection example.
- ChatGPT already carries this field in its tool listing (probe).

**Fix:**
- Add `untrustedContent?: boolean` (or a general `annotations` object) to `Tool`.
- Emit `annotations: { readOnlyHint, untrustedContentHint }` in `toolDefinition`.
- Set it on `read`, `search`, `outline` and `get_context` at minimum. Consider `edit_blocks` and `doc` too.

**Caveat:** the spec lets clients spotlight, sanitize, or **hide** flagged output. Before shipping, check in the ChatGPT spike that doc text still reaches the model.

**Source:** spec §mitigation-untrusted-annotation (S); [Chrome secure-tools, "Use annotation hints"](https://developer.chrome.com/docs/ai/webmcp/secure-tools) (V).

**Confidence:** M that this is right; L on how ChatGPT treats it.

### G4. The tool definitions are about 8K tokens, and the ViewPatch schema is inlined three times

**Where:**
- `src/agent/schemas.ts:66-71`: `tourStopSchema.view = viewPatchSchema`, used by `walkthrough.ts:23`.
- `src/agent/tools/edit-blocks.ts:26-29`: `insert.view` is a union with `viewPatchSchema`.
- `src/agent/tools/set-view.ts:10`.
- In total, the ViewPatch schema is inlined 3× (about 14K characters), and the 50-id region enum appears 14 times (about 5.5K characters).

**Fix:**
- In `walkthrough` stops and `edit_blocks` `insert.view`, replace the full ViewPatch with a loose `{ type: "object", description: "A set_view patch (see set_view)" }`.
- Validate it in code with `normalizeViewPatch`, exactly as `src/agent/tools/quiz.ts:20-26` already does for `showMeView`.
- Keep the full schema only on `set_view`.
- This saves about 9–10K characters, roughly 30% of all definitions.
- Optional: in `z.toJSONSchema`, strip the `maximum: 9007199254740991` that zod adds to every `int()`, and `propertyNames: {type: "string"}` (from `z.record`).
- Update the test that asserts tour stops embed the same schema (`tests/agent-tools.test.mjs:340`).

**Source:** S (README budget, "validate strictly in code, loosely in schema"); V (Chrome best practices).

**Confidence:** M. This is cost and latency, not correctness.

### G5. The "static list, no toolchange churn" reason is out of date

**Where:**
- `docs/agent-surface-spec.md:849` (§12) and `:58`.
- `src/agent/tools/index.ts:1,29`.
- `src/main.ts:164-170`: the kill switch only changes behaviour.

**What changed:** the ChatGPT probe saw the tool list refresh after both registration and abort. The spec fires `toolchange`.

**Option:**
- When assistant control is off, abort a separate `AbortController` for the 7 write tools, and re-register them when it is switched back on. `get_context` already reports `control: "off"` (`guide-api.ts:192`).
- The agent then never plans with tools it can't use, and ChatGPT's "Available site tools" panel matches reality.

**Counter-argument:**
- The current `agent_control_off` error is clear and gives the agent a reason.
- The refresh behaviour comes from one dated probe.
- Keep the static list if the spike can't confirm the refresh.

**Source:** probe (M); Chrome best practices and README (V/S, opinion).

**Confidence:** M/L.

### G6. Over the Chrome character budgets

- `quiz` description: 648 characters, against a 500 guideline (`src/agent/tools/quiz.ts:76-77`). The kind grammar is already carried by the per-kind schemas; cut the description to purpose plus side effects.
- Result sizes: our target is 2 KB (`docs/agent-surface-spec.md:271`; the test allows 3,584 bytes for help at `tests/guide-api.test.mjs:212`). Chrome's guideline is 1.5K.
  - The `help` card is 3,064 characters.
  - 27 `read region:* full` results are 1.5–2.9K characters.
  - All brief, outline and topic reads fit, except help.
- Fix:
  - Drop the `regions` map from help, since the schema enum already lists the ids; or page it.
  - Accept `full` as an explicit opt-in.
- Source: V (Chrome secure-tools, "subject to change"). Confidence: L on the impact.

### G7. Multi-action tools and noun names

**Where:** `doc` (5 actions), `window` (7), `walkthrough` (7), `quiz` (4).

**Tension:**
- These conflict with "each tool should consist of a single function" and verb naming.
- Annotations can't differ by action. For example, `doc` bundles `create` with `delete`, so no single `consequentialHint` or `readOnlyHint` fits it.

**Assessment:**
- D2 in our spec chose this on purpose to keep the count at 11.
- ChatGPT's per-call review sees the arguments, so the practical risk is low.
- If the spike shows confirmation friction on `doc create`, split out `delete_doc`.

**Source:** V (Chrome best practices), opinion. **Confidence:** L.

### G8. `execute` ignores the cancellation signal

**Where:** `src/agent/webmcp.ts:137` (type) and `:164` (`execute: async (input) => …`).

**Fix:** accept `(input, options?)` and pass `options?.signal` into `runner.call`. It only matters for async store operations (`doc`, `edit_blocks`, `quiz` boot OPFS). Treat it as optional: ChatGPT does not pass one (probe).

**Source:** S (`ToolExecuteCallbackOptions`); V (Chrome imperative, "Handle tool cancellation").

**Confidence:** H on the spec; L on the impact.

### G9. Result encoding: close spike question 1 and delete the `content[]` mode

**Where:**
- `src/agent/webmcp.ts:107-127`
- `src/agent/index.ts:14,19`
- `src/agent/shim.ts:24-38`

**Fix:** keep plain objects, as the current default does. Then remove `ResultFormat`, `?agent-result=content` and `decodeResult`.

**Why:**
- The spec serializes any JSON value.
- ChatGPT preserved objects.
- MCP-B wraps plain values itself.
- `content[]` double-encodes JSON inside a string and wastes tokens.

**Source:** S (imperative execute steps); probe; MCP-B docs.

**Confidence:** H for the spec and M for ChatGPT, so there is little risk.

### G10. Schema keywords that a strict client might reject

**What zod v4 emits:**
- `oneOf`, from `z.discriminatedUnion` (`edit-blocks.ts:20`, `quiz.ts:61`);
- `anyOf` and `const`;
- `exclusiveMinimum`, from `.positive()` (`schemas.ts:39`);
- `propertyNames`.

**Evidence:**
- The spec only requires JSON-serializable schemas.
- ChatGPT passed arguments through without validating them, which suggests it does not use strict structured-output mode. That is inference.

**Optional hardening:** post-process with the `override` hook in `z.toJSONSchema`:
- turn `oneOf` into `anyOf` (the two are equivalent with a discriminator);
- drop `propertyNames`.

**Source:** L (unverified). Keep `$ref` inlined (`webmcp.ts:151-155`; the test at `tests/agent-tools.test.mjs:93` is good).

### G11. Dead compatibility code

- `src/agent/webmcp.ts:172-174`: the `handle.unregister` path matches no draft since March 2026, and the Promise has no `unregister`. Delete it.
- `src/agent/webmcp.ts:144-149`: keep the `navigator.modelContext` fallback only while Chrome 149 is in the wild. ChatGPT lacks it, and Chrome 153+ reportedly removed it (B, L).
- Source: spec history (S, H).

### G12. Optional: drive the presence pill from events

- `toolactivated` and `toolcancel` could show "Assistant…" and clear it on cancel.
- **Feature-detect `addEventListener` first.** ChatGPT's `modelContext` has none (probe).
- The current runner-based presence (`webmcp.ts:75-90`) already works. Low value.

### Already correct (no action)

| What | Where | Source |
| --- | --- | --- |
| Feature detection is `document` first, then `navigator`, with `typeof registerTool === "function"` | `webmcp.ts:145-149` | V: OpenAI |
| Every input is validated with zod, with actionable messages, before the kill switch. This is essential, because ChatGPT passes invalid arguments through | `webmcp.ts:71-72` | probe |
| Errors are returned as `{ error: { code, message, options } }` and exceptions are caught, so the spec's message-dropping `UnknownError` path is never hit | `webmcp.ts:58-65` | S |
| `undo` functions are stripped and nulls compacted, so results are always serializable | `webmcp.ts:87-90`, `result.ts:37-43` | – |
| Registration is in the top-level page (`main.ts:159`), with no iframes and no declarative forms | – | V: OpenAI |
| No `$ref` (tested); every root schema is `type: "object"` with `additionalProperties: false`, as in OpenAI's example | – | V: OpenAI |
| Names match the spec pattern and are ≤ 30 characters. No parameter description is over 150 characters. Every tool has a `title`. `readOnlyHint` is correct for all 11 tools | – | S, V |
| `consequentialHint` stays false. Deletes are soft, restorable for 30 days, and undoable, so they are not "non-reversible". ChatGPT still applies its own delete confirmations | – | S, V |
| Hash-only routing through `replaceState` keeps the same `Document`, so per the spec tools survive "navigation" inside the guide | – | S |
| `get_context` with a cursor is the right pattern, since the page cannot push events to the agent | – | S |

---

## 5. What could not be verified

1. **ChatGPT schema support.** Whether it accepts `oneOf`, `anyOf`, `const`, `propertyNames`, `exclusiveMinimum`, or large enums; whether it caps description, schema or tool count; whether it truncates long results. The probe used only a trivial schema.
2. **How ChatGPT treats the hints.**
   - `untrustedContentHint`: shown, spotlighted, or hidden?
   - `consequentialHint`: added to the spec after the probe.
   - `readOnlyHint`: does it change the safety review? OpenAI says every call is reviewed and a read-only claim "isn't proof", which suggests it does not skip review (M).
3. **Hash changes in ChatGPT.** The probe tested cross-document navigation only. Per the spec, tools should survive a hash change. OpenAI ties each call to "its originating page", which is not defined further.
4. **`file://` in ChatGPT**, which matters for the single-file build. The spec allows `file:`; ChatGPT is untested. OPFS in the ChatGPT browser is also still open (our spec §2).
5. **Whether ChatGPT refreshes the tool list** in the build users have now (the probe is from 2026-08-27, one build), and whether it passes `signal` in newer builds.
6. **Chrome's agent.** Which Chrome end-user agent (Gemini in Chrome or other) consumes WebMCP tools in stable or the OT; the same for Edge's agent and Brave's Leo.
7. **Chrome schema validation.** Whether Chrome's `registerTool` rejects schemas it considers invalid (the domintro says so; the algorithm only serializes).
8. **Chrome 149's exact API shape.** Blog accounts conflict: one claims `provideContext` existed in 149, although the spec removed it in March. Treat as L.
9. **MCP-B's core runtime** (`@mcp-b/global`): the plain-object normalization is documented for the React hook only.
10. **The Chrome/Edge OT**: whether the extension beyond Chrome 156 will be approved.
