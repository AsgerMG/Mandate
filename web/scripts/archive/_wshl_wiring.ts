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

import { loadEnvLocal, requireCredentials } from "../loadEnv";

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
} from "../../lib/intelligence/corpus";
import { evaluateSpec, type ValueSpec } from "../../lib/intelligence/comparator";
import { isFilter, specField } from "../../lib/intelligence/evidenceTier";
import { gateFitScorer, objectiveScorer } from "../../lib/intelligence/shortlist";
import { USE_OF_FUNDS_OPTIONS, type EligibilityAnswers } from "../../lib/intelligence/types";
import { assessInstrument } from "../../lib/intelligence/verdict";
import { founderIntake, founderPolicyFromEnv } from "../founderIntake";
import { loadRecallSet, reattributeMissingAnswers, type RecallRow } from "../recallSet";

const PAIRS = process.env.PAIRS ?? path.join(
  process.cwd(), "..", "capital", "project-mgmt", "evidence", "wsha_door_pairs_2026-08-17.jsonl");
const OPTS = USE_OF_FUNDS_OPTIONS.map((o) => o.value as string);
const PIN = ["industrial_research", "experimental_development"];

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");

/** The register's own statement of the same fact, read from the file
 *  `objectiveScorer` reads rather than a second copy of it. */
const objectivesJson = JSON.parse(readFileSync(
  path.join(process.cwd(), "lib", "intelligence", "__objectives.json"), "utf8"),
) as Record<string, { useOfFunds?: string[] }>;

/** The values an `in`/`not_in` spec names, or [] for an operator that names
 *  none. Narrowed once here rather than cast at four call sites. */
const allowedOf = (s: ValueSpec): string[] =>
  "allowed" in s && Array.isArray(s.allowed) ? s.allowed as string[] : [];

/** Every useOfFunds FILTER gate on a leaf, after inheritance — the set the
 *  verdict engine actually reads. */
const uofGates = (i: DbInstrument): DbGate[] =>
  i.gates.filter((g) => isFilter(g) && specField(g) === "useOfFunds");

/** The demand a leaf makes on the field, as a stable string, so two leaves can
 *  be compared on WHAT THEY ASK rather than on how many rows say it. */
const demandKey = (i: DbInstrument) => uofGates(i)
  .map((g) => {
    const s = g.valueSpec as ValueSpec;
    return `${s.op}:${[...allowedOf(s)].sort().join("|")}`;
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
    // The WHOLE corpus, not just the pair doors. §0 is a statement about the
    // corpus, and gate hydration is lazy: asking only for the pairs would have
    // reported the corpus's gate count as whatever the pairs happened to carry.
    await hydrateGatesFor(loadDbInstruments().map((i) => i.id));
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
        const key = `${s.op} [${[...allowedOf(s)].sort().join(", ")}]`;
        demands.set(key, (demands.get(key) ?? 0) + 1);
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
    console.log("```\n");

    // ── 5. THE BAR: WHICH DOOR DOES EACH SOURCE PICK ───────────────────────
    //
    // wsHH's null on these 287 pairs is 50.9% — the best of five re-embeddings
    // (the door's NAME). A pair the signal is SILENT on is a coin flip and
    // scores 0.5, because that is what the founder gets: the sort falls through
    // to the next key. So a source is scored
    //
    //     (won + 0.5 * silent) / 287
    //
    // and the three sources are the three statements of the SAME fact:
    //   REGISTER   __objectives.json — SATR aid_objective codes, `register_derived`
    //   GATES      the fund's own encoded useOfFunds filter, `llm_cited`/`llm_2pass`
    //   BOTH       union
    console.log("## 5. Which door does each statement of the fact pick\n");

    const declaredFrom = (i: DbInstrument, src: "register" | "gates" | "both"): string[] => {
      const reg = src === "gates" ? [] : (objectivesJson[i.id]?.useOfFunds ?? []);
      if (src === "register") return reg;
      // A gate's demand, expressed in the SAME vocabulary the register uses:
      // what this fund will pay for. `not_in` is the complement, which is what
      // the fund's sentence actually says.
      const fromGates: string[] = [];
      for (const g of uofGates(i)) {
        const s = g.valueSpec as ValueSpec;
        const allowed = allowedOf(s);
        if (!allowed.length) continue;      // numeric_gte on a token field: unreadable
        if (s.op === "in") fromGates.push(...allowed);
        else if (s.op === "not_in") fromGates.push(...OPTS.filter((o) => !allowed.includes(o)));
      }
      return [...new Set([...reg, ...fromGates])];
    };

    type V = "won" | "shown" | "silent";
    const overlaps = (reg: string[], answer: string[]) => reg.some((u) => answer.includes(u));
    const doorVerdict = (p: Pair, answer: string[], src: "register" | "gates" | "both"): V => {
      const rw = declaredFrom(byId.get(p.won)!, src);
      const rs = declaredFrom(byId.get(p.shown)!, src);
      // objectiveScorer's own rule: a leaf with NO declared purpose scores 1,
      // so it is silent, never penalised.
      if (!rw.length || !rs.length || !answer.length) return "silent";
      const w = overlaps(rw, answer), s = overlaps(rs, answer);
      return w === s ? "silent" : w ? "won" : "shown";
    };
    const scoreOf = (answerFor: (p: Pair) => string[], src: "register" | "gates" | "both") => {
      let won = 0, shown = 0, silent = 0;
      for (const p of pairs) {
        const v = doorVerdict(p, answerFor(p), src);
        if (v === "won") won++; else if (v === "shown") shown++; else silent++;
      }
      return { won, shown, silent, acc: (won + 0.5 * silent) / pairs.length };
    };
    // The oracle: the best SINGLE option a founder could state, per pair, under
    // the source being scored. It is the ceiling of the wire, not of the answer.
    const oracleFor = (src: "register" | "gates" | "both") => (p: Pair) =>
      OPTS.find((o) => doorVerdict(p, [o], src) === "won") ?? PIN;

    console.log("```");
    console.log(`  ${"source".padEnd(12)}${"answer".padEnd(10)}   won  shown  silent    accuracy`);
    for (const src of ["register", "gates", "both"] as const) {
      for (const [label, fn] of [
        ["PIN", () => PIN],
        ["ORACLE", oracleFor(src)],
      ] as [string, (p: Pair) => string[]][]) {
        const r = scoreOf(fn, src);
        console.log(`  ${src.padEnd(12)}${label.padEnd(10)} ${String(r.won).padStart(5)}`
          + `${String(r.shown).padStart(7)}${String(r.silent).padStart(8)}`
          + `${(100 * r.acc).toFixed(1).padStart(11)}%`);
      }
    }
    console.log(`\n  wsHH's null on this population, the door's NAME re-embedded:      50.9%`);
    console.log("```\n");

    // ── 6. THE VOLUME CONTROL, WHICH RETIRED THE LAST PROPOSAL ─────────────
    //
    // wsHG priced a rescoring at +14 and killed it, because it won by preferring
    // the door with the LONGER registered purpose list — leaf_separation_wsAO §4's
    // documentation-volume prior. Any new source of a declared purpose has to
    // survive the same check BEFORE its number is quoted.
    console.log("## 6. Volume control — is a source just a longer list\n");
    console.log("```");
    // Scored under the ANSWER THAT SHIPS, never under the oracle: the oracle
    // picks whatever makes the won door win, so "did it pick the longer list"
    // under an oracle measures the population, not the rule. wsHG §6 ran it on
    // the pin for exactly that reason.
    for (const src of ["register", "gates", "both"] as const) {
      let bigger = 0, smaller = 0, equal = 0, sep = 0;
      const lens: number[][] = [];
      for (const p of pairs) {
        const rw = declaredFrom(byId.get(p.won)!, src);
        const rs = declaredFrom(byId.get(p.shown)!, src);
        if (rw.length && rs.length) lens.push([rw.length, rs.length]);
        const v = doorVerdict(p, PIN, src);
        if (v === "silent") continue;
        sep++;
        const [picked, other] = v === "won" ? [rw, rs] : [rs, rw];
        if (picked.length > other.length) bigger++;
        else if (picked.length < other.length) smaller++;
        else equal++;
      }
      const mean = (k: 0 | 1) => lens.length
        ? (lens.reduce((a, l) => a + l[k], 0) / lens.length).toFixed(2) : "—";
      console.log(`  ${src.padEnd(10)} of ${String(sep).padStart(3)} pairs the PIN separates, the picked door's `
        + `list is LONGER ${bigger}, shorter ${smaller}, equal ${equal}`);
      console.log(`  ${"".padEnd(10)} mean declared purposes: won door ${mean(0)}, shown door ${mean(1)}`);
    }
    console.log("\n  A source that picks the longer list is the documentation-volume prior");
    console.log("  in a new place and must not be shipped on its number. See wsHG §6.");
    console.log("```\n");

    // ── 7. THE DEFECT, AS A CURVE ──────────────────────────────────────────
    //
    // `objectiveScorer` awards a leaf OBJECTIVE_MATCH when its registered
    // purpose OVERLAPS the founder's answer: any intersection counts. Both
    // sides are SETS, so the test is a disjunction against a disjunction — the
    // weakest comparison available, and it gets weaker as either side grows.
    //
    // The founder's side is a MULTI-SELECT. "Multi-select: real projects span
    // several" is types.ts's own words for it. So the question invites a
    // founder to tick everything true of them, and the only wire that reads
    // the field loses resolution with every additional true thing they tick.
    //
    // This is that sentence as a number: over every subset of the vocabulary of
    // each size, how many of the 287 pairs can the scorer tell apart at all.
    console.log("## 7. THE DEFECT — separation falls as the founder says more\n");
    console.log("```");
    console.log(`  |answer|   subsets   pairs separated (mean)   net won-shown (mean)   accuracy`);
    const subsetsOf = (k: number): string[][] => {
      const out: string[][] = [];
      const rec = (start: number, cur: string[]) => {
        if (cur.length === k) { out.push([...cur]); return; }
        for (let i = start; i < OPTS.length; i++) { cur.push(OPTS[i]); rec(i + 1, cur); cur.pop(); }
      };
      rec(0, []);
      return out;
    };
    for (let k = 1; k <= OPTS.length; k++) {
      const subs = subsetsOf(k);
      let sep = 0, net = 0, acc = 0;
      for (const s of subs) {
        const r = scoreOf(() => s, "register");
        sep += r.won + r.shown; net += r.won - r.shown; acc += r.acc;
      }
      console.log(`  ${String(k).padStart(8)}   ${String(subs.length).padStart(7)}   `
        + `${(sep / subs.length).toFixed(1).padStart(21)}   ${(net / subs.length).toFixed(1).padStart(19)}   `
        + `${(100 * acc / subs.length).toFixed(1).padStart(7)}%`);
    }
    console.log(`\n  The PIN is one of the 28 two-option subsets: 21 separated, net +5, 50.9%.`);
    console.log(`  The BEST SINGLE option a founder could state separates ${
      Math.max(...OPTS.map((o) => { const r = scoreOf(() => [o], "register"); return r.won + r.shown; }))
    } pairs.`);
    console.log(`  An answer naming ALL EIGHT — every true thing about a real project —`);
    console.log(`  separates ${scoreOf(() => OPTS, "register").won + scoreOf(() => OPTS, "register").shown} pairs. `
      + `The question invites that answer and the wire cannot read it.`);
    console.log("\n  per single option, the shape wsHG §5 found and this reproduces from the corpus:");
    for (const o of OPTS) {
      const r = scoreOf(() => [o], "register");
      console.log(`    ${o.padEnd(26)} separates ${String(r.won).padStart(3)}  misleads `
        + `${String(r.shown).padStart(3)}  net ${(r.won - r.shown >= 0 ? "+" : "")}${r.won - r.shown}`);
    }
    console.log("```\n");

    // ── 8. THE THIRD WIRE, PRICED THE SAME WAY ─────────────────────────────
    //
    // `gateFitScorer` is the only term that reads the fund's OWN text about
    // this field. It reads it as passed/checked over EVERY field at once, so a
    // failing useOfFunds gate is 1/n of the leaf's score — and n is how many
    // rules we happen to have encoded for that leaf.
    //
    // Two things are asked here. Does the wire carry the answer at all (does
    // the pair's gateFit order change with the answer), and does it carry it in
    // the right direction (does it pick the won door).
    console.log("## 8. gateFitScorer — the only wire that reads the fund's own words\n");
    const gateFitVerdict = (p: Pair, answer: string[]): V => {
      const won = byId.get(p.won)!, shown = byId.get(p.shown)!;
      const r = byName.get(p.founder);
      if (!r) return "silent";
      const e = { ...founderIntake(r, policy).eligibility, useOfFunds: answer };
      const f = gateFitScorer([won, shown], e);
      const a = f(won), b = f(shown);
      return Math.abs(a - b) < 1e-9 ? "silent" : a > b ? "won" : "shown";
    };
    const gateFitScore = (answerFor: (p: Pair) => string[]) => {
      let won = 0, shown = 0, silent = 0;
      for (const p of pairs) {
        const v = gateFitVerdict(p, answerFor(p));
        if (v === "won") won++; else if (v === "shown") shown++; else silent++;
      }
      return { won, shown, silent, acc: (won + 0.5 * silent) / pairs.length };
    };
    console.log("```");
    console.log(`  ${"answer".padEnd(22)}   won  shown  silent    accuracy`);
    const gfPin = gateFitScore(() => PIN);
    console.log(`  ${"PIN".padEnd(22)} ${String(gfPin.won).padStart(5)}${String(gfPin.shown).padStart(7)}`
      + `${String(gfPin.silent).padStart(8)}${(100 * gfPin.acc).toFixed(1).padStart(11)}%`);
    // Best case for the wire: per pair, the answer that makes gateFit favour
    // the won door, if one exists. A ceiling on the WIRE, not on any founder.
    const gfOracle = gateFitScore((p) =>
      OPTS.map((o) => [o]).find((a) => gateFitVerdict(p, a) === "won") ?? PIN);
    console.log(`  ${"ORACLE (single option)".padEnd(22)} ${String(gfOracle.won).padStart(5)}`
      + `${String(gfOracle.shown).padStart(7)}${String(gfOracle.silent).padStart(8)}`
      + `${(100 * gfOracle.acc).toFixed(1).padStart(11)}%`);
    // And how far the answer moves the wire at all: pairs whose gateFit
    // verdict is not the same under every answer a founder could give.
    let moved = 0;
    for (const p of pairs) {
      const vs = new Set([gateFitVerdict(p, PIN), ...OPTS.map((o) => gateFitVerdict(p, [o]))]);
      if (vs.size > 1) moved++;
    }
    console.log(`\n  pairs whose gateFit verdict CHANGES with the answer   ${moved}  ${pct(moved, pairs.length)}`);
    console.log(`  wsHH's null on this population                        50.9%`);
    console.log("```\n");

    // ── 9. A CANDIDATE CHANGE, PRICED AND THEN RETIRED BY ITS OWN CONTROL ──
    //
    //   ██ THIS SECTION CHANGES NOTHING. `shortlist.ts` IS UNTOUCHED. ██
    //
    // §7 says a richer answer separates less, and the obvious repair is to take
    // the match on the part of the founder's answer that can tell THESE
    // candidates apart — a purpose every candidate registers, or none does,
    // separates nobody. It invents nothing: every purpose used is one the
    // founder stated, and only WHICH of their own words are read changes.
    //
    // §10 retires it. It is `|reg ∩ answer|` — wsHG's COVERAGE — wearing a
    // different face, and it wins by preferring the more broadly notified door.
    // The rule is implemented HERE, in the harness, and NOT in the product, for
    // the same reason wsHG kept COVERAGE and JACCARD out of shortlist.ts.
    console.log("## 9. A candidate change, priced — and retired by §10\n");
    const retiredSplitting = (
      ids: string[], answer: string[],
    ): ((id: string) => number) => {
      const declared = ids
        .map((id) => objectivesJson[id]?.useOfFunds)
        .filter((reg): reg is string[] => Boolean(reg?.length));
      const splits = answer.filter((u) => {
        let has = 0, hasnt = 0;
        for (const reg of declared) { if (reg.includes(u)) has++; else hasnt++; }
        return has > 0 && hasnt > 0;
      });
      const eff = splits.length ? splits : answer;
      // `objectiveScorer`'s own normalisation, so the only difference between
      // the two arms is which words the match is taken on.
      return (id: string) => {
        const reg = objectivesJson[id]?.useOfFunds;
        if (!reg?.length) return 1;
        return reg.some((u) => eff.includes(u)) ? 1 : 0;
      };
    };
    const armVerdict = (p: Pair, answer: string[], arm: "shipped" | "splitting"): V => {
      const f = arm === "shipped"
        ? objectiveScorer([p.won, p.shown], answer)
        : retiredSplitting([p.won, p.shown], answer);
      const a = f(p.won), b = f(p.shown);
      return Math.abs(a - b) < 1e-9 ? "silent" : a > b ? "won" : "shown";
    };
    const armScore = (answerFor: (p: Pair) => string[], arm: "shipped" | "splitting") => {
      let won = 0, shown = 0, silent = 0;
      for (const p of pairs) {
        const v = armVerdict(p, answerFor(p), arm);
        if (v === "won") won++; else if (v === "shown") shown++; else silent++;
      }
      return { won, shown, silent, acc: (won + 0.5 * silent) / pairs.length };
    };
    console.log("```");
    console.log(`  ${"|answer|".padEnd(10)}${"arm".padEnd(11)}  pairs separated (mean)   net (mean)   accuracy (mean)`);
    for (let k = 1; k <= OPTS.length; k++) {
      const subs = subsetsOf(k);
      for (const arm of ["shipped", "splitting"] as const) {
        let sep = 0, net = 0, acc = 0;
        for (const s of subs) {
          const r = armScore(() => s, arm);
          sep += r.won + r.shown; net += r.won - r.shown; acc += r.acc;
        }
        console.log(`  ${String(k).padEnd(10)}${arm.padEnd(11)}  ${(sep / subs.length).toFixed(1).padStart(21)}`
          + `   ${(net / subs.length).toFixed(1).padStart(10)}   ${(100 * acc / subs.length).toFixed(1).padStart(14)}%`);
      }
    }
    console.log("\n  the two answers that are not a subset average — the harness's PIN, and the");
    console.log("  whole vocabulary, which is what a founder ticking every true thing gives us\n");
    for (const [label, ans] of [["PIN", PIN], ["ALL EIGHT", OPTS]] as [string, string[]][]) {
      for (const arm of ["shipped", "splitting"] as const) {
        const r = armScore(() => ans, arm);
        console.log(`  ${label.padEnd(10)}${arm.padEnd(11)}  won ${String(r.won).padStart(3)}  shown `
          + `${String(r.shown).padStart(3)}  silent ${String(r.silent).padStart(3)}  net `
          + `${(r.won - r.shown >= 0 ? "+" : "")}${r.won - r.shown}  acc ${(100 * r.acc).toFixed(1)}%`);
      }
    }
    console.log(`\n  wsHH's null on this population, the door's NAME re-embedded:  50.9%`);
    console.log("```\n");

    // ── 10. THE VOLUME CONTROL ON THE CANDIDATE ────────────────────────────
    //
    // wsHG retired a +14 because it won by preferring the door with the LONGER
    // registered purpose list. The same check, on this arm, under the answers
    // that ship rather than under an oracle.
    console.log("## 10. Volume control on the candidate\n");
    console.log("```");
    for (const [label, ans] of [["PIN", PIN], ["ALL EIGHT", OPTS]] as [string, string[]][]) {
      for (const arm of ["shipped", "splitting"] as const) {
        let bigger = 0, smaller = 0, equal = 0, sep = 0;
        for (const p of pairs) {
          const v = armVerdict(p, ans, arm);
          if (v === "silent") continue;
          sep++;
          const rw = objectivesJson[p.won]?.useOfFunds ?? [];
          const rs = objectivesJson[p.shown]?.useOfFunds ?? [];
          const [picked, other] = v === "won" ? [rw, rs] : [rs, rw];
          if (picked.length > other.length) bigger++;
          else if (picked.length < other.length) smaller++;
          else equal++;
        }
        console.log(`  ${label.padEnd(10)}${arm.padEnd(11)} of ${String(sep).padStart(3)} separated, picked door's `
          + `list LONGER ${String(bigger).padStart(3)}, shorter ${String(smaller).padStart(3)}, `
          + `equal ${String(equal).padStart(3)}`);
      }
    }
    console.log("\n  A rule that picks the longer list is expressing the population's base rate");
    console.log("  (won door 3.11 purposes, shown door 2.77), not the founder's answer.");
    console.log("```");
  })();
}

void main();
