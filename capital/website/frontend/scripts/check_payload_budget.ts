/**
 * How much data does one brief request have to load before it can think?
 *
 * FREE — measures the corpus snapshot, no model calls.
 *
 * Every request hydrates the WHOLE instrument corpus, gates included, because
 * `loadDbInstruments()` is synchronous and used everywhere: eligibility.ts,
 * relevance.ts, gateReach.ts and pipeline.ts all reach into `inst.gates`
 * directly. That is fine at today's size and stops being fine quietly, which
 * is the dangerous kind of limit — nothing fails, requests just get slower
 * until someone notices.
 *
 * So the limit is measured and enforced rather than left to be discovered.
 *
 * ── The designed fix, when this trips ─────────────────────────────────────
 * Two-phase hydration: load instrument rows WITHOUT gates (small, ~15% of the
 * payload), build the candidate pool, then fetch gates only for the ~20
 * instruments that survive. The work is not the query, it is that four modules
 * currently assume gates are already in memory, so each needs an explicit
 * "gates for these ids" step first. Deliberately NOT bolted on at the end of a
 * session alongside other structural changes — that is how debt gets made.
 *
 * Run: npx tsx scripts/check_payload_budget.ts
 */
import { readFileSync, statSync } from "node:fs";

/** Above this, the whole-corpus-per-request design has to be replaced rather
 *  than tuned. Set from measurement: 327 instruments cost 1.8 MB, so this is
 *  roughly 1,500 instruments — the point at which a cold request spends more
 *  time hydrating than the founder will tolerate. */
const BUDGET_MB = 8;
/** Warn well before the wall, so the replacement is planned, not scrambled. */
const WARN_MB = 4;

const FILE = "public/data/instrument_terms.json";

function main() {
  const bytes = statSync(FILE).size;
  const mb = bytes / 1e6;
  const data = JSON.parse(readFileSync(FILE, "utf8")) as {
    records: { gates?: unknown[] }[];
  };
  const instruments = data.records.length;
  const gates = data.records.reduce((n, r) => n + (r.gates?.length ?? 0), 0);
  const perInstrument = bytes / Math.max(1, instruments);

  console.log(`corpus payload      ${mb.toFixed(2)} MB`);
  console.log(`instruments         ${instruments.toLocaleString()}`);
  console.log(`gates               ${gates.toLocaleString()}`);
  console.log(`per instrument      ${(perInstrument / 1024).toFixed(1)} KB`);
  console.log(`headroom to budget  ${(BUDGET_MB - mb).toFixed(1)} MB ` +
    `(~${Math.max(0, Math.floor((BUDGET_MB * 1e6 - bytes) / perInstrument)).toLocaleString()} more instruments)`);

  if (mb > BUDGET_MB) {
    console.error(
      `\nFAIL: the corpus no longer fits the per-request budget of ${BUDGET_MB} MB.\n` +
      `Loading it whole on every request is now the bottleneck — move to the\n` +
      `two-phase hydration described at the top of this file.`);
    process.exitCode = 1;
  } else if (mb > WARN_MB) {
    console.warn(
      `\nWARN: past ${WARN_MB} MB. Plan the two-phase hydration now rather than\n` +
      `when it breaks; see the note at the top of this file.`);
  } else {
    console.log("\nwithin budget");
  }
}

main();
