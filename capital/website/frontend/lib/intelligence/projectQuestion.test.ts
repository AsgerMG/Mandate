/**
 * POOL P: STEP 3 ASKS FOR THE PROJECT WHEN WE DO NOT HAVE IT (wsIV).
 *
 * The load-bearing property, and the only one worth a test file of its own:
 *
 *   THE FOUNDER'S ANSWER TO THE DESCRIBE-YOUR-PROJECT QUESTION ARRIVES AT THE
 *   RANKER INSIDE `description` — the string `semanticFundMatch` and
 *   `themeRelevance` are taken against — AND NOT MERELY AS A `ProjectAnswer`.
 *
 * That distinction is the whole feature. A `ProjectAnswer`'s own docstring says
 * it is "writer context and ease-scoring input only": it reaches the memo
 * writer's prompt, `ease.ts` and the selector's context block, and it reaches
 * the theme cosine that is `THEME_WEIGHT = 0.6` of the leaf score NOWHERE. So a
 * Pool P question whose answer landed in `projectAnswers` would look identical
 * on screen, pass every existing test, and buy nothing at all in the ranking —
 * which is precisely the shape of the four defects `check_answer_reach.ts`
 * exists for.
 *
 * ── Its own file, because the arm is read at module scope ──────────────────
 * `PROJECT_QUESTION_ARM` is read once when `adaptiveRound.ts` is imported, the
 * same as `OPEN_QUESTION_ARM`. Vitest isolates module registries per file, so
 * setting the env here — before any import that could pull the module in — is
 * what makes the ON arm reachable without making it settable mid-run, which
 * would be a lever a typo could flip.
 *
 * FREE AND HERMETIC, on the same terms as `founderPath.test.ts`: no API key,
 * no DATABASE_URL, no VOYAGE_KEY, no network. Both credentials are DESTROYED
 * rather than merely absent, and the model is `__offlineModel.ts`.
 */
process.env.PROJECT_QUESTION_ARM = "on";

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", async () => {
  const { OfflineAnthropic } = await import("./__offlineModel");
  return { default: OfflineAnthropic };
});

// The request the ranking stage was actually handed, captured at the seam.
const seen: { runIntelligence: unknown[] } = { runIntelligence: [] };
vi.mock("@/lib/intelligence/pipeline", async (orig) => {
  const m = await orig() as Record<string, (...a: unknown[]) => unknown>;
  return {
    ...m,
    runIntelligence: (...a: unknown[]) => { seen.runIntelligence.push(a[0]); return m.runIntelligence(...a); },
  };
});

import { ARCHETYPES, archetypeAnswers } from "./__archetypes";
import { PROJECT_ANSWER_PREFIX, USEFUL_DESCRIPTION_CHARS, type EligibilityAnswers } from "./types";

type Run = Awaited<ReturnType<typeof import("./__founderPath")["driveFounderPath"]>>;

const A = ARCHETYPES.find((a) => a.label === "Robotics")!;

/**
 * A founder who genuinely wrote enough, CHOSEN BY THE FLOOR rather than named.
 *
 * Worth stating because it surprised this file into failing: SEVEN of the
 * twelve next-gen archetypes carry a description shorter than
 * `USEFUL_DESCRIPTION_CHARS`, `Robotics` among them at 52 characters. They are
 * one-line labels for a bench, not what a founder types into the box, so
 * picking one by name to be "the described founder" would have silently graded
 * the thin branch twice. The set is filtered by the same predicate the product
 * uses, so a rewritten archetype cannot quietly break this again.
 */
const DESCRIBED = ARCHETYPES.find((a) =>
  a.description.trim().length >= USEFUL_DESCRIPTION_CHARS)!;

/** Under `USEFUL_DESCRIPTION_CHARS`, which is the condition Pool P fires on:
 *  long enough to be a real thing a founder typed, far too short to separate
 *  funds. This is the founder who pressed "Continue anyway". */
const THIN = "robots";

let thin: Run;
let described: Run;
/** Everything sent to the memo route on the thin run. */
const memoBodyOf = (r: Run) =>
  r.wire.find((w) => w.route === "/api/intelligence")!.body as {
    description: string; projectAnswers: { questionId: string; answer: string }[];
  };

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.VOYAGE_KEY;
  const { driveFounderPath } = await import("./__founderPath");
  const base = {
    country: A.country,
    capitalSought: ["grant", "loan"],
    eligibility: archetypeAnswers(A) as EligibilityAnswers,
  };
  thin = await driveFounderPath({ ...base, company: A.label, description: THIN });
  described = await driveFounderPath({
    ...base, company: `${DESCRIBED.label} (described)`,
    description: DESCRIBED.description,
  });
}, 300_000);

describe("who is asked", () => {
  it("fires only on a description too thin to separate funds", async () => {
    const { wantsProjectQuestion, PROJECT_QUESTION_ARM } = await import("./adaptiveRound");
    const { USEFUL_DESCRIPTION_CHARS } = await import("./types");
    expect(PROJECT_QUESTION_ARM, "this file's whole point is the ON arm").toBe("on");
    expect(wantsProjectQuestion(undefined)).toBe(true);
    expect(wantsProjectQuestion("")).toBe(true);
    expect(wantsProjectQuestion(THIN)).toBe(true);
    // The boundary is the floor itself, and it is READ rather than retyped: a
    // second copy of the number is the "keep in sync" comment this repo treats
    // as the bug.
    expect(wantsProjectQuestion("x".repeat(USEFUL_DESCRIPTION_CHARS - 1))).toBe(true);
    expect(wantsProjectQuestion("x".repeat(USEFUL_DESCRIPTION_CHARS))).toBe(false);
    // Whitespace is not a description.
    expect(wantsProjectQuestion(` ${"x".repeat(USEFUL_DESCRIPTION_CHARS - 1)} `)).toBe(true);
  });

  it("does not nag a founder who already wrote one", () => {
    expect(described.projectQuestions.some((q) => q.id.startsWith(PROJECT_ANSWER_PREFIX)),
      "a founder who wrote a real description was asked to describe it again")
      .toBe(false);
  });

  it("asks the thin founder exactly once, in prose, grounded in nothing", () => {
    const ps = thin.projectQuestions.filter((q) => q.id.startsWith(PROJECT_ANSWER_PREFIX));
    expect(ps.length, "Pool P did not reach a founder who has no description").toBe(1);
    // Prose, so the founder answers in their own words rather than choosing
    // from a list we wrote — the answer IS the description.
    expect(ps[0].openText).toBe(true);
    expect(ps[0].options).toEqual([]);
    // It leads its half of the screen: the founder meets it before being asked
    // anything about a fund.
    expect(thin.projectQuestions[0].id).toBe(ps[0].id);
  });

  it("cannot be read as evidence about a fund", () => {
    const q = thin.projectQuestions.find((x) => x.id.startsWith(PROJECT_ANSWER_PREFIX)) as unknown as
      { instrumentId: string; quote: string; openKey?: string };
    // No instrument, no quote: it is not grounded in a requirement and must
    // never be cited as one. And no `openKey`, so `judgeOpenAnswers` never
    // sees it and it cannot reach an eligibility judgement.
    expect(q.instrumentId).toBe("");
    expect(q.quote).toBe("");
    expect(q.openKey).toBeUndefined();
  });
});

describe("where the answer goes", () => {
  it("joins the description the theme cosine is taken against", () => {
    const posted = memoBodyOf(thin);
    const answer = thin.projectQuestions.find((q) => q.id.startsWith(PROJECT_ANSWER_PREFIX))!;
    expect(answer, "nothing to trace").toBeTruthy();
    // The driver's stand-in founder answer, from __founderPath.ts.
    expect(posted.description).toContain("We build and sell this ourselves");
    // The original box is kept, not replaced: a founder who wrote three words
    // and then answered Pool P said both things.
    expect(posted.description.startsWith(THIN)).toBe(true);
    // And it survives the route boundary into the request the ranker reads.
    const arrived = seen.runIntelligence
      .map((r) => r as { company?: string; description?: string })
      .find((r) => r.company === A.label);
    expect(arrived?.description,
      "the Pool P answer was posted and did not arrive at the ranking stage")
      .toBe(posted.description);
  });

  it("is NOT filed as a project answer, which would reach the writer only", () => {
    const posted = memoBodyOf(thin);
    expect(posted.projectAnswers.filter((a) => a.questionId.startsWith(PROJECT_ANSWER_PREFIX)),
      "the describe-your-project answer was filed as a ProjectAnswer. That " +
      "reaches the memo writer and NOT semanticFundMatch, which is the only " +
      "thing this question is for.")
      .toEqual([]);
    // The rest of the screen is unaffected: gate and commercial answers still
    // ride on projectAnswers with their citations.
    expect(posted.projectAnswers.length).toBeGreaterThan(0);
  });

  it("leaves a described founder's own words untouched", () => {
    expect(memoBodyOf(described).description).toBe(DESCRIBED.description);
  });
});
