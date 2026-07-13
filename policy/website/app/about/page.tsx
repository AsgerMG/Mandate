import Link from "next/link";
import { getSources } from "@/lib/api";
import type { SourceInfo } from "@/lib/api";
import {
  CATEGORY_LABELS,
  CATEGORY_NOTES,
  CATEGORY_ORDER,
  PLANNED_SOURCES,
  SourceCategory,
  categoryFor,
} from "@/lib/sourceCategories";

const PRINCIPLES = [
  {
    n: "I",
    title: "Automated, single-trigger collection",
    body:
      "Nothing is entered by hand. One trigger updates the entire corpus from official registers — so coverage never depends on someone remembering to check.",
  },
  {
    n: "II",
    title: "Grounded, not generative-by-default",
    body:
      "Every company-facing claim has to trace back to a passage of a specific document version. If the corpus doesn't support a claim, the report doesn't make it.",
  },
  {
    n: "III",
    title: "Versioned by content, not by date",
    body:
      "Documents are hashed and versioned on change, so amendments and corrigenda are tracked as what they are — not silently overwritten.",
  },
  {
    n: "IV",
    title: "Resilient ingestion",
    body:
      "One malformed document never aborts a run. Sources are polled politely, rate-limited, and retried with backoff.",
  },
];

function jurisdictionsOf(list: SourceInfo[]): string[] {
  return Array.from(new Set(list.map((s) => s.jurisdiction))).sort();
}

export default async function AboutPage() {
  const sources = await getSources()
    .then((r) => r.sources)
    .catch(() => [] as SourceInfo[]);

  const grouped: Record<SourceCategory, SourceInfo[]> = {
    law: [],
    regulator: [],
    press: [],
    consultation: [],
  };
  for (const s of sources) {
    if (!s.enabled) continue;
    grouped[categoryFor(s.key)].push(s);
  }
  for (const cat of CATEGORY_ORDER) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <>
      <div className="viewport-intro">
        <div className="lede-row">
          <section className="hero lede-hero">
            <div className="eyebrow">About EuroPolTracker</div>
            <h1>An analyst desk, run as software</h1>
            <p>
              EuroPolTracker exists so a compliance or public-affairs team can answer &quot;what
              applies to us, and what&apos;s about to change&quot; without waiting on a manual
              policy scan — and without trusting a summary they can&apos;t verify.
            </p>
          </section>

          <div className="built-col">
            <div className="built-label">How it&apos;s built</div>
            <div className="flow built-grid">
              {PRINCIPLES.map((p) => (
                <div className="flow-step" key={p.n}>
                  <span className="flow-num">{p.n}</span>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="section">
        <h2>Why this exists</h2>
        <p style={{ maxWidth: 720, color: "var(--ink-soft)", lineHeight: 1.75 }}>
          EU tech policy moves fast and across many registers at once — consultations,
          proposals, adopted law, amendments. Tracking it by hand doesn&apos;t scale, and
          generic AI summaries invite a specific failure: confident, plausible, unverifiable
          claims about legal obligations. We built this the other way around — collect the
          official record first, structure it into a queryable corpus, and only then let a
          model write anything, with every sentence tied to a retrieved passage it can point
          back to.
        </p>
      </section>

      <section className="section">
        <h2>Coverage</h2>
        <div className="grid">
          {CATEGORY_ORDER.map((cat) => {
            const live = grouped[cat];
            const planned = PLANNED_SOURCES.filter((p) => p.category === cat);
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
                {planned.length > 0 && (
                  <div className="planned-list">
                    {planned.map((p) => (
                      <div className="planned-item" key={p.key}>
                        <span className="badge planned">Next</span> <strong>{p.name}</strong>
                        <div className="meta">{p.note}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ marginTop: 18 }}>
          <Link className="link-arrow" href="/documents">
            Browse the live register →
          </Link>
        </p>
      </section>

      <section className="cta-band">
        <div>
          <div className="eyebrow">See it work</div>
          <h2>Describe your company, get a source-cited report</h2>
        </div>
        <Link className="btn" href="/brief">
          Get your report →
        </Link>
      </section>
    </>
  );
}
