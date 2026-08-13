// A ceiling that has been MEASURED to bind may not still be in force.
//
// ── What this guards, and the run it would have voided ─────────────────────
// `max_tokens` caps thinking and reply TOGETHER on the selector call. When it
// binds, the API returns `stop_reason: "max_tokens"` with no text block, the
// arm counts a fallback, and the SHIPPED ORDER publishes. Downstream that is
// indistinguishable from a model that declined to choose — so a run whose
// ceiling binds reports its own control under the treatment's banner.
//
// `project-mgmt/wsGA_prereg.md` names it a VOID condition in those words. The
// run then breached it: `findings/headtohead_wsGA/adviser_medium_n773_x2.md`
// records `effort=medium maxtok=6144 ... 4 CUT OFF at max_tokens`. Nothing in
// the tree noticed, because nothing read the tally line back.
//
// ── THE PROPERTY ──────────────────────────────────────────────────────────
//
//   FOR EVERY RECORDED RUN THAT TRUNCATED AT LEAST ONCE, THE CEILING NOW IN
//   FORCE AT THAT EFFORT MUST BE STRICTLY GREATER THAN THE CEILING THAT RUN
//   USED.
//
// It is stated over the runs, not over the values. There is no list of known
// ceilings here and no allowlist of efforts: a level added tomorrow is covered
// the first time it truncates, and a future run that truncates at the CURRENT
// ceiling turns this red until somebody raises it. The direction is the only
// one that helps — the guard can be satisfied by measuring more, never by
// measuring less.
//
// Two structural properties ride along, because a ladder that is not a ladder
// makes the first one meaningless:
//
//   2. THE CEILINGS ARE STRICTLY INCREASING IN EFFORT. An effort that thinks
//      deeper may not hold a shallower one's ceiling — raising `medium` past
//      `high` would "fix" this check by making `high` the binding level.
//   3. NO TIMEOUT EXCEEDS THE ROUTE'S OWN BUDGET, and the timeouts are
//      non-decreasing. A ceiling the clock cannot reach is not a ceiling: at
//      12,288 tokens against a 90-second wall the call is cut off before
//      `max_tokens` ever binds, and a timeout lands in `exits.threw` where a
//      truncation lands in `truncated`. Fixing one defect into the quieter
//      counter is not fixing it. `REQUEST_BUDGET_MS` is tied to the real
//      `maxDuration` literal here rather than retyped.
//
// ── Hermetic, and it cannot pass by having nothing to read ────────────────
// One leaf module (`caps.ts`, which imports nothing), one Next route file, and
// the committed `project-mgmt/` tree. No database, no credentials, no network.
// Four non-vacuity assertions fail it outright if the tree went missing, the
// parser stopped matching, the effort ladder collapsed, or the route file lost
// its literal.
//
// ── It proves itself on every run ─────────────────────────────────────────
// `selfTest()` runs the parser over synthetic tally lines — one per shape it
// must handle and one per failure mode — and fails the check BEFORE it judges
// the real tree if any of them come out wrong.
//
//   npx tsx scripts/check_maxtok_headroom.ts
//   PROVE=1 npx tsx scripts/check_maxtok_headroom.ts
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";

// SOURCE TEXT and two leaf constants. It opens no database and asks the corpus
// nothing, so the credential is destroyed rather than merely unused — the
// stronger of the two statements `check_env_loader` accepts, and the true one.
delete process.env.DATABASE_URL;

import {
  EFFORTS, MAX_TOKENS_BY_EFFORT, REQUEST_BUDGET_MS, TIMEOUT_BY_EFFORT,
  type ThinkEffort,
} from "../lib/intelligence/caps";

const ROOT = path.resolve(process.cwd(), "..", "..");
/** Where a run's own words are kept. Named literally so the tie between the
 *  guard and the tree it reads is visible from the source. */
const WATCHES = "project-mgmt";
/** The file that declares how long the whole request may take. The selector is
 *  one stage inside it and the writer runs after. */
const ROUTE = "website/frontend/app/api/intelligence/route.ts";

/** Non-vacuity. Each is a state in which this check would pass while seeing
 *  nothing, and each has a real cause: a moved tree, a renamed counter, a
 *  regex that stopped matching, a collapsed ladder. */
const MIN_RECORDS = 5;
const MIN_EFFORTS = 4;

/** One recorded run, as its own tally line states it. Named `Run` and not
 *  `Record` because the latter shadows the built-in generic. */
interface Run {
  file: string;
  effort: string;
  maxtok: number;
  truncated: number;
}

/**
 * Parse every `agent-select:` tally line in a blob.
 *
 * The three fields are read INDEPENDENTLY of each other and of their order,
 * because the line has already been rewritten twice — `N CUT OFF at max_tokens`
 * became `N/M CUT OFF at max_tokens` when the denominator was fixed (wsGS), and
 * a parser keyed to one spelling would go quietly blind on the other. What it
 * keys on is the counter's own name, which is the thing that cannot change
 * without somebody editing the counter.
 */
export function recordsIn(file: string, text: string): Run[] {
  const out: Run[] = [];
  for (const line of text.split("\n")) {
    if (!line.includes("agent-select:")) continue;
    const eff = line.match(/effort=([a-z]+)/);
    const cap = line.match(/maxtok=(\d+)/);
    // `N CUT OFF` or `N/M CUT OFF` — the numerator is the count either way.
    const cut = line.match(/(\d+)(?:\/\d+)?\s+CUT OFF at max_tokens/);
    if (!eff || !cap || !cut) continue;
    out.push({
      file, effort: eff[1], maxtok: Number(cap[1]), truncated: Number(cut[1]),
    });
  }
  return out;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(md|txt|json)$/.test(entry) ? [full] : [];
  });
}

/**
 * PROVE THAT PROPERTY 1 GOES RED ON THE EVENT IT NAMES.
 *
 * ██ Not a stand-in for the failure — the failure itself. ██ It re-judges the
 * REAL committed records against the ceiling that was in force when they were
 * written, and reports how many of them that ceiling rejects. If the answer is
 * zero, this guard is decorative and says so rather than reporting green.
 */
function prove(records: Run[]): void {
  const WAS: Record<string, number> = {
    off: 1024, low: 2048, medium: 6144, high: 12288, xhigh: 24576, max: 32768,
  };
  const rejected = records.filter(
    (r) => r.truncated > 0 && (WAS[r.effort] ?? Infinity) <= r.maxtok);
  console.log(`  PROVE property 1 against the ceilings in force before wsGS:`);
  for (const r of rejected) {
    console.log(`    RED  ${r.file}  effort=${r.effort} maxtok=${r.maxtok} `
      + `truncated=${r.truncated}, ceiling then ${WAS[r.effort]}`);
  }
  console.log(`    ${rejected.length} recorded run(s) rejected by the OLD ceilings  `
    + `${rejected.length ? "— the guard bites on the real event"
      : "██ NONE — THIS GUARD IS NOT ENFORCING ██"}`);
  if (!rejected.length) {
    throw new Error("PROVE: no committed run is rejected by the pre-wsGS ceilings, so "
      + "this check cannot be shown to catch the failure it was written for.");
  }
}

/** A guard whose own parser is broken is worse than no guard, because it is
 *  green. One synthetic line per shape it must handle, and one per failure. */
function selfTest(): void {
  const cases: [string, string, Partial<Run>][] = [
    ["the wsGA line, old denominator",
     "agent-select: arm=adviser depth=40 count=7 effort=medium maxtok=6144 unsure=declare "
     + "lookups=134 (62 brief(s) retrieved) model=claude-sonnet-5 — 145/148 chose, "
     + "thought on 210/148 call(s) (488444 thinking token(s) billed, 627554 readable char(s)), "
     + "4 CUT OFF at max_tokens, EUR 9.2660 total",
     { effort: "medium", maxtok: 6144, truncated: 4 }],
    ["the same line after the denominator was fixed",
     "agent-select: arm=adviser depth=40 count=7 effort=medium maxtok=12288 "
     + "model=claude-sonnet-5 — 145/148 chose, 210 API call(s) over 148 brief(s), "
     + "thought on 210/210 API call(s), 0/210 CUT OFF at max_tokens, EUR 9.2660 total",
     { effort: "medium", maxtok: 12288, truncated: 0 }],
    ["a clean run at another effort",
     "agent-select: arm=adviser depth=40 count=6 effort=high maxtok=12288 unsure=declare "
     + "model=claude-sonnet-5 — 34/36 chose, 0 CUT OFF at max_tokens, EUR 1.9112 total",
     { effort: "high", maxtok: 12288, truncated: 0 }],
  ];
  for (const [name, line, want] of cases) {
    const got = recordsIn("synthetic", line);
    if (got.length !== 1) {
      throw new Error(`selfTest: "${name}" parsed to ${got.length} record(s), expected 1`);
    }
    for (const [k, v] of Object.entries(want)) {
      if ((got[0] as unknown as Record<string, unknown>)[k] !== v) {
        throw new Error(`selfTest: "${name}" read ${k}=`
          + `${String((got[0] as unknown as Record<string, unknown>)[k])}, expected ${String(v)}`);
      }
    }
  }
  // Lines that are NOT tally lines must not parse — a loose regex that matched
  // prose would let a sentence quoting a number gate the build.
  const noise = recordsIn("synthetic",
    "The run truncated 4 calls at effort=medium and maxtok=6144, which voided it.");
  if (noise.length) {
    throw new Error("selfTest: prose quoting the fields parsed as a tally line");
  }
  // And a real tally line missing the counter must not be silently dropped as
  // "clean" — it must simply not be a record, which is what the arm-off line is.
  const armOff = recordsIn("synthetic", "agent-select: arm=off, no calls made");
  if (armOff.length) throw new Error("selfTest: a line with no ceiling parsed as a record");
}

// ── run ────────────────────────────────────────────────────────────────────
selfTest();

const problems: string[] = [];

// Property 2 — the ladder is strictly increasing in effort.
let prev = -1;
for (const e of EFFORTS) {
  const v = MAX_TOKENS_BY_EFFORT[e];
  if (!(v > prev)) {
    problems.push(`MAX_TOKENS_BY_EFFORT.${e} is ${v}, not greater than the level below `
      + `(${prev}). An effort that thinks deeper may not hold a shallower one's ceiling.`);
  }
  prev = v;
}

// Property 3 — the clock fits inside the route, and rises with the ceiling.
let prevMs = -1;
for (const e of EFFORTS) {
  const ms = TIMEOUT_BY_EFFORT[e];
  if (ms > REQUEST_BUDGET_MS) {
    problems.push(`TIMEOUT_BY_EFFORT.${e} is ${ms}ms against a request budget of `
      + `${REQUEST_BUDGET_MS}ms. The writer runs after this stage inside the same budget.`);
  }
  if (ms < prevMs) {
    problems.push(`TIMEOUT_BY_EFFORT.${e} is ${ms}ms, below the level under it (${prevMs}ms).`);
  }
  prevMs = ms;
}

// …and REQUEST_BUDGET_MS is the route's real number, not a remembered one.
const routeFile = path.join(ROOT, ROUTE);
if (!existsSync(routeFile)) {
  problems.push(`${ROUTE} is missing — the request budget cannot be verified.`);
} else {
  const m = readFileSync(routeFile, "utf8").match(/export const maxDuration\s*=\s*(\d+)/);
  if (!m) {
    problems.push(`${ROUTE} declares no \`maxDuration\` literal; REQUEST_BUDGET_MS mirrors `
      + `nothing.`);
  } else if (Number(m[1]) * 1000 !== REQUEST_BUDGET_MS) {
    problems.push(`REQUEST_BUDGET_MS is ${REQUEST_BUDGET_MS}ms but ${ROUTE} declares `
      + `maxDuration = ${m[1]} (${Number(m[1]) * 1000}ms). One of them moved alone.`);
  }
}

// Property 1 — the measured one.
const records = walk(path.join(ROOT, WATCHES))
  .flatMap((f) => recordsIn(path.relative(ROOT, f), readFileSync(f, "utf8")));

for (const r of records) {
  if (r.truncated <= 0) continue;
  const now = MAX_TOKENS_BY_EFFORT[r.effort as ThinkEffort];
  if (now == null) {
    problems.push(`${r.file} records effort="${r.effort}", which is not an effort level. `
      + `Either the level was removed while a run that used it is still on disk, or the `
      + `line is malformed.`);
    continue;
  }
  if (now <= r.maxtok) {
    problems.push(`${r.file}: effort=${r.effort} truncated ${r.truncated} call(s) at `
      + `maxtok=${r.maxtok}, and the ceiling in force at ${r.effort} is still ${now}. `
      + `A ceiling measured to bind may not remain in force — raise it above ${r.maxtok}. `
      + `Never lower this bar to make the build green: truncation publishes the control.`);
  }
}

// Non-vacuity.
const efforts = new Set(records.map((r) => r.effort));
if (records.length < MIN_RECORDS) {
  problems.push(`Only ${records.length} tally line(s) found under ${WATCHES}/ `
    + `(expected at least ${MIN_RECORDS}). The tree moved, or the counter was renamed and `
    + `this guard has gone blind.`);
}
if (efforts.size < MIN_EFFORTS) {
  problems.push(`Records cover only ${efforts.size} effort level(s) `
    + `(expected at least ${MIN_EFFORTS}): ${[...efforts].join(", ") || "none"}.`);
}

if (process.env.PROVE) prove(records);

if (problems.length) {
  console.error(`check_maxtok_headroom: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`check_maxtok_headroom: ok — ${records.length} recorded run(s) across `
  + `${efforts.size} effort level(s); every ceiling measured to bind has since been raised, `
  + `the ladder is strictly increasing, and no timeout exceeds the route's ${REQUEST_BUDGET_MS}ms.`);
