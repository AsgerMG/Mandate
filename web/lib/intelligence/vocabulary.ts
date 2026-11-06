// The single machine-readable definition of what a founder is allowed to
// answer — projected from the labelled option lists in types.ts, which stay
// the human-facing definition.
//
// ── Why this exists ──────────────────────────────────────────────────────
// The same vocabulary was written out by hand in three places: types.ts,
// sanitize.ts, and ETL/terms/encode_gates.py under a "Mirrors types.ts — keep
// in sync" comment. Keeping them in sync is not a discipline problem, it is a
// design problem, and it failed exactly as you would expect:
//
//   * sanitize.ts still validated `sector` against the RETIRED 7-bucket list
//     after the vocabulary was split, so every real request through
//     /api/intelligence had its sector silently discarded. memo_bench never
//     saw it because it calls the pipeline directly, bypassing the route.
//   * `activities` was added to the form and to the encoder but never to the
//     sanitiser, so the axis carrying most GBER exclusions was dropped before
//     it could gate anything.
//
// Neither threw. Both produced a slightly worse brief — the failure mode that
// survives longest. So the values are declared once, derived everywhere, and
// exported to the ETL as generated JSON (scripts/emit_vocabulary.ts) rather
// than copied into Python.
import {
  ACTIVITY_OPTIONS,
  USE_OF_FUNDS_OPTIONS,
  BALANCE_BANDS,
  BORROWER_MODELS,
  COFINANCING_BANDS,
  CONDITIONALITY_VALUES,
  DEVELOPMENT_STAGES,
  EXCLUSION_OPTIONS,
  FTE_BANDS,
  NEED_BY_BANDS,
  ORGANISATION_TYPE_OPTIONS,
  SECTOR_OPTIONS,
  TICKET_BANDS,
  TURNOVER_BANDS,
} from "./types";

export interface FieldVocabulary {
  values: string[];
  /** True when ORDER carries meaning. band_max/band_min specs are evaluated by
   *  position, so reordering an ordered field silently changes what every rule
   *  using it decides — which is why order is part of the contract, not a
   *  presentation detail. */
  ordered: boolean;
  /** True when the founder's answer is a list. `equals` is meaningless against
   *  these: it compares a string to an array and reads "unknown" for everyone. */
  multi: boolean;
}

const YES_NO_UNSURE = ["yes", "no", "unsure"];

/** Every intake field with a fixed answer set, keyed by the name used in
 *  EligibilityAnswers and in encoded value_specs. Fields absent from here are
 *  free-form or numeric and cannot be enum-encoded. */
export const VOCABULARY: Record<string, FieldVocabulary> = {
  sector: { values: SECTOR_OPTIONS.map((o) => o.value), ordered: false, multi: false },
  // Deliberately UNORDERED. Nothing about a commune sits between a company and
  // a university, and an ordered field is evaluated by POSITION — a band_max
  // spec against an order invented here would decide real gates on an
  // arbitrary sequence.
  organisationType: { values: ORGANISATION_TYPE_OPTIONS.map((o) => o.value), ordered: false, multi: false },
  activities: { values: ACTIVITY_OPTIONS.map((o) => o.value), ordered: false, multi: true },
  useOfFunds: { values: USE_OF_FUNDS_OPTIONS.map((o) => o.value), ordered: false, multi: true },
  exclusionFlags: { values: EXCLUSION_OPTIONS.map((o) => o.value), ordered: false, multi: true },
  borrowerModel: { values: BORROWER_MODELS.map((o) => o.value), ordered: false, multi: false },
  conditionality: { values: [...CONDITIONALITY_VALUES], ordered: false, multi: true },

  ticketBand: { values: TICKET_BANDS.map((b) => b.value), ordered: true, multi: false },
  fteBand: { values: [...FTE_BANDS], ordered: true, multi: false },
  turnoverBand: { values: [...TURNOVER_BANDS], ordered: true, multi: false },
  balanceBand: { values: [...BALANCE_BANDS], ordered: true, multi: false },
  cofinancingBand: { values: [...COFINANCING_BANDS], ordered: true, multi: false },
  developmentStage: { values: [...DEVELOPMENT_STAGES], ordered: true, multi: false },
  needBy: { values: [...NEED_BY_BANDS], ordered: true, multi: false },

  ownerOver25: { values: YES_NO_UNSURE, ordered: false, multi: false },
  institutionalOwner: { values: YES_NO_UNSURE, ordered: false, multi: false },
  nonEuControl: { values: YES_NO_UNSURE, ordered: false, multi: false },
  lossesOverHalfCapital: { values: YES_NO_UNSURE, ordered: false, multi: false },
  consortium: { values: YES_NO_UNSURE, ordered: false, multi: false },
  bankRelationship: { values: YES_NO_UNSURE, ordered: false, multi: false },
  institutionalBacking: { values: YES_NO_UNSURE, ordered: false, multi: false },
  wouldOpenEntity: { values: ["yes", "no", "depends"], ordered: false, multi: false },

  // Free-form in the form, but list-valued, so `equals` must never be used.
  entityCountries: { values: [], ordered: false, multi: true },
  activityCountries: { values: [], ordered: false, multi: true },
};

/** Ordered-field name -> its band order, the shape the encoder needs. */
export const BAND_ORDERS: Record<string, string[]> = Object.fromEntries(
  Object.entries(VOCABULARY).filter(([, v]) => v.ordered).map(([k, v]) => [k, v.values]),
);

/** Fields whose answer is a list. */
export const MULTI_VALUE_FIELDS: string[] =
  Object.entries(VOCABULARY).filter(([, v]) => v.multi).map(([k]) => k);
