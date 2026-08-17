// A EURO FIGURE HANDED TO A MODEL SAYS WHAT IT IS A QUANTITY OF.
//
// FREE — reads the committed tree and two leaf modules. No model calls, no DB,
// no credentials, no network.
//
// ── The defect this closes ─────────────────────────────────────────────────
// The reasoning, the recorded quotes and the measurement are in
// `lib/intelligence/money.ts` beside the strings themselves. In one line: the
// writer's prompt printed the founder's stated amount, a curated programme
// band, a scheme's measured award median and a peer's channel lifetime total
// as four bare euro figures, and the model matched them — then named the first
// move on the match. That is the term `award_direction_wsHE` measured pointing
// the wrong way and removed from the SCORE, surviving one stage later in prose.
//
// ── THE PROPERTY ───────────────────────────────────────────────────────────
//
//   EVERY QUANTITY A PUBLISHED ROW RENDERS IS DECLARED: money with its basis,
//   everything else with what it counts instead.
//
// FINDING the quantities is a test over the VALUES a row actually renders,
// never a list of field names: `isQuantityValue` asks what the value is (a
// currency mark inside prose, or a bare number that is not a year and not a
// count of observations), so a field added to `InstitutionEntry` tomorrow is
// inside this rule with no edit here. That is the failure mode
// `buildInstitutions` already paid for once, where a hand-written mapping
// dropped six fields and nothing objected.
//
// DECIDING which of them are euros cannot be a test and is not one. Both
// `typicalAward: 4043400` and `gatesChecked: 7` are bare positive numbers;
// only a person knows. `ROW_QUANTITIES` is where they say so, and the build
// stops until they do.
//
// The fix when it fails is one entry, answering: is this money, and a quantity
// of what -- paid by whom to whom, over what span? Do NOT satisfy it by
// removing the figure from the prompt — a row the model cannot see the money
// on is the defect from the other side, and `rowNovelty` measured that the
// award median is what separates siblings in a run.
//
// ── AND NO RATE IN THE PROMPT, WHICH IS THE OTHER HALF ─────────────────────
// `check_prompt_rates.ts` forbids a frequency in `contracts/`, because those
// files are byte-identical on every request and every corpus, so a rate typed
// into one is wrong at some depth by construction. `money.ts` is assembled
// into the same prompt from the same kind of literal, and was outside that
// guard's tree. Its detector is imported here rather than reimplemented, and
// applied to these strings.
//
// ── It cannot pass by having nothing to read ──────────────────────────────
// The artifacts are committed rendered briefs. Non-vacuity floors below fail
// the check if the tree shrinks, moves or loses its rows, so a green line
// always means rows were examined.
//
//   npx tsx scripts/check_money_basis.ts
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";

// Destroyed rather than merely unused — the stronger of the two statements
// `check_env_loader` accepts.
delete process.env.DATABASE_URL;

import { AWARD_RELATION, askLine, isQuantityValue, MONEY_BASIS, moneyBasisBlock, ROW_QUANTITIES } from "../lib/intelligence/money";
// The row facts a model is HANDED are the row minus what it identifies itself
// by and minus what the model itself wrote. Both sets come from `rowNovelty`,
// which is where the prompt block gets them, so this check and the prompt
// cannot disagree about which fields are in evidence.
import { IDENTITY_AXES, WRITER_AXES } from "../lib/intelligence/rowNovelty";
import { ratesIn } from "./promptRates";

const FRONTEND = process.cwd();
const REPO = path.resolve(FRONTEND, "..", "..");

/** States in which this would pass while seeing nothing. */
const MIN_ROWS = 25;
const MIN_MONEY_AXES = 3;

/** Every committed JSON holding rendered brief rows. Found by SHAPE, not by a
 *  list of paths: a new recording is inside this check the day it lands. */
function renderedRows(): { file: string; row: Record<string, unknown> }[] {
  const out: { file: string; row: Record<string, unknown> }[] = [];
  const skip = new Set(["node_modules", ".git", ".next", ".claude", "public"]);
  const collect = (file: string, v: unknown): void => {
    if (Array.isArray(v)) { for (const x of v) collect(file, x); return; }
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const rows = o.institutions;
    if (Array.isArray(rows) && rows.some((r) => r && typeof r === "object" && "whyEligible" in r)) {
      for (const r of rows) if (r && typeof r === "object") out.push({ file, row: r as Record<string, unknown> });
    }
    for (const x of Object.values(o)) collect(file, x);
  };
  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      if (skip.has(e)) continue;
      const full = path.join(dir, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full, depth + 1); continue; }
      if (!/\.json$/.test(e)) continue;
      if (st.size > 4_000_000) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(readFileSync(full, "utf8")); } catch { continue; }
      collect(path.relative(REPO, full), parsed);
    }
  };
  walk(path.join(FRONTEND, "lib"), 0);
  walk(path.join(REPO, "project-mgmt"), 0);
  return out;
}

function main(): void {
  const problems: string[] = [];
  const rows = renderedRows();
  const undeclared = new Map<string, { file: string; value: unknown }>();
  const observed = new Set<string>();

  for (const { file, row } of rows) {
    for (const [axis, value] of Object.entries(row)) {
      if (IDENTITY_AXES.has(axis) || WRITER_AXES.has(axis)) continue;
      if (!isQuantityValue(axis, value)) continue;
      observed.add(axis);
      if (!ROW_QUANTITIES[axis] && !undeclared.has(axis)) undeclared.set(axis, { file, value });
    }
  }

  if (rows.length < MIN_ROWS) {
    problems.push(
      `only ${rows.length} rendered brief row(s) found (floor ${MIN_ROWS}). This check ` +
      `passes by examining rows; with none it asserts nothing. Restore the committed ` +
      `recordings, or lower the floor deliberately and say why.`);
  }
  const moneySeen = [...observed].filter((a) => ROW_QUANTITIES[a]?.money);
  if (moneySeen.length < MIN_MONEY_AXES) {
    problems.push(
      `only ${moneySeen.length} money-bearing field(s) seen (floor ${MIN_MONEY_AXES}). ` +
      `Either the rows lost their figures or isQuantityValue stopped recognising them.`);
  }
  for (const [axis, { file, value }] of undeclared) {
    problems.push(
      `"${axis}" renders a quantity (e.g. ${JSON.stringify(value).slice(0, 60)} in ${file}) ` +
      `and has no entry in ROW_QUANTITIES. Declare it: is it money, and a quantity ` +
      `OF what -- paid by whom to whom, over what span? If it is not money, say ` +
      `what it counts instead and it stays out of the prompt.`);
  }

  // The positive half. Deleting a basis would also satisfy a guard that only
  // forbids, so assert the block the writer receives still names them and
  // still carries the relationship.
  const block = moneyBasisBlock([...observed]);
  for (const axis of observed) {
    if (MONEY_BASIS[axis] && !block.includes(MONEY_BASIS[axis])) {
      problems.push(`the assembled money block omits the basis declared for "${axis}"`);
    }
  }
  if (!block.includes(AWARD_RELATION)) {
    problems.push("the assembled money block does not carry AWARD_RELATION, so the model is told what each figure is and nothing about how they relate");
  }

  // No rate in the strings assembled into the prompt, by the same detector
  // that guards `contracts/`.
  const promptText = [AWARD_RELATION, askLine("€500K – €2.5M"), ...Object.values(MONEY_BASIS)].join("\n\n");
  for (const hit of ratesIn("lib/intelligence/money.ts", promptText)) {
    problems.push(
      `money.ts states a rate ("${hit.sentence.slice(0, 90)}"). These strings are ` +
      `byte-identical on every request and corpus, so a frequency typed here is wrong ` +
      `at some depth by construction. State the direction; leave the figure in the finding.`);
  }

  // The two sites that print the founder's own amount to a model read ONE
  // label. Two that agree today is the defect this repo names most often.
  for (const rel of ["lib/intelligence/pipeline.ts", "lib/intelligence/knownFacts.ts"]) {
    const src = readFileSync(path.join(FRONTEND, rel), "utf8");
    if (!/\baskLine\(/.test(src)) {
      problems.push(`${rel} prints the founder's stated amount to a model but does not read askLine() from money.ts`);
    }
  }

  if (problems.length) {
    console.error(`check_money_basis: ${problems.length} problem(s)\n` +
      problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(
    `check_money_basis: ok — ${observed.size} quantity-bearing field(s) across ` +
    `${rows.length} rendered row(s), every one declared. Money, and labelled to ` +
    `the writer: ${moneySeen.sort().join(", ")}.`);
}

main();
