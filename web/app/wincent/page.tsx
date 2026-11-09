import { EuropeMap, type CountryData } from "@/components/europe-map";
import { ChannelsGraph } from "@/components/channels-graph";
import { EuroJourney, Chapter } from "@/components/euro-journey";
import { Reveal, CountUp } from "@/components/immersive";
import { ExpertPresence } from "@/components/mandate/expert-presence";
import { BrainModel } from "@/components/mandate/brain-model";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import countryMapRaw from "@/public/data/country_map.json";
import coverageRatingsRaw from "@/public/data/coverage_ratings.json";
import { corpusStats, type Synthesis } from "@/lib/data";
import { corpusProse } from "@/lib/corpusProse";

// Headline counts come from the single corpus-wide source (lib/data.corpusStats),
// which also drives the nav, the layout footer and /about-public-capital, so
// every page shows the same number — and now the same number as the ETL's own
// record of its corpus, rather than whatever was last committed.
// Literal, not the imported constant: Next reads segment config statically and
// fails the whole build on anything it cannot evaluate. check_revalidate_literal.ts
// keeps this in step with CORPUS_REVALIDATE_SECONDS.
export const revalidate = 3600;  // = CORPUS_REVALIDATE_SECONDS

// Wincent's landing page; it was the site's `/` until Mandate took that over on
// 2026-11-06, and its metadata moved here from the root layout with it.
// `generateMetadata` rather than a `metadata` const: the description quotes the
// company count, and a const is evaluated at module load, where nothing can be
// awaited. Next dedupes this against the render below through React's cache().
export async function generateMetadata(): Promise<Metadata> {
  const { companies } = await corpusStats();
  return {
    title: "Wincent",
    description: `Wincent helps European companies map a public-capital raise to comparable awards, screened institutions and the priorities shaping grants, loans and public equity. Built on the funding record of ${companies.toLocaleString()} companies.`,
  };
}

const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

/** Parse "€296.9B" into a number + suffix so the headline figure can count up.
 *  Derived per render rather than at module load: the figure is no longer a
 *  constant, and a module-level parse would have frozen the first value the
 *  process ever saw for the life of the serverless instance. */
function capitalParts(synth: Synthesis) {
  const capMatch = synth.totalCapitalEur.match(/([\d.]+)\s*([^\d.\s]*)/);
  const capValue = capMatch ? parseFloat(capMatch[1]) : 0;
  return {
    capValue,
    capSuffix: capMatch ? capMatch[2] : "",
    capDecimals: capValue % 1 !== 0 ? 1 : 0,
  };
}

/** One cell of a side KPI matrix. */
function MatrixCell({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="border-t-2 border-[var(--primary)] py-5">
      <div className="text-2xl font-bold tabular-nums text-[var(--foreground)] sm:text-3xl" style={serif}>
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</div>
    </div>
  );
}

/** A 2-column KPI matrix that rides alongside the narrative. */
function StatMatrix({ children }: { children: ReactNode }) {
  return (
    <Reveal delay={120}>
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-4">
        {children}
      </div>
    </Reveal>
  );
}

const coverageRatings = coverageRatingsRaw as Record<string, { rating: string; note: string }>;

// Countries below the €1B corpus threshold arrive as {name, excluded: true}
// stubs (see website/build/country_map.py) — kept so the map can explain the
// exclusion on hover instead of rendering a silent gap.
//
// Typed against europe-map.tsx's own CountryData (not a re-declared local
// shape): a second, hand-maintained copy of this type drifted from the real
// one twice already (missing `eur`, then missing `byVehicle`), silently
// passing `as` casts each time. One shared type can't drift from itself.
const countryData = Object.fromEntries(
  Object.entries((countryMapRaw as { countries: Record<string, CountryData> }).countries)
    .map(([iso2, d]) => [iso2, { ...d, coverageRating: coverageRatings[iso2] }])
);

export default async function Home() {
  const synth = await corpusStats();
  // The sentences, from the corpus too. Until now the prose on this page said
  // "2020 to 2025" while /about-public-capital said "2021 to 2025" about the
  // same corpus, and "two dozen national authorities" when the register carries
  // 22 — three literals nobody could have noticed going wrong.
  const prose = corpusProse();
  const { capValue, capSuffix, capDecimals } = capitalParts(synth);
  return (
    <div>
      {/* ── Cold open: headline left, Brussels right — the editorial split. ── */}
      {/* Page-head offset is shared with /about-public-capital and /brief
          (pt-16 sm:pt-20) so the eyebrow lands at the same y on every page. */}
      <section className="relative overflow-hidden bg-[var(--background)] py-12 sm:py-16 lg:flex lg:min-h-[calc(100svh-var(--nav-h))] lg:items-center">
        <div className="relative wrap grid items-start gap-10 lg:grid-cols-2 lg:gap-12 xl:gap-16">
          <div className="flex flex-col justify-center lg:aspect-[3/2]">
            <h1 className="text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl xl:text-[3.4rem]" style={serif}>
              Raise where Europe is putting money next
            </h1>
            <div className="mt-8">
              <p className="max-w-xl text-[17px] leading-relaxed text-[var(--foreground-soft)]">
                Give Wincent your company, the project you need to finance and where you can deploy.
                Wincent screens the public-capital record and returns the institutions, instruments,
                conditions and timing worth a founder decision.
              </p>
            </div>
          </div>

          <ExpertPresence name="wincent" className="expert-presence--profile" priority />
        </div>

      </section>

      <BrainModel
        name="Wincent"
        title="A map of public capital, built around your company."
        description="Wincent is not a funding database or a grant search box. Wincent combines the public-capital record with the constraints of your company and resolves a small number of routes that can survive scrutiny."
        stages={[
          {
            label: "What Wincent knows",
            title: "The public-capital record",
            items: [
              `${Number(synth.companies).toLocaleString("en-GB")} companies reached by public capital`,
              "Grants, loans, guarantees and public equity",
              "Administrators, programme priorities and comparable raises",
            ],
          },
          {
            label: "What you provide",
            title: "The company lens",
            items: [
              "Sector, maturity and registered geography",
              "The project or deployment you need to finance",
              "Timing, ticket size and markets you can credibly enter",
            ],
          },
          {
            label: "What Wincent resolves",
            title: "Fit, route and leverage",
            items: [
              "Which instruments structurally fit—and which do not",
              "Why the institution might care now",
              "The trade-off between capital, conditions and time to market",
            ],
          },
          {
            label: "What comes back",
            title: "A founder decision",
            items: [
              "Named institutions and instruments to screen",
              "Comparable raises and evidence behind the fit",
              "Terms, timing, open questions and the next move",
            ],
          },
        ]}
        speaks="When a route is supported by the record, materially fits the company and changes what the founder should do next."
        quiet="When eligibility, fit or timing cannot be evidenced. Wincent does not promise funding, broker capital or manufacture certainty."
      />

      {/* ── The trip: Follow the Euro ───────────────────────────── */}
      <div className="relative bg-[var(--background)] text-[var(--foreground)]">
        <EuroJourney>
            {/* Chapter 2 — The channels graph: the pinned, camera-driven anchor */}
            {/* The graph states the national/EU split in words. It is a
                "use client" module, so the figure is handed down rather than
                imported — the artifacts corpusProse() reads are ~700 KB and
                have no business in a browser bundle. */}
            <ChannelsGraph nationalAwardPct={prose.nationalAwardPct} />

            {/* Chapter 3 — We tried to track it: the KPIs */}
            <Chapter className="pb-10 pt-14 sm:pb-12 sm:pt-16">
              <Reveal>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">The record</p>
                <h3 className="mt-4 text-3xl font-semibold text-[var(--foreground)] sm:text-4xl" style={serif}>
                  Public capital, at a glance.
                </h3>
              </Reveal>
              <StatMatrix>
                <MatrixCell
                  label="Total committed"
                  value={
                    <CountUp value={capValue} prefix="€" suffix={capSuffix} decimals={capDecimals} />
                  }
                />
                <MatrixCell label="Companies reached" value={<CountUp value={Number(synth.companies)} />} />
                <MatrixCell label="Public awards" value={<CountUp value={Number(synth.events)} />} />
                <MatrixCell label="Countries" value={<CountUp value={Number(synth.countries)} />} />
              </StatMatrix>
            </Chapter>

            {/* Chapter 5 — Where it lands: the map */}
            <Chapter className="py-10 sm:py-14">
              <Reveal>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">Where it lands</p>
              </Reveal>
              <Reveal delay={150}>
                <figure className="mt-6">
                  <div className="border-y border-[var(--border)] py-3 sm:py-5">
                    <EuropeMap countryData={countryData} />
                  </div>
                </figure>
              </Reveal>
              <Reveal>
                <details className="mt-5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70 text-sm text-[var(--foreground-soft)]">
                  <summary className="cursor-pointer px-5 py-4 font-medium text-[var(--foreground)]">
                    How to read the map and coverage
                  </summary>
                  <div className="space-y-3 border-t border-[var(--border)] px-5 py-4 leading-relaxed">
                    <p>
                      Countries are shaded by companies reached, not award value. Hover to split each
                      total across EU funds, development banks and state aid.
                    </p>
                    <p>
                      Coverage varies. Consortium participants can be undercounted, some figures are
                      commitments or ceilings rather than cash paid, and reporting channels overlap.
                    </p>
                  </div>
                </details>
              </Reveal>
            </Chapter>

        </EuroJourney>
      </div>
    </div>
  );
}
