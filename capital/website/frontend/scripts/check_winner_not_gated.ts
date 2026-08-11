/**
 * The ENCODED-GATE screen may not delete a fund from a company that WON it.
 *
 * FREE — no model calls, no network, no credentials. Committed artifacts only.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 * `check_winner_not_blocked.ts` states this property over the TERRITORIAL
 * screen and pins its debt at 15. That screen is not shipped. One stage later,
 * on the path a founder's memo actually takes, `accessiblePool` runs `assessAll`
 * and DROPS every candidate it calls `blocked` — and nothing watched that at
 * all, while it was running at four times the volume:
 *
 *   wsCR, tune n=250: 58 of the 123 founders whose won fund reached the memo
 *   pool had that exact fund deleted by `VER-BLOCKED`. Every single leaf the
 *   pool held and the memo lost was lost this way.
 *
 * 51 of those 58 were one defect, and it was in the comparator rather than in
 * any gate: the corpus encodes "must be established in X" with the country's
 * English NAME and the answer arrived as ISO2, so `["Denmark"]` was FALSE for
 * `["DK"]`. `entityCountries` is structural and those gates are cited, so one
 * false is conclusive. The fund was deleted for founders who are Danish.
 *
 * That defect is fixed (`comparator.ts`, `FIELD_VALUE_DOMAIN`). This check is
 * what makes the NEXT one of its kind arrive loudly instead of quietly.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     No pair (company, instrument) that the award register records as a WIN
 *     may be judged `blocked` by the encoded gate layer on the strength of
 *     facts the register itself states about that company.
 *
 * Stated over any pair, any instrument, any gate. It names no fund, no
 * country, no sector and no body: the population is the whole answer key, the
 * verdict is the product's own `assessInstrument`, and an instrument or a gate
 * encoded tomorrow is judged by the same rule with no edit here.
 *
 * The facts are supplied in the REGISTER'S OWN designation, deliberately and
 * not as a convenience. A comparator that understands only the spelling the
 * encoder happened to use is precisely the defect above, and a guard that
 * translated its inputs into that spelling first would have been green
 * throughout it.
 *
 * ── Two things the derivation must not do ─────────────────────────────────
 * CIRCULARITY. Only facts about the COMPANY are supplied — the country it is
 * established in and the sector it trades in, both attributes of the firm that
 * exist independently of the award under test. Nothing derived from the award
 * itself, and nothing this harness invents. That last exclusion is the point:
 * a replay that hands every founder a made-up ticket band or consortium stance
 * manufactures failures the founder would never have produced, and a guard
 * built on those would ratchet on fiction. `ticketBand`, `consortium`,
 * `useOfFunds`, `activities` and the rest are deliberately UNANSWERED here,
 * and `evaluateSpec` returns null for an unanswered field, which is never a
 * blocker.
 *
 * SILENCE IS NOT A PASS. A pair where no encoded filter could be evaluated at
 * all proves nothing, and is counted separately rather than as a pass. A run
 * in which everything went silent would sail through on `0 blocked`, so the
 * population that COULD be judged is floored as well as the verdict.
 *
 * ── Why this is a RATCHET and not a pass at zero ──────────────────────────
 * It is not zero. Four pairs survive as of today and each is a real encoding
 * defect worth fixing rather than a rule to weaken — a positive requirement
 * written against a catch-all sector bucket, and narrow scheme purposes
 * flattened onto an eleven-value taxonomy. A guard that reds the build on the
 * day it lands gets switched off, and a guard that calls those four acceptable
 * is a lie about four founders. So the debt is pinned at today's measurement
 * and may only fall.
 *
 * ── Hermetic ──────────────────────────────────────────────────────────────
 * The committed corpus snapshot (`public/data/instrument_terms.json`, the same
 * file the site falls back to and `check_comparator_admits` reads) and the
 * active answer key through `recallSet.ts`. No DATABASE_URL, no VOYAGE_KEY, no
 * network. A guard that needs a credential is a guard that skips on CI and on
 * every fresh worktree.
 *
 *   cd website/frontend && npx tsx scripts/check_winner_not_gated.ts
 */
// PINNED OFFLINE, on purpose and not as a formality. This check imports the
// product's own inheritance rule and its own verdict engine rather than
// restating either, and both live in modules that can reach Postgres. Nothing
// here wants the database — the gates under test are the COMMITTED ones, so
// that two people and CI get the same answer — and destroying the credential
// is the way to guarantee that rather than hope for it. `check_env_loader`
// reads this as the declaration it is.
delete process.env.DATABASE_URL;

import { readFileSync } from "fs";
import path from "path";

import { mergeInheritedGates, type DbGate, type DbInstrument } from "../lib/intelligence/corpus";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import { assessInstrument } from "../lib/intelligence/verdict";
import { loadRecallSet, type RecallRow } from "./recallSet";

/** The artifact this check watches, named literally so the tie between the
 *  guard and the file it guards is visible from the source. */
const WATCHES = path.join("public", "data", "instrument_terms.json");

/** ── DEBT, NOT A TARGET ────────────────────────────────────────────────────
 *
 *  207 verified winners of 6,155 judgeable pairs (3.4%) are deleted from their
 *  own fund by the encoded gate layer today, on register-derived facts alone.
 *  262 of the 269 blockers behind them are `sector`: a narrow scheme purpose
 *  ("must be a tourism service provider", "programmes must be aimed at
 *  manufacturing activities") encoded as equality against this product's
 *  eleven-value sector taxonomy, which cannot express it. One family encodes
 *  its requirement against the catch-all `other` bucket as a POSITIVE
 *  condition, which no company can satisfy on purpose. The remaining 6 are
 *  `entityCountries` and are the same shape as the territorial screen's
 *  standing 15: a company seated in one country winning another country's
 *  scheme through an establishment no register we hold records.
 *
 *  ── What this constant was BEFORE the comparator learned about countries ──
 *  3,818 of the same 6,155 — SIXTY-TWO PER CENT — with 7,550 `entityCountries`
 *  blockers. Same answer key, same snapshot, same population, one file pair
 *  different (`comparator.ts` and `FIELD_VALUE_DOMAIN` in types.ts, reverted to
 *  6ef92151 and restored). Every one of those was the corpus encoding a country
 *  by its English name and the answer arriving as an ISO2 code.
 *
 *  That is this check's own red-then-green, and it is the reason the check
 *  exists rather than a footnote to it: nothing in this repo could see a
 *  62% deletion rate, because nothing measured the stage that did the
 *  deleting.
 *
 *  IT MAY FALL, NEVER RISE. Raising this line is not a fix. It is a record
 *  that a founder was newly cut off from a fund they had already won. The
 *  fixes that legitimately lower it are a corrected gate encoding
 *  (`ETL/terms/encode_gates.py`), a corrected attribution in the answer key, or
 *  a comparator that compares the things a field names rather than its
 *  spellings. None of them is an edit to this constant alone.
 *
 *  Measured 2026-08-09 over `__recallSetDoors.json`. */
const BLOCKED_CEILING = 207;

/** ── The anti-vacuity pin ──────────────────────────────────────────────────
 *
 *  `blocked` goes to zero two ways: by fixing the encoding, or by emptying an
 *  input. Deleting `valueSpec`s from the snapshot, pointing the check at a
 *  smaller answer key, or breaking the join all produce a serene `0 blocked`.
 *
 *  So the population that could actually be JUDGED is floored too — pairs
 *  where at least one encoded filter was evaluable against a register-derived
 *  fact. Set just under today's 6,155. Lowering it to make a run pass is the
 *  one edit that defeats this check entirely. */
const MIN_TESTED = 6000;

interface Snapshot {
  generatedAt?: string;
  records?: (Omit<DbInstrument, "gates"> & { gates?: DbGate[] })[];
}

/**
 * The answers the register itself states about this company — and nothing else.
 *
 * Two fields, because two is what the award register knows about a firm
 * independently of the award being tested. Everything a replay would otherwise
 * invent is left `undefined` on purpose; see CIRCULARITY above.
 */
function registerDerivedAnswers(r: RecallRow): EligibilityAnswers {
  const a: Record<string, unknown> = { entityCountries: [r.country] };
  if (r.sector) a.sector = r.sector;
  return a as EligibilityAnswers;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");

function main() {
  const file = path.join(process.cwd(), WATCHES);
  let snap: Snapshot;
  try {
    snap = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  } catch (e) {
    // Not a fallback. An unreadable input means the check proved nothing, and
    // "proved nothing" must never share a colour with "passed".
    console.error(`\nFAIL — could not read ${WATCHES}: `
      + `${e instanceof Error ? e.message : String(e)}.\n`
      + `  This check has asserted nothing about whether the gate screen\n`
      + `  deletes a fund from a company that won it.`);
    process.exit(1);
  }

  // The product's own inheritance rule, imported rather than restated: a
  // child's gates override its regime's by key and add to the rest, and a
  // child with none of its own inherits all of them. A guard that judged only
  // a leaf's own gates would miss every regime-level rule the founder is
  // actually screened by.
  const records = snap.records ?? [];
  const byId = new Map(records.map((i) => [i.id, i]));
  const gatesFor = (id: string): DbGate[] => {
    const own = byId.get(id);
    if (!own) return [];
    const parent = own.parentId ? byId.get(own.parentId) : undefined;
    return mergeInheritedGates(own.gates ?? [], parent?.gates);
  };
  const withSpec = records.reduce(
    (n, i) => n + (i.gates ?? []).filter((g) => g.valueSpec).length, 0);

  const { file: setFile, rows } = loadRecallSet("check_winner_not_gated");
  console.log(`watching ${WATCHES} — ${records.length} instruments, `
    + `${withSpec} gates carrying a machine-readable spec, cut at `
    + `${snap.generatedAt ?? "(unknown)"}`);

  let tested = 0, blocked = 0, silent = 0, absent = 0;
  const byField = new Map<string, number>();
  const names: string[] = [];
  for (const r of rows) {
    const inst = byId.get(r.instrument);
    if (!inst) { absent++; continue; }
    const assessment = assessInstrument(
      { ...inst, gates: gatesFor(r.instrument) } as DbInstrument,
      registerDerivedAnswers(r),
    );
    // Nothing evaluable is not a pass. It is a pair this check could not judge.
    if (assessment.checked === 0) { silent++; continue; }
    tested += 1;
    if (assessment.status !== "blocked") continue;
    blocked += 1;
    for (const b of assessment.blockers) byField.set(b.field, (byField.get(b.field) ?? 0) + 1);
    // NAMED, because a rate hides which ones. Every line is a founder the gate
    // screen would delete a programme from that they demonstrably won.
    names.push(`${r.name} (${r.country}) -> ${r.instrument}  `
      + `[${assessment.blockers.map((b) => b.field).join(", ")}]`);
  }

  console.log(`answer key ${setFile}: ${rows.length.toLocaleString()} pairs`);
  console.log(`  names an instrument the snapshot does not hold  ${absent}`);
  console.log(`  no encoded filter evaluable, cannot be judged   ${silent}`);
  console.log(`  testable: at least one filter evaluated         ${tested} `
    + `(floor ${MIN_TESTED})`);
  console.log(`  VERIFIED WINNERS THE GATE SCREEN WOULD DELETE   ${blocked} `
    + `${pct(blocked, tested)} (ceiling ${BLOCKED_CEILING})`);
  for (const n of names.slice(0, 40)) console.log(`      ${n}`);
  if (names.length > 40) console.log(`      ... and ${names.length - 40} more`);
  if (byField.size) {
    console.log(`  by intake field: ` + [...byField].sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `${f} ${n}`).join(", "));
  }

  // NON-VACUITY, before any verdict. In order of what it tells you.
  if (!withSpec) {
    console.error(`\nFAIL — ${WATCHES} carries no machine-readable gate spec at all. `
      + `Nothing\n  could be screened, so nothing could be shown to delete a winner's `
      + `fund.`);
    process.exit(1);
  }
  if (!rows.length) {
    console.error(`\nFAIL — the answer key ${setFile} holds no pairs, so there is no `
      + `verified\n  winner to protect. This check measured nothing.`);
    process.exit(1);
  }
  if (tested < MIN_TESTED) {
    console.error(`\nFAIL — only ${tested} pair(s) could be judged, under the floor of `
      + `${MIN_TESTED}.\n`
      + `  A screen guard that runs out of population reports a clean zero and\n`
      + `  proves nothing. Either the snapshot, the answer key or the join\n`
      + `  between them has shrunk — or a comparator stopped being able to\n`
      + `  evaluate the field it is encoded against, which is how 193 region\n`
      + `  rules went inert for months. Lowering this floor is not a fix.`);
    process.exit(1);
  }
  if (blocked > BLOCKED_CEILING) {
    console.error(`\nFAIL — ${blocked} companies the register says WON a fund are deleted `
      + `from it\n  by the encoded gate screen, above the ceiling of ${BLOCKED_CEILING}.\n\n`
      + `  This is the drop accessiblePool logs as VER-BLOCKED, and it is\n`
      + `  the last thing between a correct shortlist and the memo a founder\n`
      + `  reads. A fund deleted here is not demoted, not explained and not\n`
      + `  recoverable downstream: it is simply absent.\n\n`
      + `  Fix the gate encoding, the attribution, or the comparator. RAISING\n`
      + `  THE CEILING IS NOT A FIX — it is a record that somebody accepted the\n`
      + `  new deletions.`);
    process.exit(1);
  }
  console.log(`\nPASS — no verified winner is newly deleted by the gate screen; the `
    + `standing\n  debt of ${BLOCKED_CEILING} has not risen. It is debt, not a target: `
    + `each one is an\n  encoding this product cannot yet express.`);
}

main();
