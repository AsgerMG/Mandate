// ONE McNemar. There were three, they disagreed, and they shared a name.
//
// ── The defect ──────────────────────────────────────────────────────────────
// Three files defined `function mcnemar(...)` locally, none exported it, and
// two of them computed a DIFFERENT STATISTIC from the third:
//
//   fit_signal_blend.ts:315-326   z = (ab - ba) / sqrt(ab + ba)
//                                 SIGNED, no continuity correction.
//   _wsda_rows.ts:166-175         z = (|ab - ba| - 1) / sqrt(ab + ba)
//   _wscw_seats.ts:193-202        z = (|ab - ba| - 1) / sqrt(ab + ba)
//                                 UNSIGNED, Yates-corrected.
//
// On the same 2x2 those differ by more than rounding: with ab=9, ba=2 the first
// reports z = +2.11 (the treatment wins, outside noise) and the other two report
// z = 1.81 (inside noise, and silent about which arm won). A reader comparing a
// z from one harness against a z from another was comparing two statistics, and
// nothing on either line said so.
//
// ── The form, chosen rather than inherited ──────────────────────────────────
//
//   SIGNED, UNCORRECTED, plus an EXACT binomial p-value on small discordants.
//
// SIGNED because a ranker arm is not a two-sided curiosity: the question is
// always "did the treatment beat the control", and an unsigned |z| answers a
// question nobody asked. A harness that reports 2.4 without a direction has
// forced every reader to go back to the 2x2 to find out who won -- and the 2x2
// is exactly what gets dropped when a figure is pasted somewhere else.
//
// UNCORRECTED because Yates is a continuity correction for the chi-square
// approximation, and where it matters most (small discordant counts) the exact
// test is available and is not an approximation at all. Applying a conservative
// fudge to a normal approximation, when the exact answer is a binomial CDF over
// at most a few dozen terms, is the worse of the two options. `zYates` is
// returned anyway so any historical figure can be reproduced, and `verdict()`
// says so out loud whenever the correction would change the 1.96 call.
//
// EXACT because these arms routinely produce fewer than 25 discordant pairs,
// which is below where the normal approximation is trustworthy. `p` is the
// two-sided exact binomial p-value against Binomial(n, 1/2) -- the actual
// McNemar test, of which the z above is the large-sample approximation.
//
// ── What it does NOT do ─────────────────────────────────────────────────────
// It does not look at the concordant pairs, and it must not. Pairs both arms
// get right and pairs both arms get wrong carry no information about which arm
// is better; including them is how a paired comparison gets reported as a
// two-sample one, with a denominator inflated by every easy case.

/** The 2x2 of a paired binary comparison, reduced to what the test uses. */
export interface McNemarResult {
  /** Cases the TREATMENT gets right and the control does not. */
  ab: number;
  /** Cases the CONTROL gets right and the treatment does not. */
  ba: number;
  /** Cases both arms get right. Reported, never tested on. */
  both: number;
  /** Cases neither arm gets right. Reported, never tested on. */
  neither: number;
  /** Discordant pairs, `ab + ba`. The whole of the evidence. */
  discordant: number;
  /** SIGNED, uncorrected. Positive means the treatment won. THE statistic. */
  z: number;
  /** Yates-corrected, unsigned. Kept only so a pre-wsDN figure reproduces. */
  zYates: number;
  /** Two-sided EXACT binomial p-value. Authoritative below ~25 discordants. */
  p: number;
}

/** log(n!) by summation rather than by a factorial that overflows at 171.
 *
 *  Summed term by term rather than approximated: a discordant count here is at
 *  most a few hundred, the loop is microseconds, and an exact sum has no
 *  coefficient table to get wrong. A Lanczos lgamma would be faster and is the
 *  obvious reach; it is also one mistyped constant away from a p-value that is
 *  confidently wrong, which is the worst failure mode a statistic can have. */
const LN_FACT: number[] = [0, 0];
function lnFactorial(n: number): number {
  for (let i = LN_FACT.length; i <= n; i++) LN_FACT[i] = LN_FACT[i - 1] + Math.log(i);
  return LN_FACT[n];
}

/** Two-sided exact binomial p-value for k successes in n trials at p=1/2.
 *  Doubling the smaller tail is the convention McNemar's exact test uses, and
 *  it is symmetric here because the null is 1/2. Capped at 1. */
function exactTwoSided(k: number, n: number): number {
  if (n === 0) return 1;
  const lo = Math.min(k, n - k);
  let tail = 0;
  for (let i = 0; i <= lo; i++) {
    tail += Math.exp(lnFactorial(n) - lnFactorial(i) - lnFactorial(n - i) - n * Math.LN2);
  }
  return Math.min(1, 2 * tail);
}

/** McNemar over a paired arm. `treatment` and `control` are graded per case;
 *  both must be evaluated on the SAME cases in the SAME order, which is the
 *  only thing that makes the test paired. */
export function mcnemar<T>(
  cases: readonly T[],
  treatment: (c: T) => boolean,
  control: (c: T) => boolean,
): McNemarResult {
  let ab = 0, ba = 0, both = 0, neither = 0;
  for (const c of cases) {
    const t = treatment(c), k = control(c);
    if (t && k) both++;
    else if (t) ab++;
    else if (k) ba++;
    else neither++;
  }
  return mcnemarFrom2x2(ab, ba, both, neither);
}

/** The same test where the 2x2 is already counted -- some harnesses tally as
 *  they replay and have no case array left to iterate. */
export function mcnemarFrom2x2(ab: number, ba: number, both = 0, neither = 0): McNemarResult {
  const discordant = ab + ba;
  const z = discordant ? (ab - ba) / Math.sqrt(discordant) : 0;
  const zYates = discordant
    ? Math.max(0, Math.abs(ab - ba) - 1) / Math.sqrt(discordant) : 0;
  return { ab, ba, both, neither, discordant, z, zYates, p: exactTwoSided(ab, discordant) };
}

/** Below this many discordant pairs the normal approximation is not to be
 *  trusted and the exact p-value is the answer. */
export const EXACT_BELOW = 25;

/** One line, printed the same way everywhere, carrying the direction, the
 *  discordants it rests on, and the caveat that applies to THIS arm.
 *
 *  The caveat travels with the number by construction rather than by
 *  discipline: a z quoted without its discordant count is unfalsifiable, and a
 *  z quoted from an arm with four discordant pairs is noise wearing a decimal
 *  point. */
export function mcnemarLine(
  label: string, r: McNemarResult, treatmentName = "treatment", controlName = "control",
): string {
  const dir = r.z > 0 ? treatmentName : r.z < 0 ? controlName : "neither";
  const sig = Math.abs(r.z) > 1.96;
  const parts = [
    `${label}  McNemar(signed) z = ${r.z >= 0 ? "+" : ""}${r.z.toFixed(2)}`,
    `on ${r.discordant} discordant (${treatmentName} ${r.ab}, ${controlName} ${r.ba};`
      + ` both ${r.both}, neither ${r.neither})`,
    `exact p = ${r.p < 0.001 ? "<0.001" : r.p.toFixed(3)}`,
  ];
  if (r.discordant === 0) {
    parts.push("-- NO discordant pairs: the arms are identical on these cases, not tied on evidence");
  } else if (r.discordant < EXACT_BELOW) {
    parts.push(`-- only ${r.discordant} discordants, READ THE EXACT p, not the z`);
  } else {
    parts.push(sig ? `-- ${dir} wins, outside its own noise` : "-- inside its own noise");
  }
  // The one place the retired form is allowed to appear: where it would have
  // been read differently. Silent otherwise, so nobody quotes it by accident.
  if (r.discordant && (Math.abs(r.z) > 1.96) !== (r.zYates > 1.96)) {
    parts.push(`[Yates-corrected |z| = ${r.zYates.toFixed(2)}, which crosses 1.96 the OTHER way;`
      + ` the exact p above settles it]`);
  }
  return parts.join("  ");
}
