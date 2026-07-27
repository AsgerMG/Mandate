// Copy that tells a founder to WAIT rather than move.
//
// Shared deliberately between the pipeline (which drops these rows) and
// scripts/bench_report.ts (which counts them), so the definition of
// "not something you can act on" cannot drift between what we enforce and
// what we measure.
//
// The rule it enforces: a brief never shows a fund that is deprioritised or
// not relevant. A row the founder cannot move on is a thing to know, not a
// thing to do, and the brief is a list of things to do. sennder's brief
// published five rows of which three said "deprioritise", "monitor calls" and
// "treat as informational" — each honest in isolation, together a padded table.
export const WATCH_ONLY_COPY =
  /\b(monitor|deprioriti[sz]e|informational|watch|wait for|only pursue if|act if|revisit|keep an eye|fall ?back|longer[- ]horizon)\b/i;

/**
 * True when this row is not something the founder can act on now — either the
 * writer said so, or its own copy gives the game away.
 *
 * Both signals are checked because the flag alone is not enough: the writer
 * kept rows flagged actionable while writing "Monitor the next call" and
 * "Deprioritise unless the grant pipeline falls short" into the next step.
 */
export function isWatchOnly(
  actionableNow: boolean | undefined,
  nextStep: string | undefined,
  whyEligible?: string | undefined,
): boolean {
  if (actionableNow === false) return true;
  return WATCH_ONLY_COPY.test(String(nextStep ?? "")) ||
    WATCH_ONLY_COPY.test(String(whyEligible ?? ""));
}
