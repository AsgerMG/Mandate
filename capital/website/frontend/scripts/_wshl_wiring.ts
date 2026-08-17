// wsHL — WHY CAN A FACT THE FOUNDER STATES NOT ACT?
//
// wsHG handed the product a genuinely different `useOfFunds` answer for 446 of
// 897 founders and the funnel moved five founders, `gates_pass` moved none. Its
// own reading was that the field's two live paths are "one inert and one nearly
// so". This asks WHICH WIRE IS CUT, on the pair evidence, offline and free.
//
// Three paths a `useOfFunds` answer can reach a founder through, and each is
// measured separately here because they fail for different reasons:
//
//   VERDICT     assessInstrument -> accessiblePool. Only `blocked` deletes a
//               row. `useOfFunds` is a CHOICE field (types.ts FIELD_SEVERITY),
//               so a failing useOfFunds gate is never conclusive on its own; it
//               needs a SECOND field failing beside it. The question this
//               answers is how often that second field is there.
//   GATE FIT    gateFitScorer, within a regime, on passed/checked. A per-leaf
//               pass RATIO over every field at once, so a useOfFunds flip is
//               1/n of the leaf's score and only acts when the ratio's order
//               inside the regime changes.
//   OBJECTIVE   objectiveScorer, on the REGISTERED purpose (__objectives.json,
//               the SATR register's aid_objective codes). Neutral unless a
//               group holds both matching and non-matching leaves.
//
// The cross-tab at the end is the finding: how many pairs does the ENCODED,
// QUOTED gate layer hold a differing useOfFunds demand for, where the REGISTER
// holds nothing — i.e. how much of this field's separating power is written in
// the funds' own words and read by no ranker.
//
// FREE. Postgres reads only. ANTHROPIC_API_KEY and VOYAGE_KEY are deleted
// before import: no paid call, no embedding, no write of any kind.
//
//   npx tsx scripts/_wshl_wiring.ts
//
// @ws-active until 2026-09-30
import { readFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
delete process.env.VOYAGE_KEY;
if (requireCredentials("wshl_wiring", ["DATABASE_URL"]) === "offline") {
  throw new Error(
    "_wshl_wiring: NO_PG deletes DATABASE_URL and serves the committed "
    + "snapshot, whose gate set is not the one the product reads. The whole "
    + "question here is what the SHIPPED gates decide.");
}

import {
  corpusProvenance, type DbGate, type DbInstrument, hydrateDbInstruments,
  hydrateGatesFor, loadDbInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { evaluateSpec, type ValueSpec } from "../lib/intelligence/comparator";
import { isFilter, specField } from "../lib/intelligence/evidenceTier";
import { gateFitScorer, objectiveScorer } from "../lib/intelligence/shortlist";
import { USE_OF_FUNDS_OPTIONS, type EligibilityAnswers } from "../lib/intelligence/types";
import { assessInstrument } from "../lib/intelligence/verdict";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { loadRecallSet, reattributeMissingAnswers, type RecallRow } from "./recallSet";

const PAIRS = process.env.PAIRS ?? path.join(
  process.cwd(), "..", "..", "project-mgmt", "evidence", "wsha_door_pairs_2026-08-17.jsonl");
const OPTS = USE_OF_FUNDS_OPTIONS.map((o) => o.value as string);
const PIN = ["industrial_research", "experimental_development"];

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");

/** Every useOfFunds FILTER gate on a leaf, after inheritance — the set the
 *  verdict engine actually reads. */
const uofGates = (i: DbInstrument): DbGate[] =>
  i.gates.filter((g) => isFilter(g) && specField(g) === "useOfFunds");

/** The demand a leaf makes on the field, as a stable string, so two leaves can
 *  be compared on WHAT THEY ASK rather than on how many rows say it. */
const demandKey = (i: DbInstrument) => uofGates(i)
  .map((g) => {
    const s = g.valueSpec as ValueSpec;
    return `${s.op}:${[...(s.allowed ?? [])].sort().join("|")}`;
  })
  .sort().join(" & ");

interface Pair {
  founder: string; regime: string; won: string; shown: string;
}

function main() {
  const rows = readFileSync(PAIRS, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as {
      founder: string; regime: string; won: { id: string }; shown: { id: string };
    });
  const pairs: Pair[] = rows.map((r) => ({
    founder: r.founder, regime: r.regime, won: r.won.id, shown: r.shown.id,
  }));

  return (async () => {
    await hydrateDbInstruments();
    requireLiveCorpus("wshl_wiring");
    const ids = [...new Set(pairs.flatMap((p) => [p.won, p.shown]))];
    await hydrateGatesFor(ids);
    const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));

    console.log("# wsHL — which of the three wires carries a stated useOfFunds\n");
    console.log("```");
    console.log(`corpus              ${corpusProvenance().source} instruments=${byId.size}`);
    console.log(`pairs               ${pairs.length}   (wsHA's own door pairs)`);
    console.log("```\n");

    // ── 0. THE CORPUS FACT: what the field is asked for, and by whom ────────
    let gateRows = 0; const gateInst = new Set<string>();
    const demands = new Map<string, number>();
    for (const i of loadDbInstruments()) {
      const gs = uofGates(i);
      if (!gs.length) continue;
      gateInst.add(i.id); gateRows += gs.length;
      for (const g of gs) {
        const s = g.valueSpec as ValueSpec;
        demands.set(`${s.op} [${[...(s.allowed ?? [])].sort().join(", ")}]`,
          (demands.get(`${s.op} [${[...(s.allowed ?? [])].sort().join(", ")}]`) ?? 0) + 1);
      }
    }
    console.log("## 0. What the corpus asks of this field\n");
    console.log("```");
    console.log(`useOfFunds FILTER gates      ${gateRows} on ${gateInst.size} instrument(s)`);
    console.log(`registered purposes          ${Object.keys(
      JSON.parse(readFileSync(path.join(process.cwd(), "lib", "intelligence",
        "__objectives.json"), "utf8"))).length} instrument(s) (__objectives.json)`);
    console.log("\nthe ten commonest demands, and whether the PIN clears each");
    for (const [d, n] of [...demands].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      const [op, rest] = [d.slice(0, d.indexOf(" ")), d.slice(d.indexOf("[") + 1, -1)];
      const allowed = rest.split(", ").filter(Boolean);
      const v = evaluateSpec({ op, field: "useOfFunds", allowed } as ValueSpec, PIN);
      console.log(`  ${String(n).padStart(4)}  ${v === null ? "—   " : v ? "PASS" : "FAIL"}  ${d}`);
    }
    console.log("```\n");

    // ── 1. THE FOUNDERS, RE-DERIVED (deterministic, offline, free) ──────────
    const { rows: all } = loadRecallSet("wsHL wiring");
    const inCorpus = new Set(loadDbInstruments().map((i) => i.id));
    const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), () => true);
    const byName = new Map<string, RecallRow>();
    for (const r of fixed.rows) if (!byName.has(r.name)) byName.set(r.name, r);
    const policy = founderPolicyFromEnv();

    // ── 2. THE THREE WIRES, PAIR BY PAIR ───────────────────────────────────
    // Under each candidate answer, does anything the founder would FEEL change?
    let carried = 0, differs = 0, sameDemand = 0;
    let verdictMoves = 0, verdictCouldMove = 0;
    let fitMoves = 0, fitFlat = 0;
    let objHasOpinion = 0;
    let uofFailPin = 0, uofFailAndBlocked = 0, uofFailAlone = 0;
    let noFounder = 0;
    const blockedBySecondField = new Map<string, number>();
    const objSilentGateSpeaks: Pair[] = [];

    for (const p of pairs) {
      const won = byId.get(p.won), shown = byId.get(p.shown);
      if (!won || !shown) continue;
      const gw = uofGates(won), gs = uofGates(shown);
      if (gw.length || gs.length) carried++;
      const dw = demandKey(won), ds = demandKey(shown);
      if (dw !== ds) differs++; else if (gw.length) sameDemand++;

      const r = byName.get(p.founder);
      if (!r) { noFounder++; continue; }
      const base = founderIntake(r, policy).eligibility;

      // ── WIRE 1: THE VERDICT ──────────────────────────────────────────────
      // Does ANY answer a founder could give change either door's status?
      const statusUnder = (answer: string[]) => [won, shown].map(
        (i) => assessInstrument(i, { ...base, useOfFunds: answer }).status).join("/");
      const pinStatus = statusUnder(PIN);
      const reached = new Set([pinStatus]);
      for (const o of OPTS) reached.add(statusUnder([o]));
      if (dw !== ds || gw.length || gs.length) verdictCouldMove++;
      if (reached.size > 1) verdictMoves++;

      // Where a failing useOfFunds gate LANDS: alone it is `one_blocker` and
      // the row survives; it only removes a fund when a second field fails too.
      for (const i of [won, shown]) {
        const a = assessInstrument(i, base);
        const uof = a.blockers.filter((b) => b.field === "useOfFunds");
        if (!uof.length) continue;
        uofFailPin++;
        const others = new Set(a.blockers.filter((b) => b.field !== "useOfFunds"
          && !b.borrowed).map((b) => b.field));
        if (a.status === "blocked") {
          uofFailAndBlocked++;
          for (const f of others) {
            blockedBySecondField.set(f, (blockedBySecondField.get(f) ?? 0) + 1);
          }
        } else uofFailAlone++;
      }

      // ── WIRE 2: GATE FIT ─────────────────────────────────────────────────
      const fitUnder = (answer: string[]) => {
        const f = gateFitScorer([won, shown], { ...base, useOfFunds: answer });
        return `${f(won).toFixed(6)}/${f(shown).toFixed(6)}`;
      };
      const fitReached = new Set([fitUnder(PIN), ...OPTS.map((o) => fitUnder([o]))]);
      if (fitReached.size > 1) fitMoves++; else fitFlat++;

      // ── WIRE 3: THE REGISTER ─────────────────────────────────────────────
      const objUnder = (answer: string[]) => {
        const f = objectiveScorer([won.id, shown.id], answer);
        return f(won.id) !== f(shown.id);
      };
      const objAny = [PIN, ...OPTS.map((o) => [o])].some(objUnder);
      if (objAny) objHasOpinion++;
      // The cross-tab that is the point: the register is SILENT and the fund's
      // own encoded text is not.
      if (!objAny && dw !== ds) objSilentGateSpeaks.push(p);
    }

    const n = pairs.length;
    console.log("## 1. Does the pair carry a useOfFunds demand at all\n");
    console.log("```");
    console.log(`at least one door carries a useOfFunds FILTER gate   ${carried}  ${pct(carried, n)}`);
    console.log(`  ...and the two doors DEMAND DIFFERENT THINGS       ${differs}  ${pct(differs, n)}`);
    console.log(`  ...both doors make the SAME demand (separates 0)   ${sameDemand}  ${pct(sameDemand, n)}`);
    console.log(`founders not in the recall set (skipped)            ${noFounder}`);
    console.log("```\n");

    console.log("## 2. The three wires — can ANY answer move each\n");
    console.log("```");
    console.log(`VERDICT   a pair where some answer changes a door's STATUS      ${verdictMoves}  ${pct(verdictMoves, n)}`);
    console.log(`          (pairs where a useOfFunds gate exists to move it)      ${verdictCouldMove}`);
    console.log(`GATE FIT  a pair where some answer changes gateFitScorer         ${fitMoves}  ${pct(fitMoves, n)}`);
    console.log(`          flat under every one of the nine answers               ${fitFlat}`);
    console.log(`REGISTER  a pair where some answer gives objectiveScorer an      ${objHasOpinion}  ${pct(objHasOpinion, n)}`);
    console.log(`          opinion (registered purpose differs and is matchable)`);
    console.log("```\n");

    console.log("## 3. Where a FAILING useOfFunds gate lands, under the pin\n");
    console.log("```");
    console.log(`doors whose useOfFunds gate FAILS the pin           ${uofFailPin}`);
    console.log(`  the door is BLOCKED (a second field fails too)    ${uofFailAndBlocked}`);
    console.log(`  the door survives as one_blocker/open             ${uofFailAlone}   <- the answer is collected and the row is kept`);
    if (blockedBySecondField.size) {
      console.log("\n  the second field, where there was one");
      for (const [f, c] of [...blockedBySecondField].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${f.padEnd(24)} ${c}`);
      }
    }
    console.log("```\n");

    console.log("## 4. THE CROSS-TAB — the register is silent, the fund's own text is not\n");
    console.log("```");
    console.log(`pairs where objectiveScorer can NEVER have an opinion,`);
    console.log(`but the two doors' own ENCODED gates demand different things:  `
      + `${objSilentGateSpeaks.length}  ${pct(objSilentGateSpeaks.length, n)}`);
    for (const p of objSilentGateSpeaks.slice(0, 12)) {
      const won = byId.get(p.won)!, shown = byId.get(p.shown)!;
      console.log(`  ${p.regime.padEnd(22)} won: ${demandKey(won) || "(none)"}`);
      console.log(`  ${"".padEnd(22)} shown: ${demandKey(shown) || "(none)"}`);
    }
    console.log("```");
  })();
}

void main();
