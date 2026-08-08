// DO GATES TELL SIBLINGS APART, ONCE FOUNDERS STOP BEING DESCRIBED IDENTICALLY?
//
// The binding factor in EXACT@5 is the LEAF choice: 57% of replayed founders
// get the right programme on screen and the wrong scheme inside it
// (project-mgmt/findings/predictability_wsAM.md §3). Gates are the obvious
// candidate to break that tie -- 6,401 of them exist, cut from the eligibility
// text, and unlike similarity they state CONDITIONS a founder can be checked
// against.
//
// They were measured once and judged inert: "won fund 62% pass vs pool 63%".
// That measurement is not safe, because the harness fed every replayed founder
// IDENTICAL intake answers. A discriminator cannot discriminate between
// founders who are described identically. `ANSWERS=` (recallSet.ts) fixes the
// input; this measures whether the conclusion survives it.
//
// TWO QUESTIONS, in order, because the first can kill the second outright:
//
//   1. STRUCTURE. Can gate fit vary within a regime AT ALL? If siblings
//      inherit their regime's gates, every leaf of that regime carries the
//      same rules, gate fit is constant across them BY CONSTRUCTION, and no
//      intake answer whatsoever can separate them. That would be a structural
//      refutation and it needs no replay to establish.
//
//   2. DISCRIMINATION. Where gate fit CAN vary, does it rank the leaf the
//      company actually won above its siblings, better than chance?
//
// Reported against the uniform baseline (1 / group size) rather than against
// 50%, because a regime of fourteen and a regime of two are different bets and
// an aggregate over both is not readable.
//
//   npx tsx scripts/measure_gate_separation.ts
//   ANSWERS=real npx tsx scripts/measure_gate_separation.ts
import { loadEnvLocal } from "./loadEnv";
loadEnvLocal();

import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, publishableInstruments,
  requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { assessInstrument, VERDICT_RANK } from "../lib/intelligence/verdict";
import {
  answersFor, assertAncestorConvention, loadRecallSet, partitionByOfferable,
  reattributeMissingAnswers, type AnswerMode, type RecallRow,
} from "./recallSet";

/** A leaf's gate fit for one founder, as an ORDER, not a percentage.
 *
 *  Ranked the way the product already ranks verdicts (VERDICT_RANK: open, then
 *  one_blocker, then unknown, then blocked), and only then by how much of the
 *  leaf's own rule set we could actually check. Using the pass RATE alone is
 *  what produced "62% vs 63%": a leaf with one checkable rule that passes
 *  scores 100% and says almost nothing, while a leaf with nine checked and
 *  eight passed says a great deal and scores lower. */
function gateFit(a: ReturnType<typeof assessInstrument>): number[] {
  switch (process.env.FIT ?? "full") {
    // ── THE NULL MODEL, and the reason this script has a FIT switch ────────
    // `checked` counts the rules we could EVALUATE, saying nothing about
    // whether the founder passed them. It is a measure of how well documented
    // a leaf is, not of whether the founder qualifies for it.
    //
    // It has to be measured, because the corpus makes it a live confound: 22%
    // of decidable filters are a leaf's own and the rest are inherited, so the
    // leaves that differ from their siblings differ mostly by how much has
    // been encoded about them -- and the biggest, best-documented leaf of a
    // regime is also the one most companies win. A "gate fit" signal that
    // beats chance by exactly as much as this does is a size prior wearing an
    // eligibility costume, and shipping it would be the objective-prior
    // mistake again.
    case "checked": return [a.checked];
    // Pass RATE, ignoring how much was checked. This is the shape of the
    // statistic behind the original "62% vs 63%" verdict, kept so the old
    // reading can be reproduced rather than argued with.
    case "passrate": return [a.checked ? a.passed / a.checked : 0];
    // What the product would actually rank on: the verdict tier it already
    // uses, then how many of the leaf's rules the founder clears.
    default: return [-VERDICT_RANK[a.status], a.passed, a.checked, -a.blockers.length];
  }
}

const cmp = (x: number[], y: number[]) => {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
  return 0;
};

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("measure_gate_separation");
  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const regimeOf = (id: string) => (byId.get(id) as any)?.parentId ?? id;

  // Publishable siblings only: a leaf the product may not offer is not a leaf
  // the ranker could have chosen, and counting it would inflate the group the
  // chooser is credited with ordering.
  const siblings = new Map<string, string[]>();
  for (const i of corpus) {
    if (!offerable.has(i.id)) continue;
    const r = regimeOf(i.id);
    siblings.set(r, [...(siblings.get(r) ?? []), i.id]);
  }

  const { rows: all } = loadRecallSet();
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  const holdout = (pop.graded as RecallRow[]).filter((r) => r.split === "holdout");

  // Gates are lazily hydrated. Every leaf of every regime a holdout pair can
  // reach has to be in memory before anything is assessed, or a leaf reads as
  // "no rules" purely because nobody fetched them.
  const needed = new Set<string>();
  for (const r of holdout) for (const id of siblings.get(regimeOf(r.instrument)) ?? []) needed.add(id);
  await hydrateGatesFor([...needed]);
  console.log(`hydrated gates for ${needed.size} leaves reachable from holdout pairs`);

  // ── 1. STRUCTURE ─────────────────────────────────────────────────────────
  // Can gate fit vary within a regime at all? Answered off the corpus alone.
  let regimesMulti = 0, regimesIdenticalGates = 0, leavesInMulti = 0;
  let gatesTotal = 0, gatesInherited = 0, gatesFilterSpec = 0, gatesFilterSpecOwn = 0;
  for (const [, ids] of siblings) {
    if (ids.length < 2) continue;
    regimesMulti++;
    leavesInMulti += ids.length;
    const sig = new Set(ids.map((id) => {
      const inst = byId.get(id)!;
      // The rule SET a leaf would be judged on: only triaged filters carrying
      // a spec can decide anything, so two leaves differing solely in
      // obligations or programme facts are identical for this purpose.
      return (inst.gates ?? [])
        .filter((g: any) => (!g.gateRole || g.gateRole === "filter") && g.valueSpec)
        .map((g: any) => `${g.id}:${JSON.stringify(g.valueSpec)}`)
        .sort().join("|");
    }));
    if (sig.size === 1) regimesIdenticalGates++;
  }
  for (const id of needed) {
    const inst = byId.get(id)!;
    for (const g of (inst.gates ?? []) as any[]) {
      gatesTotal++;
      if (g.inherited) gatesInherited++;
      if ((!g.gateRole || g.gateRole === "filter") && g.valueSpec) {
        gatesFilterSpec++;
        if (!g.inherited) gatesFilterSpecOwn++;
      }
    }
  }
  console.log(`\n1. STRUCTURE -- can gate fit vary within a regime at all?`);
  console.log(`  multi-leaf publishable regimes                 ${regimesMulti} (${leavesInMulti} leaves)`);
  console.log(`  ...whose leaves carry an IDENTICAL rule set    ${regimesIdenticalGates}` +
              ` (${(100 * regimesIdenticalGates / regimesMulti).toFixed(0)}%)`);
  console.log(`  gates on reachable leaves                      ${gatesTotal}`);
  console.log(`  ...inherited from the regime                   ${gatesInherited}` +
              ` (${(100 * gatesInherited / Math.max(1, gatesTotal)).toFixed(0)}%)`);
  console.log(`  ...decidable filters (role=filter + valueSpec) ${gatesFilterSpec}`);
  console.log(`  ......of which the leaf's OWN, not inherited   ${gatesFilterSpecOwn}` +
              ` (${(100 * gatesFilterSpecOwn / Math.max(1, gatesFilterSpec)).toFixed(0)}%)`);

  // ── 2. DISCRIMINATION ────────────────────────────────────────────────────
  const mode = (process.env.ANSWERS ?? "off") as AnswerMode;
  const buckets = new Map<string, {
    n: number; top1: number; uniform: number; separated: number; sepTop1: number; sepUniform: number;
  }>();
  const add = (k: string, sep: boolean, top1: boolean, u: number) => {
    const b = buckets.get(k) ?? { n: 0, top1: 0, uniform: 0, separated: 0, sepTop1: 0, sepUniform: 0 };
    b.n++; b.uniform += u; if (top1) b.top1++;
    if (sep) { b.separated++; b.sepUniform += u; if (top1) b.sepTop1++; }
    buckets.set(k, b);
  };
  // The statistic the original "gates do nothing" verdict was expressed in,
  // recomputed on the same rows so the two are comparable rather than merely
  // both present.
  let wonChecked = 0, wonPassed = 0, sibChecked = 0, sibPassed = 0;

  for (const r of holdout) {
    const group = siblings.get(regimeOf(r.instrument)) ?? [];
    if (group.length < 2 || !group.includes(r.instrument)) continue;
    const a = answersFor(r, mode);
    const answers = {
      entityCountries: [r.country], sector: r.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: a.region,
    } as never;

    const scored = group.map((id) => {
      const as = assessInstrument(byId.get(id)!, answers);
      return { id, fit: gateFit(as), as };
    });
    for (const s of scored) {
      if (s.id === r.instrument) { wonChecked += s.as.checked; wonPassed += s.as.passed; }
      else { sibChecked += s.as.checked; sibPassed += s.as.passed; }
    }
    // "Separated" = gate fit is not constant across the group. Where it is
    // constant the signal is silent, and a silent signal that is scored as a
    // uniform draw looks like a weak signal instead of like no signal.
    const sep = new Set(scored.map((s) => s.fit.join(","))).size > 1;
    const best = [...scored].sort((x, y) => cmp(x.fit, y.fit));
    const bestFit = best[0].fit.join(",");
    const tied = best.filter((s) => s.fit.join(",") === bestFit);
    // Credit a tie as 1/|tie|, never as a win: a chooser that cannot break the
    // tie has not chosen, and rounding that up is how a flat signal reads as
    // a working one.
    const top1 = tied.some((s) => s.id === r.instrument) ? 1 / tied.length : 0;
    const u = 1 / group.length;
    const sizeKey = group.length <= 2 ? "regime 2" : group.length <= 5 ? "regime 3-5"
      : group.length <= 20 ? "regime 6-20" : group.length <= 50 ? "regime 21-50" : "regime 51+";
    for (const k of ["ALL", `mode=${r.mode}`, sizeKey, `country=${r.country}`]) {
      const b = buckets.get(k) ?? { n: 0, top1: 0, uniform: 0, separated: 0, sepTop1: 0, sepUniform: 0 };
      b.n++; b.uniform += u; b.top1 += top1;
      if (sep) { b.separated++; b.sepUniform += u; b.sepTop1 += top1; }
      buckets.set(k, b);
    }
    void add;
  }

  console.log(`\n2. DISCRIMINATION -- answers=${mode}`);
  console.log(`  the pass-rate statistic the original verdict used:`);
  console.log(`    won fund   ${wonPassed}/${wonChecked} ` +
              `(${(100 * wonPassed / Math.max(1, wonChecked)).toFixed(0)}%)`);
  console.log(`    siblings   ${sibPassed}/${sibChecked} ` +
              `(${(100 * sibPassed / Math.max(1, sibChecked)).toFixed(0)}%)`);
  console.log(`\n  within-regime TOP-1 by gate fit, against the uniform baseline:`);
  const order = ["ALL", "mode=profile", "mode=project", "regime 2", "regime 3-5",
    "regime 6-20", "regime 21-50", "regime 51+"];
  const keys = [...order.filter((k) => buckets.has(k)),
    ...[...buckets.keys()].filter((k) => k.startsWith("country=")).sort()];
  console.log(`    ${"bucket".padEnd(20)} ${"n".padStart(5)} ${"top1".padStart(7)} ` +
              `${"uniform".padStart(8)} ${"lift".padStart(7)}   ${"separated".padStart(9)} ` +
              `${"top1|sep".padStart(9)} ${"unif|sep".padStart(9)}`);
  for (const k of keys) {
    const b = buckets.get(k)!;
    const t = 100 * b.top1 / b.n, u = 100 * b.uniform / b.n;
    const st = b.separated ? 100 * b.sepTop1 / b.separated : 0;
    const su = b.separated ? 100 * b.sepUniform / b.separated : 0;
    console.log(`    ${k.padEnd(20)} ${String(b.n).padStart(5)} ${t.toFixed(1).padStart(6)}% ` +
                `${u.toFixed(1).padStart(7)}% ${(t - u).toFixed(1).padStart(6)}pp   ` +
                `${String(b.separated).padStart(9)} ${st.toFixed(1).padStart(8)}% ${su.toFixed(1).padStart(8)}%`);
  }
}
main();
