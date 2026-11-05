// wsFG — WHAT THE BIGGER ROW COSTS, PRICED BEFORE IT IS SPENT.
//
// The row grew: a `who may apply:` line off the fund's own page, and a
// `demands:` line that no longer goes silent when everything a fund requires is
// also required by its neighbours. Both are characters on every candidate of
// every menu, and the selector's whole design is bounded by a per-brief budget
// (see the `adviser` notes in agentSelect.ts: about EUR 0.04 a brief).
//
// So it is measured through the arm built to measure it. `dry` builds the
// IDENTICAL prompt through the IDENTICAL code path and runs the IDENTICAL
// retrieval, and never calls Anthropic — pricing a reconstruction is how a cost
// estimate quietly describes a different arm. NOTHING HERE MAKES A PAID
// ANTHROPIC CALL; the arm returns before the client is ever constructed.
//
// The arm is read once at module scope, so it must be set on the command line
// and this script REFUSES to run under any other arm rather than reporting a
// different arm's number under this banner:
//
//   AGENT_SELECT=dry npx tsx scripts/_wsfg_cost.ts
//   AGENT_SELECT=dry COUNTRY=Norway,Germany npx tsx scripts/_wsfg_cost.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsfg_cost", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  AGENT_SELECT_ARM, agentSelectDrySizes, agentSelectExitLine, agentSelectMemoPool,
  resetAgentSelectTally,
} from "../lib/intelligence/agentSelect";
import { costOf } from "../lib/intelligence/cost";
import {
  hydrateDbInstruments, hydrateGatesFor, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { selectorSystemPrompt } from "../lib/intelligence/agentSelect";
import type { EligibilityAnswers } from "../lib/intelligence/types";

const COUNTRIES = (process.env.COUNTRY ??
  "Germany,France,Norway,Czechia,Estonia,Sweden,Poland,Spain,Italy,Netherlands,Finland,Denmark,Austria,Portugal")
  .split(",").map((c) => c.trim()).filter(Boolean);

const DESCRIPTION =
  "a robotics company building autonomous warehouse handling systems, with a "
  + "machine-vision stack it develops itself and pilot customers in logistics";

/** Characters to tokens.
 *
 *  A RATIO, stated as one, because the alternative is a token-count call per
 *  menu and this file exists to price the arm without touching the API. 3.6 is
 *  the conservative end for the mixed European administrative prose these
 *  prompts are made of -- French, Estonian and Czech scheme text tokenises
 *  worse than English, and a ceiling that under-counts is the failure this
 *  repo's cost module warns about in its own header. */
const CHARS_PER_TOKEN = 3.6;
const MODEL = process.env.AGENT_SELECT_MODEL ?? "claude-sonnet-5";
/** What the reply is: a handful of integers, plus whatever thinking the effort
 *  level buys. Priced at the adviser's own measured spend rather than at its
 *  ceiling — `max_tokens` is headroom and nothing bills for headroom. */
const REPLY_TOKENS = 520;

async function main() {
  if (AGENT_SELECT_ARM !== "dry") {
    console.error(
      `_wsfg_cost: refusing to run under arm="${AGENT_SELECT_ARM}". This script ` +
      `prices the prompt the ADVISER would send, and only the \`dry\` arm builds ` +
      `it without calling Anthropic.\n  AGENT_SELECT=dry npx tsx scripts/_wsfg_cost.ts`);
    process.exit(1);
  }
  await hydrateDbInstruments();
  requireLiveCorpus("wsfg_cost");
  resetAgentSelectTally();

  const semantic = await semanticFundMatch(DESCRIPTION);
  const system = selectorSystemPrompt();

  for (const country of COUNTRIES) {
    const eligibility: EligibilityAnswers = {
      sector: "industrial_manufacturing",
      entityCountries: [country],
      ticketBand: "b500k_2m5",
      useOfFunds: ["rnd", "capex"],
      consortium: "unsure",
      fteBand: "10-49",
      turnoverBand: "<2M",
      developmentStage: "pilot_customers",
      organisationType: "private_company",
    } as EligibilityAnswers;
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: founderCountryList(country, eligibility.entityCountries),
      capitalSought: [],
      description: DESCRIPTION,
      semantic,
      ...tableInputFromAnswers(eligibility),
      log,
    } as never);
    const pool = applyProfileSignal(
      accessiblePool(hydrated, eligibility, log).slice(0, VERDICT_POOL), undefined, undefined);
    if (!pool.length) continue;
    await hydrateGatesFor(
      pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)));
    await agentSelectMemoPool(pool, { country, description: DESCRIPTION, eligibility });
  }

  const { prompts, evidence, retrieved } = agentSelectDrySizes();
  if (!prompts.length) {
    console.error("_wsfg_cost: the seam was never reached — nothing to price.");
    console.error(agentSelectExitLine());
    process.exit(1);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sysTok = system.length / CHARS_PER_TOKEN;
  // Round two carries the whole round-one prompt again plus the retrieved
  // evidence: the adviser re-asks, it does not ask a smaller question.
  const evMean = evidence.length ? mean(evidence) : 0;
  const rows = prompts.map((chars, i) => {
    const one = sysTok + chars / CHARS_PER_TOKEN;
    const two = evidence.length
      ? sysTok + (chars + (evidence[i] ?? evMean)) / CHARS_PER_TOKEN : 0;
    const eur = costOf(MODEL, { input_tokens: Math.round(one), output_tokens: REPLY_TOKENS })
      + (two ? costOf(MODEL, { input_tokens: Math.round(two), output_tokens: REPLY_TOKENS }) : 0);
    return { chars, inTok: one + two, eur };
  });

  console.log(`\narm=${AGENT_SELECT_ARM} model=${MODEL} — ${prompts.length} menu(s) priced, ` +
    `0 Anthropic calls\n`);
  console.log(`  system prompt        ${system.length.toLocaleString()} chars ` +
    `(${Math.round(sysTok).toLocaleString()} tok), identical on every brief`);
  console.log(`  user prompt (menu)   mean ${Math.round(mean(prompts)).toLocaleString()} chars, ` +
    `min ${Math.min(...prompts).toLocaleString()}, max ${Math.max(...prompts).toLocaleString()}`);
  console.log(`  round-two evidence   ${retrieved} menu(s) retrieved, ` +
    `mean ${Math.round(evMean).toLocaleString()} chars`);
  console.log(`\n  INPUT TOKENS / BRIEF ${Math.round(mean(rows.map((r) => r.inTok))).toLocaleString()} ` +
    `(both rounds, at ${CHARS_PER_TOKEN} chars/token)`);
  console.log(`  EUR / BRIEF          ${mean(rows.map((r) => r.eur)).toFixed(4)} ` +
    `(worst menu ${Math.max(...rows.map((r) => r.eur)).toFixed(4)})`);
  console.log(`\n${agentSelectExitLine()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
