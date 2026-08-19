// A harness may not answer the intake on the founder's behalf.
//
// ── What this exists to stop happening again ───────────────────────────────
// `answersFor` was written to be the one place a replayed founder's answers
// come from. `check_recall_floor.ts` — the gate that fails the build — never
// called it. It inlined eight constants at its `computeVerdict` call site, one
// import away from the resolver, and nothing noticed for weeks:
//
//   * 18 of the 23 askable intake fields were never supplied by ANY arm, so no
//     measurement of them was possible;
//   * `capitalSought: ["grant","loan"]` removed every tax-credit and equity
//     instrument before ranking — 100% of autopsy bucket 2, 22 of 30 "missing
//     from pool" cases — and was reported to the owner as a CORPUS gap;
//   * `"TestCo"` matched nothing, so `usedInField`, TIER 1 OF THE ROW SORT,
//     was false on 0 of 3,810 rows in every EXACT@5 this repo has published.
//
// None of the three is visible in a diff, a signature or a test. All three are
// visible in one property: the intake literal existed at all.
//
// ── The property ──────────────────────────────────────────────────────────
//     A script that REPLAYS A RECALL PAIR must obtain the founder from
//     `founderIntake`, and must not name an intake field in its own source.
//
// Replay is detected, not listed: a file that imports the recall set AND calls
// `computeVerdict` is replaying a pair, whatever it is called. The field names
// come from `keyof EligibilityAnswers` via `ALL_INTAKE_FIELDS`, so a field
// added to the intake tomorrow is in scope on the next compile. No script name,
// no fund, no country and no sector appears in this file.
//
// ── Why a ratchet and not a flat ban ──────────────────────────────────────
// Ten diagnostic harnesses predate the resolver and each carries its own
// literal. Failing all ten today would put a red light in `npm run check` that
// nobody can clear in one sitting, and a gate that cannot pass gets muted —
// this repo's own stated failure mode, written in check_recall_floor.ts.
//
// So: the two harnesses whose numbers are PUBLISHED (the floor gate and the
// measurement it floors) are held to the property outright, and every other
// replay harness is ratcheted at the count of intake keys it inlines today. A
// NEW harness starts at zero and must comply. An old one may only shrink.
// `git log` will show the ratchet going down; it cannot go up.
//
//   npx tsx scripts/check_harness_intake.ts
//   SELFTEST=1 npx tsx scripts/check_harness_intake.ts   # prove it can fail
//
// FREE: reads two committed trees. No credentials, no network, no database,
// nothing gitignored.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { stripCommentsAndStrings } from "../lib/intelligence/__sourceScan";

import {
  ALL_INTAKE_FIELDS, ANONYMOUS_FOUNDER, ASKABLE_FIELDS, INTAKE_SOURCE,
  founderIntake, founderPolicyFromEnv,
} from "./founderIntake";
import type { IntakeField } from "./founderIntake";
import { loadRecallSet } from "./recallSet";

const SCRIPTS = path.join(process.cwd(), "scripts");

/** The intake keys a harness must never write itself. `capitalSought` is not a
 *  field of `EligibilityAnswers` — it is a `computeVerdict` option — and it is
 *  the one that did the most damage, so it is added explicitly rather than
 *  inherited. `description` is the caller's query, not the founder's answers,
 *  and stays out. `targetMarkets` was named here as the other exclusion and no
 *  longer exists: wsIK removed the field from the request, from all three
 *  routes and from `founderCountryList`, because it was one only a harness
 *  could send. `check_request_surface.ts` is the rule that generalises it. */
const GUARDED_KEYS: readonly string[] = [...ALL_INTAKE_FIELDS, "capitalSought"];

/** Comments and string bodies removed, so a key named inside a doc block or a
 *  message cannot be mistaken for one being passed. ONE copy, shared with the
 *  route-surface guard, which had the same need and a private regex that read
 *  comments as code — see `__sourceScan.ts` for what that cost. Re-exported
 *  because this file's own self-test names it. */
export const strip = stripCommentsAndStrings;

/** ── What counts as "writing an intake", and why it is not "names a key" ──
 *
 *  A field name followed by a colon is not enough. `{ ticket: 0, capital: 0,
 *  region: 0 }` is a COUNTER in `measure_recall.ts`, and a guard that failed on
 *  it would be demanding a rename, which is the kind of demand that gets a
 *  guard muted. Two things are flagged instead, and both are the real defect:
 *
 *    1. ANY intake key inside a `computeVerdict(...)` argument list. One is
 *       enough — `capitalSought: ["grant","loan"]` alone was the whole of
 *       autopsy bucket 2.
 *    2. Any object literal, anywhere, naming THREE OR MORE intake fields. That
 *       is an intake whatever it is assigned to, so hoisting the literal into a
 *       `const` two lines up does not evade this.
 */
export function inlinedKeys(src: string): string[] {
  const body = strip(src);
  const hits = new Set<string>();
  // Every `key:` occurrence, with the index of its innermost enclosing `{`.
  const owner: number[] = [];        // brace-open index per key occurrence
  const keyAt: string[] = [];
  const inCall: boolean[] = [];
  const stack: number[] = [];
  const calls: [number, number][] = [];   // computeVerdict( ... ) spans
  {
    const re = /\bcomputeVerdict\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      let depth = 0, i = m.index + m[0].length - 1;
      for (; i < body.length; i++) {
        if (body[i] === "(") depth++;
        else if (body[i] === ")" && --depth === 0) break;
      }
      calls.push([m.index, i]);
    }
  }
  const keyRe = new RegExp(`(^|[^\\w.$"'])(${GUARDED_KEYS.join("|")})\\s*:`, "gm");
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "{") stack.push(i);
    else if (body[i] === "}") stack.pop();
    keyRe.lastIndex = i;
    const m = keyRe.exec(body);
    if (m && m.index === i) {
      owner.push(stack.length ? stack[stack.length - 1] : -1);
      keyAt.push(m[2]);
      inCall.push(calls.some(([a, b]) => i > a && i < b));
      i = keyRe.lastIndex - 1;
    }
  }
  const perOwner = new Map<number, number>();
  for (const o of owner) perOwner.set(o, (perOwner.get(o) ?? 0) + 1);
  for (let j = 0; j < keyAt.length; j++) {
    if (inCall[j] || (perOwner.get(owner[j]) ?? 0) >= 3) hits.add(keyAt[j]);
  }
  return [...hits].sort();
}

const replays = (src: string): boolean => {
  const body = strip(src);
  return /\bcomputeVerdict\s*\(/.test(body) && /from\s*""/.test(body)
    && /\.\/recallSet|\.\/founderIntake|loadRecallSet/.test(src);
};

/** Held to the property outright: their numbers are published and floored.
 *  `_wsci_autopsy.ts` is here because its bucket 2 WAS the pinned
 *  `capitalSought` — 100% `SEL-CAPITAL` — published as a product finding.
 *
 *  `measure_signal_power.ts` joined them in wsCU: it is the source of the
 *  eighteen-arm signal table AND of the two feature dumps the blended ranker
 *  is fitted on, and one of its arms IS the shipped five — so a `"TestCo"`
 *  intake there made every blend-versus-shipped comparison a comparison
 *  against a row sort whose tier 1 could not fire. */
const STRICT = new Set(["check_recall_floor.ts", "measure_recall.ts", "_wsci_autopsy.ts",
  "_wscm_tiers.ts", "measure_signal_power.ts"]);

/** ── The ratchet ──────────────────────────────────────────────────────────
 *  file -> the number of intake keys it inlined when this guard was written.
 *  May only go DOWN. A file absent from this table must inline none. */
const RATCHET: Record<string, number> = {
  "_wscc_pilot.ts": 9,
  "_wscd2_reach.ts": 8,
  "_wsck_money.ts": 7,
  "_wscm_stages.ts": 9,
  "build_gate1_fixture.ts": 8,
  "diagnose_capital_pool.ts": 9,
  "diagnose_corpus_variance.ts": 8,
  "diagnose_ordering.ts": 9,
  "diagnose_region_drop.ts": 8,
  "measure_description_lift.ts": 8,
  "measure_evidence_reach.ts": 9,
  "measure_funnel_recall.ts": 8,
  "measure_gate_standalone.ts": 9,
  "measure_open_questions.ts": 8,
};

function selfTest(): void {
  // Every failure mode, proved on synthetic sources, BEFORE the real ones are
  // judged. A detector nobody has seen fail is a detector nobody can trust.
  const cases: [string, string, number][] = [
    ["a plain literal is caught", 'computeVerdict(x, y, { ticketBand: "b", sector: "s" })', 2],
    ["a key in a // comment is not", '// ticketBand: "b"\ncomputeVerdict(x, y, f.e)', 0],
    ["a key in a /* */ block is not", '/* sector: x */ computeVerdict(x, y, f.e)', 0],
    ["a key inside a string is not", 'const s = "sector: x"; computeVerdict(x, y, f.e)', 0],
    ["a property READ is not a write", "if (e.sector === x) {}", 0],
    ["capitalSought at a call site is caught", "computeVerdict(a, b, e, { capitalSought: [] });", 1],
    ["a spread of the resolver is clean", "computeVerdict(f.company, f.country, f.eligibility, {...f.opts})", 0],
    // The two false positives a name-only detector produced on the very
    // harnesses this workstream converted. Both are pinned, because a guard
    // that demands a rename is a guard that gets muted.
    ["a counter object is not an intake", "const derived = { ticket: 0, capital: 0, region: 0 };", 0],
    ["a one-key policy override is not an intake", "const p = { ...fromEnv(), consortium: c };", 0],
    ["a hoisted three-key literal IS an intake",
      "const e = { sector: s, ticketBand: t, consortium: c }; computeVerdict(a, b, e);", 3],
  ];
  const bad: string[] = [];
  for (const [name, src, want] of cases) {
    const got = inlinedKeys(src).length;
    if (got !== want) bad.push(`  ${name}: expected ${want} inlined key(s), detector found ${got}`);
  }
  // And the runtime half: the resolver must never emit a field it declares
  // withheld, on any real row of the shipped set.
  const { rows } = loadRecallSet("harness intake");
  const policy = founderPolicyFromEnv();
  const seen = new Set<IntakeField>();
  for (const r of rows) {
    const f = founderIntake(r as never, policy);
    for (const k of f.supplied) {
      seen.add(k);
      if (INTAKE_SOURCE[k].supply === "withheld") {
        bad.push(`  founderIntake supplied ${k}, which INTAKE_SOURCE declares withheld`);
      }
    }
  }
  // Non-vacuity: a resolver that supplied NOTHING would pass every check above.
  if (seen.size < 3) bad.push(`  founderIntake supplied only ${seen.size} distinct field(s) over the whole set`);
  if (bad.length) {
    console.error("check_harness_intake: FAILED its own self-test:\n" + bad.join("\n"));
    process.exit(1);
  }
  console.log(`  self-test: ${cases.length} detector cases and ${rows.length.toLocaleString()} `
    + `resolver rows agree; ${seen.size} distinct fields actually supplied`);
}

function main(): void {
  selfTest();
  if (process.env.SELFTEST) {
    // Prove the guard can fail: run the real detector over a source that
    // reintroduces the exact defect, and require a non-empty verdict.
    const sabotage = `import { loadRecallSet } from "./recallSet";\n`
      + `computeVerdict("${ANONYMOUS_FOUNDER}", c, { ticketBand: "b500k_2m5", `
      + `sector: "other", consortium: "yes" }, { capitalSought: ["grant","loan"] });`;
    const found = inlinedKeys(sabotage);
    if (!replays(sabotage) || found.length !== 4) {
      console.error(`check_harness_intake: SELFTEST failed — the sabotage was not caught `
        + `(replay=${replays(sabotage)}, keys=${found.join(",")})`);
      process.exit(1);
    }
    console.log(`check_harness_intake: SELFTEST ok — the reintroduced literal is caught `
      + `on ${found.length} keys (${found.join(", ")}).`);
    return;
  }

  // The ratchet is a table of measurements, so it is regenerated rather than
  // maintained by hand: `DUMP=1 npx tsx scripts/check_harness_intake.ts`.
  if (process.env.DUMP) {
    for (const name of readdirSync(SCRIPTS).sort()) {
      if (!name.endsWith(".ts")) continue;
      const src = readFileSync(path.join(SCRIPTS, name), "utf8");
      if (!replays(src) || STRICT.has(name)) continue;
      const n = inlinedKeys(src).length;
      if (n) console.log(`  ${JSON.stringify(name)}: ${n},`);
    }
    return;
  }
  const failures: string[] = [];
  let checked = 0;
  for (const name of readdirSync(SCRIPTS).sort()) {
    if (!name.endsWith(".ts")) continue;
    const src = readFileSync(path.join(SCRIPTS, name), "utf8");
    if (!replays(src)) continue;
    checked++;
    const keys = inlinedKeys(src);
    const allowed = STRICT.has(name) ? 0 : (RATCHET[name] ?? 0);
    if (keys.length > allowed) {
      failures.push(`  ${name}: inlines ${keys.length} intake key(s) (${keys.join(", ")}), `
        + `allowed ${allowed}${STRICT.has(name) ? " — this harness's numbers are published" : ""}`);
    }
    if (STRICT.has(name) && !/from\s+["']\.\/founderIntake["']/.test(src)) {
      failures.push(`  ${name}: does not import founderIntake`);
    }
    if (keys.length < allowed) {
      failures.push(`  ${name}: RATCHET says ${allowed} but only ${keys.length} remain — `
        + `lower it to ${keys.length} in check_harness_intake.ts. A ratchet that lags `
        + `is a ratchet that lets the next one back in.`);
    }
  }
  if (!checked) {
    console.error("check_harness_intake: FAILED — found no replay harness at all. "
      + "Either the detector broke or the scripts moved; either way this guard was "
      + "about to pass by having nothing to read.");
    process.exit(1);
  }
  if (failures.length) {
    console.error(`\ncheck_harness_intake: FAILED on ${failures.length} harness(es):\n`
      + failures.join("\n"));
    console.error("\nA harness that writes its own intake is answering for the founder. "
      + "Build it from `founderIntake(row, policy)`, which declares — field by "
      + "field, with a leak argument — what a replayed founder may be told.");
    process.exit(1);
  }
  console.log(`check_harness_intake: ok — ${checked} replay harness(es), `
    + `${ASKABLE_FIELDS.length} askable intake fields, `
    + `${STRICT.size} held to zero inlined keys, `
    + `${Object.keys(RATCHET).length} ratcheted.`);
}

main();
