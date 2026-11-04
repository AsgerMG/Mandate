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
    <div className="about-page">
      {/* No .viewport-intro wrapper here, deliberately — and that reverses the
          rule in design-ux-guidelines.md for this one page. That wrapper gives a
          short page's first section `min-height: calc(100vh - 100px)` so leftover
          height is distributed rather than pooling above the footer. This page is
          no longer short: with the intro carrying the full "why this exists" copy,
          claiming a whole viewport for the hero alone would push "How it's built"
          below the fold by construction — the opposite of what it should do here,
          which is fit on one screen. */}
      <div className="about-top">
        <div className="hero-row">
          <section className="hero hero-text">
            <div className="eyebrow">About Regina</div>
            <h1>An analyst desk, run as software</h1>
            <p>
              EU tech policy moves fast and across many registers at once — consultations,
              proposals, adopted law, amendments. Tracking it by hand doesn&apos;t scale, and
              generic AI summaries invite a specific failure: confident, plausible, unverifiable
              claims about legal obligations. We built this the other way around — collect the
              official record first, structure it into a queryable corpus, and only then let a
              model write anything, with every sentence tied to a retrieved passage it can point
              back to.
            </p>
          </section>

          <div className="hero-image">
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

      <section className="section about-compact">
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

      <section className="cta-band">
        <div>
          <div className="eyebrow">See it work</div>
          <h2>Describe your company, get a source-cited report</h2>
        </div>
        <Link className="btn" href="/brief">
          Get your report →
        </Link>
      </section>
    </div>
  );
}
