// Text modules produced by scripts/build.mjs (esbuild plugin `inlineText`).

declare module "virtual:store-worker" {
  /** The bundled store worker (src/store/worker.ts), as JavaScript source. */
  const source: string;
  export default source;
}

declare module "virtual:sqlite-wasm" {
  /** sqlite3.wasm, gzipped and base64-encoded. */
  const gzipBase64: string;
  export default gzipBase64;
}
