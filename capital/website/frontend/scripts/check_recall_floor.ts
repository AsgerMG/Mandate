// Does retrieval still find the fund a company actually won?
//
// The suite has 115 tests, 12 archetypes, contract, payload and parity checks,
// and not one of them can see a ranking regression: every row can be well-formed
// and correctly cited while the right fund sits at rank nine. Twice this session
// a change cost double-digit recall and the whole suite stayed green -- a
// per-channel signal in the row sort cost 24 points and was caught only because
// the number was being watched by hand.
//
// So the floors are here, on the TUNE split, alongside everything else that
// fails the build.
//
// Floors sit just under the measured numbers, not at an aspiration. A gate set
// where we wish we were fails on day one, gets ignored, and then protects
// nothing. Raise them when the real number rises.
import { readFileSync } from "fs";
import path from "path";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";

/** Measured 2026-08-03 on a REPRESENTATIVE tune sample, n=150: pool 74%,
 *  EXACT@5 35%, REGIME@5 77%. The higher figures quoted earlier in the session
 *  (92/49/73) came from slicing the head of the set, which is 66% `project`
 *  against a true population of 16%. */
const FLOOR = { pool: 70, exact5: 31, regime5: 72 };
const N = Number(process.env.RECALL_N ?? 150);

async function main() {
  // Semantic ranking needs both. Without them this would grade the LEXICAL
  // fallback -- a different system from the one that ships -- and report a
  // number that looks like a pass. Skipping loudly is the honest failure mode;
  // the check runs wherever credentials exist, which is every developer machine
  // and the deploy path.
  if (!process.env.DATABASE_URL || !process.env.VOYAGE_KEY) {
    console.log("check_recall_floor: SKIPPED — no DATABASE_URL/VOYAGE_KEY.");
    console.log("  Floors NOT verified. Run with credentials before shipping a");
    console.log("  ranking change; lexical fallback would grade the wrong system.");
    return;
  }

  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const all = JSON.parse(readFileSync(
    path.join(process.cwd(), "lib", "intelligence", "__recallSet.json"), "utf8")) as any[];
  // Stride, not slice. The set is grouped by mode, so the first N pairs are
  // nearly all `project` -- which measures 63% exact against `profile`'s 22%,
  // and the first draft of this gate read 70% where the true figure is 49%. A
  // floor that samples the easy half is worse than no floor: it passes while
  // the population it was written to protect regresses. Deterministic, so the
  // number is comparable between runs.
  const tune = all.filter((r) => r.split === "tune");
  const step = Math.max(1, Math.floor(tune.length / N));
  const set = tune.filter((_, i) => i % step === 0).slice(0, N);

  let pool = 0, exact5 = 0, regime5 = 0;
  for (const t of set) {
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never, {
      targetMarkets: [t.country], capitalSought: ["grant", "loan"],
      description: t.description || undefined,
    } as never);
    const top5 = (v.instrumentTable ?? []).slice(0, 5)
      .map((r: any) => r.instrumentId).filter(Boolean) as string[];
    const wantRegime = byId.get(t.instrument)?.parentId ?? t.instrument;
    if ((v.candidateInstrumentIds ?? []).includes(t.instrument)) pool++;
    if (top5.includes(t.instrument)) exact5++;
    if (top5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime)) regime5++;
  }

  const got = {
    pool: (100 * pool) / set.length,
    exact5: (100 * exact5) / set.length,
    regime5: (100 * regime5) / set.length,
  };
  const failed = (Object.keys(FLOOR) as (keyof typeof FLOOR)[])
    .filter((k) => got[k] < FLOOR[k]);

  for (const k of Object.keys(FLOOR) as (keyof typeof FLOOR)[]) {
    const bad = got[k] < FLOOR[k];
    console.log(`  ${bad ? "FAIL" : "ok  "} ${k.padEnd(8)} ${got[k].toFixed(0)}% ` +
                `(floor ${FLOOR[k]}%)`);
  }
  if (failed.length) {
    console.error(`\ncheck_recall_floor: FAILED on ${failed.join(", ")} over ` +
                  `${set.length} tune pairs.`);
    console.error("A ranking change that loses the fund a company actually won is");
    console.error("a regression even when every other check is green.");
    process.exit(1);
  }
  console.log(`check_recall_floor: ok — ${set.length} tune pairs, all floors met.`);
}

main();
