// wsHG — DOES THE DERIVED ANSWER PICK THE RIGHT DOOR?
//
// Pre-registered outcome 2. FREE and OFFLINE: no credentials, no model, no
// database. Reads wsHA's own working set, the corpus's registered purposes,
// and the labels `_wshg_useoffunds.ts` bought.
//
// ── WHAT IS BEING SCORED ─────────────────────────────────────────────────
// `objectiveScorer` (shortlist.ts) awards OBJECTIVE_MATCH to a leaf whose
// registered `useOfFunds` OVERLAPS the founder's answer, and a penalty to one
// that does not. Overlap, not equality — a coarser rule than it looks, and the
// reason the pinned answer already scores both doors of most pairs the same.
//
// So a pair has one of four verdicts under a given answer:
//   WON      the won door overlaps the answer and the shown door does not
//   SHOWN    the shown door overlaps and the won door does not
//   BOTH     both overlap — the scorer is silent between them
//   NEITHER  neither overlaps — the scorer is silent between them
//
// ── THE THREE THINGS THIS PRINTS, AND WHY ALL THREE ──────────────────────
//   PIN      what the harness's constant already achieves. The baseline the
//            derived answer has to beat, not zero.
//   DERIVED  the founder's own words.
//   ORACLE   the best any answer could do on this population, computed by
//            asking whether ANY of the eight options separates the pair in
//            each direction. Without it a derived score has no scale: "27 of
//            86" reads differently against a ceiling of 64 than against 86.
//
// Usage:
//   UOF=/tmp/wshg_uof.json npx tsx scripts/_wshg_doors.ts
import { readFileSync } from "fs";
import path from "path";

import { USE_OF_FUNDS_OPTIONS } from "../lib/intelligence/types";

const PAIRS = process.env.PAIRS ?? path.join(
  process.cwd(), "..", "..", "project-mgmt", "evidence", "wsha_door_pairs_2026-08-17.jsonl");
const OBJECTIVES = path.join(process.cwd(), "lib", "intelligence", "__objectives.json");
const UOF = process.env.UOF ?? "/tmp/wshg_uof.json";

/** The harness's constant, read off `founderIntake`'s disposition rather than
 *  invented here. */
const PIN = ["industrial_research", "experimental_development"];

type Verdict = "won" | "shown" | "both" | "neither";
interface Pair { founder: string; regime: string; won: string[]; shown: string[] }

/** `objectiveScorer`'s own rule, restricted to the pair. */
const overlaps = (reg: string[], answer: string[]) => reg.some((u) => answer.includes(u));
function verdict(p: Pair, answer: string[]): Verdict {
  if (!answer.length) return "neither";
  const w = overlaps(p.won, answer), s = overlaps(p.shown, answer);
  return w && s ? "both" : w ? "won" : s ? "shown" : "neither";
}

const tally = (pairs: Pair[], answerFor: (p: Pair) => string[]) => {
  const c: Record<Verdict, number> = { won: 0, shown: 0, both: 0, neither: 0 };
  for (const p of pairs) c[verdict(p, answerFor(p))]++;
  return c;
};

const line = (label: string, c: Record<Verdict, number>, n: number) => {
  const pct = (x: number) => `${((100 * x) / n).toFixed(1)}%`.padStart(6);
  return `  ${label.padEnd(30)} won ${String(c.won).padStart(3)} ${pct(c.won)}   `
    + `shown ${String(c.shown).padStart(3)} ${pct(c.shown)}   `
    + `both ${String(c.both).padStart(3)}   neither ${String(c.neither).padStart(3)}   `
    + `NET ${(c.won - c.shown >= 0 ? "+" : "") + String(c.won - c.shown)}`;
};

(() => {
  const objectives = JSON.parse(readFileSync(OBJECTIVES, "utf8")) as
    Record<string, { useOfFunds?: string[] }>;
  const labels = JSON.parse(readFileSync(UOF, "utf8")) as
    Record<string, { uses: string[]; basis: string }>;
  const rows = readFileSync(PAIRS, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as {
      founder: string; regime: string; won: { id: string }; shown: { id: string };
    });

  // ── THE WORKING SET: wsHA §6's 86, RE-DERIVED RATHER THAN TAKEN ─────────
  const declared = rows
    .map((r) => ({
      founder: r.founder, regime: r.regime,
      won: objectives[r.won.id]?.useOfFunds ?? [],
      shown: objectives[r.shown.id]?.useOfFunds ?? [],
    }))
    .filter((p) => p.won.length > 0 && p.shown.length > 0);
  const differ = declared.filter(
    (p) => new Set(p.won).size !== new Set(p.shown).size
      || !p.won.every((u) => p.shown.includes(u)));

  console.log(`sibling-miss pairs           ${rows.length}`);
  console.log(`  both doors declare a purpose ${declared.length}  `
    + `(${((100 * declared.length) / rows.length).toFixed(1)}%)`);
  console.log(`  ...and the purposes DIFFER   ${differ.length}  `
    + `(${((100 * differ.length) / rows.length).toFixed(1)}%)   <- the working set`);
  // Refuse to report against a set that is not the one the finding cites.
  if (declared.length !== 96 || differ.length !== 86) {
    throw new Error(
      `_wshg_doors: re-derived ${declared.length}/${differ.length} where `
      + "door_separation_wsHA §6 measured 96/86. The corpus or the evidence file has moved "
      + "under this analysis and the comparison with that finding is not defined.");
  }
  const n = differ.length;

  // ── COVERAGE ON THIS SUBSET, WHICH IS NOT THE POPULATION COVERAGE ───────
  const known = differ.filter((p) => labels[p.founder]);
  const answered = differ.filter((p) => (labels[p.founder]?.uses.length ?? 0) > 0);
  console.log(`\nof the ${n}: ${known.length} were classified, `
    + `${answered.length} got a non-empty answer `
    + `(${((100 * answered.length) / n).toFixed(1)}%)`);

  // ── THE ORACLE, so the derived score has a scale ────────────────────────
  // A pair is separable toward the won door if SOME single option overlaps the
  // won door and not the shown one. Computed over the vocabulary, not guessed.
  const OPTS = USE_OF_FUNDS_OPTIONS.map((o) => o.value as string);
  let sepWon = 0, sepShown = 0;
  for (const p of differ) {
    if (OPTS.some((o) => verdict(p, [o]) === "won")) sepWon++;
    if (OPTS.some((o) => verdict(p, [o]) === "shown")) sepShown++;
  }
  console.log(`\nCEILING — an answer EXISTS that favours the won door on ${sepWon}/${n} `
    + `(${((100 * sepWon) / n).toFixed(1)}%), and one that favours the shown door on `
    + `${sepShown}/${n}. Both directions are reachable on most pairs, so a positive result `
    + `here is a statement about the ANSWER, not about the pairs.`);

  // ── THE THREE ARMS ──────────────────────────────────────────────────────
  console.log(`\nWHICH DOOR DOES \`objectiveScorer\` PREFER, over the ${n} pairs\n`);
  const pinC = tally(differ, () => PIN);
  // A founder the classifier could not read keeps the pin — the same rule the
  // funnel arm applies, so this table and the funnel measure the same thing.
  const derC = tally(differ, (p) => {
    const u = labels[p.founder]?.uses ?? [];
    return u.length ? u : PIN;
  });
  const oracleC = tally(differ, (p) => {
    const best = OPTS.find((o) => verdict(p, [o]) === "won");
    return best ? [best] : PIN;
  });
  console.log(line("PIN (what ships today)", pinC, n));
  console.log(line("DERIVED (founder's own words)", derC, n));
  console.log(line("ORACLE (best possible)", oracleC, n));

  // And on the changed sub-population only, because a figure over all 86
  // averages the derivation together with the constant it replaced.
  const changed = differ.filter((p) => {
    const u = labels[p.founder]?.uses ?? [];
    return u.length > 0 && !(u.length === PIN.length && u.every((x) => PIN.includes(x)));
  });
  if (changed.length) {
    console.log(`\nRESTRICTED to the ${changed.length} pairs whose answer ACTUALLY CHANGED\n`);
    console.log(line("PIN", tally(changed, () => PIN), changed.length));
    console.log(line("DERIVED", tally(changed, (p) => labels[p.founder]!.uses), changed.length));
  }

  // ── THE PRE-REGISTERED VERDICT, STATED BY THE CODE ──────────────────────
  const net = (c: Record<Verdict, number>) => c.won - c.shown;
  const pays = derC.won > derC.shown && net(derC) > net(pinC);
  const fails = net(derC) <= 0;
  console.log(`\nPRE-REGISTERED OUTCOME 2 — baseline is the PIN's net ${net(pinC) >= 0 ? "+" : ""}${net(pinC)}, not zero`);
  console.log(`  derived net ${net(derC) >= 0 ? "+" : ""}${net(derC)}  ->  `
    + (fails ? "DOES NOT PAY (net <= 0: it points at the wrong door at least as often)"
      : pays ? "PAYS (favours the won door more often, and beats the pin)"
        : "SEPARATES BUT DOES NOT BEAT THE CONSTANT (0 < net <= the pin's)"));

  // Where the derived arm goes wrong, by regime — the useful half of a
  // negative result and free to print either way.
  const wrong = new Map<string, number>();
  for (const p of differ) {
    const u = labels[p.founder]?.uses ?? [];
    if (verdict(p, u.length ? u : PIN) === "shown") wrong.set(p.regime, (wrong.get(p.regime) ?? 0) + 1);
  }
  if (wrong.size) {
    console.log(`\n  pairs the derived answer points the WRONG way, by regime`);
    for (const [r, c] of [...wrong].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${r.padEnd(28)} ${c}`);
    }
  }

  // ── THE CONSTRUCTIVE HALF OF A NEGATIVE RESULT ──────────────────────────
  // A derived answer that misses is only half the finding. The other half is
  // WHICH answer would not have missed, because that is a statement about what
  // to ask a real founder — and it is free to compute once the oracle exists.
  //
  // Two different questions, and they are printed separately because they
  // license different things:
  //
  //   SEPARATES   the option picks the won door on its own. The count is what
  //               asking that one question, alone, would be worth here.
  //   MISLEADS    the option picks the SHOWN door. The same question asked of
  //               a founder who answers it truthfully COSTS pairs, so a
  //               question is only worth asking where the first column
  //               dominates the second.
  console.log(`\nWHICH SINGLE ANSWER WOULD HAVE SEPARATED THESE DOORS`);
  console.log(`  Over the ${n} pairs, if every founder answered exactly this one option:\n`);
  console.log(`  ${"option".padEnd(26)} separates  misleads   net`);
  const perOption = OPTS.map((o) => {
    let sep = 0, mis = 0;
    for (const p of differ) {
      const v = verdict(p, [o]);
      if (v === "won") sep++; else if (v === "shown") mis++;
    }
    return { o, sep, mis };
  }).sort((a, b) => (b.sep - b.mis) - (a.sep - a.mis));
  for (const { o, sep, mis } of perOption) {
    console.log(`  ${o.padEnd(26)} ${String(sep).padStart(6)}    ${String(mis).padStart(6)}   `
      + `${(sep - mis >= 0 ? "+" : "") + String(sep - mis)}`);
  }
  console.log(`\n  Read this as what the FIRST-PAGE QUESTION is worth on this population, `
    + `not as a\n  ranking change: the founder states one of these, and the state-aid block's `
    + `two doors\n  are told apart by it or they are not.`);

  // And how often the derived answer actually contained the separating option
  // — the difference between "the question works" and "our reading of their
  // prose produces the answer the question would have got".
  let hadIt = 0, couldHave = 0;
  for (const p of differ) {
    const winners = OPTS.filter((o) => verdict(p, [o]) === "won");
    if (!winners.length) continue;
    couldHave++;
    const u = labels[p.founder]?.uses ?? [];
    if (winners.some((w) => u.includes(w))) hadIt++;
  }
  console.log(`\n  Of the ${couldHave} pairs a single option could separate, the derived `
    + `answer CONTAINED\n  such an option on ${hadIt} `
    + `(${((100 * hadIt) / couldHave).toFixed(1)}%) — but \`objectiveScorer\` scores on `
    + `OVERLAP,\n  so an answer that also names an option the shown door registers scores `
    + `both and\n  separates neither. That is the mechanism behind the net above.`);

  // ── A PROPOSAL, PRICED, AND DELIBERATELY NOT APPLIED ────────────────────
  //
  //   ██ THIS SECTION CHANGES NOTHING. `shortlist.ts` IS UNTOUCHED. ██
  //
  // The line above says the multi-option answer is destroyed by the OVERLAP
  // rule, and that is a claim about `objectiveScorer`'s arithmetic rather than
  // about the founder's answer. A claim like that is worth exactly as much as
  // the counterfactual that prices it, so here it is priced — offline, on the
  // pair, with the same three answers as the table above.
  //
  // Two alternative rules, both computable from what the corpus already holds:
  //
  //   COVERAGE   prefer the door that matches MORE of the founder's answer.
  //              |reg ∩ answer|, larger wins, equal is neutral. A founder who
  //              says "research and a plant" is sent to whichever door covers
  //              more of that, instead of to both.
  //   JACCARD    prefer the door whose purpose is the better fit BOTH ways,
  //              |∩| / |∪|. Penalises a door that registers ten purposes and
  //              happens to include the founder's one.
  //
  // `objectiveScorer` is owned by another workstream this hour and is NOT
  // edited here. This is the evidence for a proposal, not a proposal applied.
  const score = (reg: string[], ans: string[]) => {
    const inter = reg.filter((u) => ans.includes(u)).length;
    const union = new Set([...reg, ...ans]).size;
    return { inter, jac: union ? inter / union : 0 };
  };
  const byRule = (p: Pair, ans: string[], rule: "coverage" | "jaccard"): Verdict => {
    if (!ans.length) return "neither";
    const w = score(p.won, ans), s = score(p.shown, ans);
    const [vw, vs] = rule === "coverage" ? [w.inter, s.inter] : [w.jac, s.jac];
    if (vw === vs) return vw > 0 ? "both" : "neither";
    return vw > vs ? "won" : "shown";
  };
  const answerOf = (p: Pair) => {
    const u = labels[p.founder]?.uses ?? [];
    return u.length ? u : PIN;
  };
  console.log(`\nPROPOSAL, PRICED AND NOT APPLIED — \`objectiveScorer\` scores on OVERLAP.`);
  console.log(`  What the SAME derived answers are worth under two other rules. `
    + `shortlist.ts is untouched.\n`);
  for (const [label, fn] of [
    ["OVERLAP (today)", (p: Pair) => verdict(p, answerOf(p))],
    ["COVERAGE |∩|", (p: Pair) => byRule(p, answerOf(p), "coverage")],
    ["JACCARD |∩|/|∪|", (p: Pair) => byRule(p, answerOf(p), "jaccard")],
  ] as [string, (p: Pair) => Verdict][]) {
    const c: Record<Verdict, number> = { won: 0, shown: 0, both: 0, neither: 0 };
    for (const p of differ) c[fn(p)]++;
    console.log(line(label, c, n));
  }
  console.log(`\n  And the same three rules under the PIN, so the reader can tell a `
    + `rule change from\n  an answer change:\n`);
  for (const [label, fn] of [
    ["OVERLAP (today) + pin", (p: Pair) => verdict(p, PIN)],
    ["COVERAGE + pin", (p: Pair) => byRule(p, PIN, "coverage")],
    ["JACCARD + pin", (p: Pair) => byRule(p, PIN, "jaccard")],
  ] as [string, (p: Pair) => Verdict][]) {
    const c: Record<Verdict, number> = { won: 0, shown: 0, both: 0, neither: 0 };
    for (const p of differ) c[fn(p)]++;
    console.log(line(label, c, n));
  }
})();
