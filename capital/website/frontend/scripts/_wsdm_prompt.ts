// wsDM — WHAT DOES THE SELECTOR'S PROMPT COST, AT WHICH DEPTH?
//
// Prompt length is the binding cost on this arm, and two changes in this
// workstream move it in opposite directions:
//
//   the scheme's own sentence lands on every row      row gets LONGER
//   the depth cut comes off, so the whole pool ships  list gets LONGER
//
// The second is the one that matters. `SELECT_DEPTH = 40` capped the arm's
// achievable ceiling at 74.2% while the won leaf's rank in the pool is median
// 21 and p75 38, so the cut bit exactly where the hard cases are. The whole
// pool takes the ceiling to the pool's own containment. Neither claim is worth
// anything without the price, so this measures it.
//
// FREE OF ANTHROPIC SPEND. It runs the arm under AGENT_SELECT=dry, which builds
// the identical prompt through the identical code path and never calls the
// model. It touches Postgres and one Voyage embedding per case, both fractions
// of a cent and neither billed by Anthropic. The embedding is not optional:
// the row ORDER is what a depth cut truncates, so pricing a lexically-ranked
// pool would price a list nobody ships. The run attests the ranker it used.
//
// Run it twice, because the arm reads its flags once at module scope by
// design (a flag consulted per call is a flag that can change mid-run):
//
//   AGENT_SELECT=dry AGENT_SELECT_DEPTH=40 npx tsx scripts/_wsdm_prompt.ts
//   AGENT_SELECT=dry                       npx tsx scripts/_wsdm_prompt.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wsdm_prompt", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  AGENT_SELECT_ARM, SELECT_COUNT, SELECT_DEPTH, agentSelectDrySizes,
  agentSelectRows, intakeAnswerLines, resetAgentSelectTally,
  selectorSystemPrompt,
} from "../lib/intelligence/agentSelect";
import { hydrateDbInstruments } from "../lib/intelligence/corpus";
import { costOf } from "../lib/intelligence/cost";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  buildInstrumentTableHydrated, tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import { ARCHETYPES, archetypeAnswers } from "../lib/intelligence/__archetypes";

/** Tokens from characters, deliberately conservative. The real ratio for this
 *  prompt shape -- prose thick with proper nouns, numbers and non-English
 *  scheme titles -- runs near 3.6; under-estimating a budget is the failure
 *  that matters, so 3.4 is used. Same constant as scripts/_wsdd_cost.ts. */
const tok = (chars: number) => Math.ceil(chars / 3.4);

const q = (xs: number[], p: number) =>
  xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : NaN;

/** Euros for one call of this size, through the ONE price table in cost.ts
 *  rather than a second copy of the rates. `max_tokens` is priced in full at
 *  the output rate, because a budget is what you can be charged. */
const price = (inChars: number, outTok = 1024) =>
  costOf("claude-sonnet-5", { input_tokens: tok(inChars), output_tokens: outTok });

async function main() {
  if (AGENT_SELECT_ARM !== "dry") {
    throw new Error(
      `this script prices the selector and must run under AGENT_SELECT=dry ` +
      `(got "${AGENT_SELECT_ARM}"). Any other arm makes real calls, which is ` +
      `the thing it exists to avoid.`);
  }
  await hydrateDbInstruments();
  resetRankerTally();
  resetAgentSelectTally();

  const pools: number[] = [];
  /** `\n     funds: ` -- the prefix renderRow spends on the line. */
  const FUNDS_LINE = 12;
  let descRows = 0, descChars = 0;
  for (const a of ARCHETYPES) {
    const answers = archetypeAnswers(a) as never;
    const semantic = await semanticFundMatch(a.description);
    const rows = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: [a.country],
      capitalSought: ["grant", "loan"],
      description: a.description,
      semantic,
      ...tableInputFromAnswers(answers),
    } as never);
    pools.push(rows.length);
    // What the scheme's own sentence costs, separated from what the depth
    // costs. Two changes lengthen this prompt and only one of them is large;
    // reporting a single total would let the cheap one carry the blame.
    const shown = Number.isFinite(SELECT_DEPTH) ? rows.slice(0, SELECT_DEPTH) : rows;
    descRows += shown.filter((r) => r.description).length;
    descChars += shown.reduce((a, r) => a + (r.description ? r.description.length + FUNDS_LINE : 0), 0);
    await agentSelectRows(rows, {
      country: a.country,
      sector: a.sector,
      description: a.description,
      answers: intakeAnswerLines(answers),
    });
  }

  const { prompts, system, menuRows, evidence, retrieved } = agentSelectDrySizes();
  console.log(`  ${rankerTallyLine()}`);
  if (!prompts.length) throw new Error("no prompts were built; nothing to price");

  const medPool = q(pools, .5), medMenu = q(menuRows, .5), medPrompt = q(prompts, .5);
  const perRow = (medPrompt - system) / Math.max(1, medMenu);
  console.log(`
DEPTH ${Number.isFinite(SELECT_DEPTH) ? SELECT_DEPTH : "whole pool"}   count=${SELECT_COUNT}   ${prompts.length} case(s) priced, NO Anthropic call made

  pool rows available     median ${medPool}   p90 ${q(pools, .9)}
  rows actually shown     median ${medMenu}   p90 ${q(menuRows, .9)}
  system prompt           ${system} chars ~= ${tok(system)} tokens (the contracts, constant per request)
  user message            median ${medPrompt - system} chars
  TOTAL INPUT             median ${medPrompt} chars ~= ${tok(medPrompt)} tokens   p90 ${tok(q(prompts, .9))} tokens
  per candidate row       ~${Math.round(perRow)} chars
  of which the scheme's own sentence: ${Math.round(descChars / prompts.length)} chars per prompt` +
    ` across ${(descRows / prompts.length).toFixed(0)} of ${medMenu} rows` +
    `  =  EUR ${(price(medPrompt) - price(medPrompt - descChars / prompts.length)).toFixed(4)} per brief`);

  const r1 = price(medPrompt);
  const medEv = evidence.length ? q(evidence, .5) : 0;
  console.log(`
COST PER BRIEF, claude-sonnet-5 at list, max_tokens priced in full
  round 1 only                       EUR ${r1.toFixed(4)}` +
    (medEv ? `
  + round 2 evidence (${retrieved}/${prompts.length} cases)      EUR ${price(medPrompt + medEv, 1536).toFixed(4)}` : ""));
  console.log(`
  against the free arm's measured EUR 0.0125 per brief: ${(r1 / 0.0125).toFixed(1)}x
  target EUR 0.04 -> ${r1 <= 0.04 ? "WITHIN BUDGET" : "OVER TARGET"}` +
    `;  wall EUR 0.50 -> ${r1 <= 0.5 ? "clear" : "BREACHED"}`);
  for (const n of [60, 120, 250]) {
    console.log(`  a measurement run at N=${String(n).padStart(3)}   EUR ${(r1 * n).toFixed(2)}`);
  }
  // Cheap sanity that the system prompt is the contracts and not an empty
  // string: a routing mistake would price a call with no instructions in it.
  if (!selectorSystemPrompt().includes("CONTRACT SELECT")) {
    throw new Error("the selector's system prompt does not carry the selection contract");
  }
}
main();
