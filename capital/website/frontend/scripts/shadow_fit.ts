/**
 * Shadow comparison: what the hardcoded rules publish vs what the fit score
 * would publish, on every archetype.
 *
 * FREE — the whole selection path is model-free, so this needs no API key and
 * costs nothing. It can run on every commit.
 *
 * ── Why shadow rather than switch ─────────────────────────────────────────
 * The rules being replaced each removed funds silently, so nobody could say
 * what removing them would cost. Turning the new ranking on and reading the
 * output is how you discover months later that a class of fund quietly
 * vanished. Running both and comparing is how a ranking is normally replaced.
 *
 * Exit condition for Phase 4 (see brief_output_architecture.md): the scored
 * ordering must publish at least as many accessible funds per archetype, and
 * every fund it drops that the rules kept has to be explainable.
 *
 * Run: npx tsx scripts/shadow_fit.ts
 *      npx tsx scripts/shadow_fit.ts --verbose
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("shadow_fit", ["DATABASE_URL", "VOYAGE_KEY"]);

const PUBLISHED = 5;

async function main() {
  const verbose = process.argv.includes("--verbose");
  const { ARCHETYPES } = await import("../lib/intelligence/__archetypes");
  const S = await import("../lib/intelligence/shortlist");
  const { assessAll } = await import("../lib/intelligence/verdict");
  const { scoreFit, rankByFit, sectorFitScorer } = await import("../lib/intelligence/fit");
  const { themeRelevance } = await import("../lib/intelligence/relevance");
  const { ExclusionLog } = await import("../lib/intelligence/exclusions");
  const { instById, CAPITAL_SOUGHT_TO_DB } = S;
  const year = new Date().getFullYear();

  let warnedNoSemantic = false;
  let regressions = 0;
  const rows: string[] = [];

  for (const a of ARCHETYPES) {
    const eligibility = {
      sector: a.sector, entityCountries: [a.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: a.borrowerModel ?? "operating",
      fteBand: "10-49", ticketBand: "b500k_2m5", developmentStage: "prototype",
      useOfFunds: ["experimental_development", "industrial_research"],
      activities: a.activities,
    } as never;
    const capitalSought = ["grant", "loan"];
    const founderCountries = [a.country];

    // ── what ships today ──────────────────────────────────────────────────
    const log = new ExclusionLog();
    const current = S.buildInstrumentTable({
      fieldChannels: new Set<string>(),
      ticketBand: "b500k_2m5",
      consortiumOk: true,
      founderCountries,
      capitalSought,
      description: a.description,
      log,
    });
    const currentIds = current.map((r) => r.instrumentId).filter(Boolean) as string[];

    // ── what the score would ship ─────────────────────────────────────────
    // Scored over the WHOLE corpus, not the pre-filtered table: the point is
    // that funds the channel rules never surfaced get a chance to rank.
    const { publishableInstruments, toIso2 } = await import("../lib/intelligence/corpus");
    const all = publishableInstruments().filter((i) => i.sourceFamilyBucket);
    const assessments = assessAll(all.map((i) => i.id), eligibility);
    // Production ranks on the semantic index (instrument_profiles); the
    // lexical one is the offline fallback. Scoring the fallback and calling it
    // the fit score's performance would be testing a path no founder takes.
    const { semanticFundMatch } = await import("../lib/intelligence/semantic");
    const semantic = await semanticFundMatch(a.description);
    const theme = semantic.size ? semantic : themeRelevance(a.description, all.map((i) => i.id));
    if (!semantic.size && !warnedNoSemantic) {
      console.warn("! no semantic index available — scoring the lexical fallback, which is NOT the production path\n");
      warnedNoSemantic = true;
    }
    const capitalWanted = new Set(capitalSought.flatMap((c) => CAPITAL_SOUGHT_TO_DB[c] ?? []));
    const iso = new Set(founderCountries.map((c) => toIso2(c).toUpperCase()).filter(Boolean));
    const maxComparable = 0; // no peer evidence on the deterministic path
    // Solved over the pool being scored, never a constant -- see sectorFitScorer.
    const sectorNeutralFor = sectorFitScorer(all, a.sector);
    const scored = all.map((inst) => scoreFit({
      instrument: inst,
      assessment: assessments.get(inst.id),
      theme: theme.get(inst.id),
      sectorNeutral: sectorNeutralFor(null),
      ticketBand: "b500k_2m5",
      capitalWanted,
      comparableCount: 0,
      maxComparable,
      founderCountries: iso,
      requiresConsortium: inst.gates.some((g) => /consorti|at least three|3\+ partners|multi-partner/i.test(g.requirement)),
      consortiumOk: undefined,
      founderSector: a.sector,
      year,
    }));
    const ranked = rankByFit(scored, (id) => instById().get(id)?.name ?? id).slice(0, PUBLISHED);

    // ── compare ───────────────────────────────────────────────────────────
    const currentAccessible = currentIds
      .filter((id) => assessments.get(id)?.status !== "blocked")
      .slice(0, PUBLISHED);
    const newIds = ranked.map((r) => r.instrumentId);
    const lost = currentAccessible.filter((id) => !newIds.includes(id));
    const gained = newIds.filter((id) => !currentAccessible.includes(id));
    const thinner = newIds.length < currentAccessible.length;
    if (thinner) regressions += 1;

    rows.push(
      `${a.label.slice(0, 26).padEnd(27)}` +
      `${String(currentAccessible.length).padEnd(5)}` +
      `${String(newIds.length).padEnd(5)}` +
      `${String(lost.length).padEnd(6)}` +
      `${String(gained.length).padEnd(7)}` +
      `${log.summary()}`);

    if (verbose) {
      const name = (id: string) => instById().get(id)?.name ?? id;
      rows.push(`    today: ${currentAccessible.map(name).join(" | ") || "(none)"}`);
      rows.push(`    score: ${ranked.map((r) => `${name(r.instrumentId)} ${r.score}`).join(" | ") || "(none)"}`);
      if (lost.length) rows.push(`    LOST:  ${lost.map(name).join(" | ")}`);
    }
  }

  console.log("archetype".padEnd(27) + "now  new  lost  gained  exclusions fired");
  console.log("-".repeat(110));
  for (const r of rows) console.log(r);
  console.log("-".repeat(110));
  console.log(regressions === 0
    ? `no archetype publishes fewer accessible funds under the fit score`
    : `${regressions} archetype(s) publish FEWER funds under the fit score — not ready for Phase 4`);
}

main();
