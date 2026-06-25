import type { Metadata } from "next";
import Link from "next/link";
import { CompanySearch } from "@/components/company-search";
import manifest from "@/public/data/companies/manifest.json";

export const metadata: Metadata = {
  title: "Company lookup | EuroInvTracker",
  description:
    "Search any company and see every public funding award and state equity position we hold on it: grants, state aid, development bank support, 2021 to 2025.",
};

export default function CompaniesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
      <header className="mb-8 border-b border-[var(--border)] pb-8">
        <p className="mb-3 text-xs uppercase tracking-widest text-[var(--muted-foreground)]">
          Company lookup
        </p>
        <h1
          className="text-2xl sm:text-3xl font-bold leading-tight"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          Every public euro we can trace, by company
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-[var(--muted-foreground)]">
          Search across {Number(manifest.companies).toLocaleString("en-US")} funded companies and
          organisations: EU grants, national state aid, development bank support and known state
          equity positions, 2021 to 2025. Search by name, or browse by country and sector to see
          who else has raised public capital in your space.
        </p>
      </header>

      <CompanySearch />

      <p className="mt-10 text-xs leading-relaxed text-[var(--muted-foreground)]">
        Coverage varies by country and instrument; a missing company is not evidence of no public
        funding. See <Link href="/methodology" className="underline">methodology</Link> and{" "}
        <Link href="/limitations" className="underline">limitations</Link> before quoting.
      </p>
    </div>
  );
}
