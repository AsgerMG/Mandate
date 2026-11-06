import { NextRequest } from "next/server";
import { resolveProfileBody } from "@/lib/mandate/profileRequest";
import { corpusProvenance, hydrateDbInstruments } from "@/lib/intelligence/corpus";
import { computeVerdict } from "@/lib/intelligence/pipeline";
import { sanitizeCapitalSought, sanitizeEligibility, sanitizeFreeText,
  withIncorporationCountry,
} from "@/lib/intelligence/sanitize";
import type { IntelligenceRequest } from "@/lib/intelligence/types";

// The fast path: a deterministic eligibility verdict, zero model calls (local
// DB match + code-only evaluation), so it returns in well under a second —
// unlike /api/intelligence, which streams a 2-3 minute AI-researched memo.
// Node runtime for the corpus lookups, which reach POSTGRES: hydrateDbInstruments()
// dynamically imports `pg` and degrades to the committed JSON snapshot when that
// fails. This said "the SQLite-backed corpus lookups" (wsEW) — the local
// db.sqlite is the ETL's cache, no SQLite driver is a dependency of this app,
// and nothing on a request path has read that file. Never statically optimised.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: NextRequest) {
  let body: IntelligenceRequest;
  try {
    body = (await request.json()) as IntelligenceRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // The shared Mandate profile, when sent, is the company: capital's own body
  // fields are derived from it (lib/mandate/profileRequest.ts). Absent, no-op.
  const resolved = resolveProfileBody(body);
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 400 });
  }
  body = resolved.body;

  if (!body.company || !body.company.trim()) {
    return Response.json({ error: "A company name is required." }, { status: 400 });
  }

  try {
    await hydrateDbInstruments();
    // ── WHICH CORPUS THIS DEPLOYMENT ACTUALLY RANKED ON ────────────────────
    // `hydrateDbInstruments` degrades to the committed snapshot on any Postgres
    // failure and continues — which is right for a founder mid-request and was,
    // until now, invisible from outside the process. `corpusProvenance()` has
    // existed since wsCF and is read by fourteen harnesses, every one of which
    // runs the pipeline IN ITS OWN PROCESS. Not one of them can say which corpus
    // the DEPLOYMENT is on, so "are the gate corrections we publish reaching a
    // founder at all" had no observation anywhere.
    //
    // It is on the verdict route because this is the route that decides which
    // funds exist for this founder, and because it is the cheap one: a reader
    // can ask the question without provoking a memo. Read AFTER hydration.
    //
    // Safe to serve unauthenticated, by the same argument as /api/guards: a
    // store name, a count, and two timestamps. It names no fund and no founder.
    const verdict = await computeVerdict(
      body.company.trim(),
      body.country?.trim() || undefined,
      withIncorporationCountry(sanitizeEligibility(body.eligibility), body.country?.trim()),
      {
        // `targetMarkets: sanitizeTargetMarkets(body.targetMarkets)` was here
        // (wsIK). The panel never sent the field, so this read was `undefined`
        // on every request and only a harness could fill it.
        capitalSought: sanitizeCapitalSought(body.capitalSought),
        // Drives thematic leaf selection (relevance.ts), so the shortlist the
        // adaptive round is grounded in already reflects what they do.
        description: sanitizeFreeText(body.description),
      },
    );
    return Response.json({ ...verdict, corpus: corpusProvenance() });
  } catch (err) {
    console.error("verdict route failed:", err);
    return Response.json({ error: "Could not compute the verdict." }, { status: 500 });
  }
}
