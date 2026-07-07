import Link from "next/link";
import { getStats } from "@/lib/api";

function flowSteps(sourceCount: number | null) {
  return [
    {
      n: "I",
      title: "Collect",
      body:
        `${sourceCount ?? "Dozens of"} live-verified channels — EUR-Lex, the EP's procedure ` +
        "database, consultations, DPAs and sector regulators, parliaments and specialist press " +
        "across the EU, France and Germany — on a single automated trigger.",
    },
    {
      n: "II",
      title: "Structure",
      body:
        "Every document is versioned by content hash and mapped onto a canonical lifecycle: consultation → proposed → adopted → in force → amended.",
    },
    {
      n: "III",
      title: "Report",
      body:
        "Describe your company, answer a few scoping questions, and an analyst-grade regulatory exposure report is written from retrieved text — every claim cited, exportable as PDF.",
    },
  ];
}

export default async function Home() {
  const sourceCount = await getStats()
    .then((s) => s.sources)
    .catch(() => null);
  const FLOW = flowSteps(sourceCount);
  return (
    <>
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

      <section className="section landing-flow">
        <h2>How the corpus is built</h2>
        <div className="flow">
          {FLOW.map((p) => (
            <div className="flow-step" key={p.n}>
              <span className="flow-num">{p.n}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
