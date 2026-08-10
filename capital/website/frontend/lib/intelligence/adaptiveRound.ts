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
import { assembleInstructions } from "./contracts";
import { recordUsage } from "./cost";
import { declaw, fence } from "./untrusted";
import { recordEvent } from "./telemetry";
import { COMMERCIAL_ANSWER_PREFIX, COMPANY_TYPE_OPTIONS, FIELD_ENUM_HINTS, OPEN_ANSWER_PREFIX, type EligibilityAnswers } from "./types";
import { knownFacts } from "./knownFacts";
import type {
  EligibilityCheck, InstrumentRow,
  IntelligenceRequest, ProfileSignal, ProjectQuestion,
} from "./types";
import type { FundStake, OpenFieldEvidence, OpenQuestionCandidate, ProjectGateEvidence } from "./gateReach";

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
 *
 * ── NOT CALLED. This is a live defect, not dead code ──────────────────────
 * Nothing consults this function, so the deduplication it describes is NOT
 * running: two phrasings of one question can still both be published, which
 * costs the founder one of about five questions and is the exact failure the
 * docstring above says was observed. Same class as the four answers lost in
 * `project-mgmt/findings/2026-08-08_wsBL_discarded_answers.md` — a documented
 * mechanism that is present, correct and unreached.
 *
 * Left in place rather than restored HERE because restoring it changes which
 * questions a founder is asked, which is the adaptive round's own measured
 * surface (workstreams AY/BH) and needs a model-calling run to verify. It is
 * suppressed at the site, with the reason, rather than deleted: deleting it
 * would delete the only thing pointing at the defect.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above: the dedupe is unreached, and the finding lives with the code
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
/**
 * The answer set for a field, given what the founder has already told us.
 *
 * Most fields have a fixed list. Region cannot: offering all 449 European
 * regions to a French company is not a question anyone answers, so its options
 * are derived from the countries already on record. Read through one helper so
 * the prompt and the option-validation below cannot disagree about what the
 * founder was offered — they did once, and every gate question was silently
 * dropped.
 */
function fieldOptions(
  field: string,
  answers: EligibilityAnswers | undefined,
): { value: string; label: string }[] {
  const hint = FIELD_ENUM_HINTS[field];
  if (!hint) return [];
  return hint.optionsFor ? hint.optionsFor(answers ?? {}) : hint.options;
}

export const SCREEN_QUESTION_CAP = 6;

export interface PlannedScreen {
  theme: string;
  /** Fixed-answer-space questions. Both the question and the option LABELS are
   *  written for this company; every label carries a real enum value, so the
   *  answer space is unchanged. */
  questions: { field: string; question: string; stake?: string; options?: { value: string; label: string }[] }[];
  /** Written-option questions, gate-grounded or commercial. */
  projectQuestions: ProjectQuestion[];
}

export async function planAdaptiveScreen(
  req: IntelligenceRequest,
  openFields: OpenFieldEvidence[],
  projectGates: ProjectGateEvidence[],
  /** The funds currently in front of this founder, best first. The screen
   *  exists to sharpen THIS list, and a planner that cannot see it is
   *  choosing questions blind. */
  candidates: { name: string; country: string; supportType: string }[] = [],
  /** What is still unresolved about each candidate, fund by fund. This is what
   *  lets a question be chosen the way an analyst chooses one: because its
   *  answer sends this founder to a different fund. */
  stakes: FundStake[] = [],
  /** wsCD. Requirements that are fuzzy BY NATURE — no fixed answer set exists
   *  for them and none ever will, because the answer is a description of the
   *  project. Already budgeted and ranked by `openQuestionsForShortlist`;
   *  empty with the arm off. */
  openQuestions: OpenQuestionCandidate[] = [],
): Promise<PlannedScreen | null> {
  const facts = knownFacts(req, req.eligibility,
    "## What the founder has ALREADY told us. Never ask any of this again.");
  const enumFields = openFields.filter((f) => FIELD_ENUM_HINTS[f.field]);
  if (!enumFields.length && !projectGates.length && !openQuestions.length && !req.description) return null;

  const candidateBlock = candidates.slice(0, 8)
    .map((c) => `  - ${c.name} (${c.country}, ${c.supportType})`).join("\n");
  const stakeBlock = stakes
    .map((s2) => `  ${s2.name} (${s2.country}) still turns on:\n` +
      s2.open.map((o) => `    - ${o.requirement}`).join("\n"))
    .join("\n");
  // Built for the round-2 schema (50d6e300) and never placed in it, so the
  // model is not constrained to the gate keys actually in play the way it is
  // constrained to `fieldNames` on the line below. Kept, and suppressed with
  // the reason, because the likely cause is the recorded gotcha that array
  // `minItems`/`maxItems` in an Anthropic structured-output schema returns a
  // 400 — which would make this a workaround someone stopped halfway through
  // rather than an oversight. Resolving it means a live round-2 call, which
  // belongs to the workstream that owns this file.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above
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
            source: { type: "string", enum: ["field", "gate", "commercial", "open"] },
            /** field name, gate key, or commercial topic */
            ref: { type: "string" },
            /** For source "gate" and "commercial" only: the whole question. */
            question: { type: "string" },
            /** One clause, at most 14 words, naming what this answer decides —
             *  in terms of the FUNDS above, not of gates or rules. */
            stake: { type: "string" },
            /** The answers, for every source. `label` is what the founder
             *  reads. `value` matters only for source "field", where it must
             *  be one of that field's offered values; leave it empty
             *  otherwise. One array rather than two, because two let the
             *  model fill the wrong one and silently lose the question. */
            options: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: { value: { type: "string" }, label: { type: "string" } },
                required: ["value", "label"],
              },
            },
          },
          required: ["source", "ref", "question", "stake", "options"],
        },
      },
    },
    required: ["theme", "questions"],
  } as const;

  const fieldBlock = enumFields.map((f) => {
    const hint = FIELD_ENUM_HINTS[f.field];
    const opts = fieldOptions(f.field, req.eligibility);
    return `  ref "${f.field}" (reach ${f.reachPct}% of the shortlist)\n` +
      `    ASK: "${hint.stem}" (tailor the wording, never the meaning)\n` +
      `    Fixed options the interface will render${hint.multi ? " (multi-select)" : ""}: ` +
      `${opts.map((o) => o.label).join(" / ")}\n` +
      `    Real requirement: ${f.examples[0]?.requirement ?? "(none quoted)"}`;
  }).join("\n\n");

  const gateBlock = projectGates.map((g) =>
    `  ref "${g.instrumentId}::${g.gateKey}" (reach ${g.reachPct}%, ${g.instrumentName})\n` +
    `    Requirement, verbatim: "${g.requirement}"`).join("\n\n");

  const commercialBlock = COMMERCIAL_TOPICS.map((t) => `  ref "${t}"`).join("\n");

  // Pool D. The ref is the JUDGEMENT key, not a gate id: two funds quoting the
  // same framework sentence are one demand and must produce one question.
  const openBlock = openQuestions.map((o) =>
    `  ref "open::${o.key}" (${o.instrumentName}, splits ${o.carriers} of ` +
    `${o.regimeSize} sibling funds)\n` +
    `    Requirement, verbatim: "${o.requirement}"`).join("\n\n");

  try {
    const res = billed(await client.messages.create({
      model: INTAKE_MODEL,
      max_tokens: 2400,
      thinking: { type: "disabled" },
      system: assembleInstructions("planner"),
      output_config: { format: { type: "json_schema", schema } },
      messages: [{
        role: "user",
        content:
          `Plan ONE screen of at most ${SCREEN_QUESTION_CAP} questions for a founder ` +
          `applying for European public funding. You are choosing from three ` +
          `pools and you can see all of them, so the screen must read as one ` +
          `coherent set rather than three lists stapled together.\n\n` +
          `## Who you are writing for\n` +
          `A founder or operator running a company: commercial, numerate, ` +
          `short on time, fluent about their own customers and revenue and ` +
          `completely new to public funding. Write the way a sharp investor ` +
          `asks questions in a first meeting: direct, concrete, one thing per ` +
          `question, no throat-clearing and no deference. They will answer in ` +
          `seconds if the question is about their business, and abandon the ` +
          `screen if it reads like a compliance form.\n\n` +
          `## What this screen is FOR\n` +
          `These funds are currently in front of them, best first:\n` +
          `${candidateBlock || "  (shortlist not available)"}\n` +
          `The screen exists to sharpen that list — to confirm which of these ` +
          `they can really go after and to drop the ones they cannot.\n\n` +
          `## What each fund still turns on\n` +
          `${stakeBlock || "  (no per-fund detail available)"}\n\n` +
          `THINK like an analyst, SPEAK like the founder. The analysis is ` +
          `yours; the vocabulary is theirs. Naming a programme's own machinery ` +
          `back at them — its work programme, its call topics, its cost ` +
          `categories — is not expertise, it is the jargon test failing while ` +
          `sounding expert.\n\n` +
          `THE BAR: would an analyst ask this to decide which fund to pursue, ` +
          `or is it a box being ticked? A question earns its slot when a ` +
          `different answer sends this founder to a different fund, or changes ` +
          `what they would say to one. Ask the question that decides the ` +
          `biggest fork first. If two funds hang on the same thing, that is ` +
          `the most valuable question on the screen; if a requirement belongs ` +
          `to one fund nobody would pursue anyway, it is worth nothing.\n\n` +
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
          (openBlock
            ? `## Pool D: requirements with NO fixed answer set (source "open")\n` +
              `These state a condition whose satisfaction is a judgement about ` +
              `what this company's project actually IS or DOES, measured ` +
              `against a standard the text states but never quantifies. No ` +
              `list of options can hold the answer, so you write the QUESTION ` +
              `ONLY and leave "options" empty: the founder answers in a ` +
              `sentence or two of their own prose, and a reader judges those ` +
              `words against the requirement.\n` +
              `Ask for the SUBSTANCE the requirement turns on, in the ` +
              `founder's own vocabulary, never for the requirement's own words ` +
              `back. A question that works here is one a founder could answer ` +
              `about their own project without having read anything.\n` +
              `${openBlock}\n\n`
            : "") +
          `## How to choose\n` +
          // Four is the target and six is the ceiling. This bullet used to say
          // "Aim to USE the full six... Cutting to two is not selectivity",
          // which is the opposite of what contracts/round2/questions.md tells
          // this same stage: "Four questions is the target. Six is the ceiling,
          // not the budget." A planner cannot obey both, and the contract is
          // the spec. What the old wording was right about is kept: the failure
          // it was written against is DELETING a question that would have
          // resolved a fund, not asking four instead of six.
          `- FOUR sharp questions is the target and SIX is the ceiling, never ` +
          `the budget. A question earns its slot by changing which funds come ` +
          `out on top or by making positioning writable. Ask a fifth and a ` +
          `sixth when they do that, and not to look thorough.\n` +
          `- The failure to avoid is the opposite one: dropping a question that ` +
          `would have resolved an open fund, and leaving that fund uncertain ` +
          `for want of one sentence from the founder. Sharpen a weak question ` +
          `rather than deleting it, and only then decide whether it still ` +
          `earns a slot.\n` +
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
          `- Every question carries a "stake": one clause, at most 14 words, ` +
          `saying what the answer decides, named in terms of the funds above. ` +
          `"Decides whether the Bpifrance route is open to you" is a stake. ` +
          `"Checks your eligibility" is not — it says nothing a founder could ` +
          `not have guessed.\n` +
          `- The founder answers from memory, without opening a document.\n` +
          `- A question about legal or financial STATUS (solvency, ownership, ` +
          `debts, sanctions) reads as suspicion unless you say why it is being ` +
          `asked. Where you ask one, put the reason in the question itself, in ` +
          `one clause, in terms of what it unlocks or blocks for them.\n` +
          `- Every option must be a substantive, checkable state of affairs. ` +
          `No "a mix of the above", "other", "none", "not sure": the ` +
          `interface appends its own.\n` +
          `- For source "field": copy the ref exactly and write BOTH the ` +
          `question and the option labels for this company. The answer SPACE ` +
          `is fixed and shown with each field: every option you write must ` +
          `carry one of those exact values, you must cover all of them, and ` +
          `you must not invent a new one. Rewrite the LABELS into this ` +
          `founder's terms and make the question specific to them. A question ` +
          `and its options are written together, so they must answer the same ` +
          `thing: if the options are a list of things to choose between, ask ` +
          `which of them applies; if they are yes and no, ask something ` +
          `answerable yes or no.\n` +
          `- For source "gate" and "commercial": write the whole question and ` +
          `3-5 options, leaving each option's "value" empty.\n` +
          `- For source "open": write the whole question and return an EMPTY ` +
          `options array. Copy the ref exactly. Ask one thing, answerable in ` +
          `two or three sentences from memory. When Pool D is not empty you ` +
          `MUST include at least one and at most two of them: these are the ` +
          `only questions on the screen that can resolve a requirement no ` +
          `checkbox will ever settle, and a screen without one leaves that ` +
          `fund's biggest condition untested.\n\n` +
          `Return ONLY the JSON object for the schema.`,
      }],
    }), INTAKE_MODEL);

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("");
    const parsed = extractJson<{
      theme: string;
      questions: {
        source: string; ref: string; question: string;
        stake?: string; options: { value: string; label: string }[];
      }[];
    }>(text);

    const gateByKey = new Map(projectGates.map((g) => [`${g.instrumentId}::${g.gateKey}`, g]));
    const openByRef = new Map(openQuestions.map((o) => [`${OPEN_ANSWER_PREFIX}${o.key}`, o]));
    const seenRefs = new Set<string>();
    const fields: { field: string; question: string; stake?: string; options?: { value: string; label: string }[] }[] = [];
    const written: ProjectQuestion[] = [];

    for (const q of parsed.questions ?? []) {
      // A field question needs no `question` of its own: its stem is fixed.
      const hasBody = q.source === "field" ? Boolean(q.ref) : Boolean(q.question?.trim());
      if (!hasBody || seenRefs.has(q.ref)) continue;
      // The cap is enforced HERE, not asked for in the prompt: a budget a
      // model may round up is not a budget.
      //
      // The same argument the other way for Pool D. Asked to spend "no more
      // than two" slots on open questions, the model spent ZERO on a live
      // screen that had three good candidates in front of it -- it prefers a
      // question it can write options for, every time. A floor a model may
      // round DOWN is not a floor either, so one slot is RESERVED whenever
      // open candidates exist: a non-open question may not take the last seat
      // while an open one is still waiting for it.
      const reserved = openQuestions.length && !written.some((w) => w.openText) ? 1 : 0;
      const seats = SCREEN_QUESTION_CAP - (q.source === "open" ? 0 : reserved);
      if (fields.length + written.length >= seats) continue;
      const options = (q.options ?? [])
        .map((o) => deDash(String(o?.label ?? "").trim()))
        .filter(Boolean)
        .filter((o) => !VAGUE_OPTION.test(o))
        .slice(0, 5);

      if (q.source === "field" && fieldNames.includes(q.ref)) {
        // Words tailored, answer space fixed.
        //
        // Freezing the stem removed a real defect — a polar question rendered
        // over a multi-select twice — and replaced it with a worse one: every
        // founder got the same canned sentence. Letting the model write the
        // question AND the labels, while every label must carry one of the
        // field's own values, keeps the tailoring and makes the mismatch
        // impossible, because whoever writes the question also writes what
        // sits under it.
        const hint = FIELD_ENUM_HINTS[q.ref];
        const hintOptions = fieldOptions(q.ref, req.eligibility);
        const valid = new Set(hintOptions.map((o) => o.value));
        const labelled = (q.options ?? [])
          .filter((o) => o && valid.has(o.value) && o.label?.trim())
          .map((o) => ({ value: o.value, label: deDash(o.label.trim()) }));
        const coversAll = labelled.length === hintOptions.length &&
          new Set(labelled.map((o) => o.value)).size === valid.size;
        seenRefs.add(q.ref);
        // A question and its options are ONE artifact. Falling back on the
        // options while keeping the rewritten question is what produced the
        // mismatch twice: a tailored sentence about accepting a board seat
        // sitting above the curated list of commitments, because the model
        // rewrote one half and we supplied the other. So the fallback is
        // all-or-nothing — either both come from the model, or both come from
        // the curated pair.
        fields.push({
          field: q.ref,
          question: coversAll
            ? (deDash((q.question ?? "").trim()) || hint.stem)
            : hint.stem,
          stake: deDash((q.stake ?? "").trim()) || undefined,
          options: coversAll ? labelled : undefined,
        });
      } else if (q.source === "gate" && gateByKey.has(q.ref) && options.length >= 2) {
        const g = gateByKey.get(q.ref)!;
        seenRefs.add(q.ref);
        written.push({
          id: q.ref, question: deDash(q.question.trim()),
          stake: deDash((q.stake ?? "").trim()) || undefined, options,
          instrumentId: g.instrumentId, instrumentName: g.instrumentName,
          gateKey: g.gateKey, quote: g.requirement, locator: g.locator,
        });
      } else if (q.source === "open" && openByRef.has(q.ref)) {
        // No option floor. An open question has no options by construction,
        // and requiring two here is exactly what would silently drop every one
        // of them. The grounding is unchanged: instrument, gate key and
        // verbatim quote all ride along, so the citation the founder reads and
        // the sentence the judge reads are the same sentence.
        const o = openByRef.get(q.ref)!;
        seenRefs.add(q.ref);
        written.push({
          id: q.ref, question: deDash(q.question.trim()),
          stake: deDash((q.stake ?? "").trim()) || undefined, options: [],
          instrumentId: o.instrumentId, instrumentName: o.instrumentName,
          gateKey: o.gateKey, quote: o.requirement, locator: o.locator,
          openText: true, openKey: o.key,
        });
      } else if (q.source === "commercial" && options.length >= 2) {
        seenRefs.add(q.ref);
        written.push({
          id: `${COMMERCIAL_ANSWER_PREFIX}${q.ref}`,
          question: deDash(q.question.trim()),
          stake: deDash((q.stake ?? "").trim()) || undefined, options,
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
      system: assembleInstructions("screen"),
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
