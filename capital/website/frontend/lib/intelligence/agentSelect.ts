// wsDD — A MODEL IN THE SELECTION SEAT.
//
// Every ordering attempt in this project has been arithmetic over precomputed
// features, and all of them are closed by measurement: no single signal beats
// the shipped ranker, the seat allocation is optimal at every count, a +6.0
// paired re-ordering delivers zero through the shipped path, and an oracle
// holding the answer key gains one case in six hundred by per-row routing.
// Nothing has ever READ the funds and the founder and CHOSEN.
//
// ── WHAT THE SELECTOR SEES, AND THE ARITHMETIC THAT SIZES IT ──────────────
// Measured, not assumed (scripts/_wsdd_seam.ts, tune, N=120, all on EMBEDDING):
//
//   published table          exactly 6 rows, always. It IS instrumentTable.
//   candidate pool           min 25, p25 79, MEDIAN 105, p75 125, max 185
//   won leaf in the pool     95.0%
//   won leaf rank in pool    median 21, p75 38  (among the cases it is in)
//
// So the brief's premise that a selector re-picks from ~18-29 rows is wrong in
// both directions: the published table is SIX, and reselecting over it has a
// ceiling of 26.7% — which is the shipped number itself, i.e. exactly zero
// headroom. The list to read is the RANKED POOL, and its depth is a real
// trade, because a selector cannot pick what it was not shown:
//
//   K=10  ceiling 33.3%   K=20  ceiling 46.7%   K=30  ceiling 65.0%
//   K=40  ceiling 74.2%   K=50  ceiling 80.0%   K=75  ceiling 86.7%
//
// and chance (six blind picks out of K) falls as 6/K: 15.0% at K=40. Those two
// curves cross the shipped 26.7% in opposite directions, which is what made
// K=40 the pilot depth: the ceiling is nearly three times the shipped number
// and chance is well below it, so the arm could neither be flattered by a short
// list nor rescued by a lucky one.
//
// K=40 IS NO LONGER THE DEFAULT (wsDM). It bought a chance-rate argument at the
// price of 21 points of ceiling, and it spent them exactly where the hard cases
// are: the won leaf's rank in the pool is median 21 and p75 38, so a cut at 40
// removes the cases the shipped ranker is worst at and keeps the ones it is
// already right about. Chance is also not the comparison that decides anything
// here, because the control is the shipped order rather than a coin. The whole
// pool now ships, and what it costs is measured rather than feared
// (scripts/_wsdm_prompt.ts, 12 archetypes, dry arm, no Anthropic call):
//
//   depth 40      median 40 rows    9,575 input tokens    EUR 0.027 per brief
//   whole pool    median 107 rows  23,493 input tokens    EUR 0.053 per brief
//
// so the ceiling costs about EUR 0.026 a brief. That is over the EUR 0.04
// target and far inside the EUR 0.50 wall; the target is a number to revisit
// against what the arm scores, not a reason to keep a cut that caps it.
//
// ── THE LEAK, WHICH IS THE WHOLE DIFFICULTY ───────────────────────────────
// A model with retrieval is the easiest way yet to reintroduce it. State the
// reach PER PATH, because the two vector indexes are not the same risk and
// treating them as one is how this gets shipped wrong.
//
//   instrument_profiles — WHAT A FUND FUNDS. Its `profile_text` is built by
//     ETL/terms/build_instrument_profiles.py and section 5 of that document is
//     literally "Projects it has actually funded: " followed by up to 40 real
//     `public_funding_events.project_title` strings. For a `project`-mode
//     recall pair the founder's description IS a project title. Handing this
//     text to a selector is handing it the answer key, and the number would
//     rise for exactly that reason.
//
//     THE SHIPPED RANKER ALREADY USES THIS INDEX AND IS NOT LEAKING, because
//     it consumes a SCALAR: semanticFundMatch returns a percentile per
//     instrument and never the text behind it, and ETL/lib/recall_holdout.py
//     strips a graded pair's own title out of the document before it is
//     embedded. So the rule this module holds is narrow and testable: the
//     selector may consume the semantic SCORE, which is already in the shipped
//     path, and MUST NEVER be shown profile_text. It never is — nothing here
//     queries instrument_profiles at all.
//
//   eligibility_embeddings — WHAT A FUND DEMANDS. embed_eligibility.py writes
//     one row per gate whose text is `requirement` plus an optional
//     `Value: ...`, drawn from eligibility_gates. There is no beneficiary, no
//     award, no amount and no project title in that table by construction, so
//     no query against it can return who won. This is the index a selector may
//     read freely — and it is, pointedly, the one with zero production call
//     sites today, so it is also the only genuinely NEW information available.
//
//   the rendered rows — gate `requirement` text (judgementCriteria), the
//     corpus-wide award median and count, the delivery body, the last award
//     year, and (wsDM) `InstrumentRow.description`, the scheme's own statement
//     of what it funds, off its own page. That last one is a statement of
//     SCOPE: the enrichment that produced it has no beneficiary, award or
//     title column, and `scripts/_wsdi_leak.ts` tested it across the 7,095-pair
//     recall set — no company name appears in any description, and no
//     company's own intake text appears in the description of the fund it won.
//     Do not confuse it with `instrument_profiles.profile_text`, which embeds
//     the same sentence AND forty real winning project titles.
//     All of these are aggregates over the fund's whole award history or
//     statements of what it demands. None is conditioned on THIS founder.
//
//   usedInField — DELIBERATELY NOT RENDERED. It is tier 1 of the shipped row
//     sort and it is true when the founder's own traced awards used a channel,
//     which for a replayed founder contains the answer. The harness withholds
//     it (ownHistory: "withheld") and the honest thing is for the selector not
//     to read it either, rather than to rely on a harness flag being set.
//
// ── WHAT IT MAY DO TO THE PAGE ────────────────────────────────────────────
// A PURE REORDER of rows the shipped path already built and already cleared.
// It adds nothing, removes nothing and re-gates nothing, so no row can be
// published that the shipped selection did not already deem publishable, and
// check_winner_not_gated / check_winner_not_blocked are untouched by
// construction. On any failure — bad JSON, timeout, missing key, an id it made
// up — the shipped order is returned unchanged. That is the floor, and it is
// the property that makes the arm safe to measure at all.
//
// Founder prose is untrusted: it arrives through `fence`, which declaws
// prompt-control sequences and marks the block as data. A description is not
// an instruction.
import Anthropic from "@anthropic-ai/sdk";

import { assembleInstructions } from "./contracts";
import { recordUsage } from "./cost";
import { retrieveDemands } from "./demandRetrieval";
import type { EligibilityAnswers, InstrumentRow } from "./types";
import { peerPrior } from "./shortlist";
import { fence } from "./untrusted";

/** The arms. `off` is the default and is bit-identical to the shipped path. */
export type AgentSelectArm = "off" | "rows" | "assist" | "adviser" | "dry";
const ARMS: AgentSelectArm[] = ["off", "rows", "assist", "adviser", "dry"];

/**
 * Read ONCE, at module scope, and throw on anything unrecognised.
 *
 * A flag consulted per call is a flag that can change mid-run, and a flag that
 * silently treats a typo as "off" is how an arm reports the control's number
 * under the treatment's name. Both failure modes have cost this repo a
 * retracted figure, so neither is available here.
 */
export const AGENT_SELECT_ARM: AgentSelectArm = (() => {
  const raw = process.env.AGENT_SELECT ?? "off";
  if (!ARMS.includes(raw as AgentSelectArm)) {
    throw new Error(
      `AGENT_SELECT must be one of ${ARMS.join("|")}, got "${raw}". ` +
      `It is read once at module scope precisely so a typo cannot read as "off".`);
  }
  return raw as AgentSelectArm;
})();

export const agentSelectEnabled = (): boolean => AGENT_SELECT_ARM !== "off";

/**
 * How deep into the ranked pool the selector reads. UNSET MEANS THE WHOLE
 * POOL, and that is the measurement, not a preference.
 *
 * A depth is a hard ceiling on what this arm can ever score, because a
 * selector cannot pick what it was not shown, and the won leaf's rank in the
 * pool is median 21 and p75 38. So a cut at 40 lands exactly where the hard
 * cases live:
 *
 *   K=10  33.3%   K=20  46.7%   K=30  65.0%   K=40  74.2%   K=50  80.0%
 *   K=75  86.7%   whole pool = the pool's own containment
 *
 * The last figure is the one to be careful with, because it is the SAME
 * measurement as "is the won leaf in the pool at all": 95.0% on the wsDD tune
 * split at N=120, 97% on the wider survey this workstream was briefed from. It
 * moves with the pool, not with this module, and no depth can exceed it.
 *
 * The pilot chose 40 to hold chance (six blind picks out of K, so 6/K) below
 * the shipped 26.7%. That trade was worth making when nothing was known about
 * whether a model could read a row at all; it is not worth 21 points of
 * ceiling now, and chance is not the comparison that decides anything -- the
 * comparison is the shipped order, which is on the page either way.
 *
 * The cost is the prompt, and the prompt is the binding constraint here, so
 * the depth stays configurable and every measurement reports the size it ran
 * at. Set AGENT_SELECT_DEPTH to reintroduce a cut.
 */
export const SELECT_DEPTH = Number(process.env.AGENT_SELECT_DEPTH ?? 0) || Infinity;
/** For a run banner: a depth nobody set should not print as a number nobody
 *  chose. */
const depthLabel = (): string =>
  Number.isFinite(SELECT_DEPTH) ? String(SELECT_DEPTH) : "whole pool";
/** How many rows it names. DISPLAY_CAP is 6; asking for exactly the number the
 *  page shows means a short reply is a visible defect rather than a silent
 *  top-up from the order we are trying to test. */
export const SELECT_COUNT = Number(process.env.AGENT_SELECT_COUNT ?? 6);
/**
 * `assist` only: how many of the shipped top rows are FROZEN.
 *
 * The free arm measured EXACT@6 17% against the shipped 27%, and the shape of
 * the loss says what went wrong: CHANNEL@5 fell 92% -> 75%, so the model was
 * not picking the wrong sibling, it was leaving the right neighbourhood
 * altogether. That is a judgement failure with the prior switched off, not a
 * shortage of information about what the funds demand.
 *
 * So bound it. The shipped order keeps the first KEEP seats -- the ones the
 * empirical ranker is most confident about and most often right about -- and
 * the model spends the remaining seats reaching into ranks it would otherwise
 * never reach. This is the only shape in which the model's judgement can ADD a
 * case without being able to destroy one: the frozen seats are exactly the
 * control's, so the arm's floor is the control's score on those seats.
 */
export const SELECT_KEEP = Number(process.env.AGENT_SELECT_KEEP ?? 3);

/**
 * `adviser` only: the thinking budget, and how many candidates it may look up.
 *
 * BOTH ARE COST CONTROLS, and the budget is the binding constraint on this
 * whole design. Thinking bills as OUTPUT — 5x the input rate — so a generous
 * budget is the fastest way to turn a EUR 0.012 brief into a EUR 0.20 one. The
 * target is about EUR 0.04 per brief, roughly triple the free arm, and these
 * two numbers are what hold it there:
 *
 *   1024 thinking tokens is room to weigh a shortlist, not room to ruminate.
 *   Retrieval fires ONLY on candidates the model itself declares ambiguous,
 *   capped at LOOKUP_MAX. Retrieving for all 40 rows would cost more than the
 *   brief is allowed to and would bury the separating fact in bulk text —
 *   which is the failure the free arm already demonstrated.
 *
 * A selector that needs half a euro per founder to beat a free ranker is not a
 * product, so the design is shaped by the budget rather than apologising to it.
 *
 * NOTE ON THE API, paid for once: claude-sonnet-5 REMOVED the fixed thinking
 * budget. `thinking: {type: "enabled", budget_tokens: N}` returns a 400 --
 * "not supported for this model. Use thinking.type.adaptive and
 * output_config.effort" -- and the first 120-case run of this arm failed every
 * call that way. Depth is now an EFFORT level, and the hard ceiling is
 * `max_tokens`, which caps thinking and reply TOGETHER. So max_tokens is the
 * cost bound here, not a suggestion: at effort "low" the reply is a handful of
 * integers and 1,536 tokens is ample, while bounding the worst case at about
 * EUR 0.014 of output per call.
 */
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ThinkEffort = (typeof EFFORTS)[number];
/** Validated at module scope for the same reason the arm is: an unrecognised
 *  effort must fail loudly, not silently fall through to the model default and
 *  bill at a depth nobody chose. */
export const THINK_EFFORT: ThinkEffort = (() => {
  const raw = process.env.AGENT_SELECT_EFFORT ?? "low";
  if (!EFFORTS.includes(raw as ThinkEffort)) {
    throw new Error(`AGENT_SELECT_EFFORT must be one of ${EFFORTS.join("|")}, got "${raw}"`);
  }
  return raw as ThinkEffort;
})();
export const LOOKUP_MAX = Number(process.env.AGENT_SELECT_LOOKUPS ?? 5);

const MODEL = process.env.AGENT_SELECT_MODEL ?? "claude-sonnet-5";
const TIMEOUT_MS = 40_000;

/**
 * Constructed LAZILY, and that is not a style choice.
 *
 * ES imports are hoisted, so a module-scope `new Anthropic()` runs before the
 * importing script's body -- and every harness in this repo loads credentials
 * in its body, via `loadEnvLocal()`. A client built at import time therefore
 * captures the environment as it was BEFORE .env.local was read, and every
 * call fails authentication. Measured: the first 120-case run of this arm made
 * 120 calls, all of which failed that way, and reported the CONTROL's numbers.
 * The arm attestation caught it; nothing else would have.
 */
let lastUnsureIds: string[] = [];
let clientMemo: Anthropic | null = null;
const anthropic = (): Anthropic => (clientMemo ??= new Anthropic());

/** Per-run counters, so a measurement can say what actually happened rather
 *  than assume the arm ran. A run where every call failed and fell back would
 *  otherwise print the control's number under the treatment's banner. */
const tally = {
  calls: 0, ok: 0, failed: 0, shortReply: 0, invalidIds: 0,
  emptyReply: 0, badJson: 0, eur: 0, lookups: 0, resolved: 0,
  /** `dry` only: the size of the prompt the adviser WOULD have sent, and of
   *  the evidence round two would have carried. Priced by _wsdd_cost.ts. */
  dryChars: [] as number[], dryEvidenceChars: [] as number[], dryRetrieved: 0,
  /** The system half of that, which is constant per process, and how many
   *  candidate rows each priced prompt carried. Reported separately because
   *  they are the two levers on the size: the contract, and the depth. */
  drySystemChars: 0, dryMenuRows: [] as number[],
};
export function resetAgentSelectTally(): void {
  tally.calls = 0; tally.ok = 0; tally.failed = 0;
  tally.shortReply = 0; tally.invalidIds = 0;
  tally.emptyReply = 0; tally.badJson = 0; tally.eur = 0;
  tally.lookups = 0; tally.resolved = 0;
  tally.dryChars = []; tally.dryEvidenceChars = []; tally.dryRetrieved = 0;
  tally.drySystemChars = 0; tally.dryMenuRows = [];
}
export function agentSelectTallyLine(): string {
  if (!tally.calls) return `agent-select: arm=${AGENT_SELECT_ARM}, no calls made`;
  return `agent-select: arm=${AGENT_SELECT_ARM} depth=${depthLabel()} count=${SELECT_COUNT}` +
    (AGENT_SELECT_ARM === "assist" ? ` keep=${SELECT_KEEP}` : "") +
    (AGENT_SELECT_ARM === "adviser"
      ? ` effort=${THINK_EFFORT} lookups=${tally.lookups} (${tally.resolved} brief(s) retrieved)` : "") +
    ` model=${MODEL} — ${tally.ok}/${tally.calls} chose, ${tally.failed} FELL BACK to the` +
    ` shipped order (${tally.emptyReply} empty reply, ${tally.badJson} unparseable),` +
    ` ${tally.shortReply} short reply, ${tally.invalidIds} unusable id(s)` +
    `, EUR ${tally.eur.toFixed(4)} total, EUR ${(tally.eur / tally.calls).toFixed(4)} per brief`;
}
/** `dry` only. The measured prompt sizes, for pricing an arm before running
 *  it — the budget is per brief and has to be known in advance, not found in
 *  the invoice. */
export function agentSelectDrySizes(): {
  prompts: number[]; evidence: number[]; retrieved: number;
  system: number; menuRows: number[];
} {
  return {
    prompts: [...tally.dryChars], evidence: [...tally.dryEvidenceChars],
    retrieved: tally.dryRetrieved,
    system: tally.drySystemChars, menuRows: [...tally.dryMenuRows],
  };
}

/**
 * ── WHAT THE MODEL DID WITH THE PRIOR, recorded for the case just decided ──
 *
 * wsCZ (e32c0c4b) established that the peer prior is substantially INFERRED
 * rather than observed: 44% of its slots are held by inference, and the
 * canonical example is a film scheme credited by 215 awards from 170 German
 * software companies under entirely different schemes. `applyPeerPrecedence`
 * copies that cell order wholesale.
 *
 * That changes what this arm is for. Handing the model a prior that is 44%
 * inference and asking it to adjudicate is not "give the model the answer" —
 * it is a test of whether a reader of the actual fund text can tell a sound
 * prior slot from an unsound one. So the headline number is the less
 * interesting half. The interesting half is: when the model OVERRODE the
 * prior, was it right?
 *
 * Recorded here and joined against the answer key in the harness, because only
 * the harness knows which fund won and this module must never.
 */
export interface PriorDecision {
  /** Menu candidates the peer prior ranked at all, best first. */
  priorRanked: string[];
  /** What the model chose, in its order. */
  picked: string[];
  /** Picks that the prior had also ranked — the model FOLLOWED the prior. */
  followed: string[];
  /** Prior-ranked candidates the model declined to pick — OVERRIDES. */
  overrode: string[];
  /** Picks the prior had not ranked at all — the model REACHED past it. */
  reached: string[];
  /** Candidates the model said it could not tell apart. */
  unsure: string[];
}
let lastDecision: PriorDecision | null = null;
export function agentSelectLastDecision(): PriorDecision | null { return lastDecision; }

export function agentSelectCostPerBrief(): number {
  return tally.calls ? tally.eur / tally.calls : 0;
}

const eur = (n: number | undefined | null): string =>
  n == null || !Number.isFinite(n) ? "n/a"
    : n >= 1e6 ? `EUR ${(n / 1e6).toFixed(1)}M`
      : n >= 1e3 ? `EUR ${Math.round(n / 1e3)}k` : `EUR ${Math.round(n)}`;

/** A title on one line and short enough to read. Some German and French legal
 *  titles run past 250 characters with embedded newlines. */
const oneLine = (s: string, max = 120): string => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
};

/**
 * Requirements that are NOT shared with most of the list.
 *
 * 66% of candidate rows share their entire requirement block byte-for-byte
 * with a sibling — "Tobacco, gambling and betting, and weapons and munitions
 * are outside the scope" alone appeared on 2,316 of 4,626 rendered rows.
 * Printing it forty times spends a third of the prompt saying something
 * identical about every option, which is the definition of an uninformative
 * feature, and it crowds out the facts that separate. Same reasoning, and the
 * same 0.35 cutoff, as fundSelection.ts.
 */
function distinctive(rows: InstrumentRow[]): (r: InstrumentRow) => string[] {
  const seen = new Map<string, number>();
  for (const r of rows) for (const g of r.judgementCriteria ?? []) {
    seen.set(g, (seen.get(g) ?? 0) + 1);
  }
  const cutoff = Math.max(2, Math.ceil(rows.length * 0.35));
  return (r) => (r.judgementCriteria ?? [])
    .filter((g) => (seen.get(g) ?? 0) < cutoff).slice(0, 2).map((g) => oneLine(g, 180));
}

/**
 * WHAT THE PRIOR KNOWS, handed to the model as INPUT rather than as a rule.
 *
 * The free arm's failure was judgement with the prior switched off: CHANNEL@5
 * fell 92% -> 75%, so the model was leaving the right neighbourhood, not
 * picking the wrong sibling. It never saw the one thing the ranker is built
 * from — which funds companies like this one have actually won. This hands it
 * over as a fact it may weigh and, where the fund plainly does not fit, may
 * overrule. That is the adjudication the ranker cannot do and the free arm had
 * no basis for.
 *
 * LEAK: `peerPrior` reads peerPrior.generated.json, emitted by
 * ETL/terms/emit_peer_prior.py, which resolves its holdout through
 * ETL/lib/recall_holdout.py and drops EVERY company in EVERY `__recallSet*.json`
 * by glob, BY DEFAULT, before counting a single pair. The founder being
 * replayed is therefore absent from the statistic that describes them, and the
 * rank below cannot have been computed from the award we are asking the model
 * to predict.
 */
function peerRank(country?: string, sector?: string): Map<string, number> {
  const out = new Map<string, number>();
  try {
    peerPrior(country, sector).forEach((id, i) => { if (!out.has(id)) out.set(id, i + 1); });
  } catch { /* the prior is optional; its absence must not fail a brief */ }
  return out;
}

/** One candidate as the model reads it. Everything here is either a statement
 *  of what the fund DEMANDS or an aggregate over its whole award history;
 *  nothing is conditioned on this founder. `usedInField` is omitted on purpose
 *  — see the header. */
function renderRow(
  i: number, r: InstrumentRow, reqs: string[], peers?: Map<string, number>,
): string {
  const facts: string[] = [];
  if (r.administeringBody) facts.push(oneLine(r.administeringBody, 70));
  if (r.country) facts.push(r.country);
  if (r.capitalType) facts.push(r.capitalType);
  if (r.typicalAward != null && (r.typicalAwardN ?? 0) >= 5) {
    facts.push(`typical award ${eur(r.typicalAward)} over ${r.typicalAwardN} real awards`);
  } else facts.push("no reliable award median");
  if (r.lastAwardYear) facts.push(`last awarded ${r.lastAwardYear}`);
  if (r.descriptor) facts.push(oneLine(r.descriptor, 60));
  const pr = r.instrumentId ? peers?.get(r.instrumentId) : undefined;
  if (pr) facts.push(`#${pr} most-won by comparable companies`);
  return [
    `[${i}] ${oneLine(r.instrument)}`,
    `     ${facts.join(" · ")}`,
    // ── WHAT THE SCHEME SAYS IT FUNDS, in its own words ──────────────────
    // Everything else on this row is OURS: a title, a body, a country, a
    // capital label, medians we computed, a descriptor we composed from
    // measured columns. Nine clusters of one programme produce nine rows whose
    // every one of those fields agrees, and the only thing on the page that
    // says what any of them is FOR is this line.
    //
    // Read-safe on the request path by the argument in corpus.ts and tested
    // across the whole recall set: it is a statement of scope with no
    // beneficiary, award or project title in it. Distinct from
    // `instrument_profiles.profile_text`, which carries real winning project
    // titles and is not reachable from here.
    //
    // Already budgeted by `fundsSentence` on the row (180 chars, whole
    // sentences). Not re-cut here: one budget, one place.
    r.description ? `     funds: ${r.description}` : "",
    reqs.length ? `     demands: ${reqs.join(" / ")}` : "",
  ].filter(Boolean).join("\n");
}

export interface SelectContext {
  country?: string;
  sector?: string;
  /** The founder's own free text. UNTRUSTED — fenced, never interpolated raw. */
  description?: string;
  /** What the founder answered on the intake, already rendered as short
   *  `label: value` lines by the caller. Trusted: these are our own option
   *  labels from the vocabulary contract, not free text. */
  answers?: string[];
}

/**
 * The founder's intake, as short trusted lines.
 *
 * These are OUR option values from the vocabulary contract, not free text, so
 * they need no fencing — but they do need to be selective. Dumping the whole
 * answers object would spend the prompt on fields that separate nothing here
 * and would put the founder's every answer in front of the model whether or
 * not any candidate demands it. These are the fields the shipped row sort
 * itself reads, and no more.
 */
export function intakeAnswerLines(a: EligibilityAnswers | undefined): string[] {
  if (!a) return [];
  const out: string[] = [];
  const say = (label: string, v: unknown) => {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
    out.push(`${label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  };
  say("how much they are looking for", a.ticketBand);
  say("what the money is for", a.useOfFunds);
  say("stage", a.developmentStage);
  say("headcount", a.fteBand);
  say("turnover", a.turnoverBand);
  say("founded", a.foundedYear);
  say("kind of organisation", a.organisationType);
  say("where the funded work will physically sit", a.activityCountries);
  say("region", a.region);
  say("able to run in a 3+ partner consortium", a.consortium);
  say("institutional investors aboard", a.institutionalBacking);
  say("a bank that would lend if guaranteed", a.bankRelationship);
  say("co-financing they can put up", a.cofinancingBand);
  say("when they need it", a.needBy);
  say("regulated activities", a.activities);
  return out;
}

const textOf = (m: Anthropic.Message): string => m.content
  .filter((b): b is Anthropic.TextBlock => b.type === "text")
  .map((b) => b.text).join("\n");

/** Pull the one JSON object out of a reply that may be fenced or prefaced.
 *  Returns null rather than throwing, so the caller falls back to the shipped
 *  order instead of degrading into a short table. */
function parseJson<T>(raw: string): T | null {
  for (const src of [raw.replace(/```(?:json)?/gi, ""), raw]) {
    const s = src.indexOf("{"), e = src.lastIndexOf("}");
    if (s < 0 || e <= s) continue;
    try { return JSON.parse(src.slice(s, e + 1)) as T; } catch { /* keep trying */ }
    let depth = 0;
    for (let i = s; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) {
        try { return JSON.parse(src.slice(s, i + 1)) as T; } catch { /* give up */ }
        break;
      }
    }
  }
  return null;
}

/**
 * The selector's SYSTEM PROMPT, assembled from the contracts.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 * This was the only model stage in the product with no system prompt at all.
 * It sent `messages: [{role:"user", content: buildPrompt(...)}]` and nothing
 * else: role, framing, judging rules and output contract were one ~16 kB user
 * string, rebuilt per request, which meant the rules the one stage that
 * CHOOSES was held to were the only rules in the repo that no check could read
 * and no reviewer could diff against a rule id.
 *
 * `adaptiveRound.ts` already assembles its system prompt this way and the
 * writer has since it was built; this is the fourth entry in `PROMPTS`, and
 * `UNROUTED_STAGES` is now empty.
 *
 * Memoised because it is byte-identical on every request and reading nine
 * markdown files per brief is a cost with no benefit. The cache key is the
 * process: contracts are edited and the build restarts, exactly as for the
 * writer.
 */
let systemMemo: string | null = null;
export const selectorSystemPrompt = (): string =>
  (systemMemo ??= assembleInstructions("selector"));

function buildPrompt(
  head: InstrumentRow[], ctx: SelectContext, keep: number, want: number,
  peers?: Map<string, number>, evidence?: Map<string, string[]>,
): string {
  const reqs = distinctive(head);
  const menu = head.map((r, i) => {
    const row = renderRow(i, r, reqs(r), peers);
    const ev = r.instrumentId ? evidence?.get(r.instrumentId) : undefined;
    return ev?.length
      ? `${row}\n     you asked about this one — its own rules say: ${ev.map((e) => oneLine(e, 200)).join(" | ")}`
      : row;
  }).join("\n");
  const answered = ctx.answers?.length
    ? ctx.answers.map((a) => `  ${a}`).join("\n")
    : "  (they have not answered the intake yet)";
  // The description is DATA. `fence` declaws prompt-control sequences and wraps
  // the block in a per-request nonce so it cannot be closed by typing the
  // delimiter, and says in the prompt what the block is for.
  const desc = ctx.description
    ? fence("description", ctx.description)
    : "(no description on file)";
  const adviser = AGENT_SELECT_ARM === "adviser";
  // ── WHAT STAYS IN THE USER MESSAGE, AND WHY ───────────────────────────────
  // Everything that varies per REQUEST: this company, this list, this many
  // seats, this reply shape. What used to sit here as well -- the role, how to
  // read a row, what makes one fund a better choice than another, what the
  // ranker's order and the peer prior actually mean -- was identical on every
  // request and lived in a string literal no check could read. It is now
  // contracts/selection/fund-selection.md, carried as the system prompt, held
  // by check_contracts like every other stage's rules.
  //
  // The framing below stays because the numbers in it are per-request: `keep`
  // seats are frozen only in the assist arm, and the sentence changes shape
  // with it.
  const framing = keep > 0
    ? `Our ranker has already claimed the top ${keep} place${keep === 1 ? "" : "s"} on this company's
shortlist. Those are settled: they are not shown below and they are not yours
to change. Your job is the ${want} remaining place${want === 1 ? "" : "s"}, chosen from the schemes the
ranker placed BEHIND them. That is the part it is worst at.`
    : `The ${head.length} candidates below are in our ranker's order, best first.`;
  return `Choose the ${want} public funding schemes this company should actually apply to.

THE COMPANY
  country: ${ctx.country ?? "unknown"}
  sector: ${ctx.sector ?? "unknown"}

WHAT THEY TOLD US
${answered}

WHAT THEY SAY THEY DO
${desc}

HOW TO READ THE LIST
${framing}

CANDIDATES
${menu}

${adviser ? `IF TWO CANDIDATES LOOK THE SAME TO YOU, SAY SO INSTEAD OF GUESSING. List their
index numbers in "unsure" and you will be shown those funds' own eligibility
rules and asked again. Name at most ${LOOKUP_MAX}, and only where the extra rules could
actually change your answer — if you already know, leave it empty.

Reply with ONLY this JSON, no preamble and no code fence. Exactly ${want} DISTINCT
index numbers taken from the list above, best first, plus any you are unsure of:
{"picks":[${Array.from({ length: want }, () => "0").join(",")}],"unsure":[]}` : `Reply with ONLY this JSON, no preamble and no code fence. Exactly ${want} DISTINCT
index numbers taken from the list above, best first:
{"picks":[${Array.from({ length: want }, () => "0").join(",")}]}`}`;
}

/**
 * Reorder the ranked candidate rows by asking a model to choose.
 *
 * PURE REORDER: the returned array is a permutation of the input. The chosen
 * rows move to the front in the model's own order and every other row keeps
 * its shipped relative position behind them. Nothing is added, removed, or
 * re-gated, so `candidateInstrumentIds` is unchanged as a SET and the pool
 * metric cannot move.
 *
 * Returns the input untouched on every failure path.
 */
export async function agentSelectRows(
  rows: InstrumentRow[], ctx: SelectContext,
): Promise<InstrumentRow[]> {
  if (AGENT_SELECT_ARM === "off") return rows;
  if (rows.length <= SELECT_COUNT) return rows;
  // NOTE: no by-name check for ANTHROPIC_API_KEY here, deliberately.
  //
  // It was redundant -- a missing key makes the lazy client throw and the catch
  // below returns the shipped order, which is exactly what the guard did -- and
  // it was not free: check_env_loader tracks credential reach TRANSITIVELY, so
  // one named read in a module pipeline.ts imports made thirty harnesses that
  // never make this call fail for not declaring a key they do not need. The
  // fallback is the contract; it does not need a second spelling.

  const head = rows.slice(0, Math.min(SELECT_DEPTH, rows.length));
  // `assist` freezes the shipped leaders and offers the model only what sits
  // behind them. The frozen rows are removed from the menu entirely rather
  // than shown and forbidden: a prompt-level "you may not choose these" was
  // measured to leak in this repo before (fundSelection.ts kept 70% of gate
  // 1's five when told to keep all of them), and a constraint enforced in code
  // cannot be argued with.
  const keep = AGENT_SELECT_ARM === "assist" ? Math.min(SELECT_KEEP, rows.length) : 0;
  const menuRows = AGENT_SELECT_ARM === "assist" ? head.slice(keep) : head;
  const want = Math.max(1, SELECT_COUNT - keep);
  if (menuRows.length <= want) return rows;
  // `dry` prices the ADVISER: it builds the identical prompt through the
  // identical code path and runs the identical retrieval, and simply never
  // calls Anthropic. Pricing a reconstruction of a prompt rather than the
  // prompt itself is how a cost estimate quietly describes a different arm.
  lastDecision = null;
  lastUnsureIds = [];
  const dry = AGENT_SELECT_ARM === "dry";
  const adviser = AGENT_SELECT_ARM === "adviser" || dry;
  const peers = adviser ? peerRank(ctx.country, ctx.sector) : undefined;
  if (dry) {
    // EVERYTHING BILLED AS INPUT, not just the user turn. The system prompt is
    // charged on every request exactly as the menu is, and a size that omits
    // it prices a call nobody makes -- which is the same defect as pricing a
    // reconstruction of the prompt instead of the prompt itself.
    tally.dryChars.push(
      selectorSystemPrompt().length
      + buildPrompt(menuRows, ctx, keep, want, peers).length);
    tally.drySystemChars = selectorSystemPrompt().length;
    tally.dryMenuRows.push(menuRows.length);
    // Round two's real weight, measured rather than guessed: the same lookup
    // the adviser would make, against eligibility_embeddings only. Standing in
    // for the model's own "unsure" list with the leading candidates is the
    // conservative choice -- it fires retrieval on every case, where the live
    // arm fires it only when the model says it cannot tell.
    const ids = menuRows.slice(0, LOOKUP_MAX)
      .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    const founderText = [ctx.description ?? "", ...(ctx.answers ?? [])].join("\n").trim();
    if (ids.length && founderText) {
      const chunks = await retrieveDemands(ids, founderText);
      if (chunks.length) {
        tally.dryRetrieved++;
        tally.dryEvidenceChars.push(
          chunks.reduce((a, c) => a + Math.min(c.text.length, 200) + 40, 0));
      }
    }
    return rows;
  }
  tally.calls++;
  try {
    const ask = async (evidence?: Map<string, string[]>) => {
      const r = await anthropic().messages.create({
      model: MODEL,
      // Thinking bills as OUTPUT, so max_tokens must clear the budget with
      // room for the reply or the answer is truncated into the empty-content
      // failure this arm already paid for once.
      max_tokens: adviser ? 1536 : 1024,
      // THINKING OFF, and this is a measured decision, not a saving.
      //
      // The first live run of this arm fell back on 3 of 8 cases with no
      // exception raised: at a small max_tokens the model spends the whole
      // allowance thinking and returns an empty content block, which reads
      // downstream as "no picks" and silently degrades the arm into its own
      // control. fundSelection.ts documents the same failure from the other
      // side. The reply here is six integers; there is nothing for a thinking
      // budget to buy, and turning it off removes the failure mode AND most of
      // the cost per brief.
      // Thinking ON for the adviser and OFF everywhere else. The free arm
      // needs none — its reply is six integers — and at a small max_tokens it
      // spent the whole allowance thinking and returned an empty content
      // block on 3 of 8 cases. The adviser is weighing a prior against stated
      // requirements and is allowed the room, bounded by THINK_BUDGET because
      // thinking is billed at the output rate.
      // Adaptive is the only on-mode on this model; `disabled` is still valid
      // and is what the cheaper arms use. Effort, not a token count, is the
      // depth control -- see THINK_EFFORT.
      ...(adviser
        ? {
            thinking: { type: "adaptive" as const },
            output_config: { effort: THINK_EFFORT },
          }
        : { thinking: { type: "disabled" as const } }),
      // WHO IT IS AND WHAT IT IS HELD TO — the contracts, verbatim, exactly as
      // the writer and the question planner receive theirs. Separating this
      // from the user message is not tidying: it is what makes the selector's
      // rules a diffable file with rule ids that check_contracts enforces,
      // rather than a template literal inside a function.
      system: selectorSystemPrompt(),
      // Nothing may bill untracked. recordUsage feeds the same accumulator the
      // euro ceiling in quota.ts is enforced against.
      messages: [{
        role: "user",
        content: buildPrompt(menuRows, ctx, keep, want, peers, evidence),
      }],
      }, { timeout: TIMEOUT_MS, maxRetries: 1 });
      recordUsage(r.model ?? MODEL, r.usage as never);
      // Local euro tally as well, because a bench run has no AsyncLocalStorage
      // context and recordUsage is a no-op there — which is exactly the run
      // that has to report euros per brief.
      const { costOf } = await import("./cost");
      tally.eur += costOf(r.model ?? MODEL, r.usage as never);
      return r;
    };

    let res = await ask();
    let v = parseJson<{ picks: unknown; unsure?: unknown }>(textOf(res));

    // ── ROUND TWO: resolve the ambiguities the model ITSELF declared ────────
    // Retrieval fires only here, and only on the candidates it named. That is
    // both the owner's design — fetch the thing that separates two funds you
    // cannot tell apart — and the reason this arm fits its budget: looking up
    // all forty rows would cost more than the brief is allowed to and would
    // bury the separating fact in bulk text, which is precisely how the free
    // arm failed.
    if (adviser) {
      const unsure = (Array.isArray(v?.unsure) ? v!.unsure : [])
        .filter((i): i is number => Number.isInteger(i) && (i as number) >= 0
          && (i as number) < menuRows.length)
        .slice(0, LOOKUP_MAX);
      const ids = [...new Set(unsure
        .map((i) => menuRows[i].instrumentId)
        .filter((id): id is string => Boolean(id)))];
      lastUnsureIds = ids;
      if (ids.length) {
        // The founder's side of the question. `declaw` is applied inside
        // `fence` for the prompt; here the text only ever becomes a vector, so
        // it can reach no instruction surface at all.
        const founderText = [ctx.description ?? "", ...(ctx.answers ?? [])]
          .join("\n").trim();
        const chunks = await retrieveDemands(ids, founderText);
        if (chunks.length) {
          tally.lookups += ids.length;
          tally.resolved++;
          const evidence = new Map<string, string[]>();
          for (const c of chunks) {
            evidence.set(c.instrumentId, [...(evidence.get(c.instrumentId) ?? []), c.text]);
          }
          const res2 = await ask(evidence);
          const v2 = parseJson<{ picks: unknown }>(textOf(res2));
          // Keep round two only if it produced something usable. A failed
          // second call must degrade to the first answer, never past it.
          if (Array.isArray(v2?.picks) && v2!.picks.length) { res = res2; v = v2; }
        }
      }
    }

    const raw = Array.isArray(v?.picks) ? v!.picks : [];
    const picks = [...new Set(raw.filter(
      (i): i is number => Number.isInteger(i) && (i as number) >= 0
        && (i as number) < menuRows.length))].slice(0, want);
    if (picks.length < raw.length) tally.invalidIds += raw.length - picks.length;
    if (!picks.length) {
      // No usable pick. Distinguish the two causes, because they need
      // different fixes and an aggregate "failed" count hides which one is
      // biting: an empty content block is a token-budget problem, a non-empty
      // reply that yielded nothing is a prompt or parsing problem.
      if (!textOf(res).trim()) tally.emptyReply++; else tally.badJson++;
      tally.failed++;
      return rows;
    }
    if (picks.length < want) tally.shortReply++;
    tally.ok++;

    // The permutation. Chosen first in the model's order; everything else keeps
    // the shipped order behind them, so a short reply degrades toward the
    // control rather than into a truncated page.
    const chosen = picks.map((i) => menuRows[i]);
    if (peers) {
      // Only the prior-ranked candidates that were actually ON THE MENU count
      // as overridable: a fund the model was never shown cannot have been
      // declined by it, and counting those would inflate the override rate
      // with rows the arm never had a chance to consider.
      const onMenu = menuRows
        .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
      const ranked = onMenu.filter((id) => peers.has(id))
        .sort((a, b) => (peers.get(a) ?? 0) - (peers.get(b) ?? 0));
      const pickedIds = chosen
        .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
      const pickedSet = new Set(pickedIds);
      lastDecision = {
        priorRanked: ranked,
        picked: pickedIds,
        followed: pickedIds.filter((id) => peers.has(id)),
        overrode: ranked.filter((id) => !pickedSet.has(id)),
        reached: pickedIds.filter((id) => !peers.has(id)),
        unsure: lastUnsureIds,
      };
    }
    const frozen = rows.slice(0, keep);
    const taken = new Set([...frozen, ...chosen]);
    return [...frozen, ...chosen, ...rows.filter((r) => !taken.has(r))];
  } catch (err) {
    tally.failed++;
    console.error("[agentSelect] call failed, keeping the shipped order:", String(err));
    return rows;
  }
}
