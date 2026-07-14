import Image from "next/image";
import Link from "next/link";

const PRINCIPLES = [
  {
    n: "I",
    title: "Nothing goes stale",
    body:
      "Official registers are checked continuously — coverage never depends on someone remembering to check them by hand.",
  },
  {
    n: "II",
    title: "Every claim is sourced",
    body:
      "Nothing in your report is generated from thin air. Every claim points back to the exact document and passage behind it.",
  },
  {
    n: "III",
    title: "Changes are tracked, not hidden",
    body:
      "When a law is amended or corrected, that's recorded as a real change worth watching — not silently swapped out underneath you.",
  },
  {
    n: "IV",
    title: "One bad source can't break the rest",
    body:
      "If a single register goes down or serves a broken document, everything else keeps updating normally.",
  },
];

export default function AboutPage() {
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

          <div className="lede-image">
            <Image
              src="/images/parliament.png"
              alt="Illustrated European Parliament building in black and white"
              width={1536}
              height={1024}
              priority
            />
          </div>
        </div>
      </div>

      <section className="section">
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
