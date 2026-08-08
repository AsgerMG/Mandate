// Fails the build when a capital type in the corpus is neither offered to
// anyone nor deliberately declared to name no kind of capital.
//
// ── The failure this exists to stop ────────────────────────────────────────
// `instrumentServesCapital` decides whether a founder's stated capital
// preference removes a fund. It cuts on a label that names a kind the founder
// did not ask for, and it stays silent on a label that names no kind at all —
// which is the correct reading, and also means an UNCLASSIFIED value is
// silently neutral. Neutral is the safe default for a founder, and it is the
// dangerous one for us: the filter simply stops discriminating on that value
// and nothing goes red.
//
// The opposite default is what shipped, and it was worse. `unknown`,
// `framework` and `blended` answered to no intake option, so `allowed.has(...)`
// was false for all three and any founder who stated a preference lost every
// instrument carrying one — 39 funds removed for everybody, plus a national
// debt programme of 2,977 awards that only an equity request could reach.
//
// So neither default is safe on its own. What makes it safe is that every
// value must be classified ON PURPOSE: mapped to an option, or declared
// indefinite. This check is the thing that forces the choice, at the moment a
// new value first appears in the corpus rather than whenever someone notices a
// fund is missing.
//
// ── Why it reads the live corpus ───────────────────────────────────────────
// The enum is declared in the migration, but what matters is which values are
// actually ON instruments a founder can be shown: a value in the CHECK
// constraint that no row carries has never routed anybody, and a value the
// migration forgot but the loader writes is exactly the case that must fail.
// So the population is `publishableInstruments()`, the same function the
// product ranks over.
//
//   npx tsx scripts/check_capital_reach.ts
import { loadEnvLocal } from "./loadEnv";

loadEnvLocal();

import {
  hydrateDbInstruments, publishableInstruments, corpusProvenance,
} from "../lib/intelligence/corpus";
import {
  CAPITAL_SOUGHT_TO_DB, INDEFINITE_CAPITAL, KNOWN_CAPITAL_TYPES,
  instrumentServesCapital,
} from "../lib/intelligence/shortlist";
import { CAPITAL_OPTIONS } from "../lib/intelligence/types";

async function main() {
  await hydrateDbInstruments();
  const prov = corpusProvenance();
  const insts = publishableInstruments();
  const counts = new Map<string, number>();
  for (const i of insts) counts.set(i.capitalType, (counts.get(i.capitalType) ?? 0) + 1);

  const options = CAPITAL_OPTIONS.map((o) => o.value);
  const problems: string[] = [];

  for (const [type, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    const mapped = KNOWN_CAPITAL_TYPES.has(type);
    const indefinite = INDEFINITE_CAPITAL.has(type);
    if (mapped && indefinite) {
      problems.push(
        `${type} (${n} instruments) is BOTH mapped to an intake option and declared ` +
        `indefinite. It cannot be both: the first says the label names this kind of ` +
        `capital, the second says it names none.`);
      continue;
    }
    if (!mapped && !indefinite) {
      problems.push(
        `${type} (${n} instruments) is classified NOWHERE. It answers to no option in ` +
        `CAPITAL_SOUGHT_TO_DB and is not in INDEFINITE_CAPITAL, so instrumentServesCapital ` +
        `treats it as silence and the founder's capital preference stops discriminating ` +
        `on it. Decide which it is: map it to the option whose label describes what these ` +
        `funds pay, or declare it indefinite because it names no kind of capital.`);
    }
  }

  // Whatever the classification, the promise has to hold at the level a
  // founder experiences: some answer to the capital question must be able to
  // reach every fund. A value that no option admits and that is not indefinite
  // is a fund nobody can be shown, which is the failure that motivated this.
  for (const [type, n] of counts) {
    const reachable = options.some((o) => instrumentServesCapital(type, [o]));
    if (!reachable) {
      problems.push(
        `${type} (${n} instruments) is unreachable: no single answer to the capital ` +
        `question admits it, so these funds are removed for every founder who states ` +
        `a preference at all.`);
    }
  }

  console.log(`corpus=${prov.source} instruments=${insts.length}`);
  console.log(`capital types in the publishable corpus:`);
  for (const [type, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    const how = INDEFINITE_CAPITAL.has(type) ? "indefinite (names no kind)"
      : Object.entries(CAPITAL_SOUGHT_TO_DB)
        .filter(([, v]) => v.includes(type)).map(([k]) => k).join(", ") || "UNCLASSIFIED";
    console.log(`  ${type.padEnd(20)} ${String(n).padStart(5)}  ${how}`);
  }

  if (problems.length) {
    console.error(`\ncheck_capital_reach FAILED (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`\nOK — every capital type is classified on purpose and reachable.`);
}

main();
