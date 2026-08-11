// wsDQ — THE RANKER, ON THE TWELVE, AND NOTHING DOWNSTREAM OF IT.
//
// ── What the owner asked for, and what this deliberately does NOT do ──────
//   "no need to write the memo, because when we have the right five funds we
//    can feed into the memo and then it's fine. We need to ensure that the
//    ranker works."
//
// So this stops at the selection seam. No `synthesize`, no writer, no
// `checkBrief`, no rendered brief. The published table it reports is the
// PROJECTION -- production's own `orderMemoCandidates` and `buildRowsForCheck`
// applied to each arm's pool and cut to the published cap, i.e. what a writer
// that obeys "these rows are already ranked and already cut, do not reorder
// them, do not omit one" would publish. wsDP established the standing of that
// projection: it is the last free step and it is not a proof, because the
// writer can reorder, omit and demote and all three are model outputs.
//
// Dropping the writer takes a company from about EUR 0.25 to about EUR 0.02.
//
// ── ONE PROCESS, ONE POOL OBJECT: the strongest control available ─────────
// `AGENT_SELECT` is read once at module scope, so an arm is a process. That
// would normally force two runs and put a live web-search call and two corpus
// snapshots between them. It does not here, because the pool is built in this
// file rather than inside `runIntelligence`:
//
//   poolOff   the array as it stands at the seam. `scripts/_wsdl_equiv.ts`
//             proves the off arm returns its argument BY REFERENCE on 60/60
//             founders, so this IS the off arm's pool, not a reconstruction.
//   poolOn    what `agentSelectMemoPool` returns when handed that same object.
//
// Same millisecond of corpus state, same peers, same semantic scores, same
// object. Nothing can drift between the arms because there is no between.
//
// ── The one thing this replay does not reproduce ─────────────────────────
// `runIntelligence` unions the comparable-company WEB SEARCH into
// `fieldChannels`, which is tier 1 of the row sort. That call is a memo-stage
// cost and is not made here, so `fieldChannels` comes from the company's own
// corpus record and its DB-native peers only. That makes this a LOWER bound on
// tier 1, identically on both arms -- it cannot advantage or disadvantage
// either, because both read the same pool.
//
//   AGENT_SELECT=adviser npx tsx scripts/_wsdq_seam.ts
//   AGENT_SELECT=adviser ONLY="Corti,BioNTech" npx tsx scripts/_wsdq_seam.ts
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsdq_seam", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

import {
  AGENT_SELECT_ARM, agentSelectCostPerBrief, agentSelectLastDecision, agentSelectLastTrace,
  agentSelectTallyLine, intakeAnswerLines, LOOKUP_MAX, resetAgentSelectTally, SELECT_COUNT,
  SELECT_DEPTH, setAgentSelectTracing, THINK_EFFORT, unansweredRankingFields,
} from "../lib/intelligence/agentSelect";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { withCostTracking } from "../lib/intelligence/cost";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, matchCompany, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import {
  applyProfileSignal, buildInstrumentTableHydrated, DISPLAY_CAP, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { assessAll } from "../lib/intelligence/verdict";
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import type { InstrumentRow } from "../lib/intelligence/types";
import { OUT_ROOT, slugOf } from "./_wsdq_paths";

const PUBLISH_CAP = BRIEF_LIMITS.institutionsMax;
const eur = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "n/a"
    : n >= 1e6 ? `EUR ${(n / 1e6).toFixed(1)}M`
      : n >= 1e3 ? `EUR ${Math.round(n / 1e3)}k` : `EUR ${Math.round(n)}`;
const one = (s: unknown, n = 100) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
};

interface Result {
  archetype: string; company: string; country: string;
  pool: number; menu: number;
  picks: number[]; deepest: number;
  keptFromTop: number;
  publishedOff: string[]; publishedOn: string[];
  entered: string[]; left: string[];
  unsure: number[]; retrieved: number; retrievalChangedMind: boolean | null;
  followed: number; overrode: number; reached: number;
  fellBack: string | null;
  eur: number;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsdq_seam");
  resetRankerTally();
  resetAgentSelectTally();
  setAgentSelectTracing(true);

  const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const queue = only.length
    ? COMPANIES.filter((c) => only.some((o) =>
      c.company.toLowerCase().includes(o.toLowerCase())
      || c.archetype.toLowerCase().includes(o.toLowerCase())))
    : COMPANIES;
  if (!queue.length) throw new Error(`ONLY="${process.env.ONLY}" matched no bench company`);

  const results: Result[] = [];
  let spend = 0;

  for (const c of queue) {
    resetGateHydration();
    // The bench founder, built exactly as memo_bench and funnel_bench build it,
    // through production's own sanitiser. Skipping the sanitiser made those
    // harnesses test a path no founder can take: it had gone stale after the
    // vocabulary split and was silently dropping `sector` and every
    // `activities` value on every live request.
    const eligibility = sanitizeEligibility({
      sector: c.sector, entityCountries: [c.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: c.borrowerModel ?? "operating", activities: c.activities,
      fteBand: c.fteBand, ticketBand: c.ticketBand, developmentStage: c.developmentStage,
      useOfFunds: ["experimental_development", "industrial_research"],
    } as never)!;
    const req = {
      company: c.company, country: c.country, description: c.description,
      capitalSought: ["grant", "loan"], eligibility,
    };

    // ── The pool, built exactly as `runIntelligence` builds it ─────────────
    const selfRecord = matchCompany(c.company, c.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: c.country, limit: 4, exclude: [c.company] })
      : [];
    const semantic = await semanticFundMatch(c.description);
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>([
        ...(selfRecord.matched ? selfRecord.channels : []),
        ...dbPeers.flatMap((r) => r.channels),
      ]),
      founderCountries: founderCountryList(c.country, undefined, eligibility.entityCountries),
      capitalSought: req.capitalSought,
      description: c.description,
      semantic,
      ...tableInputFromAnswers(eligibility),
      log,
    } as never);
    // THE CONTROL. `_wsdl_equiv` proves the off arm returns this array by
    // reference, so this IS the off arm's pool.
    const poolOff: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydrated, eligibility as never, log).slice(0, VERDICT_POOL),
      undefined, undefined);
    const ids = poolOff.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    await hydrateGatesFor(ids);

    // THE TREATMENT. Production's own seam, on that same object.
    const { result: poolOn, eur: spent } = await withCostTracking(
      () => import("../lib/intelligence/agentSelect")
        .then((m) => m.agentSelectMemoPool(poolOff, req as never)));
    spend += spent;
    const trace = agentSelectLastTrace();
    const decision = agentSelectLastDecision();

    // ── Through production's own ordering, to the published projection ─────
    const project = (pool: InstrumentRow[]) => {
      const l = new ExclusionLog();
      const o = orderMemoCandidates({
        instrumentTable: pool,
        req: { ...req, targetMarkets: undefined } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(eligibility as never, ids.slice(0, DISPLAY_CAP)),
        semanticScores: semantic, log: l,
      }).toWriter.map((x) => x.row);
      return o.slice(0, PUBLISH_CAP);
    };
    const pubOff = project(poolOff);
    const pubOn = project(poolOn);
    const nameOf = (r: InstrumentRow) => r.instrumentId ?? r.channel;
    const offIds = pubOff.map(nameOf), onIds = pubOn.map(nameOf);

    // ── The record, per company ───────────────────────────────────────────
    const dir = path.join(OUT_ROOT, slugOf(c.company));
    mkdirSync(dir, { recursive: true });
    for (const t of trace?.turns ?? []) {
      writeFileSync(path.join(dir, `prompt_r${t.round}.txt`),
        `SYSTEM (${t.system.length} chars)\n${"=".repeat(78)}\n${t.system}\n\n` +
        `USER (${t.user.length} chars)\n${"=".repeat(78)}\n${t.user}\n`);
      writeFileSync(path.join(dir, `reply_r${t.round}.txt`),
        `model=${t.model}  EUR ${t.eur.toFixed(4)}  usage=${JSON.stringify(t.usage)}\n\n` +
        `THINKING (${t.thinking.length} chars)\n${"=".repeat(78)}\n` +
        `${t.thinking || "(none returned)"}\n\n` +
        `REPLY (${t.reply.length} chars)\n${"=".repeat(78)}\n${t.reply}\n`);
    }

    const assessments = assessAll(ids, eligibility as never);
    const answers = intakeAnswerLines(eligibility);
    const unanswered = unansweredRankingFields(eligibility);
    const rankOff = new Map(poolOff.map((r, i) => [nameOf(r), i]));
    const pickedSet = new Set(trace?.pickedIds ?? []);
    const D: string[] = [];
    const p = (s = "") => D.push(s);
    p(`# ${c.company} — ${c.archetype}`);
    p();
    p(`arm=${AGENT_SELECT_ARM} · depth=${SELECT_DEPTH} · count=${SELECT_COUNT} · ` +
      `effort=${THINK_EFFORT} · lookups=${LOOKUP_MAX} · pool=${VERDICT_POOL} · ` +
      `published cap=${PUBLISH_CAP}`);
    p();
    p(`## 1. The founder, as the system saw them`);
    p();
    p(`country \`${c.country}\` · sector \`${c.sector}\` · matched in the corpus: ` +
      `**${selfRecord.matched}**${selfRecord.matched ? ` (subsector \`${selfRecord.subsector}\`)` : ""}`);
    p();
    p(`description, verbatim:`);
    p();
    p("```");
    p(c.description);
    p("```");
    p();
    p(`the intake lines handed to the selector:`);
    p();
    for (const a of answers) p(`- ${a}`);
    p();
    p(`ranking fields NOT answered: ${unanswered.join(", ") || "(none)"}`);
    p();
    p(`DB-native peers feeding tier 1: ${dbPeers.map((x) => x.name).join(", ") || "(none)"}`);
    p();
    p(`**Withheld from the selector by construction:** \`usedInField\` (tier 1 of the ` +
      `shipped row sort), \`instrument_profiles.profile_text\` (real winning project ` +
      `titles), and the company name — the prompt says the country and the sector and ` +
      `never who they are.`);
    p();
    p(`## 2. The pool the model read (${poolOff.length} rows, shipped order)`);
    p();
    p(`| # | fund | body · capital · typical award | our verdict | picked |`);
    p(`|---:|---|---|---|:---:|`);
    poolOff.forEach((r, i) => {
      const a = assessments.get(r.instrumentId ?? "");
      const v = a?.status === "open" ? "nothing rules them out"
        : a?.status === "one_blocker" ? `one blocker: ${one(a.blockers[0]?.requirement, 60)}`
          : a?.status === "blocked" ? "blocked" : "no rule evaluable";
      p(`| ${i} | ${one(r.instrument, 72)} | ${one(r.administeringBody, 40)} · ` +
        `${r.capitalType ?? "?"} · ${(r.typicalAwardN ?? 0) >= 5 ? eur(r.typicalAward) : "no median"} | ` +
        `${v} | ${pickedSet.has(nameOf(r)) ? "**✓**" : ""} |`);
    });
    p();
    p(`## 3. What the model chose`);
    p();
    if (trace?.fellBack) {
      p(`**██ THE ARM FELL BACK: ${trace.fellBack}**`);
      p();
    }
    if (!trace?.turns.length) {
      p(`No call was made.`);
    } else {
      p(`| its rank | pool rank | fund | what the scheme says it funds |`);
      p(`|---:|---:|---|---|`);
      (trace.picks ?? []).forEach((idx, n) => {
        const r = poolOff[idx];
        p(`| ${n + 1} | ${idx} | ${one(r?.instrument, 66)} | ${one(r?.description ?? r?.descriptor, 90)} |`);
      });
      p();
      const deepest = Math.max(-1, ...(trace.picks ?? []));
      p(`Deepest reach: pool rank **${deepest}** of ${poolOff.length - 1}. ` +
        `Picks drawn from the shipped top ${SELECT_COUNT}: ` +
        `**${(trace.picks ?? []).filter((i) => i < SELECT_COUNT).length} of ${trace.picks?.length ?? 0}**.`);
      p();
      p(trace.unsure.length
        ? `It declared itself unsure about pool rank(s) **${trace.unsure.join(", ")}** and was ` +
          `shown ${trace.retrieved.length} retrieved requirement chunk(s).`
        : `It declared **nothing** unsure, so no retrieval fired and round two never ran.`);
      p();
      for (const ch of trace.retrieved) p(`- \`${ch.instrumentId}\` — ${one(ch.text, 300)}`);
      if (trace.retrieved.length) p();
      if (decision) {
        p(`Against the peer prior (what companies in this country and sector have really won): ` +
          `followed **${decision.followed.length}**, overrode **${decision.overrode.length}**, ` +
          `reached past it for **${decision.reached.length}**.`);
        p();
      }
    }
    p(`## 4. What would publish (projection, ${PUBLISH_CAP}-row cap)`);
    p();
    p(`Production's own \`orderMemoCandidates\` + \`buildRowsForCheck\` on each arm's pool. ` +
      `NOT a proof: the writer can reorder, omit and demote, and all three are model outputs.`);
    p();
    p(`| # | shipped order (arm off) | arm ${AGENT_SELECT_ARM} |`);
    p(`|---:|---|---|`);
    for (let i = 0; i < Math.max(pubOff.length, pubOn.length); i++) {
      p(`| ${i + 1} | ${one(pubOff[i]?.instrument, 60)} | ${one(pubOn[i]?.instrument, 60)} |`);
    }
    p();
    const entered = onIds.filter((x) => !offIds.includes(x));
    const left = offIds.filter((x) => !onIds.includes(x));
    const nm = (id: string) => one(poolOff.find((r) => nameOf(r) === id)?.instrument ?? id, 70);
    p(`**Entered the table** (${entered.length}): ` +
      `${entered.map((x) => `${nm(x)} _(was pool rank ${rankOff.get(x)})_`).join("; ") || "(none)"}`);
    p();
    p(`**Left the table** (${left.length}): ` +
      `${left.map((x) => `${nm(x)} _(was pool rank ${rankOff.get(x)})_`).join("; ") || "(none)"}`);
    p();
    writeFileSync(path.join(dir, "seam.md"), D.join("\n"));

    const r1 = trace?.turns.find((t) => t.round === 1);
    const r2 = trace?.turns.find((t) => t.round === 2);
    const pk = (s?: string) => (s?.match(/"picks"\s*:\s*\[([^\]]*)\]/) ?? [])[1];
    results.push({
      archetype: c.archetype, company: c.company, country: c.country,
      pool: poolOff.length, menu: trace?.menu.length ?? 0,
      picks: trace?.picks ?? [], deepest: Math.max(-1, ...(trace?.picks ?? [])),
      keptFromTop: (trace?.picks ?? []).filter((i) => i < SELECT_COUNT).length,
      publishedOff: offIds, publishedOn: onIds, entered, left,
      unsure: trace?.unsure ?? [], retrieved: trace?.retrieved.length ?? 0,
      retrievalChangedMind: r1 && r2 ? pk(r1.reply) !== pk(r2.reply) : null,
      followed: decision?.followed.length ?? 0,
      overrode: decision?.overrode.length ?? 0,
      reached: decision?.reached.length ?? 0,
      fellBack: trace?.fellBack ?? null,
      eur: spent,
    });
    console.log(`  ${c.company.padEnd(18)} pool ${String(poolOff.length).padStart(2)} ` +
      `picks [${(trace?.picks ?? []).join(",")}]`.padEnd(24) +
      ` deepest ${String(Math.max(-1, ...(trace?.picks ?? []))).padStart(2)}` +
      ` · ${entered.length} in / ${left.length} out` +
      ` · unsure ${trace?.unsure.length ?? 0}` +
      ` · EUR ${spent.toFixed(4)}${trace?.fellBack ? "  ██ FELL BACK" : ""}`);
  }

  // ── The run's own attestation ────────────────────────────────────────────
  const prov = corpusProvenance();
  const S: string[] = [];
  const q = (s = "") => S.push(s);
  q(`# wsDQ — the ranker on the twelve bench companies`);
  q();
  q(`\`\`\``);
  q(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  q(rankerTallyLine());
  q(agentSelectTallyLine());
  q(`levers: AGENT_SELECT=${AGENT_SELECT_ARM} depth=${SELECT_DEPTH} count=${SELECT_COUNT} ` +
    `effort=${THINK_EFFORT} lookups=${LOOKUP_MAX} pool=${VERDICT_POOL} published_cap=${PUBLISH_CAP}`);
  q(`total EUR ${spend.toFixed(4)} over ${results.length} companies, ` +
    `EUR ${(spend / (results.length || 1)).toFixed(4)} each`);
  q(`\`\`\``);
  q();
  q(`| archetype | company | pool | picks (pool ranks) | deepest | kept of shipped top ${SELECT_COUNT} | rows in | rows out | unsure | EUR |`);
  q(`|---|---|---:|---|---:|---:|---:|---:|---:|---:|`);
  for (const r of results) {
    q(`| ${r.archetype} | ${r.company} | ${r.pool} | ${r.picks.join(", ")} | ${r.deepest} | ` +
      `${r.keptFromTop} | ${r.entered.length} | ${r.left.length} | ` +
      `${r.unsure.length ? r.unsure.join(",") : "—"} | ${r.eur.toFixed(4)} |`);
  }
  q();
  const n = results.length || 1;
  q(`- mean deepest reach: **${(results.reduce((a, r) => a + r.deepest, 0) / n).toFixed(1)}** ` +
    `of ${VERDICT_POOL - 1}`);
  q(`- mean rows changed in the published projection: ` +
    `**${(results.reduce((a, r) => a + r.entered.length, 0) / n).toFixed(1)}** of ${PUBLISH_CAP}`);
  q(`- companies where the model declared something unsure: ` +
    `**${results.filter((r) => r.unsure.length).length}/${results.length}**`);
  q(`- companies where retrieval changed its mind: ` +
    `**${results.filter((r) => r.retrievalChangedMind === true).length}** ` +
    `(of ${results.filter((r) => r.retrievalChangedMind !== null).length} that ran a second round)`);
  q(`- **fell back to the shipped order: ${results.filter((r) => r.fellBack).length}/${results.length}**`);
  q();
  mkdirSync(OUT_ROOT, { recursive: true });
  writeFileSync(path.join(OUT_ROOT, "SUMMARY.md"), S.join("\n"));
  writeFileSync(path.join(OUT_ROOT, "results.json"), JSON.stringify(results, null, 1));

  console.log(`\ncorpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(agentSelectTallyLine());
  console.log(`levers: AGENT_SELECT=${AGENT_SELECT_ARM} depth=${SELECT_DEPTH} count=${SELECT_COUNT} ` +
    `effort=${THINK_EFFORT} lookups=${LOOKUP_MAX} pool=${VERDICT_POOL} published_cap=${PUBLISH_CAP}`);
  console.log(`spend: EUR ${spend.toFixed(4)} total, EUR ${agentSelectCostPerBrief().toFixed(4)} per brief`);
  console.log(`wrote ${OUT_ROOT}/SUMMARY.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
