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

/**
 * The measurement a question's options are expressed in.
 *
 * Two questions can score far apart on topic overlap and still ask the same
 * thing, because one of them wraps the measurement in extra words. A live
 * screen asked "at what technology readiness level is X operating?" and then
 * "does X have a credible path to commercial deployment, and is the core
 * technology at TRL 5-6 or higher?" — the second carries enough distinct
 * vocabulary to clear the topic threshold, and the founder answered TRL 6 to
 * one and TRL 7-8 to the other. The brief then published both, stating two
 * different readiness levels for the same product.
 *
 * Options that quantify share their scale tokens: the TRL bands, the
 * percentage bands, the headcount bands. Comparing those catches the
 * duplicate whatever prose surrounds it, and stays general — it knows nothing
 * about readiness levels specifically, only that two questions are measuring
 * on one axis.
 */
export function measurementSignature(options: string[]): Set<string> {
  const out = new Set<string>();
  for (const o of options) {
    for (const t of o.toLowerCase().match(/[a-z]*\d+[a-z]*/g) ?? []) out.add(t);
    // The unit itself, where the options name one ("TRL 5-6", "50-249 FTE").
    for (const t of o.toLowerCase().match(/\b[a-z]{2,5}(?=\s*\d)/g) ?? []) out.add(t);
  }
  return out;
}

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
    //
    // An OPEN question is exempt, and the exemption is narrow on purpose: it
    // applies only where `openText` says the question was written from a
    // requirement that has no fixed answer set and never will (wsCD). Those
    // carry no options BY CONSTRUCTION, so flagging them would report the
    // design as a defect -- and the obvious way to make the report green
    // would be to invent options for a question whose whole point is that
    // none exist. A question that merely FORGOT its options still fails here,
    // because it does not carry the flag.
    if (!q.openText && q.options.length < 2) {
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
      // Same measurement, different wrapping.
      const ma = measurementSignature(q.options), mb = measurementSignature(k.q.options);
      if (ma.size >= 2 && mb.size >= 2) {
        const shared2 = [...ma].filter((t) => mb.has(t)).length;
        if (shared2 / Math.min(ma.size, mb.size) > 0.5) {
          v.push({ ruleId: "Q-2", detail: `same measurement asked twice: "${q.question.slice(0, 45)}…" vs "${k.q.question.slice(0, 45)}…"` });
          break;
        }
      }
    }
    kept.push({ q, sig });
  }

  // Q-4: one question per gate, so a founder is never asked twice for one rule.
  //
  // THE GATE first, and `id` only where there is no gate. It read `q.id ||
  // q.gateKey`, and `id` is `${instrumentId}::${gateKey}` which the generator
  // has ALREADY deduped on, so the branch that was always taken could only
  // re-confirm an upstream guarantee and the branch that could see the property
  // was unreachable. The case it could not see is the whole of the rule: two
  // DIFFERENT funds quoting the SAME rule -- "eic::sme_status" and
  // "eurostars::sme_status" -- which is one rule and two questions to a
  // founder, who has to answer their headcount twice.
  const byKey = new Map<string, number>();
  for (const q of questions) {
    const key = q.gateKey || q.id;
    if (!key) continue;
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

/**
 * A yes/no question published over an option set that is a list of things
 * rather than yes and no.
 *
 * The failure this catches: a multi-select of commitments a founder might
 * make (a local entity, the state on the cap table, job-creation targets) was
 * rendered under "are you prepared for a public investor to take a seat on
 * your cap table?" — the reader was asked one question and offered the
 * answers to a different one. Neither the question nor the options were wrong
 * on their own, which is why nothing caught it.
 */
/**
 * Does the question ask WHICH, or does it ask WHETHER?
 *
 * A question offering a list of things to choose between must ask which of
 * them applies. A question answerable yes or no must offer yes and no. Pairing
 * one with the other asks the reader something and then offers the answers to
 * something else.
 *
 * Keying on the first word was too narrow and let the defect through twice:
 * "Would you accept X?" was caught, "If a funder required X, would that be
 * acceptable?" was not, though both are polar questions over a list of
 * commitments. A question is treated as SELECTIVE when it contains an
 * interrogative that picks among alternatives, and as POLAR otherwise —
 * which does not care where in the sentence the verb falls.
 */
const SELECTIVE = /\b(which|what|who|where|when|how)\b/i;
const YES_NO_OPTION = /^(yes|no|not sure|unsure)\b/i;

export function checkGroundedQuestions(
  questions: { question: string; options: string[]; field?: string }[],
): QuestionViolation[] {
  const v: QuestionViolation[] = [];
  for (const q of questions) {
    const optionsAreYesNo = q.options.length > 0 && q.options.every((o) => YES_NO_OPTION.test(o));
    const asksWhich = SELECTIVE.test(q.question);
    if (!asksWhich && !optionsAreYesNo && q.options.length > 2) {
      v.push({
        ruleId: "Q-10",
        detail: `asks whether, offers which: "${q.question.slice(0, 70)}…" → ${q.options.slice(0, 3).join(" / ")}`,
      });
    }
    if (asksWhich && optionsAreYesNo) {
      v.push({
        ruleId: "Q-10",
        detail: `asks which, offers only yes/no: "${q.question.slice(0, 70)}…"`,
      });
    }
  }
  return v;
}

/**
 * ── ONE SCREEN, ONE QUESTION PER INTAKE FIELD (Q-16) ───────────────────────
 *
 * THE PROPERTY: no screen presents two questions keyed on one intake field.
 *
 * A `GroundedQuestion`'s `field` IS the storage key — the panel writes the
 * answer to `elig[q.field]`, so two questions on one field are two questions
 * whose answers overwrite each other. The founder answers twice, one answer is
 * discarded silently, and which one survives is decided by the order of a
 * loop. It costs a slot on a screen with six of them and it can cost the
 * ANSWER: the two questions may be phrased from different funds' wordings and
 * elicit different values.
 *
 * ── Why this is not Q-4 ───────────────────────────────────────────────────
 * Q-4 is one question per GATE. Two different funds can encode two different
 * gates against one field, so a screen can satisfy Q-4 perfectly and still ask
 * a founder for their organisation type twice. And Q-4 reads `gateKey || id`,
 * which planner-written generic questions do not carry at all.
 *
 * ── What made it necessary ────────────────────────────────────────────────
 * Two stages now write into this half of the screen: the round-2 planner and,
 * behind `RANKER_ASKS`, the stage that picks. Neither can see the other's
 * output — they run in one `Promise.all` precisely so the founder does not wait
 * through two serial calls — so the merge is the only place the property can be
 * decided, and a merge is exactly the kind of code that is written once and
 * then trusted.
 *
 * Stated over the field rather than over the stage, so it holds for a third
 * generator nobody has written yet, and for a field added to the intake
 * tomorrow.
 */
export function checkScreenFields(
  questions: { field?: string; question?: string }[],
): QuestionViolation[] {
  const v: QuestionViolation[] = [];
  const seen = new Map<string, string[]>();
  for (const q of questions) {
    const f = q.field?.trim();
    if (!f) continue;
    seen.set(f, [...(seen.get(f) ?? []), (q.question ?? "").slice(0, 45)]);
  }
  for (const [field, asked] of seen) {
    if (asked.length > 1) {
      v.push({
        ruleId: "Q-16",
        detail: `${asked.length} questions are keyed on the intake field "${field}", ` +
          `so their answers overwrite each other: ${asked.map((a) => `"${a}…"`).join(" vs ")}`,
      });
    }
  }
  return v;
}

export const QUESTION_RULE_IDS = ["Q-1", "Q-2", "Q-3", "Q-4", "Q-5", "Q-10", "Q-16"] as const;
