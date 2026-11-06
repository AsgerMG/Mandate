// wsGA — THE POWER ARITHMETIC. Not a second McNemar.
//
// `scripts/mcnemar.ts` is THE McNemar in this repo, and its header records what
// happened the last time there were three of them: they disagreed, they shared
// a name, and a z quoted from one harness was compared against a z from
// another. Nothing here re-implements it. `mcnemarFrom2x2` is imported and
// re-exported so a caller of this module cannot accidentally reach for a local
// copy, and every p-value below is that function's exact binomial.
//
// What this file adds is the thing that has to exist BEFORE a run rather than
// after it: given a budget, what effect can the run actually see. A power
// calculation done after the data is a rationalisation; done before, it is the
// difference between spending ten dollars and wasting them.
//
// Pure arithmetic. No environment, no corpus, no answer key, no IO.
import { mcnemarFrom2x2, type McNemarResult } from "../mcnemar";

export { mcnemarFrom2x2, mcnemarLine, type McNemarResult } from "../mcnemar";

const LN_FACT: number[] = [0, 0];
function lnFactorial(n: number): number {
  for (let i = LN_FACT.length; i <= n; i++) LN_FACT[i] = LN_FACT[i - 1] + Math.log(i);
  return LN_FACT[n];
}

/** P(X >= k) for X ~ Binomial(m, p). Summed term by term for the same reason
 *  `mcnemar.ts` sums its factorials: a discordant count here is at most a few
 *  hundred, and an exact sum has no coefficient table to get wrong. */
export function binomUpperTail(k: number, m: number, p: number): number {
  if (k > m) return 0;
  if (p <= 0) return k <= 0 ? 1 : 0;
  if (p >= 1) return 1;
  let s = 0;
  for (let i = Math.max(0, k); i <= m; i++) {
    s += Math.exp(lnFactorial(m) - lnFactorial(i) - lnFactorial(m - i)
      + i * Math.log(p) + (m - i) * Math.log(1 - p));
  }
  return Math.min(1, s);
}

/**
 * The smallest `ab` (discordant pairs falling the TREATMENT's way), out of `m`
 * discordant pairs, that reaches two-sided exact p <= alpha.
 *
 * `null` when NO split of m pairs can. That is not a corner case here: at m = 5
 * the best available result is 5-0, whose exact two-sided p is 0.0625, so a run
 * that produces five discordant pairs CANNOT reach significance however
 * one-sided it is. wsDR's whole 45-founder run produced three.
 */
export function criticalAb(m: number, alpha = 0.05): number | null {
  for (let ab = Math.ceil(m / 2); ab <= m; ab++) {
    if (mcnemarFrom2x2(ab, m - ab).p <= alpha) return ab;
  }
  return null;
}

/** P(reject H0 in the TREATMENT's favour) when each discordant pair falls that
 *  way with probability `pi`, over `m` discordant pairs.
 *
 *  Rejecting in the control's favour is not power for a claim that the
 *  treatment wins, so only the upper tail counts. */
export function powerAt(m: number, pi: number, alpha = 0.05): number {
  const k = criticalAb(m, alpha);
  if (k === null) return 0;
  return binomUpperTail(k, m, Math.min(1, Math.max(0, pi)));
}

/**
 * ── THE MINIMUM DETECTABLE EFFECT, IN THE UNITS THE OWNER READS ────────────
 *
 * Inputs: `n` founders and `d`, the DISCORDANCE RATE — the share of pairs on
 * which the two arms disagree at all. Expected discordant pairs m = n*d.
 *
 * A true split `pi` produces an expected gain of m(2*pi - 1)/n points, so this
 * searches pi upward for the first value whose power reaches `power`, and
 * returns the gain at that pi. `null` when no effect, however large, gets
 * there — which happens whenever m is small enough that even a clean sweep
 * misses alpha, and is the answer a budget has to be checked against.
 *
 * The expected m is used rather than integrating over its sampling
 * distribution. That is a simplification and it is optimistic by a little at
 * small m; it is stated here rather than buried, and it does not change any
 * conclusion this project draws from it, because the conclusions all turn on
 * m being roughly an order of magnitude too small rather than on a few percent.
 */
export function mdePowered(
  n: number, d: number, power = 0.8, alpha = 0.05,
): { pointsGain: number; pi: number; m: number } | null {
  const m = Math.round(n * d);
  if (criticalAb(m, alpha) === null) return null;
  for (let pi = 0.5; pi <= 1.0001; pi += 0.0025) {
    const q = Math.min(1, pi);
    if (powerAt(m, q, alpha) >= power) {
      return { pointsGain: (100 * m * (2 * q - 1)) / n, pi: q, m };
    }
  }
  return null;
}

/** The gain, in points, at which a run of `n` pairs with discordance rate `d`
 *  merely CROSSES significance — i.e. the boundary, at 50% power. Always
 *  smaller than `mdePowered` and never the number to plan against; printed
 *  beside it so the gap between "could be significant" and "will be" is
 *  visible rather than argued about. */
export function mdeAtBoundary(n: number, d: number, alpha = 0.05): number | null {
  const m = Math.round(n * d);
  const k = criticalAb(m, alpha);
  return k === null ? null : (100 * (2 * k - m)) / n;
}

/** Convert a target gain in points into the `pi` that produces it, given m and
 *  n. Returns null when the gain is arithmetically unreachable — m discordant
 *  pairs cannot produce a gain larger than m/n even if every one falls the same
 *  way, and a power table that prints a number there is lying. */
export function piForGain(gainPoints: number, m: number, n: number): number | null {
  if (m <= 0) return null;
  const pi = 0.5 + (gainPoints * n) / (200 * m);
  return pi > 1 ? null : pi;
}

/**
 * Wilcoxon signed-rank, two-sided, normal approximation with tie correction.
 *
 * SECONDARY BY DESIGN, and the pre-registration says so. It reads the won
 * fund's RANK rather than a hit at five, so it uses every pair on which the
 * fund is rankable at all instead of only the few that straddle the cut —
 * several times as many. That sensitivity is exactly why it must not be allowed
 * to declare the headline: a more powerful test of a DIFFERENT quantity is not
 * a second chance at the same question.
 *
 * `pairs` are (control rank, treatment rank), 1-based, lower is better. A
 * negative z favours the treatment. Pairs where either side is absent are
 * dropped and COUNTED, never silently imputed as a large rank — imputing would
 * make the test a rediscovery of the binary one it exists to complement.
 */
export function wilcoxonSignedRank(
  pairs: { control: number | null; treatment: number | null }[],
): { n: number; dropped: number; z: number; p: number; meanShift: number } {
  const usable = pairs.filter(
    (x): x is { control: number; treatment: number } =>
      x.control != null && x.treatment != null);
  const dropped = pairs.length - usable.length;
  const meanShift = usable.length
    ? usable.reduce((a, x) => a + (x.treatment - x.control), 0) / usable.length : 0;
  const diffs = usable.map((x) => x.treatment - x.control).filter((d) => d !== 0);
  const n = diffs.length;
  if (n < 1) return { n: 0, dropped, z: 0, p: 1, meanShift };

  const abs = diffs.map((d) => Math.abs(d)).sort((a, b) => a - b);
  const rankOf = new Map<number, number>();
  const tieGroups: number[] = [];
  let i = 0;
  while (i < abs.length) {
    let j = i;
    while (j + 1 < abs.length && abs[j + 1] === abs[i]) j++;
    rankOf.set(abs[i], (i + j) / 2 + 1);
    tieGroups.push(j - i + 1);
    i = j + 1;
  }
  let w = 0;
  for (const d of diffs) w += Math.sign(d) * (rankOf.get(Math.abs(d)) ?? 0);
  const varW = (n * (n + 1) * (2 * n + 1)) / 6
    - tieGroups.reduce((a, t) => a + (t ** 3 - t), 0) / 48;
  const z = varW > 0 ? w / Math.sqrt(varW) : 0;
  return { n, dropped, z, p: 2 * (1 - normalCdf(Math.abs(z))), meanShift };
}

function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Convenience: the 2x2 from two parallel boolean arrays, so a caller with a
 *  per-founder record does not have to build a case array twice. */
export function paired(
  treatment: boolean[], control: boolean[],
): McNemarResult {
  if (treatment.length !== control.length) {
    throw new Error(
      `paired(): ${treatment.length} treatment results against ${control.length} control ` +
      "results. A paired test whose arms saw different cases is not a paired test.");
  }
  let ab = 0, ba = 0, both = 0, neither = 0;
  for (let i = 0; i < treatment.length; i++) {
    if (treatment[i] && control[i]) both++;
    else if (treatment[i]) ab++;
    else if (control[i]) ba++;
    else neither++;
  }
  return mcnemarFrom2x2(ab, ba, both, neither);
}
