// Dump what each archetype would be told, as JSON on stdout.
//
// Exists so check_hydration_parity.ts can run the same 12 companies down the
// Postgres path and the JSON path and diff the answers. It has to be a separate
// process per path because dbInstrumentsCache is module-level: once a corpus is
// loaded, the other path is unreachable in that process.
//
// Run: npx tsx scripts/dump_verdicts.ts          (Postgres, if DATABASE_URL)
//      NO_PG=1 npx tsx scripts/dump_verdicts.ts  (JSON fallback)
//      SUPPRESS_IDS_FILE=/path/ids.json npx tsx scripts/dump_verdicts.ts
//
// SUPPRESS_IDS_FILE names a JSON array of instrument ids to withhold on top of
// whatever the corpus itself withholds. Its only user is
// check_hydration_parity.ts, and only on the Postgres arm: to check that the
// fallback ranked correctly you have to give the live corpus the same handicap
// the fallback had, because withholding a row frees a slot under the leaf cap
// and legitimately promotes the row behind it. Subtracting after the fact
// cannot see that promotion and reports it as a parity failure.
import { readFileSync as readIdsFile } from "node:fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

// This file had NO env preamble at all, because its only caller passes its own
// environment down. That worked and was still wrong: run standalone — which
// its own usage lines above invite — it read whatever the shell happened to
// hold, and a shell with nothing produced a full archetype dump off the
// snapshot with no way to tell. Both arms of check_hydration_parity are built
// from this output, so a quiet fallback here is a parity check comparing the
// snapshot with itself.
//
// STDOUT IS THE PROTOCOL: the parent JSON.parses it, so nothing here may print.
// requireCredentials is silent by design for exactly this reason.
loadEnvLocal();
const CREDENTIALS = requireCredentials("dump_verdicts", ["DATABASE_URL"]);

async function main() {
  void CREDENTIALS; // "offline" is legitimate: it is how the JSON arm is run.
  const { hydrateDbInstruments, corpusProvenance, publishableInstruments,
    suppressedForUnconfirmedLiveness,
    __forceSuppressedForParity } = await import("../lib/intelligence/corpus");
  const { computeVerdict } = await import("../lib/intelligence/pipeline");
  if (process.env.SUPPRESS_IDS_FILE) {
    __forceSuppressedForParity(
      JSON.parse(readIdsFile(process.env.SUPPRESS_IDS_FILE, "utf8")) as string[]);
  }
  await hydrateDbInstruments();

  const { ARCHETYPES: A, archetypeAnswers } = await import("../lib/intelligence/__archetypes");
  const out: Record<string, unknown> = {};
  for (const a of A) {
    const v = await computeVerdict("TestCo", a.country, archetypeAnswers(a) as never, {
      targetMarkets: [a.country],
      capitalSought: ["grant", "loan"],
      description: a.description,
    } as never);
    out[a.label] = {
      // Selection: catches a shortlist that shifted for any reason.
      ids: v.candidateInstrumentIds,
      // `gatesChecked` is what catches the inheritance trap: a child hydrated
      // without its regime evaluates nothing and silently reads `unknown`.
      rows: v.instrumentTable.map((r) => ({
        id: r.instrumentId ?? r.channel,
        gatesChecked: (r as { gatesChecked?: number }).gatesChecked ?? null,
        criteria: (r.judgementCriteria ?? []).slice(0, 3),
        structuring: (r.structuringNotes ?? []).slice(0, 3),
      })),
      // Citations: catches the framework-gate path, which lazy hydration can
      // never reach because those records never enter a shortlist.
      screen: v.eligibilityScreen.map((s2) => ({
        check: (s2 as { check?: string }).check ?? "",
        verified: (s2 as { verified?: boolean }).verified ?? null,
        sourced: ((s2 as { source?: { file?: string } }).source?.file ?? "") !== "",
      })),
      // How many funds the degradation policy took off THIS founder's table.
      // Zero on the Postgres path, always. check_degradation.ts reads it to
      // report the policy's cost, and check_hydration_parity.ts reads it to
      // tell a deliberate withholding apart from a hydration bug.
      withheld: v.withheld?.count ?? 0,
    };
  }
  // Not per archetype: which corpus this process ranked on, and every row it
  // withheld. A dump that does not say which store answered is the exact
  // ambiguity two workstreams spent a night inside.
  out.__corpus = {
    provenance: corpusProvenance(),
    suppressed: suppressedForUnconfirmedLiveness().map((r) => r.id),
    // Every fund this corpus would let a founder be offered. On the Postgres
    // run this is the register's own answer to "what may be proposed", which
    // is what check_degradation.ts holds the fallback path against -- and it
    // is not the same as "not closed": the successor redirect deliberately
    // republishes 11 expired registrations under the SA number they were
    // prolonged as, and a check that read closure off the raw row called all
    // of those a dead call.
    publishable: publishableInstruments().map((i) => i.id),
  };
  process.stdout.write(JSON.stringify(out, null, 1));
}

main();
