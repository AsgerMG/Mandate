"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DocSummary, Meta, SourceInfo, STAGE_LABELS, getDocuments, getMeta, getSources, getStats } from "@/lib/api";
import {
  CATEGORY_LABELS,
  CATEGORY_NOTES,
  CATEGORY_ORDER,
  SourceCategory,
  categoryFor,
} from "@/lib/sourceCategories";

const STAGE_ORDER = ["consultation", "planned", "proposed", "in_force", "adopted", "amended", "unknown"];
const FETCH_LIMIT = 200;
const PAGE_SIZE = 6; // rows shown per stage group before "show all"

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
  const [totalDocs, setTotalDocs] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [category, setCategory] = useState<SourceCategory | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMeta(), getDocuments({ limit: String(FETCH_LIMIT) }), getStats(), getSources()])
      .then(([m, d, s, src]) => {
        setMeta(m);
        setDocs(d.documents);
        setTotalDocs(s.documents);
        setSources(src.sources);
      })
      .catch(() => setError("The live register is temporarily unavailable — please try again shortly."));
  }, []);

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
    let out = docs;
    if (jurisdiction) out = out.filter((d) => d.jurisdiction === jurisdiction);
    if (category) out = out.filter((d) => d.source && categoryFor(d.source) === category);
    if (q) out = out.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()));
    return out;
  }, [docs, q, jurisdiction, category]);

  const grouped = useMemo(() => {
    const m: Record<string, DocSummary[]> = {};
    for (const d of filtered) (m[d.stage] ??= []).push(d);
    return m;
  }, [filtered]);

  function toggleExpanded(stage: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }

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
          {CATEGORY_ORDER.map((cat) => {
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

      <section className="section">
        <h2>
          Showing{" "}
          <span className="muted">
            ({filtered.length}
            {totalDocs && totalDocs > FETCH_LIMIT ? ` of latest ${FETCH_LIMIT}, ${totalDocs} total` : ""})
          </span>
          {category && (
            <button className="show-more" onClick={() => setCategory(null)}>
              Clear category filter ✕
            </button>
          )}
        </h2>
        <div className="filters">
          <input
            type="text"
            placeholder="Filter documents by title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {meta && meta.jurisdictions.length > 1 && (
            <div className="filter-group">
              <span className="filter-label">Market</span>
              <div className="chips">
                <span
                  className={`chip ${jurisdiction === null ? "on" : ""}`}
                  onClick={() => setJurisdiction(null)}
                >
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
            </div>
          )}
        </div>
      </section>

      {STAGE_ORDER.filter((s) => grouped[s]?.length).map((stage) => {
        const items = grouped[stage];
        const isExpanded = expanded.has(stage);
        const visible = isExpanded ? items : items.slice(0, PAGE_SIZE);
        return (
          <section className="section" key={stage}>
            <h2>
              {STAGE_LABELS[stage] ?? stage} <span className="muted">({items.length})</span>
            </h2>
            <div className="register">
              {visible.map((d) => (
                <DocRow key={d.id} d={d} />
              ))}
            </div>
            {items.length > PAGE_SIZE && (
              <button className="show-more" onClick={() => toggleExpanded(stage)}>
                {isExpanded ? "Show fewer ↑" : `Show all ${items.length} →`}
              </button>
            )}
          </section>
        );
      })}

      {!error && !docs.length && <div className="spinner">No documents to show right now.</div>}
    </>
  );
}
