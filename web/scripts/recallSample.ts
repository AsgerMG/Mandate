// HOW a recall sample is drawn — one implementation, because both of the
// obvious ways to draw one are biased against this particular set.
//
// ── The two failures this replaces ─────────────────────────────────────────
// SLICE took the head of a mode-grouped list: 66% `project` against a true
// population of 16%, reading pool 92% where it was 74% and EXACT@5 49% where it
// was 35%.
//
// STRIDE fixed that and introduced a subtler version of the same fault. The set
// is strongly ordered — by mode, by whether the pair was traced, and by
// instrument within that — so `i % step` ALIASES against the ordering and the
// sample depends on the step you happened to pick:
//
//   N=200 (step 14)  EXACT@5 36%   186 distinct instruments
//   N=250 (step 11)  EXACT@5 25%   220 distinct instruments
//   the two samples share 119 of 200 rows
//
// Same ranker, same split, same answer key, eleven points apart. Every
// cross-run comparison at a different N was meaningless, and a published 36%
// was a property of step 14 rather than of the product.
//
// ── Why it lives in its own file ──────────────────────────────────────────
// `measure_recall.ts` was fixed and `check_recall_floor.ts` was not, so the
// gate that fails the build kept sampling by stride while the harness it floors
// sampled by shuffle. A floor and its measurement drawing different samples is
// a gate calibrated against a number nobody can reproduce — and the fix for
// that is never a comment asking the next person to update both.
//
// ── The properties ────────────────────────────────────────────────────────
// Deterministic, so runs stay comparable — which is the whole reason stride was
// chosen in the first place. Unable to align with the file's order, because it
// does not consult it. And varied by SEED on purpose: a result that does not
// survive a change of seed was never there.
export const DEFAULT_SEED = 20260806;

/** mulberry32. Small, fast, and adequate for shuffling a few thousand rows;
 *  nothing here needs cryptographic quality, it needs reproducibility. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` rows drawn without replacement, by a seeded Fisher-Yates.
 *
 *  Throws rather than returning a short or empty sample. A harness that
 *  reports 0/0 instead of failing is how a defect survives: an unparseable N
 *  once produced NaN, an empty sample, and a clean-looking "0/0 (NaN%)". */
export function sampleRecall<T>(rows: T[], n: number, seed = DEFAULT_SEED): T[] {
  if (!rows.length) throw new Error("sampleRecall: no rows to sample from");
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`sampleRecall: n must be a positive number, got ${n}`);
  }
  const rnd = rng(seed);
  const shuffled = rows.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/** The 95% binomial half-width, in points.
 *
 *  Printed next to every headline figure so a change smaller than it cannot be
 *  reported as a win. At n=200 and p~0.2 this is about 5.5 points; several
 *  "improvements" accepted in this project were inside it, and the seeded
 *  shuffle is what makes the interval mean anything at all. */
export const halfWidth = (hits: number, n: number): number =>
  100 * 1.96 * Math.sqrt(((hits / n) * (1 - hits / n)) / n);
