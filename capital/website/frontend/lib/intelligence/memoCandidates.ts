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
import {
  CAPITAL_SOUGHT_TO_DB,
  displayInstitutionName,
  founderCountryList,
  instById,
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
 */
export function accessiblePool(
  rows: InstrumentRow[],
  eligibility: EligibilityAnswers | undefined,
  log?: ExclusionLog,
): InstrumentRow[] {
  const assessed = assessAll(
    rows.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
    eligibility);
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
  /** Ranked, blocked rows dropped, one row per display name. NOT yet cut to
   *  the writer cap: the cut is `.slice(0, WRITER_CANDIDATE_CAP)` and callers
   *  that want to measure the cut need to see past it. */
  ordered: MemoCandidate[];
  /** Exactly what the writer is shown. */
  toWriter: MemoCandidate[];
  easeById: Map<string, EaseScore>;
  assessments: Map<string, InstrumentAssessment>;
  droppedBlocked: number;
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
  const assessments = assessAll(
    instrumentTable.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
    req.eligibility,
  );
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
  const rankedByEase = instrumentTable
    .map((row, i) => ({
      row, i,
      ease: row.instrumentId ? easeById.get(row.instrumentId) : undefined,
      fitControl: row.instrumentId ? fitById.get(row.instrumentId) : undefined,
      assessment: row.instrumentId ? assessments.get(row.instrumentId) : undefined,
    }))
    .sort((a, b) => {
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

  // Never show a founder a fund they cannot access — no exceptions, no
  // backfill. A short table of real options beats a padded one, and a fund
  // that is conclusively shut is time the founder does not get back. In
  // practice the table stays full: `unknown` counts as accessible, and most
  // instruments carry no encoded filter yet.
  // One row per institution NAME, not per instrument id. 322 instruments
  // share only 143 display names, so two leaves of the same body can both
  // survive ranking and the founder sees "Enterprise Ireland" twice in one
  // table — once open, once not assessable — which reads as a broken brief.
  // Ranking already put the better row first, so first-wins is the right rule.
  const droppedBlocked = rankedByEase.filter((r) => r.assessment?.status === "blocked").length;
  const seenNames = new Set<string>();
  const beforeWriterCap = rankedByEase
    .filter((r) => {
      if (r.assessment?.status !== "blocked") return true;
      log.record("VER-BLOCKED", r.row.instrumentId ?? r.row.channel,
        `${r.assessment.blockers.length} encoded eligibility filters conclusively fail`);
      return false;
    })
    .filter((r) => {
      const name = displayInstitutionName(r.row);
      if (seenNames.has(name)) {
        log.record("SEL-DUPE-NAME", r.row.instrumentId ?? r.row.channel,
          "a higher-ranked instrument already renders under this institution name");
        return false;
      }
      seenNames.add(name);
      return true;
    });
  for (const r of beforeWriterCap.slice(WRITER_CANDIDATE_CAP)) {
    log.record("SEL-LEAF-CAP", r.row.instrumentId ?? r.row.channel,
      `ranked below the ${WRITER_CANDIDATE_CAP}-candidate cap shown to the writer`);
  }
  return {
    ordered: beforeWriterCap,
    toWriter: beforeWriterCap.slice(0, WRITER_CANDIDATE_CAP),
    easeById,
    assessments,
    droppedBlocked,
    isStale,
  };
}
