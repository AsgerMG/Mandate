// wsGE — WHERE THE WON FUND FALLS OUT, ATTRIBUTED TO A NAMED STAGE.
//
// ── The question ──────────────────────────────────────────────────────────
// `poolRecallCurve.generated.json` saturates: showing the model every row it
// could ever be shown still misses the won fund for 22.5% of held-out
// founders. `check_recall_floor` reports `pool 98%` on the same recall set.
// Two numbers, both about "is the answer in the pool", twenty points apart,
// and nobody had named the stage between them.
//
// ── What this measures, and its denominator ───────────────────────────────
// Population: the SAME one the curve is measured on — the holdout split of
// `ACTIVE_RECALL_SET`, described founders only, one founder per company. Every
// pair in it is GRADED, meaning its answer is a fund `publishableInstruments()
// ` currently offers, so a miss here is never "the fund is closed".
//
// For each founder it replays the one build the curve replays and asks, in
// pipeline order, where the won instrument stopped being present:
//
//   CHANNEL     its sourceFamilyBucket never entered the pool
//   LEAF        it was removed by a per-instrument leaf rule (country,
//               capital, liveness, leaf cap, dupe name)
//   SILENT      absent from the candidate table with NO exclusion event
//               against it — the removal happened somewhere that does not
//               report, which is the defect class this project has hit before
//   VER-BLOCKED it reached the candidate table and `accessiblePool` dropped it
//               on an encoded eligibility verdict
//   PRESENT     it is in the accessible pool
//
// The first four sum to the curve's 22.5%. `check_recall_floor`'s `pool` reads
// `candidateInstrumentIds`, which is the list BEFORE the VER-BLOCKED drop, so
// the two figures are not the same claim — this script's PRESENT-vs-candidate
// split is the proof, measured on one population in one pass.
//
// VER-BLOCKED cases are split further, because `assessInstrument` reaches
// `blocked` two different ways and only one of them is what the register says:
//
//   STRUCTURAL  a cited structural filter fails. One is conclusive.
//   TWO-SOFT    two or more filters fail, none of them a cited structural one.
//               `EXCLUSION_RULES["VER-BLOCKED"].what` says "more than one
//               encoded, CITED eligibility filter"; the code counts uncited
//               ones too (wsFZ). Whether that matters is an empirical question
//               and this is the measurement of it.
//
// ── FREE BY CONSTRUCTION, except for the shipped embedding ────────────────
// ANTHROPIC_API_KEY is deleted before anything that could use it is imported.
// The only paid call is the Voyage query embedding behind `semanticFundMatch`
// — the same one the curve pays, one per founder, and it prints its own tally.
//
//   npx tsx scripts/_wsge_attribution.ts
//   LIMIT=40 npx tsx scripts/_wsge_attribution.ts     (a smoke run)
//   OUT=/path/rows.json npx tsx scripts/_wsge_attribution.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention.
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsge_attribution", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus,
  resetGateHydration, suppressedForUnconfirmedLiveness,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import { EXCLUSION_RULES, type ExclusionRuleId } from "../lib/intelligence/rules";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import { assessAll, isStructural } from "../lib/intelligence/verdict";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";

/** Where a founder's own won fund stopped being present. Ordered as the
 *  pipeline runs, so a cumulative table reads top to bottom. */
type Stage =
  | "channel" | "leaf" | "silent" | "ver_blocked_structural" | "ver_blocked_two_soft" | "present";

const STAGE_LABEL: Record<Stage, string> = {
  channel: "CHANNEL      channel never entered the pool",
  leaf: "LEAF         removed by a per-instrument leaf rule",
  silent: "SILENT       absent with no exclusion event against it",
  ver_blocked_structural: "VER-BLOCKED  a cited STRUCTURAL filter fails (one is conclusive)",
  ver_blocked_two_soft: "VER-BLOCKED  two+ filters fail, none cited-and-structural",
  present: "PRESENT      in the accessible pool",
};

interface Row {
  name: string;
  instrument: string;
  country: string;
  stage: Stage;
  /** The leaf/channel rule that fired, when one did. */
  rule?: ExclusionRuleId;
  detail?: string;
  /** Rank in the accessible pool, 1-based, when present. */
  rank?: number;
  poolLength: number;
  candidateLength: number;
  /** The failing fields, for a VER-BLOCKED row. */
  blockers?: { field: string; cited: boolean; structural: boolean }[];
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsge_attribution");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const pub = publishableInstruments();
  const offerable = new Set(pub.map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));
  // The channel a won fund would have had to arrive through, read off the
  // PUBLISHABLE row rather than the raw one: `publishableInstruments()` rewrites
  // a redirected successor, and the bucket is what selection keys on.
  const bucketOf = new Map(pub.map((i) => [i.id, i.sourceFamilyBucket ?? ""]));

  const { file, rows: all } = loadRecallSet("wsge attribution");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  // EXACTLY the curve's population — see _wsdr_curve.ts. Any divergence here
  // and the two numbers stop being about the same founders, which is the whole
  // failure this script exists to diagnose.
  let graded = pop.graded.filter((r) => r.split === "holdout" && isDescribed(r));
  const seen = new Set<string>();
  graded = [...graded].sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  const limit = Number(process.env.LIMIT ?? 0);
  if (limit > 0) graded = graded.slice(0, limit);

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(`set=${file}  population=holdout+described+one-per-company  n=${graded.length}`);
  console.log(`answer key: every pair below is GRADED — its fund is offerable today, `
    + `so no miss here is "the fund is closed"`);
  // The pairs the key itself puts beyond grading — the fund is not offerable
  // today. They are OUT of every denominator below, which is what makes a miss
  // here a plumbing fact rather than a corpus fact.
  console.log(`UNGRADED (answer not offerable today — outside every denominator below): `
    + `${pop.ungraded.length} of ${fixed.rows.length} pairs`);

  const policy: FounderPolicy = founderPolicyFromEnv();
  resetRankerTally();
  const out: Row[] = [];
  let done = 0;

  for (const t of graded) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    const selfRecord = matchCompany(f.company, f.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
      : [];
    const semantic = await semanticFundMatch(f.opts.description ?? "");
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
      founderCountries: founderCountryList(
        f.country, f.eligibility.entityCountries),
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log,
    } as never);
    const pool = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);

    const want = t.instrument;
    const candidateIds = hydrated.map((r) => r.instrumentId).filter(Boolean) as string[];
    const rank = pool.map((r) => r.instrumentId).indexOf(want);
    const base = {
      name: t.name, instrument: want, country: f.country ?? "",
      poolLength: pool.length, candidateLength: hydrated.length,
    };

    if (rank >= 0) {
      out.push({ ...base, stage: "present", rank: rank + 1 });
    } else if (candidateIds.includes(want)) {
      // It was a candidate and the accessible pool dropped it. Only one filter
      // in `accessiblePool` can do that, so the split is about WHY it blocked.
      const a = assessAll([want], f.eligibility as never).get(want);
      const blockers = (a?.blockers ?? []).map((b) => ({
        field: b.field, cited: b.cited, structural: isStructural(b.field),
      }));
      const conclusive = blockers.some((b) => b.cited && b.structural);
      out.push({
        ...base,
        stage: conclusive ? "ver_blocked_structural" : "ver_blocked_two_soft",
        blockers,
        detail: `status=${a?.status ?? "?"} checked=${a?.checked ?? 0} passed=${a?.passed ?? 0}`,
      });
    } else {
      // Absent before the verdict stage. Attribute to the first event recorded
      // against its own id, else against its channel, else SILENT.
      const own = log.all().find((e) => e.subject === want);
      const bucket = bucketOf.get(want) ?? byId.get(want)?.sourceFamilyBucket ?? "";
      const chan = bucket
        ? log.all().find((e) => e.subject === bucket || e.subject === `${bucket}`)
        : undefined;
      const wildcard = log.all().find((e) => e.subject === "*");
      const ev = own ?? chan ?? wildcard;
      const stage: Stage = ev
        ? (EXCLUSION_RULES[ev.ruleId].stage === "channel" ? "channel" : "leaf")
        : "silent";
      out.push({
        ...base, stage, rule: ev?.ruleId,
        detail: ev?.detail ?? `bucket=${bucket || "(none)"} no event against this id`,
      });
    }
    if (++done % 50 === 0) console.log(`  ${done}/${graded.length}`);
  }

  const n = out.length;
  const pct = (k: number) => `${((100 * k) / (n || 1)).toFixed(1)}%`;
  const ORDER: Stage[] = [
    "channel", "leaf", "silent", "ver_blocked_structural", "ver_blocked_two_soft", "present"];

  console.log(`\n${rankerTallyLine()}`);
  console.log(`\nATTRIBUTION, n=${n} held-out described founders, one per company.`);
  console.log("Denominator: founders whose won fund is offerable today. "
    + "Cumulative reads 'still present after this stage'.\n");
  let cum = n;
  for (const s of ORDER) {
    const k = out.filter((r) => r.stage === s).length;
    if (s !== "present") cum -= k;
    console.log(`  ${STAGE_LABEL[s].padEnd(62)} ${String(k).padStart(4)}  ${pct(k).padStart(6)}`
      + (s === "present" ? "" : `   cumulative recall ${pct(cum)}`));
  }
  const inCandidates = out.filter(
    (r) => r.stage === "present" || r.stage.startsWith("ver_blocked")).length;
  console.log(`\n  in the CANDIDATE table (what check_recall_floor calls "pool"): `
    + `${inCandidates}  ${pct(inCandidates)}`);
  console.log(`  in the ACCESSIBLE pool (what the curve calls inPoolAtAll):     `
    + `${out.filter((r) => r.stage === "present").length}  `
    + `${pct(out.filter((r) => r.stage === "present").length)}`);

  // Which rule, for the stages that name one.
  const byRule = new Map<string, number>();
  for (const r of out) if (r.rule) byRule.set(r.rule, (byRule.get(r.rule) ?? 0) + 1);
  if (byRule.size) {
    console.log("\n  the rule that fired, where one did:");
    for (const [id, k] of [...byRule].sort((a, b) => b[1] - a[1])) {
      const rule = EXCLUSION_RULES[id as ExclusionRuleId];
      console.log(`    ${id.padEnd(26)} ${String(k).padStart(4)}  ${pct(k).padStart(6)}  `
        + `${rule.kind}/${rule.stage}, recoverable=${rule.recoverable}`);
    }
  }

  // Which FIELD blocks, because a field is the thing an intake question could
  // change and a rule id is not.
  const byField = new Map<string, { n: number; cited: number; structural: number }>();
  for (const r of out) {
    for (const b of r.blockers ?? []) {
      const m = byField.get(b.field) ?? { n: 0, cited: 0, structural: 0 };
      m.n++; if (b.cited) m.cited++; if (b.structural) m.structural++;
      byField.set(b.field, m);
    }
  }
  if (byField.size) {
    console.log("\n  VER-BLOCKED, by the field that failed (a founder may fail several):");
    for (const [field, m] of [...byField].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`    ${field.padEnd(26)} ${String(m.n).padStart(4)}  `
        + `cited=${m.cited}  structural=${m.structural}`);
    }
  }

  console.log(`\n  degradation policy withheld this run: ${suppressedForUnconfirmedLiveness().length} rows`);
  const outFile = process.env.OUT;
  if (outFile) {
    writeFileSync(outFile, `${JSON.stringify({
      what: "per-founder attribution of the won fund's loss to a named pipeline stage",
      generatedBy: "scripts/_wsge_attribution.ts",
      set: file, n, corpus: `${prov.source} instruments=${prov.instruments}`,
      generatedAt: new Date().toISOString(), rows: out,
    }, null, 1)}\n`);
    console.log(`  wrote ${outFile}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
