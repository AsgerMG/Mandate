/**
 * ONE FOUNDER, THROUGH THE DEPLOYMENT THE FOUNDER USES. A LOOK, NOT A NUMBER.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * `scripts/measure_funnel.ts` — the instrument this project has optimised for
 * two weeks — contains no reference to `/api/intelligence`, to `runIntelligence`
 * or to any route. It imports the pipeline and calls it. So does every other
 * harness here. Every figure this repo publishes is therefore measured in a
 * process that is not the one a founder's request runs in, on a machine that is
 * not the one that serves them, against whatever corpus THAT process happened
 * to hydrate.
 *
 * Two things follow, and both had gone unobserved:
 *
 *   1. Nothing in the tree had ever confirmed which corpus the DEPLOYMENT
 *      ranks on. `hydrateDbInstruments` degrades to the committed snapshot on
 *      any Postgres failure and continues, silently and by design. If
 *      production were on the snapshot, no gate correction this project has
 *      made would ever have reached a founder — and no harness could tell,
 *      because every harness hydrates its own.
 *   2. A change merged is not a change shipped. wsHL, wsHM, wsHN and wsHO all
 *      merged green and none of them had ever been seen in a brief a
 *      deployment produced.
 *
 * ── WHAT THIS IS, AND WHAT IT MUST NEVER BECOME ────────────────────────────
 * A LOOK: does this work, for ONE person, right now, in production.
 *
 * The heavy run is the VERIFICATION — how often are we right — and it is a
 * different instrument with a different population and a stated denominator.
 * The owner's rule: *"we only verify with heavy runs, not test"*.
 *
 *   ██ THIS FILE MAY NEVER PRINT A PERCENTAGE, AND MAY NEVER DRIVE MORE THAN
 *   ██ ONE COMPANY.
 *
 * Grown to ten companies it would become a weak statistic — n=10, no interval,
 * no declared population — and a weak statistic in a terminal gets quoted. We
 * would then have neither a look nor a verification. `assertOneFounder` below
 * is that rule in code rather than in this comment.
 *
 * ── It does NOT own a copy of the founder's path ───────────────────────────
 * The four calls, their order, the payload each carries and the id handoff
 * between them live in ONE place: `lib/intelligence/__founderPath.ts`, which
 * `founderPath.test.ts` fails when it disagrees with `panel.tsx`. This file
 * supplies a TRANSPORT — `fetch` at a deployment instead of the handler modules
 * in this process — and nothing else. A second copy of the sequence is the
 * defect that module exists to make impossible.
 *
 * ── Cost ───────────────────────────────────────────────────────────────────
 * One brief. The deployment pays for it out of the same quota a founder's
 * request draws on, and prints `[cost] brief cost EUR ...` in its own log.
 * That line is NOT served to the client and this file does not ask for it: per
 * request unit economics on a public unauthenticated endpoint is a disclosure,
 * and the boundary is not the place to fix it. Read it with
 * `vercel logs <deployment>` while the run is in flight.
 *
 * Run:
 *   npm run prodcheck                    # the default founder, live deployment
 *   COMPANY="ARBOAIR AB" npm run prodcheck
 *   PRODCHECK_URL=http://localhost:3000 npm run prodcheck
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  driveFounderPath, type FounderTransport,
} from "../lib/intelligence/__founderPath";
import type {
  InstitutionEntry, IntelligenceReport, ProgressEvent,
} from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { isDescribed, loadRecallSet, type RecallRow } from "./recallSet";

// ── THE DEPLOYMENT, TAKEN FROM CONFIG ──────────────────────────────────────
// `data/guard_registry.json` already names where a reader without credentials
// reaches this product; typing the host here would be a second copy of it that
// nothing keeps honest. Same override convention as `GUARD_FEED_URL`.
const REPO_ROOT = path.join(process.cwd(), "..", "..");
const FEED = (JSON.parse(readFileSync(
  path.join(REPO_ROOT, "data", "guard_registry.json"), "utf8")) as
  { feed: { url: string } }).feed.url;
const BASE = (process.env.PRODCHECK_URL || new URL(FEED).origin).replace(/\/$/, "");

// ── THE FOUNDER ────────────────────────────────────────────────────────────
/**
 * Chosen from the population `measure_funnel` draws — held out, described, one
 * row per company — so there IS a right answer and it is the same answer key
 * every published figure is graded against.
 *
 * A.M.L. MICROTECHNIQUE LORRAINE, and the reason is that a hit tells you
 * nothing. On the 40-founder trace this founder's own fund ranks 112th of 112
 * on the instrument table: the product misses it today, so everything below is
 * a look at what a founder gets when we are WRONG, which is the case nobody has
 * ever looked at in production. It is also the one founder in that draw whose
 * won fund is one of the rows wsHN renamed — the answer key still calls it
 * `Ministère de l'économie et des finances` — so "no fund titled as a ministry"
 * is checkable on this founder's own answer rather than in the abstract.
 */
const DEFAULT_COMPANY = "A.M.L. MICROTECHNIQUE LORRAINE";

/** ── THE ONE-FOUNDER RULE, IN CODE ────────────────────────────────────────
 *  Not a comment asking the next person to keep it to one. A list arriving here
 *  with two entries is a statistic being born, and it ends the run. */
function assertOneFounder(rows: RecallRow[], company: string): RecallRow {
  if (!rows.length) {
    throw new Error(
      `prodcheck: no held-out described founder named "${company}". This is a `
      + "LOOK at a founder with a known right answer; a name the answer key "
      + "cannot grade would produce a brief nobody can mark.");
  }
  if (rows.length > 1) {
    throw new Error(
      `prodcheck: "${company}" matches ${rows.length} rows. One founder, never `
      + "several — see the header. Name the company exactly.");
  }
  return rows[0];
}

// ── The transport, and the tee that makes the corpus observable ────────────

interface Seen { route: string; status: number; ms: number; body: unknown }

/**
 * `fetch` at the deployment, recording every non-streaming response.
 *
 * The memo route is passed through untouched: it is newline-delimited JSON over
 * a stream that stays open for minutes, and buffering it to record it would
 * turn the one leg whose LATENCY is part of the answer into a single blob.
 */
function liveTransport(base: string, seen: Seen[]): FounderTransport {
  return async (route, body) => {
    const t0 = Date.now();
    const res = await fetch(`${base}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (route === "/api/intelligence") return res;
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* recorded as text */ }
    seen.push({ route, status: res.status, ms: Date.now() - t0, body: parsed });
    // A NEW Response, because the original's body is now consumed and the
    // driver is entitled to read it exactly as the panel would.
    return new Response(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  };
}

// ── Printing ───────────────────────────────────────────────────────────────

const rule = (s: string) => `\n${"─".repeat(78)}\n${s}\n${"─".repeat(78)}`;
const eur = (n: number) => `EUR ${Math.round(n).toLocaleString("en-GB")}`;

/** The money line a founder actually reads on the row, rebuilt from the same
 *  fields `panelReport.tsx` renders. */
function moneyLine(r: InstitutionEntry): string {
  const bits: string[] = [];
  if (r.typicalAward != null) {
    bits.push(`Typical award ${eur(r.typicalAward)}`
      + (r.typicalAwardN ? ` · ${r.typicalAwardN.toLocaleString("en-GB")} awards` : ""));
  }
  if (r.ticket) bits.push(`ticket ${r.ticket}`);
  if (r.aidIntensity != null) bits.push(`intensity ${Math.round(r.aidIntensity * 100)}%`);
  return bits.length ? bits.join("  ·  ") : "── NO MONEY LINE ON THIS ROW ──";
}

/** Does the link on the row go anywhere? A row reads as instruction, so a dead
 *  link is not a cosmetic defect. */
async function linkStatus(r: InstitutionEntry): Promise<string> {
  if (!r.link?.url) return "NO LINK";
  try {
    const res = await fetch(r.link.url, { method: "GET", redirect: "follow" });
    return `${res.status} ${res.status < 400 ? "ok" : "DEAD"}  ${r.link.kind}  ${r.link.url}`;
  } catch (e) {
    return `UNREACHABLE (${e instanceof Error ? e.message : String(e)})  ${r.link.url}`;
  }
}

/** Normalised for comparison only. Published rows carry no instrument id — see
 *  `InstitutionEntry` — so the answer key can only be matched against them by
 *  name, and this says so rather than implying an id match. */
const norm = (s: string) => s.toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function main(): Promise<void> {
  const company = process.env.COMPANY || DEFAULT_COMPANY;
  const { file: setFile, rows: all } = loadRecallSet("prodcheck");
  const row = assertOneFounder(
    all.filter((r) => r.name === company && r.split === "holdout" && isDescribed(r)),
    company);

  const replayed = founderIntake(row, founderPolicyFromEnv());
  const seen: Seen[] = [];

  console.log(rule("PRODCHECK — one founder, through the live deployment"));
  console.log(`deployment   ${BASE}   (from data/guard_registry.json)`);
  console.log(`founder      ${row.name}  (${row.country}, sector ${row.sector ?? "—"})`);
  console.log(`answer key   ${setFile} — this company really won `
    + `${row.instrumentName ?? row.instrument}  [${row.instrument}]`);
  console.log(`description  ${JSON.stringify(replayed.opts.description ?? "")}`);
  console.log("\nThis is a LOOK at one founder, not a measurement. No percentage is "
    + "printed\nand none may be derived from it.");

  const t0 = Date.now();
  const run = await driveFounderPath({
    company: replayed.company,
    country: replayed.country,
    description: replayed.opts.description ?? "",
    capitalSought: replayed.opts.capitalSought,
    eligibility: replayed.eligibility,
  }, { stopAt: "end", transport: liveTransport(BASE, seen) });
  const elapsed = (Date.now() - t0) / 1000;

  // ── 1. WHICH CORPUS PRODUCTION ACTUALLY USED ─────────────────────────────
  // First, because it can invalidate everything below it.
  const verdictSeen = seen.find((s) => s.route === "/api/intelligence/verdict");
  const corpus = (verdictSeen?.body as { corpus?: {
    source?: string; degraded?: boolean; instruments?: number;
    observedAt?: string; error?: string;
  } } | undefined)?.corpus;
  console.log(rule("1. THE CORPUS THE DEPLOYMENT RANKED ON"));
  if (!corpus) {
    console.log("UNOBSERVABLE — this deployment's verdict route serves no `corpus`");
    console.log("block, so which store it ranked on cannot be established from");
    console.log("outside. Nothing below can be attributed to a corpus.");
  } else {
    console.log(`source       ${String(corpus.source).toUpperCase()}`);
    console.log(`instruments  ${corpus.instruments}`);
    console.log(`observedAt   ${corpus.observedAt || "(unstamped)"}`);
    if (corpus.degraded) {
      console.log(`degraded     YES — Postgres was asked and refused: ${corpus.error}`);
    }
    if (corpus.source !== "postgres") {
      console.log("\n██ STOP. This deployment is NOT on Postgres.");
      console.log("██ Every gate correction this project has published lives in Postgres");
      console.log("██ and NONE of them has reached a founder. That is the finding; the");
      console.log("██ brief below is a brief about a stale copy and grades nothing.");
    }
  }

  // ── 2. THE FUND THIS COMPANY ACTUALLY WON ────────────────────────────────
  const report = [...run.events].reverse()
    .find((e): e is Extract<ProgressEvent, { type: "report" }> => e.type === "report")
    ?.data as IntelligenceReport | undefined;
  const rows = report?.institutions ?? (run.ranked as unknown as InstitutionEntry[]);
  const poolRank = run.candidateInstrumentIds.indexOf(row.instrument);
  const screenRank = run.screenSix.findIndex(
    (r) => (r as unknown as { instrumentId?: string }).instrumentId === row.instrument);
  const wonName = norm(row.instrumentName ?? row.instrument);
  const publishedRank = rows.findIndex((r) => {
    const n = norm(r.institution);
    return n === wonName || (wonName.length > 8 && (n.includes(wonName) || wonName.includes(n)));
  });
  console.log(rule("2. THE FUND THIS COMPANY ACTUALLY WON"));
  console.log(`won          ${row.instrumentName ?? "—"}  [${row.instrument}]`);
  console.log(`pool         ${poolRank < 0 ? "ABSENT from the candidate pool"
    : `row ${poolRank + 1} of ${run.candidateInstrumentIds.length}`}   (by instrument id — exact)`);
  console.log(`first screen ${screenRank < 0 ? "ABSENT from the six instant rows"
    : `row ${screenRank + 1}`}   (by instrument id — exact)`);
  console.log(`published    ${publishedRank < 0 ? "ABSENT from the published table"
    : `row ${publishedRank + 1}`}   (by NAME — published rows carry no instrument id)`);

  // ── 3. THE PUBLISHED ROWS, AS A FOUNDER SEES THEM ────────────────────────
  console.log(rule(`3. THE PUBLISHED ROWS (${rows.length})`));
  const statuses = await Promise.all(rows.map(linkStatus));
  rows.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.institution}${r.country ? `  (${r.country})` : ""}`);
    if (r.familyName) console.log(`   family    ${r.familyName}`);
    console.log(`   money     ${moneyLine(r)}`);
    console.log(`   verdict   ${r.verdict ?? "—"}${r.gatesChecked != null
      ? ` (${r.gatesChecked} encoded filters evaluated)` : ""}`);
    console.log(`   link      ${statuses[i]}`);
  });

  // ── 4. THE MEMO, IN FULL ─────────────────────────────────────────────────
  console.log(rule("4. THE MEMO, AS WRITTEN — read it, do not parse it"));
  if (!report) {
    console.log("NO REPORT EVENT ARRIVED. The founder saw the preview table and then");
    console.log("nothing. Events received:");
    for (const e of run.events) {
      console.log(`  ${e.type}${e.type === "status" ? ` ${e.step}` : ""}`
        + `${e.type === "error" ? ` — ${e.message}` : ""}`);
    }
  } else {
    console.log("\n## Bottom line\n");
    for (const b of report.bottomLine) console.log(`- ${b}\n`);
    console.log("\n## Positioning\n");
    console.log(report.positioning);
    console.log("\n## State of play\n");
    console.log(report.stateOfPlay);
    console.log("\n## Caveats\n");
    console.log(report.caveats);
    if (report.withheld) console.log(`\n## Withheld\n\n${JSON.stringify(report.withheld)}`);
    console.log("\n## What the memo says about each row\n");
    for (const r of report.institutions) {
      console.log(`### ${r.institution}`);
      if (r.descriptor) console.log(`what it is  ${r.descriptor}`);
      console.log(`why         ${r.whyEligible}`);
      if (r.blocker) console.log(`blocker     ${r.blocker}`);
      if (r.betweenCalls) console.log(`window      ${r.betweenCalls}`);
      console.log(`next step   ${r.nextStep}\n`);
    }
    console.log("\n## The eligibility screen the founder is shown\n");
    for (const c of report.eligibilityScreen) {
      console.log(`- [${c.status}] ${c.check} — ${c.finding}`);
    }
  }

  // ── 5. COST AND TRUNCATION ───────────────────────────────────────────────
  console.log(rule("5. THE CALL"));
  const chars = report
    ? report.bottomLine.join(" ").length + report.positioning.length
      + report.stateOfPlay.length + report.caveats.length
      + report.institutions.reduce((n, r) =>
        n + r.whyEligible.length + r.nextStep.length, 0)
    : 0;
  const errors = run.events.filter((e) => e.type === "error");
  console.log(`elapsed      ${elapsed.toFixed(1)}s wall clock, whole path`);
  for (const s of seen) console.log(`  ${s.route}  ${s.status}  ${s.ms}ms`);
  console.log(`events       ${run.events.length}`
    + `  (${run.events.filter((e) => e.type === "status").length} status,`
    + ` ${run.events.filter((e) => e.type === "partial").length} partial,`
    + ` ${report ? 1 : 0} report, ${errors.length} error)`);
  console.log(`prose        ${chars.toLocaleString("en-GB")} characters of model-written text`);
  // A truncated writer call returns `stop_reason: max_tokens` with unparseable
  // output, so from HERE truncation looks like: no report event, or a report
  // whose last section stops mid-sentence. Both are stated; neither is inferred
  // into a number.
  const tail = report?.caveats.trim().slice(-1) ?? "";
  console.log(`truncation   ${!report ? "NO REPORT — the writer produced nothing usable"
    : /[.!?)"'”]/.test(tail) ? "none visible — the memo ends on a closed sentence"
      : `SUSPECT — the memo's last section ends on "${tail}"`}`);
  for (const e of errors) console.log(`  error: ${(e as { message: string }).message}`);
  console.log("cost         logged by the deployment, not served to the client:");
  console.log("             `vercel logs <deployment>` -> `[cost] brief cost EUR ...`");
  console.log("");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
