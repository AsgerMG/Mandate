// The browser's only door to the policy API.
//
// Regina's pages used to call the policy FastAPI straight from the browser
// (NEXT_PUBLIC_API_URL), which put the API's address in the client bundle and
// made every page depend on the API's CORS list naming whichever domain served
// it. Now the browser calls this route on its own origin and the server
// forwards to POLICY_API_URL, so the API is reached server-side only and moving
// Regina to another domain needs no change on the API.
//
// A pass-through, not a second API: only paths under the policy API's own
// `/api/` are forwarded, the body streams through untouched (the brief is
// newline-delimited JSON written over ~3 minutes, and buffering it would undo
// the live progress the page is built around), and the status is the API's.
import type { NextRequest } from "next/server";
import { policyApiUrl } from "@/lib/regina/apiBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A brief streams for ~3 minutes (median 184s, measured on the policy side);
// same ceiling as the capital memo route.
export const maxDuration = 300;

// Request headers worth forwarding. Everything else (cookies, host, the
// browser's own forwarding headers) stays on this side.
const FORWARD_REQUEST = ["content-type", "accept"];
// Response headers worth returning. Length and encoding are dropped because
// fetch has already decoded the body and the stream is re-chunked.
const FORWARD_RESPONSE = ["content-type", "content-disposition", "cache-control"];

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  if (path.some((seg) => seg === ".." || seg === "." || seg === "")) {
    return Response.json({ detail: "bad path" }, { status: 400 });
  }
  const target = `${policyApiUrl()}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD_REQUEST) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      cache: "no-store",
      signal: req.signal,
    });
  } catch (err) {
    // The page shows failures verbatim (documents/page.tsx), so say what failed.
    const reason = err instanceof Error ? err.message : String(err);
    return Response.json({ detail: `policy API unreachable: ${reason}` }, { status: 502 });
  }

  const out = new Headers();
  for (const h of FORWARD_RESPONSE) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
