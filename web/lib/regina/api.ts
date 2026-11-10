// Thin typed client for the Regina API (policy/etl/api.py): the read
// endpoints the /regina pages use. The one-pager brief client (postBrief,
// postQuestions, downloadPdf) is archived with the brief at the tag
// archive/2026-11-pre-pivot.
//
// Every path below is the policy API's own (`/api/...`). On the server it is
// fetched from the API directly; in the browser it goes through this site's
// proxy route (`/api/regina/...`), so the API is only ever reached server-side
// and its address and CORS list never involve the browser. See apiBase.ts.
import { BROWSER_API_PREFIX, policyApiUrl } from "./apiBase";

function apiUrl(path: string): string {
  if (typeof window === "undefined") return `${policyApiUrl()}${path}`;
  return `${BROWSER_API_PREFIX}${path.replace(/^\/api/, "")}`;
}

export type Stats = {
  documents: number;
  versions: number;
  passages: number;
  embedded: number;
  sources: number;
  by_stage: Record<string, number>;
  llm_available: boolean;
};

export type DocSummary = {
  id: number;
  external_id: string;
  celex: string | null;
  title: string;
  jurisdiction: string;
  type: string;
  stage: string;
  date: string | null;
  url: string | null;
  source: string | null;
};

export type DocDetail = DocSummary & {
  eli: string | null;
  date_in_force: string | null;
  versions: number;
  excerpt: string;
  policy_areas: string[];
  sectors: string[];
};

export type Meta = {
  sectors: { slug: string; name: string }[];
  policy_areas: { slug: string; name: string }[];
  jurisdictions: string[];
  stages: string[];
};

export type SourceInfo = {
  key: string;
  name: string;
  jurisdiction: string;
  enabled: boolean;
  documents: number;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export const getStats = () => get<Stats>("/api/stats");
export const getMeta = () => get<Meta>("/api/meta");
export const getSources = () => get<{ sources: SourceInfo[] }>("/api/sources");
export const getDocument = (id: number) => get<DocDetail>(`/api/documents/${id}`);

export function getDocuments(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return get<{ documents: DocSummary[] }>(`/api/documents${qs ? `?${qs}` : ""}`);
}

export const STAGE_LABELS: Record<string, string> = {
  planned: "Planned",
  consultation: "Consultation open",
  proposed: "Proposed",
  adopted: "Adopted",
  in_force: "In force",
  amended: "Amended",
  repealed: "Repealed",
  unknown: "Other",
};
