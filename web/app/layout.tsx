import type { Metadata } from "next";
import Link from "next/link";
import { Poppins, Newsreader, Fragment_Mono } from "next/font/google";
import { NavBar } from "@/components/nav-bar";
import "./globals.css";

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

// The site is Mandate; each agent's pages set their own title. Wincent's
// landing page, which used to be `/` and inherited this, now carries its own
// metadata (app/wincent/page.tsx), including the company count.
export const metadata: Metadata = {
  title: { default: "Mandate", template: "%s | Mandate" },
  applicationName: "Mandate",
  openGraph: { siteName: "Mandate", type: "website" },
  description:
    "Your public-affairs operating system. Mandate watches policy and public capital, then tells your company what to do next.",
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
          <div className="wrap flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-serif text-xl font-semibold text-[var(--foreground)]">Mandate</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
                Public-affairs intelligence for European companies.
              </p>
            </div>
            <div className="flex gap-5 font-mono text-[10px] uppercase tracking-[0.12em]">
              <Link href="/privacy" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                Privacy
              </Link>
              <Link href="/workspace" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                Workspace
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
