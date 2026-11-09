/**
 * The citations of one mission, numbered as the agents see them: [c1], [c2]...
 *
 * Every tool that returns evidence registers the citation mandate-api resolved
 * (never the model's own account of a source) and hands the model only the id.
 * The model cites by id; the workspace re-resolves every id it is given before
 * storing anything (mandate/api/workspace.py). So a citation id in an answer is
 * a pointer into grounding, and a claim without one must say it is judgement or
 * unverified.
 */
import type { EvidenceRef } from "../workspace";

export type Specialist = "wincent" | "regina";

/** A grounding citation, as mandate-api returns it (mandate/api/citations.py). */
export interface Citation {
  sha256: string;
  version_id?: number;
  store?: string;
  canonical_url: string;
  title?: string | null;
  publisher?: string | null;
  fetched_at?: string | null;
  last_seen_at?: string | null;
  span: [number, number];
  quote: string;
}

export interface LedgerEntry {
  id: string;
  citation: Citation;
  specialist: Specialist;
  /** Which tool produced it, for the audit trail. */
  via: string;
  label?: string;
}

export class CitationLedger {
  private entries = new Map<string, LedgerEntry>();
  private byKey = new Map<string, string>();

  add(citation: Citation, specialist: Specialist, via: string, label?: string): string {
    const key = `${citation.sha256}:${citation.span[0]}:${citation.span[1]}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const id = `c${this.entries.size + 1}`;
    this.entries.set(id, { id, citation, specialist, via, label });
    this.byKey.set(key, id);
    return id;
  }

  get(id: string): LedgerEntry | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  all(): LedgerEntry[] {
    return [...this.entries.values()];
  }

  /** The citations named by `ids`, keyed by id, as the workspace stores them.
   *  Unknown ids are left out, so the workspace refuses the claim naming them. */
  pick(ids: Iterable<string>): Record<string, Citation & { label?: string }> {
    const out: Record<string, Citation & { label?: string }> = {};
    for (const id of ids) {
      const e = this.entries.get(id);
      if (e) out[id] = { ...e.citation, label: e.label };
    }
    return out;
  }

  /** The UI's evidence card for a ledger entry. */
  evidence(id: string): EvidenceRef | undefined {
    const e = this.entries.get(id);
    if (!e) return undefined;
    const c = e.citation;
    let publisher = c.publisher ?? "";
    if (!publisher) {
      try { publisher = new URL(c.canonical_url).hostname; } catch { publisher = c.canonical_url; }
    }
    return {
      id: `${e.id}:${c.sha256.slice(0, 12)}`,
      specialist: e.specialist,
      title: e.label || c.title || c.canonical_url,
      publisher,
      canonicalUrl: c.canonical_url,
      retrievedAt: c.fetched_at ?? new Date(0).toISOString(),
      locator: `chars ${c.span[0]}-${c.span[1]}, sha256 ${c.sha256.slice(0, 12)}`,
      excerpt: c.quote.length > 400 ? `${c.quote.slice(0, 397)}...` : c.quote,
    };
  }

  /** How a tool result shows a citation to the model. */
  line(id: string): string {
    const e = this.entries.get(id);
    if (!e) return `[${id}] (unknown)`;
    const c = e.citation;
    const date = c.fetched_at ? c.fetched_at.slice(0, 10) : "undated";
    return `[${id}] ${e.label || c.title || c.canonical_url} (${c.canonical_url}, retrieved ${date})`;
  }
}
