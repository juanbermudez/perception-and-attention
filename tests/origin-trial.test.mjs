// The hosted build's WebMCP origin-trial tokens (scripts/origin-trial.mjs, used by scripts/build.mjs).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { originTrialMeta, withOriginTrial } from "../scripts/origin-trial.mjs";

const chrome = "A2x9Qm+/Zz0AAABweyJvcmlnaW4iOiJodHRwczovL2V4YW1wbGUub3JnOjQ0MyJ9==";
const edge = "Ak3dEdge0000AAAA";
const template = await readFile("src/index.html", "utf8");

test("no token set leaves the page unchanged", () => {
  assert.equal(originTrialMeta({}), "");
  assert.equal(withOriginTrial(template, { WEBMCP_OT_TOKEN: "  " }), template);
});

test("each token becomes one origin-trial meta tag right after the charset", () => {
  const html = withOriginTrial(template, { WEBMCP_OT_TOKEN: chrome, WEBMCP_OT_TOKEN_EDGE: ` ${edge}\n` });
  const tags = [...html.matchAll(/<meta http-equiv="origin-trial" content="([^"]+)">/g)].map((match) => match[1]);
  assert.deepEqual(tags, [chrome, edge]);
  assert(html.indexOf('<meta charset="UTF-8">') < html.indexOf("origin-trial"));
  assert(html.indexOf("origin-trial") < html.indexOf("<title>"));
});

test("a token that is not base64 stops the build with the variable's name", () => {
  assert.throws(() => originTrialMeta({ WEBMCP_OT_TOKEN_EDGE: '"abc"><script>' }), /WEBMCP_OT_TOKEN_EDGE is not an origin-trial token/);
});
