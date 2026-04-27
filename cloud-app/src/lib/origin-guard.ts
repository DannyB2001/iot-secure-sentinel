import type { NextRequest } from "next/server";

/**
 * Same-origin guard for cookie-auth POST handlers. Auth.js v5 sets the session
 * cookie to SameSite=Lax which blocks cross-site form POSTs, but does not stop
 * every cross-site fetch. Reject requests whose Origin header does not match
 * the declared AUTH_URL (or, in dev, the request's own host).
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  const expected = process.env.NEXTAUTH_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  try {
    const a = new URL(origin);
    const b = new URL(expected);
    return a.protocol === b.protocol && a.host === b.host;
  } catch {
    return false;
  }
}
