// The fitted BLEND of every per-candidate signal the corpus can offer, as one
// score — and the ONE definition of those signals, shared by the harness that
// fitted the weights and the row sort that ships them.
//
// ── Why this file exists at all ───────────────────────────────────────────
// `measure_signal_power.ts` held a private `SIGNALS` table. `fit_signal_blend.ts`
// fitted a conditional logit over it. Both are offline. Shipping the result by
// re-typing fourteen scorers into `shortlist.ts` would put the fitted signal and
// the served signal in two files with a "keep these in sync" comment between
// them, which in this repo is not a risk, it is the observed defect: two
// `tableInputFromAnswers` literals lost the memo two intake answers, and two
// definitions of "the row label" collapsed rows the disambiguator had just told
// apart.
//
// So the harness now imports `BLEND_SIGNALS` from here. A weight fitted on a
// column is a weight served on that same column, by construction, and adding a
// signal is one edit rather than two.
//
// ── What the weights are and what they are NOT ────────────────────────────
// They are a conditional logit over WITHIN-POOL PERCENTILE RANKS, fitted on the
// `tune` split and reported once on `holdout`
// (`project-mgmt/findings/regain_wsCU/BLEND_CT.txt`). They are NOT refitted
// here, they are NOT re-derivable from this file, and they must not be nudged:
// the split exists so that the number they were reported on stays a prediction
// rather than a fit. Anyone changing them must re-cut both dumps and re-run
// `fit_signal_blend.ts`, which refuses to fit and report on one split.
//
// They are ALSO not a claim about which signal "matters". A conditional logit
// over correlated rank columns distributes credit between them arbitrarily;
// what is stable is the ORDER the whole vector induces, which is the only thing
// read below.
//
// ── The upper bound this is measured against ──────────────────────────────
// wsCU scored the blend as a PURE POOL RE-ORDERING: no channel cap, no dedupe,
// no peer precedence, no sibling reassignment. EXACT@5 29.2% against the shipped
// pool score's 23.2% on the same 600 holdout founders, paired delta +6.0 ±3.3,
// McNemar z = 3.5 over 106 discordant pairs, gains spread over 20 regimes with
// the largest 17%. That is a ceiling on what the arm below can deliver, not a
// prediction of it, because everything this file's caller does after the sort
// can only remove the difference.
import { hasSectorHistory, eligibilityFit, livenessFit, scaleFit, sectorFit } from "./fit";
import { toIso2, type DbInstrument } from "./corpus";
import { assessInstrument } from "./verdict";
import type { EligibilityAnswers } from "./types";

/** Everything a signal is allowed to know. A signal is a pure function of
 *  (candidate, founder) — it may not see the pool's other members, because a
 *  scorer that reads its own neighbours is a ranking, not a signal, and could
 *  not be measured alone. Pool-relative normalisation happens once, below. */
export interface BlendContext {
  founderSector?: string;
  /** The founder's usable countries, exactly as `founderCountryList` returns
   *  them — free-form, possibly names rather than ISO2. Normalised here. */
  founderCountries: string[];
  ticketBand?: string;
  /** Semantic percentile ranks by instrument id (semantic.ts). Empty on the
   *  lexical fallback, in which case the column is uniformly absent and the
   *  median fill below makes it inert rather than wrong. */
  theme: Map<string, number>;
  /** The founder's answers, for the encoded-gate column. Undefined makes the
   *  column a constant, which rank-normalises to a tie and is therefore inert
   *  rather than a judgement. */
  eligibility?: EligibilityAnswers;
  /** Instrument id -> its position in `peerPrior`, best = 0. Absent = the peer
   *  prior has never seen this fund for this founder's cell. A Map and not the
   *  ordered array, because a signal is called once per candidate and an
   *  `indexOf` over a long prior would make the column quadratic. */
  peerRank: Map<string, number>;
  year: number;
}

/** A signal returns `null` when it has no opinion about this candidate. The
 *  caller substitutes the pool's own median of the candidates it DOES have an
 *  opinion about — the rank-preserving stand-in `sectorFitScorer` establishes.
 *  A constant would either bury or promote every blind row, and both are
 *  judgements the signal has not earned. */
export type BlendSignal = (i: DbInstrument, c: BlendContext) => number | null;

/** Proximity, alone, because it is the term that matters most below and the
 *  one `rowRelevance` has never contained in any form.
 *
 *  An EU-wide programme is open to everyone and so says nothing about fit; a
 *  scheme in the founder's own country is a door on their doorstep; a scheme in
 *  a country they cannot draw on is neither. Three values, and the middle one
 *  is not the midpoint.
 *
 *  `toIso2` on the founder side and not the instrument side: `founderCountries`
 *  carries whatever the intake supplied (names, ISO2, target markets) while
 *  `instrument.country` is always a code. This is `instrumentServesCountry`'s
 *  comparison exactly, minus its EU short-circuit, which is the difference
 *  between "can they walk through this door" and "is it their own door". */
export function proximityFit(inst: DbInstrument, founderCountries: string[]): number {
  if (!inst.country || inst.country === "EU") return EU_WIDE_PROXIMITY;
  return founderCountries.some((c) => toIso2(c) === inst.country) ? 1 : 0;
}

/** Kept here rather than imported from fit.ts so the signal table is readable
 *  as one thing; fit.ts exports a constant of the same value for
 *  `scoreFitControl`,
 *  and `check_contracts` has no opinion about either. The number is the one the
 *  weights were fitted against. */
const EU_WIDE_PROXIMITY = 0.45;

/**
 * THE FOURTEEN COLUMNS, in the order the weights were fitted on.
 *
 * ORDER IS LOAD-BEARING but not relied upon: `BLEND_WEIGHTS` is keyed by NAME
 * and reconciled against these keys at module load, so a reordering is safe and
 * a rename or an addition fails loudly instead of silently shifting every
 * weight by one column. That reconciliation is the whole reason the weights are
 * a record and not an array.
 */
export const BLEND_SIGNALS: Record<string, BlendSignal> = {
  // ── the four the prior study named ──────────────────────────────────────
  "sector share (shipped, clipped)": (i, c) => sectorFit(i.sectorMix, c.founderSector),
  "collaborative prior (peer)": (i, c) =>
    c.peerRank.has(i.id) ? -c.peerRank.get(i.id)! : null,
  "event count": (i) => i.eventCount,
  "recency (last award year)": (i, c) => livenessFit(i, c.year),
  // ── the same bytes read the other way ───────────────────────────────────
  // Ranking by the RAW COUNT of a fund's awards in the founder's sector is
  // ranking by the posterior P(fund | sector) across the pool: the denominator
  // is the same for every candidate, so it cannot change an order. No new
  // column, no new question — the clip and the per-fund normalisation are the
  // only difference from the row above.
  "sector count (posterior)": (i, c) =>
    c.founderSector && i.sectorMix ? (i.sectorMix[c.founderSector] ?? 0) : null,
  "sector share (unclipped)": (i, c) => {
    if (!c.founderSector || !hasSectorHistory(i.sectorMix)) return null;
    const total = Object.values(i.sectorMix!).reduce((a, b) => a + b, 0);
    return total > 0 ? (i.sectorMix![c.founderSector] ?? 0) / total : null;
  },
  // ── everything else the corpus can offer per candidate ──────────────────
  "semantic (founder's text)": (i, c) => c.theme.get(i.id) ?? null,
  "award scale fit": (i, c) => scaleFit(i, c.ticketBand),
  "proximity (home country)": (i, c) => proximityFit(i, c.founderCountries),
  // `assessInstrument` and not `assessAll`: the latter walks the whole corpus
  // to answer about one pool, and the two return the same assessment for the
  // same instrument by construction — assessAll IS a loop over this.
  "eligibility (encoded gates)": (i, c) => eligibilityFit(assessInstrument(i, c.eligibility)),
  "company count": (i) => i.companyCount,
  "total EUR": (i) => i.totalEur,
  "award median": (i) => i.awardP50 ?? null,
  "encoded gate count": (i) => i.gates.length,
};

/**
 * THE FITTED WEIGHTS. Copied verbatim from the run that produced them, and the
 * provenance is part of the artifact:
 *
 *   project-mgmt/findings/regain_wsCU/BLEND_CT.txt
 *   founder  identity=real own-history=withheld capital=withheld answers=off
 *            consortium=yes
 *   ranker   all 1175 (tune) / 1182 (holdout) request(s) on EMBEDDING
 *   fitted   tune,    584 pools, 16 unreachable
 *   reported holdout, 588 pools, 12 unreachable, set=__recallSetDoors.json
 *
 * DO NOT ADJUST THESE. There is no arithmetic here that could be checked and no
 * intuition that could be applied: they are the output of a fit on a split that
 * exists so the number beside them stays a prediction. A hand-nudged weight is
 * a refit against holdout wearing the word "tweak".
 */
export const BLEND_WEIGHTS: Record<string, number> = {
  "proximity (home country)": 4.062,
  "sector share (unclipped)": 2.554,
  "semantic (founder's text)": 1.519,
  "award median": -0.657,
  "total EUR": 0.512,
  "event count": 0.495,
  "eligibility (encoded gates)": 0.421,
  "award scale fit": 0.403,
  "collaborative prior (peer)": 0.340,
  "sector count (posterior)": -0.253,
  "recency (last award year)": 0.195,
  "sector share (shipped, clipped)": 0.142,
  "company count": 0.019,
  "encoded gate count": 0.006,
};

/** The reconciliation the record-not-array shape exists for.
 *
 *  A signal added to the table above without a refit would otherwise be served
 *  at weight 0 and nothing would say so; a signal renamed would silently drop
 *  out of the score while every published figure kept its old name. Both fail
 *  at import, below.
 *
 *  Exported and taking its two arguments rather than closing over the module's
 *  own constants, so a test can PROVE it fails. A guard nobody has watched fail
 *  is a comment. */
export function reconcileBlendColumns(
  signalNames: readonly string[], weightNames: readonly string[],
): void {
  const weights = new Set(weightNames);
  const signals = new Set(signalNames);
  const missing = signalNames.filter((k) => !weights.has(k));
  const extra = weightNames.filter((k) => !signals.has(k));
  if (missing.length || extra.length) {
    throw new Error(
      "poolBlend: the fitted weights and the signal table disagree. " +
      `Signals with no fitted weight: ${missing.join(", ") || "(none)"}. ` +
      `Weights for no signal: ${extra.join(", ") || "(none)"}. ` +
      "The weights come from a conditional logit fitted on the tune split " +
      "(project-mgmt/findings/regain_wsCU/BLEND_CT.txt); a column cannot be " +
      "added, removed or renamed without re-cutting both dumps and re-running " +
      "scripts/fit_signal_blend.ts.");
  }
}

reconcileBlendColumns(Object.keys(BLEND_SIGNALS), Object.keys(BLEND_WEIGHTS));

/** Whether the blended pool score orders the founder's table.
 *
 *  `off` is the shipped behaviour bit for bit, and the default: nothing a
 *  founder sees changes until this is set. Same shape and same reason as
 *  `SIBLING_SCOPE` and `CHANNEL_BACKFILL` in shortlist.ts — read ONCE at module
 *  scope, so the two arms cannot differ within one request and the flag can
 *  never become a per-founder behaviour.
 *
 *  `on`   the blend replaces the theme+sector base score, and everything the
 *         row sort does afterwards — the sibling reassignment, the ticket
 *         multiplier, the name collapse, peer precedence — runs unchanged on
 *         top of it. This is the arm that answers "what does the blend do to
 *         what a founder is SHOWN".
 *  `pure` the blend is the whole row score: the sibling reassignment and the
 *         ticket multiplier are bypassed. This is the arm wsCU actually
 *         measured, and it exists so that a difference between the two can be
 *         attributed to the shipped machinery rather than argued about. It is a
 *         diagnostic, not a candidate.
 *
 *  `shuffle` orders the pool AT RANDOM and keeps every downstream stage, so it
 *         is the NULL for `on`: it answers whether `on`'s effect is bigger than
 *         re-ordering the same pools by coin flip. See `shuffleScores`.
 *
 *  An unrecognised value THROWS rather than reading as `off`. A silent default
 *  on a misspelling is how a flag that never arrived gets reported as "no
 *  effect" in both arms, which is the shape of every false null in this
 *  project's history. */
export type PoolBlendArm = "off" | "on" | "pure" | "shuffle";

/** Exported so a test can watch the throw happen. See `reconcileBlendColumns`:
 *  a guard nobody has proved can fail is a comment with a `throw` in it. */
export function parsePoolBlend(v: string | undefined): PoolBlendArm {
  const s = v ?? "off";
  if (s === "off" || s === "on" || s === "pure" || s === "shuffle") return s;
  throw new Error(`unknown POOL_BLEND=${s} (expected: off, on, pure, shuffle)`);
}

export const POOL_BLEND: PoolBlendArm = parsePoolBlend(process.env.POOL_BLEND);

/** ── THE NULL ARM ─────────────────────────────────────────────────────────
 *
 *  `shuffle` orders the pool AT RANDOM and then runs every downstream stage
 *  unchanged, exactly as `on` does. It exists because an ordering arm that is
 *  only compared to the shipped order cannot be told apart from churn.
 *
 *  wsIJ found a whole gradient that random reordering reproduced with a STEEPER
 *  slope, and wsII's re-test churn floor is ten founders on a population of
 *  seventy-eight. A re-ordering necessarily moves founders across every cut in
 *  both directions; the question a null answers is whether the NET movement is
 *  bigger than moving the same founders by coin flip. If the arm does not clear
 *  this, the arm is arithmetic.
 *
 *  ── Why the permutation is per-founder and reproducible ──────────────────
 *  The seed is derived from the POOL'S OWN MEMBERSHIP — the sorted instrument
 *  ids — so two founders with different pools get independent permutations,
 *  the same founder gets the same permutation on every run, and nothing about
 *  the founder's identity or their answer key is read. A constant random order
 *  shared by every founder would be a founder-blind prior, which is a different
 *  and much weaker null: it could still beat the shipped order by accident of
 *  which funds it happened to favour.
 *
 *  `POOL_BLEND_SEED` moves the whole family of permutations, so the null is a
 *  DISTRIBUTION over seeds rather than a single draw. One shuffle is one sample
 *  of the null and must never be quoted as "the" null. */
export function shuffleScores(
  pool: readonly DbInstrument[], seed: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!pool.length) return out;
  if (pool.length === 1) { out.set(pool[0].id, 0.5); return out; }
  // FNV-1a over the sorted ids, so the salt is a property of the POOL and not
  // of the order it happened to arrive in — an arm whose null depended on the
  // incoming order would be correlated with the very thing it is a null for.
  let h = (seed >>> 0) ^ 0x811c9dc5;
  for (const id of [...pool].map((p) => p.id).sort()) {
    for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619) >>> 0;
  }
  // EACH CANDIDATE DRAWS FROM ITS OWN ID, not from its position in the array.
  // The first version of this walked the pool with one generator, which made a
  // candidate's draw depend on where it happened to sit in the incoming order —
  // so the "random" order was correlated with the order it was a null for. The
  // unit test below (`depends on the pool's membership, not on the order it
  // arrives in`) is what caught it, and it is kept for that reason.
  const raw = pool.map((i) => {
    let g = h;
    for (let k = 0; k < i.id.length; k++) g = Math.imul(g ^ i.id.charCodeAt(k), 16777619) >>> 0;
    return mulberry32(g)();
  });
  // Then the SAME `rankNormalise` the fitted blend uses, so the null lands on
  // the identical [0,1] percentile scale and every downstream comparison (the
  // ticket multiplier, the sibling slots, `scoreSeats`) reads it the way it
  // reads the arm. A null on a different scale would be testing the scale.
  const pct = rankNormalise(raw);
  pool.forEach((i, k) => out.set(i.id, pct[k]));
  return out;
}

/** The PRNG the null draws from. Copied from `scripts/_wsiq_rescore.ts`, which
 *  is the estimator this project validated against published figures, so a
 *  reader comparing an arm to its null is not also comparing two generators. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Read once at module scope, like every other arm here. */
export const POOL_BLEND_SEED = Number(process.env.POOL_BLEND_SEED ?? 1);


/** ── THE PROXIMITY TERM, ISOLATED ─────────────────────────────────────────
 *
 *  `off` is the shipped behaviour bit for bit, and the default.
 *
 *  `first` orders the pool by PROXIMITY STRATUM first and by the shipped score
 *  within each stratum. It exists because the blend's largest weight by a
 *  distance is proximity and the blend has thirteen other columns, so an arm
 *  that moves cannot be attributed to the term the weight names. This one can.
 *
 *  ── Why lexicographic and not a fitted weight ────────────────────────────
 *  A weight is a free parameter, and a free parameter fitted on the split it is
 *  reported on is not a measurement. The strict stratification has none: it is
 *  the LARGEST ordering effect proximity can have, so it is an upper bound on
 *  what any weighting of this term could buy at the pool cut — and if the bound
 *  is not positive, no softer version of it is.
 *
 *  ── And why the answer is probably no, said before it was run ────────────
 *  Inside a founder's table the country screen has already run
 *  (`instrumentServesCountry` in `selectInstrumentRows`), so every row is either
 *  the founder's own country's or EU-wide and `proximityFit` takes exactly two
 *  values. Home-above-EU-wide is therefore not a geography rule here, it is a
 *  rule that buries the pan-European programmes — and `selectLeafInstruments`
 *  already carries a comment recording that exact rule being measured at a
 *  25-point pool-reach cost and reverted to parity. */
export type RowProximityArm = "off" | "first";

/** Exported so a test can watch the throw happen, for the same reason
 *  `parsePoolBlend` is. A silent default on a misspelling is how an arm that
 *  never arrived gets reported as "no effect". */
export function parseRowProximity(v: string | undefined): RowProximityArm {
  const s = v ?? "off";
  if (s === "off" || s === "first") return s;
  throw new Error(`unknown ROW_PROXIMITY=${s} (expected: off, first)`);
}

export const ROW_PROXIMITY: RowProximityArm = parseRowProximity(process.env.ROW_PROXIMITY);

/** TWO ORDERINGS CANNOT SORT ONE TABLE. Both flags substitute the same base
 *  score, so a run with both set would silently measure whichever the caller
 *  happened to check first and report it under both names. Exported and taking
 *  its arguments so a test can prove it fails. */
export function assertOneOrdering(blend: PoolBlendArm, prox: RowProximityArm): void {
  if (blend !== "off" && prox !== "off") {
    throw new Error(
      `POOL_BLEND=${blend} and ROW_PROXIMITY=${prox} are both set. Each REPLACES the `
      + "row's base score, so together they do not compose — one of them would win "
      + "silently and the run would be reported under both names. Set one.");
  }
}

assertOneOrdering(POOL_BLEND, ROW_PROXIMITY);

/**
 * Score a whole pool with proximity as a strict first key.
 *
 * Returns the same shape `blendPoolScores` returns and for the same reasons: a
 * within-pool percentile in [0,1], monotone in the ordering, so the ticket
 * multiplier and the sibling reassignment downstream keep meaning what they
 * mean. Adding a constant to the raw score instead would NOT be lexicographic
 * once `ticketFit` multiplies it — a home row at 1.0 times 0.5 sorts below an
 * EU-wide row at 0.9 times 1.0 — which is the whole reason this returns a
 * percentile rather than a sum.
 *
 * `base` is the shipped two-signal score, passed in rather than recomputed:
 * the caller owns that definition and a second copy of it here is the "keep in
 * sync" defect this file's own header was written about.
 */
export function homeFirstScores(
  pool: readonly DbInstrument[], founderCountries: string[], base: (id: string) => number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!pool.length) return out;
  // `base` is in [0,1] for every row (a percentile blended with a share), and
  // the stratum term is STRICTLY WIDER than that interval so the sort is exactly
  // lexicographic: the worst home row scores 2, the best EU-wide row scores 1.
  //
  // The obvious `+1` is WRONG at the endpoints and a unit test caught it: an
  // EU-wide row with a base of exactly 1.0 ties a home row with a base of
  // exactly 0.0, and `rankNormalise` then puts them at the same mid-rank. A
  // stratification that is strict "except at the boundary" is not a
  // stratification, and the boundary is where the whole arm's effect lives.
  //
  // The bound on `base` is asserted rather than assumed: a base outside the
  // unit interval would silently make this a weighting wearing the word
  // "stratification", and the finding's upper-bound claim rests on it not being
  // one.
  const raw = pool.map((i) => {
    const b = base(i.id);
    if (!(b >= 0 && b <= 1)) {
      throw new Error(
        `homeFirstScores: base score ${b} for ${i.id} is outside [0,1]. The stratum `
        + "term is 2 and only dominates a base that is, so this would no longer be a "
        + "strict stratification — it would be an unstated weighting.");
    }
    return (proximityFit(i, founderCountries) >= 1 ? 2 : 0) + b;
  });
  const pct = rankNormalise(raw);
  pool.forEach((i, k) => out.set(i.id, pct[k]));
  return out;
}

/** Within-pool percentile rank, ties at the mid-rank.
 *
 *  Ties get the SAME value on purpose: a feature that cannot tell two
 *  candidates apart must not be allowed to order them through an artefact of
 *  the sort. This is `rankNormalise` from `fit_signal_blend.ts`, and it has to
 *  be the same function — the weights mean "per unit of within-pool percentile"
 *  and nothing else. */
export function rankNormalise(col: number[]): number[] {
  const idx = col.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(col.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const mid = (i + j) / 2;
    const p = idx.length > 1 ? mid / (idx.length - 1) : 0.5;
    for (let k = i; k <= j; k++) out[idx[k].i] = p;
    i = j + 1;
  }
  return out;
}

/** The pool's own median of the candidates a signal HAS an opinion about. */
function medianOf(raw: (number | null)[]): number {
  const known = raw.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!known.length) return 0;
  return known.length % 2
    ? known[known.length >> 1]
    : (known[(known.length >> 1) - 1] + known[known.length >> 1]) / 2;
}

/**
 * Score a whole pool with the fitted blend.
 *
 * Returns a value in [0,1] per instrument id — the blend's own percentile
 * within this pool, NOT the raw logit. Two reasons, both load-bearing.
 *
 * The raw score is an unbounded sum of signed weights and goes negative for
 * roughly half a pool. Every stage downstream of the row sort treats the score
 * as a positive magnitude: `ticketFit` MULTIPLIES it, and a multiplier below 1
 * on a negative score promotes the row instead of demoting it. Shipping a raw
 * logit into that machinery would not be the blend, it would be the blend with
 * its worst half inverted.
 *
 * And the value has to live on the same scale as the score it replaces, because
 * the sibling reassignment sorts a channel's `baseRelevance` values into slots
 * and hands them back out, and `scoreSeats` reads adjacent gaps against the mean
 * gap. A monotone map to [0,1] keeps every one of those comparisons meaningful.
 * Percentile is monotone in the blend, so ordering by it and ordering by the
 * blend are the same ordering — which is what makes this a presentation choice
 * rather than a second model.
 *
 * POOL-RELATIVE BY CONSTRUCTION, and that is the contract: the weights were
 * fitted on within-pool percentile ranks, so a candidate's score is only
 * defined against the pool it was scored with. Never cache one of these across
 * requests and never compare two pools' values.
 */
export function blendPoolScores(
  pool: readonly DbInstrument[], ctx: BlendContext,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!pool.length) return out;
  if (pool.length === 1) { out.set(pool[0].id, 0.5); return out; }

  const totals = new Array<number>(pool.length).fill(0);
  for (const [name, fn] of Object.entries(BLEND_SIGNALS)) {
    const raw = pool.map((i) => fn(i, ctx));
    const neutral = medianOf(raw);
    const ranks = rankNormalise(raw.map((x) => x ?? neutral));
    const w = BLEND_WEIGHTS[name];
    for (let i = 0; i < pool.length; i++) totals[i] += w * ranks[i];
  }
  // The blend's own percentile within the pool. See the docstring.
  const pct = rankNormalise(totals);
  pool.forEach((i, k) => out.set(i.id, pct[k]));
  return out;
}
