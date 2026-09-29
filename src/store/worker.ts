// The store worker. The build bundles this file (with sqlite-wasm and the gzipped wasm) into a
// string, and the page starts it from a Blob URL, so it shares the page's origin and OPFS.
// opfs-sahpool needs no COOP/COEP headers, which keeps static hosting working (spec §11.1).

import wasmGzipBase64 from "virtual:sqlite-wasm";
import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { type Engine, openEngine } from "./engine";
import type { BootMessage, BootReply, CallMessage, CallReply } from "./protocol";
import type { SqlDb } from "./sql";
import { ENGINE_METHODS } from "./store";
import { type MemoryReason, StoreError } from "./types";

const DB_FILE = "/perception-attention.sqlite3";
const POOL = "pa-sahpool";
const POOL_DIRECTORY = ".pa-sahpool";
// Up to 4 s: the worker of a page that was just reloaded can hold its handles for a moment.
const PROBE_ATTEMPTS = 40;
const PROBE_WAIT_MS = 100;

interface WorkerScope {
  onmessage: ((event: MessageEvent<BootMessage | CallMessage>) => void) | null;
  postMessage(message: BootReply | CallReply): void;
}
const scope = globalThis as unknown as WorkerScope;

// Only opfs-sahpool is used. The other OPFS VFSes need SharedArrayBuffer (COOP/COEP) and would
// log a warning on every start, so they are switched off before sqlite initializes.
(globalThis as { sqlite3ApiConfig?: object }).sqlite3ApiConfig = { disable: { vfs: { opfs: true, "opfs-wl": true, kvvfs: true } } };

async function wasmBinary(): Promise<ArrayBuffer> {
  const packed = Uint8Array.from(atob(wasmGzipBase64), (char) => char.charCodeAt(0));
  return new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

async function loadSqlite(): Promise<Sqlite3Static> {
  const binary = await wasmBinary();
  const init = sqlite3InitModule as unknown as (config: object) => Promise<Sqlite3Static>;
  return new Promise((resolve, reject) => {
    init({
      // The embedded binary replaces Emscripten's fetch of sqlite3.wasm (a Blob worker has no base URL).
      instantiateWasm(imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) {
        WebAssembly.instantiate(binary, imports).then((result) => receive(result.instance, result.module), reject);
        return {};
      },
    }).then(resolve, reject);
  });
}

type SyncHandleFile = FileSystemFileHandle & { createSyncAccessHandle(): Promise<{ close(): void }> };

/**
 * Waits until every file in the pool can be opened. This matters because when
 * installOpfsSAHPoolVfs() cannot acquire a handle it calls removeVfs(), which deletes the whole
 * pool directory, database included. The Web Lock keeps other tabs out, but the worker of a page
 * that was just reloaded can hold its handles for a moment after the lock is released. It only
 * ever lets go, so once every handle opens here, the install cannot hit that path.
 */
async function poolIsFree(): Promise<boolean> {
  let opaque: FileSystemDirectoryHandle;
  try {
    const root = await navigator.storage.getDirectory();
    opaque = await (await root.getDirectoryHandle(POOL_DIRECTORY)).getDirectoryHandle(".opaque");
  } catch {
    return true; // No pool yet: nothing to lose.
  }
  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt++) {
    try {
      for await (const handle of (opaque as unknown as { values(): AsyncIterable<FileSystemHandle> }).values())
        if (handle.kind === "file") (await (handle as SyncHandleFile).createSyncAccessHandle()).close();
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, PROBE_WAIT_MS));
    }
  }
  return false;
}

interface Opened {
  db: Database;
  saved: boolean;
  reason: MemoryReason;
}

async function openDatabase(sqlite3: Sqlite3Static, persist: boolean): Promise<Opened> {
  const memory = (reason: MemoryReason) => ({ db: new sqlite3.oo1.DB(":memory:"), saved: false, reason });
  if (!persist) return memory(null);
  if (!(await poolIsFree())) return memory("other-tab");
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: POOL, directory: POOL_DIRECTORY });
    return { db: new pool.OpfsSAHPoolDb(DB_FILE), saved: true, reason: null };
  } catch (error) {
    console.warn("Docs are kept in memory: the OPFS database could not be opened.", error);
    return memory("no-opfs");
  }
}

/** Opens the engine; a saved database that cannot be migrated is left untouched and memory is used. */
function start(sqlite3: Sqlite3Static, opened: Opened): { engine: Engine; reason: MemoryReason } {
  try {
    return { engine: openEngine(opened.db as unknown as SqlDb), reason: opened.reason };
  } catch (error) {
    if (!opened.saved) throw error;
    console.warn("Docs are kept in memory: the saved database could not be opened.", error);
    opened.db.close();
    return { engine: openEngine(new sqlite3.oo1.DB(":memory:") as unknown as SqlDb), reason: "failed" };
  }
}

let engine: Engine | null = null;

async function boot(message: BootMessage) {
  try {
    const sqlite3 = await loadSqlite();
    const started = start(sqlite3, await openDatabase(sqlite3, message.persist));
    engine = started.engine;
    const mode = message.persist && started.reason === null ? "local" : "memory";
    scope.postMessage({ type: "ready", mode, reason: started.reason, sqlite: sqlite3.version.libVersion });
  } catch (error) {
    scope.postMessage({ type: "failed", message: error instanceof Error ? error.message : String(error) });
  }
}

function call(message: CallMessage) {
  try {
    if (!engine) throw new StoreError("store_unavailable", "The store is not open.");
    if (!ENGINE_METHODS.includes(message.method)) throw new StoreError("bad_input", `Unknown store method ${String(message.method)}.`);
    const method = engine[message.method] as (...args: unknown[]) => unknown;
    scope.postMessage({ type: "result", id: message.id, result: method(...message.args) });
  } catch (error) {
    const wire =
      error instanceof StoreError
        ? { code: error.code, message: error.message, details: error.details }
        : { code: "store_unavailable" as const, message: error instanceof Error ? error.message : String(error) };
    scope.postMessage({ type: "error", id: message.id, error: wire });
  }
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "boot") void boot(message);
  else if (message.type === "call") call(message);
};
