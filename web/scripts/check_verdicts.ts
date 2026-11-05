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
//   STALE     the verdict predates the corpus it describes. The census dates
//             the corpus, so a verdict about the corpus taken before the
//             newest census is a statement about a corpus we no longer hold.
//   DEGRADED  the verdict says the guard failed — unless the registry's
//             `accepted` block holds that exact failure, unexpired. See below.
//   DRIFTED   the verdict was produced against different code from this
//             checkout. For a `weekly` guard that means the Railway container
//             is not running what is committed; for an `on_change` guard it is
//             the entire enforcement mechanism — change the ranker and merge
//             without re-running the floors, and this goes red.
//
// ── The hole STALE had, and why it was the whole mechanism's hole ──────────
// STALE was asked only of `weekly` guards. That left the four `on_change` ones
// resting entirely on DRIFTED — their verdict is bound to a hash of the code
// they judge, so changing the ranker re-runs the floors. Which is right, and
// is not enough, because THREE OF THE FOUR DO NOT JUDGE CODE. corpus_currency,
// hydration_parity and degradation each ask a question about live Postgres:
// does the committed snapshot still agree with the register, would a founder
// be shown a fund that has closed. A fund closing changes every one of those
// answers and changes not one byte of any fingerprinted file. So a green
// verdict from six months ago covered today's corpus forever, and the guard
// that was in no automatic path before this workstream would have gone back
// into one — a guard that cannot go red is the thing we set out to remove.
//
// So STALE is now asked of every guard that READS THE CORPUS, whatever its
// cadence, derived from the registry's `needs` rather than from a list. The
// property is: A VERDICT ABOUT THE CORPUS IS VOID WHEN THE CORPUS MOVES.
//
// That also supplies the clock the on_change guards had no other way to get.
// They cannot run on a schedule anywhere: the Railway container is
// python:3.11-slim with no Node and no frontend modules, and CI must never
// hold DATABASE_URL. But the weekly cron publishes a census, and a census that
// moves past these verdicts turns them red in the next Sunday workflow. The
// schedule is borrowed rather than built, and no secret went anywhere.
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
// ── FAILING, versus failing for a reason somebody has accepted ─────────────
// This file is the READOUT of the guards that hold credentials, so the instinct
// is that it must be red whenever any of them is: a dashboard that reports green
// over a red input is the defect the whole channel exists to remove.
//
// That instinct is right about the FACT and wrong about the SIGNAL. On
// 2026-08-12 three guards were red for reasons already diagnosed, written down,
// and routed to a person — and this file reported those same three facts a
// second time, which made `npm run check` red for every branch in the
// repository, including branches that touched nothing any of them watches. A
// signal no branch can turn green is a signal people learn to step over, and
// then it stops catching the fourth guard, the one nobody had looked at. The
// repo has already paid for that lesson twice: `check_hydration_parity` says in
// its own header that a guard failing for a reason its subject cannot fix is how
// a guard gets muted, and `run_checks.mjs` exists because a red link hid
// thirteen checks behind it.
//
// So the readout distinguishes the two, and the distinction is carried by
// `accepted` in data/guard_registry.json — the block that already exists there
// for guards a human has to type, in the same shape, for the same reason. What
// keeps it from being a mute button is that an acceptance is bound to a specific
// FAILURE (a regex the summary must match), covers DEGRADED only, expires on a
// review date, and fails the build once the guard it covers goes green. Every
// one of those is enforced in `acceptance()` below; the argument for each is in
// the registry beside the entries.
//
//   npx tsx scripts/check_verdicts.ts
//   npx tsx scripts/check_verdicts.ts --full
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MIN_DERIVED_CADENCE_DAYS, isScheduledProducer } from "./guardVerdict";

const ROOT = path.join(__dirname, "..", "..", "capital");
const REGISTRY = path.join(ROOT, "data", "guard_registry.json");
const RUNNER = path.join(ROOT, "ETL", "lib", "guard_verdicts.py");

interface Spec {
  id: string; cadence: "weekly" | "on_change"; code: string[];
  refresh: string; needs: string[]; why: string;
}
/** One entry of the registry's `accepted` block. See its `$why` for the rules;
 *  they are enforced in `acceptance()` below and nowhere else. */
interface Accepted { reason: string; failure: string; review: string }
interface Row {
  status: string; takenAt: string; producedBy: string;
  codeFingerprint: string; summary: string; metrics: Record<string, unknown>;
}

const reg = JSON.parse(readFileSync(REGISTRY, "utf8")) as
  { feed: { url: string }; guards: Spec[]; accepted?: Record<string, unknown> };
/** The `accepted` block, minus the `$`-prefixed prose keys the registry uses
 *  throughout to carry its own reasoning. Same convention as `__`-prefixed keys
 *  in the verdict dumps: documentation is never data. */
const ACCEPTED: Record<string, Accepted> = Object.fromEntries(
  Object.entries(reg.accepted ?? {}).filter(([k]) => !k.startsWith("$")),
) as Record<string, Accepted>;
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
  const scheduled = rows.filter((r) => isScheduledProducer(r.producedBy));
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
  if (median < MIN_DERIVED_CADENCE_DAYS) {
    return { limit: COLD_START_MAX_AGE_DAYS,
             basis: `observed spacing is ${median.toFixed(2)}d — a burst, not a cadence, `
                  + `so the cold-start limit stands` };
  }
  return { limit: 2.5 * median,
           basis: `2.5 × the observed ${median.toFixed(1)}d cadence of the scheduled runs` };
}

/**
 * Does this guard's answer depend on the corpus, rather than only on code?
 *
 * Read off the registry's `needs` rather than listed, because a list is what
 * goes stale the first time a guard gains a database. A guard that names a
 * credential for a store, or the ETL corpus itself, is answering a question
 * about DATA — and data moves without any file changing, which is exactly what
 * the code fingerprint cannot see.
 */
function readsCorpus(g: Spec): boolean {
  return g.needs.some((n) => /DATABASE_URL|corpus/i.test(n));
}

/**
 * Has somebody already decided about THIS failure of THIS guard?
 *
 * Returns the reason to print when the failure is held, or a problem string
 * when an acceptance exists and does not apply — never a bare `false`, because
 * "the acceptance did not apply" is itself something the reader has to be told
 * or the block becomes a place entries go to be forgotten.
 *
 * The three bindings and the argument for each are in the registry's `accepted`
 * `$why`. Enforced here, in the one reader: an acceptance that is interpreted in
 * two places is an acceptance that means two things.
 */
function acceptance(id: string, latest: Row, now: number):
    { held: string } | { void: string } | null {
  const a = ACCEPTED[id];
  if (!a) return null;
  const shape = ["reason", "failure", "review"].filter((k) => !a[k as keyof Accepted]);
  if (shape.length) {
    return { void: `the acceptance for ${id} is missing ${shape.join(", ")}. An accepted ` +
      `failure with no ${shape[0]} is a mute button, so it does not apply.` };
  }
  const left = days(Date.parse(`${a.review}T00:00:00Z`), now);
  if (Number.isNaN(left)) {
    return { void: `the acceptance for ${id} has an unreadable review date ` +
      `(${JSON.stringify(a.review)}); it does not apply.` };
  }
  if (left <= 0) {
    return { void: `the acceptance for ${id} EXPIRED on ${a.review}. The reason it ` +
      `recorded was:\n        ${a.reason}\n      Re-examine it and either fix the guard ` +
      `or set a new review date, deliberately.` };
  }
  // The failure is accepted, not the guard. A guard that has started failing a
  // different way is a new fact and must reach a person.
  let matches: boolean;
  try {
    matches = new RegExp(a.failure).test(latest.summary ?? "");
  } catch (err) {
    return { void: `the acceptance for ${id} carries an unusable \`failure\` pattern ` +
      `${JSON.stringify(a.failure)} (${err}); it does not apply.` };
  }
  if (!matches) {
    return { void: `${id} is failing, an acceptance exists, and it does NOT cover this ` +
      `failure.\n      accepted:  /${a.failure}/\n      reported:  ` +
      `${latest.summary || "(no summary)"}\n      The guard has started failing a ` +
      `different way, which is a new fact nobody has decided about.` };
  }
  return { held: `${a.reason}\n      Accepted until ${a.review} (${left.toFixed(0)} day(s) left).` };
}

async function main() {
  const feed = await fetchFeed();
  const problems: string[] = [];
  /** Failures somebody has already decided about. Printed in full, every run —
   *  an acceptance that is not visible is indistinguishable from a check that
   *  never looked. */
  const accepted: string[] = [];
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

    // DEGRADED is the one status an acceptance may cover: the guard RAN, on this
    // corpus and this code, and reported what it found. The other three say the
    // reader does not know what the guard would find, and not knowing is what
    // this whole channel exists to remove — so they are checked below with no
    // reference to the block at all.
    const acc = latest.status === "ok" ? null : acceptance(g.id, latest, now);
    if (acc && "held" in acc) {
      accepted.push(`${g.id} — ${latest.status}: ${latest.summary || "(no summary)"}\n` +
        `      ${acc.held}`);
    } else if (latest.status !== "ok") {
      problems.push(
        `DEGRADED — ${g.id} last reported ${latest.status}:\n` +
        `        ${latest.summary || "(no summary)"}\n` +
        `      Taken ${latest.takenAt.slice(0, 16)}Z by ${latest.producedBy}. The guard\n` +
        `      is not the problem; what it guards is. Re-run to see the full output:\n` +
        `        ${g.refresh}` +
        (acc ? `\n      NOTE: ${acc.void}` : ""));
    } else if (ACCEPTED[g.id]) {
      // Green, with an acceptance still standing over it. Left alone, that entry
      // silently pre-authorises the next failure whose summary happens to match.
      problems.push(
        `OBSOLETE ACCEPTANCE — ${g.id} is green, and data/guard_registry.json still ` +
        `accepts\n      a failure of it: /${ACCEPTED[g.id].failure}/\n` +
        `      An acceptance that outlives the thing it accepted is pre-authorisation\n` +
        `      for the next regression under the same wording. Delete the entry.`);
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
    // SILENT is about a PUBLISHER that has stopped, so it is asked only of the
    // guards that have a publisher on a clock. An on_change guard is published
    // by a credentialled run and has no cadence to be late against; holding it
    // to one would red a branch for the passage of a Sunday.
    if (g.cadence === "weekly") {
      const { limit, basis } = ageLimit(rows);
      if (age > limit) {
        problems.push(
          `SILENT — ${g.id}'s newest verdict is ${age.toFixed(1)} days old, past a limit ` +
          `of ${limit.toFixed(1)}d\n      (${basis}). The weekly run has stopped, or it is no ` +
          `longer publishing.\n      That is the failure that reads as success: the last run's ` +
          `logs still\n      end in ALL STEPS COMPLETE. Check it: make verify-cron`);
      }
    }

    // STALE is about the CORPUS having moved out from under a verdict, so it is
    // asked of every guard whose answer depends on the corpus — weekly or not.
    // The census dates the corpus; a verdict older than it describes a corpus
    // we no longer hold. For a weekly guard that means the cron published a
    // census with a step missing. For an on_change guard it means the funds
    // changed and nobody re-ran the guard that watches them — the case that had
    // no failure mode at all, because no fingerprinted file moves when a call
    // closes.
    if (newestCensus !== null && g.id !== "census" && readsCorpus(g)) {
      const behind = days(newestCensus, Date.parse(latest.takenAt));
      if (behind > 0.5) {
        problems.push(
          `STALE — ${g.id}'s verdict is ${behind.toFixed(1)} days older than the newest ` +
          `census.\n      ${g.why}\n` +
          (g.cadence === "weekly"
            ? `      The weekly run published a census without publishing this, so the step\n` +
              `      is missing from the cron or it failed before reaching it:\n` +
              `        ETL/events/extract/railway_cron.py`
            : `      The corpus has moved since this guard last looked at it, and this guard\n` +
              `      reads the corpus — so its verdict is about funds we no longer hold. No\n` +
              `      code changed, which is why the fingerprint still matches and why this\n` +
              `      is the only thing that can catch it. Re-run it where the credentials\n` +
              `      are (it publishes its own verdict):\n` +
              `        ${g.refresh}`));
      }
    }
  }

  // An acceptance for a guard that is not registered can never be reached, so it
  // is not an acceptance — it is a note that looks like one, and it will look
  // like one for as long as nobody types the id it was meant to hold.
  for (const id of Object.keys(ACCEPTED)) {
    if (!reg.guards.some((g) => g.id === id)) {
      problems.push(
        `UNREACHABLE ACCEPTANCE — data/guard_registry.json accepts a failure of ` +
        `'${id}',\n      which is not a registered guard. Nothing will ever read it, so ` +
        `whatever\n      it was written to hold is unheld.`);
    }
  }

  console.log(`\n  feed ${FEED}`);
  console.log(`  ${reg.guards.length} guard(s) registered, mode ${FULL ? "--full" : "on-change"}`);

  if (accepted.length) {
    console.log(`\n  ${accepted.length} failure(s) held under data/guard_registry.json ` +
                `\`accepted\` — decided, not fixed:`);
    for (const a of accepted) console.log(`  - ${a}\n`);
  }

  if (problems.length) {
    console.error("\ncheck_verdicts: FAILED\n");
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error("  These guards need a corpus that CI is not allowed to see, so they run");
    console.error("  where the data is and publish what they found. A verdict that is");
    console.error("  missing, old, red, or bound to different code is not a pass.");
    process.exit(1);
  }
  console.log("check_verdicts: ok — every registered guard has a green verdict, " +
              "taken on this code" + (FULL ? ", within its cadence" : "") +
              (accepted.length
                ? `, or a failure held under an acceptance that has not expired.`
                : "."));
}

main().catch((err) => {
  console.error("check_verdicts: FAILED to run —", err);
  process.exit(1);
});
