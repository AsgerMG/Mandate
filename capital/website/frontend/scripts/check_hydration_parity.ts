// Does the Postgres path answer the same as the JSON path?
//
// ── Why this is the only proof that matters ────────────────────────────────
// Every other check runs NO_PG=1, so the whole suite is green regardless of
// what phase-one hydration does — it exercises the JSON fallback exclusively.
// Phase one now ships no gates except framework ones, and gates arrive per
// shortlist; if that goes wrong the failure is silent, because a fund with no
// gates evaluates nothing and assessInstrument returns `unknown` rather than
// throwing.
//
// So: run the same 12 archetypes down both paths and diff the answers. Two
// child processes, because dbInstrumentsCache is module-level and once one
// corpus is loaded the other path is unreachable in that process.
//
// It has already earned its place three times. It caught (1) framework gates
// shipped without their citation, so every framework check rendered
// sourceless; (2) Postgres ordering gate_key by locale collation while the
// export sorts by byte, so the two stores disagreed about which three criteria
// a row publishes; (3) no ORDER BY on the instruments query at all, so
// equal-ranked siblings resolved differently and a different Dutch scheme
// reached the founder depending on which store answered.
//
// ── The degradation policy changed what "the same" means here ─────────────
// The two paths are now DELIBERATELY allowed to answer differently, in exactly
// one direction: a fallback request withholds any row whose openness it cannot
// confirm (lib/intelligence/liveness.ts). Asserting bare equality after that
// would fail every run and teach people to ignore this file, which is the
// death of a guard.
//
// So the assertion is restated rather than relaxed, and it is STRONGER at the
// corpus level than what it replaced:
//
//   the set of funds the fallback may offer must differ from the live one by
//   EXACTLY the rows the policy withheld, and by nothing else
//
// A dropped field, a stale value, a gate layer that failed to hydrate, a row
// the exporter lost -- all of them still show up, now as an UNACCOUNTED
// difference rather than as one line in a list of expected ones.
//
// ── And the ranking is compared under the same handicap, not after it ──────
// The first draft subtracted the withheld ids from the live ranking and
// compared that. It was wrong, and wrong in the direction that gets a guard
// deleted: withholding a row FREES A SLOT under the per-channel leaf cap, so
// the fund behind it is promoted into the table -- and that fund was never in
// the live pool, so no amount of subtracting can produce it. The check
// reported three archetypes as broken when the policy was working exactly as
// designed.
//
// So the live arm is re-run with those same ids out of CONSIDERATION
// (SUPPRESS_IDS_FILE -> __forceSuppressedForParity), which is the question the
// fallback was actually asked. Equality is then the honest expectation and it
// is asserted exactly, promotions included -- a stronger claim than the
// subtraction it replaces. The third run is skipped entirely when nothing was
// withheld, which is the steady state both stores should normally be in.
//
// Run after `make eligibility`, when SQLite and Postgres are in step.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The same `.env.local` preamble every other harness carries, and its absence
// here was not cosmetic: this check reads DATABASE_URL, found none, and printed
// "skipped — nothing to compare against" on machines that had the credentials
// all along. Wired into `npm run check` it would have gone green having done
// nothing, which is the defect it exists to catch, in the check itself.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }

import { DISPLAY_CAP } from "../lib/intelligence/shortlist";

interface Archetype {
  ids: string[];
  rows: { id: string; gatesChecked: number | null; criteria: string[]; structuring: string[] }[];
  screen: { check: string; verified: boolean | null; sourced: boolean }[];
  withheld: number;
}
interface CorpusInfo {
  provenance: { source: string; degraded: boolean; observedAt: string; error?: string };
  suppressed: string[];
  publishable: string[];
}
type Dump = Record<string, Archetype> & { __corpus?: CorpusInfo };
/** Archetype keys only. `__corpus` is the run's own provenance, not a founder. */
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

function main() {
  if (!process.env.DATABASE_URL) {
    console.log("check_hydration_parity: skipped — no DATABASE_URL, nothing to compare against");
    return;
  }

  const json = run({ NO_PG: "1" });
  const pg = run({ NO_PG: "" });
  const problems: string[] = [];

  // ── Corpus level: the two stores may differ by the policy and nothing else ─
  const jc = json.__corpus, pc = pg.__corpus;
  if (!jc || !pc) {
    console.error("check_hydration_parity: a run did not report its corpus; " +
      "dump_verdicts.ts must emit __corpus.");
    process.exit(1);
  }
  if (pc.provenance.source !== "postgres") {
    // The arm that is supposed to be the live one fell back too, so both sides
    // are the snapshot and this check would compare it with itself and pass.
    console.error(`check_hydration_parity: the Postgres arm hydrated from ` +
      `${pc.provenance.source} (${pc.provenance.error ?? "no error recorded"}). ` +
      `There is nothing to compare against; refusing to pass.`);
    process.exit(1);
  }
  const pgOfferable = new Set(pc.publishable);
  const jsonOfferable = new Set(jc.publishable);
  const suppressed = new Set(jc.suppressed);
  const inventedByFallback = jc.publishable.filter((id) => !pgOfferable.has(id));
  if (inventedByFallback.length) {
    problems.push(
      `the fallback corpus would offer ${inventedByFallback.length} fund(s) the live ` +
      `register withholds. That is the harm this whole policy exists to stop.\n` +
      `      ${inventedByFallback.slice(0, 8).join(", ")}`);
  }
  const lostUnaccounted = pc.publishable
    .filter((id) => !jsonOfferable.has(id) && !suppressed.has(id));
  if (lostUnaccounted.length) {
    problems.push(
      `${lostUnaccounted.length} fund(s) are offerable on Postgres, absent from the ` +
      `fallback, and NOT among the ${suppressed.size} the degradation policy withheld.\n` +
      `      A row that disappears for an unrecorded reason is the hydration bug\n` +
      `      this check exists for -- a dropped column, a stale export, a half-applied\n` +
      `      reload. Regenerating the snapshot is the usual fix; confirm it is.\n` +
      `      ${lostUnaccounted.slice(0, 8).join(", ")}`);
  }
  // ── The live arm, re-ranked under the fallback's own handicap ─────────────
  // Nothing withheld means the two stores agree and `pg` already IS the
  // handicapped run, so the third process is not spawned. That is the steady
  // state, and it costs nothing here.
  let ranked = pg;
  if (suppressed.size) {
    console.log(`  degradation policy withheld ${suppressed.size} row(s) from the fallback ` +
      `corpus; ${pc.publishable.length} offerable on Postgres, ${jc.publishable.length} on the snapshot`);
    const idsFile = join(mkdtempSync(join(tmpdir(), "parity-")), "suppressed.json");
    writeFileSync(idsFile, JSON.stringify(jc.suppressed));
    ranked = run({ NO_PG: "", SUPPRESS_IDS_FILE: idsFile });
    const rc = ranked.__corpus;
    // If the handicapped arm fell back too, it is the snapshot compared with
    // itself and every assertion below is vacuous.
    if (rc?.provenance.source !== "postgres") {
      console.error(`check_hydration_parity: the re-ranked Postgres arm hydrated from ` +
        `${rc?.provenance.source ?? "nothing"}; refusing to pass.`);
      process.exit(1);
    }
    // It must have withheld exactly what it was handed, or the comparison
    // below is against some other corpus than the one we think.
    const withheldByRanked = new Set(rc.suppressed);
    if (withheldByRanked.size !== suppressed.size ||
        [...suppressed].some((id) => !withheldByRanked.has(id))) {
      problems.push(
        `the re-ranked live arm withheld ${withheldByRanked.size} row(s), not the ` +
        `${suppressed.size} it was given. The suppression override did not take, so the ` +
        `ranking below is not the comparison it claims to be.`);
    }
  }

  for (const label of archetypes(json)) {
    const a = json[label], b = ranked[label];
    if (!b) {
      problems.push(`${label}: missing from the Postgres run`);
      continue;
    }
    // Order is asserted for the rows a founder SEES; beyond that, membership.
    //
    // Ranking now blends semantic scores, and the two stores answer from
    // slightly different floats (cached vs live pgvector). Ties past the
    // display cap can therefore swap without anything user-visible changing,
    // and a guard that fails on that trains people to ignore it. What must
    // never differ is the published rows and which funds were considered at
    // all -- both of which this still checks exactly.
    //
    // The published rows are compared against the live corpus RE-RANKED with
    // the withheld ids out of consideration -- the same question the fallback
    // was asked, so equality is exact and includes the rows promoted into the
    // freed slots. Order is still asserted exactly: that is what caught the
    // gate_key collation bug and the missing ORDER BY, and neither of those has
    // become less possible.
    const shown = (x: string[]) => x.slice(0, DISPLAY_CAP).join("|");
    if (shown(a.ids) !== shown(b.ids)) {
      problems.push(
        `${label}: the published rows differ from the live corpus re-ranked without the ` +
        `withheld rows\n      fallback: ${shown(a.ids)}\n      live:     ${shown(b.ids)}`);
    }
    // Pool membership, against that same re-ranked live run. Losing a row to
    // the policy is expected; losing one to anything else is not, and a row the
    // fallback ADDS must still be one the live register would itself have
    // offered -- the leaf cap may promote, it may never conjure a fund.
    const lostFromPool = b.ids.filter((i) => !a.ids.includes(i) && !suppressed.has(i));
    const gainedInPool = a.ids.filter((i) => !b.ids.includes(i) && !pgOfferable.has(i));
    if (lostFromPool.length) {
      problems.push(
        `${label}: ${lostFromPool.length} fund(s) left the pool for a reason that is not the ` +
        `degradation policy\n      ${lostFromPool.slice(0, 8).join(", ")}`);
    }
    if (gainedInPool.length) {
      problems.push(
        `${label}: ${gainedInPool.length} fund(s) entered the fallback pool that the live ` +
        `register does not offer\n      ${gainedInPool.slice(0, 8).join(", ")}`);
    }
    // gatesChecked is the number that catches the inheritance trap: a child
    // hydrated without its regime evaluates nothing and reads `unknown`.
    for (const ra of a.rows) {
      const rb = b.rows.find((r) => r.id === ra.id);
      if (!rb) continue;
      if (ra.gatesChecked !== rb.gatesChecked) {
        problems.push(`${label} / ${ra.id}: gatesChecked ${ra.gatesChecked} vs ${rb.gatesChecked}`);
      }
      if (ra.criteria.join("|") !== rb.criteria.join("|")) {
        problems.push(`${label} / ${ra.id}: published criteria differ (gate order)`);
      }
    }
    if (JSON.stringify(a.screen) !== JSON.stringify(b.screen)) {
      problems.push(`${label}: eligibility screen differs (framework citations?)`);
    }
  }

  if (problems.length) {
    console.error(`check_hydration_parity: ${problems.length} difference(s) between the Postgres and JSON paths.`);
    for (const p of problems.slice(0, 12)) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`check_hydration_parity: ok — ${archetypes(json).length} archetypes agree on both ` +
    `paths, and the two corpora differ by exactly the ${suppressed.size} row(s) the ` +
    `degradation policy withheld`);
}

main();
