// What a published row says when the writer wrote nothing about it.
//
// ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
// The writer is handed the candidate rows already ranked and already cut, and
// told to return one note per row and to omit none. It sometimes returns
// fewer. Until now the pipeline answered that by DELETING the row: `worth:
// Boolean(note)`, one expression, no event a founder or a PM would ever see.
//
// Measured on the 23 briefs whose funnel counts are recorded, the writer left
// a row unwritten in 6 of them. In every one of those six the cap had spare
// rows, so the deletion was not absorbed by the cut: a candidate the ranker
// had placed inside the published set was replaced by the next one down.
// Whichever funds the writer happened to have something to say about got the
// last word over the ranker's.
//
// So the row publishes, and this is what it carries when no note arrived.
//
// ── WHAT THIS COPY MAY AND MAY NOT CLAIM ──────────────────────────────────
// It may state what the pipeline itself decided and can cite: how many of the
// scheme's own eligibility rules were evaluated against this company and what
// they came to. That is true whether or not a model wrote a sentence about it.
//
// It may NOT read as an assessment we made and did not. The old fallback,
// "Verify eligibility directly with the fund", was rejected for exactly that
// reason and the objection was right: a bland sentence in the voice of the
// brief is indistinguishable from a considered one. The lead clause below is
// the answer to it. It says plainly that this row has no written assessment,
// so the founder can tell the difference at a glance, and it is the string
// FUND-5 keys on so the same fact is visible to us as a rule violation on
// every published brief.
//
// The lines are built per row from that row's own facts. Two unwritten rows
// on one brief therefore differ wherever the rows differ, which is what stops
// this becoming the "three identical rows" failure the deletion was protecting
// against.
import type { InstitutionEntry } from "./types";

/** The lead clause on every row published without writer copy.
 *
 *  ONE definition, read by the copy below and by FUND-5 in briefChecks.ts. A
 *  check that carries its own copy of the string it looks for is a check that
 *  goes quietly dead the day the string is reworded, which is what the two
 *  fallback sentences it used to name had already done: nothing could reach
 *  them, because a row with no note never published. */
export const UNWRITTEN_ROW_LEAD = "No written assessment for this row;";

/** True for prose this file generated, rather than a model.
 *
 *  Derived from the constant, never a second spelling of it. */
export function isUnwrittenRowCopy(s: unknown): boolean {
  return String(s ?? "").includes(UNWRITTEN_ROW_LEAD);
}

/**
 * The two model-written fields, built from the row instead.
 *
 * Deterministic and total: every row gets both fields non-empty, whatever it
 * carries, because FUND-5's other half is that a published row is never blank.
 */
export function unwrittenRowCopy(
  row: Pick<InstitutionEntry, "verdict" | "gatesChecked" | "stale" | "lastAwardYear" | "link">,
): { whyEligible: string; nextStep: string } {
  const n = row.gatesChecked ?? 0;
  // The screen's own result, in the screen's own terms. `one_blocker` is the
  // only verdict that publishes with a failing rule; `blocked` never reaches a
  // published row at all, and `unknown` means the rules exist but nothing this
  // founder answered could decide them.
  const outcome =
    n === 0 ? "none of this scheme's own eligibility rules could be checked against this company"
      : row.verdict === "one_blocker"
        ? `${n} of this scheme's own eligibility rules were checked and one is not met`
        : row.verdict === "open"
          ? `${n} of this scheme's own eligibility rules were checked and none rules this company out`
          : `${n} of this scheme's own eligibility rules were checked and the result is inconclusive`;

  // FUND-11: a dormant scheme is never promised an upcoming call, and its step
  // is confirming it still runs.
  const nextStep = row.stale
    ? `Confirm with the body that runs this scheme that it still awards${
      row.lastAwardYear ? `, dormant since ${row.lastAwardYear}` : ""}.`
    : row.link?.kind === "apply"
      ? "Open this row's application route and confirm the current call is open."
      : "Confirm the current call and its eligibility criteria with the body running this scheme.";

  return { whyEligible: `${UNWRITTEN_ROW_LEAD} ${outcome}.`, nextStep };
}
