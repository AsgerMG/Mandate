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
import { COMMERCIAL_ANSWER_PREFIX, COMPANY_TYPE_OPTIONS, FIELD_ENUM_HINTS } from "./types";
import { knownFacts } from "./knownFacts";
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
/**
 * Plan the whole round-2 screen in one call.
 *
 * ── Why one call ───────────────────────────────────────────────────────────
 * This replaces three generators that ran in parallel and could not see each
 * other: one for enum-answered gates, one for gate text with written options,
 * one for the commercial model. Overlap between them could only ever be caught
 * after the fact, by comparing finished questions, which is why this file
 * accumulated a topic signature, a per-key cap, a vague-option filter and a
 * measurement signature and STILL shipped a screen that asked for technology
 * readiness twice and got two different answers.
 *
 * None of the three saw the founder's screen-1 answers either. The founder had
 * said their product was at scaling-revenue stage, which largely settles
 * readiness, and was asked for it twice anyway.
 *
 * Seeing all the material at once makes "do not ask the same thing twice" and
 * "do not ask what they already told us" instructions a model can follow,
 * rather than properties we detect downstream. The old checks remain as a
 * backstop and a scoreboard signal; they are no longer the mechanism.
 *
 * Grounding is unchanged: every question keeps the instrument, gate key and
 * verbatim quote of the requirement it came from, so citations and
 * ProjectAnswer provenance still hold. Commercial questions carry no
 * instrument by design and stay behind COMMERCIAL_ANSWER_PREFIX, which is what
 * keeps them out of the eligibility verdict.
 */
export const SCREEN_QUESTION_CAP = 6;

export interface PlannedScreen {
  theme: string;
  /** Enum-answered questions: the interface renders FIELD_ENUM_HINTS options. */
  questions: { field: string; question: string }[];
  /** Written-option questions, gate-grounded or commercial. */
  projectQuestions: ProjectQuestion[];
}

export async function planAdaptiveScreen(
  req: IntelligenceRequest,
  openFields: OpenFieldEvidence[],
  projectGates: ProjectGateEvidence[],
): Promise<PlannedScreen | null> {
  const facts = knownFacts(req, req.eligibility,
    "## What the founder has ALREADY told us. Never ask any of this again.");
  const enumFields = openFields.filter((f) => FIELD_ENUM_HINTS[f.field]);
  if (!enumFields.length && !projectGates.length && !req.description) return null;

  const gateKeys = projectGates.map((g) => `${g.instrumentId}::${g.gateKey}`);
  const fieldNames = enumFields.map((f) => f.field);

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
            // Which pool this question came from, so the caller can rebuild it
            // with the right grounding without guessing.
            source: { type: "string", enum: ["field", "gate", "commercial"] },
            /** field name, gate key, or commercial topic */
            ref: { type: "string" },
            question: { type: "string" },
            /** Written only for gate and commercial questions. */
            options: { type: "array", items: { type: "string" } },
          },
          required: ["source", "ref", "question", "options"],
        },
      },
    },
    required: ["theme", "questions"],
  } as const;

  const fieldBlock = enumFields.map((f) => {
    const hint = FIELD_ENUM_HINTS[f.field];
    return `  ref "${f.field}" (reach ${f.reachPct}% of the shortlist)\n` +
      `    ASK: "${hint.stem}" (tailor the wording, never the meaning)\n` +
      `    Fixed options the interface will render${hint.multi ? " (multi-select)" : ""}: ` +
      `${hint.options.map((o) => o.label).join(" / ")}\n` +
      `    Real requirement: ${f.examples[0]?.requirement ?? "(none quoted)"}`;
  }).join("\n\n");

  const gateBlock = projectGates.map((g) =>
    `  ref "${g.instrumentId}::${g.gateKey}" (reach ${g.reachPct}%, ${g.instrumentName})\n` +
    `    Requirement, verbatim: "${g.requirement}"`).join("\n\n");

  const commercialBlock = COMMERCIAL_TOPICS.map((t) => `  ref "${t}"`).join("\n");

  try {
    const res = billed(await client.messages.create({
      model: INTAKE_MODEL,
      max_tokens: 2400,
      thinking: { type: "disabled" },
      system: loadAgentInstructions(),
      output_config: { format: { type: "json_schema", schema } },
      messages: [{
        role: "user",
        content:
          `Plan ONE screen of at most ${SCREEN_QUESTION_CAP} questions for a founder ` +
          `applying for European public funding. You are choosing from three ` +
          `pools and you can see all of them, so the screen must read as one ` +
          `coherent set rather than three lists stapled together.\n\n` +
          `${facts}\n\n` +
          `${req.description ? fence("company description", declaw(req.description).text) + "\n\n" : ""}` +
          `## Pool A: eligibility fields with FIXED options (source "field")\n` +
          `${fieldBlock || "  (none open)"}\n\n` +
          `## Pool B: fund requirements needing a project answer (source "gate")\n` +
          `You write 3-5 options for these, in the founder's own commercial ` +
          `vocabulary, translated OUT of the requirement rather than quoted ` +
          `from it. A phrase lifted verbatim from a legal text is wrong even ` +
          `when accurate.\n${gateBlock || "  (none open)"}\n\n` +
          `## Pool C: commercial model (source "commercial")\n` +
          `Not grounded in any fund. These exist so the brief can position the ` +
          `company: who pays, how they charge, how they reach market, what an ` +
          `award would buy. You write both question and options. Ask about ` +
          `THIS company in the founder's words, never about the category in ` +
          `general.\n${commercialBlock}\n\n` +
          `## How to choose\n` +
          `- FOUR questions is the target. Six is a ceiling, not a budget. A ` +
          `screen of four sharp questions beats one padded to six.\n` +
          `- Ask in the FOUNDER'S world, never the programme's. The ` +
          `requirement tells you WHY a question matters; it never gives you ` +
          `the words. Test every word you use: could this founder have used ` +
          `it themselves, about their own business, before they had ever ` +
          `heard of this fund? If a word exists only because the fund's ` +
          `document uses it, it does not belong in the question or its ` +
          `options. And if answering at all would require having read a call ` +
          `text or a regulation, do not ask it, however important the gate. ` +
          `Where a technical scale genuinely is clearest, describe the rungs ` +
          `in plain words and put the term in brackets, never the reverse.\n` +
          `- NEVER ask anything already answered above, including anything the ` +
          `founder's own description settles. If the stage, sector, ticket or ` +
          `use of funds settles a question, it is settled.\n` +
          `- Where their description is CLOSE but genuinely ambiguous, quote ` +
          `their own words back and ask only for the distinction still open ` +
          `("You describe X. Is that A or B?"). A cold question about ` +
          `something they just told you reads as not having read it.\n` +
          `- NEVER ask the same thing twice in different words. Two questions ` +
          `measuring on one scale (readiness levels, percentage bands, ` +
          `headcount) are one question, however differently they are framed.\n` +
          `- Prefer what most changes WHICH FUNDS this founder sees, or what ` +
          `positioning cannot be written without. A requirement carried by a ` +
          `small share of the shortlist does not earn a slot.\n` +
          `- Include at least one and at most two from Pool C when a ` +
          `description exists: positioning has no other source.\n` +
          `- The founder answers from memory, without opening a document.\n` +
          `- Every option must be a substantive, checkable state of affairs. ` +
          `No "a mix of the above", "other", "none", "not sure": the ` +
          `interface appends its own.\n` +
          `- For source "field", copy the ref exactly and leave options empty; ` +
          `the interface renders the fixed set.\n\n` +
          `Return ONLY the JSON object for the schema.`,
      }],
    }), INTAKE_MODEL);

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("");
    const parsed = extractJson<{
      theme: string;
      questions: { source: string; ref: string; question: string; options: string[] }[];
    }>(text);

    const gateByKey = new Map(projectGates.map((g) => [`${g.instrumentId}::${g.gateKey}`, g]));
    const seenRefs = new Set<string>();
    const fields: { field: string; question: string }[] = [];
    const written: ProjectQuestion[] = [];

    for (const q of parsed.questions ?? []) {
      if (!q?.question?.trim() || seenRefs.has(q.ref)) continue;
      // The cap is enforced HERE, not asked for in the prompt: a budget a
      // model may round up is not a budget.
      if (fields.length + written.length >= SCREEN_QUESTION_CAP) break;
      const options = (q.options ?? [])
        .map((o) => deDash(String(o).trim()))
        .filter(Boolean)
        .filter((o) => !VAGUE_OPTION.test(o))
        .slice(0, 5);

      if (q.source === "field" && fieldNames.includes(q.ref)) {
        seenRefs.add(q.ref);
        fields.push({ field: q.ref, question: deDash(q.question.trim()) });
      } else if (q.source === "gate" && gateByKey.has(q.ref) && options.length >= 2) {
        const g = gateByKey.get(q.ref)!;
        seenRefs.add(q.ref);
        written.push({
          id: q.ref, question: deDash(q.question.trim()), options,
          instrumentId: g.instrumentId, instrumentName: g.instrumentName,
          gateKey: g.gateKey, quote: g.requirement, locator: g.locator,
        });
      } else if (q.source === "commercial" && options.length >= 2) {
        seenRefs.add(q.ref);
        written.push({
          id: `${COMMERCIAL_ANSWER_PREFIX}${q.ref}`,
          question: deDash(q.question.trim()), options,
          instrumentId: "", instrumentName: "", gateKey: `commercial_${q.ref}`,
          quote: "", locator: "",
        });
      }
    }
    if (!fields.length && !written.length) return null;
    return {
      theme: deDash(String(parsed.theme ?? "").trim()) || "A few more things",
      questions: fields,
      projectQuestions: written,
    };
  } catch (err) {
    console.error("adaptive screen planning failed:", err);
    return null;
  }
}




/** The axes that change how a company should be positioned to a public
 *  funder. Deliberately about the business model rather than the product:
 *  what a fund wants to hear turns on who pays and how, not on the
 *  technology, which the description already covers. */
const COMMERCIAL_TOPICS = [
  "who_pays",          // B2B, B2C, B2G, marketplace, licensing
  "revenue_model",     // subscription, transaction fee, one-off, usage
  "route_to_market",   // direct, channel, procurement, platform
  "award_unlocks",     // what a public award would actually buy commercially
] as const;

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
