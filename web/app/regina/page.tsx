import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="viewport-intro">
      <div className="hero-row">
        <section className="hero hero-text">
          <div className="eyebrow">EU · France · Germany · tech-policy intelligence</div>
          <h1>What&apos;s moving in tech policy</h1>
          <p>
            Law, legislative pipelines, regulators and specialist press across the EU, France and
            Germany, automatically collected and turned into a source-cited intelligence report
            for your company, exportable as PDF.
          </p>
          <div className="hero-actions">
            <Link className="btn" href="/regina/brief">
              Get your report →
            </Link>
            <Link className="link-arrow" href="/regina/about">
              How it works →
            </Link>
          </div>
        </section>

        <div className="hero-image">
          <Image
            src="/images/regina/hero-building.png"
            alt="Illustrated European institutional building with a row of flags"
            width={1536}
            height={1024}
            priority
          />
        </div>
      </div>
    </div>
  );
}
