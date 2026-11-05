// Thin typed client for the Regina API (policy/etl/api.py).
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

/** Internal to this module: only ever reached through `BriefResult.passages`,
 *  never imported by name anywhere in `app/`. Not exported so the client's
 *  public surface doesn't advertise a type nothing consumes. */
type Passage = {
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
  suggested_answers?: string[];
  group?: string;
  placeholder?: string;
};

export type BriefResult = {
  query: string;
  passages: Passage[];
  briefing: string | null;
  citations: Citation[];
  canon_notes?: string[];
  /** Retrieval shape for this run — already sent by the API, previously unused by
   *  the UI. Powers the completion summary (see brief-ux-plan.md Phase E). */
  retrieval_stats?: {
    passages?: number;
    documents?: number;
    substantive_passages?: number;
    context_chars?: number;
  };
  dry_run: boolean;
};

/** What this run is reading, for display during the wait — instruments by act
 *  name, news by outlet rather than by headline (a press headline is long, often
 *  in another language, and says nothing about why it was retrieved). */
export type BriefSources = {
  instruments: { label: string; detail: string }[];
  instruments_total: number;
  outlets: string[];
  outlets_total: number;
  outlet_items: number;
};

/** Measured brief latency, served rather than hardcoded because it describes
 *  reality that drifts when the prompt, model or retrieval changes. */
export type BriefExpectation = {
  p10_seconds: number;
  p50_seconds: number;
  p90_seconds: number;
  tokens_per_second: number;
  typical_streamed_chars: number;
  sample_size: number;
  measured_at: string;
  source: string;
};

export async function getBriefExpectation(): Promise<BriefExpectation | null> {
  try {
    const res = await fetch(apiUrl(`/api/brief/expected`));
    return res.ok ? ((await res.json()) as BriefExpectation) : null;
  } catch {
    return null; // the page must still work without it; the copy just goes vaguer
  }
}

export type BriefStage = {
  stage: string;
  label: string;
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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

/**
 * /api/brief streams newline-delimited JSON — one `{type: "status", ...}`
 * line per real stage the analyst is working through (see generate_briefing's
 * on_stage), then a final `{type: "result", ...}`. This is what lets the UI
 * show what's actually happening during the report's 1-3 minute generation
 * instead of a silent wait; `onStage` fires once per line as it arrives.
 */
export async function postBrief(
  body: BriefInput,
  onStage?: (stage: BriefStage) => void,
  /** Text as the model writes it. Also the ETA's only real input: latency is
   *  ~entirely a function of output tokens (r=+1.00 at 93.6 tok/s, measured
   *  2026-07-29), so counting streamed characters beats any upfront guess. */
  onDelta?: (text: string) => void,
  onSources?: (sources: BriefSources) => void,
  /** The model's summarised reasoning, streamed while it thinks — the first
   *  ~90-100s of a ~180s brief, previously an empty bar. */
  onThinking?: (text: string) => void
): Promise<BriefResult> {
  const res = await fetch(apiUrl(`/api/brief`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`API ${res.status}: /api/brief`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // last split piece may be a partial line — hold it
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "status") onStage?.({ stage: event.stage, label: event.label });
      else if (event.type === "delta") onDelta?.(event.text as string);
      else if (event.type === "sources") onSources?.(event as BriefSources);
      else if (event.type === "thinking") onThinking?.(event.text as string);
      else if (event.type === "error") throw new Error(event.message);
      else if (event.type === "result") return event as BriefResult;
    }
  }
  throw new Error("Report stream ended before a result arrived.");
}

export const postQuestions = (body: BriefInput) =>
  post<{ questions: ScopingQuestion[] }>("/api/questions", body);

/** Fetch the report as a PDF and trigger a browser download. */
export async function downloadPdf(name: string, briefing: string, citations: Citation[]) {
  const res = await fetch(apiUrl(`/api/pdf`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, briefing, citations }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: /api/pdf`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regulatory-intelligence-report-${name.replace(/[^\w-]+/g, "-")}.pdf`;
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
