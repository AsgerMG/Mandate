// wsGA — WHAT ~10 DOLLARS BUYS, PRICED FROM THE RECORD AND NOT FROM THE API.
//
// FREE. No model call, no Postgres, no embedding. It reads four things that are
// already on disk and does arithmetic:
//
//   1. the per-call euro figures recorded by four earlier PAID runs;
//   2. the DISCORDANCE RATE measured on the only head-to-head this project has
//      ever run (wsDR, n=45, seam=late, effort=low) — read out of its own
//      committed JSON rather than retyped;
//   3. McNemar's exact test, from `_wsga_stats.ts`, which is the same module the
//      harness itself uses to decide the result;
//   4. the budget.
//
// ── WHY THE DISCORDANCE RATE IS THE WHOLE ANSWER ──────────────────────────
// McNemar sees ONLY the pairs on which the two arms disagree. Every founder
// where both arms hit, and every founder where both miss, contributes exactly
// nothing to the test however much it cost. On the late seam the model permutes
// eighteen rows the score already chose, so on a founder whose won fund is not
// in those eighteen NEITHER ARM CAN WIN — the pair is a guaranteed concordant
// miss and the euro spent on it buys no information at all.
//
// That is not a modelling assumption. wsDR measured it: 31 of its 45 founders
// had no answer in the pool, and the whole run produced THREE discordant pairs.
//
//   npx tsx scripts/_wsga_plan.ts
import { readFileSync } from "fs";
import path from "path";

import {
  criticalAb, mcnemarFrom2x2, mdePowered, piForGain, powerAt,
} from "./_wsga_stats";

/** Per-call euros, every one of them from a run that actually happened.
 *  Sources are named because a price nobody can trace is a price somebody will
 *  quietly revise. */
const PRICE_EUR: { effort: string; eur: number; source: string }[] = [
  { effort: "off", eur: 0.0214, source: "wsDS curve n=36 (thinking disabled — the setting, not the absence of a setting)" },
  { effort: "low", eur: 0.0228, source: "wsDR recall n=45x2 seams, the richest measured menus at this level" },
  { effort: "medium", eur: 0.0292, source: "wsDS curve n=36" },
  { effort: "high", eur: 0.0776, source: "wsDS bench n=12 (0.0531 on the leaner curve menus; the higher figure is used deliberately)" },
];

/** Today's menus are RICHER than every price above was measured on, and the
 *  reply is longer. Two committed changes since:
 *    wsFG  a row that holds any requirement now prints one — requirements
 *          printed across one founder's fourteen menus went 271 -> 407 (+50%).
 *    wsEN  SELECT_COUNT went 6 -> 7, so the reply names one more index.
 *  Input is ~85% of the bill at `low` and ~15% at `high`, so the uplift is not
 *  uniform; a flat multiplier is the conservative simplification and it is
 *  stated rather than hidden. */
const MENU_UPLIFT = 1.25;

/** USD ~ EUR, using cost.ts's own fixed rate so this file cannot disagree with
 *  the accumulator the run will report. */
const USD_TO_EUR = 0.92;
const BUDGET_USD = 10;
const BUDGET_EUR = BUDGET_USD * USD_TO_EUR;

/** The only head-to-head this project has run, read from its own artifact. */
function measuredDiscordance(): {
  n: number; inPool: number;
  at: Record<number, { off: number; on: number; b: number; c: number }>;
} {
  const p = path.join(process.cwd(), "..", "..", "project-mgmt", "findings",
    "seam_wsDR", "recall.json");
  const rows = JSON.parse(readFileSync(p, "utf8")) as {
    offWonInPool: boolean | null; offWonRank: number | null;
    late: { wonRank: number | null };
  }[];
  const keyed = rows.filter((r) => r.offWonInPool != null);
  const at: Record<number, { off: number; on: number; b: number; c: number }> = {};
  for (const k of [5, 6]) {
    const hit = (v: number | null) => v != null && v <= k;
    let b = 0, c = 0;
    for (const r of keyed) {
      const o = hit(r.offWonRank), l = hit(r.late.wonRank);
      if (!o && l) b++; else if (o && !l) c++;
    }
    at[k] = {
      off: keyed.filter((r) => hit(r.offWonRank)).length,
      on: keyed.filter((r) => hit(r.late.wonRank)).length, b, c,
    };
  }
  return {
    n: keyed.length,
    inPool: keyed.filter((r) => r.offWonInPool).length,
    at,
  };
}

function main() {
  const m = measuredDiscordance();
  const L: string[] = [];
  const p = (s = "") => L.push(s);

  p("## The one head-to-head on the record — wsDR, n=45, seam=late, effort=low");
  p();
  p("```");
  p(`founders with an answer key      ${m.n}`);
  p(`won fund in the 18-row pool      ${m.inPool}/${m.n} = ${((100 * m.inPool) / m.n).toFixed(1)}%`);
  p(`   ^ THIS IS THE CEILING OF BOTH ARMS. On the other ${m.n - m.inPool} founders the`);
  p("     model permutes rows that do not contain the answer, so the pair is a");
  p("     concordant miss by construction and buys nothing.");
  p();
  for (const k of [5, 6]) {
    const a = m.at[k];
    const t = mcnemarFrom2x2(a.b, a.c);
    p(`EXACT@${k}   control ${a.off}/${m.n} (${((100 * a.off) / m.n).toFixed(1)}%)   ` +
      `ranker ${a.on}/${m.n} (${((100 * a.on) / m.n).toFixed(1)}%)`);
    p(`          discordant b=${a.b} c=${a.c}  ->  ${t.discordant} pairs, McNemar exact p=${t.p.toFixed(3)}, ` +
      `delta ${a.b - a.c >= 0 ? "+" : ""}${((100 * (a.b - a.c)) / m.n).toFixed(1)} pts`);
    p(`          DISCORDANCE RATE d = ${((100 * t.discordant) / m.n).toFixed(1)}% of all pairs, ` +
      `${((100 * t.discordant) / m.inPool).toFixed(1)}% of the in-pool pairs`);
  }
  p("```");
  p();
  p(`At m=${m.at[5].b + m.at[5].c} discordant pairs no split is significant: the smallest ` +
    `b that reaches p<=0.05 at m=3 is ${criticalAb(3) ?? "NONE — no split of three pairs can"}.`);
  p();

  p("## What the budget buys, by effort");
  p();
  p(`Budget ${BUDGET_USD} USD = EUR ${BUDGET_EUR.toFixed(2)} at cost.ts's own fixed rate. ` +
    `One PAID call per founder: the control is our own scoring and is free.`);
  p(`Prices are the recorded ones x ${MENU_UPLIFT} for today's wider menus and the seventh seat.`);
  p();
  p("| effort | EUR/call recorded | EUR/call today | n it buys | source |");
  p("|---|---:|---:|---:|---|");
  const plans: { effort: string; n: number; eur: number }[] = [];
  for (const row of PRICE_EUR) {
    const today = row.eur * MENU_UPLIFT;
    const n = Math.floor(BUDGET_EUR / today);
    plans.push({ effort: row.effort, n, eur: today });
    p(`| ${row.effort} | ${row.eur.toFixed(4)} | ${today.toFixed(4)} | **${n}** | ${row.source} |`);
  }
  p();
  p("`xhigh` and `max` have never been run. They are not priced here, because an ");
  p("extrapolation quoted beside four measurements reads like a fifth measurement.");
  p();

  p("## What that n can DETECT — McNemar exact, alpha 0.05, power 0.80");
  p();
  p("Two sampling designs, and the difference between them is the whole of this brief.");
  p();
  p("- **UNCONDITIONED** — draw founders, call the model on every one. ");
  p(`  d = ${((100 * (m.at[5].b + m.at[5].c)) / m.n).toFixed(1)}% at @5, ` +
    `${((100 * (m.at[6].b + m.at[6].c)) / m.n).toFixed(1)}% at @6.`);
  p("- **CONDITIONED ON THE CEILING** — build the pool first (FREE: one embedding");
  p("  and one Postgres read), and spend a model call ONLY where the won fund is");
  p("  in the eighteen rows the model is about to permute. Both arms then have a");
  p("  100% ceiling by construction, and the discordance rate is the in-pool one,");
  p(`  ${((100 * (m.at[5].b + m.at[5].c)) / m.inPool).toFixed(1)}% at @5 and ` +
    `${((100 * (m.at[6].b + m.at[6].c)) / m.inPool).toFixed(1)}% at @6 — about three times higher.`);
  p();
  p("The conditioning variable is fixed BEFORE either arm runs and is identical for");
  p("both, so this is a change of estimand and not a choice made after seeing data:");
  p("it measures 'given the score put the answer in front of the model, does the");
  p("model find it more often than the score does'. The population figure is");
  p("recovered by multiplying by the in-pool rate, which is measured free at full n.");
  p();
  const inPoolRate = m.inPool / m.n;
  for (const [label, dAt5, dAt6, scale] of [
    ["unconditioned", (m.at[5].b + m.at[5].c) / m.n, (m.at[6].b + m.at[6].c) / m.n, 1],
    ["conditioned on the ceiling", (m.at[5].b + m.at[5].c) / m.inPool,
      (m.at[6].b + m.at[6].c) / m.inPool, inPoolRate],
  ] as [string, number, number, number][]) {
    p(`### ${label}`);
    p();
    p("| effort | paid calls | discordant m@5 | MDE@5 | as a POPULATION gain | m@6 | MDE@6 | as a POPULATION gain |");
    p("|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const pl of plans) {
      const cell = (d: number) => {
        const mm = Math.round(pl.n * d);
        const r = mdePowered(pl.n, d);
        if (r === null) {
          return [`${mm}`, criticalAb(mm) === null
            ? "**IMPOSSIBLE** — no split of these pairs reaches p<=0.05"
            : "not reachable at 80%", "—"];
        }
        return [`${mm}`, `+${r.pointsGain.toFixed(1)} pts`,
          `**+${(r.pointsGain * scale).toFixed(1)} pts**`];
      };
      const [m5, e5, s5] = cell(dAt5);
      const [m6, e6, s6] = cell(dAt6);
      p(`| ${pl.effort} | ${pl.n} | ${m5} | ${e5} | ${s5} | ${m6} | ${e6} | ${s6} |`);
    }
    p();
  }
  p("The LAST column of each table is the only one that compares across designs.");
  p("A conditioned run reports a gain on the in-pool sub-population; multiplying by");
  p(`the in-pool rate (${(100 * inPoolRate).toFixed(1)}% on wsDR's draw) puts it back in the units the`);
  p("unconditioned run reports, which is what a floor and a headline are both in.");
  p();
  p("██ Conditioning is worth about a factor of 1.6 on the detectable effect, and it");
  p("is free: the conditioning variable is computed by the SAME free pool build both");
  p("arms already need. It is the difference between a run that can see the largest");
  p("effect ever measured on this arm and one that cannot. ██");
  p();

  p("## The measured effect, for scale");
  p();
  const pts = (k: number) => (100 * (m.at[k].b - m.at[k].c)) / m.n;
  p(`wsDR measured **${pts(5) >= 0 ? "+" : ""}${pts(5).toFixed(1)} points at @5** and ` +
    `**${pts(6) >= 0 ? "+" : ""}${pts(6).toFixed(1)} points at @6** for the late seam.`);
  p("wsDS ran the same arm at four thinking levels on n=36 and the metric did not");
  p("move at all (MEMO@6 13.9 / 16.7 / 16.7 / 13.9 at off/low/medium/high), while");
  p("the SHIPPED order — measured by accident when the API credit ran out mid-run —");
  p("read 19.4 and beat every one of them.");
  p();
  p("So a run whose MDE is larger than about 3 points cannot distinguish 'the ranker");
  p("is worth having' from 'the ranker does nothing', because nothing anybody has");
  p("measured on this arm is bigger than that.");
  p();

  p("## Power at the effect sizes that are actually in play");
  p();
  // ── THE PLAN, ON TODAY'S MEASURED CEILING RATHER THAN wsDR'S ─────────────
  // Read from the FREE control run if it has been made. Everything above is
  // priced on wsDR's 45 founders; this section is priced on the whole eligible
  // population, measured today, at no cost.
  const ceilingFile = path.join(process.cwd(), "..", "..", "project-mgmt", "findings",
    "headtohead_wsGA", "off_low_n324.json");
  let today: {
    n: number; inPool: number; c5: number; c6: number;
  } | null = null;
  try {
    const j = JSON.parse(readFileSync(ceilingFile, "utf8")) as {
      rows: { ceilingControl: boolean; rankControl: number | null }[];
    };
    const ip = j.rows.filter((r) => r.ceilingControl);
    today = {
      n: j.rows.length, inPool: ip.length,
      c5: ip.filter((r) => r.rankControl != null && r.rankControl <= 5).length,
      c6: ip.filter((r) => r.rankControl != null && r.rankControl <= 6).length,
    };
  } catch { /* the free control run has not been made yet */ }

  if (today) {
    const d5 = (m.at[5].b + m.at[5].c) / m.inPool;
    const r = mdePowered(today.inPool, d5);
    const mm = Math.round(today.inPool * d5);
    p("## ██ THE PLAN, on today's measured ceiling ██");
    p();
    p("```");
    p(`eligible population (tune, cross-regime described, graded)   ${today.n}`);
    p(`   ^ EXHAUSTED. There is no larger draw available on this provenance.`);
    p(`won fund inside the ${18}-row pool                            ` +
      `${today.inPool}/${today.n} = ${((100 * today.inPool) / today.n).toFixed(1)}%`);
    p(`control EXACT@5 on those ${today.inPool}                              ` +
      `${today.c5}/${today.inPool} = ${((100 * today.c5) / today.inPool).toFixed(1)}%`);
    p(`   ^ so ${today.inPool - today.c5} founders the ranker could FIX, and ` +
      `${today.c5} it could BREAK.`);
    p("");
    p(`paid calls at ONLY_IN_POOL=1, REPEAT=2                       ${2 * today.inPool}`);
    for (const pl of plans) {
      const cost = 2 * today.inPool * pl.eur;
      p(`   effort ${pl.effort.padEnd(7)} EUR ${cost.toFixed(2).padStart(6)} = ` +
        `${(cost / USD_TO_EUR).toFixed(2).padStart(6)} USD` +
        (cost <= BUDGET_EUR ? "   fits" : "   OVER BUDGET"));
    }
    p("");
    p(`expected discordant pairs at the in-pool rate ${(100 * d5).toFixed(1)}%          ` +
      `${mm}`);
    p(`smallest ab of ${mm} that reaches p<=0.05                      ` +
      `${criticalAb(mm) ?? "NONE"}`);
    p(`MDE at 80% power, on the in-pool sub-population              ` +
      `${r ? `+${r.pointsGain.toFixed(1)} pts` : "unreachable"}`);
    p(`   ... expressed as a POPULATION EXACT@5 gain                ` +
      `${r ? `+${(r.pointsGain * today.inPool / today.n).toFixed(1)} pts` : "—"}`);
    p("```");
    p();
    p(`The in-pool discordance rate of ${(100 * d5).toFixed(1)}% is itself measured on FOURTEEN`);
    p("founders. Its own 95% interval runs from roughly 5% to 51%, so the discordant");
    p("count above could plausibly be anywhere from 6 to 60. At the low end the run");
    p("is inconclusive by rule whatever it costs, and that risk cannot be priced away —");
    p("it can only be reported.");
    p();
  }

  p("| design | effort | n | m@5 | power at +2 pts | +4 pts | +6 pts | +10 pts |");
  p("|---|---|---:|---:|---:|---:|---:|---:|");
  for (const [label, d] of [
    ["unconditioned", (m.at[5].b + m.at[5].c) / m.n],
    ["conditioned", (m.at[5].b + m.at[5].c) / m.inPool],
  ] as [string, number][]) {
    for (const pl of plans) {
      const mm = Math.round(pl.n * d);
      const cells = [2, 4, 6, 10].map((gain) => {
        // gain in points = m(2pi-1)/n  =>  pi = 0.5 + gain*n/(200m)
        const pi = piForGain(gain, mm, pl.n);
        if (pi === null) return "n/a";
        return `${(100 * powerAt(mm, pi)).toFixed(0)}%`;
      });
      p(`| ${label} | ${pl.effort} | ${pl.n} | ${mm} | ${cells.join(" | ")} |`);
    }
  }
  p();
  console.log(L.join("\n"));
}

main();
