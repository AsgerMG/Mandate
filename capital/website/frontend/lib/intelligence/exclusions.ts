// Why a fund is not in front of this founder.
//
// Phase 0 of the brief output revamp (project-mgmt/plans/brief_output_architecture.md).
//
// ── The gap this closes ────────────────────────────────────────────────────
// A fund can leave the brief at six different points — a ticket band it does
// not serve, a consortium requirement, a thematic floor, a conclusively failed
// gate, the writer's own judgement, or simply the cut to five. Today every one
// of those is a bare `continue`, a `.filter()` or a `.slice()`, and none of
// them leaves a record.
//
// That asymmetry is the reason a missing fund is so expensive to diagnose:
// what IS published carries its whole justification (verdict, gates, blocker,
// citation), while what is missing carries nothing at all. Reconstructing it
// means re-reading the pipeline, which is exactly what happened when a live
// brief dropped a fund whose own eligibility screen showed its gates as met.
//
// So: every removal reports here. Nothing changes about WHICH funds are
// removed — this records, it does not decide.
//
// ── Why this is the first thing built ──────────────────────────────────────
// The plan replaces most of the rules below with a continuous fit score, and
// that swap can only be judged against a before-state. Without this log there
// is no way to say whether the new ranking kept what the old rules dropped.
import type { ExclusionRuleId } from "./rules";
import { EXCLUSION_RULES } from "./rules";

export interface ExclusionEvent {
  ruleId: ExclusionRuleId;
  /** Channel code or instrument id — whatever the rule actually acted on. */
  subject: string;
  /** Founder-independent explanation. Never contains a company name: these
   *  are properties of the rule and the instrument, not of the applicant. */
  detail?: string;
}

/**
 * Collects removals for one request.
 *
 * Explicitly passed rather than module-global: route handlers run
 * concurrently in one process, and a shared collector would attribute one
 * founder's exclusions to another's brief. Optional at every call site so
 * nothing is forced to thread it through when it has nothing to say.
 */
export class ExclusionLog {
  private readonly events: ExclusionEvent[] = [];

  record(ruleId: ExclusionRuleId, subject: string, detail?: string): void {
    this.events.push({ ruleId, subject, detail });
  }

  all(): readonly ExclusionEvent[] {
    return this.events;
  }

  /** Counts per rule, for the run record and the scoreboard. */
  countsByRule(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.events) out[e.ruleId] = (out[e.ruleId] ?? 0) + 1;
    return out;
  }

  /**
   * What was removed before the writer ever saw it.
   *
   * Kept separate because the two halves are not equally serious: a
   * post-writer removal leaves the fund in the record with prose attached,
   * while a pre-writer one erases it from the universe. When a founder asks
   * why a fund is missing, this is the half that cannot otherwise be answered.
   */
  preWriter(): ExclusionEvent[] {
    return this.events.filter((e) => EXCLUSION_RULES[e.ruleId].stage !== "writer");
  }

  /** One line per rule that fired, ordered by volume. For server logs. */
  summary(): string {
    const counts = this.countsByRule();
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id}=${n}`)
      .join(" ");
  }
}
