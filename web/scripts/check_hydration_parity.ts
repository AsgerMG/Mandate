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
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The env preamble this file was missing entirely until 2026-08-07, now from
// the one shared loader -- plus the DECLARED contract, which is the half that
// actually closes the hole. This check read DATABASE_URL, found none, printed
// "skipped -- nothing to compare against" and returned 0 on machines that had
// the credentials all along. Wired into `npm run check` it went green having
// done nothing, which is the defect it exists to catch, in itself.
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
const CREDENTIALS = requireCredentials("check_hydration_parity", ["DATABASE_URL", "VOYAGE_KEY"]);

import { DISPLAY_CAP } from "../lib/intelligence/shortlist";
// Needs both stores, so it cannot run in CI. It publishes what it decided;
// check_verdicts.ts asserts on that with no credentials.
import { publishVerdict, startTape } from "./guardVerdict";

const GUARD = "hydration_parity";
const tape = startTape();

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

async function main() {
  // NO_PG=1 is this repo's "there is no database", and every other script that
  // can reach Postgres honours it by deleting DATABASE_URL. This one compares
  // the two stores against each other, so without a database there is nothing
  // to compare -- the same state as the skip below, reached deliberately rather
  // than by accident. Honouring it is not a weakening: run with credentials and
  // without NO_PG, which is how CI and `npm run check` run it, the check is
  // unchanged and at full strength.
  // The only skip left is the DECLARED one. "No DATABASE_URL" used to be a
  // second, identical-looking exit from this same point, and it was the one
  // nobody chose; it now ends the process at the top of the file instead.
  if (CREDENTIALS === "offline") {
    console.log("check_hydration_parity: skipped — NO_PG=1, so there is no live " +
      "register to compare the snapshot against");
    return;
  }

  const json = run({ NO_PG: "1" });
  const pg = run({ NO_PG: "" });
  const problems: string[] = [];
  // Counted across archetypes, because the DIRECTION is the diagnosis. Checks
  // present only in the live register and absent from the fallback are one
  // thing -- a snapshot whose gate layer was exported before the last encoding
  // run -- and the reverse is another. Reported once at the end rather than
  // guessed at per archetype.
  let screenOnlyLive = 0, screenOnlyFallback = 0;
  // Every difference this check can record, split into the ones that are about
  // WHICH FUNDS the two stores hold and the ones that are about the ORDER they
  // put the same funds in. Counted rather than inspected afterwards, because
  // the diagnosis below turns on the distinction and reading it back out of
  // formatted strings is how a guard comes to misattribute its own failure.
  let orderOnlyDiffs = 0, corpusDiffs = 0;

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
    corpusDiffs++;
    problems.push(
      `the fallback corpus would offer ${inventedByFallback.length} fund(s) the live ` +
      `register withholds. That is the harm this whole policy exists to stop.\n` +
      `      ${inventedByFallback.slice(0, 8).join(", ")}`);
  }
  const lostUnaccounted = pc.publishable
    .filter((id) => !jsonOfferable.has(id) && !suppressed.has(id));
  if (lostUnaccounted.length) {
    corpusDiffs++;
    problems.push(
      `${lostUnaccounted.length} fund(s) are offerable on Postgres, absent from the ` +
      `fallback, and NOT among the ${suppressed.size} the degradation policy withheld.\n` +
      `      A row that disappears for an unrecorded reason is the hydration bug\n` +
      `      this check exists for -- a dropped column, a stale export, a half-applied\n` +
      `      reload. Regenerating the snapshot is the usual fix; confirm it is.\n` +
      `      ${lostUnaccounted.slice(0, 8).join(", ")}`);
  }
  // ── The live arm, re-ranked under the fallback's own handicap ─────────────
  // Two separate claims are being tested and they must not be allowed to
  // contaminate each other:
  //
  //   1. the two stores hold the same corpus, up to the policy   (above)
  //   2. given the same corpus, the two paths rank it the same   (below)
  //
  // Claim 2 is only meaningful on the rows both stores actually have. When
  // claim 1 fails, the missing rows shift every pool that contained one and
  // every screen built from that pool -- measured, 11 absent rows produced 12
  // further "differences", all of them the same bug wearing a different hat.
  // A guard that reports one fault thirteen times is a guard people stop
  // reading, which is precisely the ambiguity this file exists to remove.
  //
  // So the live arm is handicapped with BOTH groups: the rows the policy
  // withheld on purpose, and the rows the fallback is missing for a reason
  // nobody accounted for. The second group is already a hard failure recorded
  // above and the run will exit non-zero on it regardless -- including it here
  // hides nothing, it just makes what follows a statement about RANKING.
  const handicap = [...jc.suppressed, ...lostUnaccounted];
  // Nothing to handicap means the two stores agree outright and `pg` already
  // IS the comparison run, so the third process is not spawned. That is the
  // steady state, and it costs nothing here.
  let ranked = pg;
  if (handicap.length) {
    console.log(`  degradation policy withheld ${suppressed.size} row(s) from the fallback ` +
      `corpus; ${pc.publishable.length} offerable on Postgres, ${jc.publishable.length} on the snapshot`);
    if (lostUnaccounted.length) {
      console.log(`  the ranking comparison below additionally holds back the ` +
        `${lostUnaccounted.length} unaccounted row(s), so it reports ranking faults only. ` +
        `The unaccounted rows themselves have already failed this check, above.`);
    }
    const idsFile = join(mkdtempSync(join(tmpdir(), "parity-")), "suppressed.json");
    writeFileSync(idsFile, JSON.stringify(handicap));
    ranked = run({ NO_PG: "", SUPPRESS_IDS_FILE: idsFile });
    const rc = ranked.__corpus;
    // If the handicapped arm fell back too, it is the snapshot compared with
    // itself and every assertion below is vacuous.
    if (rc?.provenance.source !== "postgres") {
      console.error(`check_hydration_parity: the re-ranked Postgres arm hydrated from ` +
        `${rc?.provenance.source ?? "nothing"}; refusing to pass.`);
      process.exit(1);
    }
    // The override must have TAKEN, or the comparison below is against some
    // other corpus than the one we think.
    //
    // The property is "none of the handed ids is offerable here", not "the arm
    // withheld exactly as many rows as it was handed". Those look the same and
    // are not: `suppressedForUnconfirmedLiveness` reports the rows the LIVENESS
    // RULE withheld, and a handed id that the live register does not offer
    // anyway -- closed, unpublishable, absent -- is never withheld, because
    // there was nothing to withhold. Withholding it is a no-op and the ranking
    // is still exactly the question the fallback was asked.
    //
    // Asserted as equality, this fired the moment the two stores were brought
    // into step: 19 of 34 handed ids had stopped being offerable on Postgres,
    // the arm reported 15, and the check called a correct run broken. That is a
    // guard failing for a reason its own subject cannot fix, which is how a
    // guard gets muted -- and it is strictly WEAKER than what is asserted here,
    // because a count can match while the wrong rows are held.
    const rankedOfferable = new Set(rc.publishable);
    const notHeld = handicap.filter((id) => rankedOfferable.has(id));
    if (notHeld.length) {
      corpusDiffs++;
      problems.push(
        `the re-ranked live arm still offers ${notHeld.length} of the ${handicap.length} ` +
        `row(s) it was handed. The suppression override did not take, so the ranking ` +
        `below is not the comparison it claims to be.\n` +
        `      ${notHeld.slice(0, 8).join(", ")}`);
    }
  }

  for (const label of archetypes(json)) {
    const a = json[label], b = ranked[label];
    if (!b) {
      corpusDiffs++;
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
    // Pool membership, against that same re-ranked live run. Losing a row to
    // the policy is expected; losing one to anything else is not, and a row the
    // fallback ADDS must still be one the live register would itself have
    // offered -- the leaf cap may promote, it may never conjure a fund.
    //
    // Computed BEFORE the published-row comparison because that comparison's
    // diagnosis turns on it: a top-N that differs out of two pools holding the
    // same funds is a statement about SCORING, and a top-N that differs because
    // one pool is missing a fund is a statement about HYDRATION. Reading the
    // first as the second sends the next reader to regenerate a snapshot that
    // was never wrong.
    const held = new Set(handicap);
    const lostFromPool = b.ids.filter((i) => !a.ids.includes(i) && !held.has(i));
    const gainedInPool = a.ids.filter((i) => !b.ids.includes(i) && !pgOfferable.has(i));
    const shown = (x: string[]) => x.slice(0, DISPLAY_CAP).join("|");
    if (shown(a.ids) !== shown(b.ids)) {
      const samePool = !lostFromPool.length && !gainedInPool.length;
      if (samePool) orderOnlyDiffs++; else corpusDiffs++;
      problems.push(
        `${label}: the published rows differ from the live corpus re-ranked without the ` +
        `withheld rows` +
        (samePool ? ` — out of pools holding the SAME ${a.ids.length} funds` : "") +
        `\n      fallback: ${shown(a.ids)}\n      live:     ${shown(b.ids)}`);
    }
    if (lostFromPool.length) {
      corpusDiffs++;
      problems.push(
        `${label}: ${lostFromPool.length} fund(s) left the pool for a reason that is not the ` +
        `degradation policy\n      ${lostFromPool.slice(0, 8).join(", ")}`);
    }
    if (gainedInPool.length) {
      corpusDiffs++;
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
        corpusDiffs++;
        problems.push(`${label} / ${ra.id}: gatesChecked ${ra.gatesChecked} vs ${rb.gatesChecked}`);
      }
      // SAY WHICH, and never guess. Both of these messages used to name one
      // cause -- "(gate order)" and "(framework citations?)" -- for any
      // difference at all, and both guesses were wrong the first time they
      // fired in anger. WS-AW recorded this file as "disagrees on a
      // bdns_es_ayudas gate order"; the two stores were not ordering the same
      // criteria differently, Postgres published NONE and the snapshot
      // published two. A guard that misattributes its own failure costs the
      // next reader the time it was built to save.
      if (ra.criteria.join("|") !== rb.criteria.join("|")) {
        const sameSet = ra.criteria.length === rb.criteria.length &&
          [...ra.criteria].sort().join("|") === [...rb.criteria].sort().join("|");
        corpusDiffs++;
        problems.push(
          `${label} / ${ra.id}: published criteria differ — ` +
          (sameSet
            ? `same ${ra.criteria.length} criteria in a different ORDER`
            : `fallback publishes ${ra.criteria.length}, live publishes ${rb.criteria.length}`));
      }
    }
    if (JSON.stringify(a.screen) !== JSON.stringify(b.screen)) {
      const key = (s: { check: string; verified: boolean | null; sourced: boolean }) =>
        `${s.check}|${s.verified}|${s.sourced}`;
      const A = a.screen.map(key), B = b.screen.map(key);
      const onlyFallback = A.filter((x) => !B.includes(x));
      const onlyLive = B.filter((x) => !A.includes(x));
      corpusDiffs++;
      problems.push(
        `${label}: eligibility screen differs — ` +
        (onlyFallback.length === 0 && onlyLive.length === 0
          ? `same ${A.length} checks in a different ORDER`
          : `${onlyFallback.length} check(s) only in the fallback, ` +
            `${onlyLive.length} only in the live register`) +
        (onlyLive.length
          ? `\n      live-only e.g. ${onlyLive[0].slice(0, 90)}`
          : "") +
        (onlyFallback.length
          ? `\n      fallback-only e.g. ${onlyFallback[0].slice(0, 90)}`
          : ""));
      screenOnlyLive += onlyLive.length;
      screenOnlyFallback += onlyFallback.length;
    }
  }

  if (problems.length) {
    console.error(`check_hydration_parity: ${problems.length} difference(s) between the Postgres and JSON paths.`);
    for (const p of problems.slice(0, 12)) console.error(`  ${p}`);
    // ── The one-line diagnosis, so the next reader does not have to derive it ─
    // A screen difference that is almost entirely one-directional is not a
    // ranking or hydration defect at all: it is an export that has not been
    // run. `check_corpus_currency` passes in that state, because it compares
    // INSTRUMENTS and liveness verdicts and does not compare the gate layer --
    // so the snapshot can be certified current while telling a founder a
    // different set of things they must satisfy. Say so here, where the failure
    // actually surfaces.
    if (screenOnlyLive > 4 * Math.max(1, screenOnlyFallback)) {
      console.error(
        `\n  DIAGNOSIS: the live register carries ${screenOnlyLive} eligibility check(s) ` +
        `the\n  committed snapshot does not, against ${screenOnlyFallback} the other way. ` +
        `That is a\n  STALE GATE EXPORT, not a hydration defect: gates were encoded into ` +
        `Postgres and\n  public/data/instrument_terms.json was not rebuilt from it. Re-export ` +
        `the gate\n  layer (\`make eligibility\`), then run this again.\n` +
        `\n  It is NOT caught by check_corpus_currency, which asserts the two stores ` +
        `agree on\n  every instrument and every liveness verdict and says nothing about ` +
        `gates.`);
    } else if (screenOnlyFallback > 4 * Math.max(1, screenOnlyLive)) {
      console.error(
        `\n  DIAGNOSIS: the committed snapshot carries ${screenOnlyFallback} check(s) the ` +
        `live\n  register does not. Gates were REMOVED from Postgres (a quarantine, a ` +
        `reload)\n  without the snapshot following. The snapshot is the one shipping to ` +
        `founders on\n  a degraded request, so this direction is the more urgent of the two.`);
    }
    // ── The second diagnosis: same funds, different order ────────────────────
    // The condition is not a guess about what changed. This check compares four
    // things a row carries -- pool membership, gatesChecked, published criteria,
    // and the eligibility screen -- and every one of them agreeing while the
    // PUBLISHED ORDER differs leaves exactly one input unaccounted for, because
    // it is the one input the two stores do not share and this check cannot
    // compare: the semantic score. The fallback ranks on the committed
    // `semanticCache.generated.json`; the live arm ranks on pgvector over
    // `instrument_profiles`. When that mirror is cut from a different state of
    // the table, the two arms are ranking the same funds on different numbers.
    //
    // The scores are PERCENTILE ranks over the whole corpus, so a rebuild that
    // rewrote any profile moves the score of every fund -- including funds whose
    // own text never changed. That is why the symptom is a handful of archetypes
    // rather than a whole country, and why it looks like a ranking regression.
    //
    // Measured on 2026-08-12: 3 archetypes -- one German, two Swedish -- differed
    // on published rows only, out of pools holding the same funds, and 513 of the
    // 1,088 live profiles had been rewritten since the mirror was cut.
    if (orderOnlyDiffs && !corpusDiffs) {
      console.error(
        `\n  DIAGNOSIS: ${orderOnlyDiffs} archetype(s) differ on the PUBLISHED ORDER alone. ` +
        `Both\n  stores hold the same funds in the pool, evaluate the same gates, publish the\n` +
        `  same criteria and build the same eligibility screen. The only ranking input\n` +
        `  they do not share is the SEMANTIC SCORE, so that is where the difference is:\n` +
        `  the fallback ranks on lib/intelligence/semanticCache.generated.json and the\n` +
        `  live arm on pgvector over instrument_profiles.\n` +
        `\n  This is a STALE OFFLINE MIRROR, not a hydration defect and not a ranking\n` +
        `  regression. Do not chase it in shortlist.ts. Re-cut both mirrors of the\n` +
        `  index and run this again:\n` +
        `    DATABASE_URL=... python3 ETL/terms/emit_profile_leak_index.py\n` +
        `    cd web && npx tsx scripts/emit_semantic_cache.ts\n` +
        `\n  check_corpus_currency names the same cause one step earlier, by comparing\n` +
        `  the mirror's profile TEXT against the live index rather than its id set.`);
    }
    await publishVerdict(GUARD, {
      status: "failed",
      // The summary is the ONE line check_verdicts.ts shows a reader with no
      // credentials, and "3 difference(s) over 12 archetypes" told that reader
      // nothing they could act on. It now carries the diagnosis when there is
      // one, so the cause travels through the channel rather than staying in
      // the terminal of whoever happened to run it.
      summary: `${problems.length} difference(s) between the Postgres and JSON paths ` +
               `over ${archetypes(json).length} archetypes` +
               (orderOnlyDiffs && !corpusDiffs
                 ? `; published ORDER only, same pools — the committed semantic mirror `
                   + `is cut from a different state of instrument_profiles`
                 : ""),
      metrics: { problems: problems.length, archetypes: archetypes(json).length,
                 suppressed: suppressed.size,
                 orderOnlyDiffs, corpusDiffs },
      detail: tape(),
    });
    process.exit(1);
  }
  console.log(`check_hydration_parity: ok — ${archetypes(json).length} archetypes agree on both ` +
    `paths, and the two corpora differ by exactly the ${suppressed.size} row(s) the ` +
    `degradation policy withheld`);
  await publishVerdict(GUARD, {
    status: "ok",
    summary: `${archetypes(json).length} archetypes agree on both paths; the two corpora ` +
             `differ by exactly the ${suppressed.size} row(s) the degradation policy withheld`,
    metrics: { problems: 0, archetypes: archetypes(json).length, suppressed: suppressed.size },
    detail: tape(),
  });
}

main().catch(async (err) => {
  console.error("check_hydration_parity: FAILED to run —", err);
  await publishVerdict(GUARD, {
    status: "error", summary: `the guard could not complete: ${err}`, detail: tape(),
  });
  process.exit(1);
});
