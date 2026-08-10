import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { TicketChart, CountryMixChart } from "@/components/charts";
import { Stat, Signal } from "@/components/finding";
import { EuroJourney, Chapter } from "@/components/euro-journey";
import { FundingLadder, type Rung } from "@/components/funding-ladder";
import { Reveal } from "@/components/immersive";
import { ImageSlot } from "@/components/image-slot";
import { fmtEur } from "@/lib/format";
import { corpusProse } from "@/lib/corpusProse";
import { VERIFIED_AWARDS } from "@/lib/verifiedAwards";
import insightsRaw from "@/public/data/investor_insights.json";

export const metadata: Metadata = {
  title: "Raise public capital with Europe's priorities | Wincent",
  description:
    "A practical playbook for aligning grants, state aid and public equity with European industrial priorities, then sequencing them into a private raise.",
};

interface Insights {
  stats: {
    conviction: { companies: number; withPriorAward: number; pct: number };
    eicCohort: { companies: number; wonLater: number; pct: number };
    momentum: { p2: number; p3given2: number; p5given4: number; p10given9: number };
    eicAvgDaysToStart: number;
    futureFund: { asOf: string; positions: number; dead: number }[];
  };
  concentration: {
    id: string;
    label: string;
    events: number;
    companies: number;
    totalEur: number;
    top10Share: number;
    medianTicket: number;
    p90Ticket: number;
  }[];
  countryMix: { iso2: string; name: string; euDirect: number; ndb: number; stateAid: number; total: number }[];
}

const insights = insightsRaw as unknown as Insights;
const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

// Re-theme the study body to the dark "Follow the Euro" stage by overriding the
// CSS variables every prose element reads from (same trick as the nav bar).
const SOURCES = [
  {
    id: 1,
    label:
      "Howell, Financing Innovation: Evidence from R&D Grants (AER 2017): an early-stage public R&D award roughly doubles the probability of subsequent venture funding",
    url: "https://www.semanticscholar.org/paper/Financing-Innovation%3A-Evidence-from-R%26D-Grants-Howell/f5e1210060c7a46810065bae418f5ff8d0484a7c",
  },
  {
    id: 2,
    label:
      "Santoleri, Mina, Di Minin and Martelli, The causal effects of R&D grants (CEPR/VoxEU; regression discontinuity on the SME Instrument, now EIC Accelerator): winning roughly triples the probability of private equity investment",
    url: "https://cepr.org/voxeu/columns/causal-effects-rd-grants",
  },
  {
    id: 3,
    label:
      "European Commission, EU budget 2028 to 2034 proposal: European Competitiveness Fund EUR 234bn plus Horizon Europe EUR 175bn (EUR 409bn); defence, security and space EUR 131bn, a fivefold increase",
    url: "https://commission.europa.eu/strategy-and-policy/eu-budget/long-term-eu-budget/eu-budget-2028-2034_en",
  },
  {
    id: 4,
    label:
      "European Commission, Clean Industrial Deal (Feb 2025) and CISAF state-aid framework (June 2025, in force to 2030): EUR 100bn Industrial Decarbonisation Bank; aid latitude shifts from R&D grants toward industrial capex",
    url: "https://commission.europa.eu/topics/competitiveness/clean-industrial-deal_en",
  },
  {
    id: 5,
    label:
      "EIB Group, TechEU programme: EUR 70bn for tech and innovators to 2027, targeting EUR 250bn mobilised, including direct equity and venture debt",
    url: "https://www.eib.org/en/press/all/2025-314-europe-s-innovative-companies-get-boost-as-eib-group-launches-techeu-platform-to-simplify-financing",
  },
  {
    id: 6,
    label:
      "EIB, The scale-up gap (2024): EU scale-ups raise about 50% less than US peers; IPOs are ~5% of EU divestment value versus ~30% in the US",
    url: "https://www.eib.org/en/publications/20240130-the-scale-up-gap",
  },
];

function Src({ n }: { n: number }) {
  return (
    <sup>
      <a href={`#src-${n}`} className="text-[var(--accent)] no-underline hover:underline">
        [{n}]
      </a>
    </sup>
  );
}

/** Journey chapter header: gold kicker + big serif headline + optional caption,
 * revealing as it crosses the viewport. Replaces the flat <Section> heading so
 * every section reads like a chapter of the trip. */
function ChapterHead({ kicker, title, caption }: { kicker: string; title: string; caption?: string }) {
  return (
    <div className="mb-8">
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{kicker}</p>
      </Reveal>
      <Reveal delay={100}>
        <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.1] text-[var(--foreground)] sm:text-4xl" style={serif}>
          {title}
        </h2>
      </Reveal>
      {caption && (
        <Reveal delay={160}>
          <p className="mt-3 max-w-2xl leading-relaxed text-[var(--muted-foreground)]">{caption}</p>
        </Reveal>
      )}
    </div>
  );
}

/** Wrap arbitrary chapter content so it fades in on scroll. */
function R({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <Reveal delay={delay}>{children}</Reveal>;
}

// Same corpus window as the home page and the footer, from the one constant.
// Literal, not the imported constant: Next reads segment config statically and
// fails the whole build on anything it cannot evaluate. Kept in step with
// CORPUS_REVALIDATE_SECONDS by check_revalidate_literal.ts.
export const revalidate = 3600;  // = CORPUS_REVALIDATE_SECONDS

export default function AboutPublicCapitalPage() {
  // The prose figures. Every one of these was a literal until now, and three of
  // them restated a quantity this same page already rendered live a few
  // sections away — see lib/corpusProse.ts.
  const prose = corpusProse();
  const { stats, concentration, countryMix } = insights;
  const satr = concentration.find((c) => c.id === "state_aid_satr");
  const eic = concentration.find((c) => c.id === "eic");
  const ipcei = concentration.find((c) => c.id === "ipcei");
  const inf = concentration.find((c) => c.id === "innovation_fund");
  const ndb = concentration.find((c) => c.id === "national_dev_banks");
  const horizon = concentration.find((c) => c.id === "horizon_eu_pillar_ii");

  // Rungs for the pinned funding-ladder anchor, drawn from the same concentration
  // figures the TicketChart uses. Signal floor is ordered biggest-ticket first
  // (top of the floor) down to state aid; conviction is [Innovation Fund, IPCEI].
  const rung = (c: typeof satr, label: string, sub: string): Rung => ({
    label,
    sub,
    median: c?.medianTicket ?? 0,
    p90: c?.p90Ticket ?? 0,
  });
  const signalRungs: Rung[] = [
    rung(horizon, "Horizon Europe", "the research engine"),
    rung(eic, "EIC", "grant plus equity"),
    rung(ndb, "Development banks", "loans and grants"),
    rung(satr, "State aid", "the EU register"),
  ].sort((a, b) => b.median - a.median);
  const convictionRungs: Rung[] = [
    rung(inf, "Innovation Fund", "green first-of-a-kind"),
    rung(ipcei, "IPCEI", "strategic value chains"),
  ];

  return (
    <div className="relative bg-[var(--background)] text-[var(--foreground)]">
      {/* Ambient glow: EU-blue at the top, warm coin-gold lower down. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(65% 40% at 50% 0%, rgba(16,32,63,0.05), transparent 60%)",
        }}
        aria-hidden
      />
      <div className="relative">
        <EuroJourney>
          {/* ── Masthead: why this matters ─────────────────────────── */}
          <Chapter className="py-12 sm:py-16 lg:flex lg:min-h-[calc(100svh-var(--nav-h))] lg:items-center">
            <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12 xl:gap-16">
              <div className="flex flex-col justify-center lg:aspect-[3/2]">
                <Reveal>
                  <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-tight text-[var(--foreground)] sm:text-[2.75rem] xl:text-5xl" style={serif}>
                    Public capital follows policy. Your raise should too.
                  </h1>
                </Reveal>
                <Reveal className="mt-8" delay={180}>
                  <p className="max-w-3xl text-[17px] leading-relaxed text-[var(--foreground)]">
                    Country, sector and stage decide your first door. Political and industrial
                    priorities shape the case you make once you get there. Use the award record to
                    sequence grants, loans and public equity around the outcomes Europe is funding.
                  </p>
                </Reveal>
              </div>

              <Reveal delay={200}>
                <ImageSlot
                  className="hidden lg:flex"
                  imageClassName="lg:scale-[1.18]"
                  src="/images/editorial/eib-luxembourg.png"
                  alt="Architectural line drawing of the European Investment Bank headquarters in Luxembourg"
                />
              </Reveal>
            </div>
          </Chapter>

          {/* ── The Ladder: the pinned, camera-driven overture ─────── */}
          {/* Every figure the ladder's prose states, handed down. It is a
              "use client" module and lib/corpusProse.ts imports ~700 KB of
              artifacts, so the scalars travel as props, not the module. */}
          <FundingLadder
            signal={signalRungs}
            conviction={convictionRungs}
            convictionClimbPct={prose.convictionClimbPct}
            nationalAwardPct={prose.nationalAwardPct}
          />

          {/* ── 1. The menu (the ladder, measured precisely) ───────── */}
          <Chapter className="py-16 sm:py-20">
            <ChapterHead
              kicker="1 · The menu, measured"
              title="Median ticket by channel."
              caption="Log scale. Hover for the top decile."
            />
            <R delay={120}>
              <div className="border-t border-[var(--primary)] pt-5">
                <TicketChart rows={concentration} />
              </div>
            </R>

            <R delay={120}>
              <p className="mt-5 max-w-3xl leading-relaxed text-[var(--foreground)]">
                Multiverse Computing stacked {VERIFIED_AWARDS.multiverseChannels} public channels
                before its 2025 mega-round.
              </p>
            </R>
          </Chapter>

          {/* ── 2. Which door ──────────────────────────────────────── */}
          <Chapter className="py-16 sm:py-20">
            <ChapterHead
              kicker="2 · Which door is yours"
              title="Your address decides your funnel."
              caption="France routes through Bpifrance and ADEME; Germany and Italy through state aid; the UK through Innovate UK."
            />
            <R delay={120}>
              <div className="border-t border-[var(--primary)] pt-5">
                <p className="mb-1 text-sm font-semibold">How each country&apos;s awards split across the three public layers</p>
                <p className="mb-3 text-xs text-[var(--muted-foreground)]">
                  Top {prose.countryMixRows} countries by award count, shares of awards.
                </p>
                <CountryMixChart rows={countryMix} />
              </div>
            </R>

            <R delay={120}>
              <p className="mt-5 max-w-3xl leading-relaxed text-[var(--foreground)]">
                Public money lands on legal entities, not brands. Put the receiving entity where the
                institution pays and keep its records diligence-ready.
              </p>
            </R>
          </Chapter>

          {/* ── 3. The rules ───────────────────────────────────────── */}
          <Chapter className="py-16 sm:py-20">
            <ChapterHead
              kicker="3 · Two rules from the record"
              title="The first award is the hardest you will win."
              caption="Wins compound. Timelines do not compress."
            />
            <R delay={120}>
              <div className="grid gap-4 md:grid-cols-2">
                <Stat
                  value={`${stats.momentum.p2}%`}
                  label="Chance of a second award after the first."
                />
                <Stat
                  value={`${stats.eicAvgDaysToStart} days`}
                  label="Average gap from EIC deadline to project start. Do not put it in next quarter's runway."
                />
              </div>
            </R>
          </Chapter>

          {/* ── 4. The sequence ────────────────────────────────────── */}
          <Chapter className="py-16 sm:py-20">
            <ChapterHead
              kicker="4 · The raise, sequenced"
              title="How the public and private rails interleave."
              caption="Each stage is a move, not a milestone."
            />
            <R delay={120}>
              <div className="rounded-[var(--radius)] border border-[var(--border)] overflow-hidden">
                <table className="block sm:table w-full text-sm">
                  <thead className="hidden sm:table-header-group border-b border-[var(--border)] bg-[var(--muted)] text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                    <tr>
                      <th className="px-4 py-3 w-44">Stage</th>
                      <th className="px-4 py-3">Move</th>
                    </tr>
                  </thead>
                  <tbody className="block sm:table-row-group align-top divide-y divide-[var(--border)]">
                    <tr className="block sm:table-row">
                      <td className="block sm:table-cell px-4 pt-4 pb-0 sm:py-3 font-semibold sm:w-44">Pre-seed</td>
                      <td className="block sm:table-cell px-4 pt-2 pb-4 sm:py-3 leading-relaxed">
                        Take the national door first: a development bank or regional programme award
                        (typical {fmtEur(ndb?.medianTicket)} to {fmtEur(satr?.medianTicket)}). Run an
                        EIC or national R&amp;D application in parallel.
                      </td>
                    </tr>
                    <tr className="block sm:table-row">
                      <td className="block sm:table-cell px-4 pt-4 pb-0 sm:py-3 font-semibold sm:w-44">Seed to Series A</td>
                      <td className="block sm:table-cell px-4 pt-2 pb-4 sm:py-3 leading-relaxed">
                        Put the award front and centre in the deck and data room. Add a second channel;
                        two independent juries strengthen the signal<Src n={2} />.
                      </td>
                    </tr>
                    <tr className="block sm:table-row">
                      <td className="block sm:table-cell px-4 pt-4 pb-0 sm:py-3 font-semibold sm:w-44">Series A to B</td>
                      <td className="block sm:table-cell px-4 pt-2 pb-4 sm:py-3 leading-relaxed">
                        If you sit in a strategic value chain, start the IPCEI or Innovation Fund
                        campaign early. Negotiate disclosure and exit-consent terms before taking
                        public equity.
                      </td>
                    </tr>
                    <tr className="block sm:table-row">
                      <td className="block sm:table-cell px-4 pt-4 pb-0 sm:py-3 font-semibold sm:w-44">Growth</td>
                      <td className="block sm:table-cell px-4 pt-2 pb-4 sm:py-3 leading-relaxed">
                        Blend EIB venture debt and TechEU with your public track record<Src n={5} />.
                        Keep grant income below the point where the plan depends on the next award.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </R>
          </Chapter>

          {/* ── 5. What's coming ───────────────────────────────────── */}
          <Chapter className="py-16 sm:py-20">
            {/* external: the window is the EU's next multiannual financial
                framework, 2028-2034, read from today. Source [3] below. It is a
                fact about the EU budget cycle, not about this corpus. */}
            <ChapterHead
              kicker="5 · Policy shifts, 2026 to 2034"
              title="Four moves to position for now."
            />
            <div className="grid gap-6 md:grid-cols-2">
              <R>
                <Signal
                  title="Defence and dual-use: apply before the crowd"
                  implication="If any part of your stack is dual-use, build the defence funding track record now, while the EDF is still small and uncrowded."
                >
                  <p>
                    The proposed EU budget increases defence, security and space funding fivefold
                    from 2028<Src n={3} />.
                  </p>
                </Signal>
              </R>
              <R delay={80}>
                <Signal
                  title="Cleantech: the grant ladder is moving"
                  implication="If you are a venture-stage cleantech company, stop budgeting future R&D grants and start selling to the buildout instead."
                >
                  <p>
                    The Clean Industrial Deal shifts support from R&amp;D toward industrial
                    decarbonisation and capex<Src n={4} />.
                  </p>
                </Signal>
              </R>
              <R>
                <Signal
                  title="One fund, bigger tickets, label-gated"
                  implication="Collect strategic labels now; they are the entry tickets to the EUR 409bn consolidated fund."
                >
                  <p>
                    Fourteen instruments are proposed to merge into the European Competitiveness Fund
                    from 2028<Src n={3} />.
                  </p>
                </Signal>
              </R>
              <R delay={80}>
                <Signal
                  title="The state wants your cap table"
                  implication="Treat public equity as a term sheet like any other: negotiate information rights, board terms and exit consent before the money lands."
                >
                  <p>
                    TechEU<Src n={5} />, the EIC Fund and national VC arms are expanding direct
                    equity.
                  </p>
                </Signal>
              </R>
            </div>
          </Chapter>

          {/* ── Honest reading + sources ───────────────────────────── */}
          <Chapter className="py-10 sm:py-14">
            <R>
              <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70">
                <summary className="cursor-pointer px-5 py-4 font-medium text-[var(--foreground)]">
                  Sources and methodology
                </summary>
                <div className="border-t border-[var(--border)] px-5 py-5">
                  <p className="max-w-3xl text-sm leading-relaxed text-[var(--foreground)]">
                    Causal claims come from the cited studies, not this award record. Odds, timelines
                    and tickets vary by call and country; figures shown here are corpus-wide.
                    Coverage is graded on the{" "}
                    <Link href="/" className="text-[var(--accent)] underline">home page</Link>.
                  </p>
                  <ol className="mt-5 space-y-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                    {SOURCES.map((s) => (
                      <li key={s.id} id={`src-${s.id}`} className="flex gap-2">
                        <span className="font-semibold text-[var(--accent)]">[{s.id}]</span>
                        <a href={s.url} className="underline hover:text-[var(--foreground)]" target="_blank" rel="noopener noreferrer">
                          {s.label}
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              </details>
            </R>
          </Chapter>

          {/* ── Get your brief ─────────────────────────────────────── */}
          <Chapter className="py-16 sm:py-20">
            <ChapterHead kicker="Put this to work" title="Fit your raise to today&apos;s priorities." />
            <R>
              <p className="max-w-2xl text-lg leading-relaxed text-[var(--foreground)]">
                Enter your company. Get comparable raises, screened institutions and next steps
                shaped by your country, sector and the priorities public investors are funding now.
              </p>
            </R>
            <R delay={120}>
              <Link
                href="/brief"
                className="mt-6 inline-block rounded-[var(--radius)] border border-[var(--primary)] px-6 py-3 font-semibold uppercase tracking-[0.06em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)]"
              >
                Get your brief
              </Link>
            </R>
          </Chapter>
        </EuroJourney>
      </div>
    </div>
  );
}
