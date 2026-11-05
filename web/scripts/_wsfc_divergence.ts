/**
 * HOW FAR APART ARE THE TWO FUNNELS — IN MEMBERSHIP, NOT ORDER.
 *
 * `caps.ts` has carried this as the open wsDO defect for weeks:
 *
 *   "the two surfaces of one request disagree about which funds are in the
 *    table, not merely about their order, and every recall figure this repo
 *    publishes is measured on the short funnel while the founder acts on the
 *    long one."
 *
 * Nobody had the number. This is the number.
 *
 * ── What is compared ──────────────────────────────────────────────────────
 * One founder, ONE request object, two funnels:
 *
 *   the instant screen   POST /api/intelligence/verdict -> `instrumentTable`.
 *                        The pool cut straight to DISPLAY_CAP = 6, with no
 *                        blocked-row drop, no display-name collapse, no
 *                        re-sort. Driven through the REAL route.
 *   the memo             `runIntelligence`'s `partial` event -> `institutions`.
 *                        accessiblePool, cut to VERDICT_POOL, ordered by
 *                        `orderMemoCandidates`, deduped on display name, cut
 *                        to the published cap.
 *
 * Compared on the name the memo PRINTS (`displayInstitutionName`, the shipped
 * function), because the memo's own dedupe collapses to one row per display
 * name — so that name is the granularity of the table being compared.
 *
 * ── Why the memo leg is NOT driven through its route here ─────────────────
 * `/api/intelligence` calls `checkQuota` before it parses the body, and with
 * DATABASE_URL set that INSERTS a row into production's `request_log` and
 * counts against the €50/day ceiling — a pending row is charged at the running
 * average until it reports. Twelve founders is twelve rows a real founder's
 * request would then have to get past, and the per-IP limit of five would
 * refuse the seventh archetype anyway. A measurement must not consume the
 * production spend ceiling to take its own reading, so this leg calls
 * `runIntelligence` directly.
 *
 * Nothing about the comparison depends on that. The quota runs before the
 * request is read and either serves it unchanged or refuses it, and both sides
 * here are built from ONE request object that the verdict route's own
 * sanitisers produced — so the boundary cannot be the source of a divergence
 * this script reports. The boundary is `founderPath.test.ts`'s subject, and it
 * drives all four routes for real, hermetically, where the quota fails open and
 * writes nothing.
 *
 * ── Free, and it makes no model call at all ───────────────────────────────
 * DATABASE_URL and VOYAGE_KEY are required: a divergence measured on the
 * snapshot with the lexical ranker would be a number about the fallback, not
 * about the product. The Anthropic base URL is pointed at a closed local port
 * before any module constructs a client, so every model call fails to connect
 * instantly — no key is presented, no packet leaves the machine, nothing is
 * billed. The pipeline treats that exactly as a research outage (`intel`
 * degrades to none) and the ranked set is emitted BEFORE the writer, which then
 * fails and is ignored.
 *
 * Both sides therefore see the SAME screen-one answers and no follow-up round
 * at all, which is the point: any divergence printed here is the FUNNEL's, not
 * the round's.
 *
 * Not a guard. It asserts nothing, and it is not named `check_*` — a
 * measurement wearing a guard's name is the thing `check_guard_reachability`
 * needed an audit to tell apart.
 *
 * Run: npx tsx scripts/_wsfc_divergence.ts
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wsfc_divergence", ["DATABASE_URL", "VOYAGE_KEY"]);

// Set before any module constructs a client. A closed port rather than a fake
// key: a fake key is still a request somebody else's rate limiter has to
// answer, and a key presented is a key that can be logged.
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";

type ScreenRow = { channel: string; instrument: string };

async function main() {
  const { ARCHETYPES, archetypeAnswers } = await import("../lib/intelligence/__archetypes");
  const { hydrateDbInstruments, requireLiveCorpus } = await import("../lib/intelligence/corpus");
  const { displayInstitutionName } = await import("../lib/intelligence/shortlist");
  const { runIntelligence } = await import("../lib/intelligence/pipeline");
  const {
    sanitizeEligibility, sanitizeFreeText, sanitizeCapitalSought, withIncorporationCountry,
  } = await import("../lib/intelligence/sanitize");
  const verdictRoute = await import("../app/api/intelligence/verdict/route");

  await hydrateDbInstruments();
  requireLiveCorpus("_wsfc_divergence");

  console.log(
    "archetype".padEnd(28) + "screen  memo  shared  screen-only  memo-only  prefix");
  console.log("-".repeat(92));

  let sharedTotal = 0, screenTotal = 0, memoTotal = 0, prefixHolds = 0;
  const rows: { label: string; shared: number; screen: number }[] = [];

  for (const a of ARCHETYPES) {
    // The body the panel would have put on the wire.
    const body = {
      company: a.label, country: a.country, description: a.description,
      capitalSought: ["grant", "loan"],
      eligibility: archetypeAnswers(a),
      profileSignal: null, projectAnswers: [],
    };

    // ── The instant screen, through its own route ──────────────────────────
    const res = await verdictRoute.POST(new Request(
      "http://founder.test/api/intelligence/verdict",
      { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body) }) as never);
    const screenData = await res.json() as { instrumentTable: ScreenRow[] };
    const screen = screenData.instrumentTable.map((r) => displayInstitutionName(r as never));

    // ── The memo's funnel, from the SAME request, reconstructed by the SAME
    // sanitisers the memo route uses. ─────────────────────────────────────
    const memo: string[] = [];
    try {
      await runIntelligence({
        company: body.company,
        country: body.country,
        description: sanitizeFreeText(body.description),
        capitalSought: sanitizeCapitalSought(body.capitalSought),
        eligibility: withIncorporationCountry(
          sanitizeEligibility(body.eligibility), body.country),
      }, (ev) => {
        if (ev.type === "partial") {
          for (const i of ev.data.institutions ?? []) memo.push(i.institution);
        }
      });
    } catch {
      // The writer, failing on a closed port, exactly as designed. The ranked
      // set was emitted before it.
    }

    const memoSet = new Set(memo);
    const screenSet = new Set(screen);
    const shared = screen.filter((x) => memoSet.has(x)).length;
    const memoOnly = memo.filter((x) => !screenSet.has(x));
    // wsDO §4's checkable property for the merged funnel: screen one's rows are
    // the head of the memo's order. Reported, never asserted — the merge is not
    // this workstream's to make.
    const prefix = screen.length > 0 && screen.every((x, i) => memo[i] === x);
    if (prefix) prefixHolds++;
    sharedTotal += shared; screenTotal += screen.length; memoTotal += memo.length;
    rows.push({ label: a.label, shared, screen: screen.length });
    console.log(
      a.label.padEnd(28) +
      String(screen.length).padEnd(8) + String(memo.length).padEnd(6) +
      String(shared).padEnd(8) + String(screen.length - shared).padEnd(13) +
      String(memoOnly.length).padEnd(11) + (prefix ? "yes" : "no"));
  }

  console.log("-".repeat(92));
  console.log(
    `\n${sharedTotal} of ${screenTotal} rows the founder reads on the instant screen ` +
    `also appear in the memo's table (${(100 * sharedTotal / screenTotal).toFixed(1)}%).\n` +
    `The memo published ${memoTotal} rows across ${rows.length} founders, of which ` +
    `${memoTotal - sharedTotal} (${(100 * (memoTotal - sharedTotal) / memoTotal).toFixed(1)}%) ` +
    `were never on the screen that founder saw.\n` +
    `wsDO's prefix property holds for ${prefixHolds} of ${rows.length}.\n` +
    `Worst: ${[...rows].sort((x, y) => x.shared - y.shared)[0].label}, ` +
    `${[...rows].sort((x, y) => x.shared - y.shared)[0].shared} of 6 shared.\n` +
    `\nBoth sides were built from ONE request, with no follow-up round on either, ` +
    `so this is the funnel's divergence and not the round's.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
