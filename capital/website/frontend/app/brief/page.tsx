import type { Metadata } from "next";
import Link from "next/link";
import { IntelligencePanel } from "@/lib/intelligence/panel";

export const metadata: Metadata = {
  title: "Get your investment brief | EuroInvTracker",
  description:
    "Enter your company and get a one-page brief: which comparable companies have drawn European public capital, through which instruments, and a prioritised to-do list for your own raise.",
};

export default function BriefPage() {
  return (
    <section className="relative flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden bg-[#f3f2ed] px-4 sm:px-6 pt-5 pb-3">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 12%, rgba(18,38,79,0.05), transparent 62%)",
        }}
        aria-hidden
      />
      <div className="relative flex flex-1 items-center">
        <div className="mx-auto w-full max-w-5xl">
          <IntelligencePanel />
        </div>
      </div>
      <div className="relative flex justify-center pt-4 pb-2">
        <Link
          href="/about-public-capital"
          aria-label="Why you should care about raising public European capital"
          className="group inline-flex items-center gap-2 text-[#12264f]/80 transition-opacity hover:opacity-70"
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
