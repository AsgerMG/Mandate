// The brief's estimated time remaining.
//
// Measured 2026-07-29 across 20 real briefs: end-to-end latency correlates with
// OUTPUT TOKENS at r = +1.00, at a strikingly stable 93.6 ± 2.1 tok/s. It
// correlates with retrieved context size at r = -0.16, i.e. not at all. So the
// estimate is arithmetic on streamed text, not a guess from the profile:
//
//     remaining = (expectedTotalChars - charsSoFar) / observedCharsPerSecond
//
// Two rules the measurements forced, both about honesty rather than accuracy:
//
// 1. Nothing available at retrieval time predicts a run's size (facets +0.15,
//    passages -0.25, context chars -0.19). Retrieval finishing is the obvious
//    moment to show a "refined" estimate and it would be pure theatre — so this
//    module returns the unchanged opening range until real text starts arriving.
//
// 2. The distribution is bimodal, not noisy: 8 of 10 briefs ran a clean two-call
//    path (138-234s) while 2 needed correction rounds (267-558s). We learn which
//    population we're in the moment a correction stage fires, so the estimate
//    widens then — with a reason shown to the user, never silently.
//
// See project-management/brief-ux-plan.md.

export type Expectation = {
  p10_seconds: number;
  p50_seconds: number;
  p90_seconds: number;
  tokens_per_second: number;
  /** Characters of report text the client will see streamed across both passes.
   *  NOT derived from output tokens: those include thinking and both passes, so
   *  visible text is only ~19% of tokens x 4 (measured 2026-07-29). Calibrating on
   *  tokens overestimated remaining text ~5x and made the estimate *rise*. */
  typical_streamed_chars: number;
};

export const FALLBACK_EXPECTATION: Expectation = {
  p10_seconds: 138,
  p50_seconds: 184,
  p90_seconds: 267,
  tokens_per_second: 93.7,
  typical_streamed_chars: 26500,
};

// Characters of visible text per second while the model is actually writing.
// Measured from the live run of 2026-07-30: ~19,000 chars appeared in ~65s of
// streaming. Only a seed — it is replaced by this run's own observed rate as soon
// as enough text has arrived, so an error here costs a few seconds at most.
const FALLBACK_CHARS_PER_SECOND = 290;

// Don't trust an observed rate until enough text has arrived for it to mean
// something — the first chunk after a long thinking pause implies an absurdly low
// rate. ~500 tokens, i.e. about five seconds of generation.
const MIN_CHARS_FOR_LIVE_RATE = 2000;

// A correction pass costs roughly another draft's worth of output. Derived from
// the two observed correction runs: 3 and 5 calls, 24.5k and 53.9k output tokens
// against a ~16k clean-path median.
const CORRECTION_MULTIPLIER = 1.6;

export type EtaInput = {
  expectation: Expectation;
  /** The last estimate shown, so a new one can never silently exceed it. */
  previousRemaining?: number | null;
  /** Characters of report text streamed so far. 0 before drafting starts. */
  charsSoFar: number;
  /** Seconds since the first streamed character. */
  streamingSeconds: number;
  /** Total seconds since generation started. */
  elapsedSeconds: number;
  /** True once a correction/retry stage has fired this run. */
  correcting: boolean;
};

export type Eta = {
  /** Seconds remaining, or null when we have no honest basis for a number. */
  remainingSeconds: number | null;
  /** 0-1 fraction of expected output produced, or null while indeterminate. */
  progress: number | null;
  /** Whether `progress` is a real measurement or we're still in the dark. */
  determinate: boolean;
};

/** Human-readable, deliberately coarse. False precision on a bimodal
 *  distribution reads as a broken promise the moment it slips. */
export function formatRemaining(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds <= 20) return "almost there";
  if (seconds <= 45) return "under a minute left";
  if (seconds < 90) return "about a minute left";
  const minutes = Math.round(seconds / 30) / 2; // nearest half minute
  if (minutes <= 1.5) return "about 90 seconds left";
  return `about ${Math.round(minutes)} minutes left`;
}

/** The opening promise, before anything is known about this run. A range, not a
 *  point: "typically completes in 2-4 minutes" survives a slip that "3 minutes"
 *  does not. */
export function formatExpectation(e: Expectation): string {
  const lo = Math.max(1, Math.floor(e.p10_seconds / 60));
  const hi = Math.max(lo + 1, Math.ceil(e.p90_seconds / 60));
  return `usually ${lo} to ${hi} minutes`;
}

export function computeEta({
  expectation,
  charsSoFar,
  streamingSeconds,
  elapsedSeconds,
  correcting,
  previousRemaining,
}: EtaInput): Eta {
  const expectedChars =
    expectation.typical_streamed_chars * (correcting ? CORRECTION_MULTIPLIER : 1);

  // Nothing has been written yet — retrieval, or thinking before the first token.
  // Fall back to the measured median minus time already spent, and say plainly
  // (via determinate: false) that this is not a measurement of this run.
  if (charsSoFar < 1) {
    const median = expectation.p50_seconds * (correcting ? CORRECTION_MULTIPLIER : 1);
    return {
      // Floored well above zero: before any text exists we genuinely don't know,
      // and counting down to "almost there" while nothing has been written is the
      // most misleading thing this could do.
      remainingSeconds: Math.max(30, Math.round(median - elapsedSeconds)),
      progress: null,
      determinate: false,
    };
  }

  const fallbackRate = FALLBACK_CHARS_PER_SECOND;
  const liveRate =
    charsSoFar >= MIN_CHARS_FOR_LIVE_RATE && streamingSeconds > 0
      ? charsSoFar / streamingSeconds
      : fallbackRate;
  // Guard against a stalled stream driving the estimate to infinity.
  const rate = Math.max(liveRate, fallbackRate * 0.25);

  const remainingChars = Math.max(0, expectedChars - charsSoFar);
  let remaining = Math.max(0, Math.round(remainingChars / rate));
  // An estimate that goes UP is worse than no estimate: it reads as a broken
  // promise and it destroys trust in every other number on the screen. It may
  // only rise when a correction pass fires, which the UI announces with a reason.
  // Observed live 2026-07-30 before this clamp: "about a minute left" jumped back
  // to "about 3 minutes left" the moment the token-based estimate took over.
  if (!correcting && previousRemaining != null) {
    remaining = Math.min(remaining, previousRemaining);
  }
  return {
    remainingSeconds: remaining,
    // Capped just under 1: a bar that sits at 100% while text is still arriving
    // is worse than one that admits it doesn't know exactly where the end is.
    progress: Math.min(0.97, charsSoFar / expectedChars),
    determinate: true,
  };
}
