/**
 * THE TEST THAT WOULD HAVE CAUGHT THE SECTOR DEFECT.
 *
 * `sanitize.ts` validated `sector` against the retired seven-bucket vocabulary
 * after the taxonomy split. Every real request through `/api/intelligence` had
 * its sector silently discarded for a day, and no harness noticed, because
 * every harness in this repo calls the pipeline directly: `check_recall_floor`
 * imports `computeVerdict`, `check_memo_table` imports the pool builder,
 * `memo_bench` hand-builds an `IntelligenceRequest`. None of them crosses the
 * route boundary, so none of them can see anything that lives there.
 *
 * `sanitize.test.ts` closed that one instance from below: it walks `VOCABULARY`
 * and asserts the sanitiser keeps every offered value. What it cannot see is
 * everything the boundary does that is not the sanitiser — the per-route
 * request reconstruction, the handoff of ids from one route to the next, the
 * NDJSON transport, and the panel's own same-tick state hazard. This file is
 * that half.
 *
 *   THE PROPERTY
 *   An answer a founder gives on any screen, and anything one route hands the
 *   next, must survive every boundary it crosses and arrive, unchanged, at the
 *   stage that ranks.
 *
 * It is driven the way the panel drives it: four real routes, in the panel's
 * order, over real `Request`/`Response` objects, with React's tick semantics
 * modelled so the `advanceRound` class of defect fails here the way it fails
 * for a founder. See `__founderPath.ts` for the driver and why it is checked
 * against `panel.tsx` rather than trusted.
 *
 * ── FREE, AND HERMETIC ─────────────────────────────────────────────────────
 * No API key, no DATABASE_URL, no VOYAGE_KEY, no network. Both credentials are
 * DESTROYED rather than merely absent, so a developer with a live shell grades
 * the same system CI does. The corpus is the committed snapshot; the model is
 * `__offlineModel.ts`; the ranked set is read off the `partial` event the memo
 * route emits BEFORE the writer call, so the funds a founder acts on are
 * observed without a euro being spent.
 *
 * What that costs, stated rather than hidden: without VOYAGE_KEY the pool ranks
 * on the lexical index rather than on embeddings, and without DATABASE_URL the
 * corpus is the snapshot rather than Postgres. Neither changes what this file
 * asserts — every property here is about whether a value SURVIVES a boundary,
 * not about which fund comes first — but a number taken from this run would be
 * a number about the fallback. `scripts/_wsfc_divergence.ts` is where the
 * measurements live, and it requires both credentials.
 *
 * ── DEFECTS ARE RECORDED, NOT REPAIRED ─────────────────────────────────────
 * A property that fails today is declared in `OPEN_DEFECTS` with what is broken
 * and a review date, the same shape as `data/guard_registry.json`'s `manual`
 * block and `check_dependencies.ts`'s exception register. An entry is NOT a
 * suppression that can rot: the test fails if the property starts holding (fix
 * it, delete the entry) and fails once the review date passes.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

// The offline model, in place of the SDK, for every module that constructs a
// client at import time.
vi.mock("@anthropic-ai/sdk", async () => {
  const { OfflineAnthropic } = await import("./__offlineModel");
  return { default: OfflineAnthropic };
});

// The request the ranking stage was actually handed, captured at the seam
// where the route calls it. Wrapping rather than replacing: the real pipeline
// still runs, and the ranked set the founder would read is still produced.
const seen: {
  runIntelligence: unknown[];
  computeVerdict: unknown[][];
  planAdaptiveScreen: unknown[][];
} = { runIntelligence: [], computeVerdict: [], planAdaptiveScreen: [] };

vi.mock("@/lib/intelligence/pipeline", async (orig) => {
  const m = await orig() as Record<string, (...a: unknown[]) => unknown>;
  return {
    ...m,
    runIntelligence: (...a: unknown[]) => { seen.runIntelligence.push(a[0]); return m.runIntelligence(...a); },
    computeVerdict: (...a: unknown[]) => { seen.computeVerdict.push(a); return m.computeVerdict(...a); },
  };
});

vi.mock("@/lib/intelligence/adaptiveRound", async (orig) => {
  const m = await orig() as Record<string, (...a: unknown[]) => unknown>;
  return {
    ...m,
    planAdaptiveScreen: (...a: unknown[]) => { seen.planAdaptiveScreen.push(a); return m.planAdaptiveScreen(...a); },
  };
});

// ── The register of properties that do not hold yet ────────────────────────

interface OpenDefect { detail: string; review: string }

/**
 * Each entry is a property this file asserts, a statement of how the shipped
 * product currently breaks it, and the date by which somebody must decide
 * again. Found by this harness; NOT fixed here, because every one of them
 * changes what a founder is shown and that is a measured surface.
 */
const OPEN_DEFECTS: Record<string, OpenDefect> = {
  "the shortlist survives the handoff to the intake route": {
    detail:
      "`sanitizeInstrumentIds` accepts /^[a-z0-9_]{1,60}$/, and the corpus's own " +
      "SATR ids run past 60 characters " +
      "(satr_de_rnd__sa_109254__bundesministerium_fur_wirtschaft_und_klimaschutz " +
      "is 72). The verdict route hands the panel every candidate id; the panel " +
      "posts them back; the intake route silently deletes ~29% of them, INCLUDING " +
      "rows the founder can see on screen one. Measured over the twelve " +
      "archetypes: a mean of 3.7 of the founder's own six rows survive, 0 of 6 " +
      "for GovTech and 1 of 6 for Life sciences and AgriTech. The adaptive " +
      "round's gates, stakes and verbatim quotes are therefore fetched for a " +
      "different shortlist from the one the founder is looking at — while the " +
      "planner prompt's `candidateBlock` names the RIGHT funds, because that " +
      "line reads `body.candidateInstrumentIds` unsanitised. No direct-call " +
      "harness can see this: they pass computeVerdict's ids straight into " +
      "gateReach.",
    review: "2026-09-30",
  },
  "the profile signal the intake route inferred reaches the ranker": {
    detail:
      "panel.tsx `fetchRound` calls `setProfileSignal(data.profileSignal)` and " +
      "then, when the round comes back empty, calls `runMemo` IN THE SAME TICK. " +
      "`basePayload()` re-reads the render-time `profileSignal`, which is still " +
      "null. This is the identical hazard `projectOverride` and `eligOverride` " +
      "were threaded to fix, at the fourth call site the comment above " +
      "`eligBeforeRound` predicted. Cost: `applyProfileSignal` is a no-op and " +
      "`companyType` stays undefined for every founder whose first round is " +
      "empty, so the memo's channel ordering loses the one signal the intake " +
      "call was made to produce.",
    review: "2026-09-30",
  },
  "a commercial answer survives the route": {
    detail:
      "Pool C is the commercial half of the follow-up screen — who pays, how " +
      "they charge, route to market, what an award buys — and the planner's own " +
      "prompt says \"positioning has no other source\". `planAdaptiveScreen` " +
      "builds every one of those questions with `instrumentId: \"\"`, because " +
      "they are grounded in no fund; `sanitizeProjectAnswers` then refuses any " +
      "entry whose `instrumentId` is empty. So EVERY commercial answer a founder " +
      "types is deleted at the door of /api/intelligence, on every request, and " +
      "the writer is asked to position a company from answers it never receives. " +
      "Not a sampling result: it follows from the two lines and holds for every " +
      "founder. `memo_bench` cannot see it — it hand-builds `projectAnswers` " +
      "with real instrument ids.",
    review: "2026-09-30",
  },
  "every field the memo route reads is a field the panel can send": {
    detail:
      "/api/intelligence reads `body.sector`, `body.companyType` and " +
      "`body.targetMarkets`, and `basePayload()` sends none of the three. On " +
      "every real request all three are undefined, so `req.sector` never " +
      "renders its prompt line and `founderCountryList(country, targetMarkets, " +
      "entityCountries)` never receives a target market. Each omission is " +
      "individually defensible — sector rides inside `eligibility`, companyType " +
      "is inferred, targetMarkets was deliberately dropped from screen one — " +
      "but nothing says so and nothing stops a harness supplying them. " +
      "`check_memo_table` passes `founderCountryList(c.country, [c.country], " +
      "[c.country])`, so every bench number in this repo is measured on a " +
      "country list a founder's own request cannot produce. That is " +
      "`check_harness_intake`'s property one level up: not whether the harness " +
      "answered for the founder, but whether the question is answerable by a " +
      "founder at all.",
    review: "2026-09-30",
  },
  "one field is reconstructed the same way by every route": {
    detail:
      "`capitalSought` is whitelisted against CAPITAL_OPTIONS by " +
      "verdict/route.ts and intake/route.ts (`sanitizeCapitalSought`) and by " +
      "route.ts with a hand-rolled `filter((v) => typeof v === 'string')`. Three " +
      "routes, one field, two sanitisers — and the memo, the one a founder acts " +
      "on, is the permissive one. `sanitizeCapitalSought` exists and route.ts " +
      "does not import it.",
    review: "2026-09-30",
  },
};

function property(id: string, assertion: () => void): void {
  const known = OPEN_DEFECTS[id];
  let failure: unknown = null;
  try { assertion(); } catch (e) { failure = e; }
  if (!known) {
    if (failure) throw failure;
    return;
  }
  const due = new Date(`${known.review}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) {
    throw new Error(`OPEN_DEFECTS["${id}"] has no usable review date.`);
  }
  if (due.getTime() < Date.now()) {
    throw new Error(
      `OPEN_DEFECTS["${id}"] was declared for review by ${known.review}, which has ` +
      `passed. Fix it, or move the date and say what changed.\n  ${known.detail}`);
  }
  if (!failure) {
    throw new Error(
      `"${id}" now HOLDS. It is declared in OPEN_DEFECTS as a live defect, so ` +
      `either it was fixed — delete the entry — or this assertion stopped ` +
      `testing anything.`);
  }
  // Once per defect, not once per founder: a register printed twelve times is
  // a register nobody reads to the end.
  if (!reported.has(id)) {
    reported.add(id);
    process.stderr.write(
      `\n[founder-path] KNOWN DEFECT, still live: ${id}\n  ` +
      `${known.detail}\n  review by ${known.review}\n`);
  }
}
const reported = new Set<string>();

// ── The founder ────────────────────────────────────────────────────────────

import { ARCHETYPES, archetypeAnswers } from "./__archetypes";
import type { EligibilityAnswers } from "./types";

type Run = Awaited<ReturnType<typeof import("./__founderPath")["driveFounderPath"]>>;

/** Two shapes, not twelve: this file grades the SEAM, and a seam defect does
 *  not hide in the twelfth founder. The twelve are where the measurements are
 *  (scripts/_wsfc_divergence.ts), and running them all here would put a
 *  minute of pool building into every `npm run check`. */
const PROBE = ARCHETYPES.filter((a) =>
  a.label === "Robotics" || a.label === "GovTech");

const runs = new Map<string, Run>();
/** The run in which the follow-up screen came back empty, so `fetchRound`
 *  calls `runMemo` in the same tick it writes the profile signal. */
let silentRun: Run;
let contract: { payloadKeys: string[]; routes: string[] };
/** What each route made of one identical body carrying an illegal capital
 *  type. Three reconstructions of one request. */
let crossRoute: { verdict: unknown; intake: unknown; memo: unknown };

beforeAll(async () => {
  // DESTROYED, not merely absent. Without this the verdict of the whole file
  // depends on the shell it was typed into.
  delete process.env.DATABASE_URL;
  delete process.env.VOYAGE_KEY;
  const { driveFounderPath, panelContract } = await import("./__founderPath");
  const { setPlanner } = await import("./__offlineModel");
  contract = panelContract();
  for (const a of PROBE) {
    runs.set(a.label, await driveFounderPath({
      company: a.label,
      country: a.country,
      description: a.description,
      capitalSought: ["grant", "loan"],
      eligibility: archetypeAnswers(a) as EligibilityAnswers,
    }));
  }

  // The same founder again, with the planner silent — the branch a real
  // founder takes on a planner timeout, an unparseable reply, or an intake
  // request that simply fails.
  const a0 = PROBE[0];
  setPlanner("silent");
  silentRun = await driveFounderPath({
    company: `${a0.label} (silent round)`,
    country: a0.country,
    description: a0.description,
    capitalSought: ["grant", "loan"],
    eligibility: archetypeAnswers(a0) as EligibilityAnswers,
  });
  setPlanner("answers");

  // ── One body, three routes ────────────────────────────────────────────
  // `unicorn_money` is not a CAPITAL_OPTIONS value. Whatever each route does
  // with it, all three must do the same thing: they are reconstructing one
  // founder's one request.
  const body = {
    company: a0.label, country: a0.country, description: a0.description,
    capitalSought: ["grant", "unicorn_money"],
    eligibility: archetypeAnswers(a0),
    profileSignal: null, projectAnswers: [],
  };
  const send = async (route: string, extra: Record<string, unknown> = {}) => {
    const mod = await import(
      route === "/api/intelligence" ? "@/app/api/intelligence/route"
        : route === "/api/intelligence/verdict" ? "@/app/api/intelligence/verdict/route"
          : "@/app/api/intelligence/intake/route");
    const res = await (mod.POST as (r: Request) => Promise<Response>)(
      new Request(`http://founder.test${route}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, ...extra }),
      }));
    // The memo route streams; drain it so the pipeline has actually run.
    if (res.body) { const r = res.body.getReader(); for (;;) { const { done } = await r.read(); if (done) break; } }
    return res;
  };
  const before = {
    v: seen.computeVerdict.length, i: seen.planAdaptiveScreen.length,
    m: seen.runIntelligence.length,
  };
  await send("/api/intelligence/verdict");
  await send("/api/intelligence/intake", { candidateInstrumentIds: [] });
  await send("/api/intelligence");
  crossRoute = {
    verdict: (seen.computeVerdict[before.v]?.[3] as { capitalSought?: unknown })?.capitalSought,
    intake: (seen.planAdaptiveScreen[before.i]?.[0] as { capitalSought?: unknown })?.capitalSought,
    memo: (seen.runIntelligence[before.m] as { capitalSought?: unknown })?.capitalSought,
  };
}, 300_000);

// ── 0. The driver is the panel, or this file grades a fiction ──────────────

describe("the harness drives the panel's own request", () => {
  it("sends exactly the keys basePayload() builds", () => {
    const run = runs.get("Robotics")!;
    const verdictBody = run.wire.find((w) => w.route === "/api/intelligence/verdict")!.body;
    expect(Object.keys(verdictBody).sort()).toEqual([...contract.payloadKeys].sort());
  });

  it("calls every route panel.tsx calls", () => {
    const driven = new Set(runs.get("Robotics")!.wire.map((w) => w.route));
    for (const route of contract.routes) expect(driven).toContain(route);
  });

  it("reaches the ranking through the streamed transport, not a JSON body", () => {
    const run = runs.get("Robotics")!;
    // A `partial` event only exists if the NDJSON framing survived the trip.
    expect(run.events.some((e) => e.type === "partial")).toBe(true);
    expect(run.ranked.length).toBeGreaterThan(0);
  });
});

// ── 1. What one route hands the next ───────────────────────────────────────

describe("a handoff between two routes loses nothing", () => {
  it("every candidate id the verdict route publishes survives the intake route", async () => {
    const { sanitizeInstrumentIds } = await import("./sanitize");
    for (const [label, run] of runs) {
      property("the shortlist survives the handoff to the intake route", () => {
        const kept = new Set(sanitizeInstrumentIds(run.candidateInstrumentIds) ?? []);
        const lost = run.candidateInstrumentIds.filter((id) => !kept.has(id));
        expect(lost, `${label}: ${lost.length} of ${run.candidateInstrumentIds.length} ` +
          `candidate ids are deleted at the intake route`).toEqual([]);
      });
    }
  });

  it("the funds on the founder's own screen survive it", async () => {
    const { sanitizeInstrumentIds } = await import("./sanitize");
    for (const [label, run] of runs) {
      property("the shortlist survives the handoff to the intake route", () => {
        const six = run.screenSix
          .map((r) => (r as unknown as { instrumentId?: string }).instrumentId)
          .filter((x): x is string => Boolean(x));
        const kept = new Set(sanitizeInstrumentIds(six) ?? []);
        expect(six.filter((id) => !kept.has(id)),
          `${label}: rows the founder is looking at are not in the shortlist the ` +
          `follow-up questions are written from`).toEqual([]);
      });
    }
  });
});

// ── 2. An answer reaches the stage that ranks ──────────────────────────────

describe("an answer a founder gives reaches the thing that ranks", () => {
  it("every screen-one answer arrives at the ranker unchanged", () => {
    for (const [label, run] of runs) {
      const posted = run.wire.find((w) => w.route === "/api/intelligence/verdict")!
        .body.eligibility as Record<string, unknown>;
      const arrived = (seenRequestFor(run)?.eligibility ?? {}) as Record<string, unknown>;
      for (const [field, value] of Object.entries(posted)) {
        // A field the founder answered AGAIN on the follow-up screen is
        // supposed to change: `advanceRound` merges the later answer over the
        // earlier one. Only the untouched ones are asserted here; the
        // overwritten ones are the next test's subject.
        if (field in run.roundAnswers) continue;
        expect(arrived[field],
          `${label}: "${field}" was answered on screen one and the ranker was ` +
          `handed ${JSON.stringify(arrived[field])} instead of ` +
          `${JSON.stringify(value)}. This is the sector defect's shape.`)
          .toEqual(value);
      }
    }
  });

  it("every screen-two answer arrives at the ranker unchanged", () => {
    for (const [label, run] of runs) {
      const arrived = (seenRequestFor(run)?.eligibility ?? {}) as Record<string, unknown>;
      // `advanceRound` merges in the same tick it calls `runMemo`, so an
      // unthreaded override loses the whole round. That is not hypothetical:
      // it shipped on every brief until wsDL.
      for (const [field, value] of Object.entries(run.roundAnswers)) {
        expect(arrived[field],
          `${label}: "${field}" was answered on the follow-up screen and the ` +
          `ranker never saw it — the advanceRound override is not threaded`)
          .toEqual(value);
      }
      if (Object.keys(run.roundAnswers).length === 0) {
        process.stderr.write(
          `\n[founder-path] ${label}: the follow-up screen asked no fixed-answer ` +
          `question, so the eligibility half of this property was vacuous for it.\n`);
      }
    }
    // A property nobody's run exercises is a property nobody is testing. The
    // screen-two answer is the whole reason the funnel has a second screen, and
    // a probe set that never receives one would go green on the defect wsDL
    // found — the one where the entire adaptive round reached the intake route
    // and never reached the ranker.
    expect([...runs.values()].some((r) => Object.keys(r.roundAnswers).length > 0),
      "no probe founder was asked a single fixed-answer follow-up question, so " +
      "this property was never exercised. Change the probe set, not this line.")
      .toBe(true);
  });

  it("every project answer given on screen two arrives at the ranker", () => {
    const commercial: { posted: string[]; dropped: string[] } = { posted: [], dropped: [] };
    // Prose answers never become `EligibilityAnswers` by design — they carry
    // their fund and gate citation instead — so they cross the boundary through
    // `sanitizeProjectAnswers`, which drops any entry missing one of four
    // fields and any instrument id that fails its shape test. A silent drop
    // there is the same defect in a different field.
    for (const [label, run] of runs) {
      const posted = run.wire.find((w) => w.route === "/api/intelligence")!
        .body.projectAnswers as { questionId: string; answer: string; instrumentId: string }[];
      const arrived = (seenRequestFor(run)?.projectAnswers ?? []) as
        { questionId: string; answer: string }[];
      const key = (a: { questionId: string; answer: string }) => `${a.questionId}=${a.answer}`;
      const got = new Set(arrived.map(key));

      // The gate-grounded half. These name a real fund, and they must arrive.
      expect(posted.filter((a) => a.instrumentId).filter((a) => !got.has(key(a))),
        `${label}: a prose answer citing a real fund was dropped between the ` +
        `panel and the ranker`).toEqual([]);

      // The commercial half. `planAdaptiveScreen` builds these with
      // `instrumentId: ""` because they are grounded in no fund at all.
      for (const a of posted.filter((x) => !x.instrumentId)) {
        commercial.posted.push(`${label}: ${a.questionId}`);
        if (!got.has(key(a))) commercial.dropped.push(`${label}: ${a.questionId}`);
      }
    }
    // ONE verdict over every probe. Judged per founder, a founder who was
    // asked no commercial question at all would report the property HOLDING,
    // which is the vacuous pass this file exists to refuse.
    expect(commercial.posted.length,
      "no probe founder answered a commercial question, so the Pool C property " +
      "was never exercised").toBeGreaterThan(0);
    property("a commercial answer survives the route", () => {
      expect(commercial.dropped).toEqual([]);
    });
    expect([...runs.values()].some((r) => r.projectQuestions.length > 0),
      "no probe founder was asked a project question, so this property was " +
      "never exercised").toBe(true);
  });

  it("the profile signal the intake route inferred arrives at the ranker", () => {
    // The happy path threads it, because the founder reads a screen and React
    // flushes before `advanceRound` runs. It is asserted here so a regression
    // on THAT path is a failure rather than a second register entry.
    for (const [label, run] of runs) {
      if (!run.profileSignalFromIntake) continue;
      expect(seenRequestFor(run)?.profileSignal,
        `${label}: the intake route inferred a profile signal and the memo ` +
        `request did not carry it`).toEqual(run.profileSignalFromIntake);
    }
    // The empty-round path does not, and cannot: `runMemo` runs in the tick
    // that wrote it.
    expect(silentRun.profileSignalFromIntake,
      "the silent-planner probe never produced a signal, so it tested nothing")
      .toBeTruthy();
    property("the profile signal the intake route inferred reaches the ranker", () => {
      expect(seenRequestFor(silentRun)?.profileSignal)
        .toEqual(silentRun.profileSignalFromIntake);
    });
  });

  it("the free-text description arrives at the ranker, at full length", () => {
    for (const [label, run] of runs) {
      const posted = run.wire.find((w) => w.route === "/api/intelligence")!
        .body.description as string;
      expect(seenRequestFor(run)?.description, `${label}: description`).toBe(posted);
    }
  });
});

// ── 3. One field, three routes, one meaning ────────────────────────────────

describe("the three routes agree about the request", () => {
  it("reconstructs a shared field the same way on every route", () => {
    property("one field is reconstructed the same way by every route", () => {
      expect(crossRoute.memo,
        "the memo route — the one a founder acts on — kept a capital type the " +
        "other two rejected. Three routes, one field, two sanitisers.")
        .toEqual(crossRoute.verdict);
      expect(crossRoute.intake).toEqual(crossRoute.verdict);
    });
  });
});

describe("a field a route reads is a field a founder can supply", () => {
  it("the memo route reads nothing the panel cannot send", async () => {
    const { routeReads } = await import("./__founderPath");
    const sent = new Set(Object.keys(
      runs.get(PROBE[0].label)!.wire.find((w) => w.route === "/api/intelligence")!.body));
    const read = routeReads("app/api/intelligence/route.ts");
    property("every field the memo route reads is a field the panel can send", () => {
      expect(read.filter((f) => !sent.has(f)),
        "the memo route reads these fields and no founder's request carries " +
        "them, so only a harness can").toEqual([]);
    });
  });
});

// ── 4. The founder gets a table at all ─────────────────────────────────────

describe("the founder reaches funds", () => {
  it("publishes a ranked table for every probe founder", () => {
    for (const [label, run] of runs) {
      expect(run.ranked.length, `${label}: the founder's path ended with no funds`)
        .toBeGreaterThan(0);
    }
  });

  it("the ranked order is the order the route emitted, not a re-sort", () => {
    for (const [label, run] of runs) {
      const partial = run.events.find((e) => e.type === "partial");
      expect(partial, `${label}: no ranked set was emitted`).toBeTruthy();
      expect(run.ranked.map((r) => r.channel))
        .toEqual(((partial as { data: { institutions: { channel: string }[] } })
          .data.institutions).map((r) => r.channel));
    }
  });
});

/**
 * The `IntelligenceRequest` the ranking stage was handed for this run.
 *
 * Matched on the company name the request carried, not on call order: several
 * probes go through the same seam and an index would silently pair a founder
 * with somebody else's request — which is a version of the very defect this
 * file is about.
 */
function seenRequestFor(run: Run): Record<string, unknown> | undefined {
  const company = run.wire.find((w) => w.route === "/api/intelligence")?.body.company;
  return seen.runIntelligence
    .find((r) => (r as { company?: string })?.company === company) as
      Record<string, unknown> | undefined;
}

