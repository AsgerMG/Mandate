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
//
// FETCH_LIMIT is the server's own hard ceiling (/api/documents validates
// `limit` as le=200), not a display choice. A keyword that actually matches 200+
// documents therefore comes back truncated, and rendering that as "200 docs"
// would state a hardcoded ceiling as though it were a measurement — the precise
// thing the rule above forbids. Any keyword returning exactly FETCH_LIMIT rows
// is treated as capped and shown as "200+". Not currently reached (highest live
// count is 121), which is why it stayed invisible.
// The clean fix is server-side: have /api/documents return a `total` alongside
// `documents` so the count never depends on the page size. That endpoint is not
// owned here, so this handles it client-side in the meantime.
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

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Loading, loaded, empty and failed are four different things and this page used
// to render three of them identically. `.catch(() => null)` on both fetches meant
// an API outage rendered "0 live" and a permanent "…" — indistinguishable from a
// slow request or a genuinely empty corpus. That is exactly how the 2026-07-13
// production incident (every API call blocked) stayed invisible for weeks: the
// page looked fine. Failure is now a visible, quotable state carrying the real
// error string, so it is obvious both to a reader and to whoever is debugging.
type Loadable<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; reason: string };

// A count that came back at the server's page-size ceiling is a floor, not a
// total — see FETCH_LIMIT above.
type TopicCount = { count: number; capped: boolean };

export default function RegisterPage() {
  const [sources, setSources] = useState<Loadable<SourceInfo[]>>({ status: "loading" });
  const [topicCounts, setTopicCounts] = useState<Record<string, Loadable<TopicCount>>>({});

  useEffect(() => {
    getSources()
      .then((r) => setSources({ status: "ok", data: r.sources }))
      .catch((err) => setSources({ status: "error", reason: reason(err) }));
  }, []);

  // Each topic's keyword variants are queried against the whole corpus and
  // merged, so a document matching two variants is counted once.
  useEffect(() => {
    HOT_TOPICS.forEach((topic) => {
      Promise.all(topic.keywords.map((kw) => getDocuments({ q: kw, limit: String(FETCH_LIMIT) })))
        .then((results) => {
          const merged = dedupeById(results.flatMap((r) => r.documents));
          const capped = results.some((r) => r.documents.length >= FETCH_LIMIT);
          setTopicCounts((prev) => ({
            ...prev,
            [topic.key]: { status: "ok", data: { count: merged.length, capped } },
          }));
        })
        .catch((err) =>
          setTopicCounts((prev) => ({
            ...prev,
            [topic.key]: { status: "error", reason: reason(err) },
          }))
        );
    });
  }, []);

  const groupedSources = useMemo(() => {
    const g: Record<SourceCategory, SourceInfo[]> = { law: [], regulator: [], press: [] };
    if (sources.status !== "ok") return g;
    for (const s of sources.data) {
      if (!s.enabled) continue;
      g[categoryFor(s.key)].push(s);
    }
    for (const cat of CATEGORY_ORDER) g[cat].sort((a, b) => a.name.localeCompare(b.name));
    return g;
  }, [sources]);

  const topicFailures = HOT_TOPICS.map((t) => topicCounts[t.key]).filter(
    (s): s is { status: "error"; reason: string } => s?.status === "error"
  );

  return (
    <div className="register-page">
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
        {sources.status === "loading" && (
          <div className="spinner">Loading sources…</div>
        )}
        {sources.status === "error" && (
          <div className="notice notice-error" role="alert">
            <strong>Coverage is unavailable.</strong> The register couldn&apos;t reach the API, so
            the source counts below aren&apos;t being shown rather than being shown as zero.{" "}
            <span className="failure-reason">{sources.reason}</span>
          </div>
        )}
        {sources.status === "ok" && sources.data.every((s) => !s.enabled) && (
          <div className="notice" role="status">
            The API responded, but no sources are currently enabled.
          </div>
        )}
        {sources.status === "ok" && sources.data.some((s) => s.enabled) && (
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
        )}
      </section>

      <section className="section">
        <h2>Hot right now</h2>
        {topicFailures.length > 0 && (
          <div className="notice notice-error" role="alert">
            <strong>
              {topicFailures.length} of {HOT_TOPICS.length} topic counts couldn&apos;t be loaded.
            </strong>{" "}
            Those tiles show <em>unavailable</em> rather than a number — a missing count is not a
            count of zero.{" "}
            <span className="failure-reason">{topicFailures[0].reason}</span>
          </div>
        )}
        <div className="grid topic-grid">
          {HOT_TOPICS.map((topic) => {
            const state = topicCounts[topic.key];
            return (
              <div className="card" key={topic.key}>
                <h3>{topic.label}</h3>
                <div className="coverage-badges">
                  {state === undefined || state.status === "loading" ? (
                    <span className="badge unknown">…</span>
                  ) : state.status === "error" ? (
                    <span className="badge repealed" title={state.reason}>
                      Unavailable
                    </span>
                  ) : (
                    // "200+" when the server's page-size ceiling was hit: the number
                    // is a floor, and presenting a floor as an exact count is the bug.
                    <span className="badge in_force">
                      {state.data.count}
                      {state.data.capped ? "+" : ""} docs
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
