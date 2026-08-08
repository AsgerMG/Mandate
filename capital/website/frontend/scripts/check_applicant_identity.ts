/**
 * Does every published eligibility text state the APPLICANT's test, or somebody
 * else's?
 *
 * FREE — no model calls. The judgement was paid for once by
 * `ETL/terms/classify_applicant_identity.py` and cached against a digest of the
 * text; this reads the cache and holds the corpus to it.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     The eligible applicant is the entity that SUBMITS the application and
 *     signs the funding contract — not the entity that ultimately benefits
 *     from what the money buys.
 *
 * In most schemes those are the same population. In a DELIVERY scheme they are
 * not: the money pays an adviser, an operator or a relay body to do something
 * for a downstream population, and that population cannot apply.
 *
 * ── Why it is not check_gate_pertinence ───────────────────────────────────
 * That check asks what KIND of statement a text is, and a two-tier text passes
 * it honestly. "This action supports farmers in adapting to climate change"
 * names a checkable population, discriminates between readers, and is a
 * perfectly good `condition`. It was judged `condition`, correctly. Nothing is
 * wrong with the sentence; what is wrong is WHOSE test it is.
 *
 * A founder matched on such a text is routed to a fund they cannot apply to.
 * That is worse than never showing it to them — they spend the effort and find
 * out at the end. It is the same family as the state-aid findings retracted on
 * 2026-08-07: text that is accurate, faithfully attributed, and about somebody
 * other than the reader.
 *
 * ── Why a property and not two ids ────────────────────────────────────────
 * The rows that prompted this are today's instances, and every advisory
 * programme, operator mandate, animation network and technical-assistance
 * envelope in the corpus is a future one. So the set is DERIVED, per text, from
 * the property — this cannot go green because someone loaded a third.
 *
 * ── What it asserts ───────────────────────────────────────────────────────
 *   1. Every calibration case still gets its expected verdict. The controls
 *      matter as much as the positives: a classifier that flags every text
 *      mentioning an adviser has learned a word, not the property.
 *   2. No published eligibility_text is judged `beneficiary_not_applicant`.
 *   3. Every published eligibility_text HAS a current verdict. An unjudged text
 *      is not a passing text — that is how a green build comes to have
 *      evaluated nothing.
 *
 * ── Where it runs ─────────────────────────────────────────────────────────
 * It needs DATABASE_URL, because the claim is about the PUBLISHED column, and
 * no workflow of ours may hold that credential. So it runs wherever the
 * credential already is and publishes what it decided; `check_verdicts.ts`
 * asserts on that with none, weekly, and holds it to the code it judged. That
 * is the same arrangement as the four other Postgres-side guards, and it is
 * the reason this file is no longer in `manual` — it spent its whole life
 * there, having never run, while five funds were routed to founders who could
 * not apply to them.
 *
 *   npx tsx scripts/check_applicant_identity.ts
 */
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { publishVerdict, startTape } from "./guardVerdict";

loadEnvLocal();
requireCredentials("check_applicant_identity", ["DATABASE_URL"]);

const GUARD = "applicant_identity";
const tape = startTape();

const ROOT = join(__dirname, "..", "..", "..");
const CACHE = join(ROOT, "data", "applicant_identity.json");
const CALIBRATION = join(ROOT, "data", "reference", "applicant_identity_calibration.json");

/** One entry of `cases` in the calibration file: the verbatim gate text, the
 *  verdict it must draw, and the reason the case is held. `why` is not
 *  decoration — it is what the failure message prints, so a future reader
 *  learns why the case exists rather than only that it broke. */
interface CalibrationCase {
  text: string;
  expect: string;
  why: string;
}

/** Same identity function as the classifier's `digest()`. */
const digest = (t: string) =>
  createHash("sha256").update(t.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);

async function main() {
  if (!existsSync(CACHE)) {
    throw new Error(
      `${CACHE} is missing — applicant identity has never been judged.\n` +
      `  Run: python3 ETL/terms/classify_applicant_identity.py --classify`);
  }
  const cacheFile = JSON.parse(readFileSync(CACHE, "utf8"));
  const verdicts: Record<string, { verdict: string; reason: string; v?: number }> =
    cacheFile.verdicts ?? {};
  const propertyVersion: number = cacheFile._property_version ?? 1;
  const failures: string[] = [];

  // ── 1. The controls ──────────────────────────────────────────────────────
  const calib = JSON.parse(readFileSync(CALIBRATION, "utf8"));
  let checked = 0;
  for (const [name, spec] of Object.entries<CalibrationCase>(calib.cases ?? {})) {
    const got = verdicts[digest(spec.text)];
    if (!got) {
      failures.push(`calibration ${name}: never judged. Run the classifier.`);
      continue;
    }
    checked++;
    if (got.verdict !== spec.expect) {
      failures.push(
        `calibration ${name}: expected ${spec.expect}, got ${got.verdict}\n` +
        `      why this case exists: ${spec.why}\n` +
        `      classifier's reason:  ${got.reason}`);
    }
  }

  // ── 2 and 3. The corpus ──────────────────────────────────────────────────
  const { Client } = await import("pg");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(
    `SELECT id, country, name, eligibility_text
       FROM funding_instruments
      WHERE length(coalesce(eligibility_text,'')) > 40
      ORDER BY id`);
  await db.end();

  const unjudged: string[] = [];
  const stale: string[] = [];
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const e = verdicts[digest(r.eligibility_text)];
    if (!e) { unjudged.push(`${r.id} (${r.country})`); continue; }
    counts[e.verdict] = (counts[e.verdict] ?? 0) + 1;
    if ((e.v ?? 1) < propertyVersion) stale.push(`${r.id} (judged at v${e.v ?? 1})`);
    if (e.verdict === "beneficiary_not_applicant") {
      failures.push(
        `${r.id} (${r.country}) "${String(r.name).slice(0, 60)}"\n` +
        `      describes a population that CANNOT APPLY: ${e.reason}\n` +
        `      Fix the TEXT so it states who submits — the funder's own "who may\n` +
        `      apply" block usually does — or withdraw it. Do not edit the verdict.`);
    }
  }
  if (unjudged.length) {
    failures.push(
      `${unjudged.length} published eligibility_text rows have no verdict, so this\n` +
      `      check evaluated nothing for them. Run:\n` +
      `        python3 ETL/terms/classify_applicant_identity.py --classify\n` +
      `      first few: ${unjudged.slice(0, 5).join(", ")}`);
  }
  if (stale.length) {
    failures.push(
      `${stale.length} rows carry a verdict from a superseded property version\n` +
      `      (current v${propertyVersion}). Re-run the classifier.\n` +
      `      first few: ${stale.slice(0, 5).join(", ")}`);
  }

  const summary = Object.entries(counts).sort()
    .map(([k, v]) => `${k}=${v}`).join("  ");
  const metrics = {
    published: rows.length,
    calibration: checked,
    cannot_apply: counts["beneficiary_not_applicant"] ?? 0,
    unjudged: unjudged.length,
    stale: stale.length,
  };
  if (failures.length) {
    console.error(`check_applicant_identity: FAILED\n`);
    for (const f of failures) console.error(`  - ${f}\n`);
    console.error(`  ${rows.length} published texts, ${checked} calibration cases`);
    // The summary is served publicly at /api/guards, so it says what a founder
    // is exposed to, not how many assertions tripped.
    await publishVerdict(GUARD, {
      status: "failed",
      summary: metrics.cannot_apply
        ? `${metrics.cannot_apply} published eligibility text(s) describe a ` +
          `population that cannot apply to the fund`
        : `${failures.length} problem(s) in the applicant-identity corpus ` +
          `(${metrics.unjudged} unjudged, ${metrics.stale} judged at a superseded property)`,
      metrics,
      detail: tape(),
    });
    process.exit(1);
  }
  console.log(
    `check_applicant_identity: ok — ${rows.length} published texts state the ` +
    `applicant's own test (${summary}); ${checked} calibration cases hold`);
  await publishVerdict(GUARD, {
    status: "ok",
    summary: `all ${rows.length} published eligibility texts state the applicant's ` +
             `own test; ${checked} calibration cases hold`,
    metrics,
    detail: tape(),
  });
}

main().catch(async (err) => {
  console.error("check_applicant_identity: FAILED to run —", err);
  await publishVerdict(GUARD, {
    status: "error", summary: `the guard could not complete: ${err}`, detail: tape(),
  });
  process.exit(1);
});
