// Re-score a tape offline, and compare two arms. FREE, and no database.
//
//   npx tsx scripts/replay_tape.ts /tmp/control.json
//   npx tsx scripts/replay_tape.ts /tmp/treatment.json /tmp/control.json
//
// ── What this is for ───────────────────────────────────────────────────────
// The architecture is "tweak a lever, measure it", and that only works if
// measurement is fast and cheap. A tape written by `measure_recall.ts` carries
// the candidates as the model saw them, the picks, the stage ranks and the
// founder context -- everything a SCORING question needs. So a change to how a
// case is graded, classified or compared is answered by re-reading the tape:
// no Postgres, no embeddings, no model call, no bill. Only a change to what the
// model is SENT costs money, and then only for the cases whose prompt changed.
//
// ── FIDELITY FIRST, in the shape `_wsda_rows.ts:189-193` established ───────
// Before any number here is believed, the offline classifier is re-run over the
// recorded ids and checked against the class the live run recorded. Anything
// below 1.0 means this file is grading a different system from the one that
// produced the tape, and every figure below it is a guess with a table around
// it. `assertReplayFidelity` throws rather than warns, because a warning in a
// long harness log is a warning nobody reads.
//
// ── Comparing two arms ─────────────────────────────────────────────────────
// Given two tapes the file runs the shared McNemar (`scripts/mcnemar.ts`) over
// the cases they have IN COMMON, and refuses to run it on anything else. The
// pairing is the entire validity of the test: two runs over different draws are
// two samples, not a paired comparison, and no arithmetic recovers the
// difference afterwards.
import { readFileSync } from "fs";

import { mcnemar, mcnemarLine } from "./mcnemar";
import { assertReplayFidelity } from "./rankerCache";
import { classify, taxonomyTable, type TapeCase } from "./rankerTape";

function load(file: string): TapeCase[] {
  const t = JSON.parse(readFileSync(file, "utf8")) as TapeCase[];
  if (!Array.isArray(t) || !t.length) throw new Error(`${file}: not a non-empty tape`);
  if (!t[0].caseId || !t[0].publishedRegime) {
    throw new Error(
      `${file}: tape predates the self-contained shape (no caseId/publishedRegime). ` +
      `Re-cut it with OUT= on measure_recall.ts -- an old tape cannot be replayed ` +
      `offline, and guessing the missing fields is how a replay stops matching ` +
      `production without saying so.`);
  }
  return t;
}

/** The graded window, restated here rather than imported, because the window is
 *  what every floor in `check_recall_floor.ts` is calibrated on and widening it
 *  can only raise the number. Five, and it stays five. */
const WINDOW = 5;

/** Re-derive the failure class from the recorded ids alone. This is the
 *  simulator the fidelity gate checks: it must produce, from the tape, exactly
 *  what the live run produced. */
function reclassify(c: TapeCase): string {
  const regime = new Map(c.published.map((id, i) => [id, c.publishedRegime[i]]));
  const channel = new Map(c.published.map((id, i) => [id, c.publishedChannel[i]]));
  return classify({
    want: c.want, wantRegime: c.wantRegime, wantChannel: c.wantChannel,
    candidates: c.candidates,
    published: c.published.slice(0, WINDOW),
    regimeOf: (id) => regime.get(id) ?? id,
    channelOf: (id) => channel.get(id) ?? "",
  });
}

const hit = (c: TapeCase) => c.published.slice(0, WINDOW).includes(c.want);
const pct = (k: number, n: number) => `${k}/${n} (${(100 * k / Math.max(1, n)).toFixed(1)}%)`;

/** One arm's identity, printed on every block. Two tapes at the same arm are
 *  the same treatment measured twice, which is a useful thing to know and a
 *  useless thing to McNemar. */
function armOf(t: TapeCase[], file: string): string {
  const arms = new Set(t.map((c) => c.arm));
  if (arms.size !== 1) {
    throw new Error(
      `${file} mixes ${arms.size} arms (${[...arms].join(", ")}). A tape is one arm. ` +
      `Concatenating arms averages a treatment with its control and reports the mean ` +
      `as a result.`);
  }
  return [...arms][0];
}

function report(t: TapeCase[], file: string): void {
  const arm = armOf(t, file);
  console.log(`\n${file}  ${t.length} case(s)  arm=${arm}`);
  const l = t[0].levers;
  for (const [k, v] of Object.entries(l)) console.log(`  ${k.padEnd(16)} ${v}`);
  assertReplayFidelity(t, (c) => c.outcome, reclassify, `offline classifier on ${file}`);
  console.log(`  EXACT@${WINDOW}  ${pct(t.filter(hit).length, t.length)}`);
  for (const line of taxonomyTable(t)) console.log(line);
}

function main() {
  const [a, b] = process.argv.slice(2);
  if (!a) throw new Error("usage: replay_tape.ts <tape.json> [control.json]");
  const A = load(a);
  report(A, a);
  if (!b) {
    console.log(`\nOne tape given, so no comparison. Pass a control tape as the second ` +
      `argument to get a paired McNemar.`);
    return;
  }
  const B = load(b);
  report(B, b);
  if (armOf(A, a) === armOf(B, b)) {
    throw new Error(
      `both tapes are arm ${armOf(A, a)}: the same treatment measured twice. ` +
      `A McNemar between an arm and itself measures the harness's own noise and ` +
      `reads exactly like a result.`);
  }

  // ── PAIRED, or not run at all ────────────────────────────────────────────
  // Only the cases present in BOTH tapes, matched on caseId. A case in one and
  // not the other is not evidence about either arm, and silently dropping it
  // into the denominator is how a change of SAMPLE gets reported as an effect.
  const byId = new Map(B.map((c) => [c.caseId, c]));
  const paired = A.filter((c) => byId.has(c.caseId));
  const lostA = A.length - paired.length;
  const lostB = B.length - paired.length;
  console.log(`\nPAIRED on caseId: ${paired.length} case(s)` +
    `${lostA || lostB ? `   (dropped ${lostA} from the treatment, ${lostB} from the control ` +
      `-- present in one tape only, so they say nothing about either arm)` : ""}`);
  if (!paired.length) {
    throw new Error(
      `the two tapes share no case. They are two different draws, not two arms, and ` +
      `no arithmetic separates a change of sample from an effect. Re-run both with ` +
      `the same SPLIT, SEED and N.`);
  }
  const r = mcnemar(paired, hit, (c) => hit(byId.get(c.caseId)!));
  console.log(`  treatment ${pct(paired.filter(hit).length, paired.length)}` +
    `   control ${pct(paired.filter((c) => hit(byId.get(c.caseId)!)).length, paired.length)}`);
  console.log(mcnemarLine("  EXACT@5:", r, "treatment", "control"));

  // Where the change landed, by failure class. A net-zero arm that moved
  // fifteen cases out of `not-retrieved` and fifteen into `wrong-family` is a
  // very different result from one that changed nothing, and the headline
  // cannot tell them apart.
  console.log(`\nWHERE IT MOVED, by failure class (treatment - control)`);
  const classes = [...new Set([...A, ...B].map((c) => c.outcome))];
  for (const k of classes) {
    const ta = paired.filter((c) => c.outcome === k).length;
    const tb = paired.filter((c) => byId.get(c.caseId)!.outcome === k).length;
    if (ta === tb) continue;
    console.log(`  ${k.padEnd(16)} ${String(tb).padStart(4)} -> ${String(ta).padStart(4)}` +
      `  (${ta - tb >= 0 ? "+" : ""}${ta - tb})`);
  }
  const flips = paired.filter((c) => c.outcome !== byId.get(c.caseId)!.outcome);
  console.log(`  ${flips.length} case(s) changed class; re-run any of them with ` +
    `CASE=<caseId>:`);
  for (const c of flips.slice(0, 8)) {
    console.log(`    ${byId.get(c.caseId)!.outcome} -> ${c.outcome}   ${c.caseId}`);
  }
}

main();
