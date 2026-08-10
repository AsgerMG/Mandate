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
import { WATCH_ONLY_COPY } from "./watchOnly";
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

/** Fallback strings the pipeline substitutes when the writer says nothing.
 *  Their presence means a published row carries no actual judgement. */
const BOILERPLATE = /verify eligibility directly with the fund|review the fund's current call/i;

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
  /** The institution names the writer was SHOWN, which is a superset of what
   *  published. Required to decide BL-B1; when it is absent the rule reports
   *  that it could not be evaluated rather than passing silently, because an
   *  optional argument that quietly disables a rule is how SOP-2 went five
   *  months without once evaluating its own predicate. */
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
  // only see it in a bench script: `checkBrief` runs in no build gate and in no
  // route, so an empty table shipped, was noticed by a human rendering the
  // page, and cost nothing anywhere in the suite.
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
    const published = new Set(institutions.map((r) => foldKey(r.institution)));
    const cut = candidatesShown.filter((n) => !published.has(foldKey(n)));
    for (const [i, b] of bullets.entries()) {
      for (const name of cut) {
        if (name.trim().length >= 6 && String(b).includes(name.trim())) {
          v.push({ ruleId: "BL-B1", detail:
            `bullet ${i + 1} names "${name.trim()}", which was cut and is not in the table` });
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

/** Keys whose values are machine identifiers rather than prose a founder
 *  reads. Everything else in the report is on the page in some form.
 *
 *  This is a closed set because the report's SHAPE is closed -- these are the
 *  keys the renderer resolves into hrefs and lookups rather than printing. A
 *  key added tomorrow is prose until someone says otherwise, which is the safe
 *  default: the cost of scanning an identifier is a false positive someone
 *  reads, and the cost of missing a field is a rule that silently stops
 *  applying to it. */
const NON_READER_KEYS = new Set([
  "url", "link", "channel", "instrumentId", "generatedAt", "provenance",
  "schemeCode", "id", "kind", "verdict", "accessMode",
  // A citation names a document. That is an identifier, and showing it is the
  // product working -- a rule displayed without its source is not evidence. The
  // first run of this walk over a real brief flagged 40 `.pdf` locators as
  // "internal machinery in reader text", which is precisely the crying wolf
  // this file's own header refuses.
  "file", "locator",
  // Computed, ranked on, and NOT PRINTED (see panelReport). Text nobody reads
  // cannot violate a rule about what a founder reads. It carries the gate-count
  // phrasing verbatim, so leaving it in would have made every brief fail
  // BRIEF-4 forever on a string that never reaches the page.
  "whyEasy",
]);

/** Every string in the report a founder can read, whatever nesting it is at. */
export function readerText(value: unknown, key = ""): string[] {
  if (typeof value === "string") return NON_READER_KEYS.has(key) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((x) => readerText(x, key));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !NON_READER_KEYS.has(k))
      .flatMap(([k, x]) => readerText(x, k));
  }
  return [];
}

/** Every rule id this module can emit — checked against the contracts so a
 *  rule can never exist in only one of the two places. */
export const CHECK_RULE_IDS = [
  "BL-1", "BL-2",
  "FUND-1", "FUND-2", "FUND-3", "FUND-4", "FUND-5", "FUND-6", "FUND-7", "FUND-B1",
  "POS-1", "SOP-1", "SOP-2",
  "BRIEF-1", "BRIEF-2", "BRIEF-3", "BRIEF-4",
  "VOI-B1", "BL-B1",
] as const;
