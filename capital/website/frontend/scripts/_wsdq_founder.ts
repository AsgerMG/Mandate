// wsDQ — THE FOUNDER, FROZEN, so both arms meet the same one.
//
// ── Why the founder has to be a FILE and not a function call ──────────────
// `AGENT_SELECT` is read once at module scope, deliberately: a flag consulted
// per call can change mid-run, and a flag that treats a typo as "off" reports
// the control's number under the treatment's name. The price of that is that
// the two arms are two PROCESSES, and anything non-deterministic upstream of
// the seam would then differ between them for reasons that have nothing to do
// with the arm.
//
// The adaptive round is the largest such thing: a planner call writes the
// questions and a persona call answers them, and neither is reproducible. So
// it is run ONCE, here, and written to disk. `_wsdq_run.ts` reads the file.
// Both arms therefore receive a byte-identical `IntelligenceRequest`, and the
// only remaining upstream nondeterminism is the comparable-company web search
// inside `runIntelligence` -- which the seam trace records the pool for, on
// both arms, so it can be checked rather than assumed.
//
// ── What is honest about this founder, and what is not ────────────────────
// The intake comes from `founderIntake`, whose dispositions are declared per
// field with a leak argument each: real name, own award history WITHHELD,
// capital preference WITHHELD, ticket and region admitted only from an award
// under a DIFFERENT notified scheme. Seventeen fields have no leak-free source
// and are left blank rather than pinned.
//
// The adaptive round then asks about exactly those blanks, and the persona
// answers them from the company's OWN DESCRIPTION AND NOTHING ELSE -- it is
// never shown a fund, a requirement or the shortlist. So an answer it gives is
// an answer a founder could have given, and "Not sure" is the truthful reply
// where the description does not say. That distinction is the point: a founder
// whose description is one of the eleven canned sector sentences will answer
// almost nothing, and the run should show that rather than paper over it.
//
//   COMPANY="Cisteo MEDICAL" npx tsx scripts/_wsdq_founder.ts
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import Anthropic from "@anthropic-ai/sdk";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsdq_founder", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

import { inferProfileSignal, planAdaptiveScreen } from "../lib/intelligence/adaptiveRound";
import { costOf } from "../lib/intelligence/cost";
import {
  corpusProvenance, hydrateDbInstruments, hydrateGatesFor, loadDbInstruments,
  publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import {
  distinctFamilyCount, openFieldsForShortlist, openProjectGatesForShortlist,
  openQuestionsForShortlist, stakesByFund,
} from "../lib/intelligence/gateReach";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { instById } from "../lib/intelligence/shortlist";
import { FIELD_ENUM_HINTS } from "../lib/intelligence/types";
import type {
  EligibilityAnswers, ProjectAnswer, ProjectQuestion,
} from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, INTAKE_SOURCE } from "./founderIntake";
import { loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";
import { OUT_ROOT, slugOf } from "./_wsdq_paths";

/** The intake route's own constants. Read from the route's behaviour rather
 *  than invented: a harness that asks a different number of questions is
 *  measuring a different product. */
const MIN_REACH_PCT = 5;
const MIN_FAMILIES = 1;
const GENERIC_QUESTION_CAP = 6;
const PROJECT_QUESTION_CAP = 5;
const SKIP = "Not sure";
const PERSONA_MODEL = "claude-haiku-4-5";

interface Asked {
  id: string;
  kind: "generic" | "project";
  field?: string;
  question: string;
  /** What the founder is shown. For a generic question these are LABELS whose
   *  enum values are carried alongside, so an answer maps back to the
   *  vocabulary contract rather than to prose. */
  options: string[];
  values?: string[];
}

/**
 * One call. The founder answers their own screen, seeing only what they wrote
 * about themselves.
 *
 * Deliberately NOT shown the requirement text a question was phrased from. A
 * persona that can read the rule answers questions a real founder could not,
 * and every number taken afterwards is then a number about a founder who does
 * not exist -- which is the exact defect `founderIntake` was written to remove
 * from this repo.
 */
async function persona(
  client: Anthropic, company: string, description: string, asked: Asked[],
): Promise<{ answers: Map<string, string>; eur: number; raw: string }> {
  if (!asked.length) return { answers: new Map(), eur: 0, raw: "" };
  const list = asked.map((q) =>
    `id: ${q.id}\nQ: ${q.question}\noptions: ${[...q.options, SKIP].join(" | ")}`).join("\n\n");
  const res = await client.messages.create({
    model: PERSONA_MODEL,
    max_tokens: 1500,
    thinking: { type: "disabled" },
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            answers: {
              type: "array",
              items: {
                type: "object", additionalProperties: false,
                properties: { id: { type: "string" }, choice: { type: "string" } },
                required: ["id", "choice"],
              },
            },
          },
          required: ["answers"],
        },
      },
    },
    messages: [{
      role: "user",
      content:
        `You are the founder of ${company}. This is your company, in your own ` +
        `words:\n\n"${description}"\n\nYou are filling in a funding application ` +
        `screen. Answer each question below by choosing EXACTLY one of its ` +
        `listed options, copied verbatim.\n\nIf your own description genuinely ` +
        `does not tell you the answer, and you could not answer it from memory ` +
        `as this founder, choose "${SKIP}" instead. Do not guess to be helpful: ` +
        `an honest "${SKIP}" is the useful signal here.\n\n${list}\n\n` +
        `Return ONLY the JSON.`,
    }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text).join("");
  const parsed = JSON.parse(text.slice(text.search(/[{[]/))) as
    { answers: { id: string; choice: string }[] };
  return {
    answers: new Map((parsed.answers ?? []).map((a) => [a.id, a.choice])),
    eur: costOf(res.model ?? PERSONA_MODEL, res.usage as never),
    raw: text,
  };
}

async function main() {
  const want = process.env.COMPANY ?? "";
  if (!want) throw new Error("COMPANY= is required");

  await hydrateDbInstruments();
  requireLiveCorpus("wsdq_founder");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const { rows: all, file: setFile } = loadRecallSet("wsdq founder");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  const t = pop.graded.find((r) => r.name.toLowerCase().includes(want.toLowerCase()));
  if (!t) throw new Error(`no graded recall row matching COMPANY="${want}"`);

  resetRankerTally();
  const policy = founderPolicyFromEnv();
  const f = founderIntake(t, policy);
  const description = f.opts.description ?? "";
  let eur = 0;

  // ── The first screen, exactly as the verdict route runs it ───────────────
  const verdict = await computeVerdict(f.company, f.country, f.eligibility as never, {
    capitalSought: f.opts.capitalSought,
    description,
    targetMarkets: f.opts.targetMarkets,
    ownHistory: f.opts.ownHistory,
  } as never);
  const candidateIds = verdict.candidateInstrumentIds ?? [];
  await hydrateGatesFor(candidateIds);

  // ── Round two, exactly as the intake route runs it ───────────────────────
  const req0 = {
    company: f.company, country: f.country, description,
    capitalSought: f.opts.capitalSought, targetMarkets: f.opts.targetMarkets,
    eligibility: f.eligibility,
  };
  const openFields = openFieldsForShortlist(candidateIds, f.eligibility as never);
  const families = distinctFamilyCount(candidateIds);
  const needsRound = openFields.length > 0
    && openFields[0].reachPct >= MIN_REACH_PCT && families > MIN_FAMILIES;
  const genericFields = openFields.slice(0, GENERIC_QUESTION_CAP);
  const openQuestions = openQuestionsForShortlist(candidateIds, f.eligibility as never);
  const projectGates = openProjectGatesForShortlist(candidateIds, f.eligibility as never, {
    deprioritiseFields: genericFields.map((x) => x.field), limit: PROJECT_QUESTION_CAP,
  });
  const [screen, profileSignal] = await Promise.all([
    planAdaptiveScreen(req0 as never, needsRound ? genericFields : [], projectGates,
      candidateIds.slice(0, 8).map((id) => {
        const inst = instById().get(id);
        return inst ? { name: inst.name, country: inst.country, supportType: inst.capitalType } : null;
      }).filter((c): c is { name: string; country: string; supportType: string } => Boolean(c)),
      stakesByFund(candidateIds, f.eligibility as never), openQuestions),
    inferProfileSignal(req0 as never),
  ]);

  // ── The founder answers ──────────────────────────────────────────────────
  const generic: Asked[] = (screen?.questions ?? []).map((q) => {
    const opts = q.options?.length ? q.options : (FIELD_ENUM_HINTS[q.field]?.options ?? []);
    return {
      id: `field::${q.field}`, kind: "generic" as const, field: q.field,
      question: q.question, options: opts.map((o) => o.label), values: opts.map((o) => o.value),
    };
  }).filter((q) => q.options.length);
  const project: ProjectQuestion[] = screen?.projectQuestions ?? [];
  const asked: Asked[] = [
    ...generic,
    ...project.map((q) => ({
      id: q.id, kind: "project" as const, question: q.question, options: q.options,
    })),
  ];
  const p = await persona(new Anthropic(), f.company, description, asked);
  eur += p.eur;

  // ── Merged exactly as `panel.tsx advanceRound` merges ────────────────────
  // Generic answers become eligibility fields; project answers stay separate
  // and carry their fund and gate citation to the writer.
  const merged: EligibilityAnswers = { ...f.eligibility };
  const genericChosen: { field: string; question: string; label: string; value: string }[] = [];
  for (const q of generic) {
    const label = p.answers.get(q.id);
    if (!label || label === SKIP) continue;
    const i = q.options.indexOf(label);
    if (i < 0 || !q.values?.[i]) continue;
    const hint = FIELD_ENUM_HINTS[q.field!];
    const value: string | string[] = hint?.multi ? [q.values[i]] : q.values[i];
    (merged as Record<string, unknown>)[q.field!] = value;
    genericChosen.push({ field: q.field!, question: q.question, label, value: q.values[i] });
  }
  const projectAnswers: ProjectAnswer[] = [];
  for (const q of project) {
    const answer = p.answers.get(q.id);
    if (!answer || answer === SKIP) continue;
    projectAnswers.push({
      questionId: q.id, question: q.question, answer,
      instrumentId: q.instrumentId, instrumentName: q.instrumentName,
      gateKey: q.gateKey, quote: q.quote, locator: q.locator, openKey: q.openKey,
    });
  }

  const frozen = {
    // What `_wsdq_run.ts` hands to `runIntelligence`, byte for byte.
    request: {
      company: f.company, country: f.country, description,
      capitalSought: f.opts.capitalSought, targetMarkets: f.opts.targetMarkets,
      eligibility: merged, projectAnswers,
      ...(profileSignal ? { profileSignal } : {}),
    },
    // Everything a reader needs to judge whether that founder is honest.
    provenance: {
      recallSet: setFile,
      corpus: corpusProvenance(),
      policy,
      wonInstrument: t.instrument,
      wonInstrumentName: t.instrumentName,
      descriptionSource: t.descriptionSource,
      descriptionChars: description.length,
      firstScreen: f.eligibility,
      suppliedFields: f.supplied,
      ownAnswerFields: f.ownAnswer,
      withheldByPolicy: Object.entries(INTAKE_SOURCE)
        .filter(([, d]) => d.supply === "withheld")
        .map(([k, d]) => ({ field: k, why: (d as { why: string }).why })),
      verdictCandidates: candidateIds.length,
      openFieldsOffered: openFields.map((x) => `${x.field} (reach ${x.reachPct}%)`),
      adaptiveRoundRun: Boolean(screen),
      theme: screen?.theme ?? null,
      questionsAsked: asked,
      personaRaw: p.raw,
      genericAnswersMerged: genericChosen,
      genericSkipped: generic.filter((q) => !genericChosen.some((g) => g.field === q.field))
        .map((q) => q.field),
      projectAnswersKept: projectAnswers.length,
      projectSkipped: project.filter((q) => !projectAnswers.some((a) => a.questionId === q.id))
        .map((q) => q.question),
      profileSignal,
      eurSpentHere: eur,
    },
  };

  const dir = path.join(OUT_ROOT, slugOf(f.company));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "founder.json"), JSON.stringify(frozen, null, 1));
  console.log(rankerTallyLine());
  console.log(`${f.company}: ${asked.length} question(s) asked, ` +
    `${genericChosen.length} generic merged, ${projectAnswers.length} project kept, ` +
    `${asked.length - genericChosen.length - projectAnswers.length} answered "${SKIP}"`);
  console.log(`intake fields now populated: ` +
    `${Object.keys(merged).filter((k) => (merged as Record<string, unknown>)[k] != null).length}`);
  console.log(`EUR ${eur.toFixed(4)} spent freezing this founder`);
  console.log(`wrote ${path.join(dir, "founder.json")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
