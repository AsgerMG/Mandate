import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { TicketChart, CountryMixChart } from "@/components/charts";
import { Finding, Stat, Signal } from "@/components/finding";
import { EuroJourney, Chapter } from "@/components/euro-journey";
import { FundingLadder, type Rung } from "@/components/funding-ladder";
import { Reveal, CountUp } from "@/components/immersive";
import { fmtEur } from "@/lib/format";
import { corpusStats } from "@/lib/data";
import insightsRaw from "@/public/data/investor_insights.json";

export const metadata: Metadata = {
  title: "Why raise public European capital | EuroInvTracker",
  description:
    "The founder's manual to Europe's public capital stack: what you can raise from grants, state aid and public equity, in what order, and how to convert it into private rounds.",
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
const serif = { fontFamily: "var(--font-playfair), Georgia, serif" };

// Re-theme the study body to the dark "Follow the Euro" stage by overriding the
// CSS variables every prose element reads from (same trick as the nav bar).
const darkVars = {
  "--foreground": "#1d1c18",
  "--muted-foreground": "#6b6b64",
  "--border": "rgba(10,10,10,0.12)",
  "--muted": "rgba(10,10,10,0.06)",
  "--primary": "#0a0a0a",
} as CSSProperties;

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
      <a href={`#src-${n}`} className="text-[#12264f] no-underline hover:underline">
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
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#12264f]">{kicker}</p>
      </Reveal>
      <Reveal delay={100}>
        <h2 className="mt-4 max-w-3xl text-3xl font-bold leading-[1.1] text-[#141414] sm:text-4xl" style={serif}>
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

export default function AboutPublicCapitalPage() {
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
    <div className="relative bg-[#f3f2ed] text-[#3f3e37]" style={darkVars}>
      {/* Ambient glow: EU-blue at the top, warm coin-gold lower down. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(65% 40% at 50% 0%, rgba(18,38,79,0.05), transparent 60%)",
        }}
        aria-hidden
      />
      <div className="relative">
        <EuroJourney>
          {/* ── Masthead: why this matters ─────────────────────────── */}
          <Chapter className="py-20 sm:py-28">
            <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
              <div>
                <Reveal>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#12264f]">
                    The manual · for companies and startups
                  </p>
                </Reveal>
                <Reveal delay={100}>
                  <h1 className="mt-5 max-w-4xl text-4xl font-medium leading-[1.08] tracking-tight text-[#141414] sm:text-5xl" style={serif}>
                    Why you should care about raising public European capital
                  </h1>
                </Reveal>
                <div className="prose-article mt-7 max-w-3xl space-y-4 text-lg leading-relaxed text-[var(--foreground)]">
                  <Reveal delay={180}>
                    <p>
                      Before any investor prices your equity, Europe&apos;s public system will hand a
                      credible technology company hundreds of thousands of euros without taking a share,
                      and the evidence says the award itself is worth more than the cash: an early public
                      R&amp;D grant roughly doubles your odds of subsequent venture funding in the US data
                      <Src n={1} /> and roughly triples your odds of private equity investment in the
                      European data<Src n={2} />. The grant is a certification you can take to a term
                      sheet.
                    </p>
                  </Reveal>
                  <Reveal delay={240}>
                    <p>
                      This manual is built on the funding record itself:{" "}
                      <CountUp value={Number(corpusStats.events)} className="tabular-nums font-semibold text-[#141414]" />{" "}
                      public awards to{" "}
                      <CountUp value={Number(corpusStats.companies)} className="tabular-nums font-semibold text-[#141414]" />{" "}
                      companies and organisations, 2021 to 2025. It answers four questions in order: what
                      you can get, which door is yours, what the data proves about how winners behave, and
                      in what sequence to raise.
                    </p>
                  </Reveal>
                </div>
              </div>

              {/* Strasbourg, in a quiet editorial frame. */}
              <Reveal delay={200}>
                <figure className="hidden lg:block">
                  <div className="overflow-hidden rounded-2xl border border-black/10 shadow-[0_2px_32px_rgba(20,18,12,0.10)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/eu/hemicycle.jpg"
                      alt="The hemicycle of the European Parliament in Strasbourg"
                      className="h-[26rem] w-full object-cover"
                    />
                  </div>
                  <figcaption className="mt-2 text-right font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a887f]">
                    European Parliament, Strasbourg · Diliff · CC BY-SA 3.0
                  </figcaption>
                </figure>
              </Reveal>
            </div>
          </Chapter>

          {/* ── The Ladder: the pinned, camera-driven overture ─────── */}
          <FundingLadder signal={signalRungs} conviction={convictionRungs} />

          {/* ── 1. The menu (the ladder, measured precisely) ───────── */}
          <Chapter className="py-20 sm:py-28">
            <ChapterHead
              kicker="1 · What is actually on the menu"
              title="The same two floors, measured to the euro."
              caption="Median award per channel, on each channel's own reporting basis."
            />
            <R>
              <Finding n={1}>
                Europe&apos;s public stack has two floors and no staircase in between: a signal floor of{" "}
                {fmtEur(satr?.medianTicket)} to {fmtEur(eic?.medianTicket)} awards that certify you, and
                a conviction floor of {fmtEur(inf?.medianTicket)} to {fmtEur(ipcei?.medianTicket)}{" "}
                anchors that finance industrial scale-up. Plan to use the first as proof and the second
                as a round.
              </Finding>
            </R>

            <R delay={120}>
              <div className="mt-6 rounded-xl border border-black/10 bg-white/70 p-5">
                <p className="mb-1 text-sm font-semibold">Median award size by channel (log scale)</p>
                <p className="mb-3 text-xs text-[var(--muted-foreground)]">
                  Hover for the top decile: the realistic best case per channel.
                </p>
                <TicketChart rows={concentration} />
              </div>
            </R>

            <R delay={120}>
              <div className="prose-article mt-6 max-w-3xl space-y-4 leading-relaxed text-[var(--foreground)]">
                <p>
                  Read the chart as a fundraising product catalogue. Development bank programmes
                  (median {fmtEur(ndb?.medianTicket)}) and national state aid ({fmtEur(satr?.medianTicket)}) are
                  volume products: fast-ish, local, repeatable. EIC and Horizon grants
                  ({fmtEur(eic?.medianTicket)} and {fmtEur(horizon?.medianTicket)}) are selective: low odds, but the
                  certification effect in the academic evidence attaches to exactly these
                  <Src n={2} />. The conviction tier (Innovation Fund {fmtEur(inf?.medianTicket)},
                  IPCEI {fmtEur(ipcei?.medianTicket)}) is not an application you fire off; it is a
                  multi-year positioning project that behaves like a state-underwritten growth round
                  when it lands. Stegra carried EUR 250m from the Innovation Fund into its green-steel
                  buildout; Porsche&apos;s Cellforce drew EUR 57m of granted battery aid; Multiverse
                  Computing stacked eight channels before its 2025 mega-round.
                </p>
              </div>
            </R>
          </Chapter>

          {/* ── 2. Which door ──────────────────────────────────────── */}
          <Chapter className="py-20 sm:py-28">
            <ChapterHead
              kicker="2 · Which door is yours"
              title="Your address decides your funnel."
              caption="Three quarters of all awards are national, and every country routes them differently."
            />
            <R>
              <Finding n={2}>
                Your address decides your funnel. France funds through development banks (Bpifrance,
                ADEME), Germany and Italy through state-aid schemes, the UK through one agency
                (Innovate UK). Apply to the machine your country actually runs, not the one you read
                about.
              </Finding>
            </R>

            <R delay={120}>
              <div className="mt-6 rounded-xl border border-black/10 bg-white/70 p-5">
                <p className="mb-1 text-sm font-semibold">How each country&apos;s awards split across the three public layers</p>
                <p className="mb-3 text-xs text-[var(--muted-foreground)]">
                  Top 12 countries by award count, shares of awards.
                </p>
                <CountryMixChart rows={countryMix} />
              </div>
            </R>

            <R delay={120}>
              <div className="prose-article mt-6 max-w-3xl space-y-4 leading-relaxed text-[var(--foreground)]">
                <p>
                  Two practical consequences. First, your national door is usually the fastest first
                  award, and a first award is what starts the compounding clock (next section). Second,
                  structure matters: public money lands on legal entities, not brands. Poland&apos;s
                  IPCEI cloud grants went to operating subsidiaries rather than the listed parents; if
                  you run group structures, put the receiving entity where the machine pays and keep
                  its records clean, because investors will look the entity up.
                </p>
              </div>
            </R>
          </Chapter>

          {/* ── 3. The rules ───────────────────────────────────────── */}
          <Chapter className="py-20 sm:py-28">
            <ChapterHead
              kicker="3 · Four rules the data proves"
              title="The first award is the hardest you will win."
              caption="From the award record, not from a brochure."
            />
            <R>
              <Finding n={3}>
                The first award is the hardest thing you will ever win from the public system. After it,
                the odds compound: {stats.momentum.p2}% chance of a second, {stats.momentum.p3given2}%
                of a third given two, {stats.momentum.p10given9}% of a tenth given nine. Start small,
                start now, and treat every win as the application fee for the next one.
              </Finding>
            </R>

            <R delay={120}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Stat
                  value={`${stats.momentum.p2}%`}
                  label="Chance of a second award once you have one. The system remembers winners."
                />
                <Stat
                  value={`${stats.eicAvgDaysToStart} days`}
                  label="Average gap from EIC call deadline to project start. Public money is slow money: never put a grant in your runway plan for the next two quarters."
                />
                <Stat
                  value={`${stats.conviction.pct}%`}
                  label="Share of conviction-tier (IPCEI / Innovation Fund) companies that climbed up from smaller grants. The top floor selects for strategic relevance, not grant pedigree: position in a declared value chain."
                />
                <Stat
                  value={`${stats.eicCohort.pct}%`}
                  label="Share of 2021 to 2022 EIC winners that later won from another channel. Labels and wins compound across channels, not just within them."
                />
              </div>
            </R>

            <R delay={120}>
              <div className="prose-article mt-6 max-w-3xl space-y-4 leading-relaxed text-[var(--foreground)]">
                <p>
                  Rule three deserves emphasis because it contradicts the folklore. Only a third of the
                  companies in Europe&apos;s biggest instruments arrived via the grant escalator; the
                  rest were selected because they sit in a value chain the EU has declared strategic:
                  batteries, hydrogen, semiconductors, cloud, defence, medical supply. If that is you,
                  say so in every application, collect the labels that prove it (STEP seal, Seal of
                  Excellence, IPCEI participation), and aim
                  directly at the conviction tier. If it is not you, do not pretend: the signal floor
                  still doubles your private-round odds<Src n={1} />.
                </p>
              </div>
            </R>
          </Chapter>

          {/* ── 4. The sequence ────────────────────────────────────── */}
          <Chapter className="py-20 sm:py-28">
            <ChapterHead
              kicker="4 · The raise, sequenced"
              title="How the public and private rails interleave."
              caption="Each stage is a move, not a milestone."
            />
            <R delay={120}>
              <div className="rounded-xl border border-[var(--border)] overflow-hidden">
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
                        (typical {fmtEur(ndb?.medianTicket)} to {fmtEur(satr?.medianTicket)}) starts the compounding
                        clock cheaply and proves you can execute public paperwork. Apply for an EIC or
                        national R&amp;D grant in parallel; a high score without funding can still earn
                        a Seal of Excellence, which several countries pay out directly.
                      </td>
                    </tr>
                    <tr className="block sm:table-row">
                      <td className="block sm:table-cell px-4 pt-4 pb-0 sm:py-3 font-semibold sm:w-44">Seed to Series A</td>
                      <td className="block sm:table-cell px-4 pt-2 pb-4 sm:py-3 leading-relaxed">
                        Convert certification into price. Put the award front and centre in the deck and
                        the data room: the evidence that it roughly triples private investment odds
                        <Src n={2} /> is your negotiating context. Stack a second channel (the{" "}
                        {stats.eicCohort.pct}% rule); two independent juries beat one.
                      </td>
                    </tr>
                    <tr className="block sm:table-row">
                      <td className="block sm:table-cell px-4 pt-4 pb-0 sm:py-3 font-semibold sm:w-44">Series A to B</td>
                      <td className="block sm:table-cell px-4 pt-2 pb-4 sm:py-3 leading-relaxed">
                        Decide whether you are a strategic-value-chain company. If yes, begin the
                        conviction-tier campaign now: IPCEI and Innovation Fund processes run in years,
                        involve your member state, and reward early presence in the consortium
                        conversations. If the EIC Fund or a national VC arm offers equity, negotiate
                        disclosure and exit-consent terms before signing; the default regime is opacity,
                        and some registers (Estonia, Finland) will publish your cap table.
                      </td>
                    </tr>
                    <tr className="block sm:table-row">
                      <td className="block sm:table-cell px-4 pt-4 pb-0 sm:py-3 font-semibold sm:w-44">Growth</td>
                      <td className="block sm:table-cell px-4 pt-2 pb-4 sm:py-3 leading-relaxed">
                        Blend the balance sheet: EIB venture debt and the TechEU envelope (EUR 70bn to
                        2027<Src n={5} />) price against your public track record. A conviction award
                        reads as state-anchored financing to every lender. Keep grant income below the
                        line that makes it a dependency; investors discount cleantech plans that assume
                        the next grant arrives (the aid framework is moving that money downstream to
                        industrial capex<Src n={4} />).
                      </td>
                    </tr>
                    <tr className="block sm:table-row">
                      <td className="block sm:table-cell px-4 pt-4 pb-0 sm:py-3 font-semibold sm:w-44">Exit planning</td>
                      <td className="block sm:table-cell px-4 pt-2 pb-4 sm:py-3 leading-relaxed">
                        Audit your own strings early: IPCEI obligations, state-aid clawback clauses and
                        public shareholders all surface in due diligence, and Europe&apos;s exit pipe is
                        structurally narrow (IPOs are ~5% of EU divestment value versus ~30% in the US
                        <Src n={6} />). Keep transatlantic optionality, and know that a strategic label
                        that helped you raise may constrain who is allowed to buy you.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </R>
          </Chapter>

          {/* ── 5. What's coming ───────────────────────────────────── */}
          <Chapter className="py-20 sm:py-28">
            <ChapterHead
              kicker="5 · What is coming for you, 2026 to 2034"
              title="The same policy shifts investors track, read as openings and traps."
            />
            <div className="grid gap-6 md:grid-cols-2">
              <R>
                <Signal
                  title="Defence and dual-use: apply before the crowd"
                  implication="If any part of your stack is dual-use, build the defence funding track record now, while the EDF is still small and uncrowded."
                >
                  <p>
                    EU defence funding multiplies fivefold from 2028<Src n={3} /> and the new
                    instruments will need fundable companies on day one. Today&apos;s EDF writes only
                    about EUR 1bn a year, which means today&apos;s applicants face the thinnest
                    competition the sector will ever see. A defence-adjacent award now is the cheapest
                    option on the supercycle.
                  </p>
                </Signal>
              </R>
              <R delay={80}>
                <Signal
                  title="Cleantech: the grant ladder is moving"
                  implication="If you are a venture-stage cleantech company, stop budgeting future R&D grants and start selling to the buildout instead."
                >
                  <p>
                    The Clean Industrial Deal redirects support from R&amp;D grants toward a EUR 100bn
                    decarbonisation bank serving industrial capex<Src n={4} />. Our data already shows
                    the euros consolidating in gigafactories and hydrogen infrastructure. The winning
                    position for a small company is supplier to that buildout, not contender for its
                    subsidies.
                  </p>
                </Signal>
              </R>
              <R>
                <Signal
                  title="One fund, bigger tickets, label-gated"
                  implication="Collect strategic labels now; they are the entry tickets to the EUR 409bn consolidated fund."
                >
                  <p>
                    Fourteen instruments merge into the European Competitiveness Fund from 2028
                    <Src n={3} />. Consolidation favours companies already inside the system, and
                    selection anchors on strategic-autonomy labels. A STEP seal or IPCEI association
                    earned in 2026 compounds for a decade.
                  </p>
                </Signal>
              </R>
              <R delay={80}>
                <Signal
                  title="The state wants your cap table"
                  implication="Treat public equity as a term sheet like any other: negotiate information rights, board terms and exit consent before the money lands."
                >
                  <p>
                    TechEU<Src n={5} />, the EIC Fund and national VC arms are scaling direct equity.
                    Public money on the cap table can anchor a round, but the UK Future Fund&apos;s
                    record (a third of its unselective portfolio already insolvent) shows public
                    co-investment is not validation unless the institution selects. Choose public
                    co-investors the way you choose VCs: by what their portfolio says about them.
                  </p>
                </Signal>
              </R>
            </div>
          </Chapter>

          {/* ── Honest reading + sources ───────────────────────────── */}
          <Chapter className="py-20 sm:py-28">
            <ChapterHead kicker="How to read this honestly" title="Limits, then sources." />
            <R>
              <div className="prose-article max-w-3xl space-y-4 text-sm leading-relaxed text-[var(--foreground)]">
                <p>
                  The causal claims (doubling, tripling) come from the cited peer-reviewed studies of
                  specific programmes, not from this corpus; our record shows selection and persistence,
                  which is what you can use for positioning, not a guarantee of outcomes. Award odds,
                  timelines and ticket sizes vary by call and country; medians here are corpus-wide.
                  Coverage is graded per country on the <Link href="/" className="text-[#12264f] underline">home page</Link>.
                </p>
              </div>
            </R>
            <R delay={100}>
              <ol className="mt-6 space-y-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                {SOURCES.map((s) => (
                  <li key={s.id} id={`src-${s.id}`} className="flex gap-2">
                    <span className="font-semibold text-[#12264f]">[{s.id}]</span>
                    <a href={s.url} className="underline hover:text-[var(--foreground)]" target="_blank" rel="noopener noreferrer">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ol>
            </R>
          </Chapter>

          {/* ── Get your brief ─────────────────────────────────────── */}
          <Chapter className="py-20 sm:py-28">
            <ChapterHead kicker="Put this to work" title="See where you stand." />
            <R>
              <p className="max-w-2xl text-lg leading-relaxed text-[var(--foreground)]">
                Enter your company and get a one-page brief: comparable companies that have drawn
                public capital, the institutions to target, and what to do next.
              </p>
            </R>
            <R delay={120}>
              <Link
                href="/brief"
                className="mt-6 inline-block rounded-full bg-[#0a0a0a] px-6 py-3 font-semibold text-[#f3f2ed] transition-colors hover:bg-[#26251f]"
              >
                Get your investment brief
              </Link>
            </R>
          </Chapter>
        </EuroJourney>
      </div>
    </div>
  );
}
