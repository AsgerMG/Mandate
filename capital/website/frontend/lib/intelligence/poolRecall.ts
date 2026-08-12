// wsDR — THE BASE RATE, READ AT THE DEPTH OF THE LIST ACTUALLY SHOWN.
//
// ── The defect ────────────────────────────────────────────────────────────
// The selector's prompt told every model it ever called that the fund it is
// looking for is "somewhere in this list about three quarters of the time".
// That figure was measured on `computeVerdict`'s candidate list, median 105
// rows. The list the selector is shown is `VERDICT_POOL`, which was 18 when
// wsDQ screened 45 real recall founders and put the true figure there at 15/45
// — about one in three. The model was being told to reach down a list that
// usually does not contain the answer, and it obeyed: mean deepest reach 13.6
// of 17.
//
// ── Why a curve and not a corrected constant ──────────────────────────────
// A second hand-typed percentage is the same defect with a better value. The
// number is a FUNCTION OF THE LIST LENGTH, and the list length is exactly what
// this workstream is changing: at the late seam the selector reads
// `VERDICT_POOL` rows, at the early seam it reads `SELECT_DEPTH`. A constant
// would be wrong again the moment either moves, and silently — nobody edits a
// sentence when they edit a cap. (Which is why no number appears in this
// paragraph: a value written here is the same defect wearing a comment.)
//
// So the whole curve is measured and committed by `scripts/_wsdr_curve.ts`, on
// the HOLDOUT split (the prompt says "held-out companies", so it had better be
// held out), and the prompt reads the point matching its own menu length.
//
// ── DEGRADES TO SILENCE, NOT TO A GUESS ───────────────────────────────────
// `loadGenerated` returns the neutral value loudly when the artifact cannot be
// read. The neutral value here is an EMPTY curve and `poolRecallAt` then
// returns null, and the prompt drops the base-rate sentence entirely. Every
// other artifact in this directory degrades to a worse ranking; this one
// degrades to a prompt that makes no claim about how often the answer is
// present. Falling back to a number would be reinstating the exact defect the
// module exists to remove.
//
// A leaf module: it reads a committed artifact of AGGREGATE percentages and
// nothing else. There is no per-fund and no per-company information in the
// curve, so it cannot tell any request anything about its own answer — which
// is why it is admissible on the request path at all.
import { loadGenerated } from "./generatedArtifact";

/** The depths the curve is measured at. Chosen to bracket every list length
 *  the selector can be shown: 6 is the published table, 18 is `VERDICT_POOL`,
 *  40 is `SELECT_DEPTH`, and the rest give the interpolation something to work
 *  with either side of a seam that moves. */
export const POOL_RECALL_KS = [1, 3, 6, 10, 18, 25, 30, 40, 50, 75, 100, 150, 250];

export const POOL_RECALL_FILE = "poolRecallCurve.generated.json";

interface Curve {
  n?: number;
  recallAtK?: [number, number][];
}

let memo: Curve | null = null;
const curve = (): Curve => (memo ??= loadGenerated<Curve>(POOL_RECALL_FILE, {}));

/** For tests and harnesses that need to force a reload after writing the file. */
export function resetPoolRecall(): void { memo = null; }

/** How many founders the curve was measured on, or 0 if it did not load. */
export const poolRecallN = (): number => curve().n ?? 0;

/**
 * P(the fund a company actually won is within the first `k` rows of the ranked
 * accessible pool), as a fraction, or null if the curve is unavailable.
 *
 * Linear between measured points, anchored at (0, 0) — a list of no rows
 * contains nothing. ABOVE the deepest measured point it returns that point's
 * value rather than extrapolating: recall is monotone and bounded, and a
 * prompt claiming a number nobody measured is the defect this file closes.
 */
export function poolRecallAt(k: number): number | null {
  const pts = curve().recallAtK;
  if (!pts?.length || !Number.isFinite(k) || k <= 0) return null;
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  let prev: [number, number] = [0, 0];
  for (const p of sorted) {
    if (k === p[0]) return p[1];
    if (k < p[0]) {
      const span = p[0] - prev[0];
      return span <= 0 ? p[1] : prev[1] + ((p[1] - prev[1]) * (k - prev[0])) / span;
    }
    prev = p;
  }
  return prev[1];
}

/** A base rate as a founder-readable percentage. Rounded to the nearest 5,
 *  because it IS a base rate: quoting "33.4%" to a model over 71 founders
 *  claims a precision the sample does not carry. */
export const asBaseRate = (p: number): number => Math.round((p * 100) / 5) * 5;

/**
 * The curve read at a DEPTH LEVER, which may be `Infinity` for `all`.
 *
 * `poolRecallAt` correctly refuses a non-finite k — it is the honest answer for
 * a prompt, which must not quote a number nobody measured. It is the WRONG
 * answer for a harness header, where `?? 0` then prints "0.0%" for the deepest
 * arm there is, and three harnesses print exactly that line.
 *
 * Recall is monotone and bounded, and the curve's deepest measured point IS the
 * whole-pool figure (`check_pool_recall_curve.ts` asserts that it plateaus), so
 * "all" is that point. That is a read of the measurement rather than an
 * extrapolation past it.
 *
 * `check_pool_recall_curve.ts` already open-coded this for an infinite
 * `SELECT_DEPTH`; now that `BRIEF_VERDICT_POOL` takes `all` too there would be
 * three copies of it, which is how the two spellings of one rule drift apart.
 */
export function poolRecallAtDepth(k: number): number | null {
  if (Number.isFinite(k)) return poolRecallAt(k);
  const pts = curve().recallAtK;
  if (!pts?.length) return null;
  return pts.reduce((a, b) => (b[0] > a[0] ? b : a))[1];
}

/** How a depth lever reads in a LEVERS line: its own spelling, so the line
 *  round-trips back into the environment variable that produced it. */
export const depthLabel = (k: number): string =>
  Number.isFinite(k) ? String(k) : "all";

/** How a depth reads in PROSE — "the first 18", "the whole pool". A separate
 *  function from `depthLabel` because a levers line and a sentence want
 *  different words, and one function returning a string that suits neither is
 *  how "P(won in first all)" gets printed. */
export const depthPhrase = (k: number): string =>
  Number.isFinite(k) ? `the first ${k}` : "the whole pool";
