// Is a founder ever shown a fund that has closed?
//
// ── The harm, not the mechanism ────────────────────────────────────────────
// `hydrateDbInstruments()` degrades to the committed snapshot on any Postgres
// failure, and a 2-second statement timeout on a loaded database is enough to
// put a real founder's request on that path. Measured on the pinned 150-pair
// sample, 2026-08-06:
//
//                     founders shown >=1 closed call in top 5   dead calls in pool
//   Postgres                       0%                                  1.1
//   snapshot fallback             26%                                 20.3
//
// The temptation is to test the mechanism: "is the fallback flagged", "does the
// snapshot carry a schemeEndBasis key", "is provenance recorded". Every one of
// those passes on a day when the harm has found a new route. So this check
// asserts the OUTCOME, in the only terms that matter to the person reading the
// brief:
//
//     no fund a founder is shown on the fallback corpus may be one the live
//     register says has closed
//
// tested by building each archetype's table off the snapshot exactly as a
// degraded request would, and then asking POSTGRES about every row it produced.
// The live register is the referee, not the corpus under test, which is what
// keeps this from being the suppression rule checking its own homework.
//
// It fails loudly on the state this repo was in before the policy landed: the
// AI-B2C archetype drew 78 Spanish convocatorias off the snapshot whose
// deadlines Postgres already held.
//
// ── The second half: what the policy COSTS ─────────────────────────────────
// Suppression is only tolerable if it is small and if its size is visible.
// Withholding is reported per archetype -- rows withheld, and what that does to
// the five a founder actually reads -- so a change that quietly starts
// withholding half the corpus shows up as a number rather than as a support
// ticket. It is reported, deliberately not thresholded: a floor here would be
// one more constant to lower under pressure, and the assertion above is the
// one that must never bend.
import { execFileSync } from "node:child_process";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
const CREDENTIALS = requireCredentials("check_degradation", ["DATABASE_URL", "VOYAGE_KEY"]);

import { DISPLAY_CAP } from "../lib/intelligence/shortlist";
import { today } from "../lib/intelligence/liveness";

interface Archetype { ids: string[]; rows: { id: string }[]; withheld: number }
/** `__corpus` carries the run's provenance and suppression list; every other
 *  key is an archetype. Filtered by `archetypes()` so a new diagnostic key can
 *  never be silently graded as if it were a founder. */
interface CorpusInfo {
  provenance: { source: string; degraded: boolean; observedAt: string };
  suppressed: string[];
  publishable: string[];
}
type Dump = Record<string, Archetype> & { __corpus?: CorpusInfo };
const archetypes = (d: Dump) => Object.keys(d).filter((k) => !k.startsWith("__"));

function run(env: Record<string, string>): Dump {
  const out = execFileSync("npx", ["tsx", "scripts/dump_verdicts.ts"], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(out) as Dump;
}

async function main() {
  // NO_PG=1 is this repo's "there is no database" -- CI sets it deliberately so
  // the suite stays hermetic, and every other Postgres-touching script honours
  // it. This check needs the live register AS ITS REFEREE, so under NO_PG there
  // is nothing to referee with and running anyway would either compare the
  // snapshot with itself or reach a database it was told not to. Skipping is
  // the honest answer; the hard failure below is kept for the case that
  // actually matters, a deliberate run whose credentials are missing.
  if (CREDENTIALS === "offline") {
    console.log("check_degradation: skipped — NO_PG=1, so there is no live " +
      "register to referee the fallback corpus against. Run without NO_PG, with " +
      "DATABASE_URL set, to exercise it.");
    return;
  }
  // The "cannot run — no DATABASE_URL" branch that used to sit here now lives
  // in requireCredentials, above, for every harness at once. This file had
  // already got that judgement right by hand; thirty-six others had not.

  // The degraded path, built exactly as a request that lost Postgres would.
  const fallback = run({ NO_PG: "1" });
  // The same 12 archetypes on the live register, for the cost comparison only.
  const live = run({ NO_PG: "" });

  const asOf = today();
  // ── The referee ─────────────────────────────────────────────────────────
  // What the LIVE register would let a founder be offered, which is the
  // product's own `publishableInstruments()` run against Postgres -- not
  // `isClosed()` over the raw rows.
  //
  // The distinction cost a red run to find and is worth stating: the successor
  // redirect keeps an expired registration whose register says the scheme was
  // prolonged under a new SA number, and republishes it under that number with
  // its end date cleared. Five German, one Dutch and one Swedish scheme are in
  // that set. Read off the raw row they are closed; read through the product's
  // definition they are open, correctly, and a founder applying to them applies
  // to a live registration. A guard that got this wrong would have pushed
  // somebody to delete the redirect.
  const pgCorpus = live.__corpus;
  if (!pgCorpus || pgCorpus.provenance.source !== "postgres") {
    console.error("check_degradation: the live arm did not reach Postgres " +
      `(source=${pgCorpus?.provenance.source ?? "unknown"}). There is no referee; refusing to pass.`);
    process.exit(1);
  }
  const offerable = new Set(pgCorpus.publishable);
  // Everything the live corpus holds at all, so a snapshot row that no longer
  // exists is caught separately from one that exists and has shut.
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let known: Set<string>;
  try {
    known = new Set((await client.query(`SELECT id FROM funding_instruments`))
      .rows.map((r) => r.id as string));
  } finally {
    await client.end();
  }

  const problems: string[] = [];
  let shownTotal = 0, withheldTotal = 0, foundersHarmed = 0;
  const costLines: string[] = [];

  for (const label of archetypes(fallback)) {
    const f = fallback[label];
    const l = live[label];
    const shown = f.ids.slice(0, DISPLAY_CAP);
    shownTotal += shown.length;
    withheldTotal += f.withheld ?? 0;

    // ── THE ASSERTION ──────────────────────────────────────────────────────
    // Every row this founder is shown, and every row in the pool the writer
    // reasons over, must be one the live register still calls open. The pool
    // is included because a fund the writer is told about is a fund it can
    // recommend in prose even when the fund is not a table row.
    const deadShown = shown.filter((id) => known.has(id) && !offerable.has(id));
    const deadPool = f.ids.filter((id) => known.has(id) && !offerable.has(id));
    if (deadShown.length) foundersHarmed++;
    if (deadShown.length) {
      problems.push(
        `${label}: ${deadShown.length} of the ${shown.length} funds shown are ones the ` +
        `live register would NOT offer\n        ${deadShown.join(", ")}`);
    } else if (deadPool.length) {
      problems.push(
        `${label}: ${deadPool.length} fund(s) the live register would not offer reached the ` +
        `pool the writer reasons over\n` +
        `        ${deadPool.join(", ")}`);
    }
    // A row the live register has never heard of is the same failure wearing
    // different clothes: the fallback is offering a fund that does not exist.
    const unknown = f.ids.filter((id) => !known.has(id));
    if (unknown.length) {
      problems.push(
        `${label}: ${unknown.length} fund(s) offered off the snapshot are absent from the ` +
        `live corpus entirely\n        ${unknown.slice(0, 5).join(", ")}`);
    }

    costLines.push(
      `  ${label.padEnd(22)} shown ${String(shown.length).padStart(2)}` +
      `${l ? ` (live ${String(l.ids.slice(0, DISPLAY_CAP).length).padStart(2)})` : ""}` +
      `   pool ${String(f.ids.length).padStart(3)}${l ? ` (live ${String(l.ids.length).padStart(3)})` : ""}` +
      `   withheld ${String(f.withheld ?? 0).padStart(3)}`);
  }

  console.log(`check_degradation: ${archetypes(fallback).length} archetypes, ` +
    `fallback corpus vs the live register, as of ${asOf}`);
  console.log("\nWHAT THE POLICY COSTS");
  for (const l of costLines) console.log(l);
  console.log(`\n  ${withheldTotal} row-withholdings across the set; ` +
    `${shownTotal} rows shown in total; ` +
    `${foundersHarmed} of ${archetypes(fallback).length} archetypes shown a closed fund.`);
  if (!withheldTotal) {
    console.log("  Nothing was withheld: on this corpus the two stores agree, which is\n" +
      "  the state the policy is supposed to sit in. The suppression is a floor\n" +
      "  under a bad night, not a tax on a good one.");
  }

  // ── WHAT THIS CHECK DOES NOT COVER ──────────────────────────────────────
  // Said out loud, in the file, because a guard that overstates its scope is
  // worse than one that has none: people stop looking.
  //
  // Everything above runs against the COMMITTED snapshot, which is republished
  // on every corpus change and is currently byte-current with Postgres. So the
  // assertion is exercised only in the state where it cannot fail. The states
  // where it can are built by scripts/probe_stale_snapshot.ts, and measured
  // 2026-08-07 they say this:
  //
  //   copy                              offered  withheld  DEAD OFFERED
  //   current                               809         5             0
  //   stale (no call deadlines loaded)      812         0            84
  //   no-basis (the 2026-08-06 artifact)    230       381             0
  //
  // The middle row is the case the policy was BUILT for, and the policy does
  // nothing in it — under the old membership rule as well as the current
  // proportion rule, identically. `populationRecordsDeadlines` infers "this
  // register publishes deadlines" from deadlines present in the copy, so a
  // copy stale enough to be dangerous has none and the rule goes quiet exactly
  // when it is needed. The only clause that ever caught anything is
  // `basis_not_supplied`, which is a test of the copy's SCHEMA, not its
  // currency, and it withholds 381 of 814 rows to do it.
  //
  // The defence against a deeply stale copy is therefore check_corpus_currency
  // and check_corpus_census, not this. What the durable fix looks like is in
  // project-mgmt/findings/degradation_precision_wsAC.md: the corpus records
  // "no deadline" and "not a deadline-bearing row" in the same NULL, and one
  // column separating them would make this rule survive staleness.
  console.log("\nWHAT THIS CHECK DOES NOT COVER");
  console.log("  It runs against the committed snapshot, which is republished on every");
  console.log("  corpus change. That is the state where the assertion cannot fail. Run");
  console.log("  `npx tsx scripts/probe_stale_snapshot.ts` for the states where it can:");
  console.log("  on a copy predating the call-register loads, the policy withholds");
  console.log("  nothing and 84 closed rows are offerable. That gap is corpus currency's");
  console.log("  to close, not this rule's — see degradation_precision_wsAC.md.");

  if (problems.length) {
    console.error("\ncheck_degradation: FAILED\n");
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error("  A founder acting on any of these loses weeks on a call that has shut.");
    console.error("  The degradation policy (lib/intelligence/liveness.ts, unconfirmedOpen)");
    console.error("  exists to make this impossible: a row whose openness cannot be");
    console.error("  confirmed is withheld, not shown. If this is red, either the policy");
    console.error("  has been weakened or a new way to be open has appeared that it does");
    console.error("  not classify. Do NOT fix it by regenerating the snapshot: currency is");
    console.error("  necessary and is check_corpus_currency's job, and a corpus that");
    console.error("  happens to be fresh today is not a policy.");
    process.exit(1);
  }
  console.log("\ncheck_degradation: ok — every fund offered off the fallback corpus is one " +
    "the live register still calls open.");
}

main().catch((err) => {
  console.error("check_degradation: FAILED to run —", err);
  process.exit(1);
});
