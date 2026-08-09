// Is "we hold no data" scored as neutral, or as a promotion?
//
// This repo has ONE convention for a gap in its own data, restated in four
// docstrings: a gap is never read as evidence against the fund. `awardScorer`
// returns 1 for the funds with no award median, `regionScorer` returns 1 for a
// leaf with no recorded footprint, `gateFitScorer` returns 1 for a leaf whose
// rules cannot be decided, `objectiveScorer` returns 1 for a leaf with no
// registered objective.
//
// All four are MULTIPLIERS, and 1 is the identity of multiplication, so
// "neutral" is exact: the term drops out and the rest of the score decides.
//
// `sectorFit` is the one that is ADDED:
//
//     fit = wTheme * theme + (1 - wTheme) * sectorFit(mix, founderSector)
//
// and its no-data value is a constant, 0.5. For an added term the neutral value
// is not a constant at all — it is whatever the population it competes against
// scores. 0.5 is neutral only if the funds that DO carry a sector mix average
// 0.5. This measures whether they do.
//
//   npx tsx scripts/probe_missing_data_neutral.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("probe_missing_data_neutral", ["DATABASE_URL"]);

// This probe needs the live corpus and does NOT rank: it calls sectorFit(),
// which is arithmetic over a leaf's own sector mix, and never touches the
// embedding path. fit.ts nonetheless sits downstream of semantic.ts in the
// module graph, so "it does not use VOYAGE_KEY" was a hope rather than a fact.
// Destroying the key makes it a fact, and makes the number below identical on a
// machine that holds the key and one that does not.
delete process.env.VOYAGE_KEY;

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { sectorFit } from "../lib/intelligence/fit";
import { SECTOR_OPTIONS } from "../lib/intelligence/types";

const q = (xs: number[], p: number) =>
  xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : NaN;

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("probe_missing_data_neutral");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const pubs = corpus.filter((i) => offerable.has(i.id));
  const regimeOf = (id: string) => byId.get(id)?.parentId ?? id;
  const size = new Map<string, number>();
  for (const i of pubs) size.set(regimeOf(i.id), (size.get(regimeOf(i.id)) ?? 0) + 1);
  const standalone = (id: string) => (size.get(regimeOf(id)) ?? 0) < 2;

  const sectors = SECTOR_OPTIONS.map((o) => o.value);
  console.log(`sectors in the vocabulary: ${sectors.length}`);

  // The score a leaf WITH a sector mix actually gets, over every founder sector
  // it could face. This is the population the 0.5 default competes against.
  const scored: number[] = [];
  const withMix = pubs.filter((i) => i.sectorMix && Object.keys(i.sectorMix).length);
  for (const i of withMix) for (const s of sectors) scored.push(sectorFit(i.sectorMix, s) ?? 0);
  console.log(`\nsectorFit over ${withMix.length} leaves x ${sectors.length} founder sectors ` +
    `= ${scored.length} (leaf, founder) pairs`);
  console.log(`  mean   ${(scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(3)}`);
  for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    console.log(`  p${String(p * 100).padStart(2)}    ${q(scored, p).toFixed(3)}`);
  }
  const above = scored.filter((x) => x > 0.5).length;
  console.log(`  share scoring ABOVE the no-data default of 0.5:  ` +
    `${(100 * above / scored.length).toFixed(1)}%`);
  console.log(`  => a leaf we hold NO sector data for outranks ` +
    `${(100 - 100 * above / scored.length).toFixed(1)}% of the funds we DO hold data for.`);

  // Per country, because the leaves carrying no mix are not spread evenly.
  console.log(`\nBy country — what the default is worth where it lands:`);
  console.log(`  ${"country".padEnd(9)} leaves  no-mix  mean sectorFit of the leaves WITH a mix`);
  const rows: [string, number, number, number][] = [];
  for (const c of new Set(pubs.map((i) => (i.country || "").toUpperCase()))) {
    const inC = pubs.filter((i) => (i.country || "").toUpperCase() === c);
    const nomix = inC.filter((i) => !i.sectorMix || !Object.keys(i.sectorMix).length);
    const s: number[] = [];
    for (const i of inC) if (i.sectorMix && Object.keys(i.sectorMix).length) {
      for (const sec of sectors) s.push(sectorFit(i.sectorMix, sec) ?? 0);
    }
    rows.push([c, inC.length, nomix.length, s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN]);
  }
  for (const [c, n, nm, m] of rows.sort((a, b) => b[2] - a[2] || b[1] - a[1])) {
    console.log(`  ${c.padEnd(9)} ${String(n).padStart(6)}  ${String(nm).padStart(6)}` +
      `  ${Number.isNaN(m) ? "   n/a" : m.toFixed(3).padStart(6)}`);
  }

  // And the same question for the OTHER inputs a zero-award leaf is missing,
  // so the finding is about missing data and not about one function.
  console.log(`\nWhat else a leaf with no awards is missing, and how it is scored:`);
  const nomix = pubs.filter((i) => !i.sectorMix || !Object.keys(i.sectorMix).length);
  console.log(`  leaves with NO sector mix           ${nomix.length}` +
    `  (standalone ${nomix.filter((i) => standalone(i.id)).length})`);
  const nop50 = pubs.filter((i) => i.awardP50 == null || i.awardP50 <= 0);
  console.log(`  leaves with NO award median         ${nop50.length}` +
    `  -> awardScorer 1.0 (multiplicative identity: exact)`);
  console.log(`  leaves with NO sector mix           ${nomix.length}` +
    `  -> sectorFit 0.5 (an ADDED constant: not an identity)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
