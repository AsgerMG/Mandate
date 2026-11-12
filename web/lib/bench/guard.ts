// LOCAL-ONLY guard for every /api/bench/* route. Server only.
//
// A route answers only when ALL hold: NODE_ENV=development, MANDATE_BENCH_LOCAL=1,
// not on Vercel, the request addressed to localhost, any Origin a localhost one,
// no forwarding from elsewhere, and no cross-site fetch. Otherwise it is a 404,
// so a deploy never even admits the route exists. The routes spawn processes
// with tool access to the checkout and read client files: they must never run
// anywhere but the owner's laptop, nor be reachable from another site's page.
import { benchEnabled } from "./events";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function isLocalRequest(req: Request): boolean {
  const host = req.headers.get("host") ?? "";
  if (!LOCAL_HOST.test(host)) return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try { if (!LOCAL_HOST.test(new URL(origin).host)) return false; } catch { return false; }
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd && !fwd.split(",").every((a) => /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(a.trim()))) return false;
  return true;
}

/** null when the request may proceed, else the 404 to return. */
export function guard(req: Request): Response | null {
  if (!benchEnabled(process.env) || !isLocalRequest(req)) return new Response("Not found", { status: 404 });
  return null;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export const fail = (error: string, status = 400) => json({ error }, status);

/** The JSON body, or null when it is not an object (or bigger than `max`). */
export async function readJson(req: Request, max = 200_000): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > max) return null;
  try {
    const text = await req.text();
    if (text.length > max) return null;
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch { return null; }
}
