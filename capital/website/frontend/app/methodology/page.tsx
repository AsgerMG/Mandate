import { readFileSync } from "fs";
import { join } from "path";
import { CountryCoverageTable } from "@/components/country-coverage-table";
import { EquityCoverageTable } from "@/components/equity-coverage-table";

export const metadata = { title: "Methodology · EuroInvTracker" };

function getContent(): string {
  try {
    return readFileSync(join(process.cwd(), "..", "..", "project-mgmt", "methodology.md"), "utf-8");
  } catch {
    return "_Methodology document not found._";
  }
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export default function Page() {
  const content = getContent();
  const lines = content.split("\n");

  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)]">Reference document</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold">Methodology</h1>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          Canonical source: <code>project-mgmt/methodology.md</code> in the repository.
        </p>
      </header>

      <div className="prose text-sm space-y-3">
        {lines.map((line, i) => {
          if (line.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold mt-8">{line.slice(2)}</h1>;
          if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-semibold mt-6">{line.slice(3)}</h2>;
          if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold mt-4">{line.slice(4)}</h3>;
          if (line.match(/^[-*] /)) return <li key={i} className="ml-4 list-disc leading-relaxed">{renderInline(line.slice(2))}</li>;
          if (line.trim() === "") return <br key={i} />;
          return <p key={i} className="leading-relaxed">{renderInline(line)}</p>;
        })}
      </div>

      {/* ── Data collection: coverage grading, country by country ── */}
      <section className="mt-14 border-t border-[var(--border)] pt-10">
        <h2 className="text-xl font-semibold">Data collection: coverage, country by country</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Every country graded for coverage. Click a row for the sources behind it and the known
          gaps. A low grade means thin sources, not necessarily thin spending.
        </p>

        <div className="mt-5">
          <CountryCoverageTable />
        </div>

        <h3 className="mt-10 text-lg font-semibold">The same grading, for public equity</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Grants and loans are published because state-aid law forces it. Equity invested at market
          terms is not, so the equity layer gets its own grading: not how much each state invests,
          but how much of it the state lets you see. E-A means an independent register makes positions
          near-complete; E-B means the institution publishes its own portfolio; E-C means press
          releases or aggregate statistics; E-X means nothing is recoverable. Two countries earn E-A:
          the United Kingdom, through one statutory register, and Estonia, whose business register
          publishes every shareholding as open data. France, home of the continent&apos;s largest
          state investor, sits at E-C. The EU itself is graded in the table as an entity, and does not
          score well. Expanded rows also carry what each institution discloses about its own returns;
          for most, the answer is nothing.
        </p>

        <div className="mt-5">
          <EquityCoverageTable />
        </div>
      </section>
    </article>
  );
}
