// The memo's candidate order: everything between the pool and the writer, with
// no model call in it.
//
// ── Why this is a module and not a hundred lines inside synthesize() ───────
// This is the last thing that happens to the candidate list before the writer
// sees it, and then `synthesize()` sends the head of it to the writer and cuts
// the result to `BRIEF_LIMITS.institutionsMax`. While it lived inside
// `synthesize()` it could not be measured without a model call, so every recall
// figure this repo has published was measured on `computeVerdict`'s table
// instead: a DIFFERENT ordering, over a DIFFERENT pool, capped at
// `DISPLAY_CAP`. Conclusions about "the five rows" were being drawn from a path
// the five rows do not come from.
//
// ── IT NO LONGER DECIDES THE ORDER (wsGB, 2026-08-12) ─────────────────────
// The sentence above used to read "the order the founder finally reads is
// decided here -- ease, fit, the blocked drop, the display-name dedupe". Of
// those four, `fit` is deleted, the blocked drop moved to `accessiblePool`
// before this runs, and `ease` was never a sort key here (it is the `whyEasy`
// line the row renders). What is left is the display-name dedupe, which demotes
// and does not reorder. The ranking arrives already done, from the model.
//
// The alternative -- a diagnostic that reimplements the ordering -- is the
// exact defect this codebase has paid for three times in two days: two
// functions building the same thing from different keys. So there is one
// implementation, production calls it, and the harnesses call the same one.
//
// Model-free and deterministic given its inputs. The IO is upstream (the pool
// and the semantic scores); nothing here reaches the network.
import { scoreEase, type EaseScore } from "./ease";
import { assessAll, type InstrumentAssessment } from "./verdict";
import { answersWithoutLateFields, softenAll } from "./answerProvenance";
import { resolveNameCollisions } from "./nameCollision";
import {
  displayInstitutionName,
  founderCountryList,
  preferBetterEvidencedRow,
} from "./shortlist";
import { toIso2 } from "./corpus";
import { isWatchOnly } from "./watchOnly";
import { unwrittenRowCopy } from "./unwrittenRow";
import type { ExclusionLog } from "./exclusions";
import type {
  CompetitorRecord,
  EligibilityAnswers,
  EligibilityCheck,
  InstitutionEntry,
  IntelligenceRequest,
  InstrumentRow,
  NoDoors,
} from "./types";

// The writer cap and the whole funnel it belongs to live in `caps.ts`, which
// imports nothing, so the check that asserts the funnel narrows can read them
// without dragging the corpus layer -- and its credentials -- in behind them.
// Re-exported here because this is where every caller looks for it.
import { WRITER_CANDIDATE_CAP } from "./caps";
export { WRITER_CANDIDATE_CAP };

/** ── THERE IS NO DETERMINISTIC MEMO SORT ANY MORE (wsGB, 2026-08-12) ───────
 *
 *  A constant `SHIPPED_MEMO_ORDER` stood here with three values — `verdict`
 *  (which shipped), `pool` and `fit` (its two controls) — and a `.sort()` below
 *  read it. That sort was THE deterministic ranking that picked the founder's
 *  published five, and it is gone: `AGENT_SELECT` now defaults to `adviser`, so
 *  the array reaching this function is already in the model's order, and a code
 *  sort applied on top of a model's ranking is not a tie-break, it is an
 *  override.
 *
 *  ── WHAT THE ORDER IS NOW, stated as a property ──────────────────────────
 *  `ordered` is `instrumentTable` in the order it arrived, with one rule
 *  applied: a row whose institution NAME is already shown is demoted to the
 *  back. Nothing else here reorders anything. The test for a case nobody has
 *  seen: two rows that render under different names appear here in the same
 *  relative order they were handed over, whatever their verdict, ease, score or
 *  country.
 *
 *  That makes the incoming order the whole of the ranking, and it is the
 *  ranker's — `agentSelectRows` returns `[...chosen, ...everything else in the
 *  pool's order]`, so a fund the model named leads the table and the pool's own
 *  order fills the seats it declined. The fallback is unchanged on every one of
 *  the failure paths that returns `rows` untouched.
 *
 *  ── THE MEASUREMENT THAT DECIDED THE REMOVED CONSTANT, KEPT ──────────────
 *  Because it is paid for and because it prices what this change costs. All
 *  three arms, ONE replay, one pool, tune n=250 seed 20260806, `ranker: all 245
 *  request(s) on EMBEDDING`:
 *
 *    MEMO@6        fit 24.0%      pool 28.8%      verdict 27.6%
 *    off-country rows in the published six    0          0          0
 *    published rows that are `open`        100%      95.4%       100%
 *
 *  Read for THIS change, the row that matters is the last one. Dropping the
 *  band sort makes the memo's order the `pool` arm's on every founder the model
 *  declines to re-rank, and the `pool` arm published 4.6% of its rows carrying
 *  an obstacle or no assessable verdict where `verdict` published none. Those
 *  rows are not blocked — `accessiblePool` still removes a conclusively shut
 *  door before anything here runs — and each states its obstacle in the fund's
 *  own words through `blocker`. But a founder can now read a qualified row
 *  above an unqualified one where before they could not, and that is the price
 *  of the model deciding rather than the arithmetic.
 *
 *  The receipt is `scripts/archive/_wsct_order.ts`. */

/**
 * The rows a memo may be BUILT from: the ranked list with the conclusively
 * blocked removed, in the same order.
 *
 * ── The property, and why a wider pool cannot express it ──────────────────
 * A pool seat spent on a fund that will be deleted before publication is a
 * seat that publishes nothing. `orderMemoCandidates` drops a conclusively
 * blocked row -- correctly, a door that is shut is not advice -- so the cut
 * that fills the pool has to happen AFTER that drop, not before it, or the
 * drop shrinks the table instead of backfilling it.
 *
 * `VERDICT_POOL`'s own comment has said exactly this since it was widened from
 * six to eighteen. Eighteen is a number standing in for the property, and the
 * distance between the top of the ranking and the first accessible row is not
 * a constant: it is a fact about the founder. Measured on the twelve bench
 * companies with gates hydrated, it is 1 for most of them, 5 for one, and 81
 * for a 250+ company whose national register is written for SMEs -- twenty-two
 * accessible funds, the first of them sixty-three places below the cut, and an
 * EMPTY brief as a result.
 *
 * The test for a case nobody has seen: could this row be published if it were
 * ranked first? If not, it may not hold a pool seat.
 *
 * FREE. `buildInstrumentTableHydrated` fetches gates for every row it selects,
 * not for the head of the list, so assessing the whole ranking costs no query
 * that was not already made.
 *
 * ── `lateFields`: the ONE place inform-never-remove is applied ─────────────
 * This is the only seam in the product that removes a fund on an encoded
 * verdict, so it is the only seam that has to know when the answer arrived.
 * See answerProvenance.ts for the decision and for why the list is derived
 * server-side and never accepted from a client. Omitted -- which is every
 * caller that predates it and every founder who answered no follow-up question
 * -- and this behaves exactly as it did before.
 */
export function accessiblePool(
  rows: InstrumentRow[],
  eligibility: EligibilityAnswers | undefined,
  log?: ExclusionLog,
  lateFields?: ReadonlySet<string>,
): InstrumentRow[] {
  const ids = rows.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
  const assessed = softenAll(
    assessAll(ids, eligibility), lateFields,
    // The second assessment is only computed when something IS late, which is
    // never on the shipped path today. See softenLateBlockers for why the
    // trigger is the prior VERDICT rather than the blockers' own fields.
    () => assessAll(ids, answersWithoutLateFields(eligibility, lateFields!)));
  return rows.filter((r) => {
    const a = r.instrumentId ? assessed.get(r.instrumentId) : undefined;
    if (a?.status !== "blocked") return true;
    log?.record("VER-BLOCKED", r.instrumentId ?? r.channel,
      `${a.blockers.length} encoded eligibility filters conclusively fail`);
    return false;
  });
}

/**
 * Why a founder has no doors, in the funds' own words.
 *
 * FUND-1 says an empty table is never the answer WHILE ANY DOOR IS OPEN. The
 * converse is the case this exists for: where no door is open, the brief has to
 * say so and say what would change it. Silence is the one answer that is never
 * acceptable, and silence is what shipped -- a brief with an empty table, no
 * explanation, and a console line about a branch that cannot be reached.
 *
 * The requirement text is VERBATIM from the fund's own encoded gate, never a
 * paraphrase and never our own words for it. That is the same standing rule
 * that governs the route: what a fund requires comes from the fund.
 */
export function explainNoDoors(
  rows: InstrumentRow[],
  eligibility: EligibilityAnswers | undefined,
): NoDoors {
  const assessed = assessAll(
    rows.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
    eligibility);
  const byRequirement = new Map<string, { requirement: string; field?: string; funds: number }>();
  for (const r of rows) {
    const a = r.instrumentId ? assessed.get(r.instrumentId) : undefined;
    if (a?.status !== "blocked") continue;
    // One row cannot be counted twice for the same requirement, or a fund with
    // two phrasings of one rule reads as two reasons.
    const seen = new Set<string>();
    for (const b of a.blockers) {
      const key = b.requirement.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = byRequirement.get(key);
      if (cur) cur.funds += 1;
      else byRequirement.set(key, { requirement: b.requirement, field: b.field, funds: 1 });
    }
  }
  return {
    considered: rows.length,
    ruledOutBy: [...byRequirement.values()].sort((a, b) => b.funds - a.funds).slice(0, 5),
  };
}

/** One candidate, with every score the ordering consulted still attached --
 *  the caller needs the assessment and the ease line to build the row. */
export interface MemoCandidate {
  row: InstrumentRow;
  /** Its position in the incoming pool, which since wsGB is the WHOLE of the
   *  order rather than the last tie-break. Kept on the candidate because a
   *  caller that wants to say how far the name-collapse moved a row needs the
   *  position it came in at. */
  i: number;
  /** ── `ease` IS GONE, FOR THE REASON THE FIT SCORE WENT (wsGI) ───────────
   *
   *  An `ease?: EaseScore` stood here, attached to every candidate of every
   *  pool on every memo request, and NOTHING read it: `pipeline.ts` builds the
   *  row's `whyEasy` line from `easeById`, which this function returns
   *  separately, and no other caller in `lib/`, `scripts/` or `app/`
   *  dereferenced the field. That is the same shape as the nine-component fit
   *  score wsGB removed one comment-block below — a value computed on the
   *  request path into a field with no reader — and the same argument retires
   *  it. `easeById` is unchanged and still the one copy.
   *
   *  `assessment` stays: `scripts/archive/_wsct_order.ts` reads it. */
  assessment?: InstrumentAssessment;
}

export interface MemoCandidateOrder {
  /** ── A PERMUTATION OF `instrumentTable`. Same multiset, nothing added,
   *  nothing removed. ─────────────────────────────────────────────────────
   *
   *  It was not. Two `.filter()`s stood here and both were wrong, in different
   *  ways and for the same reason -- a rule about what a founder should SEE was
   *  editing the universe the writer draws from:
   *
   *    the blocked filter was STRUCTURALLY DEAD. `accessiblePool` runs before
   *    this, on the same assessment, so nothing reaching here can be blocked.
   *    It was reported as a live count (`droppedBlocked`) that had been zero
   *    since the day the pool cut moved, which is worse than no number.
   *
   *    the display-name filter DELETED, first-wins, while `rules.ts` declares
   *    SEL-DUPE-NAME `demote-not-delete` WITH THE MEASUREMENT ATTACHED: pool
   *    recall 97% -> 83% when the sibling rule was a filter. `nameCollision.ts`
   *    exists because of that, and explicitly refutes first-wins survivor
   *    selection.
   *
   *  NOT yet cut to the writer cap: the cut is `.slice(0, WRITER_CANDIDATE_CAP)`
   *  and callers that want to measure the cut need to see past it. */
  ordered: MemoCandidate[];
  /** Exactly what the writer is shown. */
  toWriter: MemoCandidate[];
  easeById: Map<string, EaseScore>;
  /** Softened by `lateFields` where the input asked for it, so every consumer
   *  reads ONE verdict per instrument. Two assessments of one fund -- a
   *  softened one deciding the pool and a raw one rendered on the row -- would
   *  publish a line contradicting the screen that kept the fund. */
  assessments: Map<string, InstrumentAssessment>;
  /** A scheme with no award on record for years may be closed, repealed or
   *  simply between programme periods. Travels with the order because the row
   *  builder renders it. */
  isStale: (row: InstrumentRow) => boolean;
}

export interface MemoCandidateInput {
  /** The pool, already ranked and cut to VERDICT_POOL. */
  instrumentTable: InstrumentRow[];
  req: IntelligenceRequest;
  records: CompetitorRecord[];
  dbPeers: CompetitorRecord[];
  eligibilityScreen: EligibilityCheck[];
  log: ExclusionLog;
  /**
   * ── `pinned` IS GONE, AND IT WAS THE BAND SORT'S ANTIDOTE (wsGB) ────────
   *
   * A `pinned?: ReadonlySet<string>` stood here: the ids the selector chose, in
   * pick order, sorted AHEAD of the verdict band so that a row the model read
   * the fund's text and chose could not be pushed past the writer cap by rows
   * nobody chose, on the strength of our own encoding coverage.
   *
   * It existed only because a code sort ran after the model's. With that sort
   * removed the pin is a no-op wherever it used to fire: `agentSelectRows`
   * returns `[...chosen, ...the rest in the pool's order]`, so a chosen row's
   * incoming index IS its pick rank, and ordering by the incoming index is
   * ordering by the model's ranking. `memoCandidates.test.ts` pins that
   * equivalence rather than asserting it here.
   *
   * Removing it also removes a warm-container hazard that `pipeline.ts` had to
   * hold a paragraph of comment about: the pin was read from MODULE STATE
   * (`agentSelectLastDecision()`), which survives between requests in a
   * serverless container, and had already once carried one founder's picks into
   * another founder's brief.
   */
  /**
   * Fields the founder first answered on the follow-up screen, derived
   * server-side (answerProvenance.ts). Softens the assessments so the row's
   * rendered verdict and `accessiblePool` read the SAME verdict for a fund.
   * (It used to have a third reader, the band sort, which is gone.) Never a
   * client-supplied list.
   */
  lateFields?: ReadonlySet<string>;
}

/** ── WHICH ORDER THE BRIEF PUBLISHES IN ────────────────────────────────────
 *
 *  `candidates` **SHIPS.** The order the MODEL decided, i.e. the position of
 *            each row in `toWriter`. There is no score left in it: the
 *            deterministic sort was deleted in wsGB and `agentSelectMemoPool`
 *            hands this module a ranking. The writer's notes decide neither
 *            whether a row publishes nor where — the last channel by which
 *            they could, the watch-only demotion, went in wsGK.
 *  `writer`   CONTROL, and what shipped until this was written. Rank rows by
 *            the index of their note in the writer's reply.
 *
 *  ── Why the control is a control and not an option ───────────────────────
 *  WE INSTRUCT THE WRITER NOT TO RANK, THEN READ ITS OUTPUT AS A RANKING.
 *  Contract FUND-12 says "Rows are not ranked in the brief"; the prompt says
 *  "These rows are already ranked and already cut... Do not reorder them, do
 *  not omit one"; and `contracts/brief/02-funds.md` says "There is no channel
 *  for telling us a row is wrong." A model obeying all three returns the notes
 *  in the order it was given, and any departure from that order is a model
 *  DISOBEYING an instruction -- so reading the departure as judgement is
 *  reading noise as signal, and reading obedience as agreement.
 *
 *  The precedent is the deleted `WRT-NOT-WORTH` in rules.ts, whose evidence
 *  outlived the rule: THE FLAG REQUIRED ~40 LINES OF PROMPT GUARDRAILS TO STOP
 *  IT DELETING WELL-MATCHED FUNDS, AND IT LET ORDERING DECIDE PUBLICATION. The
 *  flag went; the ordering channel it warns about was still open, one field
 *  over, doing the same thing by permutation instead of by deletion. With
 *  BRIEF_INSTITUTION_CAP below WRITER_CANDIDATE_CAP the two are the same act:
 *  a note moved from position 2 to position 8 is a row deleted.
 *
 *  Kept, not deleted, for the same reason the memo-order controls are kept:
 *  the difference between the two is measurable for free from `scripts/`, and
 *  a control nobody can run is a claim nobody can check. Nothing in production
 *  passes it. */
export type PublishOrderControl = "candidates" | "writer";
export const SHIPPED_PUBLISH_ORDER: PublishOrderControl = "candidates";

/**
 * The rank each candidate row publishes at.
 *
 * @param rowKeys   the candidate keys, in candidate order — the array the
 *                  writer was handed and told not to reorder
 * @param noteKeys  the keys of the notes the writer returned, in ITS order
 *
 * Pure and model-free, so the two arms can be compared over a recorded reply
 * with no call. Under the "writer" control a key the writer did not mention
 * ranks last, which is the arm's whole hazard; under the shipped one every key
 * ranks where the candidate order put it, mentioned or not.
 */
export function publishRankByKey(
  rowKeys: readonly string[],
  noteKeys: readonly string[],
  control: PublishOrderControl = SHIPPED_PUBLISH_ORDER,
): Map<string, number> {
  const keys = control === "writer" ? noteKeys : rowKeys;
  const rank = new Map<string, number>();
  keys.forEach((k, i) => { if (!rank.has(k)) rank.set(k, i); });
  return rank;
}

/** One row of the writer's reply. `channel` carries the disambiguated rowKey,
 *  not necessarily the channel code — see the schema in pipeline.ts. */
export interface WriterRowNote {
  channel: string;
  whyEligible?: string;
  nextStep?: string;
  blockerPlain?: string;
}

export interface AssembledBriefRows {
  /** The rows the founder is handed, in publish order, already cut. */
  published: InstitutionEntry[];
  /** Candidate keys the writer returned no note for. They publish anyway; the
   *  list exists so the count is read rather than inferred from a short table. */
  unwritten: string[];
  /** Keys whose published copy reads as a thing to wait for rather than do.
   *  A REPORT, not an action: these rows publish at their own rank like any
   *  other, and the list exists so the count reaches the exclusion log and the
   *  brief's own record. See `watchOnly.ts`. */
  watchOnly: string[];
  /** Keys that fell below the cap. */
  cutByCap: string[];
}

/**
 * The published table, assembled from the ranked candidates and the writer's
 * reply.
 *
 * ── THE PROPERTY, AND THE TEST FOR A CASE NOBODY HAS SEEN ─────────────────
 * WHICH ROWS PUBLISH, AND IN WHAT ORDER, IS DECIDED BY RANK ALONE. The
 * writer's reply changes what a row SAYS and never whether it appears or where
 * it sits.
 *
 * The test, on any reply at all rather than on the ones we have seen: take any
 * reply, delete any subset of its notes, and replace the text of any of the
 * rest with anything whatsoever. `published` must come back as `rows.slice(0,
 * cap)`, row for row and in the same order, every time. Anything that fails
 * that is the writer selecting, and selecting is the ranker's job.
 *
 * ██ THIS BECAME TRUE ON 2026-08-13; IT WAS NOT BEFORE ██
 * A row whose own copy read as watch-only USED TO BE moved behind every
 * actionable row, and with the cap one above the published count that put it
 * outside the table -- so the writer's WORDS could change membership even
 * though its silence could not. Two workstreams found the same contradiction
 * on the same night and resolved it opposite ways: one weakened this docstring
 * to describe the sort, the other removed the sort. The sort is gone, because
 * the ranker was given the job of choosing and a regex over another model's
 * prose taking it back was never designed.
 *
 * It evicted at EVERY rank, not only the last: one match anywhere in the eight
 * made the seven non-matching rows exactly the published seven, so a match on
 * rank 1 removed the model's first choice. Nothing in the expression read the
 * rank. Over the 35 briefs in `brief_records` on 2026-08-13, 6 (17%) demoted at
 * least one row -- but ZERO of the 107 candidate rows written since 2026-08-08,
 * the day FUND-4 entered the writer's own contract. The prose defect was fixed
 * at the writing layer and the sort below it had been dead weight since.
 *
 * ── TWO CHANNELS BY WHICH THE REPLY USED TO SELECT, AND WHAT THEY COST ────
 * `worth: Boolean(note)` in `synthesize` (wsGC). A row the writer skipped was
 * dropped and the next candidate down moved up into its seat. Over the
 * recorded funnel counts it fired on 6 of 23 briefs, and on every one the cap
 * still had room — each a candidate the ranker had put in the table, swapped
 * for one it had put below it.
 *
 * THE WATCH-ONLY DEMOTION (wsGK, this change). `[...actionable, ...the rest]`
 * stood where the slice below stands, sorting rows whose PROSE matched a
 * vocabulary behind rows whose prose did not. The first two below are why it
 * is the same defect as the drop it replaced rather than the fix for it; the
 * third is how often it has actually cost anything, which is less than the
 * first two imply and is the reason this is cheap to remove rather than
 * urgent:
 *
 *   IT EVICTED AT EVERY RANK, NOT THE LAST. The writer is shown
 *   `WRITER_CANDIDATE_CAP` (8) candidates and the brief publishes
 *   `institutionsMax` (7). With one match anywhere in the eight, the seven
 *   actionable rows are exactly the published seven — so the matching fund was
 *   cut and the rank-8 fund promoted into its seat, whether the match was on
 *   rank 8 (a no-op) or on rank 1 (the model's first choice, gone). The gap
 *   between the two caps used to be two seats and is now one, which is what
 *   turned a demotion into a deletion.
 *
 *   IT WAS ALSO THE ONLY REORDER LEFT. A match on rank 2 that did not evict
 *   still moved that fund to the back of the table, i.e. out of the first five
 *   rows — the head the funnel's `top_five` measures and the head the ranker
 *   was put in the selection seat to fill.
 *
 *   IT HAS FIRED, AND NOT RECENTLY — WHICH IS THE HONEST FIGURE AND CUTS BOTH
 *   WAYS. Counted on `brief_records` in Postgres, 35 briefs, not on the
 *   committed ledger export, which holds ids 2-20 and stops at 2026-07-30:
 *   8 matches in 128 candidate rows over the 19 briefs to 2026-07-30 (6.3% of
 *   rows, 6 of 19 briefs), and 0 in the 107 rows over the 14 briefs since.
 *   Measuring on the export alone would have read the first number as current.
 *
 *   The last match is dated 2026-07-30, the day FUND-4 — "nextStep is an
 *   action the founder can start" — entered the writer's own contract. n is 14
 *   briefs, so the right reading is a bound, not a zero: at 0/107 the 95%
 *   upper bound is 2.8% of rows, i.e. up to about one brief in five with a
 *   match and one in thirty-five losing the model's top pick.
 *
 *   So this is being removed at its cheapest moment rather than its most
 *   expensive. The case is not the saving. It is that the cost of one firing
 *   is a fund the founder never sees and no page records, the benefit is now
 *   covered by an instruction to the writer, and a hazard whose only defence
 *   is the continued good behaviour of a model is not a design.
 *
 * The signal itself is not lost and was never the founder's to lose: the
 * sentence that matched is the row's own next step, and the founder reads it.
 * What is lost is a regex over one model's prose quietly overruling another
 * model's ranking. `watchOnly` below still counts every match, `FUND-4` still
 * raises it against the published report, and both are reports.
 *
 * ── `cutByCap` IS EMPTY NOW, AND THAT IS THE FIX, NOT A BUG (wsHR) ────────
 * `WRITER_CANDIDATE_CAP` was lowered to `institutionsMax`, so `rows` arrives
 * already the length of the table and nothing is cut here. The count is still
 * reported rather than removed: it is what goes non-zero the day the two caps
 * come apart again, and a cap gap is how a founder came to be told that ADEME's
 * incentive-effect rule closed a fund that was not on her table. See the
 * WRITER_CANDIDATE_CAP block in caps.ts and the pair in check_contracts.ts.
 *
 * Model-free and total: give it rows and a reply and it returns a table.
 */
export function assembleBriefRows(input: {
  /** The candidate rows, in rank order — the array the writer was handed. */
  rows: readonly InstitutionEntry[];
  /** Their keys, positionally aligned with `rows`. */
  rowKeys: readonly string[];
  notes: readonly WriterRowNote[];
  cap: number;
  /** The house de-dash. Applied to MODEL prose only, and passed rather than
   *  imported because it belongs beside the writer call while this module is
   *  model-free. Code-built copy is written without em-dashes to begin with. */
  clean: (s: string) => string;
  publishOrder?: PublishOrderControl;
}): AssembledBriefRows {
  const { rows, rowKeys, notes, cap, clean } = input;
  const byKey = new Map(notes.map((n) => [n.channel, n]));
  const rank = publishRankByKey(rowKeys, notes.map((n) => n.channel), input.publishOrder);
  const unwritten: string[] = [];

  const scored = rows.map((row, i) => {
    const key = rowKeys[i];
    const note = byKey.get(key);
    // ONLY a wholly absent note falls back. A note that came back with a blank
    // field is a different failure, it has never been measured, and FUND-5
    // reports it today; filling it in here would silence that check instead of
    // fixing what it catches.
    if (!note) unwritten.push(key);
    const built = note ? null : unwrittenRowCopy(row);
    const entry: InstitutionEntry = {
      ...row,
      whyEligible: built ? built.whyEligible : clean(note!.whyEligible ?? ""),
      nextStep: built ? built.nextStep : clean(note!.nextStep ?? ""),
      // Prefer the plain restatement; fall back to the verbatim rule so the
      // obstacle is never silently dropped just because the writer omitted it.
      blocker: row.blocker ? clean(note?.blockerPlain || row.blocker) : undefined,
    };
    // Read off what PUBLISHES, not off the reply, so the code-built copy on an
    // unwritten row is measured by the same rule the writer's is.
    return { key, entry, waits: isWatchOnly(entry.nextStep, entry.whyEligible) };
  });

  const ranked = [...scored].sort(
    (a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity));
  // ONE EXPRESSION, AND IT READS ONLY THE RANK. `waits` is carried out of here
  // as a count and reaches no `filter` and no comparator. That is the whole of
  // the property above: the table is the ranking, truncated.
  return {
    published: ranked.slice(0, cap).map((x) => x.entry),
    unwritten,
    watchOnly: ranked.filter((x) => x.waits).map((x) => x.key),
    cutByCap: ranked.slice(cap).map((x) => x.key),
  };
}

/**
 * The order the brief's rows are drawn in, and the head of it the writer sees.
 *
 * It no longer DECIDES that order — it carries it. See the block at the top of
 * this file: the incoming order is the ranker's, and the only thing applied on
 * top of it is the one-row-per-institution-name collapse.
 *
 * `semanticScores` was a parameter and is gone with the fit score, its only
 * reader. Keeping an unread field so that fifteen harnesses need not be edited
 * would leave every one of them asserting, at its call site, that the semantic
 * percentile still reaches the memo's order. It does not.
 */
export function orderMemoCandidates(input: MemoCandidateInput): MemoCandidateOrder {
  const { instrumentTable, req, records, dbPeers, eligibilityScreen, log } = input;
  const comparableCounts = new Map<string, number>();
  for (const row of instrumentTable) {
    if (!row.instrumentId) continue;
    comparableCounts.set(
      row.instrumentId,
      [...records, ...dbPeers].filter((r) => r.matched && r.channels.includes(row.channel)).length,
    );
  }
  const easeById = scoreEase(
    instrumentTable.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
    req.eligibility,
    req.projectAnswers,
    comparableCounts,
    eligibilityScreen,
    // Demote national schemes the founder cannot actually use. A German
    // company was being handed an Estonian equity scheme at rank 2, which the
    // writer then had to apologise for in the row itself.
    new Set(
      founderCountryList(req.country, req.eligibility?.entityCountries)
        .map((c) => toIso2(c))
        .filter(Boolean)
        .map((c) => c.toUpperCase()),
    ),
  );
  // The verdict per fund. It no longer ORDERS anything — the band sort that
  // read it is gone — and it is still computed here because three consumers
  // render it: the row's `verdict` line, its `blocker` sentence in the fund's
  // own words, and `gatesChecked`.
  //
  // Softened by the same `lateFields` `accessiblePool` used. ONE verdict per
  // fund, or the pool keeps a row whose rendered line contradicts the screen
  // that kept it.
  const tableIds = instrumentTable
    .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
  const assessments = softenAll(
    assessAll(tableIds, req.eligibility), input.lateFields,
    () => assessAll(tableIds, answersWithoutLateFields(req.eligibility, input.lateFields!)));
  // A scheme with no award on record for years may be closed, repealed or
  // simply between programme periods — we cannot tell which, and neither can
  // the founder. Three years is deliberately generous: EU programme periods
  // have real gaps and the register lags, so a tighter window would flag live
  // schemes.
  //
  // A MISSING date is explicitly NOT stale, though the first version of this
  // treated it as such. 51 instruments carry no dated award, and they include
  // Bpifrance, EIFO, KfW and Almi — loaded as placeholder-level records rather
  // than per-award rows. That is a gap in our ingestion, not evidence a
  // national development bank has stopped lending, and demoting them would
  // have pushed Silvr's single best route down the table. Absence of evidence
  // is not evidence of absence.
  const STALE_AFTER_YEARS = 3;
  const thisYear = new Date().getFullYear();
  const isStale = (row: InstrumentRow) =>
    row.lastAwardYear !== undefined &&
    thisYear - row.lastAwardYear > STALE_AFTER_YEARS;

  // ── AND HERE IS WHERE THE DETERMINISTIC RANKING WAS (wsGB) ───────────────
  // Two things stood between the lines above and the collapse below, and both
  // are gone:
  //
  //   the NINE-COMPONENT FIT SCORE, computed for every row of every pool on
  //     every memo request, attached to a candidate field nobody read. It was
  //     the `fit` control arm's sort key and its last caller; fit.ts had said
  //     since wsDO that the scoring loop dies when the memo's order comes from
  //     the selector, and it has.
  //
  //   the SORT ITSELF — pin rank, then verdict band, then incoming index. Only
  //     the last of those three survives, and a sort whose sole key is the
  //     incoming index is not a sort. So there is no `.sort()` here at all: the
  //     array is mapped, in order, and the order is the one it arrived in.
  //
  // Keeping a `.sort((a, b) => a.i - b.i)` for the look of it would be worse
  // than none: it would read as a ranking decision to everyone who met it, and
  // there is no decision left to take.
  const candidates = instrumentTable.map((row, i) => ({
    row, i,
    assessment: row.instrumentId ? assessments.get(row.instrumentId) : undefined,
  }));

  // ── The blocked drop is NOT here, and its counter is not here either ────
  // A `.filter()` on `status === "blocked"` stood here, recording VER-BLOCKED
  // and returning a `droppedBlocked` count. `accessiblePool` runs before this
  // on the same assessment and already removed those rows, so the filter could
  // never fire and the count could never move: it had been a hard zero since
  // the pool cut was moved after the drop, while `_dropped.blocked` on every
  // recorded brief reported it as a measurement. A live-looking number that
  // cannot change is worse than none, so the count now comes from the seam that
  // really performs the drop -- the VER-BLOCKED tally on the exclusion log.
  //
  // ── One row per institution NAME. DEMOTED, never deleted ────────────────
  // 322 instruments share only 143 display names, so two leaves of the same
  // body can both reach the writer and the founder sees "Enterprise Ireland"
  // twice in one table — once open, once not assessable — which reads as a
  // broken brief. That is a real display defect and the collapse stays.
  //
  // What does not stay is the deletion. `rules.ts` declares SEL-DUPE-NAME
  // `demote-not-delete` and carries the measurement: pool recall 97% -> 83%
  // when the sibling rule in `materialiseInstrumentTable` was a filter. This
  // one filtered the array `toWriter` is cut from, which is the same array by
  // a different name. A loser now sits at the BACK, where it can only take a
  // seat the visible rows did not fill.
  //
  // ── Two things this deliberately does not do ────────────────────────────
  // NO THIRD IMPLEMENTATION. `resolveNameCollisions` is the one collapse, and
  // `preferBetterEvidencedRow` is the one survivor rule, both shared with
  // `materialiseInstrumentTable`. Two collapses with two keys is the exact
  // defect nameCollision.ts was extracted to prevent.
  //
  // NOT FIRST-WINS. The old rule kept whichever row the sort happened to reach
  // first, which knows nothing about how well each row is ENCODED: it kept an
  // Enterprise Ireland leaf with zero encoded rules over a sibling returning a
  // real `open` verdict. `preferBetterEvidencedRow` is a total order on the
  // rows themselves, so the survivor cannot depend on arrival order.
  //
  // ── The label is THIS surface's label ───────────────────────────────────
  // `displayInstitutionName` is what `buildInstitutions` prints in the memo
  // table, so it is what "the founder sees the same name twice" means HERE.
  // `materialiseInstrumentTable` keys on `rowRenderedLabel` — its own surface's
  // title, cut to `ROW_TITLE_CHARS` and lowercased, because that is what the
  // selector's menu shows. One label per surface, each passed in, is exactly
  // the arrangement nameCollision.ts asks for; what it forbids is one surface
  // grouped by one function and collapsed by another.
  const collision = resolveNameCollisions(
    candidates, (r) => displayInstitutionName(r.row),
    (a, b) => preferBetterEvidencedRow(a.row, b.row));
  for (const { row: r, kept, label } of collision.collisions) {
    log.record("SEL-DUPE-NAME", r.row.instrumentId ?? r.row.channel,
      `renders as "${label}", the same label as ${kept.row.instrumentId ?? kept.row.channel}, ` +
      `which is shown instead; this row is demoted to the back of the candidates, not removed`);
  }
  // A PERMUTATION of `instrumentTable`: `visible` and `demoted` are together
  // exactly the input, which is the property `resolveNameCollisions` returns
  // two arrays to make expressible and `memoCandidates.test.ts` pins.
  const beforeWriterCap = [...collision.visible, ...collision.demoted];
  // `CUT-WRITER-CAP`, and it used to be `SEL-LEAF-CAP`. That id's registry
  // entry reads "instrument ranked below its channel's per-channel leaf limit",
  // which is `selectLeafInstruments` in shortlist.ts and is a different
  // mechanism at a different stage on a different number: one code for two
  // rules made every count of either uninterpretable, and made a founder's
  // record say their fund lost a per-channel contest it was never in. This is
  // the same defect `shortlist.ts` records having fixed once already, where the
  // SEL-LEAF-CAP reason string described branches the code had stopped
  // executing. An exclusion code names ONE mechanism.
  for (const r of beforeWriterCap.slice(WRITER_CANDIDATE_CAP)) {
    log.record("CUT-WRITER-CAP", r.row.instrumentId ?? r.row.channel,
      `below the ${WRITER_CANDIDATE_CAP}-candidate cap shown to the writer, in the `
      + `order the pool arrived in`);
  }
  return {
    ordered: beforeWriterCap,
    toWriter: beforeWriterCap.slice(0, WRITER_CANDIDATE_CAP),
    easeById,
    assessments,
    isStale,
  };
}
