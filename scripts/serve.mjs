// Minimal static server for dist/. Usage: node scripts/serve.mjs [port]
// Saved docs live in the browser's storage for one origin, and http://localhost and http://127.0.0.1 are
// different origins. So the server listens on the loopback address but sends every request to the one
// origin it prints, http://localhost:<port>.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.argv[2] ?? process.env.PORT ?? 8769);
const root = join(process.cwd(), "dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

const server = createServer(async (request, response) => {
  const origin = `http://localhost:${server.address().port}`;
  if (request.headers.host !== new URL(origin).host) {
    response.writeHead(308, { location: `${origin}${request.url ?? "/"}` }).end();
    return;
  }
  let path;
  try {
    path = normalize(decodeURIComponent(new URL(request.url ?? "/", origin).pathname)).replace(/^(\.\.[/\\])+/, "");
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const file = join(root, path.endsWith("/") ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Serving dist/ at http://localhost:${server.address().port}/`));
