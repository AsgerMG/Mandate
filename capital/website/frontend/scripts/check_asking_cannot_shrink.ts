/**
 * ASKING A FOUNDER A QUESTION MAY NOT COST THEM A FUND.
 *
 * ── The property ─────────────────────────────────────────────────────────
 *
 *   For any founder, any field the follow-up screen can ask, and any
 *   admissible value of it, the funds surviving to `toWriter` WITH the answer
 *   are a SUPERSET of those surviving WITHOUT it.
 *
 * Answering may reorder, may narrow the wording, may put an obstacle on a row.
 * It may not make a row disappear. That is the owner's binding decision --
 * second-screen answers INFORM the ranker and never REMOVE a fund -- and it is
 * already licensed by SELECT-4: "A doubt is not a rejection... a fund set aside
 * on a doubt is a fund the founder never sees and never learns exists."
 *
 * ── Why the follow-up screen and not the first one ───────────────────────
 * A screen-one answer keeps full force, and that asymmetry is the whole rule
 * rather than an exemption from it. The first screen asks what is needed to
 * build a shortlist at all -- where you are, what you build, how big you are --
 * and a fund that excludes a German company is not a fund a German company
 * should read about. The follow-up round is different IN KIND: it is assembled
 * at runtime from whichever gates happen to be encoded on whichever rows happen
 * to have reached this founder's pool. What it can ask about is a fact about
 * OUR ENCODING COVERAGE. Letting that decide publication means the funds we
 * have documented best are the funds we are most able to hide.
 *
 * So the population is `FIELD_ENUM_HINTS` minus `FIRST_PAGE_FIELDS` -- two
 * declarations, both derived, neither a list kept here. A field that moves onto
 * the first screen leaves this check on the same commit; a field that moves off
 * it joins. Values come from each field's own option set, so a new option is
 * tested the day it is added and nothing in this file names one.
 *
 * ── PROVE=1 ──────────────────────────────────────────────────────────────
 * Simulates the defect: the pipeline as it stood, where `accessiblePool` never
 * heard when the answer arrived. If that produces NO red, THIS CHECK FAILS --
 * a guard that cannot demonstrate its own failure over today's corpus is
 * green-lighting a corpus where nothing happens to block, not a product that
 * cannot hide a fund.
 *
 * ── Hermetic ─────────────────────────────────────────────────────────────
 * Runs on the committed snapshot under `NO_PG=1` (which is how CI runs it) and
 * makes no model call of any kind. ~800 pool builds, tens of seconds.
 *
 *   cd website/frontend && NO_PG=1 npx tsx scripts/check_asking_cannot_shrink.ts
 *   cd website/frontend && NO_PG=1 PROVE=1 npx tsx scripts/check_asking_cannot_shrink.ts
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("check_asking_cannot_shrink", ["DATABASE_URL", "VOYAGE_KEY"]);

/** The defect, reproduced. Under PROVE the follow-up answer is handed to the
 *  pool cut as if it had come off the first screen, which is exactly what the
 *  code did before `answerProvenance.ts` existed. */
const PROVE = process.env.PROVE === "1";

/** Below this, the run has not exercised the product and a green is a green
 *  over nothing. Set well under the ~700 the population generates today, so a
 *  vocabulary that shrinks a little does not fail the build, and one that
 *  collapses does. */
const MIN_CASES = 400;

async function main() {
  const { hydrateDbInstruments, resetGateHydration } = await import("../lib/intelligence/corpus");
  const {
    buildInstrumentTableHydrated, founderCountryList, tableInputFromAnswers, VERDICT_POOL,
  } = await import("../lib/intelligence/shortlist");
  const { ExclusionLog } = await import("../lib/intelligence/exclusions");
  const { accessiblePool, orderMemoCandidates } = await import("../lib/intelligence/memoCandidates");
  const { lateAnsweredFields, withCoveredFields } = await import("../lib/intelligence/answerProvenance");
  const { openFieldsForShortlist } = await import("../lib/intelligence/gateReach");
  const { semanticFundMatch } = await import("../lib/intelligence/semantic");
  const { sanitizeEligibility } = await import("../lib/intelligence/sanitize");
  const { COMPANIES } = await import("../lib/intelligence/__benchCompanies");
  const { FIELD_ENUM_HINTS, FIRST_PAGE_FIELDS } = await import("../lib/intelligence/types");
  type EligibilityAnswers = import("../lib/intelligence/types").EligibilityAnswers;

  await hydrateDbInstruments();

  // ── The population, DERIVED ────────────────────────────────────────────
  // Every field the grounded round can offer, with the values it can offer for
  // it. `region` is excluded by FIRST_PAGE_FIELDS, which is also why its
  // derived `optionsFor` never needs handling here.
  const cases: { field: string; value: unknown }[] = [];
  for (const [field, hint] of Object.entries(FIELD_ENUM_HINTS)) {
    if (FIRST_PAGE_FIELDS.has(field)) continue;
    for (const opt of hint.options) {
      cases.push({ field, value: hint.multi ? [opt.value] : opt.value });
    }
  }
  if (!cases.length) {
    console.error("\nFAIL — FIELD_ENUM_HINTS offers no field the follow-up screen "
      + "can ask.\n  There is nothing to answer, so this check proved nothing.");
    process.exit(1);
  }

  const answersFor = (c: (typeof COMPANIES)[number], over: Record<string, unknown> = {}) =>
    sanitizeEligibility({
      sector: c.sector, activities: c.activities ?? ["none"],
      useOfFunds: ["experimental_development", "industrial_research"],
      entityCountries: [c.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: c.borrowerModel ?? "operating",
      fteBand: c.fteBand, ticketBand: c.ticketBand,
      developmentStage: c.developmentStage,
      ...over,
    }) as EligibilityAnswers;

  /** The ids the writer would be shown, for one founder and one answer set.
   *  The REAL path: the same pool builder, the same accessibility screen with
   *  the same provenance, the same candidate order, the same cap. */
  async function toWriterIds(
    c: (typeof COMPANIES)[number],
    before: EligibilityAnswers,
    after: EligibilityAnswers,
    semantic: Map<string, number>,
  ): Promise<string[]> {
    resetGateHydration();
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: founderCountryList(c.country, [c.country], [c.country]),
      capitalSought: ["grant", "loan"],
      description: c.description,
      semantic,
      ...tableInputFromAnswers(after),
      log,
    } as never);
    const lateFields = PROVE ? new Set<string>() : lateAnsweredFields(
      before, after,
      withCoveredFields(openFieldsForShortlist(
        hydrated.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
        before,
      ).map((f) => f.field)));
    const accessible = accessiblePool(hydrated, after, log, lateFields);
    const { toWriter } = orderMemoCandidates({
      instrumentTable: accessible.slice(0, VERDICT_POOL),
      req: { company: c.company, country: c.country, description: c.description,
             capitalSought: ["grant", "loan"], targetMarkets: [c.country],
             eligibility: after } as never,
      records: [], dbPeers: [], eligibilityScreen: [],
      semanticScores: semantic, log, lateFields,
    });
    return toWriter.map((x) => x.row.instrumentId ?? x.row.channel);
  }

  let tested = 0, lost = 0;
  const losses: string[] = [];
  console.log(`${COMPANIES.length} founders x ${cases.length} (field, value) case(s)`
    + `${PROVE ? "   [PROVE=1: provenance disabled]" : ""}`);
  console.log("-".repeat(96));

  for (const c of COMPANIES) {
    const semantic = await semanticFundMatch(c.description);
    // The "without" run depends only on the answers MINUS the field under
    // test, so it is computed once per distinct baseline rather than once per
    // value. Most fields the archetype never answered share one.
    const baseline = new Map<string, string[]>();
    let founderLost = 0;

    for (const { field, value } of cases) {
      const before = answersFor(c, { [field]: undefined });
      const key = JSON.stringify(before);
      if (!baseline.has(key)) {
        baseline.set(key, await toWriterIds(c, before, before, semantic));
      }
      const without = baseline.get(key)!;
      const after = answersFor(c, { [field]: value });
      // `sanitizeEligibility` is the one whitelist; a value it refuses is not
      // an admissible answer and testing it would grade the sanitiser.
      if (JSON.stringify((after as Record<string, unknown>)[field])
          === JSON.stringify((before as Record<string, unknown>)[field])) continue;
      const withAnswer = new Set(await toWriterIds(c, before, after, semantic));
      tested += 1;
      const missing = without.filter((id) => !withAnswer.has(id));
      if (!missing.length) continue;
      lost += 1;
      founderLost += 1;
      if (losses.length < 25) {
        losses.push(`${c.company} · ${field}=${JSON.stringify(value)} `
          + `lost ${missing.length}: ${missing.slice(0, 4).join(", ")}`);
      }
    }
    console.log(`${c.company.slice(0, 24).padEnd(26)}`
      + `${String(founderLost).padStart(4)} answer(s) cost this founder a fund`);
  }

  console.log("-".repeat(96));
  console.log(`cases tested                                   ${tested} (floor ${MIN_CASES})`);
  console.log(`ANSWERS THAT REMOVED A FUND FROM THE WRITER     ${lost}`);
  for (const l of losses) console.log(`    ${l}`);
  if (lost > losses.length) console.log(`    ... and ${lost - losses.length} more`);

  // ── Non-vacuity, before any verdict ────────────────────────────────────
  if (tested < MIN_CASES) {
    console.error(`\nFAIL — only ${tested} case(s) ran, under the floor of ${MIN_CASES}. `
      + `A guard\n  that runs out of population reports a clean zero and proves `
      + `nothing.\n  Either the intake vocabulary, the archetypes or the join `
      + `between them has\n  shrunk. Lowering this floor is not a fix.`);
    process.exit(1);
  }

  if (PROVE) {
    // The self-test, and it is a REAL one: with provenance disabled the product
    // is the product that shipped, so a green here says today's corpus happens
    // to hold no follow-up answer that closes a door for any of the twelve.
    // That is a fact about the corpus and this check would be reporting it as a
    // fact about the code.
    if (lost === 0) {
      console.error(`\nFAIL — PROVE=1 disabled the whole mechanism and NOTHING went `
        + `red.\n  This check cannot demonstrate its own failure, so its green tells `
        + `you\n  nothing about whether a follow-up answer can hide a fund. Fix the\n`
        + `  population -- more founders, or archetypes whose pools carry encoded\n`
        + `  filters on askable fields -- rather than trusting the pass.`);
      process.exit(1);
    }
    console.log(`\nPASS (PROVE) — the disabled mechanism costs ${lost} of ${tested} `
      + `answers a fund.\n  That is the defect this guard watches, reproduced.`);
    return;
  }

  if (lost > 0) {
    console.error(`\nFAIL — ${lost} of ${tested} admissible answers REMOVED a fund from `
      + `the writer's\n  candidates. Every one is a founder who answered a question we `
      + `asked and\n  was shown fewer routes for it, with nothing on the page to say `
      + `so.\n\n`
      + `  A follow-up answer may reorder, may narrow, may put an obstacle on a\n`
      + `  row. It may not delete one: "a fund set aside on a doubt is a fund the\n`
      + `  founder never sees and never learns exists" (SELECT-4). See\n`
      + `  lib/intelligence/answerProvenance.ts.`);
    process.exit(1);
  }

  console.log(`\nPASS — over ${tested} admissible answers on ${COMPANIES.length} founders, `
    + `answering a\n  follow-up question never costs a fund its seat.`);
}

main();
