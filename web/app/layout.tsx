import type { Metadata } from "next";
import Link from "next/link";
import { Poppins, Newsreader, Fragment_Mono } from "next/font/google";
import { NavBar } from "@/components/nav-bar";
import "./globals.css";
import { corpusStats, corpusAsOf } from "@/lib/data";

// Type system mirrored from regina-intel.vercel.app: Poppins for UI and body,
// Newsreader for the big editorial headlines, Fragment Mono kept for small
// data labels and credits (Regina has no mono equivalent; this is our own).
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const fragmentMono = Fragment_Mono({ subsets: ["latin"], weight: "400", variable: "--font-fragment" });

// Single source of truth for the headline company count (lib/data.corpusStats),
// which now reads the ETL's own record of its corpus at render time and falls
// back to the committed synthesis.json — so metadata, nav and footer follow the
// database instead of waiting for somebody to run `make data`.
//
// How long a figure may be out of date. Every page that states one exports the
// same window, from the one constant, so the site cannot end up with a fresh
// footer and a stale home page.
// Next requires a segment config to be a literal it can read statically --
// an imported constant makes the whole build fail with "Invalid segment
// configuration export". Kept in step with CORPUS_REVALIDATE_SECONDS by
// check_revalidate_literal.ts rather than by anybody remembering.
export const revalidate = 3600;  // = CORPUS_REVALIDATE_SECONDS

// `generateMetadata` rather than a `metadata` const: the description quotes the
// company count, and a const is evaluated at module load, where nothing can be
// awaited. Next dedupes this against the render below through React's cache(),
// so the page still costs one census read, not two.
export async function generateMetadata(): Promise<Metadata> {
  const { companies } = await corpusStats();
  return {
    title: "Wincent",
    description: `Wincent helps European companies map a public-capital raise to comparable awards, screened institutions and the priorities shaping grants, loans and public equity. Built on the funding record of ${companies.toLocaleString()} companies.`,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const stats = await corpusStats();
  const companyCount = stats.companies.toLocaleString();
  return (
    <html
      lang="en"
      className={`h-full scroll-smooth ${poppins.variable} ${newsreader.variable} ${fragmentMono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--border)] bg-[var(--background)] py-10">
          <div className="wrap">
            <p className="font-serif text-lg font-semibold text-[var(--foreground)]">Wincent</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              {companyCount} companies in the European public-capital record
            </p>
            {/* The dateline. Every figure on the site describes a corpus as it
                stood on one day, and until now the site never said which day —
                which is how it once served figures 205 instruments out of date
                without contradicting itself. It is the same sentence whether
                the numbers came from the live census or from the committed
                fallback, because the honest thing to publish is the date the
                corpus was READ, not which pipe carried it. */}
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]/80">
              {corpusAsOf(stats.provenance)}
            </p>
            {/* The privacy notice, which until now NOTHING linked to (wsEW).
                The page existed and was production-reachable; the nav carries
                two links and this footer carried none, so the only way to a
                retention notice was to already know its URL. A notice nobody
                can reach is not a notice. The footer is the right home for it:
                it is on every page, including the two the form actually lives
                behind, and it does not compete with the product CTA. */}
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em]">
              <Link
                href="/privacy"
                className="text-[var(--muted-foreground)] underline underline-offset-[3px] transition-colors hover:text-[var(--foreground)]"
              >
                Privacy
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
