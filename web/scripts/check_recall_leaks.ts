// A leaking test set overstates every number taken from it. Fail the build.
//
// ── Why this is a CI check and not a note in a script ──────────────────────
// The last leak lived for weeks. Nothing failed: 115 unit tests, the contract
// checks, the archetypes and the payload budget were all green while 46% of
// the holdout `project` rows were being graded on a query copied out of the
// answer. The only thing that could have caught it was a comparison nobody was
// running — the description against `instrument_profiles.profile_text`, the
// column retrieval actually scores on, rather than against the SQLite sample
// titles the build-time guard was reading.
//
// So it runs here, on every `npm run check`, against a committed artifact
// (`lib/intelligence/profileLeakIndex.generated.json`, built by
// ETL/terms/emit_profile_leak_index.py) so it needs no database. A guard that
// needs credentials most machines do not have is a guard that reports green.
//
// It checks whatever set the harnesses would use — the active one, or a
// retired one under `SET=` — so the file being measured is always the file
// being verified.
//
//   npx tsx scripts/check_recall_leaks.ts
//   SET=__recallSet.json npx tsx scripts/check_recall_leaks.ts
import { readFileSync } from "fs";
import path from "path";

import {
  BORROWED_CONTRACT, checkDigestProbes, checkSquashProbes, isBorrowed,
  makeLeakDetector,
} from "../lib/intelligence/recallLeaks";
import type { LeakIndexFile, LeakRow } from "../lib/intelligence/recallLeaks";
import { loadRecallSet } from "./recallSet";

const INDEX = path.join(process.cwd(), "lib", "intelligence",
                        "profileLeakIndex.generated.json");

function main() {
  const idx = JSON.parse(readFileSync(INDEX, "utf8")) as LeakIndexFile;
  const { file, rows } = loadRecallSet("leak check");
  console.log(`  profile index: ${Object.keys(idx.profile).length.toLocaleString()} ` +
              `instruments, built ${idx.builtAt ?? "unknown"}`);

  // The cross-language contract first. If the two squash implementations have
  // drifted, every comparison below is being made on strings neither side
  // meant, and a green result would mean nothing.
  const drift = checkSquashProbes(idx);
  if (drift.length) {
    console.error(`\ncheck_recall_leaks: FAILED — squash() has drifted from ` +
                  `ETL/terms/recall_guards.py on ${drift.length} probe(s):`);
    for (const d of drift.slice(0, 5)) console.error(`  ${d}`);
    console.error("\nThe TypeScript and Python normalisers must agree, or this " +
                  "check compares strings that were never normalised the same way.");
    process.exit(1);
  }

  const digestDrift = checkDigestProbes(idx);
  if (digestDrift.length) {
    console.error(`\ncheck_recall_leaks: FAILED — digest() has drifted from ` +
                  `ETL/terms/recall_guards.py on ${digestDrift.length} probe(s):`);
    for (const d of digestDrift.slice(0, 5)) console.error(`  ${d}`);
    console.error("\nThe own-title check compares fingerprints. If the two " +
                  "implementations disagree it compares nothing and passes.");
    process.exit(1);
  }

  const leakReason = makeLeakDetector(idx);
  const leaks: { row: LeakRow; why: string }[] = [];
  let checked = 0, borrowed = 0;
  for (const r of rows as unknown as LeakRow[]) {
    if (!(r.description ?? "").trim()) continue;
    if (r.descriptionSource === "own_project_title_leaks") continue;
    checked++;
    if (isBorrowed(r)) borrowed++;
    const why = leakReason(r);
    if (why) leaks.push({ row: r, why });
  }

  // ── Anti-vacuity ──────────────────────────────────────────────────────────
  // The three extra checks a borrowed description signs up to run only on rows
  // that claim cross-regime provenance. A set that carries none of them would
  // report green on a contract it never tested — and the artifact could lose
  // the fields those checks read without anything noticing, since a missing
  // record reads as "no name, no code, no titles" and matches nothing.
  const armed = Object.keys(idx.ownTitles ?? {}).length;
  if (borrowed > 0 && armed === 0) {
    console.error(`\ncheck_recall_leaks: FAILED — ${file} carries ${borrowed} ` +
      `cross-regime description(s) and the leak index carries NO own-title ` +
      `index.\n${BORROWED_CONTRACT}.\nRebuild it: ` +
      `python3 ETL/terms/emit_profile_leak_index.py`);
    process.exit(1);
  }

  if (leaks.length) {
    console.error(`\ncheck_recall_leaks: FAILED — ${leaks.length} of ${checked} ` +
                  `described rows in ${file} leak into the answer.`);
    for (const { row, why } of leaks.slice(0, 12)) {
      console.error(`  ${row.name ?? "?"} -> ${row.instrument}`);
      console.error(`    ${why}`);
      console.error(`    "${(row.description ?? "").slice(0, 120)}"`);
    }
    if (leaks.length > 12) console.error(`  ...and ${leaks.length - 12} more`);
    console.error("\nA description that sits inside the profile retrieval scores");
    console.error("against is the answer, not the question. Fix the set — drop the");
    console.error("description or the row — never the guard.");
    process.exit(1);
  }

  console.log(`check_recall_leaks: ok — ${checked.toLocaleString()} described rows, ` +
              `0 leaks at exact / 8-gram / sibling, ` +
              `${(idx.squashProbes ?? []).length} squash probes agree.`);
  console.log(`  of those, ${borrowed.toLocaleString()} claim cross-regime ` +
              `provenance and additionally carry no fund name, no scheme code ` +
              `and no own award title\n  (${armed.toLocaleString()} instruments ` +
              `indexed, ${Object.values(idx.ownTitles ?? {})
                .reduce((n, t) => n + t.length, 0).toLocaleString()} titles, ` +
              `${(idx.digestProbes ?? []).length} digest probes agree).`);
}

main();
