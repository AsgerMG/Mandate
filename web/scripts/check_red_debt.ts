/**
 * A RED CHECK IS OWNED AND DATED, OR THE BUILD FAILS.
 *
 * FREE, HERMETIC, sub-second: three committed files — `project-mgmt/check_status.json`,
 * `data/guard_registry.json` and `scripts/run_checks.mjs`. No credentials, no
 * network, no database, nothing gitignored. The property and the argument for
 * every clause are in `scripts/lib/suiteStatus.ts`; this is the command line.
 *
 * It runs in three places, deliberately:
 *
 *   npx vitest run            through scripts/check_red_debt.test.ts. THE ONE
 *                             THAT MATTERS — four seconds, in every agent's
 *                             verification block, and the only command in this
 *                             repo that is genuinely always run.
 *   npm run check             first, before anything slow, so a stale tree says
 *                             so in two seconds rather than in twelve minutes.
 *   CI                        on every push and pull request.
 *
 *   npx tsx scripts/check_red_debt.ts
 *   npx tsx scripts/check_red_debt.ts --self-test   prove it can fail
 */
import {
  loadAccepted, loadRecord, loadTiers, judgeSuite, report, suiteLabels,
  MAX_OBSERVATION_AGE_DAYS, MAX_HELD_DAYS, RECORD, ROOT,
} from "./lib/suiteStatus";
import { selfTest } from "./lib/suiteStatus.selftest";
import path from "node:path";

function main(): void {
  if (process.argv.includes("--self-test")) { selfTest(); return; }
  selfTest();

  const suite = suiteLabels();
  const record = loadRecord();
  const accepted = loadAccepted();
  const tiers = loadTiers();
  const j = judgeSuite(suite, record, accepted, Date.now(), tiers);

  const n = j.ages.length;
  const oldest = j.ages.length
    ? j.ages.reduce((a, b) => (a.days > b.days ? a : b))
    : null;
  const founder = Object.values(tiers).filter((t) => t.tier === "founder").length;
  console.log(
    `check_red_debt: ${suite.length} check(s) in the suite — ${founder} founder-tier `
    + `(a red fails the build), ${Object.keys(tiers).length - founder} report-tier `
    + `(a red is recorded and printed).`);
  console.log(
    `  ${n} observed, ${j.green.length} green, ${j.held.length} red and held, `
    + `${j.reported.length} red and reported, ${j.problems.length} problem(s).`);
  if (oldest) {
    console.log(
      `  oldest observation ${oldest.days.toFixed(1)}d (${oldest.label}), `
      + `cap ${MAX_OBSERVATION_AGE_DAYS}d; a hold may run ${MAX_HELD_DAYS}d from the `
      + `day it went red.`);
  }

  const text = report(j);
  if (text) console.log(text);

  if (j.problems.length) {
    console.error(
      `\ncheck_red_debt: FAILED — ${j.problems.length} problem(s) above.\n`
      + `  ${path.relative(ROOT, RECORD)} is what this tree knows about its own build.\n`
      + `  Refresh one row:   cd web && npm run check --only="<label>"\n`
      + `  Refresh all:       cd web && npm run check\n`
      + `  Own a red:         data/guard_registry.json -> suite_accepted`);
    process.exit(1);
  }
  console.log("check_red_debt: ok — every check is observed, fresh, and green or owned.");
}

main();
