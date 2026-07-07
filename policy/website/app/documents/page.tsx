"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DocSummary, Meta, STAGE_LABELS, getDocuments, getMeta, getStats } from "@/lib/api";

const STAGE_ORDER = ["consultation", "planned", "proposed", "in_force", "adopted", "amended", "unknown"];

// document_type → corpus layer (mirrors project-management/source-map.md)
const LAW_TYPES = new Set(["regulation", "directive", "decision", "proposal", "consultation"]);
const LAYERS = [
  { key: "all", label: "All" },
  { key: "law", label: "Law & pipeline" },
  { key: "monitor", label: "Regulators & news" },
];
const FETCH_LIMIT = 200;
const PAGE_SIZE = 6; // rows shown per stage group before "show all"

function Badge({ kind, label }: { kind: string; label?: string }) {
  return <span className={`badge ${kind}`}>{label ?? STAGE_LABELS[kind] ?? kind}</span>;
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
  const [totalDocs, setTotalDocs] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [layer, setLayer] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMeta(), getDocuments({ limit: String(FETCH_LIMIT) }), getStats()])
      .then(([m, d, s]) => {
        setMeta(m);
        setDocs(d.documents);
        setTotalDocs(s.documents);
      })
      .catch(() => setError("Can't reach the API. Start it with `uv run ept serve` from the repo root."));
  }, []);

  const filtered = useMemo(() => {
    let out = docs;
    if (jurisdiction) out = out.filter((d) => d.jurisdiction === jurisdiction);
    if (layer === "law") out = out.filter((d) => LAW_TYPES.has(d.type));
    if (layer === "monitor") out = out.filter((d) => !LAW_TYPES.has(d.type));
    if (q) out = out.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()));
    return out;
  }, [docs, q, jurisdiction, layer]);

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
        <h2>
          Showing{" "}
          <span className="muted">
            ({filtered.length}
            {totalDocs && totalDocs > FETCH_LIMIT ? ` of latest ${FETCH_LIMIT}, ${totalDocs} total` : ""})
          </span>
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
          <div className="filter-group">
            <span className="filter-label">Layer</span>
            <div className="chips">
              {LAYERS.map((l) => (
                <span
                  key={l.key}
                  className={`chip ${layer === l.key ? "on" : ""}`}
                  onClick={() => setLayer(l.key)}
                >
                  {l.label}
                </span>
              ))}
            </div>
          </div>
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

      {!error && !docs.length && (
        <div className="spinner">
          Corpus is empty. From the repo root: <code>uv run ept refresh</code> then{" "}
          <code>uv run ept embed</code>.
        </div>
      )}
    </>
  );
}
