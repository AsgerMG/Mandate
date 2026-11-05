/**
 * THE FOUNDER'S OWN PATH, DRIVEN THE WAY THE PANEL DRIVES IT.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Every harness in this repo calls the pipeline directly. `check_recall_floor`
 * imports `computeVerdict`; `check_memo_table` imports `buildInstrumentTable-
 * Hydrated`; `memo_bench` builds an `IntelligenceRequest` by hand. Not one of
 * them crosses the HTTP boundary, so not one of them can see anything that
 * happens between the request leaving the panel and the pipeline being called:
 * the sanitisers, the per-route request reconstruction, the id handoff from one
 * route to the next, and the panel's own same-tick state hazard.
 *
 * That gap has already cost this product twice, and both times the bench was
 * green throughout:
 *
 *   sector   `sanitize.ts` validated it against the retired seven-bucket list
 *            after the taxonomy split, so every real request had its sector
 *            silently discarded.
 *   region   present in `EligibilityAnswers`, in `FIELD_ENUM_HINTS` and in the
 *            adaptive round's evidence path, and absent from the whitelist. The
 *            panel merged the founder's answer and all three routes dropped it.
 *
 * Both are instances of one property, and the property is what this module
 * exists to make testable:
 *
 *     AN ANSWER A FOUNDER GIVES ON ANY SCREEN, AND ANYTHING ONE ROUTE HANDS
 *     THE NEXT, MUST SURVIVE EVERY BOUNDARY IT CROSSES AND ARRIVE AT THE
 *     STAGE THAT RANKS.
 *
 * ── What it drives ─────────────────────────────────────────────────────────
 * The four calls `panel.tsx` makes, in the panel's order, against the REAL
 * route handlers over REAL `Request`/`Response` objects — including the memo
 * leg, which is newline-delimited JSON over a `ReadableStream` rather than one
 * JSON body:
 *
 *     /api/intelligence/region    the region pre-fill, as the founder types
 *     /api/intelligence/verdict   screen one's answers -> the subset
 *     /api/intelligence/intake    the subset -> the questions actually shown
 *     /api/intelligence           the answers -> the ranked funds
 *
 * ── Where it stops, and why that is free ───────────────────────────────────
 * The memo leg emits a `partial` event carrying the code-built institution rows
 * — the RANKED SET, in its published order, cut to the published cap — BEFORE
 * the writer model call (pipeline.ts, `emit({ type: "partial" ... })`). So the
 * five-to-seven funds a founder acts on are observable at the route boundary
 * without the writer ever being called. `stopAt: "ranked"` reads that event and
 * returns. The writer then fails, which is expected and recorded rather than
 * treated as an error: the deliverable is the funds, not the prose.
 *
 * ── React's tick semantics are load-bearing, so they are modelled ───────────
 * `panel.tsx` has been burned three times by the same hazard: `setState` during
 * a chain of awaits is NOT what a closure later in that same chain reads.
 * `projectOverride` and `eligOverride` are that hazard threaded by hand.
 * `PanelState` below reproduces it exactly — `set()` writes to a pending map
 * that `read()` cannot see until `render()` flushes — so a driver that forgot
 * to thread an override fails here the way it fails for a founder, rather than
 * passing because the harness happened to use a plain object.
 *
 * ── The driver is a transcription, and the transcription is checked ─────────
 * A hand-written copy of `basePayload()` is a "keep in sync" comment, which in
 * this repo is the bug. So `panelContract()` reads `panel.tsx` itself and
 * recovers the keys of the payload literal and the set of routes the panel
 * fetches; `founderPath.test.ts` fails when the driver and the panel disagree.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  matchBrace, matchParen, stripCommentsAndStrings, topLevelKeys, topLevelSpreads,
} from "./__sourceScan";
import { FIELD_ENUM_HINTS, MAX_DESCRIPTION_CHARS, PROJECT_ANSWER_PREFIX } from "./types";
import type {
  EligibilityAnswers, ProfileSignal, ProgressEvent, ProjectAnswer,
} from "./types";

/** panel.tsx's own constant. Read from source rather than retyped — see
 *  `panelContract`. */
export const NONE_OF_THESE = "None of these";

// ── The panel's state store, with React's visibility rule ──────────────────

/**
 * A state store that behaves the way React's does across an `await`: a value
 * written by `set` is invisible to `read` until `render()` runs.
 *
 * This is the whole reason the driver can catch the `advanceRound` class of
 * defect. A plain mutable object would make every override redundant and the
 * harness would pass on code that loses the founder's answers.
 */
export class PanelState<S extends Record<string, unknown>> {
  private committed: S;
  private pending: Partial<S> = {};
  constructor(initial: S) { this.committed = { ...initial }; }
  /** What a closure created in this tick sees. */
  read<K extends keyof S>(k: K): S[K] { return this.committed[k]; }
  /** `setX(...)`. Not visible until the next render. */
  set<K extends keyof S>(k: K, v: S[K]): void { this.pending[k] = v; }
  /** The founder looks at the screen; React has flushed. */
  render(): void { this.committed = { ...this.committed, ...this.pending }; this.pending = {}; }
}

// ── What the driver returns ────────────────────────────────────────────────

export interface RankedRow {
  institution: string;
  channel: string;
  country: string;
  verdict: string;
}

export interface RoundQuestion {
  field: string;
  question: string;
  options?: { value: string; label: string }[];
}

export interface FounderRun {
  /** Every request body the panel put on the wire, in order. */
  wire: { route: string; body: Record<string, unknown> }[];
  /** Screen one's table — the six rows the founder reads instantly. */
  screenSix: RankedRow[];
  /** Every id the verdict route offered the panel as grounding for round two. */
  candidateInstrumentIds: string[];
  /** The generic (eligibility) questions the founder was actually shown. */
  questions: RoundQuestion[];
  /** The project questions shown alongside them. */
  projectQuestions: { id: string; question: string; options: string[]; openText?: boolean }[];
  /** What the founder answered on screen two, field by field. */
  roundAnswers: Record<string, string | string[]>;
  /** The ranked funds the memo leg published, in published order. Empty when
   *  the run never reached the ranking. */
  ranked: RankedRow[];
  /** Every progress event the memo leg emitted. */
  events: ProgressEvent[];
  /** The profile signal the intake route inferred, if it offered one. */
  profileSignalFromIntake: ProfileSignal | null;
}

// ── The routes, imported once ──────────────────────────────────────────────

type Handler = (r: Request) => Promise<Response>;

/**
 * HOW a route call reaches the routes.
 *
 * The four calls, their order, the payload each carries and the id handoff
 * between them are the SEQUENCE, and there is one copy of it (`driveFounderPath`
 * below). Whether that sequence runs against the handler modules in this process
 * or against a deployment over HTTPS is the TRANSPORT, and it is the only thing
 * that differs between the hermetic test and `scripts/prodcheck.ts`.
 *
 * Split here rather than by copying the sequence, because a second copy of the
 * sequence is exactly the defect this module exists to make impossible: the two
 * copies drift, and the one nobody runs is the one that keeps passing.
 */
export type FounderTransport =
  (route: string, body: Record<string, unknown>) => Promise<Response>;

/** The default: the real route handlers, in this process, over real
 *  `Request`/`Response` objects. No network, no credentials. */
export async function inProcessTransport(): Promise<FounderTransport> {
  const H = await handlers();
  return (route, body) => H[route](new Request(`http://founder.test${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    // JSON.stringify is not decoration: it is the boundary. `undefined` fields
    // vanish here, and anything that is not JSON never arrives at all.
    body: JSON.stringify(body),
  }));
}

async function handlers(): Promise<Record<string, Handler>> {
  const [region, verdict, intake, memo] = await Promise.all([
    import("@/app/api/intelligence/region/route"),
    import("@/app/api/intelligence/verdict/route"),
    import("@/app/api/intelligence/intake/route"),
    import("@/app/api/intelligence/route"),
  ]);
  return {
    "/api/intelligence/region": region.POST as unknown as Handler,
    "/api/intelligence/verdict": verdict.POST as unknown as Handler,
    "/api/intelligence/intake": intake.POST as unknown as Handler,
    "/api/intelligence": memo.POST as unknown as Handler,
  };
}

// ── The founder ────────────────────────────────────────────────────────────

export interface Founder {
  company: string;
  country: string;
  description: string;
  capitalSought: string[];
  /** Screen one's answers, exactly as the form would have produced them. */
  eligibility: EligibilityAnswers;
}

export interface DriveOptions {
  /** Answer screen two, or decline every question. Declining is how a founder
   *  who skips the round is modelled, and it is the arm that shows what the
   *  round is worth. */
  answerRoundTwo?: boolean;
  /** Stop after the ranked set is observable (`partial`), rather than waiting
   *  for the writer to fail. Default true, and it is what keeps this free. */
  stopAt?: "ranked" | "end";
  /** Where the four calls go. Defaults to the route handlers in this process;
   *  `scripts/prodcheck.ts` passes one that fetches a deployment. The SEQUENCE
   *  is the same either way, and that is the whole point. */
  transport?: FounderTransport;
}

/**
 * Drive one founder all the way from the first screen to the ranked funds,
 * through the real routes, in the panel's own order.
 *
 * `handleContinue` -> `fetchVerdict` -> `fetchRound` -> (the founder answers)
 * -> `advanceRound` -> `runMemo`, with `MAX_ROUNDS = 1`, which is why
 * `advanceRound` goes straight to the memo rather than fetching a second round.
 */
export async function driveFounderPath(
  f: Founder, opts: DriveOptions = {},
): Promise<FounderRun> {
  const answerRoundTwo = opts.answerRoundTwo ?? true;
  const stopAt = opts.stopAt ?? "ranked";
  const send = opts.transport ?? await inProcessTransport();
  const wire: { route: string; body: Record<string, unknown> }[] = [];

  const post = async (route: string, body: Record<string, unknown>) => {
    wire.push({ route, body: JSON.parse(JSON.stringify(body)) as Record<string, unknown> });
    return send(route, body);
  };

  // panel.tsx's state, with panel.tsx's initial values.
  const S = new PanelState<{
    company: string; country: string; description: string;
    capitalSought: string[]; elig: EligibilityAnswers;
    profileSignal: ProfileSignal | null; projectAnswers: ProjectAnswer[];
    roundCount: number;
  }>({
    company: "", country: "", description: "", capitalSought: [],
    elig: { borrowerModel: "operating" }, profileSignal: null,
    projectAnswers: [], roundCount: 0,
  });
  // `eligBeforeRound` is a ref in the panel, deliberately, so it is a ref here.
  const eligBeforeRound: { current: EligibilityAnswers | null } = { current: null };

  // ── The founder fills in screen one. Every keystroke is a render. ────────
  S.set("company", f.company);
  S.set("country", f.country);
  S.set("description", f.description);
  S.set("capitalSought", f.capitalSought);
  S.set("elig", { ...S.read("elig"), ...f.eligibility });
  S.render();

  // The region pre-fill fires as they type, from its own effect, and writes
  // into `elig` — so it is part of the payload every later call carries.
  const regionRes = await post("/api/intelligence/region",
    { company: S.read("company"), country: S.read("country") });
  const regionData = await regionRes.json().catch(() => ({})) as { region?: string };
  if (regionData?.region) {
    S.set("elig", { ...S.read("elig"), region: regionData.region });
    S.render();
  }

  const basePayload = (eligOverride?: EligibilityAnswers, descriptionOverride?: string) => ({
    company: S.read("company"),
    country: S.read("country"),
    description: descriptionOverride ?? S.read("description"),
    capitalSought: S.read("capitalSought"),
    eligibility: eligOverride ?? S.read("elig"),
    profileSignal: S.read("profileSignal"),
    projectAnswers: S.read("projectAnswers"),
  });

  const fetchVerdict = async (eligOverride?: EligibilityAnswers) => {
    const res = await post("/api/intelligence/verdict", basePayload(eligOverride));
    return await res.json().catch(() => ({})) as {
      instrumentTable?: RankedRow[]; candidateInstrumentIds?: string[];
    };
  };

  // ── handleContinue ───────────────────────────────────────────────────────
  eligBeforeRound.current = { ...S.read("elig") };
  const v = await fetchVerdict();
  const screenSix = v.instrumentTable ?? [];
  const candidateInstrumentIds = v.candidateInstrumentIds ?? [];

  // ── fetchRound. Note `basePayload()` with NO override, then the eligibility
  // key overwritten with the caller's object — panel.tsx, verbatim. ─────────
  const eligForRequest = S.read("elig");
  const roundRes = await post("/api/intelligence/intake", {
    ...basePayload(),
    eligibility: eligForRequest,
    candidateInstrumentIds,
    wantProfileSignal: true,
  });
  const roundData = await roundRes.json().catch(() => ({})) as {
    round?: { questions?: RoundQuestion[]; projectQuestions?: {
      id: string; question: string; options: string[]; openText?: boolean;
      instrumentId: string; instrumentName: string; gateKey: string;
      quote: string; locator?: string; openKey?: string;
    }[] } | null;
    profileSignal?: ProfileSignal | null;
  };
  const profileSignalFromIntake = roundData.profileSignal ?? null;
  if (roundData.profileSignal) S.set("profileSignal", roundData.profileSignal);

  const questions = roundData.round?.questions ?? [];
  const projectQuestions = roundData.round?.projectQuestions ?? [];
  const roundAnswers: Record<string, string | string[]> = {};

  const events: ProgressEvent[] = [];
  let ranked: RankedRow[] = [];

  const runMemo = async (
    projectOverride?: ProjectAnswer[], eligOverride?: EligibilityAnswers,
    descriptionOverride?: string,
  ) => {
    const res = await post("/api/intelligence", {
      ...basePayload(eligOverride, descriptionOverride),
      projectAnswers: projectOverride ?? S.read("projectAnswers"),
      eligibilityBeforeRound: eligBeforeRound.current ?? undefined,
    });
    if (!res.ok || !res.body) return;
    // The panel's own NDJSON reader, because the transport is part of what is
    // being tested: a `report` that cannot be framed is a brief nobody reads.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as ProgressEvent;
        events.push(ev);
        if (ev.type === "partial") {
          ranked = (ev.data.institutions ?? []) as unknown as RankedRow[];
          if (stopAt === "ranked") { await reader.cancel().catch(() => {}); return; }
        }
      }
    }
  };

  if (!questions.length && !projectQuestions.length) {
    // panel.tsx: an empty round runs the memo IN THE SAME TICK. `eligForRequest`
    // is threaded; nothing else is.
    await runMemo(undefined, eligForRequest);
  } else {
    // The founder reads the screen. React has flushed by now.
    S.render();
    if (answerRoundTwo) {
      for (const q of questions) {
        const opts = q.options?.length
          ? q.options
          : FIELD_ENUM_HINTS[q.field]?.optionsFor?.(S.read("elig"))
            ?? FIELD_ENUM_HINTS[q.field]?.options ?? [];
        if (!opts.length) continue;
        // A real founder picks one; a multi-select founder picks one box.
        roundAnswers[q.field] = FIELD_ENUM_HINTS[q.field]?.multi
          ? [opts[0].value] : opts[0].value;
      }
    }
    // ── advanceRound ──────────────────────────────────────────────────────
    const merged: EligibilityAnswers = { ...S.read("elig") };
    for (const q of questions) {
      const ans = roundAnswers[q.field];
      if (ans === undefined || ans === "" || (Array.isArray(ans) && ans.length === 0)) continue;
      (merged as Record<string, unknown>)[q.field] = ans;
    }
    const picked: ProjectAnswer[] = [];
    // panel.tsx, verbatim: the Pool P answer is routed into `description` and
    // not into `projectAnswers`, which is the property `founderPath.test.ts`
    // asserts on the wire rather than on this transcription.
    const describedProject: string[] = [];
    if (answerRoundTwo) {
      for (const q of projectQuestions) {
        const answer = q.openText
          ? "We build and sell this ourselves; the award would pay for the pilot line."
          : (q.options?.[0] || "");
        if (!answer) continue;
        if (q.id.startsWith(PROJECT_ANSWER_PREFIX)) { describedProject.push(answer); continue; }
        const qq = q as unknown as ProjectAnswer & { id: string };
        picked.push({
          questionId: qq.id, question: q.question, answer,
          instrumentId: qq.instrumentId, instrumentName: qq.instrumentName,
          gateKey: qq.gateKey, quote: qq.quote, locator: qq.locator,
          openKey: qq.openKey,
        });
      }
    }
    const allProjectAnswers = [...S.read("projectAnswers"), ...picked];
    const nextDescription = [S.read("description").trim(), ...describedProject]
      .filter(Boolean).join("\n\n").slice(0, MAX_DESCRIPTION_CHARS);
    S.set("projectAnswers", allProjectAnswers);
    S.set("elig", merged);
    S.set("description", nextDescription);
    S.set("roundCount", S.read("roundCount") + 1);
    // MAX_ROUNDS is 1, so this is always the branch taken — the second verdict
    // fetch inside advanceRound is unreachable on the shipped path.
    await runMemo(allProjectAnswers, merged, nextDescription);
  }

  return {
    wire, screenSix, candidateInstrumentIds, questions, projectQuestions,
    roundAnswers, ranked, events, profileSignalFromIntake,
  };
}

// ── The transcription, checked against the original ────────────────────────

/**
 * Every field of the request body a route READS, recovered from the route.
 *
 * The other half of `panelContract`. A route that reads a field no panel sends
 * is a field only a harness can supply — and a harness that supplies one is
 * ranking on an input no founder has. That is `check_harness_intake`'s property
 * one level up: not "did the harness answer for the founder", but "is this
 * question answerable by a founder at all".
 *
 * ── IT READ COMMENTS AS CODE (wsIK) ────────────────────────────────────────
 * This matched the regex over the RAW file. When the three unsendable reads
 * were deleted from `app/api/intelligence/route.ts` and a comment left in their
 * place naming what had gone, the guard went on reporting all three as live —
 * it was grading the comment. A guard that cannot be cleared by fixing the code
 * is a guard that gets muted, so the source is stripped first, by the one
 * stripper `check_harness_intake` already had.
 */

/**
 * What `panel.tsx` actually sends, recovered from `panel.tsx`.
 *
 * The driver above is a transcription of a file it cannot import (the panel is
 * a `"use client"` React component). A transcription that nothing compares to
 * its original is a copy, and a copy in this repo is a defect with a delay on
 * it. So the contract is READ, not retyped: a key added to `basePayload` or a
 * route the panel starts calling shows up here on the next run.
 */
export function routeReads(routeFile: string): string[] {
  const src = stripCommentsAndStrings(
    readFileSync(path.join(process.cwd(), routeFile), "utf8"));
  return [...new Set(
    [...src.matchAll(/\bbody\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort();
}

/**
 * What the panel can put in the body of a request to ONE route.
 *
 * `panelContract().payloadKeys` is `basePayload()` alone, and three of the four
 * calls add keys of their own — `candidateInstrumentIds` and
 * `wantProfileSignal` on the intake route, `eligibilityBeforeRound` on the
 * memo, and the region call sends neither `basePayload` nor anything like it.
 * A union over all four would say the memo route may read
 * `wantProfileSignal`, which it may not.
 *
 * So the body expression of each `fetch("<route>", ...)` is read out of
 * panel.tsx: its own top-level keys, plus `basePayload`'s when it is spread in.
 * A key the panel starts sending is allowed on the next run with no edit here,
 * and a route it stops calling disappears from the map.
 */
export function panelSends(): Record<string, string[]> {
  const src = stripCommentsAndStrings(
    readFileSync(path.join(process.cwd(), "lib", "intelligence", "panel.tsx"), "utf8"));
  const base = panelContract().payloadKeys;
  const out: Record<string, string[]> = {};
  const re = /fetch\(""\s*,/g;
  // The route name is the string literal the stripper collapsed, so the routes
  // are taken in order from the UNSTRIPPED source and paired by position.
  const raw = readFileSync(
    path.join(process.cwd(), "lib", "intelligence", "panel.tsx"), "utf8");
  const routes = [...raw.matchAll(/fetch\("(\/api\/intelligence[^"]*)"\s*,/g)].map((m) => m[1]);
  let m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(src))) {
    const route = routes[i++];
    if (!route) continue;
    const open = src.indexOf("{", m.index + m[0].length - 1);
    const close = matchBrace(src, open);
    if (open < 0 || close < 0) continue;
    const init = src.slice(open + 1, close);
    // `body: JSON.stringify(<expr>)` — the expression is what reaches the wire.
    const b = /\bbody\s*:\s*JSON\.stringify\s*\(/.exec(init);
    if (!b) continue;
    const argOpen = b.index + b[0].length - 1;
    const argClose = matchParen(init, argOpen);
    if (argClose < 0) continue;
    const expr = init.slice(argOpen + 1, argClose).trim();
    const keys = new Set<string>();
    if (/^basePayload\s*\(/.test(expr)) {
      for (const k of base) keys.add(k);
    } else if (expr.startsWith("{")) {
      const body = expr.slice(1, matchBrace(expr, 0));
      for (const k of topLevelKeys(body)) keys.add(k);
      for (const sp of topLevelSpreads(body)) {
        if (sp === "basePayload") for (const k of base) keys.add(k);
      }
    }
    const prev = out[route] ?? [];
    out[route] = [...new Set([...prev, ...keys])].sort();
  }
  return out;
}

export function panelContract(): { payloadKeys: string[]; routes: string[] } {
  const src = readFileSync(
    path.join(process.cwd(), "lib", "intelligence", "panel.tsx"), "utf8");
  const literal = src.slice(src.indexOf("const basePayload = (eligOverride"));
  const body = literal.slice(literal.indexOf("({") + 2, literal.indexOf("});"));
  const payloadKeys = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .map((l) => /^([A-Za-z0-9_]+)\s*[:,]/.exec(l)?.[1])
    .filter((k): k is string => Boolean(k));
  const routes = [...new Set(
    [...src.matchAll(/fetch\("(\/api\/intelligence[^"]*)"/g)].map((m) => m[1]))];
  return { payloadKeys, routes };
}
