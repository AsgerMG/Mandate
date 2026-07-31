/**
 * Generate the round-2 screen for every archetype, and nothing else.
 *
 * Costs one planner call per company — no research, no writer, no memo. That
 * makes it cheap enough to run whenever the questions change, which the full
 * funnel bench is not: that one pays for a complete brief to see a screen.
 *
 * Writes __fixtures/questions.json, which /brief/preview/questions renders, so
 * a whole set can be read side by side rather than one company at a time.
 *
 * Run: npx tsx scripts/questions_bench.ts [--only "AI B2C,GovTech"]
 */
import { readFileSync, writeFileSync } from "node:fs";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the environment */ }

async function main() {
  const onlyArg = process.argv.indexOf("--only");
  const only = onlyArg > -1 ? (process.argv[onlyArg + 1] ?? "").split(",").map((s) => s.trim()) : null;

  const { COMPANIES } = await import("../lib/intelligence/__benchCompanies");
  const { sanitizeEligibility } = await import("../lib/intelligence/sanitize");
  const { computeVerdict } = await import("../lib/intelligence/pipeline");
  const { planAdaptiveScreen } = await import("../lib/intelligence/adaptiveRound");
  const { openFieldsForShortlist, openProjectGatesForShortlist } =
    await import("../lib/intelligence/gateReach");
  const { FIELD_ENUM_HINTS } = await import("../lib/intelligence/types");
  const { checkQuestions, checkGroundedQuestions } =
    await import("../lib/intelligence/questionChecks");

  const queue = only ? COMPANIES.filter((c) => only.some((o) => c.archetype.includes(o))) : COMPANIES;
  const out: { archetype: string; company: string; question: string; options: string[]; answer: string; source: string }[] = [];

  for (const c of queue) {
    const eligibility = sanitizeEligibility({
      sector: c.sector, entityCountries: [c.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: c.borrowerModel ?? "operating", activities: c.activities,
      fteBand: c.fteBand, ticketBand: c.ticketBand, developmentStage: c.developmentStage,
      useOfFunds: ["experimental_development", "industrial_research"],
    } as never);
    const req = {
      company: c.company, country: c.country, description: c.description,
      capitalSought: ["grant", "loan"], eligibility,
    } as never;

    const verdict = await computeVerdict(c.company, c.country, eligibility, {
      capitalSought: ["grant", "loan"], description: c.description,
    });
    const openFields = openFieldsForShortlist(verdict.candidateInstrumentIds, eligibility);
    const projectGates = openProjectGatesForShortlist(verdict.candidateInstrumentIds, eligibility, {
      deprioritiseFields: openFields.map((f) => f.field), limit: 6,
    });
    const { instById } = await import("../lib/intelligence/shortlist");
    const candidates = verdict.candidateInstrumentIds.slice(0, 8).map((id) => {
      const i = instById().get(id);
      return i ? { name: i.name, country: i.country, supportType: i.capitalType } : null;
    }).filter((c): c is { name: string; country: string; supportType: string } => Boolean(c));
    const screen = await planAdaptiveScreen(req, openFields.slice(0, 6), projectGates, candidates);

    const enumQs = (screen?.questions ?? []).map((q) => ({
      question: q.question,
      options: (FIELD_ENUM_HINTS[q.field]?.options ?? []).map((o) => o.label),
      source: "field",
    }));
    const written = (screen?.projectQuestions ?? []).map((q) => ({
      question: q.question, options: q.options,
      source: q.id.startsWith("commercial::") ? "commercial" : "gate",
    }));

    const defects = [
      ...checkQuestions({ questions: screen?.projectQuestions ?? [], description: c.description, expectCommercial: true }),
      ...checkGroundedQuestions(enumQs),
    ];
    const total = enumQs.length + written.length;
    console.log(
      `  ${c.archetype.padEnd(26)} ${String(total).padStart(2)}q ` +
      `(${enumQs.length} fixed, ${written.filter((w) => w.source === "gate").length} gate, ` +
      `${written.filter((w) => w.source === "commercial").length} commercial)  ` +
      (defects.length ? defects.map((d) => d.ruleId).join(", ") : "clean"));

    for (const q of [...enumQs, ...written]) {
      out.push({ archetype: c.archetype, company: c.company, answer: "", ...q });
    }
  }

  writeFileSync("lib/intelligence/__fixtures/questions.json", JSON.stringify(out, null, 1));
  console.log(`\nwrote ${out.length} questions across ${queue.length} archetypes`);
}

main();
