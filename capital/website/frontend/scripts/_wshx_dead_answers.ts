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

  // ── 3. WHAT CAN AND CANNOT BE RECOVERED ─────────────────────────────────
  //
  // The split that matters is not the clause. It is whether ANY amount of work
  // on our side could make this founder gradable.
  //
  //   PERMANENT   the door itself is gone, or we have decided not to offer it.
  //               No corpus work brings it back. It is a wrong answer for
  //               every ranker that will ever run.
  //   RECOVERABLE the door may well be open and the corpus does not know it —
  //               nobody has read the funder's page, nothing names the row, no
  //               route has been recorded, the amounts were never loaded.
  //               These are our defects, and they belong in the denominator
  //               because closing them is work we can do.
  //
  // A founder in BOTH is counted PERMANENT: a fund that is gone stays gone
  // however well we describe it.
  const permanent: Rec[] = [];
  const recoverable: Rec[] = [];
  for (const r of notPub) {
    const gone = r.fails.includes("the register says the window has shut")
      && (r.basis === SCHEME_END_BASIS.callDeadline
        || r.basis !== SCHEME_END_BASIS.notifiedDuration);
    const policy = r.fails.includes("withheld by editorial policy");
    const notAFund = r.fails.includes("a framework record, not a fund")
      || r.fails.includes("a parent with leaves — the leaves are offered instead");
    (gone || policy || notAFund ? permanent : recoverable).push(r);
  }
  console.log(`\n══ 3. permanent vs recoverable ══`);
  console.log(`  PERMANENT   ${permanent.length}  (${pct(permanent.length, N)} of the key)`);
  const permByCause = new Map<string, number>();
  for (const r of permanent) {
    const cause = r.fails.includes("the register says the window has shut")
        && r.basis !== SCHEME_END_BASIS.notifiedDuration
      ? `the call deadline passed (${r.basis})`
      : r.fails.includes("withheld by editorial policy") ? "withheld by editorial policy"
      : "not a fund (framework / parent)";
    permByCause.set(cause, (permByCause.get(cause) ?? 0) + 1);
  }
  for (const [k, v] of [...permByCause.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(v).padStart(3)}  ${k}`);
  }
  console.log(`  RECOVERABLE ${recoverable.length}  (${pct(recoverable.length, N)} of the key)`);
  const recByCause = new Map<string, number>();
  for (const r of recoverable) {
    const cause = r.fails.includes("the register says the window has shut")
      ? "a notified duration expired and nobody has asked the funder"
      : r.fails[0] ?? "(none)";
    recByCause.set(cause, (recByCause.get(cause) ?? 0) + 1);
  }
  for (const [k, v] of [...recByCause.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(v).padStart(3)}  ${k}`);
  }

  // ── 4. THE HONEST POPULATION ────────────────────────────────────────────
  console.log(`\n══ 4. what the funnel reads on the honest population ══`);
  console.log(`  we grade against N = ${N}`);
  console.log(`  of which M = ${permanent.length} cannot be got right by anyone`);
  console.log(`  honest denominator N - M = ${N - permanent.length}`);
  console.log(`\n  every published stage figure, on both denominators:`);
  const stages = JSON.parse(readFileSync(
    join(process.cwd(), "..", "..", "project-mgmt", "findings", "one_funnel",
      "latest.json"), "utf8")).stages as
    Array<{ id: string; remaining: number | null; sharePct: number | null }>;
  // ██ THE NUMERATOR MOVES TOO, AND ONLY ABOVE `publishable`. ██
  // Dropping M founders from the population drops them from every stage they
  // were still IN. All M fail `publishabilityFailures`, so all M are lost at
  // `publishable` exactly — they survive `answer_key` and `in_corpus` and
  // nothing below. Applying the smaller denominator to the unchanged 897 would
  // read 101.47% at the top of the ladder, which is the arithmetic telling you
  // the denominator was swapped without the numerator.
  const M = permanent.length;
  const H = N - M;
  const ABOVE_THE_CUT = new Set(["answer_key", "in_corpus"]);
  console.log(`  stage              N=${N}        honest N=${H}        delta`);
  for (const s of stages) {
    if (s.remaining == null) { console.log(`  ${s.id.padEnd(20)} UNMEASURED`); continue; }
    const rh = ABOVE_THE_CUT.has(s.id) ? s.remaining - M : s.remaining;
    const a = (100 * s.remaining) / N;
    const b = (100 * rh) / H;
    console.log(`  ${s.id.padEnd(20)} ${String(s.remaining).padStart(4)} ${a.toFixed(2).padStart(6)}%   `
      + `${String(rh).padStart(4)} ${b.toFixed(2).padStart(6)}%   `
      + `${(b - a >= 0 ? "+" : "")}${(b - a).toFixed(2)} pts`);
  }

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
