import type { Metadata } from "next";
import { Poppins, Newsreader, Fragment_Mono } from "next/font/google";
import { NavBar } from "@/components/nav-bar";
import "./globals.css";
import { corpusStats } from "@/lib/data";

// Type system mirrored from regina-intel.vercel.app: Poppins for UI and body,
// Newsreader for the big editorial headlines, Fragment Mono kept for small
// data labels and credits (Regina has no mono equivalent; this is our own).
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
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
      className={`h-full scroll-smooth ${poppins.variable} ${newsreader.variable} ${fragmentMono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--border)] bg-[var(--background)] py-10">
          <div className="mx-auto max-w-6xl px-4">
            <p className="font-serif text-lg font-semibold text-[var(--foreground)]">EuroInvTracker</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              {companyCount} companies · EU instruments · development banks · state aid register
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
