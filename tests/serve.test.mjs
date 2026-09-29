// The preview server (scripts/serve.mjs): bad URLs get a 400 without killing it, and every request lands on
// the one printed origin, because localhost and 127.0.0.1 are separate storage origins for saved docs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const script = join(process.cwd(), "scripts/serve.mjs");
let root, server, port, printed;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "serve-test-"));
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/index.html"), "<!doctype html><title>ok</title>");
  server = spawn(process.execPath, [script, "0"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  printed = await new Promise((resolve, reject) => {
    let out = "";
    server.stdout.on("data", (chunk) => {
      out += chunk;
      if (out.includes("\n")) resolve(out.trim());
    });
    server.on("exit", (code) => reject(new Error(`serve.mjs exited with ${code}`)));
  });
  port = Number(printed.match(/:(\d+)\/?$/)?.[1]);
});
after(async () => {
  server?.kill();
  await rm(root, { recursive: true, force: true });
});

/** A raw GET, so the path is sent exactly as written and the Host header can differ from the address. */
function get(path, host = `localhost:${port}`) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { host } }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("the printed URL is the localhost origin and the port it really listens on", () => {
  assert.match(printed, /^Serving dist\/ at http:\/\/localhost:\d+\/$/);
  assert(port > 0);
});

test("a malformed percent escape gets a 400 and the server keeps serving", async () => {
  const bad = await get("/%E0%A4%A");
  assert.equal(bad.status, 400);
  const good = await get("/");
  assert.equal(good.status, 200);
  assert.match(good.body, /<title>ok<\/title>/);
});

test("requests addressed to another host name are sent to the printed origin", async () => {
  const moved = await get("/index.html?agent=shim", `127.0.0.1:${port}`);
  assert.equal(moved.status, 308);
  assert.equal(moved.headers.location, `http://localhost:${port}/index.html?agent=shim`);
});

test("paths cannot leave dist/", async () => {
  assert.equal((await get("/%2e%2e/%2e%2e/etc/passwd")).status, 404);
  assert.equal((await get("/missing.js")).status, 404);
});
