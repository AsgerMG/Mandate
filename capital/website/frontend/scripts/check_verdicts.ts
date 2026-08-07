// Did the guards that need credentials actually run, on this code?
//
// ── The gap this closes ────────────────────────────────────────────────────
// Nine of seventeen checks were in no automatic path. CI does not run
// `npm run check`, and deliberately has no DATABASE_URL — so the ones that need
// the corpus would skip themselves even if it did. `check_recall_floor` is the
// sharpest case: it prints SKIPPED and exits 0, which means every ranking
// change this repo has ever merged went in with the floors never evaluated,
// under a green tick.
//
// The proposed fix was a DATABASE_URL secret in GitHub Actions. That widens the
// blast radius of one compromised workflow from "can read our code" to "can read
// and write every award, company and fund we hold", which is a bad trade for a
// green tick. So the guards run where their data already is and publish a
// verdict (ETL/lib/guard_verdicts.py, scripts/guardVerdict.ts), and this asserts
// against those verdicts over plain HTTPS with no credential of any kind.
//
// ── A verdict is a claim about a MOMENT ────────────────────────────────────
// Which is the whole difficulty: it goes stale, and the mechanism is worthless
// if a stale verdict reads the same as a fresh one. The four ways that happens
// are the four `check_corpus_census.ts` already named, reused rather than
// reinvented:
//
//   SILENT    no verdict at all, or none within the cadence the verdicts
//             themselves establish. The publisher has stopped. This is the
//             failure that looks exactly like success.
//   STALE     the verdict predates the corpus it describes — the weekly run
//             published a census but this guard's verdict is older than it, so
//             it did not run this week even though the run happened.
//   DEGRADED  the verdict says the guard failed.
//   DRIFTED   the verdict was produced against different code from this
//             checkout. For a `weekly` guard that means the Railway container
//             is not running what is committed; for an `on_change` guard it is
//             the entire enforcement mechanism — change the ranker and merge
//             without re-running the floors, and this goes red.
//
// ── Two modes, and why age is not enforced in both ─────────────────────────
//   default   DEGRADED and DRIFTED and "never published". Run on every PR. It
//             never fails for the passage of time, so it cannot go red on a
//             Monday for a branch that did nothing wrong.
//   --full    the above plus SILENT and STALE. Run by the weekly workflow and
//             by `npm run check`, which is where "the cron has stopped" belongs.
//
// Both are credential-free.
//
//   npx tsx scripts/check_verdicts.ts
//   npx tsx scripts/check_verdicts.ts --full
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..", "..");
const REGISTRY = path.join(ROOT, "data", "guard_registry.json");
const RUNNER = path.join(ROOT, "ETL", "lib", "guard_verdicts.py");

interface Spec {
  id: string; cadence: "weekly" | "on_change"; code: string[];
  refresh: string; needs: string[]; why: string;
}
interface Row {
  status: string; takenAt: string; producedBy: string;
  codeFingerprint: string; summary: string; metrics: Record<string, unknown>;
}

const reg = JSON.parse(readFileSync(REGISTRY, "utf8")) as
  { feed: { url: string }; guards: Spec[] };
const FEED = process.env.GUARD_FEED_URL || reg.feed.url;
const FULL = process.argv.includes("--full");

/** Before there is history to measure, the ETL cadence is weekly and two missed
 *  cycles is unambiguous. Only for the cold start — once three verdicts exist
 *  the limit comes from their actual spacing, so a change of cadence needs no
 *  edit here. Same derivation as check_corpus_census.ts, for the same reason. */
const COLD_START_MAX_AGE_DAYS = 15;

/** The feed is one HTTP call to the site the product runs on. A single blip
 *  must not red a build, and a site that is genuinely down IS worth failing on,
 *  so: retried, then fatal. */
async function fetchFeed(): Promise<Record<string, Row[]>> {
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(FEED, { headers: { accept: "application/json" } });
      if (!res.ok) {
        last = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
      } else {
        return ((await res.json()) as { guards: Record<string, Row[]> }).guards ?? {};
      }
    } catch (err) {
      last = String(err);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  console.error(`check_verdicts: FAILED — could not read the verdict feed at\n  ${FEED}\n  ${last}`);
  console.error("\n  This is the only channel between the guards that hold credentials");
  console.error("  and anything that does not. Treating an unreachable feed as 'no news'");
  console.error("  would make every guard below pass by default, which is the exact");
  console.error("  defect the channel exists to remove.");
  process.exit(1);
}

/** This checkout's hash for a guard, from the one implementation. */
function localFingerprint(id: string): string | null {
  try {
    return execFileSync("python3", [RUNNER, "fingerprint", id],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

const days = (a: number, b: number) => (a - b) / 86_400_000;

/** The limit derived from how often this guard's verdicts actually arrive. */
function ageLimit(rows: Row[]): { limit: number; basis: string } {
  const scheduled = rows.filter((r) => r.producedBy !== "local");
  if (scheduled.length < 3) {
    return { limit: COLD_START_MAX_AGE_DAYS,
             basis: `cold start, ${scheduled.length} scheduled verdict(s) so far` };
  }
  const gaps: number[] = [];
  for (let i = 1; i < scheduled.length; i++) {
    gaps.push(days(Date.parse(scheduled[i - 1].takenAt), Date.parse(scheduled[i].takenAt)));
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return { limit: 2.5 * median,
           basis: `2.5 × the observed ${median.toFixed(1)}d cadence of the scheduled runs` };
}

async function main() {
  const feed = await fetchFeed();
  const problems: string[] = [];
  const now = Date.now();

  // The newest census dates the corpus everything weekly is judged against.
  const newestCensus = feed["census"]?.[0]
    ? Date.parse(feed["census"][0].takenAt) : null;

  for (const g of reg.guards) {
    const rows = feed[g.id] ?? [];
    const latest = rows[0];
    const mine = localFingerprint(g.id);

    if (!latest) {
      problems.push(
        `SILENT — ${g.id} has never published a verdict.\n` +
        `      ${g.why}\n` +
        `      It has therefore never run anywhere that anything can see. Fix:\n` +
        `        ${g.refresh}`);
      continue;
    }

    const age = days(now, Date.parse(latest.takenAt));
    const line = `  ${g.id.padEnd(24)} ${latest.status.padEnd(7)} ` +
      `${age.toFixed(1)}d old  code ${latest.codeFingerprint}  by ${latest.producedBy}` +
      (latest.summary ? `\n${" ".repeat(28)}${latest.summary}` : "");
    console.log(line);

    if (latest.status !== "ok") {
      problems.push(
        `DEGRADED — ${g.id} last reported ${latest.status}:\n` +
        `        ${latest.summary || "(no summary)"}\n` +
        `      Taken ${latest.takenAt.slice(0, 16)}Z by ${latest.producedBy}. The guard\n` +
        `      is not the problem; what it guards is. Re-run to see the full output:\n` +
        `        ${g.refresh}`);
    }

    // DRIFTED. A verdict is a true statement about the code it judged; if that
    // is not the code here, it is not a statement about what we are shipping.
    if (mine === null) {
      problems.push(
        `check_verdicts cannot fingerprint ${g.id} — python3 is not runnable here.\n` +
        `      Without it every verdict below would be accepted on trust, so this\n` +
        `      is a failure rather than a skip.`);
    } else if (mine !== latest.codeFingerprint) {
      const what = g.cadence === "weekly"
        ? `The scheduled ETL is not running the code in this repository. It has no\n` +
          `      repo trigger; only \`railway up\` redeploys it:\n` +
          `        python3 ETL/lib/verify_cron.py --deploy`
        : `The code this guard judges has changed since it last ran, so its verdict\n` +
          `      does not cover what is about to ship. Re-run it where the credentials\n` +
          `      are (it publishes its own verdict):\n` +
          `        ${g.refresh}`;
      problems.push(
        `DRIFTED — ${g.id} was judged at code ${latest.codeFingerprint}, this checkout ` +
        `is ${mine}.\n      Bound to: ${g.code.join(", ")}\n      ${what}`);
    }

    if (!FULL) continue;

    // ── Freshness, only in --full ──────────────────────────────────────────
    if (g.cadence === "weekly") {
      const { limit, basis } = ageLimit(rows);
      if (age > limit) {
        problems.push(
          `SILENT — ${g.id}'s newest verdict is ${age.toFixed(1)} days old, past a limit ` +
          `of ${limit.toFixed(1)}d\n      (${basis}). The weekly run has stopped, or it is no ` +
          `longer publishing.\n      That is the failure that reads as success: the last run's ` +
          `logs still\n      end in ALL STEPS COMPLETE. Check it: make verify-cron`);
      }
      // A run happened — the census says so — and this guard did not publish in
      // it. The cron completed with a step missing, which no age limit catches
      // because the guard's own last verdict may still be inside the window.
      if (newestCensus !== null && g.id !== "census") {
        const behind = days(newestCensus, Date.parse(latest.takenAt));
        if (behind > 0.5) {
          problems.push(
            `STALE — ${g.id}'s verdict is ${behind.toFixed(1)} days older than the newest ` +
            `census.\n      The weekly run published a census without publishing this, so the ` +
            `step\n      is missing from the cron or it failed before reaching it:\n` +
            `        ETL/events/extract/railway_cron.py`);
        }
      }
    }
  }

  console.log(`\n  feed ${FEED}`);
  console.log(`  ${reg.guards.length} guard(s) registered, mode ${FULL ? "--full" : "on-change"}`);

  if (problems.length) {
    console.error("\ncheck_verdicts: FAILED\n");
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error("  These guards need a corpus that CI is not allowed to see, so they run");
    console.error("  where the data is and publish what they found. A verdict that is");
    console.error("  missing, old, red, or bound to different code is not a pass.");
    process.exit(1);
  }
  console.log("check_verdicts: ok — every registered guard has a green verdict, " +
              "taken on this code" + (FULL ? ", within its cadence." : "."));
}

main().catch((err) => {
  console.error("check_verdicts: FAILED to run —", err);
  process.exit(1);
});
