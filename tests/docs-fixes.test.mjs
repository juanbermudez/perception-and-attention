// Fixes from the 2026-09-28 review (docs/reviews/2026-09-28/code-agent-side.md): the docs API, the docs
// half of the agent tools, the store and the editor model, against the real engine (sqlite-wasm in memory).
import assert from "node:assert/strict";
import { test } from "node:test";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { build } from "esbuild";

const source = `
export { createDocsApi, isApiError } from "./src/api/docs-api";
export { createDocsTools } from "./src/api/docs-tools";
export { openEngine } from "./src/store/engine";
export { createStore, directCall } from "./src/store/store";
export { transaction } from "./src/store/sql";
export { LIMITS } from "./src/store/limits";`;
const result = await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const m = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const { createDocsApi, isApiError, openEngine, createStore, directCall, transaction } = m;
const sqlite3 = await sqlite3InitModule();

function setup(options = {}) {
  const engine = openEngine(new sqlite3.oo1.DB(":memory:"));
  const store = createStore(directCall(engine), { mode: "local" });
  let opens = 0;
  const api = createDocsApi({
    store: async () => {
      opens++;
      await new Promise((resolve) => setTimeout(resolve, 1));
      return store;
    },
    now: () => new Date("2026-09-28T12:00:00Z"),
    ...options,
  });
  return { api, engine, store, opens: () => opens };
}
const ok = (value) => {
  assert(!isApiError(value), `unexpected error: ${JSON.stringify(value)}`);
  return value;
};
const err = (value, code) => {
  assert(isApiError(value), `expected ${code}, got ${JSON.stringify(value)}`);
  assert.equal(value.error.code, code, value.error.message);
  return value.error;
};

/* ---------- L1, L11 ---------- */

test("L1: overlapping first calls open the store once and subscribe once", async () => {
  const { api, engine, opens } = setup();
  const changes = [];
  let opened = 0;
  api.onChange((change) => changes.push(change));
  api.onOpen(() => opened++);
  await Promise.all([api.outlineDocs(), api.outlineDocs(), api.outlineDocs()]);
  assert.equal(opens(), 1);
  assert.equal(opened, 1);
  ok(await api.doc({ action: "create", title: "Once", markdown: "x" }, "user"));
  assert.equal(changes.length, 1, "One change, one event.");
  assert.equal(engine.listArtifacts().items.length, 1);
});

test("L1: a store that fails to open is tried again on the next call", async () => {
  let attempts = 0;
  const engine = openEngine(new sqlite3.oo1.DB(":memory:"));
  const api = createDocsApi({
    store: async () => {
      attempts++;
      if (attempts === 1) throw new Error("no worker");
      return createStore(directCall(engine), { mode: "local" });
    },
  });
  err(await api.outlineDocs(), "store_unavailable");
  ok(await api.outlineDocs());
  assert.equal(attempts, 2);
});

test("L11: a failed ROLLBACK does not hide the original error", () => {
  const db = {
    exec(sql) {
      if (sql === "ROLLBACK") throw new Error("cannot rollback - no transaction is active");
    },
  };
  assert.throws(
    () =>
      transaction(db, () => {
        throw new Error("database or disk is full");
      }),
    /database or disk is full/,
  );
});
