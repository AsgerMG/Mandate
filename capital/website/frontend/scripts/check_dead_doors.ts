/**
 * IS ANY ROW OFFERED TO A FOUNDER AS OPEN ON A FACT THAT IS ITSELF IN THE PAST?
 *
 * Needs DATABASE_URL. No model calls, no writes, no network beyond Postgres.
 *
 * ── The defect, on a real founder's memo ──────────────────────────────────
 * `npm run prodcheck`, 2026-08-18, A.M.L. MICROTECHNIQUE LORRAINE. Published
 * row 5 of seven was SA.40453 — *Regime cadre exempte ... PME pour la periode
 * 2014-2020*, `scheme_end_date` 2020-12-30 — with a working link, a EUR 980,817
 * typical award, and the next step "confirm this regime is still accepting
 * applications". A founder would have spent their afternoon on it.
 *
 * Every unit test in this repo was green. `betweenCalls`, the mechanism built
 * for exactly a row whose window has shut, did not fire — because the row was
 * never CLOSED: an award in 2022 was read as a permanent renewal of a
 * notification that expired in 2020, so `callStatus()` answered `open` and
 * never reached the recurrence question. The rule was wrong, and nothing
 * downstream of the rule was in a position to notice.
 *
 * ── THE PROPERTY, and its test for a fund nobody here has read ────────────
 *
 *     A ROW IS NEVER OFFERED AS OPEN ON A FACT THAT IS ITSELF IN THE PAST.
 *     Where the row's own window has closed it may be offered ONLY because the
 *     funder's own source says the programme continues past the round we hold,
 *     and then only WITH THE CAVEAT SHOWN. NULL is not "recurs".
 *
 * The test, for a fund loaded next year from a register in a language nobody
 * here reads: take the fact this row's openness is resting on — production's
 * own `opennessEvidence()` names it — and ask whether that fact has expired.
 * A declared window expires on its date. A prolongation evidenced by an award
 * expires with the register's own reporting lag. A funder's page saying the
 * programme runs on does not expire, and is the one thing that may carry a row
 * whose window has shut. No fund, feed, country or date appears in the rule.
 *
 * ── WHY THIS EXISTS BESIDE `check_liveness` AND NOT INSIDE IT ─────────────
 * `check_liveness` asks whether "is this fund open" still has ONE definition.
 * It would have stayed green through all of this, correctly: there was one
 * definition and every consumer read it. This asks the other question — whether
 * what the definition decides is what the PUBLISHED TABLE carries — and it asks
 * it of `publishableInstruments()` against live Postgres, because that is the
 * population a founder is served from. Three stages sit between the rule and
 * the table (the successor redirect, the degradation filter, the leaf cut) and
 * a guard reading the corpus instead would be an instance of the defect
 * `check_guard_subject` is named after.
 *
 *   npx tsx scripts/check_dead_doors.ts
 *   PROVE=1 npx tsx scripts/check_dead_doors.ts   simulate the real failure
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("check_dead_doors", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
  type DbInstrument,
} from "../lib/intelligence/corpus";
import {
  RENEWAL_EVIDENCE_HORIZON_YEARS, SCHEME_END_BASIS, callStatus, opennessEvidence,
  renewalIsCurrent, today,
} from "../lib/intelligence/liveness";
import {
  betweenCallsCaveat, recurrenceRecord, unexaminedClosedRows,
} from "../lib/intelligence/callRecurrence";

/**
 * THE GUARD'S OWN CEILING ON HOW OLD AN OPENNESS FACT MAY BE.
 *
 * ── Why a second number, when the row scan below already calls production ──
 * The scan asks production `renewalIsCurrent()` on purpose: a guard that
 * re-implements the predicate it protects drifts from it silently, which is
 * what `check_window_evidence` did. But the consequence is exact and has to be
 * said out loud — A GUARD THAT CALLS THE RULE CANNOT CATCH THE RULE BEING
 * WRONG. Run against the code that shipped SA.40453, whose renewal clause had
 * no horizon at all, the scan below is green on every row.
 *
 * So this is the independent half: a bound on the RULE rather than on the rows,
 * stated here and nowhere else, which reds if production's horizon is widened
 * past it. Against the shipped rule — an unbounded horizon — it is red, and
 * that is the run this guard was built from.
 *
 * Three years, measured. On the 228 rows whose openness is established without
 * any award year (a declared duration still in the future), 96.1% report an
 * award within two years and 99.6% within three. Past three the silence has
 * stopped being the register's reporting lag and is a fact about the scheme.
 * Widening production past this is a decision, not an edit: it puts rows in
 * front of founders on evidence older than any live scheme in the corpus
 * carries, and it should cost a commit that says so.
 */
const HORIZON_CEILING_YEARS = 3;

/**
 * Every way a published row breaks the property, over any list of rows.
 *
 * Takes the rows as an argument rather than fetching them, for one reason: it
 * is the only way `PROVE` can hand it a table containing the failure and watch
 * it go red. A scan that could only ever read the real table could only ever
 * report that today is fine, which is what a vacuous guard reports too.
 *
 * It calls production's own `opennessEvidence()` and `renewalIsCurrent()`
 * rather than restating either. A guard that re-implements the predicate it
 * protects drifts from it, and drifts SILENTLY — `check_window_evidence` hand-
 * copied a strictly narrower rule and went blind to the whole population a new
 * feed lands in.
 */
export function deadDoors(rows: readonly DbInstrument[], asOf: string): string[] {
  const bad: string[] = [];
  for (const row of rows) {
    switch (opennessEvidence(row, asOf)) {
      case "observed_renewal":
        // The row's declared window has passed and the only thing contradicting
        // it is an award year. That contradiction is DATED. Once it is outside
        // the register's own reporting lag it has stopped being a statement
        // about now, and the expiry is again the last thing anybody has said.
        if (row.lastYear == null || !renewalIsCurrent(row.lastYear, asOf)) {
          bad.push(`${row.id}: offered as OPEN with ${row.schemeEndDate} behind us, on the `
            + `strength of an award in ${row.lastYear ?? "no year at all"}. That evidences a `
            + `prolongation through ${row.lastYear ?? "?"} and nothing after it. Nobody has `
            + `asked the funder whether the programme continues, so this row is a door with `
            + `no evidence behind it — the shape SA.40453 reached a founder in.`);
        }
        break;
      case "between_calls": {
        // Offered DESPITE a shut window. Two things are owed and both are
        // checked, because either alone is the failure wearing the other's
        // clothes: a claim with no page behind it, or a page nobody is shown.
        const rec = recurrenceRecord(row.id);
        if (!rec?.url || !rec?.checkedAt) {
          bad.push(`${row.id}: offered although the window it holds has shut, with no funder `
            + `page behind the claim that the programme continues. A row is not lifted out of `
            + `suppression by assertion.`);
        }
        if (!betweenCallsCaveat(row, asOf)) {
          bad.push(`${row.id}: is between calls and renders NO caveat, so the founder reads a `
            + `row whose window has shut with nothing on it saying so.`);
        }
        break;
      }
      case "closed":
        bad.push(`${row.id}: the register says its window has shut and it is in the published `
          + `table anyway. Something between the rule and the founder is putting it back.`);
        break;
      default:
        // `declared_window` cannot be past — that is what makes it declared.
        // `successor_registration` and `no_deadline_recorded` carry no date to
        // expire, and the second is `unconfirmedOpen`'s subject, not this one's.
        break;
    }
  }
  return bad;
}

/**
 * SIMULATE THE REAL FAILURE, then require the guard to see it.
 *
 * Two arms, and the first alone would prove nothing. `deadDoors` is handed a
 * table that CONTAINS the 2026 version of SA.40453 and must go red; then the
 * production filter is asked whether such a row can reach the table at all, and
 * must say no. One shows the guard is enforcing, the other that the rule is
 * wired — and this repo has shipped each without the other.
 */
async function prove(asOf: string): Promise<void> {
  const published = publishableInstruments();
  const rows = loadDbInstruments();
  const before = publishableInstruments().map((r) => r.id).sort().join("|");

  // Rows a founder IS being shown today, carrying no window at all, pushed into
  // exactly the state the memo's row 5 was in: a notified duration long past,
  // and one award after it, years ago. Drawn from the PUBLISHED table and not
  // from the corpus, so "the filter lets 0 through" is a claim about rows that
  // demonstrably reached a founder a moment earlier.
  const publishedIds = new Set(published.map((r) => r.id));
  const victims = rows.filter((r) => !r.schemeEndDate && publishedIds.has(r.id)).slice(0, 25);
  if (!victims.length) throw new Error("PROVE: no published open row to doctor — nothing was simulated");
  const restore = victims.map((r) => [r, r.schemeEndDate, r.schemeEndBasis, r.lastYear] as const);
  const staleYear = Number(asOf.slice(0, 4)) - 4;
  for (const r of victims) {
    r.schemeEndDate = `${staleYear - 2}-12-30`;
    r.schemeEndBasis = SCHEME_END_BASIS.notifiedDuration;
    r.lastYear = staleYear;
  }

  // ARM 1 — the guard, handed the failure directly. The victims are already IN
  // `published` (same objects, now doctored), so the table is scanned as it
  // stands rather than with a second copy of each victim appended.
  const red = deadDoors(published, asOf);
  // ARM 2 — the filter, asked whether the failure can reach a founder.
  const leaked = publishableInstruments().filter((r) => victims.some((v) => v.id === r.id));

  for (const [r, d, b, y] of restore) {
    r.schemeEndDate = d ?? null; r.schemeEndBasis = b ?? null; r.lastYear = y ?? null;
  }
  const after = publishableInstruments().map((r) => r.id).sort().join("|");

  console.log(`  PROVE: ${victims.length} open rows given a ${staleYear - 2} notified duration, `
    + `one award in ${staleYear}, and no funder page.`);
  console.log(`    the guard reports  ${red.length} dead door(s)  `
    + `${red.length >= victims.length ? "RED — enforcing" : "██ GREEN ON THE FAILURE — NOT ENFORCING ██"}`);
  console.log(`    the filter lets    ${leaked.length} of them through  `
    + `${leaked.length === 0 ? "none — the rule is wired" : "██ THE RULE IS NOT WIRED ██"}`);

  // A restore that did not restore would leave every figure below measured on a
  // corpus this function invented, which is worse than the defect it proves.
  if (after !== before) {
    throw new Error("PROVE: the in-memory doctoring was not fully reverted. Every figure "
      + "after this point would be measured on a table this proof made up.");
  }
  if (red.length < victims.length) {
    throw new Error("PROVE: the guard did not report a dead door it was handed. It is not "
      + "enforcing the property it names.");
  }
  if (leaked.length) {
    throw new Error(`PROVE: ${leaked.length} doctored row(s) reached the published table. A row `
      + `whose window closed years ago, with nobody having asked the funder, is still a door.`);
  }
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("check_dead_doors");
  const asOf = today();
  const published = publishableInstruments();
  // A guard that passes by having nothing to read is the failure it exists to
  // catch, one level up.
  if (!published.length) {
    throw new Error("check_dead_doors: no publishable instruments — that is not a pass");
  }

  if (process.env.PROVE) await prove(asOf);

  const bad = deadDoors(published, asOf);

  // ── The rule itself, judged by something that is not the rule ───────────
  if (RENEWAL_EVIDENCE_HORIZON_YEARS > HORIZON_CEILING_YEARS) {
    bad.push(`the renewal horizon is ${RENEWAL_EVIDENCE_HORIZON_YEARS} years, past this guard's `
      + `ceiling of ${HORIZON_CEILING_YEARS}. An award that old evidences a prolongation nothing `
      + `else in the corpus does — 99.6% of rows with a window still open report inside three `
      + `years — so every row it carries is a door offered on a fact no live scheme's evidence `
      + `looks like. Argue it in the commit, or ask the funder instead.`);
  }

  // ── The number that matters most days, and it is never a pass ───────────
  // A row suppressed on an expired window with no recorded recurrence answer is
  // a row we are asserting a programme ended without having asked. It does not
  // go away by being handled correctly; it goes away when somebody reads the
  // page. Reported over the whole corpus, deliberately not ratcheted: the
  // population grows every time a window is loaded, which is a coverage WIN,
  // and a check that reddened on it would be paid off by loading fewer.
  const all = loadDbInstruments();
  const suppressed = all.filter((r) => opennessEvidence(r, asOf) === "closed");
  const unexamined = unexaminedClosedRows(all, (r) => callStatus(r, asOf) !== "open");
  const caveated = published.filter((r) => opennessEvidence(r, asOf) === "between_calls");
  const onRenewal = published.filter((r) => opennessEvidence(r, asOf) === "observed_renewal");

  console.log(`published rows: ${published.length} of ${all.length}`);
  console.log(`  open on a prolongation an award still evidences: ${onRenewal.length}`);
  console.log(`  offered with the between-calls caveat shown:     ${caveated.length}`);
  console.log(`  withheld on a window nothing contradicts:        ${suppressed.length}`);
  console.log(`  ...of the withheld and caveated, ${unexamined.length} have had NO funder page read. `
    + `Each is a programme we are calling ended without having asked, and reading one page is `
    + `the whole remedy — see project-mgmt/evidence/README.md.`);

  if (bad.length) {
    console.error(`\nFAILED — ${bad.length} problem(s): a door is offered on a fact that has expired:`);
    for (const b of bad.slice(0, 20)) console.error(`  - ${b}`);
    if (bad.length > 20) console.error(`  ... and ${bad.length - 20} more`);
    process.exit(1);
  }
  console.log("\nok — no published row rests its openness on a date behind us");
}

main().catch((e) => { console.error(e); process.exit(1); });
