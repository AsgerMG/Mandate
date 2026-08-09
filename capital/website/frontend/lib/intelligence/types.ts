// Shared types for the competitive EU-funding intelligence agent.
import { regionOptions } from "./regions.generated";
// From the leaf, NOT from corpus: this module is reachable from a client
// component, so it must not pull in fs or pg. See countryCodes.ts.
import { toIso2 } from "./countryCodes";

/** Committed EUR on one funding channel, from the corpus. */
export interface ChannelAmount {
  channel: string;
  eur: number;
}

/** A comparable company as matched against the Wincent corpus. */
export interface CompetitorRecord {
  name: string;
  /** ISO2 country of the richest matched entity, or "" if unknown. */
  country: string;
  /** Inferred sector tag, or "". */
  sector: string;
  /** Two-tier taxonomy of the matched company, "" if unclassified. */
  sectorTop: string;
  subsector: string;
  /** Total EUR committed across all traced events (grants + debt). */
  euCapitalEur: number;
  /** Distinct funding channels (source_family codes) the company used. */
  channels: string[];
  /** Per-channel committed EUR, largest first. Concrete signal for the memo. */
  channelAmounts: ChannelAmount[];
  /** First / last event year across the group, 0 when no dated event. */
  firstYear: number;
  lastYear: number;
  /** NUTS region (level 1-2) the State Aid Transparency Register places this
   *  company in, "" when it does not place it. A DEFAULT for the intake's
   *  region question, never an assertion: a registered address is not always
   *  where the work happens, so the founder is shown where it came from and
   *  their edit wins. Present for 46.5% of the index. */
  region: string;
  /** True when the name was found in our database; false = no public funding traced. */
  matched: boolean;
}

/** Web-research snapshot for one comparable company (open-web colour, never funding amounts). */
export interface CompetitorIntel {
  name: string;
  /** Country the peer operates from (helps disambiguate the DB match). */
  country?: string;
  product: string;
  positioning: string;
  /** Rough company maturity (lab-stage / scaling / listed …). Deliberately NOT
   *  a private-round figure: the study tracks public support, and "who raised
   *  what with which VC" is out of scope for the brief. */
  maturity: string;
  notes: string;
}

/** One row of the competitive-field table, finalised in code (never the model). */
export interface CompetitorRow {
  name: string;
  /** "web" = a web-found comparable; "corpus" = a same-sub-sector funded
   *  peer pulled straight from the database (guaranteed funding signal). */
  source: "web" | "corpus";
  country: string; // ISO2 or ""
  euCapital: string; // formatted total, e.g. "€1.2M" or "No public funding traced"
  channelBreakdown: string; // e.g. "€2.5M EIC · €1.8M dev banks", or ""
  channels: string[];
  activeYears: string; // e.g. "2021–2024", or ""
  stage: string; // company maturity (web colour, no private-round figures)
  positioning: string; // web colour
}

/** The founder's own company as traced in the corpus (drives the BLUF). */
export interface SelfRecord {
  matched: boolean;
  euCapital: string; // formatted total or "No public funding traced"
  channelBreakdown: string;
  channels: string[];
  activeYears: string;
}

/** Which founders an instrument is actually built for — drives ordering and
 *  the "not a default for solo founders" flag, so consortium/institutional
 *  and large-scale-industrial capital is never presented as equivalent to
 *  startup-ready capital. See data/instrument_terms/_SCHEMA.md. */
export type FounderFit = "startup_ready" | "consortium_institutional" | "large_scale_industrial";

/** The founder's self-reported archetype, one-tap on the core screen. Shared
 *  here (not just local wizard state) so the server-side free-text inference
 *  layer (Phase 4, pipeline.ts's inferProfileSignal()) and the client picker
 *  can never drift onto different literal strings for the same 4 values. */
export const COMPANY_TYPE_OPTIONS = [
  { value: "Deep-tech breakthrough", label: "Deep-tech breakthrough", hint: "novel science or hardware, real technical risk" },
  { value: "Applied innovation", label: "Applied innovation", hint: "a new product built on existing tech" },
  { value: "Application-layer software", label: "Application-layer software", hint: "a platform or app on top of existing models" },
  { value: "Services", label: "Services", hint: "consulting, agency or delivery" },
] as const;
export type CompanyTypeValue = (typeof COMPANY_TYPE_OPTIONS)[number]["value"];

/** The model's own read of the founder's free-text description, on the same
 *  4-point scale as their self-reported companyType — never the same field,
 *  never authoritative, never checked against any primary text. Strictly
 *  softer than the weakest eligibility_gates tier (inventory_inferred): it
 *  isn't grounded in law or a curated brief at all, only in the founder's own
 *  prose. `note` must be traceable to language actually present in that
 *  prose (same "grounded, not invented" discipline as GroundedRound). */
export interface ProfileSignal {
  techDepthRead: CompanyTypeValue;
  note: string;
}

/**
 * What the founder is told when funds were withheld from their table.
 *
 * ── Why a table is not allowed to just get shorter ────────────────────────
 * The degradation policy withholds any row whose open/closed status cannot be
 * confirmed (see liveness.ts). A founder reading five rows where there would
 * have been seven has no way to know the difference, and "here are your funds"
 * is then a claim we have not earned. The row is still withheld — the notice
 * is not a substitute for that, and it is emphatically not a "this list may be
 * out of date" banner over rows we suspect. It says how many are missing and
 * why, so the reader can decide whether to come back.
 *
 * Absent when nothing was withheld. Code-authored, so it cannot be softened,
 * dropped or embellished by the writer.
 */
export interface WithheldNotice {
  /** How many funds this founder lost. Never zero — the field is absent then. */
  count: number;
  /** One sentence, executive register. */
  note: string;
}

/** Curated trade-off snapshot parsed from a fund brief's "At a glance" block. */
export interface FundSnapshot {
  ticket: string;
  /** The channel's official application page, "" when it has no single one. */
  applyUrl?: string;
  speed: string;
  giveUp: string;
  bestFor: string;
  /** "" when a brief hasn't declared a Fit line yet (treated as startup_ready-neutral, never blocking). */
  fit: FounderFit | "";
}

/** One row of the instrument-comparison table, built in code from FundSnapshot. */
export interface InstrumentRow {
  channel: string;
  instrument: string; // display name, e.g. "EIC Accelerator"
  ticket: string;
  speed: string;
  giveUp: string;
  bestFor: string;
  /** True when a peer or the founder has actually drawn on this channel. */
  usedInField: boolean;
  fit: FounderFit | "";
  /** Set for non-startup_ready rows: a short, visible distinguishing annotation. */
  fitFlag?: string;
  /** The real DB-native instrument id this row resolves to within `channel`'s
   *  family (e.g. "eic_pathfinder" within the "eic" channel), when the
   *  320-instrument inventory could resolve one. Absent for rows still
   *  falling back to channel-only display. */
  instrumentId?: string;
  /** ISO2, or "EU" for pan-European instruments. */
  country?: string;
  capitalType?: string;
  eventCount?: number;
  /** Real granting authority for this leaf instrument (e.g. "Bundesamt für
   *  Wirtschaft und Ausfuhrkontrolle"), carried through from
   *  DbInstrument.administeringBody. Set when known — see
   *  displayInstitutionName() in pipeline.ts, which prefers this over
   *  `instrument` for generic auto-named buckets (the "SATR De Equity"
   *  problem: SATR is where the DATA comes from, not who is granting it). */
  administeringBody?: string;
  /** Last year this vehicle is recorded as having awarded anything, and
   *  whether that makes it stale. A brief that tells a founder to approach a
   *  scheme which stopped awarding in 2021 is not thin, it is wrong with
   *  authority — the most expensive kind of mistake we can make. */
  lastAwardYear?: number;
  stale?: boolean;
  /** Fraction of the instrument's awards actually made by administeringBody.
   *  Below ~0.6 the name is a busy agency inside a country-wide rollup, not
   *  the fund itself — displayInstitutionName falls back to a generic label. */
  administeringBodyShare?: number;
  /** Notified aid scheme code, when the row is a per-authority child. */
  schemeCode?: string;
  /** The NUTS region this instrument's own awards actually went to, with the
   *  share that did. Undefined for a body that delivers nationally.
   *
   *  This is the routing attribute for same-name siblings. 119 publishable
   *  leaves share a scheme name because they are one notified regime delivered
   *  by many bodies; their profile texts are legitimately identical, so no
   *  ranking signal built from text can separate them, and the applicant's
   *  region is the only thing that can. Measured from the transparency
   *  register's per-award beneficiary region -- a statement about where money
   *  has gone, so it may narrow and must never disqualify. */
  deliveryRegion?: string;
  deliveryRegionShare?: number;
  /** Bodies that actually disburse under this scheme. */
  schemeOperators?: string[];
  /** "invest" = a vehicle that negotiates and takes equity, not a fund you
   *  apply to. Only ever shown to a founder who asked for equity. */
  accessMode?: "apply" | "invest";
  /** Median of this instrument's OWN awards, and how many stand behind it.
   *  Distinct from `ticket`, which is the curated range for the whole channel:
   *  a family-level range cannot separate an instrument with a EUR 20k median
   *  from one with a EUR 127M median, and both sit under the same channel. */
  typicalAward?: number;
  typicalAwardN?: number;
  /** Share of project cost this instrument actually covered, measured. The
   *  structuring answer: a founder plans around what they must fund
   *  themselves, which is the other side of this number. */
  aidIntensity?: number;
  aidIntensityN?: number;
  /** One measured line describing what this fund is. */
  descriptor?: string;
  /** The agency or regime above this programme, when there is one. */
  familyName?: string;
  /** Cited requirements no comparator can decide — what the assessor weighs.
   *  For the 149 instruments with no evaluable cited rule, this is everything
   *  the fund has told us about who it says yes to. */
  /** What the scheme is REGISTERED to fund, from the GBER article it was
   *  notified under -- "industrial research (Art. 25(2)(b))". Statutory, so it
   *  is the same claim for any scheme citing that article. Present only for
   *  schemes in the transparency register. */
  registeredPurpose?: string;
  judgementCriteria?: string[];
  /** How the money is shaped: aid intensity, ceilings, co-financing, what a
   *  recipient commits to. Cited. Distinct from judgementCriteria, which is
   *  about who qualifies — these constrain the STRUCTURE of the deal. */
  structuringNotes?: string[];
  /** Where to apply, when we hold a verified one. */
  applicationUrl?: string;
  /** Curated application route: how you apply, and when. */
  applicationChannel?: string;
  applicationTimeline?: string;
  /** Short legal-basis label (e.g. "GBER Art. 25 (R&D aid)"), derived from
   *  this leaf's gber_article_inferred gate when present — see
   *  legalBasisFor() in pipeline.ts. */
  legalBasis?: string;
  /** Set only for a small, hardcoded set of tech-depth-sensitive channels
   *  (DEPTH_SENSITIVE_CHANNELS in pipeline.ts), and only when the model's
   *  read of the founder's own description (ProfileSignal) diverges from
   *  what they self-reported as companyType. Grounded in the founder's own
   *  words, never in a curated brief or primary legal text — render this
   *  visually distinct from fitFlag, never on the same footing. Only ever
   *  set by runIntelligence()'s full-memo path, never by computeVerdict(). */
  profileNote?: string;
}

/** One row of the "institutions to target" table — the brief's
 *  centrepiece. institution/channel/supportType/ticket/comparableFirms are
 *  finalised in code from the same ranking (buildInstrumentTable) and DB
 *  evidence (records/dbPeers) the old memo used; only whyEligible and
 *  nextStep are model-written, keyed back onto these rows by channel. */
export interface InstitutionEntry {
  institution: string;   // display name, e.g. "EIC Accelerator"
  channel: string;       // internal source_family code
  supportType: string;   // e.g. "Grant", "Loan / guarantee", "Equity stake"
  ticket: string;        // curated ticket size, from FundSnapshot
  /** ISO2, or "EU"/"" — where this specific vehicle operates. Answers
   *  "where do I go for this," alongside `institution` itself. */
  country?: string;
  /** The specific legal basis this vehicle is measured against, e.g. "GBER
   *  Art. 25 (R&D aid)" — derived from the leaf instrument's
   *  gber_article_inferred gate (see legalBasisFor() in pipeline.ts). Answers
   *  "what do we check eligibility against," never invented: absent when no
   *  such gate is on record for this instrument. */
  legalBasis?: string;
  /** The notified aid scheme behind this row, e.g. "SA.111723". Traceability:
   *  it is the identifier a founder or their adviser can look up. */
  schemeCode?: string;
  /** Bodies a founder can actually approach under this scheme. */
  schemeOperators?: string[];
  /** Median of this vehicle's OWN awards, with the number behind it.
   *  `ticket` above is the curated range for the whole channel and cannot
   *  separate a EUR 20k scheme from a EUR 127M one sitting in the same family.
   *  This is measured from real awards, so it is the honest answer to the
   *  question a founder asks first: how much would I actually get? */
  typicalAward?: number;
  typicalAwardN?: number;
  /** Measured share of project cost covered, and the awards behind it. */
  aidIntensity?: number;
  aidIntensityN?: number;
  /** What this fund IS, in one line, from measured facts — capital type, the
   *  region a rule restricts it to, what its recipients do. Not a name: real
   *  product names live in fund documents and mostly are not in the corpus, and
   *  "Bpifrance" three times tells a founder nothing. */
  descriptor?: string;
  /** The family this programme belongs to, when it has one: the agency or
   *  notified regime above it. A breadcrumb, not a name — it says who runs
   *  this and implies there are siblings. */
  familyName?: string;
  /** Cited requirements no comparator can decide — what the assessor weighs,
   *  in the fund's own words. Never inferred text: stating an inferred stub as
   *  an assessment criterion would be putting words in the fund's mouth. */
  /** What the scheme is REGISTERED to fund, from the GBER article it was
   *  notified under -- "industrial research (Art. 25(2)(b))". Statutory, so it
   *  is the same claim for any scheme citing that article. Present only for
   *  schemes in the transparency register. */
  registeredPurpose?: string;
  judgementCriteria?: string[];
  /** How the money is shaped: rates, ceilings, co-financing, commitments.
   *  What fraction of a project can be public money is the structuring
   *  question, and it is not the eligibility question. */
  structuringNotes?: string[];
  /** "invest" rows are pitched, not applied to. */
  accessMode?: "apply" | "invest";
  /** How to apply, curated from the scheme's own document, and where. Absent
   *  when we hold nothing verified — a route we cannot cite is worse than no
   *  route, because a row reads as instruction. */
  applicationChannel?: string;
  applicationUrl?: string;
  /** Where this row points, and what that link actually is. Resolved in code
   *  (instrumentLink.ts): an application portal, a state-aid scheme record, or
   *  the channel's programme page, in that order of usefulness. */
  link?: { url: string; kind: "apply" | "scheme" | "programme"; label: string };
  /** Grounded in the eligibility screen + scoping profile, never invented. */
  whyEligible: string;
  /** Qualification call from the encoded eligibility rules (verdict.ts).
   *  'open' = nothing we can check rules you out. Deliberately never "you
   *  qualify": the median instrument has only two encoded filters, so passing
   *  them is not proof. 'blocked' rows never reach the client — they are
   *  dropped in the pipeline rather than shown. */
  verdict?: "open" | "one_blocker" | "blocked" | "unknown";
  /** The single requirement standing in the way when verdict is
   *  'one_blocker' — the "here is what I would change" line. Restated in plain
   *  English by the writer where possible, falling back to the verbatim rule so
   *  the obstacle is never silently dropped. */
  blocker?: string;
  /** How many encoded filters could actually be evaluated — the honest weight
   *  behind the verdict. */
  gatesChecked?: number;
  /** Last year this vehicle is recorded as having awarded anything, and
   *  whether that makes it dormant. Stated on the row rather than hidden: a
   *  brief that sends a founder at a scheme which stopped awarding in 2019 is
   *  not thin, it is wrong with authority. A MISSING year is never stale — see
   *  isStale() in pipeline.ts for why (Bpifrance, KfW and EIFO have none). */
  lastAwardYear?: number;
  stale?: boolean;
  /** Code-built, never model-written: why this row ranks where it does on
   *  ease (brief_funnel_v2 Stage 3). Deliberately phrased as requirements
   *  ANSWERED, not cleared — see the honesty note in ease.ts. Empty when
   *  there is nothing honest to claim. */
  whyEasy?: string;
  /** Real comparable companies that drew on this exact channel, code-built. */
  comparableFirms: { name: string; amount: string }[];
  /** One concrete, actionable next step, model-written. */
  nextStep: string;
}

/** One row of the deterministic eligibility screen — code-evaluated against
 *  verified term records (never model-written). "likely_met"/"likely_not_met"
 *  are the honest middle tier: a gate below llm_2pass/human_verified can
 *  compute a comparator result but must never claim it as asserted fact. */
export interface EligibilityCheck {
  check: string;                       // e.g. "EU SME status"
  /** The instrument this row came from, when it is instrument-specific.
   *  Absent for the framework-level checks. Consumers MUST key on this and
   *  never on the display name: 322 instruments share only 143 names
   *  ("Norges Forskningsråd" alone covers 65), so name matching silently
   *  cross-contaminates siblings. */
  instrumentId?: string;
  status: "met" | "not_met" | "likely_met" | "likely_not_met" | "unknown" | "info";
  finding: string;                     // one declarative sentence
  cure?: string;                       // when not_met: what would clear it
  source: { file: string; locator: string };  // primary-text citation
  verified: boolean;                   // false → renders as "verify:"
}

/**
 * The whole brief. Word budget (house rubric, tested live): bottomLine +
 * positioning + stateOfPlay together stay at or under ~700 words; the
 * institutions table is excluded from that count. Replaces the old 9-section
 * memo shape (overview/instrumentTable/funderMap/landscape/todos) entirely
 * — see project-mgmt/plans/memo_vision.md for the retired design, and the
 * 2026-07-24 brief-rebuild plan for why.
 */
export interface IntelligenceReport {
  company: string;
  generatedAt: string;
  /** The founder's own funding footprint in the corpus. */
  self: SelfRecord;
  /** Deterministic eligibility screen: intake answers × verified term records.
   *  Framework-level v1 (EU law); instrument-level rows land as national
   *  documents are verified. Code-built — the writer narrates, never edits. */
  eligibilityScreen: EligibilityCheck[];
  /** 4-5 bullets in plain prose (see BRIEF_LIMITS.bulletWords): why this
   *  founder should care, which funds
   *  are the right step, what the commercial payoff looks like. */
  bottomLine: string[];
  /** Up to `BRIEF_LIMITS.institutionsMax` rows (the ONE copy of that number:
   *  never restate it here), the institutions/funds to target, best first.
   *  Never fewer
   *  than 2 unless the company genuinely has fewer real doors — a tobacco or
   *  gambling business is excluded from most state aid by law, and padding the
   *  table would mean offering funds it cannot use. */
  institutions: InstitutionEntry[];
  /** One paragraph: positioning against the current political moment,
   *  grounded in the news-derived people/agenda signals. */
  positioning: string;
  /** One paragraph: the most relevant recent news/upcoming funds, plus a
   *  fixed, code-authored Wincent plug appended (never modeled). */
  stateOfPlay: string;
  caveats: string;
  /** Funds withheld because their open/closed status could not be confirmed.
   *  Absent when nothing was withheld, which is the normal state. See
   *  `withheldNotice()` — code-authored, never model-written, and never a
   *  substitute for withholding the row. */
  withheld?: WithheldNotice;
  /** Origin of each part of the brief, plus the exclusion counts for this
   *  request. Rendered only under ?trace=1; see provenance.ts. */
  provenance?: {
    fields: Record<string, { origin: "code" | "model" | "fixed"; contract?: string; evidence?: string[] }>;
    exclusions: Record<string, number>;
  };
}

/**
 * The second movement of the state-of-play section: the standing offer.
 *
 * Fixed copy, never model-written, so the claim stays controlled and on
 * register. Rendered as its own block beneath the analysis rather than
 * appended to it — concatenated into the same field, a paragraph of analysis
 * ended mid-thought in a sales line (contract rule SOP-2).
 */
export const STATE_OF_PLAY_OFFER =
  "Wincent reads these signals continuously, anticipates where the money and " +
  "the priorities move next, and opens the right doors. Partner with us to " +
  "play the political momentum to your advantage.";

/**
 * The report fields the WRITER produces, and therefore the fields a brief
 * contract can govern. `self`, `eligibilityScreen` and `institutions` are
 * built in code and only annotated by the model, so they are not listed here;
 * `institutionNotes` is the writer's contribution to the institutions table.
 *
 * Exported so scripts/check_contracts.ts can fail the build when a contract
 * governs a field the schema does not have — the drift that let the writer's
 * instructions describe a retired report shape for weeks without anything
 * noticing.
 */
export const REPORT_SCHEMA_FIELDS: string[] = [
  "bottomLine", "institutionNotes", "positioning", "stateOfPlay", "caveats",
];

/**
 * The named evidence blocks the pipeline assembles for the writer. A contract
 * may only claim evidence that appears here, so a section cannot promise the
 * model context it will never be given.
 */
export const EVIDENCE_BLOCKS: string[] = [
  "selfLine", "comparables", "institutions", "processes", "eligibilityScreen",
  "agendaEvidence", "peopleEvidence", "recentEvidence", "projectAnswers",
  "commercialAnswers", "profileBlock", "screenBlock",
];

/**
 * Free text a founder typed, bounded before it reaches a model prompt.
 *
 * The description is interpolated into eight prompt sites and is the only
 * unbounded, unauthenticated input the pipeline has. /verdict capped it at
 * 400 characters; the two PAID routes capped it at nothing, so an anonymous
 * request could inflate every prompt in the run — and each run is six model
 * calls plus web search. Cost amplification first, prompt injection second.
 *
 * 1,200 characters is roughly a generous paragraph: past that a founder is
 * pasting a deck, not describing a company, and nothing downstream reads more
 * closely than the first few sentences anyway.
 */
export const MAX_DESCRIPTION_CHARS = 1200;

/**
 * Shortest description that can be matched at all.
 *
 * Below this both matchers return an empty map and the shortlist falls back to
 * peer precedence and sector share. It lived as a bare `12` in semantic.ts and
 * again in relevance.ts, and the intake did not know the number at all — so the
 * form happily accepted three characters that the ranker then discarded in
 * silence. One constant, read by both matchers and by the form that has to warn
 * about it.
 */
export const MIN_MATCHABLE_DESCRIPTION_CHARS = 12;

/**
 * Shortest description that actually SEPARATES funds, as opposed to merely
 * being long enough to embed.
 *
 * Not a guess. `scripts/measure_description_lift.ts` ranks the same companies
 * twice, once on what they really said about their project and once on the
 * canned sector sentence a founder who skips this box is represented by:
 * EXACT@5 goes from 21.3% to 48.9% on the holdout, and the pool hit rate from
 * 77.1% to 94.1% — the largest single measured lever in the product, and an
 * intake change rather than a model one. The recovered descriptions that
 * produce it run to a sentence or two; a five-word answer scores like the
 * template. This is the floor the form nudges towards, never a hard reject:
 * see the intake, which lets a founder go on without it deliberately.
 */
export const USEFUL_DESCRIPTION_CHARS = 60;

/** Request body posted to /api/intelligence. */
export interface IntelligenceRequest {
  company: string;
  sector?: string;
  country?: string;
  description?: string;
  /** How the founder describes the company (deep-tech breakthrough, applied
   *  innovation, application-layer software, services). Free text — re-orders the
   *  instrument shortlist far more than sector does. */
  companyType?: string;
  /** Capital types the founder wants, from CAPITAL_OPTIONS. Empty = no preference
   *  (treat as "show everything"). Filters and ranks the instrument shortlist. */
  capitalSought?: string[];
  /** Countries where the founder wants to RAISE public capital (full English
   *  names). May differ from the HQ country — an Irish company can target
   *  German, Italian or French public capital. Empty = home market + EU-wide.
   *  Steers peer preference, the funder map and the landscape slices. */
  targetMarkets?: string[];
  /** Answers to the tailored intake questions (phase 1), folded into the memo
   *  context. Each is a question the agent asked and the option the founder picked. */
  clarifications?: { question: string; answer: string }[];
  /** Structured scoping answers (the wizard's deterministic screens). */
  eligibility?: EligibilityAnswers;
  /** The founder's current candidate instrument shortlist (from a prior
   *  verdict computation) — grounds the adaptive round in gates that are
   *  actually still open for THESE instruments, not the whole 320-row corpus. */
  candidateInstrumentIds?: string[];
  /** Answers to the project questions (brief_funnel_v2 Stage 2b). Grounds the
   *  writer in what this company actually does, and feeds ease scoring. Never
   *  read by computeVerdict() — see ProjectAnswer. */
  projectAnswers?: ProjectAnswer[];
  /** The model's own read of the founder's free-text description (Phase 4),
   *  computed once per session by inferProfileSignal() and passed straight
   *  through — a soft, additive annotation only, never re-derived here. */
  profileSignal?: ProfileSignal;
}

/**
 * Sector: what the company BUILDS.
 *
 * These are the corpus's own Tier-1 values, not a parallel list. They used to
 * be a separate 7-bucket vocabulary invented for the intake form, which meant
 * a founder's answer and the funding record could never be compared: intake
 * said `health_lifesciences`, the corpus said `health_life_sciences`, and six
 * corpus sectors (industrial manufacturing, semiconductors, mobility, space,
 * defence, materials) could not be selected at all. See
 * scripts/check_vocabularies.ts, which now fails if the two drift again.
 *
 * The vocabulary is NACE-backed: `companies.sector_top` is resolved
 * deterministically from the NACE descriptor state-aid registers publish, and
 * an LLM only fills what NACE cannot (see project-mgmt/nace_taxonomy.md).
 * Sharing it means the founder's own answer can drive sector routing even when
 * their company is not in the record — which is most startups.
 *
 * What a company BUILDS and what aid law RESTRICTS are different questions:
 * see ACTIVITY_OPTIONS.
 */
/**
 * WHAT KIND OF ORGANISATION THE APPLICANT IS.
 *
 * The single largest demand in the corpus that no intake field carried: 484
 * filter gates on 370 publishable instruments turn on the constitutional kind
 * of the applicant, and 28 of the 36 multi-leaf regimes hold siblings that
 * demand DIFFERENT kinds. Knowing it lifts CEILING@5 from 40.0 to 51.6 across
 * twelve regimes with the largest holding 16% of the gained leaves.
 *
 * The property, the three tests that decide an unseen case, and why SME status
 * is NOT this question, are in lib/intelligence/organisationType.ts. Read them
 * before adding an option: the corpus decides what belongs here, not intuition.
 *
 * Five options and not six. The corpus also distinguishes "a legal person not
 * carrying out an economic activity", and that fails the INVARIANCE test —
 * trading is something an entity starts and stops, so it is a status and not a
 * kind. It is also the one item here a founder cannot answer instantly. It is
 * carried as a DEMAND instead: such a gate admits the three kinds that are
 * typically non-economic.
 */
export const ORGANISATION_TYPE_OPTIONS = [
  { value: "company", label: "A company", hint: "any incorporated business — GmbH, Ltd, SAS, AB, S.r.l., Oy" },
  { value: "sole_trader", label: "Sole trader or self-employed", hint: "you trade in your own name, with no company" },
  { value: "research_org", label: "University or research institute", hint: "including technology centres and RTOs" },
  { value: "public_body", label: "Public body or local authority", hint: "a municipality, region, agency or other public-law body" },
  { value: "nonprofit", label: "Association, foundation or cooperative", hint: "constituted for a purpose other than distributing profit" },
] as const;
export type OrganisationTypeValue = (typeof ORGANISATION_TYPE_OPTIONS)[number]["value"];

export const SECTOR_OPTIONS = [
  { value: "software_data_ai", label: "Software, AI, data or cloud" },
  { value: "health_life_sciences", label: "Health, medtech, pharma or biotech" },
  { value: "energy_cleantech", label: "Energy, cleantech or environment" },
  { value: "industrial_manufacturing", label: "Industrial manufacturing, robotics or machinery" },
  { value: "semiconductors_electronics", label: "Semiconductors, electronics or photonics" },
  { value: "mobility_transport", label: "Mobility, transport or logistics" },
  { value: "agrifood", label: "Agritech, food or forestry" },
  { value: "materials_chemicals", label: "Materials or chemicals" },
  { value: "space", label: "Space" },
  { value: "defense_security", label: "Defence or security" },
  { value: "other", label: "Something else" },
] as const;
export type SectorValue = (typeof SECTOR_OPTIONS)[number]["value"];

/**
 * What the money would be SPENT ON.
 *
 * The most decisive question the intake was not asking. Measured across the
 * corpus: 585 gates on 266 instruments turn on eligible costs, and 59 of them
 * are hard filters. With no field to resolve to, they were force-fitted onto
 * whatever looked closest — 16 onto developmentStage, 10 onto consortium, 9
 * onto cofinancingBand — and 12 landed on `none`, undecidable purely because
 * nobody was asked.
 *
 * It was already reaching founders as an obstacle we had the means to clear:
 * eAgronom, Nortal and BioNTech each got a version of "only covers applied
 * research, product development or feasibility work, not general commercial
 * costs", with a next step telling them to reframe the project. That is a
 * question, not a blocker.
 *
 * The values track the cost categories aid law itself draws — GBER Art. 25
 * splits research from development from feasibility, Art. 14/17 covers
 * investment in capacity, and working capital is largely not aidable at all —
 * so a clause can be encoded against exactly what it names. Multi-select: real
 * projects span several.
 */
export const USE_OF_FUNDS_OPTIONS = [
  { value: "industrial_research", label: "Research, before there is a product" },
  { value: "experimental_development", label: "Developing or prototyping the product" },
  { value: "feasibility_study", label: "A feasibility or scoping study" },
  { value: "rd_facilities", label: "R&D facilities, equipment or lab space" },
  { value: "ip_protection", label: "Patents and IP protection" },
  { value: "production_capex", label: "Building production or manufacturing capacity" },
  { value: "market_launch", label: "Launching or scaling commercially" },
  { value: "working_capital", label: "General operations and working capital" },
] as const;
export type UseOfFundsValue = (typeof USE_OF_FUNDS_OPTIONS)[number]["value"];

/**
 * Regulated activities: what aid law RESTRICTS, which is a different question
 * from what a company builds.
 *
 * These were previously smuggled into the sector list as `financial_services`
 * and `excluded_activities`, which forced two errors at once. A lending
 * fintech had to pick "financial services" INSTEAD of naming what it builds,
 * and a single `excluded_activities` bucket lumped gambling, tobacco, weapons
 * and real estate together — so a fintech inherited blocks written for tobacco
 * companies. Measured across the triaged corpus: 82 instruments carry rules
 * about financial/insurance activity, 17 about agriculture and fisheries, 12
 * about tobacco/gambling/weapons. They are not one category.
 *
 * The values mirror the categories GBER and the de minimis regulation name, so
 * an exclusion clause can be encoded against exactly what it says. Multi-select,
 * and "none" is a real answer: an empty array means unanswered, which must
 * never read as a pass.
 */
export const ACTIVITY_OPTIONS = [
  { value: "none", label: "None of these" },
  { value: "financial_services", label: "Lending, banking, insurance or payments (as the provider)" },
  { value: "primary_agriculture", label: "Primary agricultural production" },
  { value: "fisheries_aquaculture", label: "Fisheries or aquaculture" },
  { value: "road_freight", label: "Road freight transport for hire or reward" },
  { value: "real_estate", label: "Real estate" },
  { value: "gambling_betting", label: "Gambling or betting" },
  { value: "tobacco", label: "Tobacco" },
  { value: "alcohol", label: "Alcohol" },
  { value: "weapons", label: "Weapons or munitions" },
] as const;
export type ActivityValue = (typeof ACTIVITY_OPTIONS)[number]["value"];

/** The standard EU/national exclusion situations, as one multi-select. These
 *  are boilerplate across the corpus and gate hard: an outstanding recovery
 *  order or insolvency closes most state aid outright. Merging them with the
 *  undertaking-in-difficulty test (accumulated losses) makes ONE question
 *  decide roughly 104 rules — the single highest-yield question available,
 *  and far less alarming asked as a checklist than one at a time. */
export const EXCLUSION_OPTIONS = [
  { value: "none", label: "None of these apply" },
  { value: "insolvency", label: "In bankruptcy, insolvency or winding-up" },
  // external: GBER (Reg. 651/2014) Art. 2(18)(a) — an undertaking in difficulty
  // is one whose accumulated losses exceed half its subscribed share capital.
  // A statutory threshold, not a figure from this corpus.
  { value: "losses_over_half_capital", label: "Accumulated losses exceed half our share capital" },
  { value: "recovery_order", label: "Under an unpaid EU state-aid recovery order" },
  { value: "sanctions", label: "Subject to EU sanctions or an exclusion decision" },
  { value: "tax_arrears", label: "Overdue tax or social-security debt" },
] as const;
export type ExclusionValue = (typeof EXCLUSION_OPTIONS)[number]["value"];

/** Scale bands: which instrument universe the ask opens (advisory_pipeline §B2).
 *
 *  BANDED FOR EUROPE, NOT FOR VENTURE CAPITAL. The scale this replaced spent
 *  four of its five bands above EUR 500k and one band on everything below it —
 *  and everything below it is most of the national grant corpus. Measured on
 *  the live register: 706 of the 892 instruments carrying a usable award median
 *  sit inside the old `lt500k`, against 32 spread across its four upper bands.
 *  The question was asking a founder to place themselves on a scale whose
 *  resolution was almost entirely where almost nothing is.
 *
 *  Splitting the low end into three takes ceiling@5 — the share of leaves whose
 *  residual class fits the five rows we render — from 17% to 26% on this
 *  question alone, and from 48% to 53% combined with region (wsAZ, wsAY §4).
 *  It also survives the test that killed subsector: the band a fund's early
 *  awards imply agrees with the band its later awards imply 70% of the time
 *  against a 56% floor, because award percentiles are register facts rather
 *  than a posterior fitted to history (wsAY §3).
 *
 *  THE TOP EDGE IS DELIBERATELY LEFT ALONE. wsAY's scheme also collapsed
 *  `b15m_50m` and `gt50m` into one `gt15m`. Three encoded comparators are
 *  written against that edge and two are `band_max b15m_50m`, which under a
 *  collapsed top would mean "at most the highest band" — no constraint at all,
 *  admitting every founder. Keeping the split costs no ceiling (it gains 2pp)
 *  and keeps those three rules meaning what their funds wrote down.
 *
 *  `maxEur` is the EXCLUSIVE upper bound, and it is the single definition of
 *  where these edges are. Everything that needs a number per band — the
 *  geometric midpoint the row sort ranks on, the arithmetic midpoint the pool
 *  selects on, the large-scale lane's threshold, and the Python that bands a
 *  register award — derives from it rather than restating it. Three hand-kept
 *  copies of these boundaries existed before this and the ETL's and the app's
 *  had already stopped agreeing about anything below EUR 500k. */
export const TICKET_BANDS = [
  { value: "lt25k", label: "Under €25K", maxEur: 25_000,
    hint: "innovation vouchers, de minimis micro-grants" },
  { value: "b25k_100k", label: "€25K – €100K", maxEur: 100_000,
    hint: "feasibility studies, small national grants" },
  { value: "b100k_500k", label: "€100K – €500K", maxEur: 500_000,
    hint: "regional innovation grants, soft loans" },
  { value: "b500k_2m5", label: "€500K – €2.5M", maxEur: 2_500_000,
    hint: "innovation grants, guaranteed loans" },
  { value: "b2m5_15m", label: "€2.5M – €15M", maxEur: 15_000_000,
    hint: "blended finance, venture debt" },
  { value: "b15m_50m", label: "€15M – €50M", maxEur: 50_000_000,
    hint: "EIB growth capital, Innovation Fund, IPCEI" },
  { value: "gt50m", label: "Over €50M", maxEur: null,
    hint: "large-scale project finance, IPCEI waves" },
] as const;
export type TicketBand = (typeof TICKET_BANDS)[number]["value"];

/** Inclusive lower bound of a band, in euros — the previous band's exclusive
 *  upper bound, and 0 for the first. Derived so that adding or moving a band
 *  cannot leave a gap or an overlap behind. */
export const bandFloorEur = (value: string): number | undefined => {
  const i = TICKET_BANDS.findIndex((b) => b.value === value);
  return i < 0 ? undefined : i === 0 ? 0 : TICKET_BANDS[i - 1].maxEur ?? undefined;
};

/** Which band an amount in euros falls in. The one implementation; the Python
 *  half reads the same edges out of `data/vocabularies.json`. */
export const bandForEur = (eur: number): TicketBand | undefined =>
  TICKET_BANDS.find((b) => b.maxEur == null || eur < b.maxEur)?.value;

/** Who ends up owing the money — routes between entirely different funnels. */
export const BORROWER_MODELS = [
  { value: "operating", label: "We fund our own operations",
    hint: "R&D, plant, working capital for ourselves" },
  { value: "balance_sheet_lender", label: "We finance customers from our balance sheet",
    hint: "leasing, credit we carry ourselves" },
  { value: "originator", label: "We originate; a bank or vehicle carries the credit",
    hint: "partner bank, securitisation" },
  { value: "fund_manager", label: "We manage a fund others invest through",
    hint: "fund-of-funds routes" },
] as const;
export type BorrowerModel = (typeof BORROWER_MODELS)[number]["value"];

/** Structured scoping answers (advisory_pipeline Stage B; detail in
 *  intake_scoping.md). All bands/toggles — the deterministic layer the
 *  eligibility engine will evaluate. Every field optional: the memo degrades
 *  gracefully when a founder skips a screen. */
export interface EligibilityAnswers {
  ticketBand?: TicketBand;
  borrowerModel?: BorrowerModel;
  /** Countries (full English names) where an entity or permanent establishment exists. */
  entityCountries?: string[];
  wouldOpenEntity?: "yes" | "no" | "depends";
  fteBand?: string;            // "1-9" | "10-49" | "50-249" | "250+"
  turnoverBand?: string;       // "<2M" | "2-10M" | "10-50M" | ">50M"
  balanceBand?: string;        // "<2M" | "2-43M" | ">43M"
  ownerOver25?: "yes" | "no" | "unsure";
  institutionalOwner?: "yes" | "no" | "unsure";
  nonEuControl?: "yes" | "no" | "unsure";
  cofinancingBand?: string;    // "<25%" | "25-50%" | ">50%" | "unsure"
  foundedYear?: number;
  lossesOverHalfCapital?: "yes" | "no" | "unsure";
  conditionality?: string[];   // accepted strings: local_entity, geo_commitments, state_shareholder, job_commitments
  // Derived from the instrument-level reverse-engineering (intake_scoping §2b):
  developmentStage?: string;   // "research" | "prototype" | "pilot_customers" | "scaling_revenue"
  activityCountries?: string[]; // where the FUNDED activity will physically sit
  consortium?: "yes" | "no" | "unsure";      // willing/able to run in a 3+ partner consortium
  bankRelationship?: "yes" | "no" | "unsure"; // a bank that would lend if guaranteed
  institutionalBacking?: "yes" | "no" | "unsure"; // VC/institutional investors aboard or anchoring
  needBy?: string;             // "asap_weeks" | "months_6" | "months_18" | "flexible"
  /** ORGANISATION_TYPE_OPTIONS value — the constitutional kind of the
   *  applicant entity. NOT its size: see organisationType.ts for the property
   *  and the three tests, and for why `fteBand` is a different question. */
  organisationType?: string;
  /** SECTOR_OPTIONS value — what the company builds. Asked directly. */
  sector?: string;
  /** USE_OF_FUNDS_OPTIONS values — what the money would be spent on. Decides
   *  59 hard filters that previously had no field to resolve to. */
  useOfFunds?: string[];
  /** ACTIVITY_OPTIONS values — the regulated categories aid law names. Kept
   *  separate from `sector` so an exclusion written for tobacco cannot land on
   *  a fintech. "none" is a real answer; an empty array means unanswered. */
  activities?: string[];
  /** EXCLUSION_OPTIONS values. "none" is a real answer, not an empty list:
   *  an empty array means unanswered, which must never read as a pass. */
  exclusionFlags?: string[];
  /** NUTS region id (see regions.generated.ts). Asked adaptively, and only
   *  when a regional scheme is actually in play: it is meaningless to most of
   *  the corpus and decisive for the part of it that is regional. Matching is
   *  hierarchical, so answering at either NUTS level works. */
  region?: string;
}

/**
 * Whether failing a rule on this field is something the founder could change.
 *
 * ── The judgement, not the answer ─────────────────────────────────────────
 * One test, applied per field: **could this founder answer differently before
 * the deadline, if they decided to?**
 *
 *  - `structural` — no. It is what the company IS: where it is established,
 *    how many people it employs, what it sells, its filed accounts. Failing
 *    one of these disqualifies on its own; there is nothing to advise.
 *  - `choice` — yes. A stance, a preference, or a commitment they have not
 *    made yet. Failing one is an obstacle with a cure, and the cure is the
 *    useful thing to publish.
 *
 * ── Why it lives here ─────────────────────────────────────────────────────
 * This was first written as a set of field names inside the verdict engine.
 * That is a register: a field added to the intake later would default to
 * `choice` without anyone deciding, and it would default in the permissive
 * direction — a new structural disqualifier silently downgraded to advice.
 *
 * Keyed on `keyof EligibilityAnswers`, so the compiler refuses a new intake
 * field until someone has answered the question above for it. The enforcement
 * is the point; the current values are just this session's answers to it.
 */
export type FieldSeverity = "structural" | "choice";

export const FIELD_SEVERITY: Record<keyof EligibilityAnswers, FieldSeverity> = {
  // What the company is — none of it changes on the timescale of an application.
  entityCountries: "structural",
  activityCountries: "structural",
  activities: "structural",
  exclusionFlags: "structural",
  lossesOverHalfCapital: "structural",
  fteBand: "structural",
  turnoverBand: "structural",
  balanceBand: "structural",
  ownerOver25: "structural",
  institutionalOwner: "structural",
  nonEuControl: "structural",
  sector: "structural",
  organisationType: "structural",
  region: "structural",
  foundedYear: "structural",
  developmentStage: "structural",
  borrowerModel: "structural",

  // Positions a founder can still take, or has simply not taken yet.
  wouldOpenEntity: "choice",
  consortium: "choice",
  cofinancingBand: "choice",
  conditionality: "choice",
  useOfFunds: "choice",
  needBy: "choice",
  bankRelationship: "choice",
  institutionalBacking: "choice",
  ticketBand: "choice",
};

/** Unknown fields are treated as choices: a rule we cannot classify should
 *  narrow the brief with an explanation, never disqualify silently. */
export function fieldSeverity(field: string): FieldSeverity {
  return FIELD_SEVERITY[field as keyof EligibilityAnswers] ?? "choice";
}

/**
 * How a value gets onto this field — the answer path, declared once.
 *
 * ── The defect this exists to make impossible ─────────────────────────────
 * A rule keyed to a question nobody is asked is INERT. `evaluateSpec` reads
 * `answers[spec.field]`, finds `undefined`, and returns null; null renders as
 * "not assessable" and never as a blocker. So the rule cannot pass, cannot
 * fail, and cannot rank anything — and it looks exactly like a rule that is
 * quietly agreeing with everyone. Measured against Postgres 2026-08-08, that
 * was true of 296 encoded comparators on 254 instruments.
 *
 * The failure is not that the rule is wrong. It is that we paid a model to
 * read a fund's own text, extract a real requirement, and store it somewhere
 * nothing will ever look. Inertness also HIDES incorrectness: `foundedYear`
 * accumulated nine specs holding an AGE ("no older than 3 years") and three
 * holding a YEAR ("incorporated after 2015") in the same numeric field,
 * because nothing ever answered it and so nothing ever contradicted it.
 *
 * ── Why a declaration rather than a search ────────────────────────────────
 * "Is this field asked?" cannot be answered by grepping the form: the first
 * page is a `"use client"` component, the adaptive round picks its fields at
 * runtime from live gate evidence, and two fields are computed server-side
 * from other answers. There is no single place to look — so there is a single
 * place to SAY, and `check_gate_field_reach.ts` holds the saying to the doing:
 * every `adaptive` claim is verified against FIELD_ENUM_HINTS, and every claim
 * of any kind is verified against `sanitizeEligibility`, which is the one
 * whitelist standing between a real request and the evaluator.
 *
 * Keyed on `keyof EligibilityAnswers`, so the compiler refuses a new intake
 * field until someone has said how it gets answered. A field added without an
 * answer path is the whole defect; making it a type error is the fix.
 */
export interface FieldReachability {
  /**
   *  first_page  — a control on the opening form sets it.
   *  adaptive    — FIELD_ENUM_HINTS offers it and the grounded round may ask it.
   *  derived     — computed server-side from another answer; never asked.
   *  constant    — pinned to one value for every founder. Reachable, and rules
   *                on it really do evaluate; they just always evaluate the same
   *                way. Legitimate, but it is a product decision and it should
   *                be visible as one rather than read as a question.
   *  unreachable — nothing can put a value here. Encoding against it is waste.
   */
  via: "first_page" | "adaptive" | "derived" | "constant" | "unreachable" | "staged";
  /**
   * REQUIRED for `via: "staged"`, and meaningless otherwise. Names the
   * environment variable whose value is "on" when the field is really asked.
   *
   * `staged` is the honest reading of a field that is fully wired, encodable
   * by the ETL, and behind a default-OFF arm: nobody is asked it yet, so
   * `check_answer_reach`'s rule — every question we ask must change something
   * a founder sees — has nothing to bite on. That is an exemption, so it is
   * made to expire: the checks read this env var, and the moment it says "on"
   * the field is graded as a first-page field like any other. A staged field
   * that is switched on without earning its comparators goes red.
   */
  armEnv?: string;
  /**
   * One value a founder could really give, used to probe `sanitizeEligibility`
   * end to end.
   *
   * Optional ONLY because most fields have an enumerable vocabulary the probe
   * can draw from by itself. It is required in practice for the fields that
   * do not, and that is deliberate: `check_vocabularies.ts` skips any field
   * whose `values` list is empty (`if (!vocab.values.length) continue`), and
   * those are PRECISELY the fields that broke — `region` was asked, answered,
   * and dropped by the sanitiser for as long as the field has existed, with a
   * green build the whole time. A guard must not skip its own hard cases, so
   * the reach check FAILS on a field it cannot probe instead of passing it.
   */
  sample?: unknown;
  note?: string;
}

export const FIELD_REACH: Record<keyof EligibilityAnswers, FieldReachability> = {
  // ── Asked on the opening form ───────────────────────────────────────────
  sector: { via: "first_page" },
  // ── Wired, encodable, and not yet asked ─────────────────────────────────
  // The control exists on the opening form and renders only when the arm is
  // on. It is `staged` rather than `first_page` because no gate in the corpus
  // resolves to it yet: the ETL triage pass that would point the 484
  // organisation-type gates at this field writes to Railway Postgres and needs
  // approval. Until it runs, asking the question would change nothing a
  // founder sees, and `check_answer_reach` is right to say so.
  organisationType: { via: "staged", armEnv: "NEXT_PUBLIC_ORGANISATION_TYPE_ARM" },
  useOfFunds: { via: "first_page" },
  fteBand: { via: "first_page" },
  ticketBand: { via: "first_page" },
  developmentStage: { via: "first_page" },
  entityCountries: {
    via: "first_page",
    sample: ["France"],
    note: "the control is the top-level `country` select; withIncorporationCountry " +
          "folds it in server-side so all three routes get it from one place",
  },
  // MOVED HERE FROM `adaptive`, which is the whole of workstream AZ's part A.
  //
  // Asked adaptively it reached a minority of founders — wsAO measured a region
  // supplied for 46% of graded pairs — and it is the most decisive question the
  // intake has: 181 encoded, official region filters on 155 leaves across 19
  // regimes, and the ONLY field whose demands differ between siblings across
  // the eight largest fund families. A perfect answer takes the share of leaves
  // narrowable to five rows from 8% to 39%.
  //
  // Its options are DERIVED from the founder's country rather than fixed, so
  // FIELD_ENUM_HINTS.region.options is empty by design and only `optionsFor`
  // can answer it. Sampled explicitly for the same reason: check_gate_field_reach
  // FAILS on a field it cannot probe rather than skipping it, because the
  // fields with no enumerable list are precisely the ones that have broken.
  //
  // FIRST_PAGE_FIELDS is derived from this table and `openFieldsForShortlist`
  // skips anything in it, so this one line is also what stops the adaptive
  // round asking again for something the first screen already collected.
  region: { via: "first_page", sample: "FRD" },

  // ── Offered by the grounded adaptive round ──────────────────────────────
  activities: { via: "adaptive" },
  exclusionFlags: { via: "adaptive" },
  consortium: { via: "adaptive" },
  cofinancingBand: { via: "adaptive" },
  conditionality: { via: "adaptive" },
  wouldOpenEntity: { via: "adaptive" },
  ownerOver25: { via: "adaptive" },
  institutionalOwner: { via: "adaptive" },
  nonEuControl: { via: "adaptive" },
  bankRelationship: { via: "adaptive" },
  institutionalBacking: { via: "adaptive" },
  needBy: { via: "adaptive" },
  turnoverBand: { via: "adaptive" },
  balanceBand: { via: "adaptive" },

  // ── Computed from another answer ────────────────────────────────────────
  lossesOverHalfCapital: {
    via: "derived",
    note: "one line of the exclusions checklist; sanitizeEligibility derives it " +
          "from exclusionFlags so the framework check and 153 gates keep working",
  },

  // ── Pinned, not asked ───────────────────────────────────────────────────
  borrowerModel: {
    via: "constant",
    note: "panel.tsx pins 'operating'. The lender/intermediary routing the other " +
          "values unlock is out of scope for this tool's lean-founder persona, " +
          "and an operating company is what such a founder truthfully is — so " +
          "these rules evaluate correctly, they simply always evaluate the same way.",
  },

  // ── Nothing can answer these ────────────────────────────────────────────
  // Listed so the failure is DECLARED rather than discovered. The reach check
  // still fails on encoded comparators against them; this field only records
  // that we know, so nobody re-derives the finding from scratch.
  activityCountries: {
    via: "unreachable",
    sample: ["Spain"],
    note: "no control, no FIELD_ENUM_HINTS entry, no derivation. 86 comparators " +
          "on 80 instruments, 84 of them a positive `in [<one country>]`.",
  },
  foundedYear: {
    via: "unreachable",
    sample: 2021,
    note: "no control, no hint, no derivation. Worse than inert: its 17 specs " +
          "mix AGE thresholds with CALENDAR YEARS in one numeric field, so the " +
          "day it is answered, nine funds start false-blocking young companies.",
  },
};

/**
 * What the code does with the answer once it has it.
 *
 * ── The question FIELD_REACH does not ask ─────────────────────────────────
 * FIELD_REACH says an answer can REACH the evaluator. It cannot say anything
 * about whether the evaluator, or the ranker, or anything else, then DOES
 * something with it — and that next step is where four separate answers were
 * lost in one week:
 *
 *   region       reached the panel, was merged, and was dropped one line
 *                before the sanitiser. 193 rules on 163 funds never fired.
 *   ticketBand   reached `rowRelevance`, was turned into a `ticket` multiplier,
 *                and was left out of the returned expression — by the commit
 *                named "Make ticketBand actually affect what a founder is
 *                shown".
 *   consortium   reached `selectInstrumentRows` as `consortiumOk`, was
 *                destructured, and was read by nothing in that function.
 *   sector and   reached `computeVerdict`'s table and NOT the memo's, because
 *   useOfFunds   the two call sites hand-maintained the same object literal
 *                and one had lost two keys. Both are asked on screen one.
 *
 * All four were invisible precisely because the value was PRESENT: threaded,
 * destructured, computed, named. Only the last mile showed nothing consumed
 * it. So the last mile is what gets declared and what gets tested.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 *     An answer the intake collects must be read by the code that RANKS —
 *     or be declared collected-for-the-memo-only, with a reason.
 *
 * Keyed on `keyof EligibilityAnswers`, so the compiler refuses a new intake
 * field until someone has said which it is. `check_answer_reach.ts` then holds
 * the saying to the doing: it builds the published table both ways, through
 * the production mapping, and a `ranks: true` that moves no row for any probe
 * founder FAILS THE BUILD. A `ranks: false` is not the free direction either —
 * the field must still move `evaluateEligibility`, which is what "collected
 * for the memo" means. A field that moves nothing at all is a question we ask
 * a founder and an answer we throw away.
 */
export type AnswerUse =
  /** `via` names the mechanism, so a reader can go and look at it. It is
   *  documentation; the proof is the differential test. */
  | { ranks: true; via: string }
  /** Collected on purpose and not used for ranking. The reason is required
   *  and is the whole value of the declaration. */
  | { ranks: false; reason: string };

export const ANSWER_USE: Record<keyof EligibilityAnswers, AnswerUse> = {
  // ── Threaded to the ranker as a named input, and proved to move rows ─────
  //
  // This is exactly the set `tableInputFromAnswers` routes, plus the country.
  // It is also exactly where all four of the lost answers lived, which is not
  // a coincidence: a named input is a thing one call site can pass and another
  // can forget. The guard's failing claim is scoped here on purpose — if a key
  // is dropped from that mapping again, the field's `ranks: true` stops being
  // provable and the build goes red.
  ticketBand: { ranks: true, via: "awardScorer, as the `ticket` multiplier on every row's score in rowRelevance" },
  sector: { ranks: true, via: "sectorFit, which is (1 - wTheme) of every row's base score" },
  useOfFunds: { ranks: true, via: "objectiveScorer, in the within-regime sibling reassignment" },
  region: { ranks: true, via: "regionScorer, the one signal that separates leaves of one notified scheme delivered by many bodies" },
  consortium: { ranks: true, via: "tableInputFromAnswers -> consortiumOk -> the `demote` predicate in the row sort. 83 comparators on 54 instruments also reach gateFitScorer" },
  entityCountries: { ranks: true, via: "founderCountryList -> the establishment screen in selectInstrumentRows, then instrumentServesCountry on every leaf. The coarsest signal in the product: change the country and the whole table changes" },

  // ── Collected, and read by the eligibility screen ────────────────────────
  //
  // Not a lesser class. These are the SME-status, ownership, activity,
  // exclusion and commitment questions, and what they produce is a blocker
  // with a cure — "you fail this, here is what would change it" — which is the
  // part of the brief a founder can act on. A blocked fund is then dropped
  // from the table, so several of these DO change the five rows in practice.
  //
  // They are not declared `ranks: true` for a reason worth keeping: whether
  // any given one separates two funds depends on which instruments happen to
  // be in this founder's pool, so the observation flips as the corpus moves.
  // `check_answer_reach.ts` was watched doing exactly that — five of these
  // moved rows on one day's corpus and three on the next day's, with no code
  // change between. A claim the guard would fail the build on has to be a
  // claim about the code. So the strong claim stays with the named inputs
  // above, and these carry the weaker one the guard can actually hold: the
  // answer must be READ, by the screen or by an encoded rule.
  organisationType: { ranks: false, reason: "484 filter gates on 370 publishable instruments demand a constitutional kind, and none of them resolves to this field YET — the triage pass that would point them here writes to Railway Postgres and is awaiting approval. Declared `staged` in FIELD_REACH so no founder is asked it in the meantime" },
  activities: { ranks: false, reason: "611 comparators on 598 instruments — the largest encoded axis in the corpus, and it is an EXCLUSION axis: it blocks funds rather than ordering them" },
  exclusionFlags: { ranks: false, reason: "678 comparators on 626 instruments, the GBER and de minimis exclusions. Blocks rather than orders, and a blocked fund leaves the table" },
  lossesOverHalfCapital: { ranks: false, reason: "153 comparators. The undertaking-in-difficulty test: a hard bar on the screen, with no cure that is ours to offer" },
  fteBand: { ranks: false, reason: "147 comparators, the headcount half of the SME definition" },
  borrowerModel: { ranks: false, reason: "99 comparators, and pinned to 'operating' for every founder (see FIELD_REACH) — so it evaluates correctly and always the same way" },
  developmentStage: { ranks: false, reason: "63 comparators. TRL floors gate whole programmes rather than separating siblings of one regime" },
  cofinancingBand: { ranks: false, reason: "39 comparators. A co-financing floor is a condition of the same scheme for everyone who reaches it" },
  turnoverBand: { ranks: false, reason: "25 comparators, the turnover half of the SME definition" },
  nonEuControl: { ranks: false, reason: "17 comparators, mostly EDF and defence ownership conditions" },
  ownerOver25: { ranks: false, reason: "14 comparators, the linked-enterprise half of the SME test" },
  institutionalBacking: { ranks: false, reason: "12 comparators; it also feeds the memo's framing of what kind of raise this is" },
  bankRelationship: { ranks: false, reason: "8 comparators on guarantee instruments, where having a lender is a precondition to applying at all" },
  conditionality: { ranks: false, reason: "7 comparators. It is the founder's stated willingness, which belongs in the memo's advice rather than in a score" },
  balanceBand: { ranks: false, reason: "4 comparators, the balance-sheet half of the SME definition" },
  wouldOpenEntity: { ranks: false, reason: "4 comparators, and its real job is the CURE on an establishment blocker — it is what turns 'you are not eligible' into 'you would be, if'" },
  institutionalOwner: { ranks: false, reason: "2 comparators, the public-body half of the linked-enterprise test" },
  needBy: { ranks: false, reason: "2 comparators. Timing is served by the deadline and liveness layer (offerRoute.ts), not by the row sort" },

  // ── Nothing can answer these ────────────────────────────────────────────
  // Declared unreachable in FIELD_REACH, so they are out of check_answer_reach's
  // scope by construction and check_gate_field_reach owns them. Present because
  // the Record is exhaustive, and silence would be the wrong answer.
  activityCountries: { ranks: false, reason: "unreachable (FIELD_REACH): no control, no adaptive hint, no derivation. Its comparators were quarantined by workstream AX" },
  foundedYear: { ranks: false, reason: "unreachable (FIELD_REACH), and its specs mixed ages with calendar years in one numeric field. Quarantined by workstream AX" },
};

/** Fields resolved on the opening form — never re-asked adaptively.
 *  DERIVED from FIELD_REACH so the two cannot disagree; this was a second
 *  hand-maintained list of the same fact. */
export const FIRST_PAGE_FIELDS: ReadonlySet<string> = new Set(
  Object.entries(FIELD_REACH)
    .filter(([, r]) => r.via === "first_page")
    .map(([f]) => f),
);

/** The fixed founder-facing options for every EligibilityAnswers field that's
 *  deferred off the first page (Phase 3B) and eligible for the grounded
 *  adaptive round (Phase 3C) — excludes free-text/numeric fields
 *  (entityCountries, activityCountries, foundedYear), which stay out of this
 *  mechanism. The model picks WHICH fields to ask about and phrases the
 *  question from real gate text; it never invents the option labels — those
 *  come from here, so an answer is always a real, valid EligibilityAnswers
 *  value. Shared between the server (prompt/schema construction) and the
 *  client (rendering the picked answer). */
/**
 * A fixed answer set, and the question it actually answers.
 *
 * `stem` is not optional decoration. The adaptive round previously let the
 * model write the question while this table supplied the options, and nothing
 * checked the two agreed. A multi-select of things a founder might ACCEPT
 * (a local entity, the state on the cap table, job commitments) was published
 * under a yes/no question about whether they were prepared for a public
 * investor to take a board seat: the reader was asked one thing and offered
 * the answers to another.
 *
 * The stem now travels with the options, so both come from one place. The
 * model may tailor its wording to the company; it may not invent a different
 * question.
 *
 * `coveredBy` names a field whose own option set already captures this one.
 * Asking both spends two of a founder's few questions on one fact, which is
 * how a screen came to ask about accumulated losses twice.
 */
export const FIELD_ENUM_HINTS: Record<string, {
  multi: boolean;
  stem: string;
  coveredBy?: string;
  options: { value: string; label: string }[];
  /** Options that depend on what the founder already told us. Region is the
   *  only field where a fixed list is wrong: offering all 449 European regions
   *  to a French company is not a question anyone answers. Consumers must
   *  prefer this over `options` when present. */
  optionsFor?: (answers: EligibilityAnswers) => { value: string; label: string }[];
}> = {
  region: {
    multi: false,
    stem: "Which region is your company established in?",
    // Empty by design: a fixed list cannot be right here, and leaving it empty
    // means a consumer that has not been taught about optionsFor asks nothing
    // rather than asking something wrong.
    options: [],
    // entityCountries holds full English names ("France"), not ISO2 — the
    // region table is keyed by code, so the two must be reconciled here.
    // Without it regionOptions returned nothing and the question was never
    // asked, which is the silent kind of failure: no error, just a field that
    // quietly stops existing.
    optionsFor: (a) => regionOptions((a.entityCountries ?? []).map(toIso2).filter(Boolean)),
  },
  // These three moved off the first screen on 2026-07-29 when it shrank from
  // eleven questions to five. Without a hint entry the adaptive round SKIPS a
  // field entirely (see gateReach: `if (!FIELD_ENUM_HINTS[field]) continue`),
  // so demoting them without adding hints would have meant they were never
  // asked anywhere — silently discarding the three axes that carry most GBER
  // and de minimis exclusions. Options are derived from the same option lists
  // the form used, so the two can never disagree.
  activities: { multi: true,
    stem: "Which of these regulated activities does your company carry out?", options: ACTIVITY_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  useOfFunds: { multi: true,
    stem: "What would this funding actually pay for?", options: USE_OF_FUNDS_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  exclusionFlags: { multi: true,
    stem: "Do any of these apply to your company right now?", options: EXCLUSION_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  sector: { multi: false,
    stem: "Which of these best describes what your company builds?", options: SECTOR_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  consortium: { multi: false,
    stem: "Could you run this project with three or more partners, or only on your own?", options: [
    { value: "yes", label: "Yes, we could run a 3+ partner consortium" },
    { value: "no", label: "No, single applicant only" },
    { value: "unsure", label: "Not sure" },
  ] },
  cofinancingBand: { multi: false,
    stem: "How much of the project cost could you cover from your own resources?", options: [
    { value: ">50%", label: "Yes, more than half" },
    { value: "25-50%", label: "Yes, 25–50%" },
    { value: "<25%", label: "Below 25%" },
    { value: "unsure", label: "Not sure" },
  ] },
  conditionality: { multi: true,
    stem: "Which of these commitments would you be willing to make in exchange for funding?", options: [
    { value: "local_entity", label: "Opening a local entity" },
    { value: "geo_commitments", label: "Committing investment to a specific country" },
    { value: "state_shareholder", label: "The state on the cap table" },
    { value: "job_commitments", label: "Job-creation commitments" },
  ] },
  wouldOpenEntity: { multi: false,
    stem: "Would you open a legal entity in another country if it unlocked the right capital?", options: [
    { value: "yes", label: "Yes, if it unlocks the right capital" },
    { value: "depends", label: "Depends on the terms" },
    { value: "no", label: "No" },
  ] },
  // external: Commission Recommendation 2003/361/EC Art. 3 — 25% is the
  // linked/partner-enterprise threshold that decides SME status. Statutory.
  ownerOver25: { multi: false,
    stem: "Does any single shareholder own more than 25% of your company?", options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  institutionalOwner: { multi: false,
    stem: "Is an institutional investor or corporate on your cap table?", options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  // external: "majority-owned or controlled" is the ownership-and-control test
  // used by the EU FDI screening regulation (2019/452) and by the EDF's
  // eligibility rules. Statutory language, not a corpus quantity.
  nonEuControl: { multi: false,
    stem: "Is your company majority-owned or controlled from outside the EU?", options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  // external: the same GBER Art. 2(18)(a) undertaking-in-difficulty test as
  // EXCLUSION_OPTIONS above, asked as a question.
  lossesOverHalfCapital: { multi: false,
    stem: "Have your accumulated losses exceeded half of your share capital?",
    coveredBy: "exclusionFlags", options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  bankRelationship: { multi: false,
    stem: "Do you have a bank that would lend to you if the loan were guaranteed?", options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  institutionalBacking: { multi: false,
    stem: "Do you have VC or institutional investors backing you?", options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
  ] },
  needBy: { multi: false,
    stem: "When do you need the money?", options: [
    { value: "asap_weeks", label: "Weeks" },
    { value: "months_6", label: "Within 6 months" },
    { value: "months_18", label: "6–18 months" },
    { value: "flexible", label: "Flexible" },
  ] },
  turnoverBand: { multi: false,
    stem: "What is your annual turnover?", options: [
    { value: "<2M", label: "Under €2M" }, { value: "2-10M", label: "€2–10M" },
    { value: "10-50M", label: "€10–50M" }, { value: ">50M", label: "Over €50M" },
  ] },
  balanceBand: { multi: false,
    stem: "What is your balance-sheet total?", options: [
    { value: "<2M", label: "Under €2M" }, { value: "2-43M", label: "€2–43M" }, { value: ">43M", label: "Over €43M" },
  ] },
};

/** One question in a grounded adaptive round: the model picks which field
 *  (from the real open-gate evidence it was given) and phrases the question;
 *  the answer options always come from FIELD_ENUM_HINTS, never the model. */
export interface GroundedQuestion {
  field: string;
  question: string;
  /** What this answer decides, in fund terms. Shown under the question so six
   *  questions read as a diagnosis rather than a form. */
  stake?: string;
  /** Option labels written for THIS company, each mapped back to a real value
   *  from the field's enum. The words are tailored; the answer space is not.
   *  Absent when the model gave nothing usable, in which case the interface
   *  falls back to FIELD_ENUM_HINTS. */
  options?: { value: string; label: string }[];
}

/**
 * A question about the founder's actual PROJECT, phrased from one fund's
 * verbatim requirement text (brief_funnel_v2 Stage 2b).
 *
 * Unlike GroundedQuestion above, the model writes the options too — the whole
 * point is to ask something a fixed twelve-field vocabulary cannot express
 * ("is your technology at TRL 5-6 at entry?"). That is only safe because the
 * answer is stored in ProjectAnswer, never in EligibilityAnswers, and
 * computeVerdict() never reads it: a hallucinated option can degrade memo
 * prose, but it cannot flip a legal eligibility verdict.
 */
export interface ProjectQuestion {
  /** Stable id, so an answer can be matched back to the question. */
  id: string;
  question: string;
  /** What this answer decides, in fund terms. */
  stake?: string;
  /** 3-5 model-written options derived from the requirement text. The client
   *  always appends its own "None of these" and a free-text box. */
  options: string[];
  /** Citation anchors, carried through to the writer. */
  instrumentId: string;
  instrumentName: string;
  gateKey: string;
  /** Verbatim requirement text the question was phrased from. */
  quote: string;
  locator?: string;
  /** wsCD: this question has no fixed answer set and is answered in the
   *  founder's own words. The interface renders a text box instead of options,
   *  and `options` is empty by construction. */
  openText?: boolean;
  /** wsCD: the judgement key (normalised requirement text) the answer will be
   *  read against. Present only on open questions. */
  openKey?: string;
}

/** A founder's answer to one ProjectQuestion. Writer context and ease-scoring
 *  input only — deliberately NOT part of EligibilityAnswers. */
/** questionId prefix marking an answer as coming from the commercial half of
 *  round 2 rather than from a fund's requirement text. The split matters at
 *  read time: these answers may shape positioning and never eligibility. */
export const COMMERCIAL_ANSWER_PREFIX = "commercial::";

/** questionId prefix marking an answer as prose written against a requirement
 *  no comparator can decide (wsCD). Like the commercial prefix, the split
 *  matters at read time: these are judged by a model and may only ever reorder
 *  siblings, never decide a legal eligibility verdict. */
export const OPEN_ANSWER_PREFIX = "open::";

export interface ProjectAnswer {
  questionId: string;
  question: string;
  answer: string;
  instrumentId: string;
  instrumentName: string;
  gateKey: string;
  quote: string;
  locator?: string;
  /** wsCD: set on prose answers, so the judge knows which verbatim
   *  requirement to read this against without re-deriving it from the text. */
  openKey?: string;
}

/** One themed adaptive round — Phase 3C generates exactly one at a time,
 *  grounded in the founder's actual candidate-instrument shortlist. Carries
 *  both halves of the brief_funnel_v2 panel: `questions` closes generic
 *  eligibility gates (fixed enums), `projectQuestions` asks about the project
 *  itself (model-written options). */
export interface GroundedRound {
  theme: string;
  questions: GroundedQuestion[];
  projectQuestions?: ProjectQuestion[];
}

/** The selectable capital types the founder can ask for. Order = display order. */
/**
 * The ORDERED bands. Order is meaning here, not presentation: band_max and
 * band_min specs are evaluated by position, so reordering one of these
 * silently changes what every rule using it decides.
 *
 * They used to live as private consts in sanitize.ts and were hand-copied into
 * ETL/terms/encode_gates.py under a "keep in sync" comment. They are exported
 * from one place now and projected to the ETL as generated JSON — see
 * vocabulary.ts.
 */
export const FTE_BANDS = ["1-9", "10-49", "50-249", "250+"] as const;
export const TURNOVER_BANDS = ["<2M", "2-10M", "10-50M", ">50M"] as const;
export const BALANCE_BANDS = ["<2M", "2-43M", ">43M"] as const;
export const COFINANCING_BANDS = ["<25%", "25-50%", ">50%"] as const;
export const DEVELOPMENT_STAGES = ["research", "prototype", "pilot_customers", "scaling_revenue"] as const;
export const NEED_BY_BANDS = ["asap_weeks", "months_6", "months_18", "flexible"] as const;
export const CONDITIONALITY_VALUES = ["local_entity", "geo_commitments", "state_shareholder", "job_commitments"] as const;

export const CAPITAL_OPTIONS = [
  { value: "grant", label: "Grants", hint: "non-dilutive, no payback" },
  { value: "loan", label: "Loans & guarantees", hint: "debt, repayable, no equity" },
  { value: "recoverable_advance", label: "Recoverable advances", hint: "repay only if it works" },
  { value: "equity", label: "Equity & blended finance", hint: "capital for a stake: dilutive" },
  { value: "tax_credit", label: "Tax credits & reliefs", hint: "R&D credits, payroll relief" },
] as const;

export type CapitalType = (typeof CAPITAL_OPTIONS)[number]["value"];

/** The pieces of the report that are code-computed and known well before the
 *  writer model call resolves (self footprint, eligibility screen, the 5
 *  institution rows minus their model-written whyEligible/nextStep). Streamed
 *  early so the client can show real content during generation instead of
 *  narration — see synthesize() in pipeline.ts. */
export interface PartialReport {
  self: SelfRecord;
  eligibilityScreen: EligibilityCheck[];
  institutions: InstitutionEntry[];
  /** Carried on the PREVIEW as well as the finished brief. The preview table
   *  is on screen for the two to three minutes the writer takes, which is long
   *  enough for a reader to count the rows and conclude that is the answer. */
  withheld?: WithheldNotice;
}

/** Server-sent progress event streamed to the client. */
export type ProgressEvent =
  | { type: "status"; step: PipelineStep; detail?: string }
  | { type: "partial"; data: PartialReport }
  | { type: "report"; data: IntelligenceReport }
  | { type: "error"; message: string };

export type PipelineStep =
  | "discovering"
  | "querying_db"
  | "researching"
  | "generating"
  | "done";
