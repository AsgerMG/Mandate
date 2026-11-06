// Where Regina's data comes from: the policy brain's FastAPI.
//
// Server-side only. The browser never learns this address: it calls
// /api/regina/... on its own origin (app/api/regina/[...path]/route.ts), and
// that route forwards here. POLICY_API_URL is a server env var, not
// NEXT_PUBLIC_, for exactly that reason.

/** The policy API in production, used when POLICY_API_URL is unset. */
export const POLICY_API_FALLBACK = "https://regina-production.up.railway.app";

export function policyApiUrl(): string {
  return (process.env.POLICY_API_URL || POLICY_API_FALLBACK).replace(/\/+$/, "");
}

/** The same-origin prefix the browser uses; the proxy route lives here. */
export const BROWSER_API_PREFIX = "/api/regina";
