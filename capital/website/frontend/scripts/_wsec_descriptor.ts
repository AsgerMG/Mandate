// wsEC — WHAT THE WORD "mostly" IS ACTUALLY CLAIMING, over the whole corpus.
//
// Every candidate row the selector reads ends in the descriptor
// `fundDescriptor` composes, and its last clause is `mostly <sector>`. The
// model treats that clause as a sector TAG — "only #2 and #4 explicitly match
// the software and AI sector" — and rejects rows on it. wsDY scored the bench
// menus with the same reading and found a mean of 2.1 rows of 18 surviving.
//
// So the clause is doing selection work, and this asks the only question that
// makes a rendered fact fit to do selection work: does it discriminate? Two
// corpus properties decide it, and neither needs a founder:
//
//   HOW OFTEN IT FIRES  a clause on nearly every row cannot separate rows.
//   WHAT IT CLAIMS      `mostly` is a majority word. `FOCUS_SHARE` is 0.25, so
//                       it fires on a PLURALITY of a taxonomy with eleven tops.
//
// Free: one Postgres read, no embed, no model.
//
//   npx tsx scripts/_wsec_descriptor.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
// VOYAGE_KEY is declared although the arithmetic below never ranks: it reads
// `sectorMix` off hydrated instruments and uses FOCUS_SHARE and SECTOR_WORD as
// constants. But it imports them from `shortlist.ts`, which CAN reach
// `semanticFundMatch`, and check_env_loader is right not to take a script's
// word for which half of a module it will use. Declaring the key it could
// reach is cheaper than a second copy of the sector vocabulary, and a second
// copy is the "keep in sync" comment this repo treats as the defect itself.
requireCredentials("wsec_descriptor", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { FOCUS_SHARE, SECTOR_WORD } from "../lib/intelligence/shortlist";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsec_descriptor");
  const pub = publishableInstruments();
  const shares: number[] = [];
  let fires = 0, named = 0;
  for (const i of pub) {
    const mix = i.sectorMix;
    if (!mix) continue;
    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    const top = Object.entries(mix).sort((a, b) => b[1] - a[1])[0];
    if (!total || !top) continue;
    const s = top[1] / total;
    shares.push(s);
    if (s >= FOCUS_SHARE) {
      fires++;
      if (SECTOR_WORD[top[0]]) named++;
    }
  }
  shares.sort((a, b) => a - b);
  const q = (p: number) => shares[Math.floor(p * (shares.length - 1))];
  const pct = (a: number, b: number) => `${((100 * a) / (b || 1)).toFixed(1)}%`;
  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments}`);
  console.log(`publishable ${pub.length}, of which ${shares.length} carry a sector mix`);
  console.log(`top-sector share  p10 ${q(0.1).toFixed(2)}  p25 ${q(0.25).toFixed(2)}`
    + `  median ${q(0.5).toFixed(2)}  p75 ${q(0.75).toFixed(2)}  p90 ${q(0.9).toFixed(2)}`);
  console.log(`clause fires (share >= FOCUS_SHARE ${FOCUS_SHARE}): `
    + `${fires}/${shares.length}  ${pct(fires, shares.length)}`);
  console.log(`   of those, the vocabulary has a word for the sector: `
    + `${named}/${fires}  ${pct(named, fires)}`);
  const majority = shares.filter((s) => s >= 0.5).length;
  console.log(`the top sector is an actual MAJORITY: `
    + `${majority}/${shares.length}  ${pct(majority, shares.length)}`);
  console.log(`\nSo "mostly X" appears on almost every row and is a true statement about`);
  console.log(`under half of them. A clause that is on every row cannot separate rows,`);
  console.log(`and one that overstates on half of them separates them WRONGLY.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
