"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DocSummary, Meta, SourceInfo, STAGE_LABELS, getDocuments, getMeta, getSources } from "@/lib/api";
import {
  CATEGORY_LABELS,
  CATEGORY_NOTES,
  CATEGORY_ORDER,
  SourceCategory,
  categoryFor,
} from "@/lib/sourceCategories";

const FETCH_LIMIT = 200;
const PAGE_SIZE = 20; // rows shown before "show all"
const SEARCH_DEBOUNCE_MS = 300;

// Curated, not computed live — like CATEGORY_LABELS, this is an editorial
// call about which topics deserve a spot, refreshed by hand as the policy
// agenda moves. The COUNT shown next to each one is never hardcoded here
// though (see website/CLAUDE.md's no-hardcoded-corpus-numbers rule) — it's
// fetched live per keyword and merged/deduped at request time. Picked from a
// real frequency pass over the last 60 days of titles (2026-07-14): AI Act,
// GDPR and the minors/social-media fight were the clear top three by volume;
// DSA/DMA and Digital Omnibus were kept for lower-volume-but-high-signal
// enforcement/legislative news (Apple's DMA gatekeeper loss, Meta's DSA
// addictive-design finding) rather than noisier high-count buckets like
// generic "cybersecurity" that turned out to be mostly unrelated summit
// logistics on inspection.
type HotTopic = { key: string; label: string; keywords: string[] };
const HOT_TOPICS: HotTopic[] = [
  { key: "ai-act", label: "AI Act", keywords: ["AI Act"] },
  { key: "gdpr", label: "GDPR & data protection", keywords: ["GDPR", "RGPD", "Datenschutz"] },
  { key: "minors", label: "Minors & social media age limits", keywords: ["mineur", "Jugendschutz", "child safety"] },
  { key: "dsa", label: "DSA enforcement", keywords: ["Digital Services Act"] },
  { key: "dma", label: "DMA & gatekeepers", keywords: ["Digital Markets Act"] },
  { key: "digital-omnibus", label: "Digital Omnibus", keywords: ["Digital Omnibus"] },
];

function dedupeById(docs: DocSummary[]): DocSummary[] {
  const seen = new Map<number, DocSummary>();
  for (const d of docs) seen.set(d.id, d);
  return Array.from(seen.values()).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

function Badge({ kind, label }: { kind: string; label?: string }) {
  return <span className={`badge ${kind}`}>{label ?? STAGE_LABELS[kind] ?? kind}</span>;
}

function jurisdictionsOf(list: SourceInfo[]): string[] {
  return Array.from(new Set(list.map((s) => s.jurisdiction))).sort();
}

function DocRow({ d }: { d: DocSummary }) {
  return (
    <Link href={`/documents/${d.id}`} className="register-row">
      <Badge kind={d.stage} />
      <span className="register-title">{d.title}</span>
      <span className="register-meta">
        <span className="badge juris">{d.jurisdiction}</span>
        {d.celex && <span>{d.celex}</span>}
        {d.date && <span>{d.date}</span>}
      </span>
    </Link>
  );
}

export default function RegisterPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [topicDocs, setTopicDocs] = useState<Record<string, DocSummary[]>>({});
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [category, setCategory] = useState<SourceCategory | null>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMeta().catch(() => null).then((m) => m && setMeta(m));
    getSources()
      .then((r) => setSources(r.sources))
      .catch(() => null);
  }, []);

  // One-time prefetch: each topic's keyword variants queried against the
  // full corpus (not just the client's current 200-doc page) and merged, so
  // the tile's live count and its click-through result set are the same data.
  useEffect(() => {
    HOT_TOPICS.forEach((topic) => {
      Promise.all(topic.keywords.map((kw) => getDocuments({ q: kw, limit: String(FETCH_LIMIT) })))
        .then((results) => {
          const merged = dedupeById(results.flatMap((r) => r.documents));
          setTopicDocs((prev) => ({ ...prev, [topic.key]: merged }));
        })
        .catch(() => null);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Real server-side search across the whole corpus (via /api/documents'
  // title ILIKE + jurisdiction filter) — replaces the old approach of
  // client-filtering only the newest 200 already in memory, which silently
  // couldn't find anything older than that window.
  useEffect(() => {
    const params: Record<string, string> = { limit: String(FETCH_LIMIT) };
    if (debouncedQ) params.q = debouncedQ;
    if (jurisdiction) params.jurisdiction = jurisdiction;
    getDocuments(params)
      .then((d) => setDocs(d.documents))
      .catch(() => setError("The live register is temporarily unavailable — please try again shortly."));
  }, [debouncedQ, jurisdiction]);

  const groupedSources = useMemo(() => {
    const g: Record<SourceCategory, SourceInfo[]> = { law: [], regulator: [], press: [], consultation: [] };
    for (const s of sources) {
      if (!s.enabled) continue;
      g[categoryFor(s.key)].push(s);
    }
    for (const cat of CATEGORY_ORDER) g[cat].sort((a, b) => a.name.localeCompare(b.name));
    return g;
  }, [sources]);

  const filtered = useMemo(() => {
    let out = activeTopic ? topicDocs[activeTopic] ?? [] : docs;
    // Topic sets are prefetched once, corpus-wide, without a jurisdiction
    // filter — apply it client-side here instead of re-fetching per topic.
    if (activeTopic && jurisdiction) out = out.filter((d) => d.jurisdiction === jurisdiction);
    if (category) out = out.filter((d) => d.source && categoryFor(d.source) === category);
    return out;
  }, [docs, topicDocs, activeTopic, jurisdiction, category]);

  const visible = expanded ? filtered : filtered.slice(0, PAGE_SIZE);

  return (
    <>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="eyebrow">
          <span className="live-dot" />
          Continuously updated
        </div>
        <h1>Live register</h1>
        <p>
          Every instrument, procedure and monitored development the corpus tracks right now.
          Search or filter to narrow it down — each entry links to its full excerpt and official
          source.
        </p>
      </section>

      {error && <div className="notice">{error}</div>}

      <section className="section">
        <h2>Coverage</h2>
        <div className="grid">
          {CATEGORY_ORDER.filter((cat) => cat !== "consultation").map((cat) => {
            const live = groupedSources[cat];
            const jurisdictions = jurisdictionsOf(live);
            const isOn = category === cat;
            return (
              <div
                className={`card ${isOn ? "on" : ""}`}
                key={cat}
                role="button"
                tabIndex={0}
                onClick={() => setCategory((c) => (c === cat ? null : cat))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setCategory((c) => (c === cat ? null : cat));
                }}
              >
                {isOn && (
                  <span className="card-clear" aria-label="Clear category filter">
                    ✕
                  </span>
                )}
                <h3>{CATEGORY_LABELS[cat]}</h3>
                <div className="coverage-badges">
                  <span className="badge in_force">{live.length} live</span>
                  {jurisdictions.map((j) => (
                    <span className="badge juris" key={j}>
                      {j}
                    </span>
                  ))}
                </div>
                <div className="meta">{CATEGORY_NOTES[cat]}</div>
                {live.length > 0 && (
                  <details className="source-disclosure" onClick={(e) => e.stopPropagation()}>
                    <summary>Show sources →</summary>
                    <ul className="source-name-list">
                      {live.map((s) => (
                        <li key={s.key}>
                          {s.name} <span className="badge juris">{s.jurisdiction}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="filters">
        <input
          type="text"
          placeholder="Search documents…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActiveTopic(null);
          }}
        />
        {meta && meta.jurisdictions.length > 1 && (
          <div className="chips" aria-label="Filter by market">
            <span className={`chip ${jurisdiction === null ? "on" : ""}`} onClick={() => setJurisdiction(null)}>
              All
            </span>
            {meta.jurisdictions.map((j) => (
              <span
                key={j}
                className={`chip ${jurisdiction === j ? "on" : ""}`}
                onClick={() => setJurisdiction(j)}
              >
                {j}
              </span>
            ))}
          </div>
        )}
      </div>

      <section className="section">
        <h2>Hot right now</h2>
        <div className="grid topic-grid">
          {HOT_TOPICS.map((topic) => {
            const count = topicDocs[topic.key]?.length;
            const isOn = activeTopic === topic.key;
            return (
              <div
                className={`card ${isOn ? "on" : ""}`}
                key={topic.key}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveTopic((t) => (t === topic.key ? null : topic.key));
                  setQ("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveTopic((t) => (t === topic.key ? null : topic.key));
                    setQ("");
                  }
                }}
              >
                {isOn && (
                  <span className="card-clear" aria-label="Clear topic filter">
                    ✕
                  </span>
                )}
                <h3>{topic.label}</h3>
                <div className="coverage-badges">
                  <span className="badge in_force">{count === undefined ? "…" : `${count} docs`}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="register">
          {visible.map((d) => (
            <DocRow key={d.id} d={d} />
          ))}
        </div>
        {filtered.length > PAGE_SIZE && (
          <button className="show-more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer ↑" : `Show all ${filtered.length} →`}
          </button>
        )}
      </section>

      {!error && !filtered.length && <div className="spinner">No documents to show right now.</div>}
    </>
  );
}
