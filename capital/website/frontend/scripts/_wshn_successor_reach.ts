/**
 * READ ONLY. What do the 15 missed successor redirects actually reach?
 *
 * wsHF measured that `caseLinks` is directional and the shipped forward-only
 * read misses 15 instruments across 14 schemes whose live successor filed the
 * link on the other side. wsHN wrote them. This is the question that has to be
 * answered BEFORE and AFTER that write, because a redirect is not a cosmetic
 * field: `publishabilityFailures` lets a SHUT row through when it carries a
 * successor the corpus does not already hold as an open leaf, and
 * `publishableInstruments` then republishes it under the successor's identity.
 * So filling in a successor can REVIVE a row into the offerable corpus.
 *
 * Three counts, all deterministic, none of them a model call:
 *
 *   1. how many instruments are publishable at all
 *   2. which of the 15 are revived — i.e. shut, and their successor is NOT
 *      already held as an open leaf, which is the only branch that changes
 *      what a founder can be shown
 *   3. how many founders of the FUNNEL'S OWN population (holdout, described,
 *      one per company — the same three restrictions `measure_funnel` applies)
 *      won one of the 15. This is the ceiling on any funnel movement, and if
 *      it is zero the funnel cannot move and no two-hour run is needed to say
 *      so.
 *
 *   cd website/frontend && npx tsx scripts/_wshn_successor_reach.ts
 *
 * Named by project-mgmt/findings/reach_wsHN.md.
 */
import { Client } from "pg";

import { hydrateDbInstruments, loadDbInstruments, publishableInstruments,
         publishabilityContext, publishabilityFailures,
         requireLiveCorpus } from "../lib/intelligence/corpus";
import { isShut } from "../lib/intelligence/liveness";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { isDescribed, loadRecallSet, type RecallRow } from "./recallSet";

loadEnvLocal();
// No writer, no ranker, no judge is called from here. Removing the key makes
// that a property of the process rather than a claim in a comment.
delete process.env.ANTHROPIC_API_KEY;
// It opens its own pg Client on DATABASE_URL below, and `requireLiveCorpus`
// inside main() cannot save it: with no key, hydration records
// source=snapshot, degraded=false, and that guard passes.
requireCredentials("wshn_successor_reach", ["DATABASE_URL"]);

async function main(): Promise<void> {
  await hydrateDbInstruments();
  requireLiveCorpus("wshn successor reach");

  const all = loadDbInstruments();
  const ctx = publishabilityContext(all);
  const pub = publishableInstruments();

  // The affected set is read from the STORE, never listed here: it is "closed
  // scheme, successor named", and a hardcoded list would stop being that set
  // the moment the register moves.
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows: withSucc } = await client.query<{
    id: string; scheme_code: string;
    successor_scheme: string; successor_title: string }>(
    `SELECT id, scheme_code, successor_scheme, successor_title
       FROM funding_instruments
      WHERE successor_scheme IS NOT NULL AND TRIM(successor_scheme) <> ''`);
  await client.end();

  console.log(`corpus: ${all.length} instruments, ${pub.length} publishable`);
  console.log(`rows carrying a successor in postgres: ${withSucc.length}`);

  const byId = new Map(all.map((i) => [i.id, i]));
  let revived = 0, alreadyHeld = 0, notShut = 0, stillFails = 0;
  const revivedIds: string[] = [];
  for (const r of withSucc) {
    const inst = byId.get(r.id);
    if (!inst) continue;
    if (!isShut(inst, ctx.asOf)) { notShut += 1; continue; }
    if (ctx.liveCodes.has(r.successor_scheme)) { alreadyHeld += 1; continue; }
    // Shut, and the successor is not already an open leaf, so the closure
    // clause is waived — but the row still has to clear every OTHER
    // publishability clause before a founder can be shown it.
    if (publishabilityFailures(inst, ctx).length === 0) {
      revived += 1; revivedIds.push(r.id);
    } else { stillFails += 1; }
  }
  console.log(`  not shut (nothing to redirect from)        ${notShut}`);
  console.log(`  successor already held as an open leaf     ${alreadyHeld}`);
  console.log(`  waived, but fails another clause           ${stillFails}`);
  console.log(`  REVIVED into the publishable corpus        ${revived}`);
  for (const id of revivedIds) console.log(`      ${id}`);

  // ── Who could possibly be moved ─────────────────────────────────────────
  const { rows } = loadRecallSet("wshn successor reach");
  const seen = new Set<string>();
  const population = (rows as RecallRow[])
    .filter((r) => r.split === "holdout" && isDescribed(r))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));

  const succIds = new Set(withSucc.map((r) => r.id));
  const revivedSet = new Set(revivedIds);
  const wonSucc = population.filter((r) => succIds.has(r.instrument));
  const wonRevived = population.filter((r) => revivedSet.has(r.instrument));
  console.log(`\n${population.length} founders in the funnel's population`);
  console.log(`  won a fund carrying ANY successor          ${wonSucc.length}`);
  console.log(`  won a fund the redirect REVIVES            ${wonRevived.length}`);
  if (wonRevived.length === 0) {
    console.log(`\n  Nobody in this population won one of the revived rows, so the`);
    console.log(`  funnel's own stages CANNOT move on this change. It is a`);
    console.log(`  correctness fix to what a founder is told about a closed`);
    console.log(`  scheme, not a recall fix, and no run of measure_funnel would`);
    console.log(`  report otherwise.`);
  }
}

void main();
