// Dump what each archetype would be told, as JSON on stdout.
//
// Exists so check_hydration_parity.ts can run the same 12 companies down the
// Postgres path and the JSON path and diff the answers. It has to be a separate
// process per path because dbInstrumentsCache is module-level: once a corpus is
// loaded, the other path is unreachable in that process.
//
// Run: npx tsx scripts/dump_verdicts.ts          (Postgres, if DATABASE_URL)
//      NO_PG=1 npx tsx scripts/dump_verdicts.ts  (JSON fallback)

async function main() {
  if (process.env.NO_PG) delete process.env.DATABASE_URL;
  const { hydrateDbInstruments } = await import("../lib/intelligence/corpus");
  const { computeVerdict } = await import("../lib/intelligence/pipeline");
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
    };
  }
  process.stdout.write(JSON.stringify(out, null, 1));
}

main();
