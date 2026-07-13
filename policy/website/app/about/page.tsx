import Link from "next/link";

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

const COVERAGE = [
  {
    label: "EU law & pipeline",
    state: "live",
    note: "EUR-Lex, Legislative Observatory (EP Open Data), Have Your Say consultations",
  },
  {
    label: "EU regulators & press",
    state: "live",
    note: "Commission, Parliament, EPRS, EDPB, BEREC + cross-outlet news monitor",
  },
  {
    label: "France",
    state: "live",
    note: "CNIL, ANSSI, ARCOM, Conseil d'État, Sénat bill feed, digital-rights & news monitors",
  },
  {
    label: "Germany",
    state: "live",
    note: "BfDI, Bundeskartellamt, Bundestag committee agendas, netzpolitik + news monitor",
  },
  {
    label: "Légifrance (FR law texts)",
    state: "next",
    note: "Adapter slot ready — awaiting PISTE/DILA API key",
  },
  {
    label: "Bundestag DIP (DE procedures)",
    state: "next",
    note: "Adapter slot ready — awaiting free DIP API key",
  },
];

export default function AboutPage() {
  return (
    <>
      <div className="viewport-intro">
        <section className="hero">
          <div className="eyebrow">About EuroPolTracker</div>
          <h1>An analyst desk, run as software</h1>
          <p>
            EuroPolTracker exists so a compliance or public-affairs team can answer &quot;what
            applies to us, and what&apos;s about to change&quot; without waiting on a manual
            policy scan — and without trusting a summary they can&apos;t verify.
          </p>
        </section>

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
      </div>

      <section className="section built-section">
        <h2>How it&apos;s built</h2>
        <div className="flow">
          {PRINCIPLES.map((p) => (
            <div className="flow-step" key={p.n}>
              <span className="flow-num">{p.n}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Coverage</h2>
        <div className="grid">
          {COVERAGE.map((c) => (
            <div className="card" key={c.label}>
              <div className="row">
                <h3>{c.label}</h3>
                <span className={`badge ${c.state === "live" ? "in_force" : "planned"}`}>
                  {c.state === "live" ? "Live" : "Next"}
                </span>
              </div>
              <div className="meta">{c.note}</div>
            </div>
          ))}
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
