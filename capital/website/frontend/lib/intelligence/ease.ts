// Ease scoring — brief_funnel_v2 Stage 3.
//
// Ranks the shortlist by how easy a door actually is to walk through, rather
// than by fit alone (which is what selectLeafInstruments does: exact-country
// match, then ticket proximity, then event count).
//
// ── An honesty note about "clearance" ──────────────────────────────────────
// The plan called for ranking on "fewest unmet or unknown gates". That is not
// computable today: all 4,018 rows in eligibility_gates have a NULL
// value_spec, so eligibility.ts's evaluateGenericGates() never fires, and the
// `value` column is inconsistent free text ("Norway", "SME", "€0.5M–€5M per
// partner", "StateAidObjectiveGberArt25") that would need a per-field
// normalisation pass before any comparator could read it.
//
// Rather than invent a met/unmet number a founder could check and disprove,
// this scores what we can honestly compute:
//
//   resolved(i)  — the share of instrument i's documented gates we can SPEAK
//                  TO: the founder answered that gate's intake field, or a
//                  project answer landed on that exact gate. This is
//                  "how much of this fund's rulebook we have covered with
//                  you", NOT "how much you clear". Named accordingly
//                  everywhere it surfaces.
//   precedent(i) — comparable companies in the corpus that actually drew from
//                  this instrument. The empirical "this door opens" signal.
//
// Populating value_spec in the ETL is what unlocks true clearance; when it
// lands, swap resolved() for a real met/total and the rest of this file
// stands unchanged.
import { loadDbInstruments } from "./corpus";
import type { EligibilityAnswers, EligibilityCheck, ProjectAnswer } from "./types";

export interface EaseScore {
  instrumentId: string;
  /** 0-1: share of documented gates we have an answer for. */
  resolved: number;
  resolvedGates: number;
  totalGates: number;
  /** 0-1, normalised across the shortlist. */
  precedent: number;
  /** Raw comparable-company count behind `precedent`. */
  comparableCount: number;
  /** True when a hard, asserted gate is failing — demoted regardless of score. */
  blocked: boolean;
  /** True when this is a national scheme outside the founder's usable countries. */
  offCountry: boolean;
  score: number;
}

// Weights are a tuning starting point, not a finding (brief_funnel_v2
// "Risks"). Precedent carries slightly less than coverage because a big
// instrument shows high precedent for almost everyone.
const W_RESOLVED = 0.55;
const W_PRECEDENT = 0.45;

/**
 * Shrinkage on the resolved ratio, so a thinly-documented instrument cannot
 * win on arithmetic. Without it an Estonian equity scheme with 6 extracted
 * gates scored 5/6 = 0.83 and ranked SECOND for a German company with no
 * Estonian entity, forcing the writer to apologise for the row it was handed
 * ("you have no stated Estonian establishment"). With K=5, 5/6 becomes 5/11 =
 * 0.45 while 16/20 becomes 16/25 = 0.64: depth of documentation now counts in
 * an instrument's favour instead of against it.
 */
const RESOLVED_SHRINKAGE = 5;

/** A national scheme in a country the founder has no entity in and did not
 *  target is not an "easy" door, however much of its rulebook we can answer.
 *  Demoted rather than dropped: the caller's universe filter owns exclusion. */
const OFF_COUNTRY_PENALTY = 0.4;

function isAnswered(answers: EligibilityAnswers | undefined, field: string): boolean {
  if (!answers || !field || field === "none") return false;
  const v = (answers as Record<string, unknown>)[field];
  if (v === undefined || v === null || v === "" || v === "unsure") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Score every instrument in `instrumentIds` for ease, normalising precedent
 * across the set so the numbers are comparable to each other (not to some
 * absolute scale).
 *
 * `comparableCounts` maps instrumentId -> number of comparable companies that
 * drew from it; the caller owns the definition of "comparable" (subsector,
 * size band, country) since it already holds the corpus records.
 */
export function scoreEase(
  instrumentIds: string[],
  answers: EligibilityAnswers | undefined,
  projectAnswers: ProjectAnswer[] | undefined,
  comparableCounts: Map<string, number>,
  screen: EligibilityCheck[] = [],
  /** ISO2 codes the founder can actually use (home + entities + targets).
   *  Instruments tied to a country outside this set are demoted. Pass empty
   *  to disable the penalty. */
  founderIso2: Set<string> = new Set(),
): Map<string, EaseScore> {
  const ids = new Set(instrumentIds);
  const shortlist = loadDbInstruments().filter((i) => ids.has(i.id));

  // A project answer resolves the exact gate it was generated from.
  const answeredGateKeys = new Set(
    (projectAnswers ?? [])
      .filter((p) => p.answer && p.answer !== "None of these")
      .map((p) => `${p.instrumentId}::${p.gateKey}`),
  );

  // Hard blocks: only asserted (verified) not_met rows count. "likely_not_met"
  // is not strong enough to demote a fund on.
  const blockedNames = new Set(
    screen.filter((c) => c.status === "not_met" && c.verified).map((c) => c.check),
  );

  const raw = shortlist.map((inst) => {
    const total = inst.gates.length;
    const resolvedGates = inst.gates.filter(
      (g) => isAnswered(answers, g.intakeField) || answeredGateKeys.has(`${inst.id}::${g.id}`),
    ).length;
    const resolved = total > 0 ? resolvedGates / (total + RESOLVED_SHRINKAGE) : 0;
    const comparableCount = comparableCounts.get(inst.id) ?? 0;
    const blocked = [...blockedNames].some((n) => n.startsWith(`${inst.name} —`));
    // "" and "EU" are pan-European: never off-country.
    const c = (inst.country ?? "").toUpperCase();
    const offCountry =
      founderIso2.size > 0 && c !== "" && c !== "EU" && !founderIso2.has(c);
    return { instrumentId: inst.id, resolved, resolvedGates, totalGates: total, comparableCount, blocked, offCountry };
  });

  // log1p-normalise precedent across the shortlist: one huge instrument must
  // not flatten every other row to zero.
  const maxLog = Math.max(...raw.map((r) => Math.log1p(r.comparableCount)), 1);

  const out = new Map<string, EaseScore>();
  for (const r of raw) {
    const precedent = Math.log1p(r.comparableCount) / maxLog;
    let score = W_RESOLVED * r.resolved + W_PRECEDENT * precedent;
    if (r.offCountry) score *= OFF_COUNTRY_PENALTY;
    if (r.blocked) score *= 0.25;
    out.set(r.instrumentId, {
      ...r,
      precedent: Math.round(1000 * precedent) / 1000,
      resolved: Math.round(1000 * r.resolved) / 1000,
      score: Math.round(1000 * score) / 1000,
    });
  }
  return out;
}

/**
 * The one-line, founder-facing justification for a row's placing. Deliberately
 * says "answered", never "cleared" — see the honesty note at the top.
 * Returns "" when there is genuinely nothing to claim, so the caller can omit
 * the line rather than print a hollow one.
 */
export function whyEasyLine(e: EaseScore | undefined, instrumentName: string): string {
  if (!e) return "";
  const parts: string[] = [];
  if (e.totalGates > 0 && e.resolvedGates > 0) {
    parts.push(`your answers cover ${e.resolvedGates} of ${e.totalGates} documented requirements`);
  }
  if (e.comparableCount > 0) {
    parts.push(
      `${e.comparableCount} comparable ${e.comparableCount === 1 ? "company has" : "companies have"} drawn from ${instrumentName}`,
    );
  }
  if (!parts.length) return "";
  const line = parts.join("; ");
  return line.charAt(0).toUpperCase() + line.slice(1) + ".";
}
