// The mechanically checkable half of the round-2 contracts.
//
// Sibling of briefChecks.ts, and it exists for a sharper reason: the brief has
// had a scoreboard for months, and round 2 has never been generated in a test
// at all. memo_bench calls runIntelligence directly, and the question
// generators live only in the intake route, so no harness has ever produced a
// single adaptive question. Everything measured improved; this is the part
// that was not measured.
//
// Rule ids are declared in contracts/round2/ and checked against this module
// by scripts/check_contracts.ts, same as the brief.
import { COMMERCIAL_ANSWER_PREFIX } from "./types";
import type { ProjectQuestion } from "./types";

export interface QuestionViolation {
  ruleId: string;
  detail: string;
}

const TOKENS = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Options that ask the founder to choose nothing. Mirrors the generator's own
 *  filter so a regression in either shows up here rather than in a brief. */
const VAGUE_OPTION =
  /^(other|none|not sure|unsure|n\/?a|a mix\b|mix of\b|some of\b|several\b|both\b|partly\b|all of\b|combination\b|it depends\b)/i;

/**
 * Word sequences an option shares verbatim with the fund's requirement text.
 *
 * This is the check for the defect that started the round-2 rework: an option
 * read "SME financing-access costs", which is a phrase from a state-aid
 * regime document, not something a founder would ever say about their own
 * business. They picked it, and it propagated into the brief as a sentence
 * about what their financing covers.
 *
 * Four words is the threshold because shorter overlaps are unavoidable — an
 * option about R&D will legitimately contain "research and development". A
 * four-word verbatim run means the option was lifted rather than translated.
 */
function liftedPhrase(option: string, quote: string, minRun = 4): string | null {
  const o = TOKENS(option);
  const q = TOKENS(quote);
  if (o.length < minRun || q.length < minRun) return null;
  const haystack = ` ${q.join(" ")} `;
  for (let i = 0; i + minRun <= o.length; i += 1) {
    const run = o.slice(i, i + minRun).join(" ");
    if (haystack.includes(` ${run} `)) return run;
  }
  return null;
}

/**
 * A question's topic, as the set of meaningful tokens in its text and options
 * minus the founder's own vocabulary.
 *
 * Stripping the founder's words is what makes it work: every project question
 * repeats the company's technology by design, so raw overlap between any two
 * is near-total. What remains is the actual subject.
 */
export function topicSignature(
  q: { question: string; options: string[] },
  ownWords: Set<string>,
): Set<string> {
  const out = new Set<string>();
  for (const t of [...TOKENS(q.question), ...q.options.flatMap(TOKENS)]) {
    if (t.length >= 4 && !ownWords.has(t)) out.add(t);
  }
  return out;
}

export const TOPIC_OVERLAP_LIMIT = 0.45;

export interface QuestionCheckInput {
  questions: ProjectQuestion[];
  /** The founder's own description, so their vocabulary is not counted as
   *  jargon lifted from a fund. */
  description?: string;
  /** True when a description was supplied, so the commercial half was
   *  expected to run. */
  expectCommercial?: boolean;
}

export function checkQuestions(input: QuestionCheckInput): QuestionViolation[] {
  const v: QuestionViolation[] = [];
  const { questions } = input;
  const ownWords = new Set(TOKENS(input.description ?? ""));

  for (const q of questions) {
    // Q-1: options must be translated out of the requirement, not quoted from it.
    for (const o of q.options) {
      const run = q.quote ? liftedPhrase(o, q.quote) : null;
      if (run) {
        v.push({ ruleId: "Q-1", detail: `option lifts "${run}" verbatim from the fund's text (${q.question.slice(0, 50)}…)` });
      }
    }
    // Q-3: an option set the founder cannot choose between is a wasted question.
    if (q.options.length < 2) {
      v.push({ ruleId: "Q-3", detail: `only ${q.options.length} option(s): ${q.question.slice(0, 60)}` });
    }
    for (const o of q.options) {
      if (VAGUE_OPTION.test(o)) {
        v.push({ ruleId: "Q-3", detail: `option carries no information: "${o}"` });
      }
    }
  }

  // Q-2: no two questions may ask the same thing in different words.
  const kept: { q: ProjectQuestion; sig: Set<string> }[] = [];
  for (const q of questions) {
    const sig = topicSignature(q, ownWords);
    for (const k of kept) {
      const shared = [...sig].filter((t) => k.sig.has(t)).length;
      const ratio = shared / Math.max(Math.min(sig.size, k.sig.size), 1);
      if (ratio > TOPIC_OVERLAP_LIMIT) {
        v.push({ ruleId: "Q-2", detail: `duplicate topic: "${q.question.slice(0, 45)}…" vs "${k.q.question.slice(0, 45)}…"` });
        break;
      }
    }
    kept.push({ q, sig });
  }

  // Q-4: one question per gate, so a founder is never asked twice for one rule.
  const byKey = new Map<string, number>();
  for (const q of questions) {
    const key = q.id || q.gateKey;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  for (const [key, n] of byKey) {
    if (n > 1) v.push({ ruleId: "Q-4", detail: `${n} questions share the key ${key}` });
  }

  // Q-5: the commercial half must run, because positioning has no other source
  // for how the business actually works.
  const commercial = questions.filter((q) => q.id?.startsWith(COMMERCIAL_ANSWER_PREFIX));
  if (input.expectCommercial && commercial.length === 0) {
    v.push({ ruleId: "Q-5", detail: "no commercial-model questions were generated" });
  }

  return v;
}

export const QUESTION_RULE_IDS = ["Q-1", "Q-2", "Q-3", "Q-4", "Q-5"] as const;
