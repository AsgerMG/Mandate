import type { Metadata } from "next";
import { NavBar } from "@/components/nav-bar";
import "./globals.css";
import synthesis from "@/public/data/synthesis.json";

// Single source of truth for the headline company count — regenerated from
// db.sqlite by `make data`, so metadata + footer never go stale.
const companyCount = (synthesis as { companies: number }).companies.toLocaleString();

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
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--border)] py-6 text-xs text-[var(--muted-foreground)] mt-16">
          <div className="mx-auto max-w-6xl px-4 flex flex-wrap gap-4 items-center justify-between">
            <span>EuroInvTracker · {companyCount} companies · EU instruments, national development banks, and state aid register</span>
            <div className="flex gap-4">
              <a href="/methodology" className="hover:text-[var(--foreground)] transition-colors">Methodology</a>
              <a href="/limitations" className="hover:text-[var(--foreground)] transition-colors">Limitations</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
