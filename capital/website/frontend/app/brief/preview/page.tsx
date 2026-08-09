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
import { notFound } from "next/navigation";
import { Memo } from "@/lib/intelligence/panelReport";
import { corpusProse } from "@/lib/corpusProse";
import fixture from "@/lib/intelligence/__fixtures/report.json";
import type { IntelligenceReport } from "@/lib/intelligence/types";

export const metadata = { title: "Brief preview" };

export default function BriefPreviewPage() {
  // A development-only surface. Guarded rather than gitignored so the guard is
  // visible in review: a preview route that quietly shipped would publish one
  // company's brief at a stable public URL.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="wrap py-8">
      <Memo report={fixture as unknown as IntelligenceReport} corpusWindow={corpusProse().awardWindow} />
    </main>
  );
}
