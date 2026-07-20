// Live, per-request reach scoring — the TS twin of
// ETL/terms/aggregate_intake_usage.py's formula, but scoped to a single
// founder's actual candidate-instrument shortlist instead of the whole
// corpus. This is what grounds the adaptive round (Phase 3C) in gates that
// are genuinely still open for THIS founder, not a blind sweep of 320
// instruments' worth of requirements.
import { loadDbInstruments } from "./corpus";
import { FIELD_ENUM_HINTS, type EligibilityAnswers } from "./types";

// Fields already resolved on the deterministic first page (Phase 3B) — never
// re-asked adaptively, regardless of how much gate reach they still carry.
const FIRST_PAGE_FIELDS = new Set([
  "entityCountries", "fteBand", "borrowerModel", "developmentStage",
  "ticketBand", "lossesOverHalfCapital",
]);

export interface OpenFieldEvidence {
  field: string;
  /** Share of the shortlist's event_count still gated on this field, 0-100. */
  reachPct: number;
  nInstruments: number;
  /** Up to 3 real (instrument name, requirement text) pairs for prompt grounding. */
  examples: { instrument: string; requirement: string }[];
}

function isAnswered(answers: EligibilityAnswers | undefined, field: string): boolean {
  if (!answers) return false;
  const v = (answers as Record<string, unknown>)[field];
  if (v === undefined || v === null || v === "" || v === "unsure") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Which intake fields are still worth asking for this founder's specific
 * shortlist: gate-eligible (in FIELD_ENUM_HINTS, so a real fixed answer set
 * exists), not already on the first page, not already answered, and backed
 * by at least one real gate on an instrument still in the running. Ranked by
 * live reach, highest first.
 */
export function openFieldsForShortlist(
  instrumentIds: string[],
  answers: EligibilityAnswers | undefined,
): OpenFieldEvidence[] {
  const ids = new Set(instrumentIds);
  const shortlist = loadDbInstruments().filter((i) => ids.has(i.id));
  if (!shortlist.length) return [];
  const totalEvents = shortlist.reduce((s, i) => s + i.eventCount, 0) || shortlist.length;

  const byField = new Map<string, { events: number; instruments: Set<string>; examples: { instrument: string; requirement: string }[] }>();
  for (const inst of shortlist) {
    for (const gate of inst.gates) {
      const field = gate.intakeField;
      if (!field || field === "none") continue;
      if (FIRST_PAGE_FIELDS.has(field)) continue;
      if (!FIELD_ENUM_HINTS[field]) continue; // no real fixed answer set for it — out of scope here
      if (isAnswered(answers, field)) continue;
      const entry = byField.get(field) ?? { events: 0, instruments: new Set<string>(), examples: [] };
      if (!entry.instruments.has(inst.id)) {
        entry.events += inst.eventCount || 1;
        entry.instruments.add(inst.id);
        if (entry.examples.length < 3 && gate.requirement) {
          entry.examples.push({ instrument: inst.name, requirement: gate.requirement });
        }
      }
      byField.set(field, entry);
    }
  }

  return [...byField.entries()]
    .map(([field, v]) => ({
      field,
      reachPct: Math.round((1000 * v.events) / totalEvents) / 10,
      nInstruments: v.instruments.size,
      examples: v.examples,
    }))
    .sort((a, b) => b.reachPct - a.reachPct);
}

/** Distinct source_family_bucket count among the shortlist — a proxy for
 *  "how many genuinely different families are still in play." Used by the
 *  stopping rule alongside reachPct. */
export function distinctFamilyCount(instrumentIds: string[]): number {
  const ids = new Set(instrumentIds);
  const buckets = new Set(
    loadDbInstruments()
      .filter((i) => ids.has(i.id) && i.sourceFamilyBucket)
      .map((i) => i.sourceFamilyBucket as string),
  );
  return buckets.size;
}
