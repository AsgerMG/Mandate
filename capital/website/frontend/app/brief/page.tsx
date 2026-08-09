import type { Metadata } from "next";
import Link from "next/link";
import { IntelligencePanel } from "@/lib/intelligence/panel";
import { corpusStats } from "@/lib/data";

export const metadata: Metadata = {
  title: "Get your state-backed capital brief | Wincent",
  description:
    "Enter your company and get a one-page brief: which comparable companies have drawn European public capital, through which instruments, and a prioritised to-do list for your own raise.",
};

// The progress panel states the size of the funding record while it works, and
// the layout footer states it too. Both now read the same census, so the two
// figures on one screen cannot disagree — they did, by five thousand companies.
// Literal, not the imported constant: Next reads segment config statically.
// check_revalidate_literal.ts keeps this in step with CORPUS_REVALIDATE_SECONDS.
export const revalidate = 3600;  // = CORPUS_REVALIDATE_SECONDS

export default async function BriefPage() {
  const { companies } = await corpusStats();
  return (
    <section className="relative flex min-h-[calc(100svh-var(--nav-h))] flex-col overflow-hidden bg-[var(--background)] pt-16 pb-6 sm:pt-20">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 12%, rgba(16,32,63,0.05), transparent 62%)",
        }}
        aria-hidden
      />
      {/* items-start, not items-center: centring re-floated the panel and its
          heading landed at a different height than the page heads on / and
          /about-public-capital. Anchored to the shared offset instead. */}
      <div className="relative flex flex-1 items-start">
        <div className="wrap">
          <IntelligencePanel corpusCompanies={companies} />
        </div>
      </div>
      <div className="relative flex justify-center pt-4 pb-2">
        <Link
          href="/about-public-capital"
          aria-label="Why you should care about raising public European capital"
          className="group inline-flex items-center gap-2 text-[var(--accent)]/80 transition-opacity hover:opacity-70"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.16em]">Why this matters</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
