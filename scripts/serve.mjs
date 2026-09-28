// Minimal static server for dist/. Usage: node scripts/serve.mjs [port]

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8769);
const root = join(process.cwd(), "dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, path.endsWith("/") ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Serving dist/ at http://localhost:${port}`));
