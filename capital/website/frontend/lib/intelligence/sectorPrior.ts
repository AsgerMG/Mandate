// Which delivery body of a regime does this founder's SECTOR point at?
//
// A leaf module, and deliberately so, for the same reason `regionPrior.ts` is
// one: both the ranker and any axis builder that grounds a question about
// sibling choice need it, and neither should have to import the other.
//
// ── The question, and why it is the remaining product ─────────────────────
// The pool-to-table diagnosis leaves exactly one thing wrong. Of the holdout
// cases where the won fund is in the pool and below the cut, 85% are siblings
// outranking the won leaf; the regime is already at median position 2 holding
// 3.07 of the five rows, and the right leaf is in none of them. Decomposed:
//
//   pool 97%  x  regime@5 89%  x  right-leaf-given-regime 40%  =  EXACT@5 36%
//
// So the leaf choice is what is left, and `sectorFit` — the one signal in the
// ranker built from who a fund has actually paid — cannot make it. It is
// `min(1, share / SECTOR_FULL_MATCH_SHARE)`, and that ceiling is right across
// channels (a broad fund must not be punished for being broad) and fatal inside
// one regime, where it makes a leaf with 90% of its awards in the founder's
// sector indistinguishable from one with 26%. Measured over the holdout pairs
// whose won fund sits in a multi-leaf regime: `sectorFit` TIES AT THE TOP of
// the group in 81.3% of cases.
//
// ── What is NOT claimed ───────────────────────────────────────────────────
// This does not improve the five rows a founder sees, and it was measured
// trying. See `scripts/measure_sibling_choice.ts` for the numbers and the
// header of `sectorScorer` for why. It is kept because it is the strongest
// within-regime chooser the corpus supports and because it is near-orthogonal to
// region, which is the property a second separator has to have to be worth
// anything. Wiring it into the table is a decision for whoever owns the row
// assembly, on the shape of table they end up with — not a foregone conclusion.
import type { DbInstrument } from "./corpus";

/** How far the founder's own sector may reorder a set of siblings. Peer of the
 *  ranker's other sibling multipliers, and deliberately below the region one:
 *  where region has something to say it is the sharper fact. */
export const SECTOR_MATCH = 1.35;

/** Sector recipients weighted by the evidence behind them.
 *
 *  `share` is P(sector | fund) — how concentrated this fund is on the founder's
 *  sector — and `log1p(count)` is the evidence weight that keeps it honest:
 *  90% of three awards is a rumour, 60% of three hundred is a fact. Exported so
 *  a diagnostic can rank on the same arithmetic the scorer uses rather than a
 *  second copy of it, which is how the number being explained and the number
 *  being shipped drift apart.
 *
 *  Returns undefined — never 0 — when the fund has no mix on record, because a
 *  gap in our classification is not an absence of recipients and every caller
 *  must treat the two differently. */
export function sectorWeight(
  inst: DbInstrument, sector: string,
): number | undefined {
  const mix = inst.sectorMix;
  if (!mix) return undefined;
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (total <= 0) return undefined;
  const n = mix[sector] ?? 0;
  return (n / total) * Math.log1p(n);
}

/**
 * Rank siblings by how specialised each is in the founder's sector, inside
 * their own regime. The same question `regionScorer` asks of geography, asked
 * of what a fund funds.
 *
 * ── The form, and why it is neither of the two obvious ones ───────────────
 * Ranking the won leaf first within its own regime, holdout, n=2,786, median
 * regime 60 members (`scripts/measure_sibling_choice.ts`):
 *
 *   uniform (guessing)                    4.3%
 *   popularity (eventCount)               6.3%
 *   today: clipped sectorFit             10.6%   @3 26.5%
 *   P(fund | sector), the raw count      12.1%   @3 27.2%
 *   P(sector | fund), unclipped share    13.8%   @3 31.7%
 *   share x log1p(count)                 14.7%   @3 33.1%   <- this
 *
 * The count form is the direction `regionScorer` takes and it is worse here.
 * The leaf that loses its slot is typically the SMALLER sibling — the five
 * shown are peer-known 90% at median rank 2 against the won fund's 55% at
 * median rank 24 — so a signal that rewards size only re-states what peer
 * precedence already applies. The share form asks the opposite question.
 *
 * ── Why it is not in the row sort, measured rather than assumed ───────────
 * Folded into the sibling reassignment in `materialiseInstrumentTable`, three
 * ways, holdout n=200 against a 36% / 89% baseline:
 *
 *   scoped to the channel, multiplied into `pref`      EXACT@5 33%  REGIME@5 90%
 *   scoped to the regime, as the permutation key       EXACT@5 33%  REGIME@5 90%
 *   scoped to the regime, multiplying the score        EXACT@5 33%  REGIME@5 90%
 *   ...the same, with the multiplier reduced to 1.08   EXACT@5 35%  REGIME@5 89%
 *
 * The sweep is monotone back toward the baseline and never above it, which is
 * the signature of a signal that is harmful at that point rather than one that
 * is mis-tuned. The reason is that the ordering it displaces is BETTER than it
 * is: production already picks the right leaf given the regime about 40% of the
 * time, driven by the semantic percentile, against this signal's 33.1% @3. A
 * weaker signal applied on top of a stronger one subtracts.
 *
 * That is a statement about the CURRENT table, in which a regime holds a mean
 * of 3.07 of the five rows and the ordering inside it is already doing work.
 * It is not a statement about a table that shows one row per regime, where
 * choosing that regime's representative is a decision nothing else is making.
 *
 * ── The comparison is inside ONE REGIME, never across a channel ───────────
 * Grouping by `parentId` internally rather than trusting the caller to pass a
 * regime, because passing a channel is the mistake that costs the three points
 * above and it is silent when made. A per-regime multiplier applied over a
 * channel still ranks one regime's specialist against another regime's
 * singleton leaf, which scores neutral by construction, so it moves rows
 * BETWEEN regimes.
 *
 * ── Degradation ──────────────────────────────────────────────────────────
 * Every path that cannot separate returns exactly 1.0, so a caller multiplying
 * by this is returned to its own behaviour rather than to noise: a leaf with no
 * mix on record, a leaf alone in its regime here, a regime no leaf of which has
 * ever funded the founder's sector, and a regime whose leaves are all equally
 * specialised. Measured on the holdout: 0 cases where the won leaf has no mix,
 * 1 where no leaf in the regime funds the sector.
 */
export function sectorScorer(
  leaves: DbInstrument[], sector?: string,
): (i: DbInstrument) => number {
  const neutral = () => 1;
  if (!sector) return neutral;
  const byRegime = new Map<string, DbInstrument[]>();
  for (const l of leaves) {
    const k = l.parentId;
    if (!k) continue;
    (byRegime.get(k) ?? byRegime.set(k, []).get(k)!).push(l);
  }
  const score = new Map<string, number>();
  for (const group of byRegime.values()) {
    if (group.length < 2) continue;
    const here = new Map<string, number>();
    for (const l of group) {
      const w = sectorWeight(l, sector);
      if (w !== undefined) here.set(l.id, w);
    }
    const known = [...here.values()];
    // Nobody in this regime has ever funded the founder's sector, or everyone
    // has to the same degree: either way it separates nothing, and a signal
    // that cannot separate these candidates must not reorder them.
    if (known.length < 2 || !known.some((v) => v > 0)) continue;
    const lo = Math.min(...known), hi = Math.max(...known);
    if (hi === lo) continue;
    // On the group's OWN range rather than an absolute scale, so a leaf's score
    // says where it sits among the leaves of ITS regime — the only comparison
    // being made — and the multiplier spans the same interval either side of
    // neutral whatever that regime's absolute concentration happens to be.
    for (const [id, v] of here) {
      score.set(id, Math.pow(SECTOR_MATCH, 2 * ((v - lo) / (hi - lo)) - 1));
    }
  }
  if (!score.size) return neutral;
  return (i: DbInstrument) => score.get(i.id) ?? 1;
}
