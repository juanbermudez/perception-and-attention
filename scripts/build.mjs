// Bundles the app into one self-contained HTML file: dist/index.html.
// The docs store worker (src/store/worker.ts) is bundled first, with sqlite3.wasm gzipped and
// base64-encoded inside it, and then embedded in the page as a string (spec §11.1).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const require = createRequire(import.meta.url);

/** esbuild plugin: `import text from "<name>"` gives `contents` as a string. */
function inlineText(name, contents) {
  const filter = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return {
    name,
    setup(builder) {
      builder.onResolve({ filter }, () => ({ path: name, namespace: "inline-text" }));
      builder.onLoad({ filter, namespace: "inline-text" }, () => ({ contents, loader: "text" }));
    },
  };
}

const wasm = await readFile(require.resolve("@sqlite.org/sqlite-wasm/sqlite3.wasm"));
const wasmText = gzipSync(wasm, { level: 9 }).toString("base64");
const worker = await build({
  entryPoints: ["src/store/worker.ts"],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2022",
  legalComments: "inline",
  plugins: [inlineText("virtual:sqlite-wasm", wasmText)],
  // sqlite-wasm reads import.meta.url only to locate files the worker never fetches.
  logOverride: { "empty-import-meta": "silent" },
});
const workerText = worker.outputFiles[0].text;

const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  minify: true,
  write: false,
  format: "esm",
  target: "es2022",
  legalComments: "inline",
  plugins: [inlineText("virtual:store-worker", workerText)],
});
const template = await readFile("src/index.html", "utf8");
const css = await readFile("src/styles.css", "utf8");
const script = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
const html = template.replace("/* STYLES */", () => css).replace("/* SCRIPT */", () => script);
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", html);
const kib = (bytes) => `${(bytes / 1024).toFixed(0)} KiB`;
console.log(`Built dist/index.html (${kib(html.length)}; docs store worker ${kib(workerText.length)}, of which sqlite3.wasm ${kib(wasmText.length)})`);
