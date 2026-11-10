/**
 * The agents' two HTTP dependencies: mandate-api (grounding, profiles, the
 * workspace record, the actors register) and Regina's policy API. Interfaces
 * first, so the loop tests run on fakes and the route wires the real ones.
 *
 * SERVER-SIDE ONLY. MANDATE_API_URL and MANDATE_SERVICE_TOKEN never reach a
 * browser: mandate-api accepts no public writes, and the token is the only
 * thing standing between it and the internet.
 */
import { policyApiUrl } from "@/lib/regina/apiBase";
import type { Citation } from "./ledger";
import type { ToolCallRow } from "./usage";

export class ServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface FetchedVersion {
  sha256: string; canonical_url: string; fetched_at: string; title?: string | null;
  chars: number; citable: boolean; reused: boolean;
}

export interface MandateApi {
  fetch(url: string, opts?: { title?: string; publisher?: string }): Promise<FetchedVersion>;
  cite(req: { quote: string; sha256?: string; url?: string; span?: [number, number] }): Promise<Citation>;
  verify(citations: Citation[]): Promise<{ resolved: boolean; quote_matched: boolean; reason: string }[]>;
  profile(profileId: string): Promise<{ version: number; payload: Record<string, unknown> }>;
  appendProfile(profileId: string, body: { payload: Record<string, unknown>; source: string; expected: number; note: string }): Promise<{ version: number }>;
  createMission(body: Record<string, unknown>): Promise<{ id: string }>;
  getMission(id: string): Promise<{ id: string; workspace_id: string; profile_id?: string; profile_version?: number; job?: string | null;
    messages: { created_by: string; content: string; payload?: Record<string, unknown> }[] }>;
  addMessage(missionId: string, body: Record<string, unknown>): Promise<unknown>;
  save(missionId: string, kind: "decisions" | "actions" | "flags" | "plan_steps" | "watchlist" | "deliverable", body: Record<string, unknown>): Promise<Record<string, unknown> & { id: string }>;
  findActors(params: { q?: string; kind?: string; jurisdiction?: string }): Promise<{ actors: Record<string, unknown>[] }>;
  addActor(kind: "organisations" | "roles" | "contact_points" | "email_formats" | "memberships", body: Record<string, unknown>): Promise<Record<string, unknown>>;
  applyEmailFormat(formatId: string, first: string, last: string): Promise<Record<string, unknown>>;
  /** The usage log (mandate.tool_calls). Optional: a fake without it logs nothing. */
  logToolCalls?(calls: ToolCallRow[]): Promise<{ recorded: number }>;
}

export interface PolicyHit {
  title?: string; url?: string; celex?: string | null; document_id?: number | null;
  jurisdiction?: string; stage?: string; document_type?: string; text: string;
  char_start?: number; char_end?: number; score?: number;
  grounding_sha256?: string | null; passage_id?: number | null;
}

export interface PolicyApi {
  search(q: string, k?: number): Promise<{ results: PolicyHit[] }>;
  document(id: number): Promise<Record<string, unknown>>;
  passages(id: number, q?: string, k?: number): Promise<{ document?: Record<string, unknown>; passages: PolicyHit[] }>;
  consultations(params: { jurisdiction?: string; closing_within_days?: number }): Promise<{ consultations: Record<string, unknown>[]; as_of?: string | null; caveat?: string }>;
  actors(params: { document_id?: number; q?: string }): Promise<{ actors: Record<string, unknown>[] }>;
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try { detail = JSON.stringify(JSON.parse(text).detail ?? text); } catch { /* keep text */ }
    throw new ServiceError(`${res.status}: ${detail.slice(0, 400)}`, res.status);
  }
  return JSON.parse(text) as T;
}

export function mandateApiFromEnv(env = process.env): MandateApi | null {
  const base = (env.MANDATE_API_URL ?? "").replace(/\/+$/, "");
  const token = env.MANDATE_SERVICE_TOKEN ?? "";
  if (!base || !token) return null;
  return httpMandateApi(base, token);
}

export function httpMandateApi(base: string, token: string, f: typeof fetch = fetch): MandateApi {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    json<T>(await f(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    }));
  const qs = (p: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "") u.set(k, String(v));
    const s = u.toString();
    return s ? `?${s}` : "";
  };
  return {
    fetch: (url, opts = {}) => call("POST", "/grounding/fetch", { url, ...opts }),
    cite: (req) => call("POST", "/grounding/cite", req),
    verify: async (citations) => (await call<{ results: never[] }>("POST", "/grounding/verify", { citations })).results,
    profile: (id) => call("GET", `/profiles/${encodeURIComponent(id)}`),
    appendProfile: (id, body) => call("POST", `/profiles/${encodeURIComponent(id)}/versions`, body),
    createMission: (body) => call("POST", "/missions", body),
    getMission: (id) => call("GET", `/missions/${encodeURIComponent(id)}`),
    addMessage: (id, body) => call("POST", `/missions/${id}/messages`, body),
    save: (id, kind, body) => call("POST", `/missions/${id}/${kind}`, body),
    findActors: (p) => call("GET", `/actors${qs(p)}`),
    addActor: (kind, body) => call("POST", `/actors/${kind}`, body),
    applyEmailFormat: (id, first, last) => call("POST", `/actors/email_formats/${id}/apply`, { first, last }),
    logToolCalls: (calls) => call("POST", "/usage/tool_calls", { calls }),
  };
}

export function httpPolicyApi(base = policyApiUrl(), f: typeof fetch = fetch): PolicyApi {
  const get = async <T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
    const s = u.toString();
    return json<T>(await f(`${base}${path}${s ? `?${s}` : ""}`, { signal: AbortSignal.timeout(60_000) }));
  };
  return {
    search: (q, k = 8) => get("/api/search", { q, k }),
    document: (id) => get(`/api/documents/${id}`),
    passages: (id, q, k = 6) => get(`/api/documents/${id}/passages`, { q, k }),
    consultations: (p) => get("/api/consultations", { jurisdiction: p.jurisdiction, closing_within_days: p.closing_within_days }),
    actors: (p) => get("/api/actors", { document_id: p.document_id, q: p.q }),
  };
}
