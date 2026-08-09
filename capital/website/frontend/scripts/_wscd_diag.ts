// wsCD diagnostic: where does the open-question selector lose its candidates?
//
// Counts the funnel one stage at a time over the publishable corpus, then over
// one founder's actual pool. Free: Postgres and disk, no model calls.
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("wscd_diag", ["DATABASE_URL"]);
process.env.OPEN_QUESTION_ARM = "on";

import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, publishableInstruments,
  requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { MIN_SUBSTANTIVE_LEN, normaliseRequirement, requirementClassOf } from "../lib/intelligence/openQuestions";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wscd_diag");
  const pubs = publishableInstruments();
  await hydrateGatesFor(pubs.map((i) => i.id));
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const pool = pubs.map((i) => byId.get(i.id)!).filter(Boolean);

  let filters = 0, substantive = 0, judgeable = 0;
  const judgeableCarriers = new Map<string, Set<string>>();
  for (const inst of pool) {
    for (const g of inst.gates) {
      if (g.gateRole && g.gateRole !== "filter") continue;
      filters += 1;
      const req = (g.requirement ?? "").trim();
      if (req.length < MIN_SUBSTANTIVE_LEN) continue;
      substantive += 1;
      if (requirementClassOf(req) !== "judgeable") continue;
      judgeable += 1;
      const k = normaliseRequirement(req);
      (judgeableCarriers.get(k) ?? judgeableCarriers.set(k, new Set()).get(k)!).add(inst.id);
    }
  }
  console.log(`publishable instruments hydrated: ${pool.length}`);
  console.log(`  filter gates                 : ${filters}`);
  console.log(`  >= ${MIN_SUBSTANTIVE_LEN} chars               : ${substantive}`);
  console.log(`  classified judgeable         : ${judgeable} `
    + `(${judgeableCarriers.size} distinct texts, on ${new Set([...judgeableCarriers.values()].flatMap((s) => [...s])).size} instruments)`);

  // The question the selector actually asks: does a judgeable requirement ever
  // split a regime? Siblings of one notified scheme inherit one set of gates
  // by construction, so this is the number that decides whether the sibling
  // site can ever see anything.
  const byRegime = new Map<string, typeof pool>();
  for (const i of pool) {
    const r = i.parentId ?? i.id;
    (byRegime.get(r) ?? byRegime.set(r, []).get(r)!).push(i);
  }
  const multi = [...byRegime.entries()].filter(([, g]) => g.length > 1);
  let regimesWithJudgeable = 0, regimesSplit = 0, splitPairs = 0;
  for (const [, group] of multi) {
    const counts = new Map<string, number>();
    for (const inst of group) {
      const seen = new Set<string>();
      for (const g of inst.gates) {
        if (g.gateRole && g.gateRole !== "filter") continue;
        const req = (g.requirement ?? "").trim();
        if (req.length < MIN_SUBSTANTIVE_LEN) continue;
        if (requirementClassOf(req) !== "judgeable") continue;
        const k = normaliseRequirement(req);
        if (seen.has(k)) continue;
        seen.add(k);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    if (counts.size) regimesWithJudgeable += 1;
    const splits = [...counts.values()].filter((n) => n > 0 && n < group.length);
    if (splits.length) { regimesSplit += 1; splitPairs += splits.length; }
  }
  console.log(`\nmulti-leaf regimes among publishable : ${multi.length}`);
  console.log(`  holding any judgeable requirement  : ${regimesWithJudgeable}`);
  console.log(`  where one SPLITS the siblings      : ${regimesSplit} (${splitPairs} splitting texts)`);

  // ── The bound on the DEFAULT arm ────────────────────────────────────────
  // openFitScorer needs TWO siblings with a judged requirement before it can
  // compare anything (`known.length < 2`). A splitting requirement gives only
  // ONE side a judgement, so the split it was selected for is invisible unless
  // the OTHER siblings carry judgeable requirements of their own. This counts
  // the regimes where they do -- the whole population the default arm can ever
  // act on.
  let bothSidesJudgeable = 0;
  for (const [, group] of multi) {
    const withJudgeable = group.filter((inst) => inst.gates.some((g) =>
      (!g.gateRole || g.gateRole === "filter")
      && (g.requirement ?? "").trim().length >= MIN_SUBSTANTIVE_LEN
      && requirementClassOf((g.requirement ?? "").trim()) === "judgeable"));
    if (withJudgeable.length >= 2) bothSidesJudgeable += 1;
  }
  console.log(`  with >=2 siblings each carrying one : ${bothSidesJudgeable}  `
    + `<- the only regimes the DEFAULT absence arm can act on`);

  // How much of the corpus a judgeable requirement reaches at all, ignoring
  // siblings: the number an absolute (non-sibling) site could see.
  const anyJudgeable = pool.filter((i) => i.gates.some((g) =>
    (!g.gateRole || g.gateRole === "filter")
    && (g.requirement ?? "").trim().length >= MIN_SUBSTANTIVE_LEN
    && requirementClassOf((g.requirement ?? "").trim()) === "judgeable"));
  console.log(`\ninstruments carrying >=1 judgeable filter: ${anyJudgeable.length}/${pool.length} `
    + `(${(100 * anyJudgeable.length / pool.length).toFixed(1)}%)`);
}

main();
