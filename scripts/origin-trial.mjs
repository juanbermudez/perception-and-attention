// Origin-trial tokens for the hosted build. Chrome and Edge offer WebMCP (document.modelContext) to
// ordinary visitors only on an origin registered for the trial, and each browser issues its own token.
// Set WEBMCP_OT_TOKEN (Chrome) and WEBMCP_OT_TOKEN_EDGE (Edge) when building for that origin.

export const ORIGIN_TRIAL_ENV = ["WEBMCP_OT_TOKEN", "WEBMCP_OT_TOKEN_EDGE"];

/** The `<meta http-equiv="origin-trial">` tags for the tokens set in `env`, one per line; "" when none are set. */
export function originTrialMeta(env) {
  const tags = [];
  for (const name of ORIGIN_TRIAL_ENV) {
    const token = env[name]?.trim();
    if (!token) continue;
    // Tokens are base64. Anything else is a mistake (a quoted or truncated paste), and would break the attribute.
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(token))
      throw new Error(`${name} is not an origin-trial token: expected base64 text, got ${JSON.stringify(token.slice(0, 24))}…`);
    tags.push(`<meta http-equiv="origin-trial" content="${token}">`);
  }
  return tags.join("\n  ");
}

/** The page with the tags placed right after the charset declaration, which must stay first in <head>. */
export function withOriginTrial(html, env) {
  const tags = originTrialMeta(env);
  if (!tags) return html;
  const charset = '<meta charset="UTF-8">';
  if (!html.includes(charset)) throw new Error(`The page template has no ${charset} to place the origin-trial tokens after.`);
  return html.replace(charset, () => `${charset}\n  ${tags}`);
}
