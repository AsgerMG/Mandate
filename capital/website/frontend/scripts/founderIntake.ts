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
// ── Why this is a property and not a register ─────────────────────────────
// `INTAKE_SOURCE` is keyed on `keyof EligibilityAnswers`, so the compiler
// refuses a new intake field until somebody has written down where a replayed
// founder's answer to it comes from and why it cannot leak. No fund, country,
// sector or instrument id appears here or in any disposition.
import { FIELD_REACH } from "../lib/intelligence/types";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import {
  ORGANISATION_TYPE_ARM, prefillOrganisationType,
} from "../lib/intelligence/organisationType";
import { answersFor, CONSTANT_ANSWERS } from "./recallSet";
import type { AnswerMode, RecallRow } from "./recallSet";

export type IntakeField = keyof EligibilityAnswers;

/** WHERE a replayed founder's answer comes from, and why it cannot be the
 *  answer to the question being asked. One of four dispositions:
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
 *   n/a       not one of the 23 a founder is ever asked (FIELD_REACH says
 *             `unreachable` or `constant`).
 */
export type IntakeDisposition =
  | { supply: "derived"; from: string; leak: string }
  | { supply: "pinned"; leak: string; cost: string }
  | { supply: "withheld"; why: string }
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
  organisationType: {
    supply: "derived",
    from: "prefillOrganisationType(company name) — production's own classifier, "
      + "reading the multilingual legal-form designator in the name",
    leak: "the input is the company's NAME STRING and nothing else. No award, "
      + "no channel, no instrument and no register row is consulted, so there "
      + "is no path by which the won fund could reach it. ██ IT IS NO LONGER "
      + "COSTLESS, AND IT IS NO LONGER A QUESTION PRODUCTION ASKS. ██ This "
      + "entry read 'inert today: none of the 484 organisation-kind gates "
      + "resolves to it yet, so supplying it is honest and currently costless'. "
      + "On 2026-08-12, 215 organisationType filter gates were encoded with "
      + "value specs, every one of them llm_cited — and organisationType is "
      + "STRUCTURAL, so ONE of them conclusively removes a fund. Meanwhile "
      + "ORGANISATION_TYPE_ARM is OFF in production: the control is not "
      + "rendered and the field is never populated, so `evaluateSpec` reads "
      + "null for every real founder and none of those 215 gates can fire. "
      + "Measured cost of the divergence (wsGE, 820 held-out described "
      + "founders, one per company): 33 founders — 4.0 points of accessible-"
      + "pool recall — lose their own fund to a question the product does not "
      + "ask. Every recall figure this repo publishes is that much pessimistic "
      + "until the arm is turned on or this stops being answered. THE CHOICE IS "
      + "DELIBERATE EITHER WAY: `IntakeTally` now prints the divergence on "
      + "every run so it cannot be held silently.",
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

// A disposition that says `n/a` must agree with FIELD_REACH, and one that says
// anything else must agree that the field IS askable. Two hand-written tables
// about the same fact drift; this is the line that stops them. It runs at
// import, so no harness can start on a resolver that disagrees with itself.
for (const f of ALL_INTAKE_FIELDS) {
  const askable = (ASKABLE_FIELDS as IntakeField[]).includes(f);
  const na = INTAKE_SOURCE[f].supply === "n/a";
  if (askable === na) {
    throw new Error(
      `founderIntake: INTAKE_SOURCE.${f} says "${INTAKE_SOURCE[f].supply}" but `
      + `FIELD_REACH says via="${FIELD_REACH[f].via}". A field is askable or it `
      + `is not, and the two tables must say the same thing.`);
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
  };
}

export interface ReplayedFounder {
  company: string;
  country: string;
  eligibility: EligibilityAnswers;
  opts: {
    targetMarkets: string[];
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
}

/** One replayed founder, built ONLY from declared dispositions.
 *
 *  Every harness that replays a recall pair goes through here.
 *  `check_harness_intake.ts` fails the build on one that does not, because the
 *  defect this file repairs was precisely a second copy of the intake living
 *  in the gate. */
export function founderIntake(r: RecallRow, p: FounderPolicy): ReplayedFounder {
  const a = answersFor(r, p.answers);
  const region = p.regionOverride?.(r) ?? a.region;
  const org = p.identity === "real" ? prefillOrganisationType(r.name) : null;

  const eligibility: EligibilityAnswers = {
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

  return {
    company: p.identity === "real" ? r.name : ANONYMOUS_FOUNDER,
    country: r.country,
    eligibility,
    opts: {
      targetMarkets: [r.country],
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
      description: r.description || r.selfDescription || undefined,
      ownHistory: p.ownHistory,
    },
    supplied: (ASKABLE_FIELDS as IntakeField[])
      .filter((f) => eligibility[f] !== undefined),
    // Only where the value came from THIS COMPANY. `sector` and
    // `entityCountries` are read off the row, which is this company's own
    // register record; `ticketBand` counts only when `answersFor` derived it
    // rather than falling back; `region` only when one was actually resolved;
    // `organisationType` only when the name carried a designator.
    ownAnswer: ([
      ["sector", Boolean(r.sector)],
      ["entityCountries", Boolean(r.country)],
      ["ticketBand", a.derived.ticket],
      ["region", Boolean(region)],
      ["organisationType", Boolean(org)],
    ] as [IntakeField, boolean][]).filter(([, ok]) => ok).map(([f]) => f),
  };
}

/** Counts what was actually handed to founders across a run. */
export class IntakeTally {
  private n = 0;
  private hits = new Map<IntakeField, number>();
  private own = new Map<IntakeField, number>();
  add(f: ReplayedFounder): void {
    this.n++;
    for (const k of f.supplied) this.hits.set(k, (this.hits.get(k) ?? 0) + 1);
    for (const k of f.ownAnswer) this.own.set(k, (this.own.get(k) ?? 0) + 1);
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
    out.push(`  founder intake — ${ASKABLE_FIELDS.length} askable fields, `
      + `identity=${policy.identity} own-history=${policy.ownHistory} `
      + `capital=${policy.capital} answers=${policy.answers} `
      + `consortium=${policy.consortium ?? "(unanswered)"}`);
    const order = { derived: 0, pinned: 1, withheld: 2, "n/a": 3 } as const;
    for (const f of [...ASKABLE_FIELDS].sort(
      (x, y) => order[INTAKE_SOURCE[x].supply] - order[INTAKE_SOURCE[y].supply] || x.localeCompare(y))) {
      const d = INTAKE_SOURCE[f];
      if (d.supply === "withheld") {
        out.push(`    WITHHELD  ${f.padEnd(20)} ${"-".padStart(38)}  ${d.why.split(".")[0]}`);
      } else if (d.supply === "derived") {
        out.push(`    DERIVED   ${f.padEnd(20)} ${pct(f)}  ${d.from.split(",")[0]}`);
      } else if (d.supply === "pinned") {
        out.push(`    PINNED    ${f.padEnd(20)} ${pct(f)}  uniform — ${d.cost.split(".")[0]}`);
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
    // ── A QUESTION THE HARNESS ANSWERS AND THE PRODUCT DOES NOT ASK ─────────
    //
    // The leak argument is not the only way a replayed founder can be the wrong
    // founder. This one is the opposite failure and it had no disclosure at
    // all: the harness answers a field whose production control is switched
    // off, so the replay is judged against filters no real founder can trip.
    //
    // It cost 4.0 points of accessible-pool recall the day 215 cited,
    // STRUCTURAL organisationType gates were encoded — an overnight
    // "regression" that was entirely the harness's own answer meeting new
    // gates. Printed unconditionally when it applies, because the failure mode
    // is that nobody thinks to look.
    //
    // The property, for a field nobody has added yet: every field this tally
    // reports as DERIVED or PINNED must be one production can populate. When
    // one is not, say which, on screen, next to the numbers it moved.
    const org = this.own.get("organisationType" as IntakeField) ?? 0;
    if (ORGANISATION_TYPE_ARM === "off" && org > 0) {
      out.push(`    ██ organisationType answered for ${org}/${this.n} founders `
        + "while NEXT_PUBLIC_ORGANISATION_TYPE_ARM is OFF — production never "
        + "populates this field, so these founders are being judged against "
        + "215 cited STRUCTURAL gates no real founder can trip. Measured cost: "
        + "4.0 points of accessible-pool recall. Turn the arm on, or stop "
        + "answering it; do not quote the number without saying which.");
    }
    return out;
  }
}
