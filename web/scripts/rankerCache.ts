// A REPLY CACHE, so that a scoring change costs nothing and only a PROMPT
// change costs money.
//
// ── The gap this closes ────────────────────────────────────────────────────
// There is no cassette, fixture, VCR, nock, msw, or Anthropic prompt-cache
// anywhere in `lib/` -- grep confirms it. So every idea about the ranker, however
// small, has been priced at a full paid re-run: change how a pick is SCORED and
// you pay to re-generate the identical replies you already had. That is the
// loop-speed blocker, and it is the reason the architecture ("tweak a lever,
// measure it") has not been affordable to actually run.
//
// The precedent for the shape is `semanticCache.generated.json` +
// `loadSemanticCache()` in `lib/intelligence/semantic.ts`, including its
// loud-failure rule, which is repeated here because it is the whole discipline:
//
//   "an empty cache is not a smaller cache, it is every offline check ranking
//    on scores of 0"
//
// ── The key ────────────────────────────────────────────────────────────────
//
//   sha256( canonical JSON of the ENTIRE request )
//
// Everything the API is sent is in the key: model, system, messages, tools,
// tool_choice, max_tokens, output_config (which is where `effort` lives on
// current models), thinking, betas. `model` and `effort` are ALSO recorded as
// plain fields on the entry and printed on every run, because they are the two
// a reader most needs to see and the two most likely to be changed by accident.
//
// Hashing the whole body rather than a hand-picked subset is deliberate. A
// hand-picked key is a promise that the omitted fields do not change the reply,
// and that promise silently breaks the first time somebody adds a parameter --
// at which point the harness serves the control's replies to the treatment and
// reports the control's number. That has happened here twice. A whole-body hash
// cannot make that mistake: a prompt change misses, every time, by construction.
//
// ── The three modes, and why `replay` is the default ───────────────────────
//
//   CACHE=replay   (DEFAULT) read-only. A miss THROWS, naming the key and the
//                  arm. NOTHING IS EVER SPENT BY ACCIDENT: the monthly limit is
//                  hit, and a harness that quietly falls through to a live call
//                  is how it gets hit again.
//   CACHE=record   read-through. A miss makes the real call and writes it.
//                  The ONLY mode that spends, and it says so on every run.
//   CACHE=off      no cache. Every call live. Prints a warning, loudly.
//
// ── The fidelity gate ──────────────────────────────────────────────────────
// `_wsda_rows.ts:189-193` refuses to report anything until its offline
// simulator reproduces the published five for every case: "nothing below is
// evidence until this is 1.0". The same rule applies to a replay harness, and
// `assertReplayFidelity` below is it: a replayed run must reproduce the graded
// outcome the recorded run produced, case for case. A replay harness that
// silently diverges from production is worse than no replay harness, because it
// produces numbers that look measured.
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";

import { execFileSync } from "child_process";

export type CacheMode = "replay" | "record" | "off";

/** What is stored per key. The REQUEST is stored alongside the reply, in full.
 *  It roughly doubles the file, and it is what makes a tape auditable a week
 *  later: "which prompt produced this pick" is otherwise unanswerable, and a
 *  cache you cannot audit is a cache nobody trusts enough to rely on. */
export interface CacheEntry {
  key: string;
  at: string;
  /** Surfaced from the request because they are the two fields a reader checks
   *  first, and the two an accidental edit most often changes. */
  model: string;
  effort: string | null;
  /** The exact request body sent to the API. */
  request: unknown;
  /** The raw reply object, as returned. Parsed by the caller, never here: this
   *  module must not know what a pick looks like, or a change to the reply
   *  SHAPE would invalidate every cached reply. */
  reply: unknown;
}

/** Canonical JSON: object keys sorted, recursively. Two requests that differ
 *  only in key order are the same request, and `JSON.stringify` disagrees --
 *  which would turn a refactor of the prompt builder into a full cache miss and
 *  a full bill. Arrays keep their order: a message list is not a set. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) {
      // `undefined` is absent on the wire, so it must be absent from the key --
      // otherwise `{a:1}` and `{a:1,b:undefined}` hash differently and describe
      // the same call.
      if (o[k] !== undefined) out[k] = canonical(o[k]);
    }
    return out;
  }
  return v;
}

export function cacheKey(request: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(request))).digest("hex");
}

/** `effort` lives at `output_config.effort` on current models. Read defensively
 *  and reported as `null` rather than guessed: a run that says `effort=high`
 *  when the request set nothing is a run that misreports its own arm. */
function effortOf(request: unknown): string | null {
  const r = request as { output_config?: { effort?: unknown } } | null;
  const e = r?.output_config?.effort;
  return typeof e === "string" ? e : null;
}
function modelOf(request: unknown): string {
  const m = (request as { model?: unknown } | null)?.model;
  return typeof m === "string" ? m : "(unknown)";
}

/** THE PRIMARY CHECKOUT's cache, not this worktree's.
 *
 *  Every agent runs in its own worktree (`scripts/agent-worktree.sh`), and a
 *  per-worktree cache would mean each one pays for the same replies again --
 *  which is the bill this file exists to stop. `--git-common-dir` resolves to
 *  the PRIMARY checkout's `.git` from inside any worktree, so one reply paid
 *  for anywhere is free everywhere. Override with RANKER_CACHE_DIR. */
export function cacheDir(): string {
  if (process.env.RANKER_CACHE_DIR) return process.env.RANKER_CACHE_DIR;
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"],
      { encoding: "utf8", cwd: process.cwd() }).trim();
    const abs = path.resolve(process.cwd(), common);
    if (path.basename(abs) === ".git") return path.join(path.dirname(abs), "data", "ranker_cache");
  } catch { /* not a git checkout; fall through */ }
  return path.resolve(process.cwd(), "..", "capital", "data", "ranker_cache");
}

export function cacheMode(): CacheMode {
  const m = process.env.CACHE ?? "replay";
  if (!["replay", "record", "off"].includes(m)) {
    throw new Error(`CACHE must be replay|record|off, got "${m}"`);
  }
  return m as CacheMode;
}

const tally = { hit: 0, miss: 0, live: 0, wrote: 0 };
export function resetCacheTally(): void { tally.hit = 0; tally.miss = 0; tally.live = 0; tally.wrote = 0; }
export function cacheStats(): Readonly<typeof tally> { return tally; }

let announcedDir = false;
function entryPath(key: string): string { return path.join(cacheDir(), `${key}.json`); }

export function readEntry(key: string): CacheEntry | null {
  const p = entryPath(key);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as CacheEntry; } catch (e) {
    // A corrupt entry is reported, not silently treated as a miss: a miss in
    // `replay` throws with "run CACHE=record", which would send somebody to pay
    // for a reply that is already on disk and merely unreadable.
    console.error(`ranker cache: entry ${key.slice(0, 12)} is unreadable ` +
      `(${e instanceof Error ? e.message : String(e)}); treating as absent. ` +
      `Delete ${p} if this persists.`);
    return null;
  }
}

export function writeEntry(request: unknown, reply: unknown): CacheEntry {
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  const key = cacheKey(request);
  const entry: CacheEntry = {
    key, at: new Date().toISOString(),
    model: modelOf(request), effort: effortOf(request), request, reply,
  };
  writeFileSync(entryPath(key), JSON.stringify(entry));
  tally.wrote++;
  return entry;
}

/** The one call site every model request in a harness goes through.
 *
 *  `send` is only ever invoked on a real miss in `record`/`off`. In `replay` it
 *  is never invoked at all -- which is the guarantee, not an optimisation: a
 *  replay run cannot spend, whatever the caller passes in. */
export async function cachedCall<T>(request: unknown, send: () => Promise<T>): Promise<T> {
  const mode = cacheMode();
  if (!announcedDir) {
    announcedDir = true;
    if (mode !== "off") console.log(`ranker cache: ${cacheDir()}  mode=${mode}`);
  }
  if (mode === "off") {
    console.warn("ranker cache: CACHE=off -- this request is LIVE and BILLED.");
    tally.live++;
    return send();
  }
  const key = cacheKey(request);
  const hit = readEntry(key);
  if (hit) { tally.hit++; return hit.reply as T; }
  tally.miss++;
  if (mode === "replay") {
    throw new Error(
      `ranker cache MISS in CACHE=replay: key ${key.slice(0, 16)} ` +
      `(model=${modelOf(request)} effort=${effortOf(request) ?? "unset"}).\n` +
      `  The prompt, the model or the effort changed, so no recorded reply applies. ` +
      `A replay run NEVER makes a paid call -- that is the point of the default.\n` +
      `  To record it, re-run with CACHE=record. THAT RUN SPENDS MONEY; the monthly ` +
      `limit is hit, so say the amount out loud before you do.\n` +
      `  Cache dir: ${cacheDir()}`);
  }
  const reply = await send();
  writeEntry(request, reply);
  tally.live++;
  return reply;
}

/** THE LINE THAT MUST BE PRINTED ON EVERY RUN.
 *
 *  A cached reply must never be mistaken for a fresh one. So the hit rate, the
 *  mode, and the arm go on the same screen as the number, for the same reason
 *  `rankerTallyLine()` puts the ranker there: a figure copied out of a terminal
 *  has to carry what produced it. `arm` is the lever manifest (see
 *  `rankerTape.ts`) -- a hit rate without an arm cannot tell a treatment that
 *  replayed its own replies from one that replayed the control's. */
export function cacheTallyLine(arm: string): string {
  const mode = cacheMode();
  const n = tally.hit + tally.miss;
  const pc = n ? `${(100 * tally.hit / n).toFixed(0)}%` : "n/a";
  const live = tally.live
    ? `  ${tally.live} LIVE call(s) -- THIS RUN SPENT MONEY`
    : "  0 live calls -- this run was free";
  return `cache: ${tally.hit}/${n} hit (${pc})  mode=${mode}  arm=${arm}${live}`;
}

/** An empty cache is not a smaller cache.
 *
 *  Straight from `semantic.ts`: a check that silently found nothing is a check
 *  that measured nothing and said it measured something. A replay run against
 *  an empty directory would otherwise throw one confusing per-case miss at a
 *  time rather than saying the obvious thing once. */
export function assertCachePopulated(context: string): void {
  const dir = cacheDir();
  let n = 0;
  try { n = readdirSync(dir).filter((f) => f.endsWith(".json")).length; } catch { n = 0; }
  if (n === 0 && cacheMode() === "replay") {
    throw new Error(
      `${context}: the ranker cache at ${dir} is EMPTY and CACHE=replay.\n` +
      `  An empty cache is not a smaller cache -- every case would miss, and a run ` +
      `that reports nothing is not a run that measured nothing wrong.\n` +
      `  Record one first (CACHE=record, which SPENDS), or point RANKER_CACHE_DIR at ` +
      `a populated one.`);
  }
  if (n && !announcedDir) {
    announcedDir = true;
    console.log(`ranker cache: ${dir}  mode=${cacheMode()}  ${n} recorded repl${n === 1 ? "y" : "ies"}`);
  }
}

/** THE FIDELITY GATE, in the shape `_wsda_rows.ts:189-193` established.
 *
 *  A replayed case must reproduce what the recorded case produced. Anything
 *  below 1.0 and nothing downstream is evidence -- because a replay that
 *  diverges from production is a simulator quietly grading a different system,
 *  and its numbers look exactly like measured ones.
 *
 *  Returns the count so a caller can print it; THROWS on divergence rather than
 *  warning, because a warning in a long harness log is a warning nobody reads. */
export function assertReplayFidelity<T>(
  cases: readonly T[],
  recorded: (c: T) => string | null,
  replayed: (c: T) => string,
  label = "replay",
): { ok: number; n: number } {
  const graded = cases.filter((c) => recorded(c) !== null);
  const bad: string[] = [];
  for (const c of graded) if (recorded(c) !== replayed(c)) bad.push(String(replayed(c)));
  const ok = graded.length - bad.length;
  console.log(`FIDELITY  ${label} reproduces the recorded outcome: ${ok}/${graded.length}`);
  if (bad.length) {
    throw new Error(
      `${label} diverged from the recorded run on ${bad.length}/${graded.length} case(s): ` +
      `${bad.slice(0, 5).join(", ")}${bad.length > 5 ? ", ..." : ""}.\n` +
      `  Nothing measured on this replay is evidence until this is 1.0. A replay ` +
      `harness that silently diverges from production is worse than none.`);
  }
  return { ok, n: graded.length };
}
