// The adaptive round: what to ask a founder AFTER the shortlist exists.
//
// Split out of pipeline.ts as part of the Phase 2 decomposition. This is the
// funnel's second stage and it has a distinct job from everything around it:
// screen 1 asks the six questions needed to BUILD a shortlist, shortlist.ts
// picks the candidates, and this decides what is still worth asking given the
// funds actually in front of THIS founder.
//
// The defining constraint, and the reason it cannot be a generic form: every
// question is written from a fund's own requirement text. A question we cannot
// ground in a real rule on a real shortlisted instrument does not get asked,
// because its only purpose is to resolve a gate that is genuinely open.
import Anthropic from "@anthropic-ai/sdk";
import { loadAgentInstructions } from "./corpus";
import { recordUsage } from "./cost";
import { declaw, fence } from "./untrusted";
import { recordEvent } from "./telemetry";
import { COMPANY_TYPE_OPTIONS, FIELD_ENUM_HINTS } from "./types";
import type {
  EligibilityCheck, GroundedRound, InstrumentRow,
  IntelligenceRequest, ProfileSignal, ProjectQuestion,
} from "./types";
import type { OpenFieldEvidence, ProjectGateEvidence } from "./gateReach";

const client = new Anthropic();

/** The model that reads a founder's own prose. Same as the memo writer: this
 *  is a judgement call about language, not a classification task. */
const WRITER_MODEL = "claude-sonnet-5";

/** Every model response passes through here so its cost is counted — the euro
 *  ceiling in quota.ts only works if nothing bills untracked. */
function billed<T extends { model?: string; usage?: unknown }>(res: T, fallbackModel: string): T {
  recordUsage(res.model ?? fallbackModel, res.usage as never);
  return res;
}

/** Lifted from pipeline.ts with these functions: the model may wrap structured
 *  output in prose, and a bare JSON.parse throws with no context. */
function extractJson<T>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const start = body.search(/[{[]/);
  if (start === -1) throw new SyntaxError("No JSON found in model response");
  return JSON.parse(body.slice(start).trim()) as T;
}

/** House rule: no em-dashes in anything a founder reads. */
/**
 * brief_funnel_v2 Stage 2b: turn a fund's verbatim requirement text into a
 * question about the founder's actual project.
 *
 * This is the half of the panel that makes a memo specific. The model writes
 * the answer options here, which generateGroundedRound() above deliberately
 * never does — safe only because these answers land in ProjectAnswer and
 * computeVerdict() never reads them.
 */
/** Options that carry no information. The prompt bans these, this catches the
 *  ones that slip through — a "a mix of the above" answer tells the memo
 *  writer nothing, and costs the founder one of only ~5 questions. */
const TOKENS = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * A question's topic signature: every meaningful token in the question AND its
 * options, minus anything the founder already said.
 *
 * Stripping the founder's own words is what makes this work. Every project
 * question repeats the company's technology by design ("your insect protein
 * bioconversion..."), so raw text overlap is near-total between any two of
 * them. Remove that shared vocabulary and what remains is the actual topic —
 * "technology readiness level" versus "thematic area".
 *
 * Options alone were not enough: the same TRL question phrased once as bands
 * and once as a yes/no has two different answer spaces but is still the same
 * question, and a live round shipped both.
 */
function topicSignature(q: { question: string; options: string[] }, ownWords: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const t of [...TOKENS(q.question), ...q.options.flatMap(TOKENS)]) {
    if (t.length >= 4 && !ownWords.has(t)) out.add(t);
  }
  return out;
}

const VAGUE_OPTION =
  /^(other|none|not sure|unsure|n\/?a|a mix\b|mix of\b|some of\b|several\b|both\b|partly\b|all of\b|combination\b|it depends\b|other sector\b)/i;

const deDash = (s: string) => (s ?? "").replace(/\s*—\s*/g, ", ");

// The intake stage just selects the few questions whose answers most change the
// routing, as structured output. Haiku is fast enough that the founder barely
// waits before the questions appear.
const INTAKE_MODEL = "claude-haiku-4-5";

/**
 * Phase 3C: ONE grounded panel of up to 8 questions (not several small
 * rounds — the user's explicit call: the standard screen asks the fast,
 * universal questions, then a single tailored panel narrows the rest before
 * matching, not a drip of mini-screens). Unlike the old generateIntakeGroups
 * (retired — it invented questions from a soft "entropy rule" prompt
 * instruction with zero access to real gate data), this reads the ACTUAL
 * unresolved eligibility_gates for the founder's current candidate-instrument
 * shortlist (openFieldsForShortlist, computed by the caller) and asks the
 * model only to translate real, cited requirement text into founder-friendly
 * question phrasing — never to invent the answer options, which always come
 * from FIELD_ENUM_HINTS. Returns null when there's nothing worth asking.
 */
export async function generateGroundedRound(
  req: IntelligenceRequest,
  openFields: OpenFieldEvidence[],
): Promise<GroundedRound | null> {
  if (!openFields.length) return null;
  const top = openFields.slice(0, 8);
  const fieldNames = top.map((f) => f.field);

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      theme: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: { type: "string", enum: fieldNames },
            question: { type: "string" },
          },
          required: ["field", "question"],
        },
      },
    },
    required: ["theme", "questions"],
  } as const;

  const evidence = top
    .map((f) => {
      const hint = FIELD_ENUM_HINTS[f.field];
      const examples = f.examples.map((e) => `  - ${e.instrument}: "${e.requirement}"`).join("\n");
      const optionsLine = hint ? `  Must resolve to one of: ${hint.options.map((o) => o.label).join(" / ")}` : "";
      return `Field "${f.field}" — still open on ${f.nInstruments} of the founder's candidate ` +
        `instruments (${f.reachPct}% of shortlist weight). Real requirement text:\n${examples}\n${optionsLine}`;
    })
    .join("\n\n");

  try {
    const res = billed(await client.messages.create({
      model: INTAKE_MODEL,
      // Bumped from 700: up to 8 fields' worth of questions (was 3) needs
      // more room.
      max_tokens: 1600,
      thinking: { type: "disabled" },
      system: loadAgentInstructions(),
      output_config: { format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content:
            `A founder is mid-qualification for European public capital. Below are ` +
            `REAL, DOCUMENTED requirements from the specific funds still on their ` +
            `shortlist that we cannot yet resolve. Write ONE themed screen (2-4 ` +
            `word theme) with EXACTLY ONE plain-English question per field below ` +
            `(never two questions tagged with the same field — if a field has ` +
            `several unrelated pieces of evidence, pick the single most decisive ` +
            `one and phrase ONE question from it) — phrase each question from ` +
            `the real requirement text given, never inventing a requirement the ` +
            `text doesn't support. Include every field below that has usable ` +
            `evidence; omit a field only if its evidence is too thin to phrase a ` +
            `fair question. Do not invent answer options — the interface renders ` +
            `the real fixed options itself.\n\n${evidence}\n\n` +
            `Return ONLY the JSON object for the schema.`,
        },
      ],
    }), INTAKE_MODEL);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson<{ theme: string; questions: { field: string; question: string }[] }>(text);
    const seen = new Set<string>();
    const questions = (parsed.questions ?? [])
      .filter((q) => q && fieldNames.includes(q.field) && q.question?.trim())
      // Never trust the model alone to keep one question per field (seen it
      // ask 3 differently-worded questions all tagged the same field, which
      // would render as duplicate checkbox groups with wrong-looking options)
      // — first occurrence per field wins, mechanically enforced.
      .filter((q) => (seen.has(q.field) ? false : (seen.add(q.field), true)))
      .map((q) => ({ field: q.field, question: deDash(q.question.trim()) }));
    if (!questions.length) return null;
    return { theme: deDash(String(parsed.theme ?? "").trim()) || "A few more things", questions };
  } catch (err) {
    console.error("grounded round generation failed:", err);
    return null;
  }
}

export async function generateProjectQuestions(
  req: IntelligenceRequest,
  gates: ProjectGateEvidence[],
): Promise<ProjectQuestion[]> {
  if (!gates.length) return [];
  const byKey = new Map(gates.map((g) => [`${g.instrumentId}::${g.gateKey}`, g]));
  const keys = [...byKey.keys()];

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: { type: "string", enum: keys },
            question: { type: "string" },
            // No minItems/maxItems above 1: the structured-output API rejects
            // them ("For 'array' type, 'minItems' values other than 0 or 1 are
            // not supported"). The 3-5 range is enforced by the prompt and by
            // the post-processing below instead.
            options: { type: "array", items: { type: "string" } },
          },
          required: ["key", "question", "options"],
        },
      },
    },
    required: ["questions"],
  } as const;

  const evidence = [...byKey.entries()]
    .map(([key, g]) =>
      `key: ${key}\nfund: ${g.instrumentName}\nrequirement (verbatim): "${g.requirement}"`)
    .join("\n\n");

  const about = [
    req.company && `Company: ${req.company}`,
    req.description && fence("company description", req.description),
    req.companyType && `Self-described type: ${req.companyType}`,
    req.country && `Incorporated in: ${req.country}`,
  ].filter(Boolean).join("\n");

  try {
    const res = billed(await client.messages.create({
      model: INTAKE_MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: loadAgentInstructions(),
      output_config: { format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content:
            `${about}\n\nBelow are verbatim eligibility requirements from the specific funds ` +
            `still on this company's shortlist. For EACH key, write ONE plain-English ` +
            `question that establishes whether THIS company's project meets THAT ` +
            `requirement, plus 3-5 short, mutually exclusive answer options drawn from ` +
            `the requirement's own wording.\n\n` +
            `Rules:\n` +
            `- The founder must be able to answer from memory, without opening a document.\n` +
            `- Ask about their project, technology or plan, never about their legal form, ` +
            `headcount or country: those are already known.\n` +
            // Specificity rules. Without these the model produces generically
            // correct but useless options ("A mix of the above", "Other
            // sector") that tell the writer nothing about this company.
            `- Name the company's OWN technology or product in the question, in their ` +
            `words, so it reads as written for them and not for any applicant.\n` +
            `- Every option must be a substantive, checkable state of affairs. BANNED ` +
            `option styles: "a mix of the above", "other", "none", "several of these", ` +
            `"not sure", "partly" — and any option that merely restates the question.\n` +
            `- Options must be mutually exclusive and jointly cover the realistic ` +
            `cases, so exactly one is true for this company.\n` +
            `- Where the requirement names thresholds, bands or categories (TRL levels, ` +
            `percentages, activity types), make the options THOSE literal values rather ` +
            `than paraphrases of them.\n` +
            `- Never assert or imply a requirement the verbatim text does not support.\n` +
            `- Options must be concrete and distinguishable (for a TRL requirement, name ` +
            `the TRL bands; do not offer "yes / no / unsure").\n` +
            `- Do not add a "none of these" option: the interface appends its own.\n` +
            // Without this the model obeys "one question per key" over the
            // content rule above and asks things like "what is your legal
            // status?", which the first screen already settled.
            `- OMIT a key entirely if its requirement is only about legal form, ` +
            `applicant category, headcount or country. Returning four sharp ` +
            `questions is better than five with a wasted one.\n` +
            // Different funds phrase the same underlying requirement
            // differently, so the per-instrument cap upstream cannot catch it:
            // one live round asked TRL twice (two Horizon clusters) and
            // "will funds go to R&D costs" twice (two SATR tracks). The model
            // sees every key at once, so it is the right place to deduplicate.
            `- You are shown several funds at once. If two keys would produce ` +
            `the SAME question in substance (both asking technology readiness, ` +
            `both asking what the money pays for), keep only the one whose ` +
            `requirement is most specific and OMIT the other. A founder must ` +
            `never be asked the same thing twice in one screen.\n` +
            `- At most one question per key.\n\n${evidence}\n\n` +
            `Return ONLY the JSON object for the schema.`,
        },
      ],
    }), INTAKE_MODEL);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson<{ questions: { key: string; question: string; options: string[] }[] }>(text);
    const seen = new Set<string>();
    const questions: ProjectQuestion[] = (parsed.questions ?? [])
      .filter((q) => q?.key && byKey.has(q.key) && q.question?.trim() && Array.isArray(q.options))
      .filter((q) => (seen.has(q.key) ? false : (seen.add(q.key), true)))
      .map((q) => {
        const g = byKey.get(q.key)!;
        // Belt-and-braces on the specificity rules above: strip vague options
        // even if the model slips one through, so a founder is never asked to
        // choose "a mix of the above".
        const options = q.options
          .map((o) => deDash(String(o).trim()))
          .filter(Boolean)
          .filter((o) => !VAGUE_OPTION.test(o))
          .slice(0, 5);
        return {
          id: q.key,
          question: deDash(q.question.trim()),
          options,
          instrumentId: g.instrumentId,
          instrumentName: g.instrumentName,
          gateKey: g.gateKey,
          quote: g.requirement,
          locator: g.locator,
        };
      })
      .filter((q) => q.options.length >= 2);

    // Deterministic backstop on the dedupe instruction above. Asked to drop
    // near-duplicates the model removes some and misses others — a live round
    // still asked technology readiness twice, from two Horizon clusters.
    //
    // Two questions that ask the same thing share an ANSWER SPACE: both TRL
    // questions offer the same readiness bands. Comparing options rather than
    // wording is language-agnostic and needs no keyword list.
    const ownWords = new Set([
      ...TOKENS(req.description ?? ""), ...TOKENS(req.company ?? ""),
    ]);
    const kept: ProjectQuestion[] = [];
    for (const q of questions) {
      const sig = topicSignature(q, ownWords);
      const dup = kept.some((k) => {
        const other = topicSignature(k, ownWords);
        const shared = [...sig].filter((t) => other.has(t)).length;
        return shared / Math.max(Math.min(sig.size, other.size), 1) > 0.45;
      });
      if (!dup) kept.push(q);
    }
    return kept;
  } catch (err) {
    console.error("project question generation failed:", err);
    return [];
  }
}

const PROFILE_SIGNAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    techDepthRead: { type: "string", enum: COMPANY_TYPE_OPTIONS.map((o) => o.value) },
    note: { type: "string" },
  },
  required: ["techDepthRead", "note"],
} as const;

/**
 * Phase 4: a soft, additive read of the founder's own free-text description —
 * distinct from Phase 3C (which asks the founder MORE questions grounded in
 * real gate text). This reads what's already given and infers a signal a
 * checkbox can't capture, on the SAME 4-point scale as the founder's own
 * self-reported `companyType`, never a different or freer vocabulary. Fires
 * once per session, in parallel with the first grounded-round fetch — never
 * before or blocking computeVerdict(), which must stay instant and
 * zero-cost. Strictly softer than the weakest eligibility_gates tier
 * (inventory_inferred): not grounded in any legal text or curated brief, only
 * in the founder's own prose, and `applyProfileSignal()` is the only thing
 * allowed to act on it — never a hard verdict, never authoritative.
 */
export async function inferProfileSignal(req: IntelligenceRequest): Promise<ProfileSignal | null> {
  const desc = req.description?.trim();
  if (!desc || desc.length < 25) return null; // too thin to ground anything — no signal beats a fabricated one
  // Counting attempts even when neutralised: this is the site where an
  // injection could actually change an outcome, because the signal it produces
  // feeds channel ordering downstream.
  const { removed } = declaw(desc);
  if (removed) {
    recordEvent("prompt_injection_blocked",
      `stripped ${removed} control sequence(s) from a company description`,
      { chars: desc.length });
  }
  try {
    const res = billed(await client.messages.create({
      model: WRITER_MODEL,
      max_tokens: 400,
      thinking: { type: "disabled" },
      system: loadAgentInstructions(),
      output_config: { format: { type: "json_schema", schema: PROFILE_SIGNAL_SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            `A founder described their company in their own words. Read ONLY ` +
            `what is actually there — do not infer facts the text doesn't ` +
            `support. Classify how the description ITSELF reads on this scale ` +
            `(not what the founder later self-selected): ` +
            `${COMPANY_TYPE_OPTIONS.map((o) => o.value).join(" / ")}.\n\n` +
            `${fence("company description", desc)}\n\n` +
            `"note" must be one short sentence, in your own words, that a ` +
            `founder could immediately verify against their own description — ` +
            `quote or closely paraphrase specific language from it. Never ` +
            `assert anything about eligibility or funding fit; this is purely ` +
            `a read of how the writing itself comes across to a technical ` +
            `reviewer.\n\nReturn ONLY the JSON object for the schema.`,
        },
      ],
    }), INTAKE_MODEL);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson<{ techDepthRead: string; note: string }>(text);
    const validType = COMPANY_TYPE_OPTIONS.find((o) => o.value === parsed.techDepthRead)?.value;
    if (!validType || !parsed.note?.trim()) return null;
    return { techDepthRead: validType, note: deDash(parsed.note.trim()) };
  } catch (err) {
    console.error("profile signal inference failed:", err);
    return null;
  }
}

export interface VerdictResult {
  eligibilityScreen: EligibilityCheck[];
  instrumentTable: InstrumentRow[];
  selfMatched: boolean;
  /** Every real DB-native instrument id still plausibly in play (unsliced,
   *  wider than the 6-row display table) — grounds the adaptive round. */
  candidateInstrumentIds: string[];
}
