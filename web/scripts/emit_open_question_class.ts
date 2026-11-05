// Which requirements are FUZZY BY NATURE, and which are merely unencoded.
//
// ── The distinction, stated as a property ──────────────────────────────────
// Stage 2 can only ask about a requirement it can turn into a fixed answer
// set, so every requirement without one is discarded. But those are not one
// kind of thing, and the two kinds have opposite fixes:
//
//   ENCODABLE   the requirement is decided by a comparison over ONE stated
//               fact about the applicant — a threshold on a number, a date, or
//               membership of an enumerable set. Two careful readers holding
//               the same facts always agree. The fix is to encode the rule.
//               Asking a founder about it in prose is strictly worse than a
//               comparator, because prose can be misread and a comparator
//               cannot.
//
//   JUDGEABLE   deciding it needs a judgement about what THIS applicant's
//               project IS or DOES, measured against a standard the text
//               states but does not quantify. No fixed answer set can hold the
//               answer, because the answer is a description of the project.
//               The fix is to ask, in words, and judge the words.
//
//   UNASKABLE   the applicant is not the one who can answer: the programme's
//               own machinery, an assessment someone else performs, a document
//               supplied later, a condition outside the applicant's knowledge.
//               Neither encoding nor asking helps.
//
// THE TEST, for a sentence nobody has seen:
//   1. Could you write the rule as a comparison over a single stated fact?
//      -> encodable.
//   2. If not: could a founder describe their own project in a few sentences
//      such that a careful reader could reach a defensible verdict?
//      -> judgeable.
//   3. Otherwise -> unaskable.
//
// This is a property with a test, not a register. No fund, country, sector or
// programme is named here or in the prompt; the classifier sees the sentence
// and nothing else — not the instrument it belongs to, not its country, not
// its family. That is deliberate: a classifier that could see the fund could
// learn the fund, and the standing constraint is that no rule may name one.
//
// ── Why a model decides this and not a regex ──────────────────────────────
// The boundary is itself fuzzy. "The project must reach at least TRL 6" is a
// comparison; "the project must be close to market" is a judgement; both are
// short English sentences about readiness and no keyword separates them. A
// word list would be an enumeration, which `check_contracts` fails the build
// over, and it would be wrong on the first sentence phrased differently.
//
// ── Why it is precomputed ─────────────────────────────────────────────────
// Selection at request time must be free. The class of a requirement is a
// property of the sentence, not of the founder, so it is computed once here
// and read from a committed artifact. A requirement the artifact does not know
// is NOT asked about — a corpus that grows adds no questions until this is
// re-run, which is the safe direction.
//
// Run from web:
//   npx tsx scripts/dump_publishable_ids.ts /tmp/pub.json
//   PUBLISHABLE=/tmp/pub.json npx tsx scripts/emit_open_question_class.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { normaliseRequirement, OPEN_QUESTION_CLASS_PATH, MIN_JUDGEABLE_LEN } from "../lib/intelligence/openQuestions";

loadEnvLocal();
requireCredentials("emit_open_question_class", ["DATABASE_URL", "ANTHROPIC_API_KEY"]);

/** The judgement model. Same one the memo writer uses: this is a call about
 *  what a sentence MEANS, not a classification over a fixed vocabulary. */
const MODEL = "claude-sonnet-5";

/** Batch size. Small enough that one bad response costs little, large enough
 *  that the shared instruction is amortised. */
const BATCH = 25;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      // No minItems/maxItems: an array length constraint in an Anthropic
      // structured-output schema returns a 400. Paid for once already.
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          klass: { type: "string", enum: ["encodable", "judgeable", "unaskable"] },
          why: { type: "string" },
        },
        required: ["id", "klass", "why"],
      },
    },
  },
  required: ["items"],
} as const;

const INSTRUCTION =
  `You are triaging requirement sentences taken verbatim from public funding ` +
  `programmes. Each one states a condition an applicant must satisfy. Decide, ` +
  `for each, which of three kinds it is.\n\n` +
  `"encodable" — the condition is decided by a comparison over ONE stated ` +
  `fact about the applicant: a threshold on a number, a date, a duration, a ` +
  `yes/no status, or membership of a list that could be written down in full. ` +
  `Two careful readers holding the same facts about the applicant would always ` +
  `reach the same verdict. The sentence may be long or legalistic and still be ` +
  `encodable; what matters is that the answer is a fact, not a description.\n\n` +
  `"judgeable" — deciding the condition needs a judgement about what THIS ` +
  `applicant's project actually is or does, measured against a standard the ` +
  `sentence states but does not quantify. No fixed list of answers could hold ` +
  `the answer, because the answer is a description of the project. An informed ` +
  `applicant could answer it in a few sentences from memory, and a careful ` +
  `reader holding that description could reach a defensible verdict.\n\n` +
  `"unaskable" — the applicant is not the one who can answer. The sentence ` +
  `describes the programme's own machinery, an assessment somebody else ` +
  `performs, paperwork to be supplied later, a condition the applicant cannot ` +
  `know, or it states no condition on the applicant at all.\n\n` +
  `Apply this test in order:\n` +
  `1. Could you write the condition as a comparison over a single stated ` +
  `fact? If yes, it is "encodable" — even if nobody has encoded it.\n` +
  `2. If not: could the applicant describe their own project in a few ` +
  `sentences such that a careful reader could decide? If yes, "judgeable".\n` +
  `3. Otherwise, "unaskable".\n\n` +
  `Judge the sentence in front of you. You are not told which programme it ` +
  `belongs to and must not guess; nothing about a country, a sector or a named ` +
  `scheme may enter your reasoning.\n\n` +
  `"why" is at most twelve words, naming which step of the test decided it.\n\n` +
  `Return ONLY the JSON object for the schema, with one entry per input id.`;

function extractJson<T>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const start = body.search(/[{[]/);
  if (start === -1) throw new SyntaxError("No JSON found in model response");
  return JSON.parse(body.slice(start).trim()) as T;
}

async function main() {
  const pubFile = process.env.PUBLISHABLE;
  let publishable: Set<string> | null = null;
  if (pubFile) {
    const ids = new Set<string>(JSON.parse(readFileSync(pubFile, "utf8")).map(String));
    if (ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }
    publishable = ids;
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(
    `SELECT instrument_id, gate_role, requirement, value_spec FROM eligibility_gates`);
  await db.end();

  // The candidate set: filter-role requirements with no decidable comparator
  // and enough text to phrase a question from. Everything with a comparator is
  // out of scope by construction — it is already decided by the one evaluator.
  const texts = new Map<string, string>(); // normalised key -> verbatim text
  for (const r of rows) {
    if (publishable && !publishable.has(String(r.instrument_id))) continue;
    if (r.gate_role !== "filter") continue;
    const spec = r.value_spec ? JSON.parse(r.value_spec) : null;
    if (spec && typeof spec === "object" && (spec as { op?: string }).op) continue;
    const req = (r.requirement ?? "").trim();
    if (req.length < MIN_JUDGEABLE_LEN) continue;
    const key = normaliseRequirement(req);
    if (!texts.has(key)) texts.set(key, req);
  }

  const entries = [...texts.entries()];
  console.log(`classifying ${entries.length} distinct requirement texts with ${MODEL}`);

  const client = new Anthropic();
  const out: Record<string, [string, string]> = {};
  let inTok = 0, outTok = 0, failed = 0;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const block = batch
      .map(([, text], j) => `[${i + j}] ${text.replace(/\s+/g, " ").slice(0, 900)}`)
      .join("\n\n");
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: "disabled" },
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: `${INSTRUCTION}\n\n${block}` }],
      });
      inTok += res.usage.input_tokens ?? 0;
      outTok += res.usage.output_tokens ?? 0;
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text).join("");
      const parsed = extractJson<{ items: { id: string; klass: string; why: string }[] }>(text);
      for (const item of parsed.items ?? []) {
        const idx = Number(String(item.id).replace(/[^0-9]/g, ""));
        const entry = entries[idx];
        if (!entry) continue;
        if (!["encodable", "judgeable", "unaskable"].includes(item.klass)) continue;
        out[entry[0]] = [item.klass, (item.why ?? "").trim().slice(0, 90)];
      }
    } catch (err) {
      // A failed batch leaves its requirements UNCLASSIFIED, which means they
      // are never asked about. Loud, and counted, so a half-written artifact
      // cannot read as a finding about the corpus.
      failed += 1;
      console.error(`batch at ${i} failed:`, err instanceof Error ? err.message : err);
    }
    if ((i / BATCH) % 10 === 0) {
      process.stdout.write(`  ${Object.keys(out).length}/${entries.length}\r`);
    }
  }

  const counts: Record<string, number> = {};
  for (const [, [k]] of Object.entries(out)) counts[k] = (counts[k] ?? 0) + 1;

  // $3/MTok in, $15/MTok out at list price for the writer model.
  const cost = (inTok / 1e6) * 3 + (outTok / 1e6) * 15;
  // The literal filename is bound HERE, in the file that writes it, and then
  // written. Importing the constant alone is not enough: nothing in the source
  // would then tie this script to that file, and an artifact whose producer
  // cannot be found from the source is one nobody inheriting the repo can
  // rebuild. `check_artifact_reachability.py` enforces exactly that shape. The
  // assertion below is what keeps the local literal from drifting away from
  // the shared constant the readers use.
  const OUT = resolve(process.cwd(), "lib", "intelligence", "openQuestionClass.generated.json");
  if (!OUT.endsWith(OPEN_QUESTION_CLASS_PATH.replace(/\//g, sep))) {
    throw new Error(`emit_open_question_class: writing ${OUT}, but readers load `
      + `${OPEN_QUESTION_CLASS_PATH}. The two must be the same file.`);
  }
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    model: MODEL,
    // What the classifier was run over, so a later reader can tell a class
    // that is MISSING from one that was judged unaskable.
    candidates: entries.length,
    classified: Object.keys(out).length,
    failedBatches: failed,
    classes: out,
  }, null, 0) + "\n");

  console.log(`\n${JSON.stringify(counts)}`);
  console.log(`unclassified: ${entries.length - Object.keys(out).length} (failed batches: ${failed})`);
  console.log(`-> ${OUT}`);
  console.log(`model spend: ${inTok} in / ${outTok} out tokens = $${cost.toFixed(2)}`);
}

main();
