// The mechanically checkable half of the brief contracts.
//
// Every rule here has an ID that also appears in contracts/*.md. That shared
// ID is the point: the contract is what the writer is told, this is what the
// output is measured against, and a check with no contract rule (or a contract
// rule with no check) fails the build in scripts/check_contracts.ts.
//
// ── Hard rules only ────────────────────────────────────────────────────────
// A rule belongs here when a machine can decide it: counts, caps, forbidden
// substrings, structural duplication. Rules that need judgement ("is this
// bullet decision-relevant?") stay in the contract as soft rules and are
// scored by a model reading that same contract, never duplicated here as a
// keyword heuristic. A check that cries wolf trains you to ignore the report.
//
// ── House rule ─────────────────────────────────────────────────────────────
// A rule names a property, never an instance. Nothing below names a company,
// fund, sector or country.
import { directsAtDepartment, whyNotApplyable } from "./applyableBody";
import { distinguishers } from "./rowNovelty";
import { WATCH_ONLY_COPY } from "./watchOnly";
import { UNWRITTEN_ROW_COPY } from "./unwrittenRow";
// The walk that says WHICH TEXT a founder reads. Imported, never restated:
// `pipeline.ts` repairs the same surface through the same walk, and a check
// and a repair that disagree about the field list is how a defect ships.
import { internalIdTokensIn } from "./rowIdentity";
import { mapReaderText, readerText } from "./readerSurface";
import type { IntelligenceReport } from "./types";

export interface CheckViolation {
  ruleId: string;
  /** What went wrong, in terms a PM reading the scoreboard can act on. */
  detail: string;
}

const words = (s: unknown) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;

/** Text the pipeline emits about its own machinery. None of it is an
 *  observation about the founder's company, so none of it belongs in a brief.
 *  Matched as phrases rather than keywords so ordinary prose cannot trip it. */
const BACKEND_LEAKAGE: { pattern: RegExp; what: string }[] = [
  { pattern: /documented eligibility rules/i, what: "gate-coverage metric" },
  { pattern: /nothing in its documented rules rules you out/i, what: "internal verdict phrasing" },
  { pattern: /\byour answers speak to\b/i, what: "gate-coverage metric" },
  { pattern: /\bnot yet verified\b/i, what: "encoding-coverage status" },
  { pattern: /#p\.\d+|\.pdf\b/i, what: "source-document locator" },
  { pattern: /\bchunk \d+/i, what: "extractor artifact" },
];

/** Copy the pipeline substitutes when the writer says nothing. Its presence
 *  means a published row carries no written judgement.
 *
 *  ── A CHECK THAT COULD NOT FIRE ─────────────────────────────────────────
 *  This was a regex naming the two sentences `synthesize` used to substitute:
 *  "verify eligibility directly with the fund" and "review the fund's current
 *  call". Neither could ever reach a published brief. The row that would have
 *  carried them was DELETED before publication by the same expression that
 *  chose them, so FUND-5's boilerplate half had no reachable input in the
 *  product's whole history.
 *
 *  Now the row publishes and this fires on it. Derived from the one constant
 *  the copy is built from, never a second spelling of it — the previous
 *  version is what a check holding its own copy of the string decays into. */
const BOILERPLATE = UNWRITTEN_ROW_COPY;

/** A numeral that fixes a point in time. A property of the token, so it holds
 *  in a language nobody here has read — the same test wsCL's edition relation
 *  uses to tell a calendar year from a lot number. */
const CALENDAR = /\b(?:19|20)\d{2}(?:-\d{2}-\d{2})?\b/g;

/** A row whose own justification argues against it. Only meaningful on rows
 *  with no declared blocker: a blocker row is SUPPOSED to name the obstacle. */
const SELF_CONTRADICTION = /\b(targets|aimed at|reserved for|designed for|focus(?:es|ed)? on)\b[^.]{0,80}\bnot\b/i;

// FUND-7's predicate lives in applyableBody.ts, which states the property and
// the three tests that decide a case nobody has seen. It was a start-anchored
// regex here, tested against one field, and it had never fired on the case the
// contract was written about — see that file's header for the measurement.

export interface BriefLimits {
  bulletMin: number; bulletMax: number; bulletWords: number;
  institutionsMax: number;
  positioningWords: number;
  stateOfPlayWords: number;
  bodyWords: number;
}

/**
 * The numeric limits, in one place so the contracts, the prompt and the checks
 * cannot disagree about them.
 *
 * `bulletWords` was 25 and fired on four of five bullets in a measured run.
 * That is not a writer missing a target, it is a target set below the job: a
 * bullet has to say which fund, why that one, and what the money actually
 * buys. Squeezing that into 25 words produced stacked clauses rather than
 * shorter thoughts. Raised to 40, with the contract asking for plain prose and
 * one idea per bullet — the 700-word body budget still bounds the section, so
 * this cannot quietly become a wall.
 */
/**
 * ── `institutionsMax`: why it is 7, and why it is the only copy ────────────
 *
 * It was 5 while the instant screen's `DISPLAY_CAP` was, and still is, 6. The
 * screen therefore already BUILT, screened and rendered a sixth row, and the
 * memo threw it away, so 6 was free: the row existed and was not carried.
 *
 * The seventh is NOT free, and it is a better row. Measured over one replay of
 * the memo's own candidate order, three runs, N=250 each, ranker clean on
 * EMBEDDING throughout (`scripts/_wsdc_rows.ts`):
 *
 *     marginal gain      EXACT              REGIME             CHANNEL
 *     of row             tune  hold  seed7  tune  hold  seed7  tune  hold  seed7
 *       6                +2.8  +3.2  +3.2   +0.4   0.0  +0.8    0.0   0.0   0.0
 *       7                +2.8  +3.2  +2.0   +2.8  +6.4  +3.2   +1.6  +6.0  +2.0
 *       8                +2.0  +1.6  +3.6   +1.2  +1.2  +1.6    0.0  +1.2   0.0
 *       9-12          ~+1.8 per row      ~+0.5 per row       ~0 per row
 *
 * The sixth row moves REGIME and CHANNEL by nothing on any split: it is almost
 * always another sibling of a programme the founder was already shown. The
 * seventh is the largest single mover of both anywhere above rank five, on
 * both splits — it is the row that puts a NEW programme, through a NEW
 * channel, in front of the founder. From the eighth on, EXACT keeps climbing
 * at roughly two points a row while REGIME crawls and CHANNEL is flat, which
 * is length without width and is where the accuracy stops paying.
 *
 * Regime concentration on the seventh row's gain, as the standing rule
 * requires: 7 pairs on tune across 5 regimes and 5 countries, largest regime 2
 * (29%). No single programme is carrying it.
 *
 * ── WHAT SEVEN ROWS ACTUALLY READ LIKE, having rendered two and read them ──
 *
 * `npm run bench -- --sample 2` at these caps, Neura Robotics and SMART
 * Photonics, both seven rows, both writers covering 7 and 8 of 8 candidates.
 *
 * The head is good and better than it was. Neura's first row is now Innovation
 * Fund SSP — the fund its own bottom line calls the standout move — where the
 * six-row render of the same company published four Horizon clusters, ERC POC
 * and EIC Transition and never showed SSP at all.
 *
 * The tail is a catalogue in both. Neura's rows 4-7 are four Horizon clusters
 * and ERC POC carrying one ticket string, one variation on "screening is open"
 * and one variation on "search the portal and find partners". SMART Photonics'
 * rows 4-7 are four Dutch regional schemes whose `whyEligible` is the same
 * sentence four times with the region swapped, and whose `nextStep` is
 * "contact the office to open a dossier" four times.
 *
 * ── wsDE: THE CATALOGUE IS GONE AND THE CAP DID NOT MOVE ON ONE RUN ────────
 *
 * The paragraph below says the eighth row should not be bought "until FUND-3's
 * test is enforced on that shape". It now is, and the shape it named is fixed:
 * a run of rows that are the same kind of door states its shared facts once,
 * and each row carries what is its own. Both things that blocked the eighth
 * row have been measured clear, and it is STILL SEVEN. Here is everything, so
 * whoever moves it next is moving it on the evidence rather than on the
 * argument.
 *
 * WHAT IS CLEAR NOW.
 *   The tail is not a catalogue. Re-rendered at seven rows, SMART Photonics'
 *   four Dutch rows now turn on the lead-applicant rule, the South Netherlands
 *   condition and the co-financing line's relation to its sibling, with four
 *   different bodies to contact. The one sentence they share is said once.
 *   The writer does not omit at nine. That is the measurement that put
 *   `WRITER_CANDIDATE_CAP` at 8 rather than 9 in the first place, and it was
 *   taken on the old flat evidence block. On the grouped block, the company
 *   that omitted one candidate of eight under wsDC came back covering NINE OF
 *   NINE, rejected 0, omitted 0, and published a full eight rows.
 *   The rows past seven are not more repetitive than the rows before them.
 *   Over 250 founders: a row at rank 8-12 carries a fact no earlier row
 *   carried on the same axes and at the same rates as a row at rank 2-7
 *   (its own measured award 98% against 100%, its own conditions 53% against
 *   56%, how the money is shaped 50% against 56%).
 *
 * WHY IT IS STILL SEVEN. One bench run is one bench run, and the observation
 * it would overturn -- a writer covering 5 of 9 -- is also a real one. Moving
 * a shipped cap on a single counter-observation is how a short table ships.
 * The experiment that settles it is small and named: run the archetypes at
 * institutionsMax 8 and WRITER_CANDIDATE_CAP 9 and read `omitted` on each. If
 * none omits, the eighth row is worth +2.0 tune / +1.6 holdout on EXACT and
 * it is now carryable.
 *
 * The eighth row was also READ, in that run: it was a partnership from a
 * family none of the seven above it belonged to, which is width. Its note
 * hedged ("funds mobility and transport applications rather than industrial
 * robotics directly"), which is the honest thing to say and is the shape
 * FUND-6 is about. That is the thing to watch when the cap does move.
 *
 * THAT IS FUND-3, AND IT IS NOT A ROW-COUNT DEFECT. It is present at six —
 * the six-row Neura render spent four of six slots on one programme — so the
 * seventh row lengthens an existing catalogue rather than creating one, and it
 * pays for itself in the metric that matters. But it is the reason the eighth
 * row should NOT be bought next. The lever that is actually binding is not the
 * cap: it is that rows sharing one legal basis and one action are still four
 * rows, and until FUND-3's test is enforced on that shape, buying length buys
 * repetition. The curve says the accuracy is there; the page says it cannot be
 * carried yet.
 *
 * WHAT IT COSTS. `WRITER_CANDIDATE_CAP` had to rise with it, or the writer
 * would have been shown exactly as many candidates as publish and any single
 * declined note would have shortened the table. `check_contracts.ts` now fails
 * the build if that headroom ever reaches zero.
 *
 * This is the ONLY place the number lives. `pipeline.ts` imports it for the
 * cut, `contracts/brief/02-funds.md` states it in words to the writer, and
 * `scripts/check_contracts.ts` fails the build when those words and this
 * number disagree. Before that there were three independent literal fives —
 * here, `BRIEF_INSTITUTION_CAP` in pipeline.ts, and the contract prose — with
 * nothing in the repo comparing any of them.
 */
export const BRIEF_LIMITS: BriefLimits = {
  bulletMin: 4, bulletMax: 5, bulletWords: 40,
  institutionsMax: 7,
  positioningWords: 200,
  stateOfPlayWords: 200,
  bodyWords: 700,
};

/** The three row fields the WRITER fills. Pinned by its own output schema
 *  (`institutionNotes`), not by memory: everything else on a published row is
 *  the corpus's text about the fund. */
const WRITER_WRITTEN_ROW_FIELDS = new Set(["whyEligible", "nextStep", "blocker"]);

/**
 * The text a HUMAN wrote about the funds in this table.
 *
 * It is what an id word may legitimately be accounted for by: a slug built out
 * of a fund's own title, or out of the body the register names as taking its
 * applications, is not an identifier leaking -- it is text this very report
 * puts in front of the founder somewhere else on the same row. Passed as an
 * argument rather than read off a type inside `rowIdentity`, because each
 * caller must be able to defend what it admits and none may quietly widen
 * another's.
 *
 * DERIVED FROM THE ROW, not a field list. A hand-kept list here is the defect
 * `readerText` was built to remove one layer up, and it fails in the direction
 * that hurts: a corpus field somebody forgot makes its own words look like
 * identifiers, and the first run of this rule over the archetypes reported the
 * granting body of a German scheme and a Dutch province as leaks because both
 * are printed on the row as `schemeOperators` and neither was on the list.
 *
 * TWO SUBTRACTIONS, and both are the point:
 *  * the writer's own three fields, because prose cannot certify itself -- an
 *    id in `nextStep` would otherwise account for the same id in a bullet;
 *  * nothing here reads `administeringBody`. `schemeOperators` is a PUBLISHED
 *    field and is admitted as published text; the raw column is not, for the
 *    reason stated in rowIdentity.ts.
 */
export function fundText(
  institutions: readonly IntelligenceReport["institutions"][number][],
): string[] {
  return institutions.flatMap((r) => [
    // The notified code. The walk treats it as an identifier because the
    // renderer resolves it into a link, and it is nonetheless a public
    // reference somebody assigned and the page shows.
    r.schemeCode ?? "",
    ...readerText(Object.fromEntries(Object.entries(r)
      .filter(([k]) => !WRITER_WRITTEN_ROW_FIELDS.has(k)))),
  ]).filter((x) => x.length > 0);
}

/**
 * Every hard-rule violation in a finished brief.
 *
 * `plug` is the fixed closing copy appended in code; it is passed in rather
 * than imported so the check cannot silently pass by comparing the string to
 * itself if the pipeline stops appending it.
 */
export function checkBrief(
  report: Partial<IntelligenceReport>,
  plug?: string,
  /** EVERY FUND NAME THE WRITER WAS SHOWN, from any block of its prompt.
   *  Required to decide BL-B1; when it is absent the rule reports that it could
   *  not be evaluated rather than passing silently, because an optional
   *  argument that quietly disables a rule is how SOP-2 went five months
   *  without once evaluating its own predicate.
   *
   *  It used to be the CANDIDATE list alone, on the argument that the writer
   *  "named that fund because we showed it" — right, and the candidates are not
   *  the only place we show one. The round-two block names a fund per question,
   *  grounded in the whole pool by design, and that is where the two recorded
   *  failures of this rule actually came from. The caller passes both. */
  candidatesShown?: string[],
): CheckViolation[] {
  const v: CheckViolation[] = [];
  const bullets = report.bottomLine ?? [];
  const institutions = report.institutions ?? [];

  // ── bottom line ────────────────────────────────────────────────────────
  if (bullets.length < BRIEF_LIMITS.bulletMin || bullets.length > BRIEF_LIMITS.bulletMax) {
    v.push({ ruleId: "BL-1", detail: `${bullets.length} bullets, expected ${BRIEF_LIMITS.bulletMin}-${BRIEF_LIMITS.bulletMax}` });
  }
  for (const [i, b] of bullets.entries()) {
    if (words(b) > BRIEF_LIMITS.bulletWords) {
      v.push({ ruleId: "BL-2", detail: `bullet ${i + 1} is ${words(b)} words (max ${BRIEF_LIMITS.bulletWords})` });
    }
  }

  // ── the funds ──────────────────────────────────────────────────────────
  // ── FUND-1, both halves ─────────────────────────────────────────────────
  // "At least one row publishes. An empty table is never the answer WHILE ANY
  // DOOR IS OPEN." The check only ever saw the first sentence, and it could
  // only see it in a bench script: `checkBrief` ran in no build gate and in no
  // route, so an empty table shipped, was noticed by a human rendering the
  // page, and cost nothing anywhere in the suite.
  //
  // Both halves of that are now closed. `scripts/check_memo_table.ts` runs
  // this on all 12 archetypes inside `npm run check`, and since 2026-08-11
  // `synthesize()` runs it on every brief a founder is actually handed and
  // records what fires as `brief_rule_violated`. Observational in the route by
  // design: it must never be able to withhold a memo.
  //
  // The second sentence is the one that decides what an empty table MEANS. An
  // empty table with no explanation is silence, which is never acceptable. An
  // empty table that says how many funds were considered and which of their own
  // requirements ruled every one of them out is a real answer to a founder who
  // genuinely has no route today, and it tells them what would change it.
  if (institutions.length === 0) {
    const nd = report.noDoors;
    if (!nd) {
      v.push({ ruleId: "FUND-1", detail: "empty table with no explanation: the brief says nothing at all" });
    } else if (!nd.ruledOutBy.length) {
      v.push({ ruleId: "FUND-1", detail: `empty table over ${nd.considered} funds with no requirement named as the reason` });
    } else if (nd.considered === 0) {
      v.push({ ruleId: "FUND-1", detail: "empty table and nothing was even considered: the pool never built" });
    }
  }
  if (institutions.length > BRIEF_LIMITS.institutionsMax) {
    v.push({ ruleId: "FUND-2", detail: `${institutions.length} rows (max ${BRIEF_LIMITS.institutionsMax})` });
  }
  // Two rows resolving to the same institution under the same legal basis are
  // one route shown twice, which spends a scarce row on nothing.
  // Keyed on the folded name, not the literal one. The reasoning key below was
  // already trimmed and this one was not, so "Innovation Fund" and "Innovation
  // Fund " were two routes to one door as far as this check was concerned. Two
  // keys for one question, differing by a `.trim()`, is the shape this repo
  // keeps paying for.
  const foldKey = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const seen = new Set<string>();
  for (const r of institutions) {
    const key = `${foldKey(r.institution)}|${foldKey(r.legalBasis)}`;
    if (seen.has(key)) {
      v.push({ ruleId: "FUND-3", detail: `duplicate route: ${r.institution}${r.legalBasis ? ` (${r.legalBasis})` : ""}` });
    }
    seen.add(key);
  }
  // Two rows whose reasoning is word-for-word identical are one row shown
  // twice, whatever their names. A brief published Horizon CL5 and CL6 with
  // the same sentence and the same next step, spending two of five slots to
  // say one thing.
  const reasoning = new Set<string>();
  for (const r of institutions) {
    const key = `${(r.whyEligible ?? "").trim().toLowerCase()}|${(r.nextStep ?? "").trim().toLowerCase()}`;
    if (key.length > 8 && reasoning.has(key)) {
      v.push({ ruleId: "FUND-3", detail: `identical reasoning to another row: ${r.institution}` });
    }
    reasoning.add(key);
  }
  // ── FUND-3's own test, on the row rather than on two strings ─────────────
  // The two rules above decide the rule's two WORKED EXAMPLES: one institution
  // twice under one basis, and two names carrying byte-identical prose. The
  // rule itself asks something wider, and something a founder feels rather than
  // a diff finds: would the reader learn anything from the second row that they
  // did not learn from the first?
  //
  // Decidable without judgement, because the row is a set of facts. Remove
  // every fact whose value an earlier published row already carried; what is
  // left is why this row is worth its slot. Nothing left, and the row is the
  // same thing said again -- whatever its name, and however differently the
  // writer phrased it.
  //
  // WHAT THIS IS NOT. It is not a licence to drop the row. A wrongly-withheld
  // row is a fund a founder never sees, and one notified scheme delivered by
  // several bodies is several real doors -- collapsing those recovers nothing
  // and costs routes (wsCG2). This reports; the pipeline never reads it.
  //
  // It is currently GREEN on every founder measured: 432 of 432 rows that
  // follow another row of their own kind carry a fact no earlier row carried.
  // That is the finding, not an idle check. It is what says the catalogue is a
  // presentation defect rather than a selection one, and it is the guard that
  // stops a future fold from being widened until it hides a row that really
  // has nothing to say.
  for (const [i, r] of institutions.entries()) {
    if (i === 0) continue;
    if (distinguishers(r, institutions.slice(0, i)).length === 0) {
      v.push({ ruleId: "FUND-3", detail:
        `row ${i + 1} carries no fact an earlier row did not: ${r.institution}` });
    }
  }
  for (const r of institutions) {
    if (WATCH_ONLY_COPY.test(String(r.nextStep ?? ""))) {
      v.push({ ruleId: "FUND-4", detail: `next step is a thing to watch, not do: ${r.institution}` });
    }
    // FUND-5 has two halves and only one was ever checked. "Always written" is
    // violated first and most cheaply by NOTHING BEING WRITTEN: the writer's
    // structured-output schema marks these `required`, which guarantees the KEY
    // is emitted and says nothing about the value, so `""` satisfies it and
    // publishes a blank cell. The boilerplate half is the second-order case —
    // the pipeline substituting its own text — and it was the only one here.
    if (!String(r.whyEligible ?? "").trim() || !String(r.nextStep ?? "").trim()) {
      v.push({ ruleId: "FUND-5", detail: `row published with no ${!String(r.whyEligible ?? "").trim() ? "whyEligible" : "nextStep"}: ${r.institution}` });
    }
    if (BOILERPLATE.test(String(r.whyEligible ?? "")) || BOILERPLATE.test(String(r.nextStep ?? ""))) {
      v.push({ ruleId: "FUND-5", detail: `fallback boilerplate published: ${r.institution}` });
    }
    // ── FUND-15 ────────────────────────────────────────────────────────────
    // A between-calls row is published BECAUSE the funder's own source says the
    // programme continues. The one thing that would make publishing it worse
    // than suppressing it is prose that hands the founder a date: we do not
    // hold the next window — that is definitionally what put the row here — so
    // any date offered as when to apply is invented.
    //
    // Asked as a property of the TOKEN, not of a vocabulary: a numeral that
    // fixes a point in time. `betweenCalls` is code-built and its own unit test
    // pins that every date in it is one the row carries, so it is the honest
    // register of what this row is allowed to say.
    if (r.betweenCalls) {
      const held = new Set(r.betweenCalls.match(CALENDAR) ?? []);
      if (r.lastAwardYear != null) held.add(String(r.lastAwardYear));
      for (const field of [r.nextStep, r.whyEligible]) {
        for (const d of String(field ?? "").match(CALENDAR) ?? []) {
          if (held.has(d) || held.has(d.slice(0, 4))) continue;
          v.push({ ruleId: "FUND-15", detail:
            `between-calls row names a date the corpus does not hold (${d}): ${r.institution}` });
        }
      }
    }
    if (!r.blocker && SELF_CONTRADICTION.test(String(r.whyEligible ?? ""))) {
      v.push({ ruleId: "FUND-6", detail: `row argues against itself: ${r.institution}` });
    }
    const why = whyNotApplyable(r.institution);
    if (why) {
      v.push({ ruleId: "FUND-7", detail: `not a body a founder can apply to: "${r.institution}" ${why}` });
    }
  }

  // FUND-7 "holds wherever the name appears, prose included", and the contract
  // gives a BULLET as its failing example. Nothing looked at prose until now:
  // the predicate ran on `institution` and stopped, so the one case the rule is
  // written around was outside the check's reach. Scoped to prose that DIRECTS
  // the reader somewhere (see directsAtDepartment) rather than to any mention,
  // because a brief may honestly say who notified a regime.
  for (const [i, b] of bullets.entries()) {
    if (directsAtDepartment(b)) {
      v.push({ ruleId: "FUND-7", detail: `bullet ${i + 1} sends the founder at a government department` });
    }
  }
  for (const [where, text] of [
    ["positioning", report.positioning],
    ["state of play", report.stateOfPlay],
    ...institutions.map((r) => [`next step for ${r.institution}`, r.nextStep] as const),
    // The curated route is the ONE line on a row that is an instruction rather
    // than an assessment, which makes it the last place a dead end may stand.
    // It is corpus text and not the writer's, so a violation here is a DATA
    // defect and reads as one -- which is the point. A real Dutch brief
    // published four rows, two of them provincial schemes, all saying
    // "Application submitted to the Minister": the parent regime's route,
    // inherited by children that do not share it.
    ...institutions.map((r) => [`application route for ${r.institution}`, r.applicationChannel] as const),
  ] as const) {
    if (directsAtDepartment(text)) {
      v.push({ ruleId: "FUND-7", detail: `${where} sends the founder at a government department` });
    }
  }

  // ── BL-B1: a bullet naming a fund that is not in the table ─────────────
  // A Banned rule, and one the enforcement regex could never see. Found LIVE
  // on the first brief rendered after the pool fix: two of five bullets led
  // with "Innovation Fund SSP" -- correctly, it was the best-sized route for
  // that founder -- and it was candidate seven, cut by the six-row cap. The
  // founder is told to go after a fund that is not on the page.
  //
  // Decidable without recognising funds in general. The set that matters is
  // the set we HANDED the writer: it named that fund because we showed it. So
  // the test is a comparison of two lists we already hold, and it names no
  // fund, country or sector.
  if (candidatesShown === undefined) {
    v.push({ ruleId: "BL-B1", detail: "not evaluated: the caller did not pass the candidates the writer was shown" });
  } else {
    // A published row's name may carry a qualifier the disambiguator appended
    // ("... · via Conseil régional"), so the head of the name is what a bullet
    // would repeat. Compared on the same basis on both sides.
    const head = (n: string) => foldKey(n.split(" · ")[0]);
    const published = new Set(institutions.map((r) => head(r.institution)));
    const cut = candidatesShown.filter((n) => !published.has(head(n)));
    for (const [i, b] of bullets.entries()) {
      const bullet = foldKey(b);
      for (const name of cut) {
        // A WRITER ABBREVIATES, AND THE OLD TEST DID NOT.
        //
        // This required the bullet to contain the fund's WHOLE display name.
        // The recorded failure was a bullet reading "PACTE Industrie is open to
        // you on paper, but ADEME's incentive-effect rule ..." against a
        // corpus name of "PACTE Industrie - Parcours Accompagnement et
        // Compétences pour la Transition Énergétique de l'Industrie", so the
        // rule saw nothing on the brief it exists for.
        //
        // The lead segment is what a person calls the fund: everything before
        // the first separator a compound corpus title is built with. Still an
        // exact containment against a name WE showed the writer — this is not
        // fund recognition in general, and it names no fund, country or sector.
        // 12 characters, because a short lead segment ("Grants", "Aid") is a
        // word, not a name, and would match every brief.
        const lead = head(name).split(/\s+[-—:]\s+|\s*\(/)[0].trim();
        for (const form of new Set([head(name), lead])) {
          if (form.length >= 12 && bullet.includes(form)) {
            v.push({ ruleId: "BL-B1", detail:
              `bullet ${i + 1} names "${form}", a fund shown to the writer that is `
              + "not in the published table" });
            break;
          }
        }
      }
    }
  }

  // ── positioning and state of play ──────────────────────────────────────
  if (words(report.positioning) > BRIEF_LIMITS.positioningWords) {
    v.push({ ruleId: "POS-1", detail: `${words(report.positioning)} words (max ${BRIEF_LIMITS.positioningWords})` });
  }
  const sop = String(report.stateOfPlay ?? "");
  if (words(sop) > BRIEF_LIMITS.stateOfPlayWords) {
    v.push({ ruleId: "SOP-1", detail: `${words(sop)} words (max ${BRIEF_LIMITS.stateOfPlayWords})` });
  }
  // The closing pitch is fixed copy with its own place in the layout. Inside
  // the analytical paragraph it reads as the analysis turning into a sales
  // line, which is what it did when the two were string-concatenated.
  if (plug && sop.includes(plug.slice(0, 40))) {
    v.push({ ruleId: "SOP-2", detail: "closing pitch is inside the analysis paragraph rather than its own block" });
  }

  // ── whole document ─────────────────────────────────────────────────────
  const body = words(bullets.join(" ")) + words(report.positioning) + words(sop);
  if (body > BRIEF_LIMITS.bodyWords) {
    v.push({ ruleId: "BRIEF-1", detail: `${body} words of prose (max ${BRIEF_LIMITS.bodyWords})` });
  }
  if (!String(report.caveats ?? "").trim()) {
    v.push({ ruleId: "BRIEF-2", detail: "no caveat" });
  }
  // ── Everything a founder reads, not a list of nine fields ───────────────
  // This was a hand-written union of nine fields. The report renders far more
  // than nine: the support type, the legal basis, the scheme operators, the
  // fund's own registered purpose, the judgement criteria, the structuring
  // notes, the application route, the link label, the comparable firms and the
  // withheld notice are all on the page and none of them was ever scanned. A
  // union maintained by hand covers what someone remembered; `readerText`
  // covers what the report CONTAINS, so a field added tomorrow is inside these
  // rules with no edit here.
  // BRIEF-4 and VOI-B1 are about the product's own voice, so they run over what
  // the product WROTE -- the prose and the row copy -- and not over the
  // eligibility screen, whose text is each fund's requirement verbatim beside
  // its source. Quoting a rule and naming the document it came from is the
  // opposite of leaking machinery.
  const ourText = readerText({
    bottomLine: report.bottomLine, positioning: report.positioning,
    stateOfPlay: report.stateOfPlay, caveats: report.caveats,
    institutions: report.institutions, withheld: report.withheld,
  });
  const allText = ourText.join(" \n ");
  for (const s of readerText(report)) {
    if (/—/.test(s)) {
      v.push({ ruleId: "BRIEF-3", detail: `em-dash in founder-facing text: "${s.slice(0, 60)}"` });
      break;
    }
  }
  for (const { pattern, what } of BACKEND_LEAKAGE) {
    if (pattern.test(allText)) v.push({ ruleId: "BRIEF-4", detail: `internal machinery in reader text (${what})` });
  }
  // VOI-B1 is the shared contract's statement of the same property, and it is
  // where the rule is written to apply EVERYWHERE rather than to the four
  // brief sections. BRIEF-4 above is scoped to the document; this is the one
  // that has to hold on a field nobody thought of, which is why it runs over
  // the same walk rather than over a list.
  for (const s of ourText) {
    if (MACHINERY_VOCABULARY.test(s)) {
      v.push({ ruleId: "VOI-B1", detail: `the product describing its own machinery to the reader: "${s.slice(0, 70)}"` });
      break;
    }
  }

  // ── BRIEF-5: OUR KEY FOR A FUND, PRINTED TO THE FOUNDER ─────────────────
  //
  // Found live (wsHP run 2), in the first substantive bullet of a real brief:
  // "Start with the Grand Est regional scheme
  // (satr_fr_rnd__sa_111728__region_grand_est): it is delivered by ...".
  //
  // The writer HAS the ids legitimately -- it is handed one per row so it can
  // return a note per row, because 322 instruments share 143 names and a name
  // cannot key a table. Nothing had ever said that the key was not also
  // publishable, and the row-name guard could not see it: the rows were clean
  // and this is prose.
  //
  // The ids in play are read off the report rather than passed in. That is not
  // convenience: it is the only set that cannot go stale, because the rows the
  // writer was handed ARE the published rows (WRITER_CANDIDATE_CAP equals the
  // published cap, which check_contracts enforces), and a caller cannot forget
  // to supply what the check reads out of its own subject.
  const idsInPlay = institutions.map((r) => r.instrumentId).filter(Boolean) as string[];
  if (idsInPlay.length) {
    const human = fundText(institutions);
    for (const s of readerText(report)) {
      const [hit] = internalIdTokensIn(s, idsInPlay, human);
      if (hit) {
        v.push({ ruleId: "BRIEF-5", detail:
          `an internal identifier reached founder-facing text: "${hit.token}"` });
        break;
      }
    }
  }

  // ── FUND-B1: the table's own facts, restated in prose ───────────────────
  // The support type, the ticket and the comparable firms RENDER as columns.
  // Repeating them in a sentence spends the reader's attention on something
  // their eye has already crossed, and it is decidable: the exact string the
  // column shows either appears in the prose or it does not.
  const prose = [...bullets, report.positioning, sop].filter(Boolean).map(String);
  for (const r of institutions) {
    for (const [what, value] of [
      ["ticket size", r.ticket],
      ["support type", r.supportType],
      ...(r.comparableFirms ?? []).map((f) => ["a comparable firm", f.name] as const),
    ] as const) {
      const needle = String(value ?? "").trim();
      // Short strings are words, not facts: a two-character ticket or a
      // one-word support type would match ordinary prose. The rule is about
      // restating a rendered VALUE, so it needs a value distinctive enough to
      // be one.
      if (needle.length < 6) continue;
      if (prose.some((p) => p.includes(needle))) {
        v.push({ ruleId: "FUND-B1", detail: `${what} "${needle}" is restated in prose and already renders in the table` });
      }
    }
  }

  return v;
}

/** Vocabulary that is only ever the product talking about itself. Distinct
 *  from BACKEND_LEAKAGE, which catches specific emissions; this catches the
 *  register. Both are phrase-shaped so ordinary prose cannot trip them. */
const MACHINERY_VOCABULARY =
  /\b(?:encoded (?:gate|rule|filter)s?|gate coverage|eligibility screen coverage|verification level|instrument id|our corpus|the corpus (?:holds|says)|rule count|coverage ratio)\b/i;

// `readerText` used to be defined here and is imported now. Re-exported so
// the callers that know it by this name keep working -- and so there is exactly
// one implementation behind both names.
export { readerText, mapReaderText };

/** Every rule id this module can emit — checked against the contracts so a
 *  rule can never exist in only one of the two places. */
export const CHECK_RULE_IDS = [
  "BL-1", "BL-2",
  "FUND-1", "FUND-2", "FUND-3", "FUND-4", "FUND-5", "FUND-6", "FUND-7", "FUND-15",
  "FUND-B1",
  "POS-1", "SOP-1", "SOP-2",
  "BRIEF-1", "BRIEF-2", "BRIEF-3", "BRIEF-4",
  "VOI-B1", "BL-B1",
  "BRIEF-5",
] as const;
