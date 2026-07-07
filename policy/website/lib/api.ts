// Thin typed client for the EuroPolTracker API (etl/api.py).

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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

export type Passage = {
  title: string;
  celex: string | null;
  url: string | null;
  stage: string;
  score: number;
  text: string;
  char_start: number;
  char_end: number;
};

export type Citation = {
  n?: number;
  cited_text: string | null;
  title: string | null;
  celex: string | null;
  url: string | null;
  char_start: number | null;
  char_end: number | null;
};

export type ScopingQuestion = {
  id: string;
  question: string;
  why_it_matters: string;
  kind: "choice" | "multi" | "text";
  options: string[];
  group?: string;
  placeholder?: string;
};

export type BriefResult = {
  query: string;
  passages: Passage[];
  briefing: string | null;
  citations: Citation[];
  dry_run: boolean;
};

export type BriefInput = {
  name: string;
  description: string;
  sectors: string[];
  markets: string[];
  uses_ai: boolean;
  handles_personal_data: boolean;
  company_size?: string | null;
  ai_role?: string | null;
  monthly_eu_users?: string | null;
  data_categories?: string[];
  customer_type?: string | null;
  answers?: Record<string, string>;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export const getStats = () => get<Stats>("/api/stats");
export const getMeta = () => get<Meta>("/api/meta");
export const getDocument = (id: number) => get<DocDetail>(`/api/documents/${id}`);

export function getDocuments(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return get<{ documents: DocSummary[] }>(`/api/documents${qs ? `?${qs}` : ""}`);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export const postBrief = (body: BriefInput) => post<BriefResult>("/api/brief", body);
export const postQuestions = (body: BriefInput) =>
  post<{ questions: ScopingQuestion[] }>("/api/questions", body);

/** Fetch the report as a PDF and trigger a browser download. */
export async function downloadPdf(name: string, briefing: string, citations: Citation[]) {
  const res = await fetch(`${BASE}/api/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, briefing, citations }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: /api/pdf`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regulatory-exposure-report-${name.replace(/[^\w-]+/g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
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
