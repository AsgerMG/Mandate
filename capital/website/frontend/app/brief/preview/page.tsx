// A finished brief, rendered from a fixture, for looking at.
//
// The print stylesheet had no way to be checked. Every change to it was
// reasoned about and shipped unseen, because a real brief needs a founder to
// fill in two screens and three minutes of model calls, and none of that is
// available to a rendering harness.
//
// This route renders the REAL Memo component with the REAL stylesheet from a
// recorded report, so `npm run preview:pdf` can print it with headless Chrome
// and the result can be read back. Fixture, not fabrication: the JSON is a
// brief the pipeline actually produced, kept in __fixtures.
//
// Never reachable in production — see the notFound() below.
// ── One fixture was one archetype ─────────────────────────────────────────
// A defect that shows up in one brief may be that fund's data rather than the
// writer, and the only way to tell is to look at several. Twelve archetypes
// exist and `memo_bench` records every run it makes, so BRIEF_PREVIEW_FIXTURE
// points this route at any recorded report on disk and the committed fixture
// stays the default. Dev-only, like the route itself: it reads a path from the
// environment, which is exactly why it may never be reachable in production.
import { readFileSync } from "node:fs";

import { notFound } from "next/navigation";
import { Memo } from "@/lib/intelligence/panelReport";
import { corpusProse } from "@/lib/corpusProse";
import committed from "@/lib/intelligence/__fixtures/report.json";
import type { IntelligenceReport } from "@/lib/intelligence/types";

export const metadata = { title: "Brief preview" };

function report(): IntelligenceReport {
  const from = process.env.BRIEF_PREVIEW_FIXTURE;
  if (!from) return committed as unknown as IntelligenceReport;
  return JSON.parse(readFileSync(from, "utf8")) as IntelligenceReport;
}

export default function BriefPreviewPage() {
  // A development-only surface. Guarded rather than gitignored so the guard is
  // visible in review: a preview route that quietly shipped would publish one
  // company's brief at a stable public URL.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="wrap py-8">
      <Memo report={report()} corpusWindow={corpusProse().awardWindow} />
    </main>
  );
}
