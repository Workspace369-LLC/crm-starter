/**
 * Who may open this app. The token in W369_TOKEN can read and change your
 * clients, so a deployed copy must not be open to anyone with its URL.
 *
 * - APP_PASSWORD set: every request needs it (HTTP Basic, any user name).
 * - APP_PASSWORD unset in production: nothing is served until it is set.
 * - APP_PASSWORD unset locally (`npm run dev`): open, as before.
 *
 * Pure, so it runs in middleware and in unit tests alike.
 */

export type GateResult = "allow" | "challenge" | "unconfigured";

export function checkAccess(opts: {
  authorization: string | null;
  password: string | undefined;
  production: boolean;
}): GateResult {
  const password = opts.password ?? "";
  if (!password) return opts.production ? "unconfigured" : "allow";
  const given = basicPassword(opts.authorization);
  return given !== null && sameText(given, password) ? "allow" : "challenge";
}

/** The password part of an `Authorization: Basic` header, or null. */
export function basicPassword(header: string | null): string | null {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? "");
  if (!m) return null;
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
  const colon = decoded.indexOf(":");
  return colon === -1 ? null : decoded.slice(colon + 1);
}

/** Compares without stopping at the first difference. */
function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
