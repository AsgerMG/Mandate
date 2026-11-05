/**
 * THE STATE OF THE BUILD IS A FACT IN THE TREE, NOT A PAGE NOBODY CAN OPEN.
 *
 * ── The defect this closes ─────────────────────────────────────────────────
 * On 2026-08-18 thirteen of the fifty-nine checks `npm run check` runs were red
 * on main. Seven of them had been red since 2026-08-12 — 139 consecutive
 * commits on main, at the 20-commits-a-day rate this repo actually works at.
 * Three separate agents reported the fact that day, each as an aside while
 * doing something else, which is the tell that nothing was reporting it.
 *
 * The mechanism was not that the checks did not run. SIX of those seven run in
 * CI on every push to main, so CI had been red 139 times. The mechanism is that
 * the result had nowhere to land:
 *
 *   * the repository is private and no checkout in this project carries a
 *     GitHub token, so `gh run list` fails and the Actions API 404s. Not one
 *     agent in this repo can observe CI at all. The only channel is an email to
 *     the owner.
 *   * `npm run check` takes ~20 minutes and needs DATABASE_URL, so it is run at
 *     the end of a workstream, if at all.
 *   * a red that has been red for a week reads as the background colour, which
 *     is what the `accepted` block in data/guard_registry.json already says in
 *     its own `$why`: "a signal no branch can turn green is a signal people
 *     learn to step over".
 *
 * A result that reaches nobody is not a result. So the suite's own findings are
 * written into a committed file, and the fastest thing anybody in this repo
 * runs — `npx vitest run`, four seconds, in every agent's verification block
 * and in CI — refuses a tree whose findings are stale or unowned.
 *
 * ── The properties ─────────────────────────────────────────────────────────
 * COMPLETE     every check `run_checks.mjs` declares has an observation.
 * FRESH        no observation is older than MAX_OBSERVATION_AGE_DAYS. This is
 *              the "a red nobody has looked at is a build failure" property,
 *              and it is stated per CHECK rather than per RUN on purpose: a
 *              single stale row is cleared by `npm run check --only=<label>`,
 *              seconds of work, so the mechanism can never become a signal no
 *              branch can turn green. That failure mode is the one this repo
 *              has already paid for twice.
 * OWNED        a red observation needs an acceptance in the registry's
 *              `suite_accepted` block: a class, an owner, the date it went red,
 *              the failure it is bound to, and a review date. Anything else is
 *              "nobody has looked", which is the state being removed.
 * NOT OBSOLETE an acceptance over a check whose latest observation is GREEN
 *              fails. An acceptance that outlives what it accepted is
 *              pre-authorisation for the next regression under the same wording.
 * REACHABLE    an acceptance naming a check the suite does not run can never be
 *              read, so it is not an acceptance — it is a note that looks like
 *              one.
 *
 * ── Why the cap is seven days, and not a number somebody liked ─────────────
 * It is the measured length of the silence it exists to end. `git log` puts
 * 611 commits on main in the last 30 days across 26 active days; the seven
 * checks went red on 2026-08-12 and were still red on 2026-08-18. Seven days is
 * therefore not a target, it is the demonstrated failure — the longest this
 * repo has been shown to go without anybody looking. A cap set at the observed
 * failure is the weakest one that would have caught it.
 *
 * Hermetic: two committed JSON files and one source file. No credentials, no
 * network, no database, nothing gitignored.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  judgeAcceptance, entriesOf, days, RED_CLASS_MEANING,
  type Accepted, type RedClass,
} from "./acceptance";

/** The repository root. Four levels, because this module lives one deeper than
 *  the checks do (scripts/lib -> scripts -> frontend -> website -> root). */
export const ROOT = path.join(__dirname, "..", "..", "..", "..");
/** project-mgmt/, not data/: `data` is gitignored, and a record CI cannot
 *  read is the defect this file exists to remove, one level down. */
export const RECORD = path.join(ROOT, "project-mgmt", "check_status.json");
export const REGISTRY = path.join(ROOT, "data", "guard_registry.json");
export const RUNNER = path.join(ROOT, "website", "frontend", "scripts", "run_checks.mjs");

/** Measured, not chosen. See the header. */
export const MAX_OBSERVATION_AGE_DAYS = 7;

/** How long a red may be HELD, counted from the day it went red. Twice the
 *  observed silence: a hold that outlives the failure it is holding by more
 *  than the failure itself lasted is the silence with a date on it. */
export const MAX_HELD_DAYS = 14;

/** Non-vacuity for the parse below. The suite has been between 27 and 59 checks
 *  for its whole life; a parse that finds a handful found the wrong thing, and
 *  a guard that grades a suite of two is decoration. */
const MIN_SUITE_SIZE = 40;

export interface Observation {
  /** `run_checks.mjs`'s own label, which is what a reader sees in the summary. */
  label: string;
  /** The command, joined. Carried so a row still says what it ran after a
   *  label is reworded. */
  argv: string;
  code: number;
  /** The check's OWN last meaningful line. An acceptance is bound to this. */
  summary: string;
  /** ISO instant this observation was taken. */
  at: string;
  ms: number;
}

export interface Record_ {
  $why?: unknown;
  /** Every label `run_checks.mjs` declared at the time of the last full run. */
  suite: string[];
  observations: Record<string, Observation>;
}

/** The suite, read off the runner rather than restated. A second list of what
 *  the suite contains is the first list's next defect. */
export function suiteLabels(src = readFileSync(RUNNER, "utf8")): string[] {
  const block = src.slice(src.indexOf("const CHECKS = ["), src.indexOf("\n];", src.indexOf("const CHECKS = [")));
  // An entry is `["<label>", [ … ]]`, and it may wrap after the label. Anchored
  // at two-space indentation so the ARGV array's own first string — which sits
  // four spaces in on a wrapped entry, and is "npx" or "python3" — is not read
  // as a label. That is the parse this check exists to be sure of: it found 61
  // where the suite ran 59, and both extras were argv heads.
  const all = [...new Set(
    [...block.matchAll(/^ {2}\["([^"]+)",/gm)].map((m) => m[1]),
  )];
  if (all.length < MIN_SUITE_SIZE) {
    throw new Error(
      `suiteLabels parsed only ${all.length} check(s) out of run_checks.mjs, under the `
      + `floor of ${MIN_SUITE_SIZE}. The parse, not the suite, is what changed — a guard `
      + `that grades a suite of ${all.length} is decoration.`);
  }
  return all;
}

export function loadRecord(file = RECORD): Record_ | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Record_;
}

export function loadAccepted(file = REGISTRY): Record<string, Accepted> {
  const reg = JSON.parse(readFileSync(file, "utf8")) as
    { suite_accepted?: Record<string, unknown> };
  return entriesOf<Accepted>(reg.suite_accepted);
}

/** WHO EXPERIENCES THIS FAILURE — a `founder` red fails the build, a `report`
 *  red is recorded and printed and fails nothing. See the block's own `$why`
 *  in data/guard_registry.json for the argument and for why `protects` is
 *  prose rather than a category. */
export type Tier = "founder" | "report";
export interface TierDecl {
  tier: Tier;
  protects: string;
  /** REFLEXIVE: this row's value is produced by the very command that reads it.
   *
   *  `unit tests` hosts check_red_debt.test.ts and `a red check is owned` IS
   *  check_red_debt. Judging their recorded outcome is reading your own echo,
   *  and it LATCHES: a failing test writes `unit tests: red`, the next run
   *  reads that row, fails on it, and writes it again — a loop with no exit
   *  that does not depend on anything being wrong. Observed on 2026-08-18, one
   *  run after the mechanism was built.
   *
   *  So freshness and tiering still apply to these rows — a stale one is still
   *  stale — and the OWNED clause does not. Nothing is lost: if vitest is
   *  failing you are looking at vitest failing. */
  reflexive?: boolean;
}

export function loadTiers(file = REGISTRY): Record<string, TierDecl> {
  const reg = JSON.parse(readFileSync(file, "utf8")) as
    { suite_tiers?: Record<string, unknown> };
  return entriesOf<TierDecl>(reg.suite_tiers);
}

export interface Problem { label: string; why: string }
export interface Held { label: string; cls: RedClass; why: string }

export interface Judgement {
  problems: Problem[];
  held: Held[];
  /** RED, and on a check nobody is harmed by today. Printed in full on every
   *  run and recorded; it fails nothing. See `suite_tiers.$why`. */
  reported: { label: string; protects: string; summary: string }[];
  green: string[];
  /** Every label observed, with the age of its observation in days. */
  ages: { label: string; days: number }[];
}

/**
 * The whole property, in one function, so there is one place it can mean
 * something. Pure: everything it reads is an argument.
 */
export function judgeSuite(
  suite: string[],
  record: Record_ | null,
  accepted: Record<string, Accepted>,
  now: number,
  tiers: Record<string, TierDecl> = {},
  maxAgeDays = MAX_OBSERVATION_AGE_DAYS,
): Judgement {
  const problems: Problem[] = [];
  const held: Held[] = [];
  const reported: Judgement["reported"] = [];
  const green: string[] = [];
  const ages: { label: string; days: number }[] = [];

  if (!record) {
    problems.push({
      label: "(the record)",
      why: `${path.relative(ROOT, RECORD)} does not exist. Nothing in this tree says what `
        + `the check suite last found, which is the state this file exists to remove.\n`
        + `      Run: cd website/frontend && npm run check`,
    });
    return { problems, held, reported, green, ages };
  }

  const obs = record.observations ?? {};

  for (const label of suite) {
    // A check with no tier has never answered the question the tier block
    // exists to force: who is hurt when this fails? Refusing it here is what
    // stops the suite growing another forty-nine checks nobody costed.
    const t = tiers[label];
    if (Object.keys(tiers).length && !t) {
      problems.push({
        label,
        why: `declares no tier. data/guard_registry.json -> suite_tiers must say who `
          + `experiences this failure: \`founder\` (a person is handed something wrong, `
          + `and it fails the build) or \`report\` (true, nobody is harmed today, `
          + `recorded and printed and fails nothing) — with one sentence of \`protects\` `
          + `naming what that person would experience.`,
      });
      continue;
    }
    if (t && !t.protects?.trim()) {
      problems.push({
        label,
        why: `declares tier ${JSON.stringify(t.tier)} and no \`protects\` sentence. The `
          + `sentence is the work: a tier you cannot justify in one line is a check that `
          + `should not be failing a build.`,
      });
      continue;
    }

    const o = obs[label];
    if (!o) {
      problems.push({
        label,
        why: `never observed. ${path.relative(ROOT, RECORD)} carries no result for it, so `
          + `nothing in this tree knows whether it passes.\n`
          + `      Run: cd website/frontend && npm run check --only=${JSON.stringify(label)}`,
      });
      continue;
    }
    const age = days(now, Date.parse(o.at));
    ages.push({ label, days: age });
    if (Number.isNaN(age)) {
      problems.push({ label, why: `its observation has an unreadable timestamp ${JSON.stringify(o.at)}.` });
      continue;
    }
    if (age > maxAgeDays) {
      problems.push({
        label,
        why: `last observed ${age.toFixed(1)} days ago, past the ${maxAgeDays}-day cap. `
          + `Nobody has looked at it since.\n`
          + `      Run: cd website/frontend && npm run check --only=${JSON.stringify(label)}`,
      });
      continue;
    }

    if (o.code !== 0 && t?.reflexive) {
      reported.push({
        label,
        protects: t.protects,
        summary: `${o.summary}   [reflexive — this row is written by the command that `
          + `reads it, so it is not judged here; the failure is in front of you]`,
      });
      continue;
    }

    const a = accepted[label];
    if (o.code !== 0 && t && t.tier === "report") {
      reported.push({ label, protects: t.protects, summary: o.summary });
      // A report-tier red is never held, so an acceptance over one can never be
      // read. The TIER is the decision — `protects` already says what it
      // watches and who reads it — and a second, expiring decision beside it
      // would be a note that looks like an acceptance.
      if (accepted[label]) {
        problems.push({
          label,
          why: `is report-tier, and data/guard_registry.json also accepts a failure of `
            + `it. A report-tier red is never held, so that entry can never be read. The `
            + `tier IS the decision; delete the acceptance, or make the check `
            + `founder-tier and mean it.`,
        });
      }
      continue;
    }
    if (o.code === 0) {
      green.push(label);
      if (a) {
        problems.push({
          label,
          why: `is GREEN, and data/guard_registry.json still accepts a failure of it:\n`
            + `      /${a.failure}/\n`
            + `      An acceptance that outlives the thing it accepted is pre-authorisation `
            + `for the next regression under the same wording. Delete the entry.`,
        });
      }
      continue;
    }

    const v = judgeAcceptance({ id: label, entry: a, summary: o.summary, now,
                                maxHeldDays: MAX_HELD_DAYS });
    if (!v) {
      problems.push({
        label,
        why: `is RED and NOBODY HAS LOOKED. It exited ${o.code} and said:\n`
          + `      ${o.summary || "(no summary)"}\n`
          + `      Fix it, or write it down: data/guard_registry.json -> suite_accepted, `
          + `with a class (defect / guard / corpus-state), an owner, the date it went red, `
          + `the failure it is bound to, and a review date.`,
      });
      continue;
    }
    if (v.void) { problems.push({ label, why: v.void }); continue; }
    held.push({ label, cls: a.class as RedClass, why: v.held! });
  }

  // An acceptance the suite can never reach is a note that looks like one.
  const known = new Set(suite);
  for (const label of Object.keys(accepted)) {
    if (!known.has(label)) {
      problems.push({
        label,
        why: `data/guard_registry.json accepts a failure of ${JSON.stringify(label)}, and `
          + `run_checks.mjs runs no such check. Nothing would ever read it.`,
      });
    }
  }

  return { problems, held, reported, green, ages };
}

/** The report, shared by the CLI and by the runner's own summary so the two
 *  cannot describe the same tree differently. */
export function report(j: Judgement): string {
  const out: string[] = [];
  if (j.reported.length) {
    out.push(`  ${j.reported.length} report-tier check(s) RED — recorded, not a build failure:`);
    for (const r of j.reported) {
      out.push(`    ${r.label}`);
      out.push(`      ${r.summary}`);
      out.push(`      watches: ${r.protects}`);
    }
    out.push("");
  }
  if (j.held.length) {
    out.push(`  ${j.held.length} red check(s) HELD — decided, owned, and dated:`);
    for (const h of j.held) {
      out.push(`    ${h.label}  [${h.cls}] ${RED_CLASS_MEANING[h.cls] ?? ""}`);
      out.push(`      ${h.why}`);
    }
    out.push("");
  }
  if (j.problems.length) {
    out.push(`  ${j.problems.length} problem(s):`);
    for (const p of j.problems) out.push(`    ${p.label}: ${p.why}`);
  }
  return out.join("\n");
}
