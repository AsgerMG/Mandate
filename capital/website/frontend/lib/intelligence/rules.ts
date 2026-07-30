// The register of every rule that can remove or demote a fund.
//
// Phase 0 of the brief output revamp. Companion to
// project-mgmt/plans/brief_fund_selection_rules.md, which is the prose audit;
// this is the machine-readable half, so the plan and the code cannot drift
// the way the writer's instructions drifted from the writer's schema.
//
// ── The distinction every entry is classified on ───────────────────────────
// A rule encodes either a FACT about an instrument ("this scheme is national
// to one country", "this capital type is equity") or an OPINION about a
// founder ("companies of this shape should not be shown this fund"). Facts
// scale, because the data carries them and the code only reads. Opinions do
// not: they are one judgement, made once, applied to everyone, and invisible
// in the output except as a fund that is not there.
//
// Every `kind: "opinion"` entry below is scheduled for replacement by a
// continuous fit score. They are listed rather than deleted because a rule
// removed before its replacement can carry the load is a regression, and
// because the before-state has to be measurable to prove the swap worked.
//
// ── House rule for writing entries ─────────────────────────────────────────
// A rule names a property, never an instance. No company, fund, sector or
// country appears in any `what` string below. The run that revealed a rule
// belongs in `evidence`, beside the rule and never inside it.

/** Where in the funnel a rule fires. Order matters: anything before "writer"
 *  removes a fund from the universe, and nothing downstream can recover it or
 *  even report its absence. */
export type ExclusionStage =
  /** Choosing which funding channels are in play at all. */
  | "channel"
  /** Choosing which instruments within a channel. */
  | "leaf"
  /** Conclusive, cited failure of an encoded eligibility gate. */
  | "verdict"
  /** The writer's own judgement. */
  | "writer"
  /** The final cut to the published count. */
  | "cut";

export interface ExclusionRule {
  stage: ExclusionStage;
  /** A fact about the instrument, or an opinion about the founder. */
  kind: "fact" | "opinion";
  /** Can anything downstream bring this fund back, or is it gone? */
  recoverable: boolean;
  /** The property the rule acts on. Never an instance. */
  what: string;
  /** What replaces it, for rules scheduled to go. */
  disposition: "keep" | "fit-score" | "remove" | "demote-not-delete";
  /** The observed failure that revealed this rule was worth recording.
   *  Evidence, never specification: the rule must read correctly without it. */
  evidence?: string;
}

export const EXCLUSION_RULES = {
  // ── channel stage ────────────────────────────────────────────────────────
  "SEL-BAND": {
    stage: "channel", kind: "opinion", recoverable: false,
    what: "Channel removed because the founder's stated ticket size falls outside a hardcoded band range for that channel.",
    disposition: "fit-score",
    evidence: "The range is a hand-set constant, not an encoded ticket gate; its own comment describes it as a stopgap pending real gates.",
  },
  "SEL-FIT-CONSORTIUM": {
    stage: "channel", kind: "opinion", recoverable: false,
    what: "Channel removed because it is declared consortium-requiring at channel level and the founder has not confirmed consortium capacity.",
    disposition: "fit-score",
    evidence: "Declared once per channel in a curated brief, so instruments with materially different partner requirements inherit one verdict.",
  },
  "SEL-LARGE-SCALE": {
    stage: "channel", kind: "opinion", recoverable: false,
    what: "Large-ticket channel withheld because no instrument in it cleared a thematic-plausibility floor.",
    disposition: "fit-score",
  },
  "SEL-CHANNEL-CAP": {
    stage: "channel", kind: "opinion", recoverable: false,
    what: "Default channel not added because the pool had already reached its channel cap.",
    disposition: "fit-score",
  },

  // ── leaf stage ───────────────────────────────────────────────────────────
  "SEL-COUNTRY": {
    stage: "leaf", kind: "fact", recoverable: false,
    what: "Instrument removed because it is national to a country the founder cannot draw on.",
    disposition: "keep",
  },
  "SEL-NATIONAL-EMPTY": {
    stage: "leaf", kind: "fact", recoverable: false,
    what: "Channel yielded nothing because it is national by construction and the founder's countries hold no instrument in it.",
    disposition: "keep",
  },
  "SEL-CAPITAL": {
    stage: "leaf", kind: "opinion", recoverable: true,
    what: "Instrument deprioritised because its capital type is not among those the founder asked for; relaxed when the filter would otherwise empty.",
    disposition: "fit-score",
  },
  "SEL-LEAF-CAP": {
    stage: "leaf", kind: "opinion", recoverable: false,
    what: "Instrument ranked below its channel's per-channel leaf limit.",
    disposition: "fit-score",
  },
  "SEL-DUPE-NAME": {
    stage: "leaf", kind: "fact", recoverable: false,
    what: "Instrument removed because another instrument renders under the same institution name; the one with more encoded rules is kept.",
    disposition: "keep",
  },

  // ── verdict stage ────────────────────────────────────────────────────────
  "VER-BLOCKED": {
    stage: "verdict", kind: "fact", recoverable: false,
    what: "Instrument removed because more than one encoded, cited eligibility filter conclusively fails.",
    disposition: "keep",
  },

  // ── writer stage ─────────────────────────────────────────────────────────
  "WRT-NOT-WORTH": {
    stage: "writer", kind: "opinion", recoverable: false,
    what: "Row deleted by the writer's disqualification flag.",
    disposition: "remove",
    evidence: "The flag required ~40 lines of prompt guardrails to stop it deleting well-matched funds, and it let ordering decide publication.",
  },
  "WRT-WATCH-ONLY": {
    stage: "writer", kind: "opinion", recoverable: false,
    what: "Row deleted because the writer flagged it as not actionable, or its own prose matched the watch-only vocabulary.",
    disposition: "demote-not-delete",
    evidence: "Enforced by a regex over natural language containing ordinary words that also occur in valid next steps.",
  },
  "WRT-NO-NOTE": {
    stage: "writer", kind: "opinion", recoverable: false,
    what: "Row dropped because the writer returned no note for it.",
    disposition: "remove",
  },

  // ── cut stage ────────────────────────────────────────────────────────────
  "CUT-CAP": {
    stage: "cut", kind: "fact", recoverable: false,
    what: "Row ranked below the published count.",
    disposition: "keep",
  },
} as const satisfies Record<string, ExclusionRule>;

export type ExclusionRuleId = keyof typeof EXCLUSION_RULES;

/** Rules scheduled to be subsumed by the fit score. The shadow-mode
 *  comparison in Phase 3 is scored on exactly this set: if the score cannot
 *  reproduce what these removed, it is not ready to replace them. */
export const OPINION_RULES = (Object.keys(EXCLUSION_RULES) as ExclusionRuleId[])
  .filter((id) => EXCLUSION_RULES[id].kind === "opinion");

/** Rules that erase a fund before the writer can mention it. These are the
 *  ones a founder can never be told about, which is what makes them the
 *  expensive half. */
export const PRE_WRITER_RULES = (Object.keys(EXCLUSION_RULES) as ExclusionRuleId[])
  .filter((id) => EXCLUSION_RULES[id].stage !== "writer" && EXCLUSION_RULES[id].stage !== "cut");
