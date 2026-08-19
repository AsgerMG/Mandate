// WHO the harness replays, field by field — and what it deliberately withholds.
//
// ── The defect this exists to remove ───────────────────────────────────────
// Every recall pair is a real company that won a real fund, and until now the
// harness answered the intake FOR that company out of a literal:
//
//     computeVerdict("TestCo", t.country, {
//       entityCountries: [t.country], sector: t.sector ?? "other",
//       activities: ["none"], borrowerModel: "operating",
//       ticketBand: "b500k_2m5", consortium: "yes",
//       useOfFunds: ["industrial_research", "experimental_development"],
//     }, { targetMarkets: [t.country], capitalSought: ["grant", "loan"], ... })
//
// That literal was inlined in `check_recall_floor.ts` — the gate that fails the
// build — so the shared `answersFor` resolver existed and the gate could not
// reach it. Three consequences, each of which has published a wrong number:
//
//   * 18 of the 23 askable intake fields were NEVER SUPPLIED AT ALL, including
//     `organisationType` and `fteBand`. No arm of the harness could supply
//     them, so no measurement of them was possible.
//   * `capitalSought: ["grant","loan"]` is a FILTER, not a preference.
//     `instrumentServesCapital` removes every tax-credit and equity instrument
//     before anything ranks. It accounted for 100% of autopsy bucket 2 and 22
//     of 30 "missing from pool" cases, and was reported to the owner as a
//     CORPUS gap. It was our own test declining funds on its own behalf.
//   * `"TestCo"` matches nothing, so `matchCompany` returns unmatched, there is
//     no subsector, there are no peers, and `usedInField` — TIER 1 OF THE ROW
//     SORT, ABOVE THE ENTIRE SCORE — was false on 0 of 3,810 rows. Live in
//     production, dark in every EXACT@5 this repo has ever published.
//
// So the ceiling everything is being optimised against, 91.6%, is the ceiling
// for a founder who does not exist.
//
// ── The rule, which is the same rule the description already obeys ─────────
// A field may be supplied to a replayed founder only if the value CANNOT have
// been read off the award being predicted. Two historical leaks set the
// standard and both were found late: 87% of descriptions sat inside the won
// fund's own project titles, and 1,573 of 1,920 began with the instrument's
// own name. A number that rises because of a leak is worse than no number.
//
// So every field of `EligibilityAnswers` carries a DECLARED disposition below,
// with its source and its leak argument, and the harness prints which were
// supplied and which were withheld on every run. A field with no honest source
// is WITHHELD AND SAID SO — never pinned to a constant quietly, which is what
// `capitalSought` was.
//
// ── The SECOND rule, and it is not the same rule ───────────────────────────
// Leak-freeness says nothing about whether the question is asked. On
// 2026-08-12 this file answered `organisationType` — honestly derived, sound
// leak argument, still sound — for every founder whose registered name carries
// a legal-form designator, while the control that collects it renders only
// behind an arm that is off. 215 cited, STRUCTURAL gates then evaluated
// correctly against an answer no real founder can give, and 4.0 points of
// accessible-pool recall were charged to exclusions that cannot happen.
//
//     A replayed founder may carry a value for a field only if production
//     can put a value in that field for a real founder.
//
// `productionCannotPopulate` is that rule, read off `FIELD_REACH` rather than
// off a list here, and `founderIntake` holds back anything it refuses. See
// lib/intelligence/fieldReach.ts for the test that decides an unseen field.
//
// ── Why this is a property and not a register ─────────────────────────────
// `INTAKE_SOURCE` is keyed on `keyof EligibilityAnswers`, so the compiler
// refuses a new intake field until somebody has written down where a replayed
// founder's answer to it comes from and why it cannot leak. No fund, country,
// sector or instrument id appears here or in any disposition.
import { FIELD_REACH } from "../lib/intelligence/types";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import {
  productionCannotPopulate, unofferableValues, unpopulatedNote,
} from "../lib/intelligence/fieldReach";
import type { UnpopulatedReason } from "../lib/intelligence/fieldReach";
import { prefillOrganisationType } from "../lib/intelligence/organisationType";
import { panelContract } from "../lib/intelligence/__founderPath";
import { answersFor, CONSTANT_ANSWERS } from "./recallSet";
import type { AnswerMode, RecallRow } from "./recallSet";

export type IntakeField = keyof EligibilityAnswers;

/** ── THE SAME RULE FOR THE REQUEST, NOT THE ANSWERS ────────────────────────
 *
 *  `FIELD_REACH` is keyed on `keyof EligibilityAnswers`, so no predicate built
 *  on it can say anything about a `computeVerdict` OPTION. `targetMarkets` was
 *  exactly that blind spot: sent by this resolver on every replayed row and by
 *  `basePayload()` on none, for as long as the resolver has existed. It is now
 *  gone from the product altogether (wsIK), and this rule is what stops the
 *  next one — it names no field, so a knob added tomorrow is in scope.
 *
 *      A replayed founder's REQUEST may carry only what the panel's own
 *      payload can carry.
 *
 *  `panelContract()` READS `basePayload` out of panel.tsx rather than
 *  transcribing it, so a key the panel starts sending is allowed here on the
 *  next run and a key it stops sending is refused on the next run, with no
 *  edit. The only declaration below is of the knobs that are not request
 *  fields at all — a harness POLICY is not an answer, and there is no founder
 *  who could send one.
 */
const HARNESS_POLICY_OPTS: ReadonlySet<string> = new Set(["ownHistory"]);

/** Empty is not an answer. `[]` on a preference is the neutral value the
 *  product itself reads for a founder who has not ruled anything out, so it
 *  carries no claim and needs no payload key. */
const carriesAnAnswer = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";

/** What the form can send, read out of the form. */
let payloadKeysCache: Set<string> | undefined;
const panelPayloadKeys = (): Set<string> =>
  (payloadKeysCache ??= new Set(panelContract().payloadKeys));

/** WHERE a replayed founder's answer comes from, and why it cannot be the
 *  answer to the question being asked. One of five dispositions:
 *
 *   derived   a fact we hold about THIS COMPANY, with a leak argument.
 *   pinned    a constant, identical for every founder in the population. A
 *             constant is leak-free by construction — it cannot carry
 *             information about which scheme won — but it is still an ANSWER,
 *             and one that filters is not neutral. Every pin carries what it
 *             costs.
 *   withheld  we hold nothing that can answer it without leaking. Left unset,
 *             counted, and printed, so the gap is on screen rather than
 *             replaced by a constant nobody chose.
 *   staged    we CAN answer it, leak-free, and production does not ask it yet:
 *             `FIELD_REACH` declares the field `staged` behind an arm that is
 *             off. Held back while the arm is off and handed over the moment
 *             it goes on, with no edit here. This is the disposition that did
 *             not exist when `organisationType` was answered for 42% of the
 *             set against gates no founder can trip — the taxonomy could say
 *             "we can answer it" and could say "we cannot", and had no way to
 *             say "we can, and the product is not asking".
 *   n/a       not one a founder is ever asked (FIELD_REACH says `unreachable`
 *             or `constant`).
 *
 *  The first three are about LEAKAGE, `staged` is about PRODUCTION REACH, and
 *  the two are independent — which is why one honest disposition on each axis
 *  is required rather than one verdict covering both.
 */
export type IntakeDisposition =
  | { supply: "derived"; from: string; leak: string }
  | { supply: "pinned"; leak: string; cost: string }
  | { supply: "withheld"; why: string }
  | { supply: "staged"; from: string; leak: string; whenOn: string }
  | { supply: "n/a"; why: string };

export const INTAKE_SOURCE: Record<IntakeField, IntakeDisposition> = {
  // ── DERIVED from what the register states about the COMPANY ──────────────
  sector: {
    supply: "derived",
    from: "companies.sector_top, carried on the recall row",
    leak: "NACE describes the BENEFICIARY's own economic activity, not the aid "
      + "measure's. It is recorded per company and is the same value whichever "
      + "award the row is drawn from, so it cannot single out one leaf of a "
      + "scheme; `sectorFit` scores a fund's sector mix against it, and every "
      + "sibling of a regime shares that mix.",
  },
  entityCountries: {
    supply: "derived",
    from: "companies.country, carried on the recall row",
    leak: "where the company is established. A property of the company held "
      + "before any award, and already supplied by every run this repo has "
      + "published.",
  },
  ticketBand: {
    supply: "derived",
    from: "the median award this company received UNDER A DIFFERENT NOTIFIED "
      + "SCHEME (`answerTicketSource = other_scheme`), via answersFor",
    leak: "the `other_scheme` guard excludes the won scheme's own awards, so "
      + "the band cannot be the size of the cheque being predicted. Under "
      + "ANSWERS=real the guard relaxes to `own_award` and the value CAN be "
      + "read off the won award — which is why `strict` is the default here.",
  },
  region: {
    supply: "derived",
    from: "the register's beneficiary region on an award under a DIFFERENT "
      + "notified scheme (`regionSource = other_scheme`), via answersFor",
    leak: "same `other_scheme` guard, established by "
      + "ETL/terms/repair_recall_attribution.py. A region read off the won "
      + "award's own register row would name the delivering body's catchment, "
      + "which is exactly what `regionScorer` separates siblings on.",
  },
  // ── STAGED: derivable, leak-free, and not a question production asks ──────
  organisationType: {
    supply: "staged",
    from: "prefillOrganisationType(company name) — production's own classifier, "
      + "reading the multilingual legal-form designator in the name",
    leak: "the input is the company's NAME STRING and nothing else. No award, "
      + "no channel, no instrument and no register row is consulted, so there "
      + "is no path by which the won fund could reach it. The leak argument is "
      + "sound and always was; it is not the argument that failed here.",
    whenOn: "On 2026-08-12, 215 organisationType filter gates were encoded with "
      + "value specs, every one of them llm_cited — and organisationType is "
      + "STRUCTURAL, so ONE of them conclusively removes a fund. The arm that "
      + "renders the control is off, so `evaluateSpec` reads null for every "
      + "real founder and none of those 215 gates can fire for anyone. The "
      + "harness answered it anyway, and 33 of 820 held-out described founders "
      + "— 4.0 points of accessible-pool recall (wsGE) — lost their own fund to "
      + "a question the product does not ask. Held back from 2026-08-13. It "
      + "flows again on the run after the arm goes on, and on that run the "
      + "gates it meets are gates a real founder meets too.",
  },

  // ── PINNED, uniform across the population, and each one says what it costs ─
  useOfFunds: {
    supply: "pinned",
    leak: "uniform across every founder, so it cannot carry which scheme won. "
      + "Deriving it is what would leak: the only source is the register's "
      + "`objectives_text`, a statement about the SCHEME, and `objectiveScorer` "
      + "ranks on that same field — the objective signal would grade itself, "
      + "the shape of the project-title leak that read 90% and was really 10%.",
    cost: "59 hard filters turn on it. Every founder is replayed as an R&D "
      + "applicant, so a scheme registered for plant or renewables is ranked "
      + "below its research siblings for all of them alike.",
  },
  activities: {
    supply: "pinned",
    leak: "uniform. `none` is the truthful answer for the great majority of "
      + "companies and it is the permissive one, so it removes no fund.",
    cost: "611 comparators, an EXCLUSION axis. Pinning the permissive value "
      + "means the harness never exercises a regulated-activity block.",
  },
  consortium: {
    supply: "pinned",
    leak: "uniform. Nothing in the register states whether a company would run "
      + "a consortium; the participation record is award data and deriving it "
      + "would read the won award.",
    cost: "asked in the ADAPTIVE round, so on the instant path no real founder "
      + "has answered it. CONSORTIUM=none replays that founder and is the only "
      + "way to see what the unanswered case costs.",
  },

  // ── WITHHELD: no honest source, said out loud rather than pinned ──────────
  //
  // Read as a list of what the corpus cannot tell us about a company. It is
  // the single largest gap in this harness after identity, and it is why an
  // arm that measures the SME axis or the maturity axis does not exist.
  fteBand: {
    supply: "withheld",
    why: "we hold no headcount for any company. `companies.entity_type` names "
      + "a KIND (company / research_org / other), never a size, and inventing "
      + "a band from it would be a guess graded as a fact. 147 comparators "
      + "stay dark.",
  },
  turnoverBand: {
    supply: "withheld",
    why: "no filed accounts anywhere in the corpus. 25 comparators stay dark.",
  },
  balanceBand: {
    supply: "withheld",
    why: "no filed accounts anywhere in the corpus. 4 comparators stay dark.",
  },
  developmentStage: {
    supply: "withheld",
    why: "no TRL or maturity fact about a company. The only proxy — which "
      + "programmes it has won — is award data and would read the answer.",
  },
  cofinancingBand: {
    supply: "withheld",
    why: "aid intensity is a property of the SCHEME, not of the applicant's "
      + "willingness to co-finance. Deriving it from the won award's intensity "
      + "would let the intensity signal grade itself.",
  },
  institutionalBacking: {
    supply: "withheld",
    why: "derivable in principle from `private_funding_events` — a source no "
      + "public award appears in, so it could not leak — but that table is not "
      + "in `public/data/companies_index.json`, the one committed artifact this "
      + "resolver may read. A build gate may not depend on gitignored data. "
      + "12 comparators; the honest fix is upstream in the index build.",
  },
  bankRelationship: {
    supply: "withheld",
    why: "nothing in the corpus states whether a company has a lender.",
  },
  ownerOver25: {
    supply: "withheld",
    why: "no ownership or shareholding data. The linked-enterprise half of the "
      + "SME test cannot be answered for anyone.",
  },
  institutionalOwner: {
    supply: "withheld",
    why: "no ownership data. See ownerOver25.",
  },
  nonEuControl: {
    supply: "withheld",
    why: "no ultimate-control data. Note the corpus is Europe-scoped, so "
      + "answering `no` for everyone would look right and would be an "
      + "assumption, not a fact.",
  },
  lossesOverHalfCapital: {
    supply: "withheld",
    why: "derived by sanitizeEligibility from exclusionFlags, which is itself "
      + "withheld. No accounts, so the undertaking-in-difficulty test cannot "
      + "be answered.",
  },
  exclusionFlags: {
    supply: "withheld",
    why: "the GBER and de minimis exclusions are self-declared and nothing in "
      + "the register records them for a beneficiary. Pinning `none` would be "
      + "an ANSWER — the permissive one — asserted on behalf of 7,095 "
      + "companies we have not asked.",
  },
  conditionality: {
    supply: "withheld",
    why: "a stated willingness, not a fact. Nothing states it.",
  },
  wouldOpenEntity: {
    supply: "withheld",
    why: "a stance about the future. Its job is the CURE on an establishment "
      + "blocker, and the harness grades retrieval, not advice.",
  },
  needBy: {
    supply: "withheld",
    why: "a founder's own timing. The award's grant date is when the money "
      + "arrived, not when they needed it, and it is on the won award.",
  },

  // ── Not among the 23 a founder is ever asked ─────────────────────────────
  borrowerModel: {
    supply: "n/a",
    why: "FIELD_REACH `constant`: panel.tsx pins `operating` for every founder "
      + "in production too, so the harness pins the same value and the two "
      + "agree by construction.",
  },
  activityCountries: {
    supply: "n/a",
    why: "FIELD_REACH `unreachable`: no control, no hint, no derivation. Its "
      + "comparators were quarantined by workstream AX.",
  },
  foundedYear: {
    supply: "n/a",
    why: "FIELD_REACH `unreachable`, and worse than inert — its specs mix ages "
      + "with calendar years in one numeric field.",
  },
};

/** The fields a founder can actually be asked. DERIVED from FIELD_REACH, never
 *  restated: a field that becomes reachable is in scope on the next compile,
 *  and one that is quarantined leaves it, with no edit here. */
export const ASKABLE_FIELDS: readonly IntakeField[] =
  (Object.keys(FIELD_REACH) as IntakeField[])
    .filter((f) => FIELD_REACH[f].via !== "unreachable" && FIELD_REACH[f].via !== "constant")
    .sort();

/** Every field, askable or not — the surface a harness could put a value on. */
export const ALL_INTAKE_FIELDS: readonly IntakeField[] =
  (Object.keys(INTAKE_SOURCE) as IntakeField[]).sort();

/** Askable AND actually asked: the staged half removed while its arm is off.
 *  Derived from the same predicate the resolver enforces, so the disclosure
 *  and the behaviour cannot disagree. */
export const ASKED_FIELDS: readonly IntakeField[] =
  (ASKABLE_FIELDS as IntakeField[]).filter((f) => productionCannotPopulate(f) === null);

// ── The three tables must say the same thing ──────────────────────────────
// A disposition of `n/a` must agree with FIELD_REACH that nothing asks the
// field; a disposition of `staged` must agree that production is staging it;
// and anything else must agree the field is asked today.
//
// ██ THE MIDDLE CLAUSE IS THE ONE THAT WAS MISSING, AND ITS ABSENCE DID NOT
// MERELY ALLOW THE DEFECT — IT REQUIRED IT. ██ The old check read `askable ===
// na` over an `ASKABLE_FIELDS` that filters only `unreachable` and `constant`,
// so a `staged` field counted as askable and the check then REFUSED the one
// honest disposition available (`n/a`), leaving `derived`, `pinned` or
// `withheld`. Two of those three hand the value over. A guard that leaves no
// way to state the truth gets a false statement.
//
// It runs at import, so no harness can start on a resolver that disagrees with
// itself.
for (const f of ALL_INTAKE_FIELDS) {
  const declared = INTAKE_SOURCE[f].supply;
  const via = FIELD_REACH[f].via;
  const want = via === "staged" ? "staged"
    : (ASKABLE_FIELDS as IntakeField[]).includes(f) ? "asked" : "n/a";
  const got = declared === "n/a" ? "n/a" : declared === "staged" ? "staged" : "asked";
  if (got !== want) {
    throw new Error(
      `founderIntake: INTAKE_SOURCE.${f} says "${declared}" but FIELD_REACH says `
      + `via="${via}". A field is asked, staged, or out of reach, and the two `
      + `tables must say the same thing.`);
  }
}

/** ── IDENTITY: the leak that made this workstream hard ─────────────────────
 *
 *  `usedInField` is tier 1 of the row sort — it is compared BEFORE the score,
 *  so a single true flips a fund above everything below it. It is set from
 *
 *      fieldChannels = selfRecord.channels  ∪  peer channels
 *
 *  and `selfRecord.channels` is THIS COMPANY'S OWN TRACED AWARD HISTORY, which
 *  contains the award being predicted. Replaying the real company name with
 *  that history switched on hands the ranker the answer, at the one place in
 *  the ordering where an answer is worth most. `"TestCo"` was chosen to avoid
 *  exactly that, and it avoided it by turning the whole signal off.
 *
 *  ── Why the obvious repair is the WRONG one ───────────────────────────────
 *  Removing only the won fund's channel from the founder's history is the
 *  `capitalSought` mistake in a new place. Excluding the won thing does not
 *  make the answer NEUTRAL about it, it makes it ANTI-CORRELATED: the one
 *  channel guaranteed absent from the founder's history would be the channel
 *  the pair exists to find, and tier 1 would sort the right answer DOWN.
 *
 *  ── What is supplied instead ──────────────────────────────────────────────
 *    real name + own history WITHHELD.
 *  The name resolves in `companies_index.json`, so the founder has their real
 *  subsector, and `findPeersBySubsector` returns real peers — which already
 *  exclude the founder by name. `usedInField` is then set from OTHER
 *  COMPANIES' awards and never from this founder's. That is one step further
 *  removed than the `other_scheme` guard the ticket and region answers use:
 *  not merely a different scheme, a different company.
 *
 *  It is also exactly what production does for a founder who is not in the
 *  corpus, which is most startups — so the arm that ships and the arm that is
 *  measured are the same code on the same signal.
 *
 *  `OWN_HISTORY=corpus` restores the leak deliberately, for measuring it. It
 *  is never a headline. */
export type IdentityMode = "real" | "anonymous";
export type OwnHistoryMode = "withheld" | "corpus";
export type CapitalMode = "withheld" | "pinned";

/** The name a replay that must not resolve uses. Kept as a constant so the old
 *  behaviour stays reproducible under `IDENTITY=anonymous`. */
export const ANONYMOUS_FOUNDER = "TestCo";

export interface FounderPolicy {
  identity: IdentityMode;
  ownHistory: OwnHistoryMode;
  capital: CapitalMode;
  answers: AnswerMode;
  /** undefined = the founder has not been asked (the instant path). */
  consortium?: "yes" | "no" | "unsure";
  /** REGION= supplies a region outside `answersFor`; kept so the existing A/B
   *  knob still works and so the disclosure counts what was ACTUALLY handed
   *  over, from either source. */
  regionOverride?: (r: RecallRow) => string | undefined;
  /** ── HOW MUCH THE FOUNDER TYPED (wsIT) ────────────────────────────────
   *
   *  `THEME_WEIGHT = 0.6` and the theme cosine is taken against the free-text
   *  box, so the box is the largest single term in the score. Two constants
   *  claim to know where it stops paying — `USEFUL_DESCRIPTION_CHARS = 60`
   *  ("shortest description that actually SEPARATES funds") and
   *  `MIN_MATCHABLE_DESCRIPTION_CHARS = 12` — and NEITHER has ever been
   *  measured on the funnel. The evidence behind the first is
   *  `measure_description_lift.ts`, which ranks through `computeVerdict` (not
   *  the memo path) on `__recallSetEnriched.json` (a RETIRED set).
   *
   *  An OBSERVATIONAL length curve cannot settle it: description length is
   *  almost perfectly confounded with provenance here — a recovered project
   *  title is ~90 characters and a recovered summary runs to the cap — and
   *  provenance is confounded with regime, country and company size in turn.
   *  So the same founder is asked twice, and the only difference is how much
   *  of what they said we keep.
   *
   *  `full` is the shipped behaviour and the default. A number is a CAP in
   *  characters, applied at a word boundary the way `rebuild_recall_descriptions`
   *  truncates, because a founder does not stop typing mid-word. `template`
   *  replaces the text with the canned sector sentence a founder who SKIPS the
   *  box is represented by — the founder-facing arm, since skipping is a thing
   *  a real founder does and borrowing another award's prose is not.
   *
   *  This only ever REMOVES text. It cannot tell us what a longer answer than
   *  the one on file would be worth, and no run under it should be read as
   *  though it could. */
  description: "full" | "template" | { capChars: number };
}

const oneOf = <T extends string>(name: string, v: string | undefined, allowed: readonly T[], dflt: T): T => {
  if (v === undefined) return dflt;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`${name} must be one of ${allowed.join("|")}, got "${v}"`);
  }
  return v as T;
};

/** The policy every harness runs under, read once from the environment.
 *
 *  DEFAULTS ARE THE LEAK-FREE ONES, and that is the whole point: a harness
 *  written tomorrow that forgets to set anything measures the real founder
 *  with the leak off, rather than "TestCo" with a pinned filter. */
export function founderPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): FounderPolicy {
  const consortium = oneOf("CONSORTIUM", env.CONSORTIUM, ["yes", "no", "unsure", "none"] as const, "yes");
  return {
    identity: oneOf("IDENTITY", env.IDENTITY, ["real", "anonymous"] as const, "real"),
    ownHistory: oneOf("OWN_HISTORY", env.OWN_HISTORY, ["withheld", "corpus"] as const, "withheld"),
    capital: oneOf("CAPITAL", env.CAPITAL, ["withheld", "pinned"] as const, "withheld"),
    // `strict` and not `real`: only values derived from an award under a
    // DIFFERENT notified scheme. `real` relaxes both ticket and region to
    // `own_award`, which CAN be read off the fund being predicted.
    answers: oneOf("ANSWERS", env.ANSWERS,
      ["off", "real", "strict", "ticket", "capital"] as const, "strict") as AnswerMode,
    consortium: consortium === "none" ? undefined : consortium,
    description: parseDescriptionPolicy(env.DESCRIPTION),
  };
}

/** `DESCRIPTION=full|template|<chars>`. Default `full` — the shipped behaviour,
 *  so a harness that sets nothing measures the founder as the product has them. */
export function parseDescriptionPolicy(v: string | undefined): FounderPolicy["description"] {
  if (v === undefined || v === "full") return "full";
  if (v === "template") return "template";
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`DESCRIPTION must be full|template|<positive integer chars>, got "${v}"`);
  }
  return { capChars: n };
}

/** To a character cap at a word boundary, never mid-word.
 *
 *  The same rule `ETL/terms/rebuild_recall_descriptions.py:truncate` applies at
 *  `MAX_DESCRIPTION_CHARS`, and for the same reason: the embedding is what reads
 *  the string, and half a word is not what a founder would have typed. The
 *  boundary is only moved back when there is a space reasonably near the cut, so
 *  a cap of 20 on a single long token still yields 20 characters rather than
 *  nothing. */
export function capAtWord(text: string, limit: number): string {
  const t = text.trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  // `lastIndexOf` returns -1 when the cut contains no space at all, and -1 is
  // greater than `limit - 120` for every cap under 120 — so the naive form
  // silently dropped the last character of every short cap. Caught by
  // `descriptionPolicy.test.ts` before a single arm was run.
  const space = cut.lastIndexOf(" ");
  return (space > 0 && space > limit - 120 ? cut.slice(0, space) : cut)
    .replace(/[ ,;:-]+$/, "");
}

export interface ReplayedFounder {
  company: string;
  country: string;
  eligibility: EligibilityAnswers;
  opts: {
    capitalSought: string[];
    description?: string;
    ownHistory: OwnHistoryMode;
  };
  /** The askable fields this row actually carried a value for. */
  supplied: IntakeField[];
  /** ── The distinction a single "supplied" count destroys ─────────────────
   *  `answersFor` falls back to `CONSTANT_ANSWERS.ticketBand` for a founder it
   *  cannot derive a band for, on purpose: the denominator must not move with
   *  the answer mode. So `ticketBand` is PRESENT on 100% of rows and derived
   *  from this company on far fewer, and a disclosure reporting only the first
   *  would say "100% derived" about a field that is mostly the old constant
   *  wearing a new label. That is the failure `measure_recall`'s own
   *  `founder-specific answers supplied:` line was added to prevent, and it
   *  belongs in the shared disclosure rather than in one harness. */
  ownAnswer: IntakeField[];
  /** Fields this founder COULD have carried and did not, because production
   *  cannot put a value there today. Counted rather than dropped: a value
   *  quietly not handed over is the same kind of invisible as one quietly
   *  handed over, and this file exists because of the second one. */
  heldBack: { field: IntakeField; reason: UnpopulatedReason }[];
}

/** One replayed founder, built ONLY from declared dispositions.
 *
 *  Every harness that replays a recall pair goes through here.
 *  `check_harness_intake.ts` fails the build on one that does not, because the
 *  defect this file repairs was precisely a second copy of the intake living
 *  in the gate. */
/** The free-text box as this policy hands it over.
 *
 *  `full` is `r.description || r.selfDescription` — the shipped fallback chain,
 *  in which a founder with nothing on file is already represented by the canned
 *  sector sentence. `template` forces that fallback for EVERYONE, which is what
 *  makes it the arm for "the founder skipped the box". */
function describedAs(r: RecallRow, p: FounderPolicy): string | undefined {
  const template = r.selfDescription || undefined;
  if (p.description === "template") return template;
  const own = r.description || template || undefined;
  if (p.description === "full" || !own) return own;
  return capAtWord(own, p.description.capChars) || undefined;
}

export function founderIntake(r: RecallRow, p: FounderPolicy): ReplayedFounder {
  const a = answersFor(r, p.answers);
  const region = p.regionOverride?.(r) ?? a.region;
  const org = p.identity === "real" ? prefillOrganisationType(r.name) : null;

  // Built in full first, then filtered through the production-reach rule below.
  // Written this way ON PURPOSE: the answer we WOULD give and the answer we
  // ARE ALLOWED to give are different facts, the run reports both, and a field
  // held back appears as a held-back field rather than as an absence nobody
  // can tell from "we never had one".
  const draft: EligibilityAnswers = {
    // derived
    sector: r.sector ?? "other",
    entityCountries: [r.country],
    // `answersFor` falls back to CONSTANT_ANSWERS.ticketBand when this founder
    // has no leak-free band, so the DENOMINATOR never changes with the answer
    // mode — a founder we cannot derive for keeps the constant rather than
    // leaving the population.
    ticketBand: a.ticketBand as EligibilityAnswers["ticketBand"],
    ...(region ? { region } : {}),
    ...(org ? { organisationType: org } : {}),
    // pinned
    useOfFunds: ["industrial_research", "experimental_development"],
    activities: ["none"],
    ...(p.consortium ? { consortium: p.consortium } : {}),
    // n/a — production pins it too
    borrowerModel: "operating",
    // Everything else is WITHHELD. Not written, not defaulted, and counted
    // below so the run says how much of the intake it left blank.
  };

  // ── THE PRODUCTION-REACH RULE, applied to whatever the draft holds ────────
  // Not "delete organisationType when the arm is off". Every key actually
  // present is put to `productionCannotPopulate`, so a field added next month
  // is covered the day someone writes its disposition, and a field whose arm
  // flips is covered on the next run with no edit here.
  //
  // The two refusals are not the same and are not treated the same. A STAGED
  // field is an answer whose time has not come: held back, counted, printed.
  // An UNREACHABLE field is an applicant we invented — production has no path
  // to it at all, so no run can be right about it — and that is a coding
  // mistake, which throws.
  const eligibility = draft as Record<string, unknown>;
  const heldBack: { field: IntakeField; reason: UnpopulatedReason }[] = [];
  for (const f of Object.keys(eligibility) as IntakeField[]) {
    if (eligibility[f] === undefined) continue;
    const reason = productionCannotPopulate(f);
    if (!reason) continue;
    if (reason.why === "unreachable") {
      throw new Error(
        `founderIntake: refusing to answer ${f} — ${unpopulatedNote(f, reason)}. `
        + "A replayed founder who carries a value production can never carry is "
        + "not a founder, and every stage measured below it inherits the error.");
    }
    delete eligibility[f];
    heldBack.push({ field: f, reason });
  }
  // ── THE SAME RULE ONE LEVEL DOWN ─────────────────────────────────────────
  // A field production asks can still be handed an answer its control never
  // offers, and a gate that fires on THAT is just as impossible. Run second,
  // because the menu for a field can depend on an earlier answer and the
  // earlier answers are only final once the pass above has finished.
  for (const f of Object.keys(eligibility) as IntakeField[]) {
    const v = eligibility[f];
    if (v === undefined) continue;
    const off = unofferableValues(f, v, draft);
    if (!off.length) continue;
    const keep = Array.isArray(v) ? v.filter((x) => !off.includes(x as string)) : [];
    // A list keeps the answers that ARE on the menu — dropping the whole list
    // would replace one impossible answer with a different one. A scalar has
    // nothing to keep and joins the withheld.
    if (Array.isArray(v) && keep.length) eligibility[f] = keep;
    else delete eligibility[f];
    heldBack.push({ field: f, reason: { why: "unofferable_value", values: off } });
  }
  const held = new Set(heldBack.map((h) => h.field));

  const founder: ReplayedFounder = {
    company: p.identity === "real" ? r.name : ANONYMOUS_FOUNDER,
    country: r.country,
    eligibility: draft,
    opts: {
      // ── THE SECOND FIELD PRODUCTION NEVER POPULATED, NOW DELETED ─────────
      // This sent `targetMarkets: [the founder's own country]` on every
      // replayed row while `basePayload()` sent it on none. wsGP set it to the
      // production value `[]`; wsIK removed the field from
      // `IntelligenceRequest`, from all three routes and from
      // `founderCountryList`, so there is no longer anything to set. The
      // measurement that justified it is in shortlist.ts: 7,095 of 7,095 rows
      // identical either way, and a model-context line no request could
      // produce. The rule below is what generalises it.
      // ── The pinned filter, removed ────────────────────────────────────────
      // `[]` is not "no answer supplied by accident": `instrumentServesCapital`
      // returns true on an empty preference by design, so it is the NEUTRAL
      // value — the founder has not ruled anything out. `["grant","loan"]`
      // ruled out every tax credit and every equity vehicle in Europe on the
      // harness's own behalf, and that exclusion was reported as a corpus gap.
      //
      // The disqualified derivation is NOT revived: see workstream AR in
      // recallSet.ts. Receipts are not intent, the source column is one hop
      // from the column the corpus labels funds with, and the `other_scheme`
      // guard makes it anti-correlated rather than neutral.
      capitalSought: p.capital === "pinned" ? [...CONSTANT_ANSWERS.capitalSought] : [],
      description: describedAs(r, p),
      ownHistory: p.ownHistory,
    },
    supplied: (ASKABLE_FIELDS as IntakeField[])
      .filter((f) => draft[f] !== undefined),
    // Only where the value came from THIS COMPANY. `sector` and
    // `entityCountries` are read off the row, which is this company's own
    // register record; `ticketBand` counts only when `answersFor` derived it
    // rather than falling back; `region` only when one was actually resolved;
    // `organisationType` only when the name carried a designator.
    //
    // A field HELD BACK never counts as an own answer, however well we could
    // have derived it: this list is what the founder was actually told to say,
    // and a disclosure that counted an answer nobody was given is the reporting
    // half of the same defect.
    ownAnswer: ([
      ["sector", Boolean(r.sector)],
      ["entityCountries", Boolean(r.country)],
      ["ticketBand", a.derived.ticket],
      ["region", Boolean(region)],
      ["organisationType", Boolean(org)],
    ] as [IntakeField, boolean][])
      .filter(([f, ok]) => ok && !held.has(f)).map(([f]) => f),
    heldBack,
  };

  // The request-level half of the rule, over whatever `opts` happens to hold.
  // Read from panel.tsx once per process — the form cannot change mid-run, and
  // reading it per founder would be the same answer 7,095 times.
  for (const [k, v] of Object.entries(founder.opts)) {
    if (HARNESS_POLICY_OPTS.has(k) || !carriesAnAnswer(v)) continue;
    if (panelPayloadKeys().has(k)) continue;
    throw new Error(
      `founderIntake: refusing to send \`${k}\` — panel.tsx's basePayload sends `
      + `${[...panelPayloadKeys()].join(", ")} and not this. A replayed request that `
      + "carries something no founder's request can carry is measured against a "
      + "product nobody uses. Send the production value, or declare it a harness "
      + "policy knob if it is not part of a request at all.");
  }
  return founder;
}

/** One word for the header, so an arm can never be read off a run without it. */
export function describeDescriptionPolicy(p: FounderPolicy): string {
  return p.description === "full" ? "full"
    : p.description === "template" ? "template (the canned sector sentence)"
      : `capped at ${p.description.capChars} chars`;
}

/** Counts what was actually handed to founders across a run. */
export class IntakeTally {
  private n = 0;
  private hits = new Map<IntakeField, number>();
  private own = new Map<IntakeField, number>();
  /** How many founders had a derivable answer that production cannot hold. */
  private back = new Map<IntakeField, number>();
  private backWhy = new Map<IntakeField, UnpopulatedReason>();
  add(f: ReplayedFounder): void {
    this.n++;
    for (const k of f.supplied) this.hits.set(k, (this.hits.get(k) ?? 0) + 1);
    for (const k of f.ownAnswer) this.own.set(k, (this.own.get(k) ?? 0) + 1);
    for (const { field, reason } of f.heldBack) {
      this.back.set(field, (this.back.get(field) ?? 0) + 1);
      // Values accumulate across founders. A line quoting the LAST founder's
      // value would describe one row and read like a description of the run.
      const prev = this.backWhy.get(field);
      if (reason.why === "unofferable_value" && prev?.why === "unofferable_value") {
        this.backWhy.set(field, {
          why: "unofferable_value",
          values: [...new Set([...prev.values, ...reason.values])].sort(),
        });
      } else {
        this.backWhy.set(field, reason);
      }
    }
  }
  /** The lines a run prints. Withheld fields are printed too — a gap nobody
   *  can see on screen is the gap that gets pinned to a constant next time. */
  lines(policy: FounderPolicy): string[] {
    const out: string[] = [];
    // TWO numbers, never one. `set` is how many founders carried a value at
    // all; `own` is how many carried THEIR OWN. Where they differ, the gap is
    // the constant fallback, and a reader has to be able to see it.
    const pct = (k: IntakeField) => {
      const h = this.hits.get(k) ?? 0, o = this.own.get(k) ?? 0;
      const p = (x: number) => `${this.n ? Math.round((100 * x) / this.n) : 0}%`;
      return `set ${String(h).padStart(4)}/${this.n} (${p(h).padStart(4)})  `
        + `own ${String(o).padStart(4)}/${this.n} (${p(o).padStart(4)})`;
    };
    out.push(`  founder intake — ${ASKED_FIELDS.length} of ${ASKABLE_FIELDS.length} `
      + `askable fields are asked in production today, `
      + `identity=${policy.identity} own-history=${policy.ownHistory} `
      + `capital=${policy.capital} answers=${policy.answers} `
      + `consortium=${policy.consortium ?? "(unanswered)"} `
      + `description=${describeDescriptionPolicy(policy)}`);
    if (policy.description !== "full") {
      out.push("    \u2588\u2588 DESCRIPTION IS NOT THE SHIPPED VALUE. "
        + `${describeDescriptionPolicy(policy)} — every founder's free-text box was `
        + "cut down or replaced before ranking. This run measures what the product "
        + "scores when founders say LESS, and is not comparable with a run that "
        + "does not say so on this line.");
    }
    const order = { derived: 0, pinned: 1, withheld: 2, staged: 3, "n/a": 4 } as const;
    for (const f of [...ASKABLE_FIELDS].sort(
      (x, y) => order[INTAKE_SOURCE[x].supply] - order[INTAKE_SOURCE[y].supply] || x.localeCompare(y))) {
      const d = INTAKE_SOURCE[f];
      if (d.supply === "withheld") {
        out.push(`    WITHHELD  ${f.padEnd(20)} ${"-".padStart(38)}  ${d.why.split(".")[0]}`);
      } else if (d.supply === "derived") {
        out.push(`    DERIVED   ${f.padEnd(20)} ${pct(f)}  ${d.from.split(",")[0]}`);
      } else if (d.supply === "pinned") {
        out.push(`    PINNED    ${f.padEnd(20)} ${pct(f)}  uniform — ${d.cost.split(".")[0]}`);
      } else if (d.supply === "staged") {
        // A staged field prints its `set`/`own` line like any other, because
        // once its arm is on it IS any other. While the arm is off the numbers
        // read zero and the HELD BACK block below says how many answers that
        // zero is standing in for.
        const b = this.back.get(f) ?? 0;
        out.push(`    STAGED    ${f.padEnd(20)} ${pct(f)}  `
          + (b ? `held back on ${b}/${this.n} — ${d.from.split("—")[0].trim()}`
               : `production asks it; answered like any derived field`));
      }
    }
    out.push(`    ${policy.capital === "withheld" ? "WITHHELD  " : "PINNED    "}`
      + `capitalSought        ${(policy.capital === "withheld"
        ? "-" : `set ${this.n}/${this.n} (100%)`).padStart(38)}  `
      + `${policy.capital === "withheld"
        ? "no leak-free derivation of INTENT exists; empty is the neutral value"
        : "the old harness filter — removes every tax-credit and equity fund"}`);
    if (policy.ownHistory === "corpus") {
      out.push("    ██ OWN_HISTORY=corpus — the founder's own award history is "
        + "switched ON. `usedInField` can now be true because of the award being "
        + "predicted. THIS IS THE LEAK ARM. Do not publish this number.");
    }
    // ── QUESTIONS THE HARNESS COULD ANSWER AND THE PRODUCT DOES NOT ASK ─────
    //
    // The leak argument is not the only way a replayed founder can be the wrong
    // founder. This is the opposite failure: an answer that is perfectly honest
    // about the company and that no real founder is ever asked for. Judged
    // against it, the replay meets filters production cannot fire, and the
    // exclusions charge real points to impossible events.
    //
    // Until 2026-08-13 that happened, silently, on the field with the largest
    // structural gate count in the corpus. It is no longer possible — the
    // resolver holds such a field back — so what is printed here is the SIZE
    // of what is being held back, which is the number a reader needs in order
    // to know how different this measurement would be if the arm were on.
    //
    // Derived from the reasons the resolver actually recorded, so a field
    // nobody has added yet is disclosed with no edit here.
    for (const [f, n] of [...this.back].sort((x, y) => y[1] - x[1])) {
      const reason = this.backWhy.get(f);
      if (!reason) continue;
      out.push(`    ██ HELD BACK — ${unpopulatedNote(String(f), reason)}. `
        + `${n}/${this.n} founders had a leak-free answer and were not given one, `
        + "so nothing in this run is excluded by something a founder could not "
        + "have said."
        + (reason.why === "staged_off"
          ? ` Switch ${reason.armEnv} on and re-measure to see what asking would `
            + "cost or win; do not compare the two numbers without saying which "
            + "is which."
          : ""));
    }
    return out;
  }
}
