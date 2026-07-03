import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { CompanySearch } from "@/components/company-search";
import manifest from "@/public/data/companies/manifest.json";

export const metadata: Metadata = {
  title: "Company lookup | EuroInvTracker",
  description:
    "Search any company and see every public funding award and state equity position we hold on it: grants, state aid, development bank support, 2021 to 2025.",
};

// The lookup rides the same dark "Follow the Euro" stage as the home and
// /for-companies trips, so it re-themes to match by overriding the CSS variables
// every control reads from.
const darkVars = {
  "--foreground": "#1d1c18",
  "--muted-foreground": "#6b6b64",
  "--border": "rgba(10,10,10,0.14)",
  "--muted": "rgba(10,10,10,0.06)",
  "--primary": "#0a0a0a",
} as CSSProperties;

export default function CompaniesPage() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-[#f3f2ed] text-[#3f3e37]" style={darkVars}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(65% 38% at 50% 0%, rgba(18,38,79,0.05), transparent 60%)" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <header className="mb-8 border-b border-[var(--border)] pb-8">
          <p className="mb-3 text-xs uppercase tracking-widest text-[#12264f]">
            Company lookup
          </p>
          <h1
            className="text-2xl sm:text-3xl font-bold leading-tight"
            style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
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
    </div>
  );
}
