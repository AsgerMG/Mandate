// wsEJ — WHAT THE RANKER WOULD ASK, FOR NOTHING.
//
// ── Why this exists before any spend ───────────────────────────────────────
// The stage this measures makes one model call, and the only judgement left to
// that call is whether a founder could answer a question. Everything else —
// which requirement, whose, and whether its answer changes the outcome — is
// computed here, in code, with no model in the loop. So the interesting half of
// the design can be read and judged before a euro is spent, and if the
// requirements that survive are ones no founder could state, that is the
// finding, and it is better found now.
//
// It makes NO Anthropic call. It builds the pool exactly as `_wsdr_seam.ts`
// does, from Postgres and Voyage, and then runs the three legs over it. The
// prompt the model WOULD receive is written out in full, through the same
// `buildAskPrompt` the live stage calls, because pricing or grading a
// reconstruction of a prompt describes a different stage.
//
//   npx tsx scripts/_wsej_asks.ts             # first-screen answers only
//   STATE=bench npx tsx scripts/_wsej_asks.ts # the fuller wsDQ/wsDS intake
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsej_asks", ["DATABASE_URL", "VOYAGE_KEY"]);

import { intakeAnswerLines } from "../lib/intelligence/agentSelect";
import {
  findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor, isGenericSubsector,
  matchCompany, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import {
  askCandidates, buildAskPrompt, separatingDemands, ASK_WINDOW, RANKER_ASK_CAP,
} from "../lib/intelligence/rankerAsks";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import { resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import { FIELD_ENUM_HINTS } from "../lib/intelligence/types";
import { SELECT_DEPTH } from "../lib/intelligence/caps";
import type { InstrumentRow } from "../lib/intelligence/types";

const OUT = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "ranker_asks_wsEJ");
const STATE = (process.env.STATE ?? "screen1").toLowerCase();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * The intake, at the moment the ranker would ask.
 *
 * `screen1` is the honest state for this stage: the owner's shape is a fixed
 * first screen, then the subset, then these questions. Anything the adaptive
 * round would later collect is by definition not held yet.
 *
 * `bench` is the fuller answer set wsDQ and wsDS ran on, kept so a demand that
 * only survives because a field is unanswered can be told apart from one that
 * survives whatever the founder has already said.
 */
function answersFor(c: (typeof COMPANIES)[number]): Record<string, unknown> {
  const firstScreen = {
    sector: c.sector,
    entityCountries: [c.country],
    fteBand: c.fteBand,
    ticketBand: c.ticketBand,
    developmentStage: c.developmentStage,
    useOfFunds: ["experimental_development", "industrial_research"],
    ...(c.activities ? { activities: c.activities } : {}),
    ...(c.borrowerModel ? { borrowerModel: c.borrowerModel } : {}),
  };
  const rest = STATE === "bench"
    ? { exclusionFlags: ["none"], cofinancingBand: ">50%", consortium: "unsure" }
    : {};
  return sanitizeEligibility({ ...firstScreen, ...rest } as never)! as unknown as Record<string, unknown>;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsej_asks");
  resetRankerTally();
  mkdirSync(OUT, { recursive: true });

  const lines: string[] = [];
  const p = (s = "") => { lines.push(s); console.log(s); };

  p(`# What the ranker would ask — twelve archetypes, no model call`);
  p();
  p(`intake state: \`${STATE}\` · decision window: ${ASK_WINDOW} candidates`);
  p();
  p(`Every demand below is a requirement one of the candidate funds imposes, in`);
  p(`its own words, whose value we do not hold for this founder, and which`);
  p(`changes the qualification of at least one candidate depending on how it is`);
  p(`answered. All three are decided in code. Nothing here was written by a model.`);
  p();

  let withAny = 0;
  let sepAny = 0;
  const qLines: string[] = [];
  const q = (t = "") => qLines.push(t);
  q(`# The questions the ranker would ask, for the twelve archetypes`);
  q();
  q(`intake state: \`${STATE}\` · ceiling: ${RANKER_ASK_CAP} questions · no model call`);
  q();
  q(`The SUBJECT of every question below is computed, not chosen: it is a`);
  q(`requirement a candidate imposes, whose value we do not hold, and whose answer`);
  q(`changes the qualification of at least one candidate. The MEANING of each`);
  q(`question is the shipped stem for that field, which is what the founder is`);
  q(`being asked whatever wording the model puts on it. The model's own turn`);
  q(`decides which of these are answerable and rewrites the wording and the`);
  q(`labels for this company; the answer space is fixed and is shown here.`);
  q();
  const perCompany: { company: string; candidates: number; demands: number; fields: string[] }[] = [];

  for (const c of COMPANIES) {
    resetGateHydration();
    const eligibility = answersFor(c);
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
      founderCountries: founderCountryList(
        c.country, (eligibility as { entityCountries?: string[] }).entityCountries),
      capitalSought: ["grant", "loan"],
      description: c.description,
      semantic,
      ...tableInputFromAnswers(eligibility as never),
      log,
    } as never);

    const pool: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydrated, eligibility as never, log), undefined, undefined);
    const ids = pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    // Gates for every row the window can reach, so a demand is not missing
    // because its fund happened to be unhydrated.
    await hydrateGatesFor(ids.slice(0, Math.max(VERDICT_POOL, SELECT_DEPTH)));

    const demands = separatingDemands(ids, eligibility as never);
    const candidates = askCandidates(ids);
    const prompt = buildAskPrompt(candidates, demands, {
      country: c.country,
      sector: c.sector,
      description: c.description,
      answers: intakeAnswerLines(eligibility as never),
      eligibility: eligibility as never,
    });
    const dir = path.join(OUT, slug(c.company));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "prompt.txt"), prompt);
    writeFileSync(path.join(dir, "demands.json"), JSON.stringify(demands, null, 2));

    if (demands.length) withAny++;
    if (demands.some((d) => d.kind === "separating")) sepAny++;
    perCompany.push({
      company: c.company, candidates: candidates.length, demands: demands.length,
      fields: demands.map((d) => `${d.field}${d.kind === "separating" ? "*" : ""}`),
    });

    q(`## ${c.company} — ${c.archetype} (${c.country})`);
    q();
    if (!demands.length) {
      q(`No question. Nothing open would change which funds are named.`);
      q();
    }
    for (const d of demands.slice(0, RANKER_ASK_CAP)) {
      const hint = FIELD_ENUM_HINTS[d.field];
      const opts = hint
        ? (hint.optionsFor ? hint.optionsFor(eligibility as never) : hint.options)
        : [];
      q(`**Q. ${hint?.stem ?? d.field}**`);
      q();
      q(`- answers: ${opts.map((o) => o.label).join(" / ")}`);
      q(`- grounded in ${d.instrumentName}, verbatim: "${d.requirement.replace(/\s+/g, " ").trim()}"`);
      q(`- imposed by ${d.carriers} of the ${candidates.length} candidates`);
      q(`- ${d.kind}. It moves ${d.moves.length}: ` +
        d.moves.slice(0, 5).map((m) => `#${m.rank} ${m.name}`).join("; ") +
        (d.moves.length > 5 ? ` (+${d.moves.length - 5} more)` : ""));
      for (const sp of d.splits.slice(0, 8)) {
        const o = sp.opens.map((id) => `#${candidates.find((x) => x.instrumentId === id)?.rank ?? "?"}`).join(" ");
        const cl = sp.closes.map((id) => `#${candidates.find((x) => x.instrumentId === id)?.rank ?? "?"}`).join(" ");
        q(`  - \`${sp.value}\` ${[o ? `promotes ${o}` : "", cl ? `drops ${cl}` : ""].filter(Boolean).join(", ")}`);
      }
      q();
    }

    p(`## ${c.company} — ${c.archetype} (${c.country})`);
    p();
    p(`pool ${ids.length} · window ${candidates.length} · demands surviving all three legs: **${demands.length}**`);
    p();
    if (!demands.length) {
      p(`Nothing open would change which funds are named. The right output for this`);
      p(`founder is NO questions.`);
      p();
      continue;
    }
    for (const d of demands) {
      p(`- **field \`${d.field}\`** (${d.kind}) — asked because ${d.instrumentName} requires:`);
      p(`  > ${d.requirement.replace(/\s+/g, " ").trim()}`);
      if (d.carriers > 1) {
        p(`  ${d.carriers} of the ${candidates.length} candidates impose it, in their own wordings.`);
        for (const w of d.alsoWorded) {
          p(`  > ${w.instrumentName}: ${w.requirement.replace(/\s+/g, " ").trim()}`);
        }
      }
      p(`  moves ${d.moves.length} candidate(s): ` +
        d.moves.slice(0, 8).map((m) => `#${m.rank} ${m.name}`).join("; ") +
        (d.moves.length > 8 ? ` (+${d.moves.length - 8} more)` : ""));
      for (const s of d.splits) {
        const opens = s.opens.length
          ? `opens ${s.opens.map((id) => `#${candidates.find((x) => x.instrumentId === id)?.rank ?? "?"}`).join(" ")}`
          : "";
        const closes = s.closes.length
          ? `closes ${s.closes.map((id) => `#${candidates.find((x) => x.instrumentId === id)?.rank ?? "?"}`).join(" ")}`
          : "";
        p(`  - answer \`${s.value}\`: ${[opens, closes].filter(Boolean).join(", ")}`);
      }
      p();
    }
  }

  p(`## Summary`);
  p();
  p(`| company | window | demands | fields |`);
  p(`| --- | ---: | ---: | --- |`);
  for (const r of perCompany) {
    p(`| ${r.company} | ${r.candidates} | ${r.demands} | ${r.fields.join(", ") || "none"} |`);
  }
  p();
  p();
  p(`\`*\` marks a SEPARATING demand: two answers send the founder to different`);
  p(`candidates. An unmarked one only NARROWS — some answers remove candidates,`);
  p(`none is promoted past another.`);
  p();
  p(`${withAny} of ${perCompany.length} founders have at least one demand that would`);
  p(`change the outcome. The rest get no questions, and that is the designed output.`);
  p(`${sepAny} of ${perCompany.length} have at least one demand that SEPARATES.`);

  writeFileSync(path.join(OUT, `DEMANDS_${STATE}.md`), `${lines.join("\n")}\n`);
  writeFileSync(path.join(OUT, `QUESTIONS_${STATE}.md`), `${qLines.join("\n")}\n`);
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
