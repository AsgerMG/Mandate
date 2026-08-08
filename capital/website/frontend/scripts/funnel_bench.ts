/**
 * The whole funnel, end to end, for real companies.
 *
 * COSTS REAL MONEY. Each company runs the verdict, the three round-2
 * generators, one persona call to answer them, and a full memo.
 *
 * ── The gap this closes ────────────────────────────────────────────────────
 * memo_bench calls runIntelligence() directly with screen-1 answers only. The
 * round-2 generators live in the intake route, so no harness has ever produced
 * a single adaptive question, and no harness has ever exercised the path where
 * a founder's answers reach the brief. That is why brief defects were steadily
 * fixed while question quality decayed unnoticed: everything measured
 * improved, and this stage was not measured.
 *
 * ── The persona step ───────────────────────────────────────────────────────
 * Questions are answered by a model playing the founder, given only the
 * fixture's own description. That is what makes question QUALITY measurable
 * rather than merely question SHAPE: a persona that cannot answer from its own
 * description is looking at a question a real founder could not answer either,
 * and that is detectable without a human reading it.
 *
 * Hand-written fixture answers were considered and rejected: static answers
 * cannot catch a bad NEW question, which is the failure we are trying to see.
 *
 * Run: npx tsx scripts/funnel_bench.ts                 # 2 least-recently-tested
 *      npx tsx scripts/funnel_bench.ts --only "Platform"
 *      npx tsx scripts/funnel_bench.ts --all
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import { checkQuestions, checkGroundedQuestions } from "../lib/intelligence/questionChecks";
import { FIELD_ENUM_HINTS } from "../lib/intelligence/types";
import { checkBrief } from "../lib/intelligence/briefChecks";
import type { ProjectAnswer, ProjectQuestion } from "../lib/intelligence/types";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("funnel_bench", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

const OUT = "memo-bench";
const HISTORY = `${OUT}/funnel-history.json`;
const PERSONA_MODEL = "claude-haiku-4-5";
const SKIP = "Not sure";

interface FunnelRow {
  archetype: string; company: string; country: string;
  secs: number; error?: string | null;
  questionCount: number;
  commercialCount: number;
  unanswered: number;
  questionDefects: string[];
  briefDefects: string[];
  questions: { question: string; options: string[]; answer: string }[];
  code?: string;
}

/** One call per company: the founder answers their own screen. Deliberately
 *  given ONLY what a founder would know about themselves, never the fund's
 *  requirement text — a persona that can see the rule would answer questions a
 *  real founder could not. */
async function personaAnswers(
  client: Anthropic,
  company: string,
  description: string,
  questions: ProjectQuestion[],
): Promise<Map<string, string>> {
  if (!questions.length) return new Map();
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { id: { type: "string" }, choice: { type: "string" } },
          required: ["id", "choice"],
        },
      },
    },
    required: ["answers"],
  } as const;

  const list = questions
    .map((q) => `id: ${q.id}\nQ: ${q.question}\noptions: ${q.options.join(" | ")}`)
    .join("\n\n");

  const res = await client.messages.create({
    model: PERSONA_MODEL,
    max_tokens: 1200,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema } },
    messages: [{
      role: "user",
      content:
        `You are the founder of ${company}. This is your company, in your own ` +
        `words:\n\n"${description}"\n\nYou are filling in a funding ` +
        `application screen. Answer each question below by choosing EXACTLY ` +
        `one of its listed options, copied verbatim.\n\n` +
        `If your own description genuinely does not tell you the answer, and ` +
        `you could not answer it from memory as this founder, choose ` +
        `"${SKIP}" instead. Do not guess to be helpful: an honest "${SKIP}" ` +
        `is the useful signal here.\n\n${list}\n\nReturn ONLY the JSON.`,
    }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text).join("");
  const body = text.slice(text.search(/[{[]/));
  const parsed = JSON.parse(body) as { answers: { id: string; choice: string }[] };
  return new Map((parsed.answers ?? []).map((a) => [a.id, a.choice]));
}

async function main() {
  const all = process.argv.includes("--all");
  const onlyArg = process.argv.indexOf("--only");
  const only = onlyArg > -1 ? (process.argv[onlyArg + 1] ?? "").split(",").map((s) => s.trim()) : null;
  const sampleArg = process.argv.indexOf("--sample");
  const sample = sampleArg > -1 ? Number(process.argv[sampleArg + 1]) : 2;

  mkdirSync(OUT, { recursive: true });
  const history: Record<string, number> = existsSync(HISTORY)
    ? JSON.parse(readFileSync(HISTORY, "utf8")) : {};

  let queue = COMPANIES;
  if (only) queue = queue.filter((c) => only.some((o) => c.archetype.includes(o)));
  else if (!all) {
    queue = [...COMPANIES].sort((a, b) => (history[a.archetype] ?? 0) - (history[b.archetype] ?? 0))
      .slice(0, sample);
  }

  const client = new Anthropic();
  const { computeVerdict, runIntelligence } = await import("../lib/intelligence/pipeline");
  const { planAdaptiveScreen } = await import("../lib/intelligence/adaptiveRound");
  const { openFieldsForShortlist, openProjectGatesForShortlist } =
    await import("../lib/intelligence/gateReach");

  let code: string | undefined;
  try {
    code = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim() +
      (execSync("git status --porcelain", { encoding: "utf8" }).trim() ? "+dirty" : "");
  } catch { /* not a git checkout */ }

  console.log(`\nrunning ${queue.length} companies through the FULL funnel\n`);
  const rows: FunnelRow[] = [];

  for (const c of queue) {
    const t0 = Date.now();
    let error: string | null = null;
    const row: Partial<FunnelRow> = { archetype: c.archetype, company: c.company, country: c.country };
    try {
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

      // 1. the deterministic screen, exactly as the verdict route runs it
      const verdict = await computeVerdict(c.company, c.country, eligibility, {
        capitalSought: ["grant", "loan"], description: c.description,
      });

      // 2. round 2, exactly as the intake route runs it
      const openFields = openFieldsForShortlist(verdict.candidateInstrumentIds, eligibility);
      const projectGates = openProjectGatesForShortlist(verdict.candidateInstrumentIds, eligibility, {
        deprioritiseFields: openFields.map((f) => f.field), limit: 5,
      });
      const screen = await planAdaptiveScreen(req, openFields.slice(0, 6), projectGates);
      const round = screen ? { questions: screen.questions } : null;
      const asked: ProjectQuestion[] = screen?.projectQuestions ?? [];
      const commercialQs = asked.filter((q) => q.id.startsWith("commercial::"));

      // 3. the founder answers their own screen
      const answers = await personaAnswers(client, c.company, c.description, asked);
      const unanswered = asked.filter((q) => (answers.get(q.id) ?? SKIP) === SKIP).length;
      const projectAnswers: ProjectAnswer[] = asked
        .filter((q) => (answers.get(q.id) ?? SKIP) !== SKIP)
        .map((q) => ({
          questionId: q.id, question: q.question, answer: answers.get(q.id)!,
          instrumentId: q.instrumentId, instrumentName: q.instrumentName,
          gateKey: q.gateKey, quote: q.quote, locator: q.locator,
        }));

      // 4. the brief, with the answers a founder actually gave
      let report: Record<string, unknown> | null = null;
      await runIntelligence({ ...(req as object), projectAnswers } as never, (e: { type: string; data?: unknown; message?: string }) => {
        if (e.type === "report") report = e.data as Record<string, unknown>;
        if (e.type === "error") error = e.message ?? "unknown error";
      });

      row.questionCount = asked.length + (round?.questions.length ?? 0);
      row.commercialCount = commercialQs.length;
      row.unanswered = unanswered;
      // BOTH halves. The enum-answered questions were bypassing every check:
      // the harness only scored the ones the model wrote options for, which
      // is precisely where the worst live defect was (a question and its
      // options answering different things).
      const groundedForCheck = (round?.questions ?? []).map((q) => ({
        question: q.question,
        options: (FIELD_ENUM_HINTS[q.field]?.options ?? []).map((o) => o.label),
        field: q.field,
      }));
      row.questionDefects = [
        ...checkQuestions({ questions: asked, description: c.description, expectCommercial: true }),
        ...checkGroundedQuestions(groundedForCheck),
      ].map((v) => v.ruleId);
      row.briefDefects = report ? checkBrief(report as never).map((v) => v.ruleId) : ["no report"];
      row.questions = asked.map((q) => ({
        question: q.question, options: q.options, answer: answers.get(q.id) ?? SKIP,
      }));
    } catch (err) {
      error = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    }
    const secs = Math.round((Date.now() - t0) / 1000);
    rows.push({ ...(row as FunnelRow), secs, error, code });
    history[c.archetype] = Date.now();
    console.log(
      `  ${c.archetype.padEnd(26)} ${String(row.questionCount ?? 0).padEnd(4)}q ` +
      `${String(row.commercialCount ?? 0)}c ${String(row.unanswered ?? 0)}skip ${secs}s  ` +
      (error ? `ERROR: ${error.split("\n")[0]}`
        : [...(row.questionDefects ?? []), ...(row.briefDefects ?? [])].join(", ") || "clean"));
  }

  const stamp = Date.now();
  writeFileSync(HISTORY, JSON.stringify(history, null, 1));
  writeFileSync(`${OUT}/funnel-${stamp}.json`, JSON.stringify(rows, null, 1));
  console.log(`\nwrote ${OUT}/funnel-${stamp}.json`);
  console.log("columns: questions asked / of which commercial / unanswerable by the founder\n");
}

main();
