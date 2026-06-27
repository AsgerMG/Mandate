import { KpiGrid } from "@/components/kpi-grid";
import { EuropeMap } from "@/components/europe-map";
import { TaxonomyDiagram } from "@/components/taxonomy-diagram";
import { ThesisIllustration } from "@/components/thesis-illustration";
import { CountryCoverageTable } from "@/components/country-coverage-table";
import { EquityCoverageTable } from "@/components/equity-coverage-table";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import Link from "next/link";
import countryMapRaw from "@/public/data/country_map.json";
import coverageRatingsRaw from "@/public/data/coverage_ratings.json";
import { corpusStats } from "@/lib/data";

// Headline counts come from the single corpus-wide source (lib/data.corpusStats
// → synthesis.json), which also drives the layout footer and /for-companies, so
// every page shows the same number.
const synth = corpusStats;

const coverageRatings = coverageRatingsRaw as Record<string, { rating: string; note: string }>;

const countryData = Object.fromEntries(
  Object.entries(
    (countryMapRaw as { countries: Record<string, {
      name: string;
      companies: number;
      totalEur: number;
      byFamily: { family: string; label: string; companies: number }[];
    }> }).countries
  ).map(([iso2, d]) => [iso2, { ...d, coverageRating: coverageRatings[iso2] }])
);

export default function Home() {
  return (
    <div>
      {/* ── Full-screen founder landing: only the tool pitch, centered ─── */}
      <section className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gradient-to-br from-[#eef2ff] via-white to-[#f0fdf4] px-4 text-center">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs uppercase tracking-widest text-[var(--muted-foreground)]">
            For companies raising in Europe
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            See what your competitors have raised from Europe&apos;s public purse
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[var(--foreground)]">
            We mapped the EU grants, state aid and public capital behind{" "}
            {synth.companies.toLocaleString()} European companies. Enter yours and get a one-page
            competitive brief: who your peers are, what public money each has accessed, and a
            prioritised to-do list for your own raise.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/for-companies"
              className="rounded-lg bg-[#003399] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[#002277]"
            >
              Check your competitors
            </Link>
            <Link
              href="/companies"
              className="rounded-lg border border-[#003399] px-5 py-2.5 font-semibold text-[#003399] transition-colors hover:bg-[#003399] hover:text-white"
            >
              Search the company database
            </Link>
          </div>
        </div>

        {/* Scroll cue into the study below */}
        <a
          href="#understand"
          className="absolute bottom-8 flex flex-col items-center gap-1.5 text-sm font-semibold text-[#003399] transition-opacity hover:opacity-70"
        >
          <span>Understand the EuroInvTracker</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce" aria-hidden="true">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </a>
      </section>

      {/* ── Study body ───────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header id="understand" className="scroll-mt-20 mb-10 border-b border-[var(--border)] pb-10">
        <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)] mb-3">
          An investigation into European public capital
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          EuroInvTracker - Understand where Europe&apos;s public capital actually goes
        </h1>
        <p className="mt-4 text-lg text-[var(--muted-foreground)] max-w-2xl leading-relaxed">
          Across the continent, governments and the European Union are pouring public money into
          companies, betting that the state can shape markets the private sector will not enter
          alone. This is an attempt to map that machine: what it is, where the money goes, and
          whether the money follows the design.
        </p>
      </header>

      {/* ── How it plays out in Europe: corpus KPIs + map ────────── */}
      <Section title="How it plays out in Europe" caption="The corpus, and where the money actually lands">
        <KpiGrid
          cols={6}
          items={[
            { label: "Companies", value: synth.companies.toLocaleString() },
            { label: "Events", value: synth.events.toLocaleString() },
            { label: "Total committed", value: synth.totalCapitalEur },
            { label: "Instruments", value: synth.sourceFamilies },
            { label: "Countries", value: synth.countries },
            { label: "Sectors", value: synth.sectors },
          ]}
        />

        <div className="prose-article max-w-2xl space-y-4 text-[var(--foreground)] leading-relaxed mt-8">
          <p>
            To see the machine at work we assembled every company we could find in the two public
            layers from 2020 to 2025: the main EU instruments, the national development banks, and
            the EU State Aid Transparency Register covering two dozen national authorities.
          </p>
        </div>

        <div className="mt-6">
          <EuropeMap countryData={countryData} />
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
            Countries are shaded by company count, ranked into bands taken from the data rather than
            fixed thresholds. Hover a country to reveal its funding mix and which instruments reach
            it.
          </p>
        </div>

        <Callout title="What the corpus is not">
          <p>
            Coverage is uneven by design. Several instruments record only the named coordinator of
            a consortium, so participants are undercounted. Horizon Europe Pillar II is loaded at
            organisation level, which inflates its company count relative to the rest. Capital
            figures are amounts committed, not amounts disbursed, and some instruments report
            ceilings rather than awards.
          </p>
        </Callout>
      </Section>

      {/* ── Why public money (the theory), illustration alongside ── */}
      <Section title="Why governments back companies" caption="The idea behind public capital as an anchor">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div className="prose-article space-y-4 text-[var(--foreground)] leading-relaxed">
            <p>
              The oldest case for public money in innovation is market failure. Knowledge spills
              over, so private firms underinvest in the risky, early research whose benefits they
              cannot fully capture. Capital markets, in turn, shy away from the long, uncertain
              gap between a laboratory result and a sellable product, the so-called valley of death.
              On this view the state has a narrow job: fix the failure, fund the basic science, then
              step back and let the market take over.
            </p>
            <p>
              A more ambitious view now shapes European policy. In the work of economists such as
              Mariana Mazzucato, the state is not a patch for market failure but an active investor
              that takes risks and shapes markets, an entrepreneurial state that sets missions and
              crowds private money in behind it. Public capital becomes an anchor: it de-risks the
              first, hardest bets and signals where private capital should follow. The return of
              industrial policy, from the IPCEI projects to the Net-Zero and chips agendas and the
              scramble for strategic autonomy, runs on exactly this logic.
            </p>
            <p>
              Both views share a promise: public money is supposed to lead somewhere, to pull private
              investment in behind it rather than substitute for it. This study asks how that promise
              looks in the data.
            </p>
          </div>

          <ThesisIllustration />
        </div>
      </Section>

      {/* ── The taxonomy: diagram left, text right ───────────────── */}
      <Section title="The taxonomy" caption="The three layers of capital a European company can draw on">
        <div className="grid gap-8 md:grid-cols-5 md:items-start">
          <div className="md:col-span-3">
            <TaxonomyDiagram />
          </div>

          <div className="prose-article md:col-span-2 space-y-4 text-[var(--foreground)] leading-relaxed md:pt-4">
            <p>
              Before the data, the map of the territory. A company in Europe sits beneath three
              layers of capital. At the top is the <strong>pan-European</strong>{" "}layer: the EU&apos;s
              own instruments, funding missions and strategic projects from the common budget. Beneath
              it sits <strong>national industrial policy</strong>: each member state&apos;s own state
              aid and development banks, executing national plans. At the bottom is the
              {" "}<strong>private market</strong>, the venture capital, growth equity and bank lending
              that the public layers are meant to hand off to.
            </p>
            <p>
              This study covers the two public layers. The private layer sits outside it, shown here
              only as the destination the public anchors are designed to reach.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Country-by-country transparency ──────────────────────── */}
      <Section
        title="Country by country, graded"
        caption="Every country in scope: its coverage grade, the sources behind it, and the known gaps"
      >
        <div className="prose-article max-w-2xl text-[var(--foreground)] leading-relaxed mb-3">
          <p className="text-sm">
            Every country graded for coverage. Click a row for sources and known gaps. A low grade
            means thin sources, not necessarily thin spending.
          </p>
        </div>

        <CountryCoverageTable />

        <div className="prose-article max-w-2xl text-[var(--foreground)] leading-relaxed mb-3 mt-10">
          <h3 className="text-base font-semibold mb-2">The same grading, for public equity</h3>
          <p className="text-sm">
            Grants and loans are published because state-aid law forces it. Equity invested at
            market terms is not, so the equity layer gets its own grading: not how much each state
            invests, but how much of it the state lets you see. E-A means an independent register
            makes positions near-complete; E-B means the institution publishes its own portfolio;
            E-C means press releases or aggregate statistics; E-X means nothing is recoverable.
            Two countries earn E-A: the United Kingdom, through one statutory register, and
            Estonia, whose business register publishes every shareholding as open data. France,
            home of the continent&apos;s largest state investor, sits at E-C. The EU itself is
            graded in the table as an entity, and does not score well. Expanded rows also carry
            what each institution discloses about its own returns; for most, the answer is
            nothing.
          </p>
        </div>

        <EquityCoverageTable />
      </Section>
      </div>
    </div>
  );
}
