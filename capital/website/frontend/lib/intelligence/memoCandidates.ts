// The memo's candidate order: everything between the pool and the writer, with
// no model call in it.
//
// ── Why this is a module and not a hundred lines inside synthesize() ───────
// The order the founder finally reads is decided here -- ease, fit, the
// blocked drop, the display-name dedupe -- and then `synthesize()` sends the
// head of it to the writer and cuts the result to `BRIEF_LIMITS.institutionsMax`.
// While it lived inside `synthesize()` it could not be measured without a
// model call, so every recall figure this repo has published was measured on
// `computeVerdict`'s table instead: a DIFFERENT ordering, over a DIFFERENT
// pool, capped at `DISPLAY_CAP`. Conclusions about "the five rows" were being
// drawn from a path the five rows do not come from.
//
// The alternative -- a diagnostic that reimplements the ordering -- is the
// exact defect this codebase has paid for three times in two days: two
// functions building the same thing from different keys. So there is one
// implementation, production calls it, and the harnesses call the same one.
//
// Model-free and deterministic given its inputs. The IO is upstream (the pool
// and the semantic scores); nothing here reaches the network.
import { scoreEase, type EaseScore } from "./ease";
import { scoreFitControl, sectorFitScorer } from "./fit";
import { assessAll, VERDICT_RANK, type InstrumentAssessment } from "./verdict";
import { answersWithoutLateFields, softenAll } from "./answerProvenance";
import { resolveNameCollisions } from "./nameCollision";
import {
  CAPITAL_SOUGHT_TO_DB,
  displayInstitutionName,
  founderCountryList,
  instById,
  preferBetterEvidencedRow,
  tableInputFromAnswers,
} from "./shortlist";
import { toIso2 } from "./corpus";
import type { ExclusionLog } from "./exclusions";
import type {
  CompetitorRecord,
  EligibilityAnswers,
  EligibilityCheck,
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

/** ── WHICH ORDER SHIPS, and the measurement that decided it ────────────────
 *
 *  ── ON THE NAME (wsEH, 2026-08-11) ───────────────────────────────────────
 *  This was called `ORDER_ARM`, which read as a live experiment lever with
 *  three open options. It is not one. It is a CONSTANT: the order the memo
 *  ships, today and until the selector's order is routed past this sort. The
 *  other two values are CONTROLS — the arms that lost the measurement below —
 *  and they exist so the measurement can be re-run for free, not so anybody
 *  can pick one. Nothing in production passes `orderControl`; only
 *  `scripts/_wsct_order.ts` does. See lib/intelligence/ARCHITECTURE.md.
 *
 *  `fit` shipped until 2026-08-09 and had never been compared with anything,
 *  because "do not re-sort" was not a thing the code could express. wsCR
 *  measured it moving the won leaf OUT of the published six 49 times for 13
 *  in. A re-sort that loses four for every one it gains is not a re-sort.
 *
 *  All three arms, ONE replay, one pool, tune n=250 seed 20260806,
 *  `ranker: all 245 request(s) on EMBEDDING` (`scripts/_wsct_order.ts`):
 *
 *    MEMO@6        fit 24.0%      pool 28.8%      verdict 27.6%
 *    off-country rows in the published six    0          0          0
 *    published rows that are `open`        100%      95.4%       100%
 *
 *  `pool` scores highest and is NOT what ships. It buys its last 1.2 points by
 *  publishing rows carrying an obstacle or no assessable verdict at all — 4.6%
 *  of published rows — and in this product a wrongly-shown row costs more than
 *  a missing one. `verdict` keeps the whole of that quality (100% `open`,
 *  byte-identical to `fit` on that measure) and takes 3.6 of the 4.8 points.
 *
 *  What it drops is the seven components of `scoreFitControl` that fit.ts itself
 *  records as never reaching the founder's table and that nothing has ever
 *  measured against the shortlist's own ranking. What it keeps is the single
 *  judgement this product has written a principle about: qualification first.
 *
 *  Regime concentration, as the standing rule requires: the 21 pairs the
 *  re-sort was demoting are spread over 14 regimes and 11 countries, largest
 *  regime 4. There is no programme carrying this. */
export const SHIPPED_MEMO_ORDER: MemoOrderControl = "verdict";

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
  /** Its position in the incoming pool, which is the last tie-break. */
  i: number;
  ease?: EaseScore;
  /** The nine-component fit breakdown. Read by the `fit` CONTROL arm and by
   *  nothing else — not by the shipped sort, not by the row builder, not by
   *  the writer. Named `fitControl` so that is visible at the field rather
   *  than only in fit.ts's header. */
  fitControl?: ReturnType<typeof scoreFitControl>;
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
   *  softened one deciding the pool and a raw one deciding the band -- would
   *  demote exactly the rows we just decided to keep. */
  assessments: Map<string, InstrumentAssessment>;
  /** A scheme with no award on record for years may be closed, repealed or
   *  simply between programme periods. Travels with the order because the row
   *  builder renders it. */
  isStale: (row: InstrumentRow) => boolean;
}

/** The shipped memo order and its two CONTROLS.
 *
 *  One of these ships (`SHIPPED_MEMO_ORDER`). The other two are the arms it was
 *  measured against, kept so that measurement stays reproducible for free. A
 *  control is not an option: choosing one here republishes a number somebody
 *  already retired.
 *
 *  `verdict` **SHIPS.** Qualification first, then the pool's order inside each
 *            band. The one judgement the fit score made that this product has
 *            ever written a principle about, without the seven components it
 *            never measured.
 *  `pool`    CONTROL. The order the pool arrived in — the subset builder's own
 *            ranking, untouched. The ONE ordering in this product that has ever
 *            been measured end to end, which is why it is the reference arm.
 *  `fit`     CONTROL, and the arm that lost. Re-sort the whole pool on
 *            `scoreFitControl`, nine weighted components. It is the only reason
 *            `scoreFitControl` is still called at all.
 *
 *  See SHIPPED_MEMO_ORDER above for the measurement that decided between them. */
export type MemoOrderControl = "pool" | "fit" | "verdict";

export interface MemoCandidateInput {
  /** The pool, already ranked and cut to VERDICT_POOL. */
  instrumentTable: InstrumentRow[];
  req: IntelligenceRequest;
  records: CompetitorRecord[];
  dbPeers: CompetitorRecord[];
  eligibilityScreen: EligibilityCheck[];
  semanticScores: Map<string, number>;
  log: ExclusionLog;
  /** Defaults to `SHIPPED_MEMO_ORDER`. Set this ONLY to run a control arm
   *  against the shipped one over a single pool — `scripts/_wsct_order.ts` is
   *  the only caller in the tree that does. Nothing in production passes it,
   *  and a production caller that did would be publishing a retired arm. */
  orderControl?: MemoOrderControl;
  /**
   * ── A ROW THE MODEL NAMED KEEPS ITS SEAT ────────────────────────────────
   *
   * Instrument ids the selector chose, IN PICK ORDER (a `Set` keeps insertion
   * order, and that order is the model's ranking). They sort ahead of the
   * verdict band.
   *
   * Why ahead of the band, and not politely behind it: the band ranks
   * `open` > `one_blocker` > `unknown`, and `unknown` means we could evaluate
   * no encoded filter at all — "ignorance, not a fault" in agentSelect.ts's own
   * words. So a row the model READ THE FUND'S TEXT AND CHOSE could be pushed
   * out of the writer's eight by rows nobody chose, on the strength of OUR
   * ENCODING COVERAGE. That is the same defect as the deleted `WRT-NOT-WORTH`
   * from the other end: it let ordering decide publication.
   *
   * Reachable only when the arm is on. `agentSelectLastDecision()` is null
   * otherwise, so with the arm off this is `undefined` and the sort is the one
   * that has always run.
   */
  pinned?: ReadonlySet<string>;
  /**
   * Fields the founder first answered on the follow-up screen, derived
   * server-side (answerProvenance.ts). Softens the assessments so the band
   * sort, the row's rendered verdict and `accessiblePool` all read the SAME
   * verdict for a fund. Never a client-supplied list.
   */
  lateFields?: ReadonlySet<string>;
}

/** ── WHICH ORDER THE BRIEF PUBLISHES IN ────────────────────────────────────
 *
 *  `candidates` **SHIPS.** The order the score already decided, i.e. the
 *            position of each row in `toWriter`. The writer's notes decide
 *            WHETHER a row publishes, never WHERE.
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
 * with no call. A key the writer did not mention ranks last under either arm;
 * whether it publishes at all is `worth`, decided separately, which is the
 * separation this whole constant exists to keep.
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

/**
 * The order the brief's rows are drawn in, and the head of it the writer sees.
 */
export function orderMemoCandidates(input: MemoCandidateInput): MemoCandidateOrder {
  const { instrumentTable, req, records, dbPeers, eligibilityScreen, semanticScores, log } = input;
  const arm = input.orderControl ?? SHIPPED_MEMO_ORDER;
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
      founderCountryList(req.country, req.targetMarkets, req.eligibility?.entityCountries)
        .map((c) => toIso2(c))
        .filter(Boolean)
        .map((c) => c.toUpperCase()),
    ),
  );
  // Qualification comes before ease. A door that is open, or one thing away
  // from open, outranks a door that merely scores well — and a door that is
  // conclusively shut is dropped rather than ranked, because a roster of
  // rejections is not advice.
  // Softened by the same `lateFields` `accessiblePool` used. ONE verdict per
  // fund, or the pool keeps a row the band sort then buries.
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

  // A `capitalMismatch` predicate stood here, computed for every row and read
  // by nothing since "Phase 4: the score selects, the writer writes"
  // (8a078c98). Confirmed superseded rather than dropped: the judgement it
  // made is the `capital` component of scoreFitControl (fit.ts, weight 0.08 —
  // 1 when the founder's capital kinds include the row's, 0.3 when they do
  // not), which is the same rule as a continuous term instead of a boolean.
  // Deleted; the comment below already claimed it had moved.
  // ── Ranked by fit ────────────────────────────────────────────────────────
  // One continuous score, every component recorded (fit.ts). This replaces a
  // sort over verdict rank, staleness, capital mismatch and an ease score,
  // each of which was a separate rule expressing part of the same judgement.
  //
  // The two hard exclusions still live in the score itself and are the only
  // things that remove a fund outright: a conclusively failed encoded gate,
  // and a national scheme in a country the founder cannot draw on. Everything
  // else moves a row down the list, which is the whole point: a fund now fails
  // to make the cut instead of being vetoed.
  const capitalWanted = new Set(
    (req.capitalSought ?? []).flatMap((c) => CAPITAL_SOUGHT_TO_DB[c] ?? []));
  const founderIso = new Set(
    founderCountryList(req.country, req.targetMarkets, req.eligibility?.entityCountries)
      .map((c) => toIso2(c).toUpperCase()).filter(Boolean));
  const maxComparable = Math.max(0, ...comparableCounts.values());
  const fitById = new Map<string, ReturnType<typeof scoreFitControl>>();
  // What sector fit is worth for a fund whose funding history we do not hold,
  // solved over THIS pool. A constant here would score a blank record above four
  // fifths of the funds we do hold history for -- see `sectorFitScorer`.
  const sectorNeutralFor = sectorFitScorer(
    instrumentTable.map((r) => (r.instrumentId ? instById().get(r.instrumentId) : undefined))
      .filter((i): i is NonNullable<typeof i> => Boolean(i)),
    req.eligibility?.sector);
  for (const row of instrumentTable) {
    const inst = row.instrumentId ? instById().get(row.instrumentId) : undefined;
    if (!inst) continue;
    fitById.set(inst.id, scoreFitControl({
      instrument: inst,
      assessment: assessments.get(inst.id),
      theme: semanticScores.get(inst.id),
      sectorNeutral: sectorNeutralFor(null),
      ticketBand: req.eligibility?.ticketBand,
      capitalWanted,
      comparableCount: comparableCounts.get(inst.id) ?? 0,
      maxComparable,
      founderCountries: founderIso,
      requiresConsortium: inst.gates.some(
        (g: { requirement: string }) => /consorti|at least three|3\+ partners|multi-partner/i.test(g.requirement)),
      // The SAME derivation the row sort uses. Written out by hand here and
      // by hand again in the table builder, the two copies disagreed about
      // what silence means: this one read an unanswered founder as `undefined`
      // (correct, and `structureFit` scores it 0.6, neutral) while the table
      // builder's `!== "no"` read the same silence as a confident `true`. One
      // answer, two mappings, and the one on the path to the five rows was the
      // wrong one.
      consortiumOk: tableInputFromAnswers(req.eligibility).consortiumOk,
      founderSector: req.eligibility?.sector,
      year: new Date().getFullYear(),
    }));
  }
  // Pick order, resolved once. A `Set` iterates in insertion order and the
  // caller inserts in the model's own order, so this IS the model's ranking;
  // an unpinned row sorts behind every pinned one and is then decided by the
  // band exactly as before.
  const pinOrder = new Map<string, number>();
  [...(input.pinned ?? [])].forEach((id, i) => { if (!pinOrder.has(id)) pinOrder.set(id, i); });
  const pinRank = (id: string | undefined) =>
    (id === undefined ? undefined : pinOrder.get(id)) ?? Number.MAX_SAFE_INTEGER;

  const rankedByEase = instrumentTable
    .map((row, i) => ({
      row, i,
      ease: row.instrumentId ? easeById.get(row.instrumentId) : undefined,
      fitControl: row.instrumentId ? fitById.get(row.instrumentId) : undefined,
      assessment: row.instrumentId ? assessments.get(row.instrumentId) : undefined,
    }))
    .sort((a, b) => {
      // A row the model NAMED, ahead of the band. See `pinned`.
      const pa = pinRank(a.row.instrumentId), pb = pinRank(b.row.instrumentId);
      if (pa !== pb) return pa - pb;
      // The pool's own order is the tie-break in every arm and the whole of
      // one of them, so it is the last line rather than three copies.
      if (arm === "verdict") {
        const va = VERDICT_RANK[a.assessment?.status ?? "unknown"];
        const vb = VERDICT_RANK[b.assessment?.status ?? "unknown"];
        if (va !== vb) return va - vb;
      } else if (arm === "fit") {
        // Rows with no score at all (no DB-native instrument behind them) keep
        // their incoming order at the back rather than tying at zero.
        const fa = a.fitControl?.score ?? -1, fb = b.fitControl?.score ?? -1;
        if (fa !== fb) return fb - fa;
      }
      return a.i - b.i;
    });

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
  // body can both survive ranking and the founder sees "Enterprise Ireland"
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
  // `materialiseInstrumentTable` keys on `rowDisplayLabel` because that is what
  // ITS surface prints. One label per surface, each passed in, is exactly the
  // arrangement nameCollision.ts asks for; what it forbids is one surface
  // grouped by one function and collapsed by another.
  const collision = resolveNameCollisions(
    rankedByEase, (r) => displayInstitutionName(r.row),
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
  for (const r of beforeWriterCap.slice(WRITER_CANDIDATE_CAP)) {
    log.record("SEL-LEAF-CAP", r.row.instrumentId ?? r.row.channel,
      `ranked below the ${WRITER_CANDIDATE_CAP}-candidate cap shown to the writer`);
  }
  return {
    ordered: beforeWriterCap,
    toWriter: beforeWriterCap.slice(0, WRITER_CANDIDATE_CAP),
    easeById,
    assessments,
    isStale,
  };
}
