// Do we tell a founder a fund is open when nothing has told us it is?
//
// ── The defect ────────────────────────────────────────────────────────────
// A row reaches a founder as OPEN in one of five ways (`opennessEvidence` in
// lib/intelligence/liveness.ts). Four of them are statements: a future declared
// window, an award after a notified duration, a successor registration, or a
// register that states no closing date for objects of this kind. The fifth,
// `no_deadline_recorded` on a row whose register DOES state windows, is not a
// statement about the fund at all — it is our copy being silent, and a window
// loaded since the copy was taken is indistinguishable from a fund that has
// none.
//
// `unconfirmedOpen()` withholds exactly those rows, and returns null on the
// Postgres path because Postgres is the freshest store there is. That reasoning
// is right about STALENESS and silent about COMPLETENESS, and the two are not
// the same failure: on 2026-08-09 the live Postgres corpus held 169 such rows,
// 35-39% of founders were shown at least one, and asking the two registers that
// publish them (project-mgmt/findings/wsCO_window_register.json) found 33 whose
// application window the register states HAS CLOSED. Being current does not make
// a thin extract complete.
//
// ── What this check does, and what it deliberately does not ───────────────
// It does NOT withhold. A wrongly-withheld row is a fund a founder never sees,
// and a weekly job once deleted 88 live Spanish funds on every run; this file
// exists so the number can only get smaller, not so it can delete rows.
//
//   1. RATCHET. The count of publishable rows asserting openness on our copy's
//      silence may not exceed the recorded baseline. Closing them is progress
//      and lowers the ratchet; a new feed that ships more of them is a build
//      failure the day it lands rather than a discovery months later.
//
//   2. WINNER-NOT-BLOCKED. Every row the register evidence proposes to close
//      must (a) carry a date the REGISTER states, never one we inferred, and
//      (b) leave at least one publishable sibling in its own regime, so a
//      founder who qualifies still sees the programme and loses only the dead
//      edition. Nothing may be withheld until this passes for it.
//
// The evidence file is committed, not gitignored, and this check makes no
// network request: the registers are asked by `scripts/_wsco_window.ts`, which
// is not part of `npm run check`.
//
//   npx tsx scripts/check_window_evidence.ts
import { readFileSync } from "fs";
import { resolve } from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("check_window_evidence", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import {
  type LivenessFacts, opennessEvidence, windowAbsenceIsTheRegisters,
} from "../lib/intelligence/liveness";

/** The PUBLISHABLE population as measured against live Postgres.
 *
 *  A CEILING, never a target. It may be lowered by loading the windows the
 *  registers state, and it may never be raised to make a build green. Raising
 *  it is the one edit to this file that needs an argument in the commit
 *  message.
 *
 *  166 -> 89 on 2026-08-09 (wsCO2), when the owner approved loading the dates.
 *  74 rows gained a window the register states, 58 of them already past, and
 *  the 4 Bpifrance award lists stopped claiming a window their file never had.
 *  What is LEFT is deliberate: a row whose register answers with no date at all
 *  keeps no declaration and stays here, because "we do not know" is a
 *  legitimate state and this number falling to zero would mean we had started
 *  inventing answers. */
const BASELINE_UNVERIFIED = Number(process.env.WINDOW_BASELINE ?? 89);

const EVIDENCE = resolve(__dirname, "../../capital/project-mgmt/findings/wsCO_window_register.json");

interface Verdict { id: string; register: string; verdict: string; detail: string; name: string }

/** The register verdicts that would REMOVE a row from a founder's table. Only
 *  these need the winner-not-blocked proof: `window_open` and
 *  `register_states_none` add evidence and take nothing away, and
 *  `no_register_record` is weaker than a stated deadline and is deliberately
 *  not treated as closure — absence from a catalogue is the register declining
 *  to offer something, which is not the same claim as a date that has passed. */
const WITHHOLDING = "window_passed";

/** A register verdict may close a row only if it quotes the register's own
 *  date. `detail` is written by `_wsco_window.ts` from the register response
 *  verbatim; a verdict with no date in it is an inference and may not withhold.
 *  Stated as a property of the STRING rather than as a list of registers, so a
 *  third register added later is held to the same standard without being named. */
const STATES_A_DATE = /\d{4}-\d{2}-\d{2}/;

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("check_window_evidence");
  const pub = publishableInstruments();
  const all = loadDbInstruments();
  if (!pub.length) throw new Error("check_window_evidence: no publishable instruments — that is not a pass");

  const problems: string[] = [];

  // ── 1. the ratchet ───────────────────────────────────────────────────────
  // ── THE RATCHET COUNTS WHAT THE POLICY WITHHOLDS, 2026-08-13 (wsGN) ──────
  //
  // ██ It counted `sourceWindowPolicy === publishesWindow && !schemeEndDate`,
  // which is a HAND COPY of the production rule and a strictly narrower one. ██
  //
  // `unconfirmedOpen` withholds a row when `opennessEvidence` says
  // `no_deadline_recorded` and the register does not account for the absence —
  // and `windowAbsenceIsTheRegisters` accounts for it under exactly TWO
  // policies. Its own docstring says the rest out loud: "a window-publishing
  // register, OR NO RECORDED ANSWER AT ALL, leaves the absence unexplained".
  //
  // The copy tested only the first of those two. So every publishable row with
  // NO source_window_policy recorded — withheld from every degraded request, and
  // the exact population a new feed lands — was invisible to the ratchet. A
  // source could start shipping them by the hundred and `unverified.length`
  // would not move, which is the failure line 29 of this file promises to catch
  // on the day it lands.
  //
  // Through the product's own two functions now, not a third statement of them.
  // The file already had `liveness.ts` open for the constant.
  const unverified = pub.filter((i) => {
    const r = i as unknown as LivenessFacts;
    return opennessEvidence(r) === "no_deadline_recorded"
      && !windowAbsenceIsTheRegisters(r.sourceWindowPolicy);
  });
  const byCountry = new Map<string, number>();
  for (const i of unverified) byCountry.set(i.country, (byCountry.get(i.country) ?? 0) + 1);
  console.log(`rows asserting openness on OUR COPY holding no deadline: ${unverified.length}` +
    ` of ${pub.length} publishable (baseline ${BASELINE_UNVERIFIED})`);
  console.log(`  concentration: ${[...byCountry].sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c}:${n}`).join(" ")}`);
  if (unverified.length > BASELINE_UNVERIFIED) {
    problems.push(`the unverified-window population GREW: ${unverified.length} > ${BASELINE_UNVERIFIED}. ` +
      `A feed has started shipping rows whose register states a window we do not hold. ` +
      `Load the window or declare the feed's policy; do not raise the baseline to clear this.`);
  }

  // ── 2. winner-not-blocked, on every proposed withhold ────────────────────
  let evidence: { askedAt: string; rows: Verdict[] };
  try {
    evidence = JSON.parse(readFileSync(EVIDENCE, "utf8"));
  } catch {
    throw new Error(`check_window_evidence: ${EVIDENCE} is unreadable — the evidence a ` +
      `withhold rests on may not be missing. Re-run scripts/_wsco_window.ts with OUT=.`);
  }
  const proposed = evidence.rows.filter((r) => r.verdict === WITHHOLDING);
  if (!evidence.rows.length) {
    throw new Error("check_window_evidence: the evidence file holds no verdicts, which is not a pass");
  }
  const byId = new Map(all.map((i) => [i.id, i]));
  const regimeOf = (id: string) => String((byId.get(id) as { parentId?: string | null } | undefined)?.parentId ?? id);
  const survivors = new Map<string, number>();
  const doomed = new Set(proposed.map((p) => p.id));
  for (const i of pub) {
    if (doomed.has(i.id)) continue;
    const k = regimeOf(i.id);
    survivors.set(k, (survivors.get(k) ?? 0) + 1);
  }
  let checked = 0;
  for (const p of proposed) {
    if (!byId.has(p.id)) continue;   // already gone from the corpus; nothing to block
    checked++;
    if (!STATES_A_DATE.test(p.detail)) {
      problems.push(`${p.id}: proposed for withholding on a verdict that quotes no register date ` +
        `(${p.register}: ${p.detail}) — that is an inference, and an inference may not close a row`);
    }
    if ((survivors.get(regimeOf(p.id)) ?? 0) === 0) {
      problems.push(`${p.id}: withholding it would leave its regime ${regimeOf(p.id)} with NO publishable ` +
        `row, so a founder who qualifies would see the programme disappear rather than one dead edition`);
    }
  }
  console.log(`\nproposed withholds in ${EVIDENCE.split("/").pop()}: ${proposed.length}` +
    ` (${checked} still in the corpus), asked ${evidence.askedAt}`);
  console.log(`  every one quotes the register's own date, and none empties its regime` +
    `${problems.length ? " -- EXCEPT AS LISTED BELOW" : ""}`);

  if (problems.length) {
    console.error(`\nFAILED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("\nok");
}

main().catch((e) => { console.error(e); process.exit(1); });
