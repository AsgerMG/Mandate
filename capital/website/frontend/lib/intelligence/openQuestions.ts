// Open questions: the requirements stage 2 currently throws away.
//
// ── The defect ────────────────────────────────────────────────────────────
// Stage 2 chooses what to ask in `openFieldsForShortlist`, which drops any
// requirement without a fixed answer set and without a mapped intake field. Of
// 3,595 filter-role gates on publishable instruments, 2,110 carry a decidable
// comparator, 1,079 carry a field and no comparator, and 406 carry neither.
// The last two groups — 1,485 gates, 1,354 of them long enough to phrase a
// question from — are invisible to stage 2 although their verbatim text is
// sitting on the gate. That is the mechanical half of wsCA's "matchable 31.4%
// against present 62.0%": thirty points of ceiling that is text we hold and
// cannot test an answer against.
//
// ── The precedent ─────────────────────────────────────────────────────────
// Region was a field "the gate layer cannot see", and the answer was not to
// wait for an encoding that could not exist — it was to ground the question in
// different evidence (`regionPrior.generated.json`, the measured recipient
// footprint). Same shape here. The evidence is the requirement text itself,
// and the comparator is a model reading the founder's own prose against it.
//
// ── The three things this module is careful about ─────────────────────────
//
// 1. NOT EVERY UNENCODED REQUIREMENT IS FUZZY. A threshold nobody has encoded
//    is an encoding debt, and asking a founder about it in words is strictly
//    worse than a comparator — prose can be misread, a comparator cannot. Only
//    requirements classified `judgeable` are ever asked. See
//    `scripts/emit_open_question_class.ts` for the property and its test.
//
// 2. AN UNCERTAIN ANSWER MUST NOT HARDEN INTO A REJECTION. A wrongly-judged
//    gate hides a fund from someone who qualifies, which is the harm that hid
//    Innovate UK from every founder who answered the ticket-size question.
//    Two structural guarantees, not two intentions:
//      - `openFitScorer` is multiplied into `pref` in
//        `materialiseInstrumentTable`, which is RANK-PRESERVING: a channel
//        keeps its exact multiset of row scores and only the ASSIGNMENT among
//        siblings changes. So no fund can leave the pool, no channel can leave
//        the table, and no verdict can turn from open to blocked, whatever the
//        judge says. The worst a wrong judgement can do is swap two siblings.
//      - `unknown` scores exactly as "not judged": it produces no entry, and a
//        leaf with no entry scores 1. A judge that says nothing changes
//        nothing. This is pinned by `openQuestions.test.ts`.
//
// 3. THE ANSWER SPACE IS THE FOUNDER'S, NOT THE FUND'S. The question is asked
//    in the founder's words about their own project; the fund's text is read
//    only by the judge, never shown as an option. That keeps Q-1 (no lifted
//    verbatim runs in options) satisfiable.
import { loadGenerated } from "./generatedArtifact";

/** Requirement text is only worth a question above this length. Below it the
 *  text is almost always a restatement of the enum it maps to ("Must be an
 *  SME"); above it, it tends to carry real project detail. Tuned so the EIC
 *  TRL gate (89 chars) survives even though developmentStage is answered on
 *  the first page.
 *
 *  ONE declaration, read by the selector, the classifier's emitter and
 *  `gateReach.ts`, which used to keep its own copy under a different name. */
export const MIN_SUBSTANTIVE_LEN = 60;

/** Alias used by the emitter, so the classifier and the selector cannot come
 *  to disagree about which sentences are in scope. */
export const MIN_JUDGEABLE_LEN = MIN_SUBSTANTIVE_LEN;

/** The stable key for a requirement: its normalised text, not its gate id.
 *
 *  Gate ids are re-minted whenever the extractor re-runs, so an artifact keyed
 *  on them would silently empty itself on the next corpus load. Text survives
 *  re-extraction, and two funds quoting the same framework sentence share one
 *  judgement — which is the behaviour we want, since they are one demand. */
export function normaliseRequirement(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Basename under `lib/intelligence/`, which is what `loadGenerated` takes and
 *  what `check_artifact_reachability.py` looks for. */
export const OPEN_QUESTION_CLASS_FILE = "openQuestionClass.generated.json";
/** Repo-relative path, for the emitter's `writeFileSync`. */
export const OPEN_QUESTION_CLASS_PATH = `lib/intelligence/${OPEN_QUESTION_CLASS_FILE}`;

/** What kind of requirement a sentence is. See the emitter for the property
 *  and the test that decides it. */
export type RequirementClass = "encodable" | "judgeable" | "unaskable";

interface ClassArtifact {
  generatedAt?: string;
  model?: string;
  candidates?: number;
  classified?: number;
  failedBatches?: number;
  classes?: Record<string, [string, string]>;
}

let classCache: ClassArtifact | undefined;

function classes(): Record<string, [string, string]> {
  if (classCache === undefined) {
    classCache = loadGenerated<ClassArtifact>(OPEN_QUESTION_CLASS_FILE, {});
  }
  return classCache.classes ?? {};
}

/** The class of a requirement, or undefined when it has never been judged.
 *
 *  Undefined is NOT treated as judgeable. A corpus that grows adds no
 *  questions until the classifier is re-run, which is the safe direction: the
 *  failure mode of guessing is asking a founder to answer a threshold in
 *  prose, which is worse than not asking at all. */
export function requirementClassOf(requirement: string): RequirementClass | undefined {
  const row = classes()[normaliseRequirement(requirement)];
  if (!row) return undefined;
  const k = row[0];
  return k === "encodable" || k === "judgeable" || k === "unaskable" ? k : undefined;
}

/** Provenance, for a harness that must say what it measured over. */
export function openQuestionClassStats(): {
  generatedAt: string; model: string; candidates: number; classified: number; failedBatches: number;
} {
  classes();
  return {
    generatedAt: classCache?.generatedAt ?? "",
    model: classCache?.model ?? "",
    candidates: classCache?.candidates ?? 0,
    classified: classCache?.classified ?? 0,
    failedBatches: classCache?.failedBatches ?? 0,
  };
}

// ── The arm ────────────────────────────────────────────────────────────────
//
// Default OFF, exactly as SECTOR_CLIP_ARM is, so the measurement is
// reproducible without being live. Read at module load and never per call: a
// measurement must not be able to drift mid-run.
//
// "on" changes two things and only two: stage 2 may ask open questions, and
// `computeVerdict` may read their judgements. With the arm off, both paths are
// dead code and the shipped ranker is bit-identical to main.
export type OpenQuestionArm = "on" | "off";
export const OPEN_QUESTION_ARM: OpenQuestionArm =
  process.env.OPEN_QUESTION_ARM === "on" ? "on" : "off";

/** How many open questions stage 2 may ask, at most. The screen's own cap is
 *  6 questions total; open questions compete for those slots and must not
 *  crowd out the fields that already rank. See `selectOpenQuestions`. */
export const OPEN_QUESTION_BUDGET =
  Math.max(0, Math.min(6, Number(process.env.OPEN_QUESTION_BUDGET ?? 3) || 0));

// ── Judgements ─────────────────────────────────────────────────────────────

/** What a model concluded about ONE requirement, given the founder's prose. */
export interface OpenJudgement {
  /** `normaliseRequirement` of the gate text this judges. */
  key: string;
  verdict: "meets" | "fails" | "unknown";
}

/**
 * How much a founder's judged answers should move ONE leaf against its
 * siblings.
 *
 * Deliberately the same shape as `gateFitScorer`: per-regime, min-max
 * normalised inside the group, neutral 1 for anything it cannot speak to. Four
 * properties that are not negotiable, each pinned by a test:
 *
 *  - A leaf with no judged requirement scores exactly 1.
 *  - `unknown` contributes nothing — it is not a zero, it is an absence. A
 *    judge that returns `unknown` for everything leaves the ranking untouched.
 *  - A group where every leaf scores the same returns the neutral function, so
 *    `pref`'s early-out leaves the channel alone rather than activating a
 *    reassignment for a group that had nothing to separate.
 *  - A leaf standing alone in its regime is never scored. Cross-channel
 *    promotion is the failure mode that sank the channel prior and the
 *    standalone-gate arm; this scorer can only ever reorder siblings.
 */
export const OPEN_MATCH = 1.35;

export function openFitScorer<T extends { id: string; parentId?: string | null; gates?: { requirement: string; gateRole?: string }[] }>(
  leaves: T[],
  judgements: OpenJudgement[] | undefined,
): (i: T) => number {
  const neutral = () => 1;
  if (OPEN_QUESTION_ARM !== "on") return neutral;
  if (!judgements?.length) return neutral;
  const verdictOf = new Map(judgements.map((j) => [j.key, j.verdict]));

  const byRegime = new Map<string, T[]>();
  for (const l of leaves) {
    const r = l.parentId ?? l.id;
    (byRegime.get(r) ?? byRegime.set(r, []).get(r)!).push(l);
  }

  const score = new Map<string, number>();
  for (const group of byRegime.values()) {
    if (group.length < 2) continue;
    const fit = new Map<string, number>();
    for (const l of group) {
      let judged = 0, met = 0;
      const seen = new Set<string>();
      for (const g of l.gates ?? []) {
        if (g.gateRole && g.gateRole !== "filter") continue;
        const req = (g.requirement ?? "").trim();
        if (req.length < MIN_SUBSTANTIVE_LEN) continue;
        const key = normaliseRequirement(req);
        if (seen.has(key)) continue;
        const v = verdictOf.get(key);
        // Not asked about, or asked and not settled. Both are absences, and an
        // absence is never a failure. This is the line that makes "prefer
        // unknown to a false block" a property of the code rather than of the
        // prompt.
        if (v !== "meets" && v !== "fails") continue;
        seen.add(key);
        judged += 1;
        if (v === "meets") met += 1;
      }
      if (judged > 0) fit.set(l.id, met / judged);
    }
    const known = [...fit.values()];
    if (known.length < 2) continue;
    const lo = Math.min(...known), hi = Math.max(...known);
    if (hi === lo) continue;
    for (const [id, f] of fit) {
      score.set(id, Math.pow(OPEN_MATCH, 2 * ((f - lo) / (hi - lo)) - 1));
    }
  }
  if (!score.size) return neutral;
  return (i: T) => score.get(i.id) ?? 1;
}
