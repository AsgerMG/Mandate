/**
 * ASKING A FOUNDER A QUESTION MAY NOT COST THEM A FUND.
 *
 * ── The property ─────────────────────────────────────────────────────────
 *
 *   For any founder, any field the follow-up screen can ask, and any
 *   admissible value of it, the funds surviving the ACCESSIBILITY SCREEN with
 *   the answer are a SUPERSET of those surviving without it.
 *
 * Answering may reorder, may narrow the wording, may put an obstacle on a row.
 * It may not take the row out of the universe. That is the owner's binding
 * decision -- second-screen answers INFORM the ranker and never REMOVE a fund
 * -- and it is already licensed by SELECT-4: "A doubt is not a rejection... a
 * fund set aside on a doubt is a fund the founder never sees and never learns
 * exists."
 *
 * ── Why the surface is the accessible pool and not `toWriter` ─────────────
 * This was first written against `toWriter` and it was the wrong surface. The
 * distinction is not a technicality; it is the difference between the defect
 * and the design.
 *
 * Measured over 12 founders x 696 admissible answers on the committed snapshot,
 * with the provenance mechanism working:
 *
 *   answers that changed which rows the SELECTOR picked           0
 *   answers that REMOVED a fund at the accessibility screen       0
 *   answers that cost a fund its seat in `toWriter`             121
 *
 * Nothing is removed and 121 rows still move. They move because
 * `WRITER_CANDIDATE_CAP` is 8: a late answer that turns `unknown` into
 * `one_blocker`, or `open` into `one_blocker`, changes the band a row sorts in,
 * and past a cap a demotion at the tail is a row that does not publish.
 *
 * So `toWriter`-superset is not a statement about the verdict engine. It is a
 * statement about the CAP, and the only code that satisfies it is code in which
 * a follow-up answer changes nothing at all -- the same product as not asking.
 * A guard asserting it would be demanding that the second screen be inert, and
 * would go red on every correct implementation. Depth and the writer cap are
 * P2's, and P2 owns that number honestly; this guard owns removal.
 *
 * The displacement count is printed below every run so it is never invisible,
 * and it is NOT a failure. A number a guard reports without enforcing has to
 * say so in as many words, or it is a measurement wearing a guard's name.
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
 * ── The population is DERIVED, and from the table that decides it ────────
 * `FIELD_REACH[field].via === "adaptive"` -- the fields the grounded round can
 * actually offer -- intersected with `FIELD_ENUM_HINTS`, which supplies the
 * options. Nothing here names a field or a value, so a field that moves onto or
 * off the follow-up screen joins or leaves this check on the same commit, and a
 * new option is tested the day it is added.
 *
 * `via` rather than `!FIRST_PAGE_FIELDS`, and the difference is not cosmetic:
 * the complement of the first page also contains `lossesOverHalfCapital`, which
 * is `via: "derived"` -- never asked, computed by `sanitizeEligibility` from the
 * exclusions checklist. Testing it directly builds a founder who ticked "none"
 * on the checklist and separately declared accumulated losses over half of
 * share capital, which the intake cannot produce. It was the whole of this
 * check's residual red, and grading the product on an answer no founder can
 * give is how a guard comes to demand a change that would make the product
 * worse.
 *
 * ── PROVE=1 ──────────────────────────────────────────────────────────────
 * Simulates the defect: the pipeline as it stood, where the accessibility
 * screen never heard when the answer arrived. If that produces NO red, THIS
 * CHECK FAILS -- a guard that cannot demonstrate its own failure over today's
 * corpus is green-lighting a corpus where nothing happens to block, not a
 * product that cannot hide a fund.
 *
 * ── Hermetic ─────────────────────────────────────────────────────────────
 * Runs on the committed snapshot under `NO_PG=1` (which is how CI runs it) and
 * makes no model call of any kind. ~700 pool builds, a couple of minutes.
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
 *  over nothing. Set well under the ~660 the population generates today, so a
 *  vocabulary that shrinks a little does not fail the build, and one that
 *  collapses does. */
const MIN_CASES = 400;

async function main() {
  const { hydrateDbInstruments, resetGateHydration } = await import("../lib/intelligence/corpus");
  const {
    buildInstrumentTableHydrated, founderCountryList, tableInputFromAnswers,
  } = await import("../lib/intelligence/shortlist");
  const { ExclusionLog } = await import("../lib/intelligence/exclusions");
  const { accessiblePool, orderMemoCandidates, WRITER_CANDIDATE_CAP } =
    await import("../lib/intelligence/memoCandidates");
  const { VERDICT_POOL } = await import("../lib/intelligence/shortlist");
  const { lateAnsweredFields, withCoveredFields } = await import("../lib/intelligence/answerProvenance");
  const { openFieldsForShortlist } = await import("../lib/intelligence/gateReach");
  const { semanticFundMatch } = await import("../lib/intelligence/semantic");
  const { sanitizeEligibility } = await import("../lib/intelligence/sanitize");
  const { COMPANIES } = await import("../lib/intelligence/__benchCompanies");
  const { FIELD_ENUM_HINTS, FIELD_REACH } = await import("../lib/intelligence/types");
  type EligibilityAnswers = import("../lib/intelligence/types").EligibilityAnswers;

  await hydrateDbInstruments();

  // ── The population, DERIVED ────────────────────────────────────────────
  const cases: { field: string; value: unknown }[] = [];
  for (const [field, hint] of Object.entries(FIELD_ENUM_HINTS)) {
    if (FIELD_REACH[field as keyof typeof FIELD_REACH]?.via !== "adaptive") continue;
    for (const opt of hint.options) {
      cases.push({ field, value: hint.multi ? [opt.value] : opt.value });
    }
  }
  if (!cases.length) {
    console.error("\nFAIL — no field is declared `via: \"adaptive\"` with an option set, "
      + "so the\n  follow-up screen can ask nothing and this check proved nothing.");
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

  interface Run {
    /** Every row the accessibility screen let through. NO CAP: this is the
     *  universe, and it is the surface the property is stated over. */
    accessible: string[];
    /** The eight the writer is shown. Reported, never enforced — see the
     *  header for why a cap is not a removal. */
    toWriter: string[];
  }

  /** One founder, one answer set, down the REAL path: the same pool builder,
   *  the same accessibility screen with the same provenance, the same candidate
   *  order, the same cap. */
  async function run(
    c: (typeof COMPANIES)[number],
    before: EligibilityAnswers,
    after: EligibilityAnswers,
    semantic: Map<string, number>,
  ): Promise<Run> {
    resetGateHydration();
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: founderCountryList(c.country, [c.country]),
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
             capitalSought: ["grant", "loan"],
             eligibility: after } as never,
      records: [], dbPeers: [], eligibilityScreen: [],
      log, lateFields,
    });
    return {
      accessible: accessible.map((r) => r.instrumentId ?? r.channel),
      toWriter: toWriter.map((x) => x.row.instrumentId ?? x.row.channel),
    };
  }

  let tested = 0, removed = 0, displaced = 0;
  const losses: string[] = [];
  console.log(`${COMPANIES.length} founders x ${cases.length} (field, value) case(s)`
    + `${PROVE ? "   [PROVE=1: provenance disabled]" : ""}`);
  console.log("-".repeat(96));

  for (const c of COMPANIES) {
    const semantic = await semanticFundMatch(c.description);
    // The "without" run depends only on the answers MINUS the field under
    // test, so it is computed once per distinct baseline rather than once per
    // value. Most fields the archetype never answered share one.
    const baseline = new Map<string, Run>();
    let founderRemoved = 0, founderDisplaced = 0;

    for (const { field, value } of cases) {
      const before = answersFor(c, { [field]: undefined });
      const key = JSON.stringify(before);
      if (!baseline.has(key)) baseline.set(key, await run(c, before, before, semantic));
      const without = baseline.get(key)!;
      const after = answersFor(c, { [field]: value });
      // `sanitizeEligibility` is the one whitelist; a value it refuses is not
      // an admissible answer and testing it would grade the sanitiser.
      if (JSON.stringify((after as Record<string, unknown>)[field])
          === JSON.stringify((before as Record<string, unknown>)[field])) continue;
      const withAnswer = await run(c, before, after, semantic);
      tested += 1;

      // ── The property ─────────────────────────────────────────────────
      // No restriction to "rows both runs selected". If the SELECTOR ever
      // starts dropping a row on a follow-up answer, that is still a founder
      // who answered a question and lost a fund, and a guard scoped to the
      // verdict engine would report a serene zero through it.
      const stillThere = new Set(withAnswer.accessible);
      const gone = without.accessible.filter((id) => !stillThere.has(id));
      if (gone.length) {
        removed += 1;
        founderRemoved += 1;
        if (losses.length < 25) {
          losses.push(`${c.company} · ${field}=${JSON.stringify(value)} `
            + `lost ${gone.length}: ${gone.slice(0, 4).join(", ")}`);
        }
      }

      // Reported, not enforced.
      const seated = new Set(withAnswer.toWriter);
      if (without.toWriter.some((id) => !seated.has(id))) {
        displaced += 1;
        founderDisplaced += 1;
      }
    }
    console.log(`${c.company.slice(0, 24).padEnd(26)}`
      + `${String(founderRemoved).padStart(4)} removed`
      + `${String(founderDisplaced).padStart(6)} displaced past the writer cap`);
  }

  console.log("-".repeat(96));
  console.log(`cases tested                                   ${tested} (floor ${MIN_CASES})`);
  console.log(`ANSWERS THAT REMOVED A FUND FROM THE POOL       ${removed}`);
  for (const l of losses) console.log(`    ${l}`);
  if (removed > losses.length) console.log(`    ... and ${removed - losses.length} more`);
  console.log(`answers that displaced one past WRITER_CANDIDATE_CAP=${WRITER_CANDIDATE_CAP}`
    + `   ${displaced}   NOT A FAILURE`);
  console.log(`  Reported so it is never invisible. A late answer that turns \`unknown\` or`);
  console.log(`  \`open\` into \`one_blocker\` moves the row's BAND, and past a cap a demotion`);
  console.log(`  at the tail does not publish. That is the cap, and P2 owns it; the only`);
  console.log(`  code with a zero here is code where answering changes nothing.`);

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
    if (removed === 0) {
      console.error(`\nFAIL — PROVE=1 disabled the whole mechanism and NOTHING went `
        + `red.\n  This check cannot demonstrate its own failure, so its green tells `
        + `you\n  nothing about whether a follow-up answer can hide a fund. Fix the\n`
        + `  population -- more founders, or archetypes whose pools carry encoded\n`
        + `  filters on askable fields -- rather than trusting the pass.`);
      process.exit(1);
    }
    console.log(`\nPASS (PROVE) — the disabled mechanism costs ${removed} of ${tested} `
      + `answers a fund.\n  That is the defect this guard watches, reproduced.`);
    return;
  }

  if (removed > 0) {
    console.error(`\nFAIL — ${removed} of ${tested} admissible answers REMOVED a fund from `
      + `the founder's\n  pool. Every one is a founder who answered a question we asked `
      + `and was\n  shown fewer routes for it, with nothing on the page to say so.\n\n`
      + `  A follow-up answer may reorder, may narrow, may put an obstacle on a\n`
      + `  row. It may not delete one: "a fund set aside on a doubt is a fund the\n`
      + `  founder never sees and never learns exists" (SELECT-4). See\n`
      + `  lib/intelligence/answerProvenance.ts.`);
    process.exit(1);
  }

  console.log(`\nPASS — over ${tested} admissible answers on ${COMPANIES.length} founders, `
    + `answering a\n  follow-up question never costs a fund its place in the pool.`);
}

main();
