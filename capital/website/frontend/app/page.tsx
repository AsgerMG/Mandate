import { EuropeMap, type CountryData } from "@/components/europe-map";
import { ChannelsGraph } from "@/components/channels-graph";
import { EuroJourney, Chapter } from "@/components/euro-journey";
import { Reveal, CountUp } from "@/components/immersive";
import { ImageSlot } from "@/components/image-slot";
import Link from "next/link";
import type { ReactNode } from "react";
import countryMapRaw from "@/public/data/country_map.json";
import coverageRatingsRaw from "@/public/data/coverage_ratings.json";
import { corpusStats, CORPUS_REVALIDATE_SECONDS, type Synthesis } from "@/lib/data";

// Headline counts come from the single corpus-wide source (lib/data.corpusStats),
// which also drives the nav, the layout footer and /about-public-capital, so
// every page shows the same number — and now the same number as the ETL's own
// record of its corpus, rather than whatever was last committed.
// Literal, not the imported constant: Next reads segment config statically and
// fails the whole build on anything it cannot evaluate. check_revalidate_literal.ts
// keeps this in step with CORPUS_REVALIDATE_SECONDS.
export const revalidate = 3600;  // = CORPUS_REVALIDATE_SECONDS

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
    <div className="border-[var(--border)] p-5 sm:p-6 [&:nth-child(odd)]:border-r [&:nth-last-child(n+3)]:border-b">
      <div className="text-2xl font-bold tabular-nums text-[var(--foreground)] sm:text-3xl" style={serif}>
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{label}</div>
    </div>
  );
}

/** A 2-column KPI matrix that rides alongside the narrative. */
function StatMatrix({ children }: { children: ReactNode }) {
  return (
    <Reveal delay={120}>
      <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70">
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
  const { capValue, capSuffix, capDecimals } = capitalParts(synth);
  return (
    <div>
      {/* ── Cold open: headline left, Brussels right — the editorial split. ── */}
      {/* Page-head offset is shared with /about-public-capital and /brief
          (pt-16 sm:pt-20) so the eyebrow lands at the same y on every page. */}
      <section className="relative overflow-hidden bg-[var(--background)] pt-16 pb-20 sm:pt-20 sm:pb-24">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 22% 0%, rgba(16,32,63,0.05), transparent 62%)",
          }}
          aria-hidden
        />
        <div className="relative wrap grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
              For companies raising in Europe
            </p>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-[3.4rem]" style={serif}>
              Understand how companies like yours raise Europe&apos;s public capital
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--foreground-soft)]">
              We mapped the EU grants, state aid and public capital behind{" "}
              {synth.companies.toLocaleString()} European companies. Enter yours and get a one-page
              brief: which comparable companies have drawn public funding, through which
              instruments, and a prioritised to-do list for your own raise.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/brief"
                className="rounded-[var(--radius)] border border-[var(--primary)] px-6 py-3 text-[15px] font-semibold uppercase tracking-[0.06em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)]"
              >
                See your comparables
              </Link>
            </div>
          </div>

          {/* Artwork slot, in the reference's flat editorial frame. */}
          <ImageSlot label="Berlaymont, Brussels — the European Commission" />
        </div>

        {/* Scroll cue into the trip below */}
        <a
          href="#understand"
          className="relative mx-auto mt-14 flex w-fit flex-col items-center gap-1.5 text-sm font-medium text-[var(--accent)]/80 transition-opacity hover:opacity-70"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">Follow the euro</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce" aria-hidden="true">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </a>
      </section>

      {/* ── The trip: Follow the Euro ───────────────────────────── */}
      <div className="relative bg-[var(--background)] text-[var(--foreground)]">
        {/* Ambient glow: EU-blue at the top, a warm coin-gold lower down. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(66% 42% at 50% 0%, rgba(16,32,63,0.05), transparent 60%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <EuroJourney>
            {/* Chapter 1 — Launch */}
            <Chapter id="understand" className="flex min-h-[92vh] flex-col justify-center py-24">
              <Reveal>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
                  A study of European public capital
                </p>
              </Reveal>
              <Reveal delay={120}>
                <h2
                  className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] sm:text-6xl"
                  style={serif}
                >
                  How the state funds European companies.
                </h2>
              </Reveal>
              <Reveal delay={260}>
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--foreground-soft)]">
                  Grants, state aid and development-bank finance push hundreds of billions of euros
                  into companies every year. We traced the channels, and where the money lands.
                </p>
              </Reveal>
              <Reveal delay={420}>
                <div className="mt-10 flex items-center gap-3 text-sm text-[var(--accent)]/80">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] font-serif text-base font-bold text-[var(--paper)] shadow-[0_1px_3px_rgba(10,10,10,0.2)]">
                    €
                  </span>
                  <span className="uppercase tracking-[0.2em]">Scroll to begin</span>
                </div>
              </Reveal>
            </Chapter>

            {/* Chapter 2 — The channels graph: the pinned, camera-driven anchor */}
            <ChannelsGraph />

            {/* Chapter 3 — We tried to track it: the KPIs */}
            <Chapter className="py-24 sm:py-32">
              <div className="grid gap-12 lg:grid-cols-[1fr_23rem] lg:items-center">
                <div>
                  <Reveal>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">The record</p>
                  </Reveal>
                  <Reveal delay={100}>
                    <h3 className="mt-4 text-3xl font-semibold text-[var(--foreground)] sm:text-4xl" style={serif}>
                      We tried to track all of it.
                    </h3>
                  </Reveal>
                  <Reveal delay={160}>
                    <p className="mt-5 max-w-xl leading-relaxed text-[var(--foreground-soft)]">
                      We assembled every company we could find across those channels, 2020 to 2025:
                      the main EU instruments, the national development banks, and the EU State Aid
                      Transparency Register covering two dozen national authorities.
                    </p>
                  </Reveal>
                </div>
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
              </div>
            </Chapter>

            {/* Chapter 5 — Where it lands: the map */}
            <Chapter className="py-24 sm:py-32">
              <Reveal>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">Where it lands</p>
              </Reveal>
              <Reveal delay={100}>
                <h3 className="mt-4 max-w-3xl text-3xl font-semibold text-[var(--foreground)] sm:text-4xl" style={serif}>
                  Across the continent, unevenly.
                </h3>
              </Reveal>
              <Reveal delay={150}>
                <figure className="mt-10">
                  <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70 p-3 sm:p-5">
                    <EuropeMap countryData={countryData} />
                  </div>
                  <figcaption className="mt-4 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    Countries are shaded by the number of companies reached, not the size of the
                    awards, so a country that publishes many small state-aid line items shows up darker than one making a few large bets. Hover a country to break its total
                    into the three public layers and see which instruments reach it.
                  </figcaption>
                </figure>
              </Reveal>
              <Reveal>
                <div className="mt-10 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70 p-5">
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
                    What the corpus is not
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--foreground-soft)]">
                    Coverage is uneven by design. Several instruments record only the named
                    coordinator of a consortium, so participants are undercounted. Horizon Europe
                    Pillar II is loaded at organisation level, which inflates its company count
                    relative to the rest. Capital figures are amounts committed, not amounts
                    disbursed, and some instruments report ceilings rather than awards. And the three
                    channels are not watertight: an IPCEI project is an EU affair but is paid out as
                    national state aid, and much development-bank money is itself state aid, so the
                    split is partly one of who reports it, not of economics.
                  </p>
                </div>
              </Reveal>
            </Chapter>

            {/* Chapter 6 — The handoff / CTA */}
            <Chapter className="py-28 text-center sm:py-36">
              <Reveal>
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] font-serif text-xl font-bold text-[var(--paper)] shadow-[0_1px_3px_rgba(10,10,10,0.2)]">
                  €
                </span>
              </Reveal>
              <Reveal delay={100}>
                <h3 className="mt-7 text-3xl font-semibold text-[var(--foreground)] sm:text-5xl" style={serif}>
                  Check your company.
                </h3>
              </Reveal>
              <Reveal delay={160}>
                <p className="mx-auto mt-5 max-w-xl leading-relaxed text-[var(--foreground-soft)]">
                  See where, for what and how comparable companies have drawn Europe&apos;s public
                  funding, and the instruments that fit your own raise.
                </p>
              </Reveal>
              <Reveal delay={220}>
                <div className="mt-9 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/brief"
                    className="rounded-[var(--radius)] border border-[var(--primary)] px-6 py-3 font-semibold uppercase tracking-[0.06em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)]"
                  >
                    Map your comparables
                  </Link>
                </div>
              </Reveal>
            </Chapter>
          </EuroJourney>
        </div>
      </div>
    </div>
  );
}
