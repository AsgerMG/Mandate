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
import { scoreFit, sectorFitScorer } from "./fit";
import { assessAll, type InstrumentAssessment } from "./verdict";
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
  EligibilityCheck,
  IntelligenceRequest,
  InstrumentRow,
} from "./types";

/** How many candidates the WRITER is shown, ahead of the cut to
 *  `BRIEF_LIMITS.institutionsMax`.
 *
 *  Lowered from 9. The writer must return a note per candidate, and a
 *  candidate it never mentions is dropped silently -- it cannot be published
 *  without model-written copy, and filling that in from a template is what put
 *  three "Verify eligibility directly with the fund" rows in one brief. At 9 it
 *  started omitting: one company came back covering 5 of 9, losing two Horizon
 *  clusters and two Innovation Fund routes with no judgement attached.
 *
 *  ── The headroom this leaves, which the published cap consumes ────────────
 *  This is an UPSTREAM cap and the published row count is the DOWNSTREAM one,
 *  so their difference is the number of candidates the writer may reject
 *  before the table gets short. At 7 candidates and 5 published that was two;
 *  at 7 and 6 it is one. It was deliberately NOT raised alongside the row cap:
 *  a thin table is a missing row, a candidate the writer never covered is a
 *  row published with template copy in place of judgement, and the second is
 *  worse. Raising it trades a measured omission risk for an unmeasured one. */
export const WRITER_CANDIDATE_CAP = 7;

/** One candidate, with every score the ordering consulted still attached --
 *  the caller needs the assessment and the ease line to build the row. */
export interface MemoCandidate {
  row: InstrumentRow;
  /** Its position in the incoming pool, which is the last tie-break. */
  i: number;
  ease?: EaseScore;
  fit?: ReturnType<typeof scoreFit>;
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

export interface MemoCandidateInput {
  /** The pool, already ranked and cut to VERDICT_POOL. */
  instrumentTable: InstrumentRow[];
  req: IntelligenceRequest;
  records: CompetitorRecord[];
  dbPeers: CompetitorRecord[];
  eligibilityScreen: EligibilityCheck[];
  semanticScores: Map<string, number>;
  log: ExclusionLog;
}

/**
 * The order the brief's rows are drawn in, and the head of it the writer sees.
 */
export function orderMemoCandidates(input: MemoCandidateInput): MemoCandidateOrder {
  const { instrumentTable, req, records, dbPeers, eligibilityScreen, semanticScores, log } = input;
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
  // made is the `capital` component of scoreFit (fit.ts, weight 0.08 —
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
  const fitById = new Map<string, ReturnType<typeof scoreFit>>();
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
    fitById.set(inst.id, scoreFit({
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
      fit: row.instrumentId ? fitById.get(row.instrumentId) : undefined,
      assessment: row.instrumentId ? assessments.get(row.instrumentId) : undefined,
    }))
    .sort((a, b) => {
      // Rows with no score at all (no DB-native instrument behind them) keep
      // their incoming order at the back rather than tying at zero.
      const fa = a.fit?.score ?? -1, fb = b.fit?.score ?? -1;
      if (fa !== fb) return fb - fa;
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
