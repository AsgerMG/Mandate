"use client";

import { useEffect, useMemo, useState } from "react";
import { DocSummary, SourceInfo, getDocuments, getSources } from "@/lib/api";
import {
  CATEGORY_LABELS,
  CATEGORY_NOTES,
  CATEGORY_ORDER,
  SourceCategory,
  categoryFor,
} from "@/lib/sourceCategories";

// Reduced to two sections on 2026-07-30 at the user's request: Coverage and Hot
// right now. What was removed — a title search box, jurisdiction filter chips,
// and a paginated register of the newest 200 documents — and what that implies:
//
// * Both card grids used to be FILTER CONTROLS for that register. With nothing
//   left to filter they would have been controls that visibly respond (a ✕, an
//   "on" state) while changing nothing on the page, which is worse than a plain
//   display. So the click/keyboard handlers are gone and the cards are now what
//   they look like: a live count and, for Coverage, the sources behind it.
// * `/documents/[id]` still exists and still renders, but nothing on the site
//   links to it any more. Left in place deliberately — the route is harmless and
//   an obvious place to link from once there is somewhere to link.
//
// Both counts remain live-fetched (see website/CLAUDE.md's no-hardcoded-corpus-
// numbers rule): Coverage from /api/sources, Hot right now per keyword.
const FETCH_LIMIT = 200;

// Curated, not computed live — like CATEGORY_LABELS, this is an editorial
// call about which topics deserve a spot, refreshed by hand as the policy
// agenda moves. The COUNT shown next to each one is never hardcoded here
// though — it's fetched live per keyword and merged/deduped at request time.
// Picked from a real frequency pass over the last 60 days of titles
// (2026-07-14): AI Act, GDPR and the minors/social-media fight were the clear
// top three by volume; DSA/DMA and Digital Omnibus were kept for
// lower-volume-but-high-signal enforcement/legislative news (Apple's DMA
// gatekeeper loss, Meta's DSA addictive-design finding) rather than noisier
// high-count buckets like generic "cybersecurity" that turned out to be mostly
// unrelated summit logistics on inspection.
type HotTopic = { key: string; label: string; keywords: string[] };
const HOT_TOPICS: HotTopic[] = [
  { key: "ai-act", label: "AI Act", keywords: ["AI Act"] },
  { key: "gdpr", label: "GDPR & data protection", keywords: ["GDPR", "RGPD", "Datenschutz"] },
  {
    key: "minors",
    label: "Minors & social media age limits",
    keywords: ["mineur", "Jugendschutz", "child safety"],
  },
  { key: "dsa", label: "DSA enforcement", keywords: ["Digital Services Act"] },
  { key: "dma", label: "DMA & gatekeepers", keywords: ["Digital Markets Act"] },
  { key: "digital-omnibus", label: "Digital Omnibus", keywords: ["Digital Omnibus"] },
];

function dedupeById(docs: DocSummary[]): DocSummary[] {
  const seen = new Map<number, DocSummary>();
  for (const d of docs) seen.set(d.id, d);
  return Array.from(seen.values());
}

function jurisdictionsOf(list: SourceInfo[]): string[] {
  return Array.from(new Set(list.map((s) => s.jurisdiction))).sort();
}

export default function RegisterPage() {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    getSources()
      .then((r) => setSources(r.sources))
      .catch(() => null);
  }, []);

  // Each topic's keyword variants are queried against the whole corpus and
  // merged, so a document matching two variants is counted once.
  useEffect(() => {
    HOT_TOPICS.forEach((topic) => {
      Promise.all(topic.keywords.map((kw) => getDocuments({ q: kw, limit: String(FETCH_LIMIT) })))
        .then((results) => {
          const merged = dedupeById(results.flatMap((r) => r.documents));
          setTopicCounts((prev) => ({ ...prev, [topic.key]: merged.length }));
        })
        .catch(() => null);
    });
  }, []);

  const groupedSources = useMemo(() => {
    const g: Record<SourceCategory, SourceInfo[]> = { law: [], regulator: [], press: [] };
    for (const s of sources) {
      if (!s.enabled) continue;
      g[categoryFor(s.key)].push(s);
    }
    for (const cat of CATEGORY_ORDER) g[cat].sort((a, b) => a.name.localeCompare(b.name));
    return g;
  }, [sources]);

  return (
    <>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="eyebrow">
          <span className="live-dot" />
          Continuously updated
        </div>
        <h1>Live register</h1>
        <p>
          What the corpus tracks right now — every source it reads, and the files moving fastest
          across them.
        </p>
      </section>

      <section className="section">
        <h2>Coverage</h2>
        <div className="grid">
          {CATEGORY_ORDER.map((cat) => {
            const live = groupedSources[cat];
            const jurisdictions = jurisdictionsOf(live);
            return (
              <div className="card" key={cat}>
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
                  <details className="source-disclosure">
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
        <h2>Hot right now</h2>
        <div className="grid topic-grid">
          {HOT_TOPICS.map((topic) => {
            const count = topicCounts[topic.key];
            return (
              <div className="card" key={topic.key}>
                <h3>{topic.label}</h3>
                <div className="coverage-badges">
                  <span className="badge in_force">
                    {count === undefined ? "…" : `${count} docs`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
