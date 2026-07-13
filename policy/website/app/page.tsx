import Link from "next/link";

export default function Home() {
  return (
    <div className="viewport-intro">
      <section className="hero">
        <div className="eyebrow">EU · France · Germany — tech-policy intelligence</div>
        <h1>What&apos;s moving in tech policy</h1>
        <p>
          Law, legislative pipelines, regulators and specialist press across the EU, France and
          Germany — automatically collected and turned into a source-cited exposure report for
          your company, exportable as PDF.
        </p>
        <div className="hero-actions">
          <Link className="btn" href="/brief">
            Get your report →
          </Link>
          <Link className="link-arrow" href="/about">
            How it works →
          </Link>
        </div>
      </section>
    </div>
  );
}
