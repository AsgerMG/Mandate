// Where every part of a brief came from.
//
// ── The asymmetry this closes ──────────────────────────────────────────────
// Reading a finished brief, three kinds of text look identical: a figure
// computed in code from the funding record, a sentence written by the model,
// and fixed copy we always print. They carry very different weight, and when
// something is wrong they have very different owners.
//
// Diagnosing the leaks that started this work meant grepping four modules to
// discover that a coverage metric, a verdict phrase and a table of statute
// were all code-authored text nobody had specified. With this, each of them
// announces its origin.
//
// ── Derived, not maintained ────────────────────────────────────────────────
// The model-written half is read from the contracts, which already declare
// which schema fields they govern and which evidence blocks they may use. A
// second hand-written list would drift from the first, which is the failure
// this whole architecture exists to stop.
import { briefContracts } from "./contracts";

export type Origin =
  /** Computed in code from the corpus. The model cannot change it. */
  | "code"
  /** Written by the writer, inside a contract's rules. */
  | "model"
  /** Fixed copy, identical on every brief. */
  | "fixed";

export interface FieldProvenance {
  origin: Origin;
  /** Contract rule-id prefix that governs it, for model-written fields. */
  contract?: string;
  /** Evidence blocks the field was allowed to draw on. */
  evidence?: string[];
}

export type ProvenanceMap = Record<string, FieldProvenance>;

/** Parts of the brief built in code, with what builds them. Small and
 *  explicit: these are the fields a founder might mistake for analysis. */
const CODE_AUTHORED: Record<string, string> = {
  self: "matchCompany against the funding record",
  eligibilityScreen: "evaluateEligibility against encoded gates",
  "institutions[].institution": "displayInstitutionName",
  "institutions[].supportType": "instrument capital type",
  "institutions[].ticket": "curated fund snapshot",
  "institutions[].comparableFirms": "corpus peers on this channel",
  "institutions[].verdict": "verdict.ts, encoded gates only",
  "institutions[].stale": "last recorded award year",
};

const FIXED_COPY: Record<string, string> = {
  stateOfPlayOffer: "STATE_OF_PLAY_OFFER",
};

/**
 * The origin of every part of the brief.
 *
 * `exclusions` is carried alongside because the most important provenance
 * question a brief raises is about something that is NOT on the page: why a
 * fund is missing. The counts come from the request's ExclusionLog.
 */
export function buildProvenance(exclusions?: Record<string, number>): {
  fields: ProvenanceMap;
  exclusions: Record<string, number>;
} {
  const fields: ProvenanceMap = {};

  for (const c of briefContracts()) {
    for (const f of c.schemaFields) {
      fields[f] = { origin: "model", contract: c.id, evidence: c.evidence };
    }
  }
  // institutionNotes is the writer's contribution to a code-built table; name
  // the three sub-fields it actually writes so the table's own columns are not
  // mistaken for model output.
  if (fields.institutionNotes) {
    const note = fields.institutionNotes;
    delete fields.institutionNotes;
    for (const sub of ["whyEligible", "nextStep", "blockerPlain"]) {
      fields[`institutions[].${sub}`] = note;
    }
  }
  for (const [k, note] of Object.entries(CODE_AUTHORED)) {
    fields[k] = { origin: "code", evidence: [note] };
  }
  for (const [k, note] of Object.entries(FIXED_COPY)) {
    fields[k] = { origin: "fixed", evidence: [note] };
  }

  return { fields, exclusions: exclusions ?? {} };
}
