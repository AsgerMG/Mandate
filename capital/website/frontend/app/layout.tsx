import type { Metadata } from "next";
import { Inter, Playfair_Display, Fragment_Mono } from "next/font/google";
import { NavBar } from "@/components/nav-bar";
import "./globals.css";
import { corpusStats } from "@/lib/data";

// The Legora-style type system: Inter for UI and body, Playfair Display for the
// big editorial headlines, Fragment Mono for small data labels and credits.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });
const fragmentMono = Fragment_Mono({ subsets: ["latin"], weight: "400", variable: "--font-fragment" });

// Single source of truth for the headline company count (lib/data.corpusStats →
// synthesis.json), regenerated from db.sqlite by `make data`, so metadata +
// footer never go stale or disagree with other pages.
const companyCount = corpusStats.companies.toLocaleString();

export const metadata: Metadata = {
  title: "EuroInvTracker",
  description: `Where Europe's public capital actually goes. A data study of ${companyCount} companies across the main EU funding instruments, the national development banks, and the EU State Aid Transparency Register.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full scroll-smooth ${inter.variable} ${playfair.variable} ${fragmentMono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-black/10 bg-[var(--background)] py-10">
          <div className="mx-auto max-w-6xl px-4 flex flex-wrap items-baseline justify-between gap-6">
            <div>
              <p className="font-serif text-lg font-semibold text-[var(--foreground)]">EuroInvTracker</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                {companyCount} companies · EU instruments · development banks · state aid register
              </p>
            </div>
            <div className="flex gap-6 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              <a href="/methodology" className="transition-colors hover:text-[var(--foreground)]">Methodology</a>
              <a href="/limitations" className="transition-colors hover:text-[var(--foreground)]">Limitations</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
