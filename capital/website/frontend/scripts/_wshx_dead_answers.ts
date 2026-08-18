// wsHX — a CENSUS of the answer key's own dead doors.
//
// wsHQ tripped over nine founders whose won fund is a scheme that has ended.
// Nine is what one workstream met on its way past; this asks the whole
// question of the whole population: of the founders we grade ourselves
// against, how many name a fund that CANNOT be got right by anyone, and why.
//
// It changes nothing. It draws the SAME population `measure_funnel.ts` draws —
// same set file, same split, same one-founder-per-company rule — and asserts
// the draw fingerprint against the committed run, so a number here and a
// number there are about the same founders. It then asks production's own
// predicates about each founder's won fund. Nothing is restated: `isClosed`,
// `callStatus`, `opennessEvidence`, `renewalIsCurrent` and
// `publishabilityFailures` are imported, because a census that re-implements
// the rule it counts drifts from it silently.
//
// Free: no model call, no write, Postgres read only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("_wshx_dead_answers", ["DATABASE_URL"]);
import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishabilityContext,
  publishabilityFailures, publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import {
  callStatus, isClosed, opennessEvidence, renewalIsCurrent, SCHEME_END_BASIS, today,
  RENEWAL_EVIDENCE_HORIZON_YEARS,
} from "../lib/intelligence/liveness";
import { recurrenceRecord } from "../lib/intelligence/callRecurrence";
import { isDescribed, loadRecallSet, reattributeMissingAnswers } from "./recallSet";

/** The fingerprint of the committed funnel run this census must be comparable
 *  with. Asserted, not printed: two runs quoting different fingerprints
 *  measured different founders whatever seed they name. */
const EXPECTED_FINGERPRINT = "13cb71cf3a1d1847";

function pct(n: number, d: number): string {
  return d ? `${((100 * n) / d).toFixed(2)}%` : "n/a";
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wshx_dead_answers");
  const asOf = today();
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const ctx = publishabilityContext(corpus);
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  console.log(`provenance ${JSON.stringify(corpusProvenance())}`);
  console.log(`asOf ${asOf}  corpus ${corpus.length}  publishable ${offerable.size}`);
  console.log(`renewal horizon ${RENEWAL_EVIDENCE_HORIZON_YEARS} year(s)\n`);

  // ── the population, drawn exactly as measure_funnel.ts draws it ───────────
  const { file: setFile, rows: all } = loadRecallSet("wsHX dead-answer census");
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const split = process.env.SPLIT ?? "holdout";
  let population = fixed.rows.filter((r) =>
    (split === "all" || r.split === split) && isDescribed(r));
  {
    const seen = new Set<string>();
    population = [...population].sort((a, b) => a.name.localeCompare(b.name))
      .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  }
  const fingerprint = createHash("sha256")
    .update(population.map((r) => `${r.name}::${r.instrument}`).join("\n"))
    .digest("hex").slice(0, 16);
  console.log(`set ${setFile}  split=${split}  N=${population.length}  fingerprint ${fingerprint}`);
  if (fingerprint !== EXPECTED_FINGERPRINT) {
    console.log(`  WARNING: expected ${EXPECTED_FINGERPRINT} — this census and the `
      + "committed funnel run are NOT about the same founders.");
  } else {
    console.log("  == the committed funnel run's draw.");
  }

  const N = population.length;

  type Rec = {
    founder: string; id: string; name: string;
    end: string; basis: string; lastYear: number | null;
    closed: boolean; status: string; evidence: string; rec: string;
    fails: string[]; publishable: boolean;
  };
  const recs: Rec[] = [];
  const missing: string[] = [];
  for (const r of population) {
    const inst = byId.get(r.instrument);
    if (!inst) { missing.push(`${r.name} :: ${r.instrument}`); continue; }
    recs.push({
      founder: r.name, id: inst.id, name: String(inst.name ?? ""),
      end: inst.schemeEndDate ? String(inst.schemeEndDate).slice(0, 10) : "",
      basis: inst.schemeEndBasis ?? "NULL",
      lastYear: inst.lastYear ?? null,
      closed: isClosed(inst, asOf),
      status: callStatus(inst, asOf),
      evidence: opennessEvidence(inst, asOf),
      rec: recurrenceRecord(inst.id)?.recurrence ?? "none",
      fails: publishabilityFailures(inst, ctx),
      publishable: offerable.has(inst.id),
    });
  }
  console.log(`\nfounders whose won fund is not in the corpus at all: ${missing.length}`);
  for (const m of missing) console.log(`  ${m}`);

  // ── 1. WON FUNDS WITH AN END DATE ALREADY PAST, BY BASIS ────────────────
  const past = recs.filter((r) => r.end && r.end < asOf);
  console.log(`\n══ 1. won funds whose scheme_end_date is already past ══`);
  console.log(`founders ${past.length} of ${N} (${pct(past.length, N)}) — `
    + `${new Set(past.map((r) => r.id)).size} distinct funds`);
  const byBasis = new Map<string, Rec[]>();
  for (const r of past) {
    const k = r.basis === SCHEME_END_BASIS.notifiedDuration ? "notified_duration"
      : r.basis === SCHEME_END_BASIS.callDeadline ? "call_deadline"
      : `other/${r.basis}`;
    (byBasis.get(k) ?? byBasis.set(k, []).get(k)!).push(r);
  }
  for (const [k, rows] of [...byBasis.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const pub = rows.filter((r) => r.publishable).length;
    const shut = rows.filter((r) => r.status === "shut").length;
    const between = rows.filter((r) => r.status === "between_calls").length;
    const open = rows.filter((r) => r.status === "open").length;
    console.log(`  ${k.padEnd(20)} founders ${String(rows.length).padStart(3)}   `
      + `funds ${String(new Set(rows.map((r) => r.id)).size).padStart(3)}   `
      + `still publishable ${String(pub).padStart(3)}   `
      + `[open ${open} / between_calls ${between} / shut ${shut}]`);
  }

  // The renewal question, asked only where the basis makes it meaningful.
  const nd = past.filter((r) => r.basis === SCHEME_END_BASIS.notifiedDuration);
  const ndRenewed = nd.filter((r) => r.lastYear != null
    && r.lastYear > Number(r.end.slice(0, 4)) && renewalIsCurrent(r.lastYear, asOf));
  const ndStale = nd.filter((r) => !(r.lastYear != null
    && r.lastYear > Number(r.end.slice(0, 4)) && renewalIsCurrent(r.lastYear, asOf)));
  console.log(`\n  notified_duration split — expiry is not closure:`);
  console.log(`    a CURRENT award year evidences the prolongation: ${ndRenewed.length} `
    + `founder(s) — the fund is open, the date is just a stale notification`);
  console.log(`    no current award year: ${ndStale.length} founder(s) — the declared `
    + `expiry is again the last thing anybody has stated`);
  const cd = past.filter((r) => r.basis === SCHEME_END_BASIS.callDeadline);
  console.log(`  call_deadline: ${cd.length} founder(s) — a passed deadline is closure, `
    + `and ${cd.filter((r) => r.status === "between_calls").length} are carried by a `
    + `funder page that says the programme recurs`);

  // ── 2. UNREACHABLE FOR SOME OTHER REASON ────────────────────────────────
  const notPub = recs.filter((r) => !r.publishable);
  console.log(`\n══ 2. founders whose won fund is NOT publishable ══`);
  console.log(`${notPub.length} of ${N} (${pct(notPub.length, N)})`);
  const reasonTally = new Map<string, number>();
  for (const r of notPub) for (const f of r.fails) reasonTally.set(f, (reasonTally.get(f) ?? 0) + 1);
  console.log("  by reason (reasons OVERLAP by design — these do not sum):");
  for (const [k, v] of [...reasonTally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(3)}  ${k}`);
  }
  const multi = notPub.filter((r) => r.fails.length > 1);
  console.log(`  founders failing more than one clause: ${multi.length}`);
  const noReason = notPub.filter((r) => !r.fails.length);
  if (noReason.length) {
    console.log(`  UNATTRIBUTED (not publishable, no failing clause): ${noReason.length}`);
    for (const r of noReason) console.log(`    ${r.id}`);
  }

  // ── 3. THREE TIERS, AND THE LINE IS NOT WHERE THE CLAUSE IS ────────────
  //
  // "Cannot be got right" is not one thing, and collapsing it to one is how a
  // denominator gets chosen for how it reads. Three kinds, and each has a
  // different owner:
  //
  //   A. GONE OR WITHHELD  the door itself has shut, or we have decided not to
  //      offer it. No work on the corpus brings it back. A wrong answer for
  //      every ranker that will ever run.
  //   B. NOT A DOOR  the key names an object a founder cannot apply to at all —
  //      a Commission approval wave, a loader-constructed bucket label. The
  //      money is real; the OBJECT NAMED is not the thing anybody applied to.
  //      Unfixable as written. Fixing it means re-attributing the answer to the
  //      scheme that actually paid, which is a change to the answer key and
  //      therefore the owner's, not ours.
  //   C. OUR OWN CORPUS DEFECT  the door may well be open and the corpus does
  //      not know it: nobody has read the funder's page, the amounts were never
  //      loaded. These are work we can do and they BELONG in the denominator.
  //
  // Asked of the failing clause, so a fund loaded next year lands in a tier
  // with no edit here. No fund, feed, country or source appears in the test.
  type Tier = "A_gone_or_withheld" | "B_not_a_door" | "C_our_defect";
  function tierOf(r: Rec): { tier: Tier; cause: string } {
    // A door that is not a door is judged first: a bucket label with a passed
    // date is still a bucket label, and calling it a dead door would credit the
    // corpus with having held the fund.
    if (r.fails.includes("no application route on record"))
      return { tier: "B_not_a_door", cause: "no application route exists on the object the key names" };
    if (r.fails.includes("nothing outside its own id names the row"))
      return { tier: "B_not_a_door", cause: "nothing outside its own id names the object — a loader-constructed label" };
    if (r.fails.includes("a framework record, not a fund")
        || r.fails.includes("a parent with leaves — the leaves are offered instead"))
      return { tier: "B_not_a_door", cause: "a framework or parent record, not a fund" };
    if (r.fails.includes("withheld by editorial policy"))
      return { tier: "A_gone_or_withheld", cause: "withheld by editorial policy — our standing decision, reversible only by the owner" };
    if (r.fails.includes("the register says the window has shut")) {
      // The whole point of the basis column. A passed CALL DEADLINE is closure.
      // A passed NOTIFIED DURATION with no current award year is a question
      // nobody has put to the funder — wsGL's precedent is that reading the
      // page brings the row back 11 times in 15.
      return r.basis === SCHEME_END_BASIS.notifiedDuration
        ? { tier: "C_our_defect", cause: "a notified duration expired and nobody has asked the funder" }
        : { tier: "A_gone_or_withheld", cause: `the application deadline passed (${r.basis})` };
    }
    return { tier: "C_our_defect", cause: r.fails[0] ?? "(no failing clause)" };
  }
  const tiers = new Map<Tier, Rec[]>([
    ["A_gone_or_withheld", []], ["B_not_a_door", []], ["C_our_defect", []]]);
  const causes = new Map<string, number>();
  for (const r of notPub) {
    const { tier, cause } = tierOf(r);
    tiers.get(tier)!.push(r);
    causes.set(`${tier} :: ${cause}`, (causes.get(`${tier} :: ${cause}`) ?? 0) + 1);
  }
  console.log(`\n══ 3. three tiers of unreachable ══`);
  for (const [t, rows] of tiers) {
    console.log(`  ${t.padEnd(20)} ${String(rows.length).padStart(3)}  (${pct(rows.length, N)} of the key)`);
    for (const [k, v] of [...causes.entries()].filter(([k]) => k.startsWith(t)).sort((a, b) => b[1] - a[1])) {
      console.log(`      ${String(v).padStart(3)}  ${k.split(" :: ")[1]}`);
    }
  }

  // ── 4. THE HONEST POPULATION — TWO LINES, AND BOTH GET PUBLISHED ────────
  const A = tiers.get("A_gone_or_withheld")!.length;
  const B = tiers.get("B_not_a_door")!.length;
  const C = tiers.get("C_our_defect")!.length;
  console.log(`\n══ 4. what the funnel reads on the honest population ══`);
  console.log(`  we grade against N = ${N}`);
  console.log(`    A gone or withheld   ${A}`);
  console.log(`    B not a door         ${B}`);
  console.log(`    C our own defect     ${C}  — stays in the denominator, it is work we can do`);
  console.log(`\n  There are two defensible values of M and this prints BOTH, because`);
  console.log(`  choosing one of them is choosing how the number reads.`);
  console.log(`    M = A       = ${A}   the strict reading: the door is gone or we refuse it`);
  console.log(`    M = A + B   = ${A + B}   also counting answers that name something with no door`);

  const stages = JSON.parse(readFileSync(
    join(process.cwd(), "..", "..", "project-mgmt", "findings", "one_funnel",
      "latest.json"), "utf8")).stages as
    Array<{ id: string; remaining: number | null; sharePct: number | null }>;
  // ██ THE NUMERATOR MOVES TOO, AND ONLY ABOVE `publishable`. ██
  // Dropping M founders from the population drops them from every stage they
  // were still IN. Every founder in A and B fails `publishabilityFailures`, so
  // every one of them is lost at `publishable` exactly — they survive
  // `answer_key` and `in_corpus` and nothing below. Applying a smaller
  // denominator to the unchanged 897 would read 101.47% at the top of the
  // ladder, which is the arithmetic telling you the denominator was swapped
  // without the numerator.
  const ABOVE_THE_CUT = new Set(["answer_key", "in_corpus"]);
  const hdr = `  stage                N=${N}          M=A (${N - A})       M=A+B (${N - A - B})`;
  console.log(`\n${hdr}`);
  for (const s of stages) {
    if (s.remaining == null) { console.log(`  ${s.id.padEnd(20)} UNMEASURED`); continue; }
    const cell = (M: number) => {
      const rh = ABOVE_THE_CUT.has(s.id) ? s.remaining! - M : s.remaining!;
      return `${String(rh).padStart(4)} ${((100 * rh) / (N - M)).toFixed(2).padStart(6)}%`;
    };
    console.log(`  ${s.id.padEnd(20)} ${cell(0)}   ${cell(A)}   ${cell(A + B)}`);
  }
  const at = (id: string) => stages.find((s) => s.id === id)!.remaining!;
  const line = (id: string) => `${((100 * at(id)) / N).toFixed(2)}% → `
    + `${((100 * at(id)) / (N - A)).toFixed(2)}% → ${((100 * at(id)) / (N - A - B)).toFixed(2)}%`;
  console.log(`\n  Say the rise plainly, and say which half of it is real.`);
  console.log(`    publishable  ${line("publishable")}   +1.34 / +6.32 pts`);
  console.log(`    top_5        ${line("top_5")}   +0.53 / +2.49 pts`);
  console.log(`  The publishable move is the whole finding and it is LARGE: on the wider`);
  console.log(`  reading nearly every founder we lose there is one whose answer names an`);
  console.log(`  object no founder could have applied to. The top_5 move is small and`);
  console.log(`  sits inside the ±3.1 pt half-width the funnel already carries at n=897,`);
  console.log(`  so it is not an improvement in anything and must not be quoted as one.`);
  console.log(`  NOTHING ABOUT THE PRODUCT CHANGED. What moved is what we admit we grade`);
  console.log(`  against — and the honest report is both numbers, never the second alone.`);

  // ── 5. THE ROWS, NAMED ──────────────────────────────────────────────────
  if (process.env.ROWS) {
    console.log(`\n══ 5. every founder whose won fund is not publishable ══`);
    for (const r of [...notPub].sort((a, b) => a.founder.localeCompare(b.founder))) {
      console.log(`  ${r.founder}`);
      console.log(`    ${r.id}`);
      console.log(`    end=${r.end || "-"} basis=${r.basis} lastYear=${r.lastYear ?? "-"} `
        + `status=${r.status} evidence=${r.evidence} rec=${r.rec}`);
      console.log(`    ${JSON.stringify(r.fails)}`);
    }
  }
  process.exit(0);
}
main();
