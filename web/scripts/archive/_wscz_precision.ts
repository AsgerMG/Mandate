/**
 * wsCZ — how often is a founder shown a fund whose own recipients contradict
 * the class it is being matched on? FREE: one Voyage embed per pair, no model
 * calls.
 *
 * ── Why this metric and not EXACT@5 ───────────────────────────────────────
 * EXACT@5 asks whether the fund a founder WON is in their top five. It is a
 * recall question, and it is the right guard against a change that throws
 * answers away. It cannot see the defect this workstream was opened on.
 *
 * Aleph Alpha was not missing a fund. It was shown a Bavarian film and
 * television scheme at row 4 — a row that was WRONG, in a table that may have
 * been otherwise fine. No recall metric moves when a wrong row is removed,
 * because Aleph Alpha is not in the answer key and no founder's won fund was
 * the film scheme. Reporting only EXACT@5 would therefore report "no change"
 * about a change whose entire purpose is precision.
 *
 * So this counts, over the same replayed founders and the same production
 * entry points, how many published tables contain an instrument that
 * `check_sector_evidence.ts` calls contradicted: a fund reading as a technology
 * fund while the majority of its awards went to recipients whose own official
 * activity descriptor names an activity with no technology, science or
 * engineering dimension.
 *
 *   CORPUS=json SPLIT=tune N=300 npx tsx scripts/_wscz_precision.ts
 *   CORPUS=json SNAPSHOT_FILE=/tmp/wscz_after.json SPLIT=tune N=300 \
 *     npx tsx scripts/_wscz_precision.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wscz_precision", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../../lib/intelligence/corpus";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import { computeVerdict } from "../../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally } from "../../lib/intelligence/semantic";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "../founderIntake";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "../recallSample";
import {
  assertGradablePopulation, isDescribed, loadRecallSet, partitionByOfferable,
  reattributeMissingAnswers, type AnswerMode,
} from "../recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const ROOT = path.resolve(process.cwd(), "..", "capital");

interface Codebook {
  licenses_technology: string[]; nontech: string[]; unspecific: string[];
}
const codebook: Codebook = JSON.parse(readFileSync(
  path.join(ROOT, "reference", "activity_codebook.json"), "utf8"));
const evidence: { records: Record<string, { described: number; activities: Record<string, number> }> } =
  JSON.parse(readFileSync(
    path.join(ROOT, "reference", "instrument_recipient_activity.json"), "utf8"));

/** Identical three-step test to check_sector_evidence.ts, off the same
 *  codebook. Duplicating the FRAGMENTS would be the defect; applying the
 *  published codebook is the point of having one. */
function namesNonTechnologyActivity(descriptor: string): boolean {
  const d = descriptor.toLowerCase();
  if (codebook.unspecific.some((f) => d.includes(f))) return false;
  if (codebook.licenses_technology.some((f) => d.includes(f))) return false;
  return codebook.nontech.some((f) => d.includes(f));
}

function dominantClass(mix: Record<string, number> | null | undefined): string | null {
  if (!mix) return null;
  const e = Object.entries(mix).filter(([, n]) => n > 0);
  if (!e.length) return null;
  e.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  return e[0][0];
}

async function main() {
  const liveUrl = process.env.DATABASE_URL;
  if (process.env.CORPUS === "json") delete process.env.DATABASE_URL;
  await hydrateDbInstruments();
  if (liveUrl) process.env.DATABASE_URL = liveUrl;
  requireLiveCorpus("wscz_precision");

  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  // ── The set must be ARM-INVARIANT, or the metric measures itself ─────────
  // The first version of this defined the set as "instruments whose PUBLISHED
  // MIX contradicts their recipients". That set is empty by construction after
  // the correction, so it reported 8.0% -> 0.0% while the rows in question had
  // not moved at all. A precision metric whose subject is redefined by the
  // change it is measuring is not evidence.
  //
  // So the set is defined from the RECIPIENTS ONLY -- funds whose awards went
  // mostly to officially non-technology businesses. That is a fact about the
  // register, identical in both arms, and it is what a founder is actually
  // harmed by being shown.
  const nonTechnologyFund = new Set<string>();
  for (const [id, ev] of Object.entries(evidence.records)) {
    if (!ev.described) continue;
    let nonTech = 0;
    for (const [d, n] of Object.entries(ev.activities)) {
      if (namesNonTechnologyActivity(d)) nonTech += n;
    }
    if (nonTech / ev.described > 0.5) nonTechnologyFund.add(id);
  }
  const contradicted = nonTechnologyFund;
  void dominantClass;
  console.log(`funds whose recipients are majority officially NON-TECHNOLOGY: `
    + `${contradicted.size} (${[...contradicted].filter((id) => offerable.has(id)).length} offerable) `
    + `-- identical in both arms by construction`);

  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  const set = pop.graded.filter((r) => (split === "all" || r.split === split)
    && (!process.env.DESCRIBED || isDescribed(r)));
  const N = Math.min(num(process.env.N, 300), set.length);
  const sample = sampleRecall(set, N, num(process.env.SEED, DEFAULT_SEED));

  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(), answers: (process.env.ANSWERS ?? "off") as AnswerMode,
  };
  resetRankerTally();
  resetGateHydration();

  let tablesWithBadRow = 0;
  let badRows = 0;
  let rowsShown = 0;
  const worst: string[] = [];
  let techFounders = 0;
  for (const t of sample) {
    resetGateHydration();
    // Only a TECHNOLOGY founder is harmed by being shown one of these. An
    // `other` founder being offered a film fund is the system working.
    if (!t.sector || t.sector === "other") continue;
    techFounders++;
    const f = founderIntake(t, policy);
    const v = await computeVerdict(f.company, f.country, f.eligibility as never, {
      ...f.opts, log: new ExclusionLog(),
    } as never);
    const ids = (v.instrumentTable ?? [])
      .map((r: { instrumentId?: string }) => r.instrumentId)
      .filter(Boolean).slice(0, 5) as string[];
    rowsShown += ids.length;
    const bad = ids.filter((id) => contradicted.has(id));
    if (bad.length) {
      tablesWithBadRow++;
      badRows += bad.length;
      if (worst.length < 8) {
        worst.push(`${t.name?.slice(0, 30) ?? "?"} (${t.country}, ${t.sector}) `
          + `<- ${corpus.find((i) => i.id === bad[0])?.name.slice(0, 54)}`);
      }
    }
  }
  console.log(rankerTallyLine());
  console.log(`set=${setFile} split=${split} replayed ${sample.length}`);
  const pctT = 100 * tablesWithBadRow / Math.max(1, techFounders);
  console.log(`\n██ TECHNOLOGY founders shown at least one non-technology fund in `
    + `their top 5: ${tablesWithBadRow}/${techFounders} (${pctT.toFixed(1)}% `
    + `+/-${halfWidth(tablesWithBadRow, techFounders).toFixed(1)})`);
  console.log(`   contradicted rows published: ${badRows} of ${rowsShown} rows shown `
    + `(${(100 * badRows / Math.max(1, rowsShown)).toFixed(2)}%)`);
  for (const w of worst) console.log(`     ${w}`);
}

main();
