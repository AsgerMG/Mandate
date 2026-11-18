"use client";
// Knowledge: what the brain on screen should know to draw the graphs (the knowledge map) against
// what the database holds, per market. The scoreboard for the graph core (owner, 18 Nov: "map
// everything we need to know first, so we can always hold it up against whether we know it").
import { useEffect, useState } from "react";
import { BRAIN_LABEL, type Brain } from "@/lib/bench/model";
import { api } from "./api";

type Part = { part: string; expected: number; held: number; missing: { key: string; name: string }[] };
type Data = { markets: { market: string; parts: Part[] }[]; changed_charts: { institution_key: string; url: string; fetched_at: string }[] };
const PART_LABEL: Record<string, string> = {
  institutions: "Institutions (hierarchy)", products: "Products", processes: "Processes",
  roles: "Priority roles", org_charts: "Org charts (stakeholders)",
};

export function KnowledgeView({ brain }: { brain: Brain }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api<Data>("/api/bench/knowledge").then(setData).catch((e) => setErr((e as Error).message)); }, []);
  if (brain === "regina") {
    return (
      <section className="bench-page">
        <p className="bench-eyebrow"><span className="bench-brain-dot" data-brain="regina" /> Training Regina · Knowledge</p>
        <h1 className="bench-page__title">What Regina should know</h1>
        <p className="bench-page__lede">Regina&apos;s knowledge map (the institutions, procedures and people that hold each file) is not drawn yet. Wincent&apos;s map comes first; Regina&apos;s follows the expert interview.</p>
      </section>
    );
  }
  const total = (data?.markets ?? []).reduce((a, m) => { m.parts.forEach((p) => { a.e += p.expected; a.h += p.held; }); return a; }, { e: 0, h: 0 });
  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div>
          <p className="bench-eyebrow"><span className="bench-brain-dot" data-brain={brain} /> Training {BRAIN_LABEL[brain]} · Knowledge</p>
          <h1 className="bench-page__title">What {BRAIN_LABEL[brain]} should know, and what we hold</h1>
          <p className="bench-page__lede">
            The knowledge map lists, per market, the institutions (and who sits under whom), the products, the processes, the priority roles and the org charts that name the people.
            The database is held up against it. {data && <b>{total.h} of {total.e} held.</b>}
          </p>
        </div>
      </header>
      {err && <div className="bench-alert"><p>{err}</p></div>}
      {!data && !err && <div className="bench-skel h-48" />}
      {data && data.changed_charts.length > 0 && (
        <div className="bench-ok mb-5"><b>{data.changed_charts.length} org chart{data.changed_charts.length === 1 ? "" : "s"} changed</b> since the last extraction: {data.changed_charts.map((c) => c.institution_key).join(", ")}. Re-extract them in a bench session.</div>
      )}
      {data && (
        <table className="bench-know">
          <thead><tr><th>Market</th>{data.markets[0]?.parts.map((p) => <th key={p.part}>{PART_LABEL[p.part] ?? p.part}</th>)}</tr></thead>
          <tbody>
            {data.markets.map((m) => (
              <tr key={m.market}>
                <th>{m.market}</th>
                {m.parts.map((p) => {
                  const id = `${m.market}:${p.part}`;
                  const pct = p.expected ? Math.round((100 * p.held) / p.expected) : 0;
                  return (
                    <td key={p.part}>
                      {p.expected === 0 ? <span className="bench-muted">not mapped</span> : (
                        <button className="bench-know__cell" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
                          <span className="bench-know__bar"><i style={{ width: `${pct}%` }} /></span>
                          <span>{p.held}/{p.expected}</span>
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && open && (() => {
        const [mk, pt] = open.split(":");
        const p = data.markets.find((m) => m.market === mk)?.parts.find((x) => x.part === pt);
        if (!p) return null;
        return (
          <div className="bench-panel-card mt-4">
            <h2 className="bench-section-title !mt-0">{mk} · {PART_LABEL[pt]}: {p.missing.length} missing</h2>
            <ul className="bench-know__missing">{p.missing.map((x) => <li key={x.key}>{x.name} <code className="bench-muted">{x.key}</code></li>)}</ul>
          </div>
        );
      })()}
      <p className="bench-panel-foot">The map: <code>mandate/brains/wincent/knowledge_map.yaml</code>. The same table in a terminal: <code>PYTHONPATH=. python3 -m mandate.eval.knowledge_coverage --missing</code></p>
    </section>
  );
}
