import Link from "next/link";
import { ExpertPresence } from "@/components/mandate/expert-presence";
import { BrainModel } from "@/components/mandate/brain-model";

export default function Home() {
  return (
    <>
      <div className="viewport-intro">
        <div className="hero-row">
          <section className="hero hero-text">
            <div className="eyebrow">EU · France · Germany · tech-policy intelligence</div>
            <h1>What&apos;s moving in tech policy</h1>
            <p>
              Give Regina your product, markets and regulatory exposure. Regina watches the official
              EU, French and German record and returns what changed, when it bites, why it matters
              to the company and the source behind every claim.
            </p>
            <div className="hero-actions">
              <Link className="link-arrow" href="/regina/about">
                How it works →
              </Link>
            </div>
          </section>

          <div className="hero-image hero-character">
            <ExpertPresence name="regina" className="expert-presence--profile" priority />
          </div>
        </div>
      </div>

      <BrainModel
        name="Regina"
        title="The official record, resolved into company consequences."
        description="Regina is not a policy news feed or a generic legal summary. Regina maintains an evidence chain from institutional movement to the specific product, market and timing decision it changes."
        stages={[
          {
            label: "What Regina knows",
            title: "The authoritative record",
            items: [
              "EU, French and German law and legislative pipelines",
              "Regulators, consultations and implementation timelines",
              "Specialist press used as signal—not authority",
            ],
          },
          {
            label: "What you provide",
            title: "The company lens",
            items: [
              "Products, claims and technical category",
              "Markets, customers and deployment model",
              "The decisions and deadlines that create exposure",
            ],
          },
          {
            label: "What Regina resolves",
            title: "Authority, delta and impact",
            items: [
              "Who holds the pen and what status the text has",
              "What changed from the previous position",
              "When the rule bites and which part of the company it reaches",
            ],
          },
          {
            label: "What comes back",
            title: "A sourced decision brief",
            items: [
              "What moved and why it matters now",
              "Product, market and timing consequences",
              "Source, date, uncertainty and the next question to resolve",
            ],
          },
        ]}
        speaks="When authoritative movement changes the company’s exposure, timing or room to act—and the evidence chain is intact."
        quiet="When the source is weak, the change is immaterial or company context is missing. Regina does not invent obligations or replace legal counsel."
      />
    </>
  );
}
