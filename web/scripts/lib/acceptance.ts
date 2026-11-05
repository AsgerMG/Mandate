/**
 * ONE definition of what it means for a failure to be ALREADY DECIDED.
 *
 * ── Why this is a module and not two copies ────────────────────────────────
 * `data/guard_registry.json` grew an `accepted` block on 2026-08-12, for the
 * eleven credentialled guards `check_verdicts.ts` reads. Its `$why` states the
 * five bindings that keep an acceptance from being a mute button, and
 * `check_verdicts.ts` enforced all five in a private function.
 *
 * On 2026-08-18 the same arrangement was needed one layer out, for the ~59
 * checks `npm run check` runs, seven of which had been red across 139
 * consecutive commits on main. Copying the function would have produced two
 * definitions of "accepted" that agree today; this repo's standing lesson is
 * that a second copy of a rule is the first copy's next defect.
 *
 * So the bindings live here, and both readers import them:
 *
 *   scripts/check_verdicts.ts    the corpus guards, keyed by verdict id
 *   scripts/check_red_debt.ts    the check suite, keyed by check script
 *
 * ── The bindings, and the argument for each ────────────────────────────────
 * An acceptance applies only while ALL of these hold. Every one of them exists
 * because its absence is a way for the block to become somewhere failures go to
 * be forgotten:
 *
 *   SHAPED     it names a `reason`, a `failure` and a `review`. An entry
 *              missing any of the three is a mute button with no argument.
 *   BOUND      `failure` is a regex the subject's own summary must match. A
 *              subject that has started failing a DIFFERENT way is a new fact
 *              nobody has decided about, and must reach a person.
 *   DATED      `review` is a readable date, and it is still in the future.
 *   SHORT      `review` is no further from `since` than the caller's cap. A
 *              hold longer than the silence it is holding is not a decision,
 *              it is the silence with a date on it. Only enforced where the
 *              caller supplies `since` and `maxHeldDays`; the registry's
 *              existing entries carry no `since` and are unaffected.
 *
 * A fifth binding — an acceptance over a subject that has gone GREEN is
 * pre-authorisation for the next regression — is about the subject rather than
 * the entry, so it stays with each reader, which is where the subject is.
 */

/** One entry of an `accepted` block. `since` and `owner` are optional because
 *  the registry's original eleven-guard block predates them; a caller that
 *  supplies `maxHeldDays` requires them (see `judgeAcceptance`). */
export interface Accepted {
  reason: string;
  failure: string;
  review: string;
  since?: string;
  owner?: string;
  /** Which of the three things a red check can be. Carried here rather than
   *  inferred, because the treatments are opposite and only a person knows
   *  which one this is. */
  class?: RedClass;
}

/** A red check is one of exactly three things, and they need opposite work.
 *  Stated as a closed set because the SET is the finding: an undifferentiated
 *  red block is what made thirteen failures read as one background fact. */
export type RedClass = "defect" | "guard" | "corpus-state";

export const RED_CLASSES: readonly RedClass[] = ["defect", "guard", "corpus-state"];

/** What each class means, printed beside every held failure so the reader does
 *  not have to hold the vocabulary in their head. */
export const RED_CLASS_MEANING: Record<RedClass, string> = {
  defect: "the check is right and the product is wrong. Fix the product.",
  guard: "the check is grading the wrong subject. Fix the check, and say what "
       + "it should have been asking.",
  "corpus-state": "the check is right and the fix is a publish or a redeploy "
       + "owned outside this checkout. It must say so in its own output.",
};

export const MS_PER_DAY = 86_400_000;
export const days = (a: number, b: number) => (a - b) / MS_PER_DAY;

export interface Verdict {
  /** Print this: the failure is held, and here is who is holding it. */
  held?: string;
  /** Print this: an acceptance exists and does NOT apply. Never a bare
   *  `false` — "the acceptance did not apply" is itself something the reader
   *  has to be told, or the block becomes the place entries go to be
   *  forgotten. */
  void?: string;
}

export interface JudgeInput {
  /** What is failing, as the reader knows it. */
  id: string;
  entry: Accepted | undefined;
  /** The subject's OWN last words. `failure` is matched against this. */
  summary: string;
  now: number;
  /** When set, `since` and `owner` become required and the hold is capped at
   *  this many days from `since`. */
  maxHeldDays?: number;
}

/**
 * Has somebody already decided about THIS failure of THIS subject?
 *
 * Returns `null` when there is no acceptance at all — the caller decides what
 * an unheld failure means, because that differs between the two readers.
 */
export function judgeAcceptance(input: JudgeInput): Verdict | null {
  const { id, entry: a, summary, now, maxHeldDays } = input;
  if (!a) return null;

  const required = ["reason", "failure", "review",
                    ...(maxHeldDays === undefined ? [] : ["since", "owner"])];
  const shape = required.filter((k) => !a[k as keyof Accepted]);
  if (shape.length) {
    return { void: `the acceptance for ${id} is missing ${shape.join(", ")}. An accepted `
      + `failure with no ${shape[0]} is a mute button, so it does not apply.` };
  }

  const reviewAt = Date.parse(`${a.review}T00:00:00Z`);
  const left = days(reviewAt, now);
  if (Number.isNaN(left)) {
    return { void: `the acceptance for ${id} has an unreadable review date `
      + `(${JSON.stringify(a.review)}); it does not apply.` };
  }
  if (left <= 0) {
    return { void: `the acceptance for ${id} EXPIRED on ${a.review}. The reason it `
      + `recorded was:\n        ${a.reason}\n      Re-examine it and either fix the subject `
      + `or set a new review date, deliberately.` };
  }

  if (maxHeldDays !== undefined) {
    if (a.class && !RED_CLASSES.includes(a.class)) {
      return { void: `the acceptance for ${id} declares class ${JSON.stringify(a.class)}, `
        + `which is not one of ${RED_CLASSES.join(", ")}. The three take opposite work, `
        + `so an unclassified hold is a hold nobody can act on.` };
    }
    if (!a.class) {
      return { void: `the acceptance for ${id} declares no class. A red check is a defect, `
        + `a guard grading the wrong subject, or a corpus-state fact owned elsewhere, `
        + `and the three take opposite work.` };
    }
    const sinceAt = Date.parse(`${a.since}T00:00:00Z`);
    if (Number.isNaN(sinceAt)) {
      return { void: `the acceptance for ${id} has an unreadable \`since\` date `
        + `(${JSON.stringify(a.since)}); without it nothing can say how long this has `
        + `been red, which is the whole question.` };
    }
    const held = days(reviewAt, sinceAt);
    if (held > maxHeldDays) {
      return { void: `the acceptance for ${id} runs ${held.toFixed(0)} day(s) from `
        + `${a.since} to ${a.review}, past the ${maxHeldDays}-day cap. A hold longer `
        + `than the silence it is holding is not a decision, it is the silence with a `
        + `date on it. Shorten it, or fix the thing.` };
    }
  }

  // The FAILURE is accepted, not the subject. A subject that has started
  // failing a different way is a new fact and must reach a person.
  let matches: boolean;
  try {
    matches = new RegExp(a.failure).test(summary ?? "");
  } catch (err) {
    return { void: `the acceptance for ${id} carries an unusable \`failure\` pattern `
      + `${JSON.stringify(a.failure)} (${err}); it does not apply.` };
  }
  if (!matches) {
    return { void: `${id} is failing, an acceptance exists, and it does NOT cover this `
      + `failure.\n      accepted:  /${a.failure}/\n      reported:  `
      + `${summary || "(no summary)"}\n      The subject has started failing a `
      + `different way, which is a new fact nobody has decided about.` };
  }

  const age = a.since
    ? `, red since ${a.since} (${days(now, Date.parse(`${a.since}T00:00:00Z`)).toFixed(0)} day(s))`
    : "";
  const who = a.owner ? ` — ${a.owner}` : "";
  return { held: `${a.reason}\n      Accepted until ${a.review} `
    + `(${left.toFixed(0)} day(s) left)${age}${who}` };
}

/** The `$`-prefixed keys every block in data/guard_registry.json uses to carry
 *  its own reasoning. Documentation is never data — the same convention as the
 *  `__`-prefixed keys in the verdict dumps. */
export function entriesOf<T>(block: Record<string, unknown> | undefined): Record<string, T> {
  return Object.fromEntries(
    Object.entries(block ?? {}).filter(([k]) => !k.startsWith("$")),
  ) as Record<string, T>;
}
