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
//
//   4. A CEILING SIZED ON A SHORTER MENU THAN THE ONE SHIPPING DOES NOT COUNT
//      AS SIZED. Property 1 asks only "is the ceiling higher than the one that
//      bound?", and wsGS satisfied it — with a number taken from EIGHTEEN-row
//      runs while forty rows shipped, because the tally line printed `depth=40`
//      (the LEVER) and never printed the menu (the FACT). Two ceilings later
//      nobody had noticed. So when a run that truncated is known to have run a
//      SHORTER menu than `VERDICT_POOL`, the replacement must clear that run's
//      ceiling scaled by the menu ratio, not merely exceed it.
//
//      The ratio is deliberately linear in rows — the pessimistic end of the
//      scalings `_wshi_tokens.ts` brackets — because the scaling is unmeasured
//      and this guard may not be the optimistic party. Runs whose menu is
//      genuinely unknown are reported, never silently cleared.
//   5. A CEILING THE TRANSPORT WILL NOT CARRY IS NOT A CEILING — IT IS AN
//      OUTAGE. Properties 1-4 all ask whether a ceiling is BIG ENOUGH. None of
//      them asked whether the request can be sent at all, and it cannot: the
//      Anthropic SDK refuses a NON-STREAMING request whose `max_tokens` implies
//      a generation longer than ten minutes, client-side, before a socket is
//      opened. `agentSelect.ts` does not stream. So the ceilings wsGS and wsHI
//      installed for `medium` and above made every call at those efforts throw,
//      at EUR 0.0000, into `exits.threw` — where `agentSelectRows` catches it
//      and PUBLISHES THE SHIPPED ORDER. A run at those efforts reports the
//      CONTROL's number under the TREATMENT's banner and bills nothing, which
//      is the one failure shape no counter in the tally line can distinguish
//      from success. Measured live by wsHO: 2 of 2 calls at `medium`.
//
//      THE LIMIT IS ASKED OF THE TRANSPORT, NOT RETYPED HERE. The check calls
//      the SDK's own `calculateNonstreamingTimeout` and treats its throw as the
//      answer, so an SDK upgrade that moves the boundary moves this guard with
//      it and a number nobody can find in the source cannot go stale. Whether
//      the call streams is read from `agentSelect.ts` itself, so adding
//      `stream: true` lifts the constraint automatically and correctly.
//
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

import Anthropic from "@anthropic-ai/sdk";

import {
  EFFORTS, MAX_TOKENS_BY_EFFORT, REQUEST_BUDGET_MS, TIMEOUT_BY_EFFORT,
  VERDICT_POOL, type ThinkEffort,
} from "../lib/intelligence/caps";

const ROOT = path.resolve(process.cwd(), "..", "..");
/** Where a run's own words are kept. Named literally so the tie between the
 *  guard and the tree it reads is visible from the source. */
const WATCHES = "project-mgmt";
/** The file that declares how long the whole request may take. The selector is
 *  one stage inside it and the writer runs after. */
const ROUTE = "website/frontend/app/api/intelligence/route.ts";
/** The file that MAKES the call the ceilings bound. Read to find out whether it
 *  streams, because that single fact decides whether the transport will carry a
 *  large `max_tokens` at all. */
const SEAM = "website/frontend/lib/intelligence/agentSelect.ts";

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
  /** Rows the model was actually shown, longest over the run. `null` when the
   *  line predates `menu=` and no recovered menu is on file for it. */
  menu: number | null;
}

/** Where menus recovered from a pre-`menu=` run's own tape are kept, so an old
 *  record can be judged without being edited. Written by
 *  `scripts/_wshi_tokens.ts` from the tapes themselves. */
const RECOVERED = "project-mgmt/findings/tokens_wsHI/measured_menus.json";
function recoveredMenus(): Record<string, number> {
  const f = path.join(ROOT, RECOVERED);
  if (!existsSync(f)) return {};
  const raw = JSON.parse(readFileSync(f, "utf8")) as
    { runs?: Record<string, { menuMax?: number }> };
  const out: Record<string, number> = {};
  for (const [file, v] of Object.entries(raw.runs ?? {})) {
    if (typeof v.menuMax === "number" && v.menuMax > 0) out[file] = v.menuMax;
  }
  return out;
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
    // ── A RUN RECORD IS A LINE A HARNESS PRINTED, NOT ONE PROSE QUOTES ─────
    // `includes` let a tally line QUOTED INSIDE another sentence parse as a
    // recorded run. That is not hypothetical: committing the red-proof log for
    // `tallyDenominator.test.ts` put four synthetic lines under project-mgmt/
    // — `AssertionError: expected 'agent-select: …'` and `Received:
    // "agent-select: …"` — and this guard counted them as paid runs. A test
    // fixture that truncates would then red the build for a run nobody made,
    // and a synthetic clean one would pad the menu-coverage line the owner
    // reads before authorising a spend. Both are worse than a missed record.
    //
    // THE PROPERTY: the line must BEGIN with the counter's own prefix, so a
    // quotation is never a measurement. Leading whitespace is allowed because
    // console output is sometimes indented; a quote mark or any other prefix
    // is not.
    if (!/^\s*agent-select:/.test(line)) continue;
    const eff = line.match(/effort=([a-z]+)/);
    const cap = line.match(/maxtok=(\d+)/);
    // `N CUT OFF` or `N/M CUT OFF` — the numerator is the count either way.
    const cut = line.match(/(\d+)(?:\/\d+)?\s+CUT OFF at max_tokens/);
    // `menu=N rows` or `menu=N-M rows`; absent on every line written before
    // wsHI, in which case the menu is recovered from the run's tape or is
    // genuinely unknown. The MAX is what a ceiling has to survive.
    const menu = line.match(/menu=(?:\d+-)?(\d+) rows/);
    if (!eff || !cap || !cut) continue;
    out.push({
      file, effort: eff[1], maxtok: Number(cap[1]), truncated: Number(cut[1]),
      menu: menu ? Number(menu[1]) : null,
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
  const PRE_WSGS: Record<string, number> = {
    off: 1024, low: 2048, medium: 6144, high: 12288, xhigh: 24576, max: 32768,
  };
  // The ceilings wsGS installed. Property 1 is SATISFIED by these — which is
  // the point: they are the state property 4 exists to reject.
  const PRE_WSHI: Record<string, number> = {
    off: 1024, low: 2048, medium: 12288, high: 16384, xhigh: 24576, max: 32768,
  };
  const truncating = records.filter((r) => r.truncated > 0);

  const p1 = truncating.filter((r) => (PRE_WSGS[r.effort] ?? Infinity) <= r.maxtok);
  console.log(`  PROVE property 1 against the ceilings in force before wsGS:`);
  for (const r of p1) {
    console.log(`    RED  ${r.file}  effort=${r.effort} maxtok=${r.maxtok} `
      + `truncated=${r.truncated}, ceiling then ${PRE_WSGS[r.effort]}`);
  }
  console.log(`    ${p1.length} recorded run(s) rejected by the pre-wsGS ceilings  `
    + `${p1.length ? "— the guard bites on the real event"
      : "██ NONE — THIS GUARD IS NOT ENFORCING ██"}`);
  if (!p1.length) {
    throw new Error("PROVE: no committed run is rejected by the pre-wsGS ceilings, so "
      + "this check cannot be shown to catch the failure it was written for.");
  }

  // ── property 4, against the ceilings that PASSED property 1 ──────────────
  console.log(`  PROVE property 4 against the ceilings wsGS installed `
    + `(which property 1 accepts):`);
  if (SHIPPED_MENU == null) {
    throw new Error("PROVE: VERDICT_POOL is `all`, so property 4 has no ratio to apply "
      + "and cannot be shown to bite.");
  }
  const p4 = truncating.filter((r) => {
    const now = PRE_WSHI[r.effort] ?? Infinity;
    if (now <= r.maxtok) return false;                 // property 1 already rejects it
    if (r.menu == null) return true;                   // unknown menu licenses nothing
    return r.menu < SHIPPED_MENU && now <= (r.maxtok * SHIPPED_MENU) / r.menu;
  });
  for (const r of p4) {
    const need = r.menu == null ? "unknown"
      : String(Math.ceil((r.maxtok * SHIPPED_MENU) / r.menu));
    console.log(`    RED  ${r.file}  effort=${r.effort} maxtok=${r.maxtok} `
      + `menu=${r.menu ?? "?"} rows vs ${SHIPPED_MENU} shipping, `
      + `ceiling then ${PRE_WSHI[r.effort]}, needs > ${need}`);
  }
  console.log(`    ${p4.length} recorded run(s) rejected  `
    + `${p4.length ? "— a ceiling raised on the wrong menu is caught"
      : "██ NONE — PROPERTY 4 IS NOT ENFORCING ██"}`);
  if (!p4.length) {
    throw new Error("PROVE: the ceilings wsGS installed pass property 4, so the property "
      + "cannot be shown to catch the error it was written for — a ceiling sized on an "
      + "eighteen-row menu while forty rows ship.");
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
     { effort: "medium", maxtok: 12288, truncated: 0, menu: null }],
    ["a clean run at another effort",
     "agent-select: arm=adviser depth=40 count=6 effort=high maxtok=12288 unsure=declare "
     + "model=claude-sonnet-5 — 34/36 chose, 0 CUT OFF at max_tokens, EUR 1.9112 total",
     { effort: "high", maxtok: 12288, truncated: 0, menu: null }],
    // The shape written from wsHI onward: the MENU is stated, and the clock is
    // reported beside the truncation count. A parser that went blind on either
    // would leave property 4 permanently vacuous and property 1 looking green.
    ["the wsHI line — menu stated, fixed menu length",
     "agent-select: menu=40 rows arm=adviser depth=40 count=7 effort=medium maxtok=34816 "
     + "unsure=declare lookups=0 (0 brief(s) retrieved) model=claude-sonnet-5 — 148/148 "
     + "chose, 210 API call(s) over 148 brief(s), thought on 210/210 API call(s) "
     + "(488444 thinking token(s) billed, 627554 readable char(s)), 0/210 CUT OFF at "
     + "max_tokens, slowest call 41230ms of 150000ms (27.5% of the clock), EUR 9.2660 total",
     { effort: "medium", maxtok: 34816, truncated: 0, menu: 40 }],
    ["the wsHI line — menu varies across founders, the MAX is what binds",
     "agent-select: menu=12-40 rows arm=adviser depth=40 count=7 effort=high maxtok=57344 "
     + "model=claude-sonnet-5 — 30/36 chose, 2/36 CUT OFF at max_tokens, "
     + "slowest call 9000ms of 200000ms (4.5% of the clock), EUR 1.0000 total",
     { effort: "high", maxtok: 57344, truncated: 2, menu: 40 }],
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
  // A REAL tally line QUOTED INSIDE another line is not a run. These two shapes
  // are verbatim from a committed vitest log, and both parsed before wsHI.
  const quoted = recordsIn("synthetic",
    `Received: "agent-select: arm=adviser depth=40 count=7 effort=medium maxtok=34816 `
    + `model=claude-sonnet-5 — 1/1 chose, 1/1 CUT OFF at max_tokens, EUR 0.1 total"\n`
    + `AssertionError: expected 'agent-select: menu=12 rows arm=adviser effort=high `
    + `maxtok=57344 — 1/1 chose, 3/3 CUT OFF at max_tokens' to contain 'x'`);
  if (quoted.length) {
    throw new Error(`selfTest: ${quoted.length} tally line(s) quoted inside prose parsed as `
      + `recorded runs. A test log committed under ${WATCHES}/ would then gate a paid run.`);
  }
  // …while the same line, printed rather than quoted, still parses — indented,
  // because console output sometimes is.
  const indented = recordsIn("synthetic",
    "   agent-select: menu=40 rows arm=adviser effort=medium maxtok=34816 — 1/1 chose, "
    + "0/1 CUT OFF at max_tokens, EUR 0.1 total");
  if (indented.length !== 1) throw new Error("selfTest: an indented real line stopped parsing");
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

// ── Property 5 — the transport will actually carry the ceiling ────────────
// Asked of the SDK rather than restated. `calculateNonstreamingTimeout` is the
// exact function `messages.create` calls on a non-streaming request; if it
// throws for a value, that value cannot be sent, full stop. Constructed with an
// explicit dummy key so nothing is read from the environment and no credential
// dependency is acquired — the client opens no socket to answer this.
const seamFile = path.join(ROOT, SEAM);
if (!existsSync(seamFile)) {
  problems.push(`${SEAM} is missing — whether the seam streams cannot be established, `
    + `and the ceilings above bound a call nobody can find.`);
} else {
  const seamSrc = readFileSync(seamFile, "utf8");
  // The stage's own request. `stream: true` anywhere in the module is taken as
  // streaming: this property is about whether the ceiling CAN be carried, and a
  // module that streams somewhere is one where the fix has begun. It is a
  // deliberate false-negative in the safe direction — a check that goes green
  // too early is visible, one that reds forever gets deleted.
  const streams = /\bstream\s*:\s*true\b/.test(seamSrc)
    || /\.messages\s*\.\s*stream\s*\(/.test(seamSrc);
  if (!streams) {
    const probe = new Anthropic({ apiKey: "check_maxtok_headroom-no-network" });
    for (const e of EFFORTS) {
      const v = MAX_TOKENS_BY_EFFORT[e];
      let carried = true;
      try {
        probe.calculateNonstreamingTimeout(v, undefined);
      } catch {
        carried = false;
      }
      if (!carried) {
        problems.push(`MAX_TOKENS_BY_EFFORT.${e} is ${v}, which the Anthropic SDK REFUSES `
          + `to send on a non-streaming request — it throws before a socket is opened and `
          + `${SEAM} does not stream. Every call at effort=${e} therefore lands in `
          + `\`exits.threw\`, the shipped order is published, and the run bills EUR 0.0000 `
          + `while reporting the CONTROL under the TREATMENT's name. Measured live by wsHO: `
          + `2 of 2. Fix it by streaming the request, not by calling the ceiling measured.`);
      }
    }
  }
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
const recovered = recoveredMenus();
const records = walk(path.join(ROOT, WATCHES))
  .flatMap((f) => recordsIn(path.relative(ROOT, f), readFileSync(f, "utf8")))
  .map((r) => ({ ...r, menu: r.menu ?? recovered[r.file] ?? null }));

/** The menu that ships. `all` means the pool is never cut, so no ratio exists
 *  and property 4 cannot speak. */
const SHIPPED_MENU = Number.isFinite(VERDICT_POOL) ? VERDICT_POOL : null;

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
    continue;
  }
  // Property 4 — the ceiling was raised, but was it raised for THIS menu?
  if (SHIPPED_MENU == null) continue;
  if (r.menu == null) {
    problems.push(`${r.file}: effort=${r.effort} truncated ${r.truncated} call(s) and the `
      + `record does not state the MENU it showed, so the ceiling now in force cannot be `
      + `judged against the ${SHIPPED_MENU}-row menu that ships. Either the line predates `
      + `\`menu=\` — recover it from the run's own tape into ${RECOVERED} — or a counter was `
      + `renamed. A truncating run whose menu is unknown licenses nothing.`);
    continue;
  }
  if (r.menu >= SHIPPED_MENU) continue;       // measured at least as deep as we ship
  const needed = (r.maxtok * SHIPPED_MENU) / r.menu;
  if (now <= needed) {
    problems.push(`${r.file}: effort=${r.effort} truncated ${r.truncated} call(s) at `
      + `maxtok=${r.maxtok} on a ${r.menu}-row menu, but ${SHIPPED_MENU} rows ship. The `
      + `ceiling in force is ${now}; a menu ${(SHIPPED_MENU / r.menu).toFixed(2)}x longer `
      + `needs more than ${Math.ceil(needed)}. Raising a ceiling ABOVE the one that bound is `
      + `not the same as sizing it for the menu that binds it — that is the error wsGS made `
      + `and this property exists to catch. Never shrink the menu to make this green.`);
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

if (process.env.PROVE) {
  prove(records);
  // ── PROVE property 5 goes red on the ladder that was actually in force ──
  // Not a simulation: these are the six values `caps.ts` held between wsHI and
  // wsHO, and the transport is asked about each one exactly as the seam would.
  const WSHI_LADDER: Record<string, number> = {
    off: 1024, low: 2048, medium: 34_816, high: 57_344, xhigh: 96_256, max: 128_000,
  };
  const probe5 = new Anthropic({ apiKey: "check_maxtok_headroom-no-network" });
  console.log(`  PROVE property 5 against the ladder wsHI installed:`);
  const dead: string[] = [];
  for (const [e, v] of Object.entries(WSHI_LADDER)) {
    try { probe5.calculateNonstreamingTimeout(v, undefined); } catch { dead.push(`${e}=${v}`); }
  }
  for (const d of dead) console.log(`    RED  ${d} — the SDK refuses to send it non-streaming`);
  console.log(`    ${dead.length} of ${Object.keys(WSHI_LADDER).length} rung(s) rejected  `
    + (dead.length
      ? "— every paid run at those efforts published the control and billed nothing"
      : "██ NONE — PROPERTY 5 IS NOT ENFORCING ██"));
  if (!dead.length) {
    throw new Error("PROVE: the ladder wsHI installed passes property 5, so the property "
      + "cannot be what caught wsHO's two thrown calls. Something is not being asked.");
  }
}

if (problems.length) {
  console.error(`check_maxtok_headroom: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

// ── the coverage the owner has to see before authorising a run ────────────
// Not a failure: a menu nobody has bought cannot be conjured by reddening a
// build, and failing here would only invite someone to shrink the menu. It is
// reported because "the ceiling now in force has never been exercised at the
// menu that ships" is precisely the state a paid run is supposed to leave.
const atShipped = SHIPPED_MENU == null ? []
  : records.filter((r) => (r.menu ?? 0) >= SHIPPED_MENU);
if (SHIPPED_MENU != null) {
  console.log(`  menu coverage: ${atShipped.length} recorded run(s) at the `
    + `${SHIPPED_MENU}-row menu that ships`
    + (atShipped.length ? "" : "   ██ THE CEILING HAS NEVER BEEN EXERCISED AT THIS MENU ██"));
  if (!atShipped.length) {
    console.log(`    Every ceiling above is projected from shorter menus. `
      + `See project-mgmt/wsHK_prereg.md — that run is what supplies this line.`);
  }
}

console.log(`check_maxtok_headroom: ok — ${records.length} recorded run(s) across `
  + `${efforts.size} effort level(s); every ceiling measured to bind has since been raised `
  + `and sized for the menu that ships, the ladder is strictly increasing, and no timeout `
  + `exceeds the route's ${REQUEST_BUDGET_MS}ms.`);
