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
  // ── THE TEST THIS REGISTER IS HELD TO ────────────────────────────────────
  // A rule nothing can emit is a false claim about the product. The register's
  // whole job is to state what the funnel may remove a fund for, so an entry
  // that no `log.record` call site names is not documentation of a past rule,
  // it is a live assertion that the funnel does something it does not do.
  //
  // "SEL-BAND" was the first to fail it, with disposition "fit-score". The
  // disposition had been carried out -- ticket size is scored continuously by
  // `awardScorer` against each instrument's own award median -- but the entry
  // outlived the rule.
  //
  // "SEL-FIT-CONSORTIUM" (channel / opinion / fit-score) failed it next, and is
  // deleted here for the same reason (wsDO, 2026-08-11). Its disposition too had
  // been carried out: partner requirements are scored per instrument by
  // `structureFit` in fit.ts, never declared per channel. The reason it was
  // wrong is worth keeping and is why the disposition was "fit-score" --
  // "declared once per channel in a curated brief, so instruments with
  // materially different partner requirements inherit one verdict."
  "SEL-LARGE-SCALE": {
    stage: "channel", kind: "opinion", recoverable: false,
    what: "Large-ticket channel withheld because no instrument in it cleared a thematic-plausibility floor.",
    disposition: "fit-score",
  },
  "SEL-CHANNEL-CAP": {
    stage: "channel", kind: "opinion", recoverable: false,
    what: "Channel not added because the pool had already reached its channel cap.",
    disposition: "fit-score",
  },
  "SEL-CHANNEL-NOT-SELECTED": {
    stage: "channel", kind: "opinion", recoverable: false,
    what: "Channel left out of the pool although a slot was free, because a condition attached to the route it would have entered by was not met.",
    disposition: "fit-score",
    evidence:
      "This register opens 'every removal reports here', and a channel that " +
      "reached none of the admission routes reported nothing at all: it was " +
      "simply never iterated. A replay of 500 recall pairs found 8 whose won " +
      "fund was absent for that reason and carried no exclusion event, so the " +
      "question 'why is this programme not here' had no answer in the record.",
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
  "SEL-UNCONFIRMED-OPEN": {
    stage: "leaf", kind: "fact", recoverable: false,
    what: "Instrument withheld because the store that supplied it is a copy of the register rather than the register, and this row's openness rests on that copy holding no application deadline.",
    disposition: "keep",
    evidence: "On the fallback corpus 26% of founders were shown at least one fund whose deadline had passed, against 0% on the live register; the whole difference was rows whose deadline had been loaded after the copy was taken.",
  },
  "SEL-DUPE-NAME": {
    stage: "leaf", kind: "fact", recoverable: true,
    what: "Instrument demoted to the back of the pool because another instrument renders under the same institution name; the one carrying more of its own encoded rules is shown instead.",
    disposition: "demote-not-delete",
    evidence:
      "It was a deletion, and it was deleting from the array `candidateInstrumentIds` " +
      "is derived from -- a display rule emptying the writer's pool. Measured one " +
      "founder per country across 22 markets: it removed 4 rows in total, and the " +
      "rows it removed were DISTINCT notified schemes sharing one published title, " +
      "not siblings of one fund. The founder cannot tell them apart on the page; " +
      "they are still two funds.",
  },

  // ── verdict stage ────────────────────────────────────────────────────────
  // ── The `what` below was FALSE, and it hid the largest loss in the funnel ─
  // It read "more than one encoded, CITED eligibility filter conclusively
  // fails". `assessInstrument` requires neither the plural nor the citation:
  // ONE cited structural filter is conclusive on its own, and two failures of
  // ANY kind — uncited, non-structural, or two encodings of the SAME field —
  // reach `blocked` by arithmetic. wsFZ established the citation half; wsGE
  // measured what the arithmetic half costs and it is not small (see below).
  //
  // The register is read as the statement of what the funnel may remove a fund
  // for, so an entry describing a stricter rule than the code applies is a
  // licence nobody granted.
  "VER-BLOCKED": {
    stage: "verdict", kind: "fact", recoverable: false,
    what: "Instrument removed because its encoded eligibility verdict is `blocked`: "
      + "either one cited structural filter fails, or two or more filters fail "
      + "whatever their citation, severity, or whether they encode the same "
      + "requirement twice.",
    disposition: "keep",
  },

  // ── writer stage ─────────────────────────────────────────────────────────
  // "WRT-NOT-WORTH" stood here -- "row deleted by the writer's disqualification
  // flag", disposition "remove". The disposition was carried out: the flag is
  // gone and the writer may no longer delete a row at all. Deleted by the same
  // test as SEL-FIT-CONSORTIUM above (wsDO, 2026-08-11); nothing has recorded it
  // since the flag went.
  //
  // Its evidence is the argument for "the score selects, the writer writes" and
  // outlives the entry: THE FLAG REQUIRED ~40 LINES OF PROMPT GUARDRAILS TO STOP
  // IT DELETING WELL-MATCHED FUNDS, AND IT LET ORDERING DECIDE PUBLICATION. Read
  // it before handing any future model a delete.
  // Recorded, and no longer a removal or a demotion (wsGK, 2026-08-13). The
  // "demote-not-delete" disposition has been carried out and then some: the
  // row publishes at the rank the ranker gave it, and the match changes
  // nothing but this line and FUND-4 on the scoreboard. Kept in the register
  // because it is still a fact about a founder's brief that every recorded
  // brief counts.
  //
  // What it cost while it demoted: with the writer shown 8 candidates against
  // a published 7, a single match anywhere in the table evicted the fund it
  // matched on — at rank 1 as readily as at rank 8. A regex over one model's
  // prose was silently overruling another model's ranking on the row that
  // matters most.
  //
  // Counted on `brief_records` in Postgres (35 briefs), NOT on the committed
  // ledger export, which stops at 2026-07-30 and would have shown only the
  // first half: 8 matches in 128 candidate rows over the 19 briefs to
  // 2026-07-30, then 0 in 107 rows over the 14 since — the last one dated the
  // day FUND-4 entered the writer's contract.
  "WRT-WATCH-ONLY": {
    stage: "writer", kind: "fact", recoverable: false,
    what: "Row published whose own copy reads as a thing to wait for rather than an action the founder can start.",
    disposition: "keep",
    evidence: "Detected by a regex over natural language containing ordinary words that also occur in valid next steps — admissible because it now reports rather than selects.",
  },
  // Recorded, and no longer a removal (wsGC, 2026-08-12). Its disposition was
  // "remove" and the disposition has been carried out: a candidate the writer
  // wrote nothing about keeps its rank and publishes from its own facts, so
  // the entry now records a fact about OUR OUTPUT rather than an opinion the
  // funnel acted on. It stays in the register because it is still a thing that
  // happened to a founder's brief and every recorded brief counts it.
  //
  // What it cost while it removed: on the 23 briefs whose counts are recorded
  // it fired on 6, and on all 6 the cap still had room — so each one swapped a
  // fund the ranker had put in the table for one it had put below it.
  "WRT-NO-NOTE": {
    stage: "writer", kind: "fact", recoverable: false,
    what: "Row published from its own facts because the writer returned no note for it.",
    disposition: "keep",
  },

  // ── cut stage ────────────────────────────────────────────────────────────
  // Two cuts to a fixed count, at two different counts, and they are two
  // entries because one code cannot name two mechanisms: a reader who cannot
  // tell which cut removed a fund cannot tell whether raising a cap would have
  // kept it. `CUT-WRITER-CAP` was emitted as `SEL-LEAF-CAP` until wsGK, whose
  // entry describes the per-channel leaf limit in `shortlist.ts`.
  "CUT-WRITER-CAP": {
    stage: "cut", kind: "fact", recoverable: false,
    what: "Row ranked below the number of candidates the writer is shown.",
    disposition: "keep",
  },
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
