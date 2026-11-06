// wsID — WHERE A ROW'S DISTINGUISHER DIES ON THE WAY TO THE PAGE.
//
// Free. One Postgres read, no model call, no Voyage call, no write.
//
// Three questions, in the order they have to be asked:
//   1. how many publishable leaves share a rendered title with a leaf a founder
//      in the same country could be shown beside it,
//   2. of those, how many does `distinguishRowNames` actually separate,
//   3. of THOSE, how many separations `oneLine(.., ROW_TITLE_CHARS)` then
//      deletes because the qualifier is appended past the cut.
//
// (3) is the number this workstream is about: a separation our own code
// computed and our own renderer threw away.
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsid_collide", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  hydrateDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../../lib/intelligence/corpus";
import { oneLine, ROW_TITLE_CHARS } from "../../lib/intelligence/schemeText";
import { distinguishRowNames } from "../../lib/intelligence/shortlist";
import { doorLabelFor } from "../../lib/intelligence/doorLabel";
import type { DbInstrument } from "../../lib/intelligence/corpus";
import type { InstrumentRow } from "../../lib/intelligence/types";

const rowOf = (i: DbInstrument): InstrumentRow => ({
  channel: i.sourceFamilyBucket ?? i.id,
  instrument: i.name,
  ticket: "",
  usedInField: false,
  fit: "",
  instrumentId: i.id,
  country: i.country,
  capitalType: i.capitalType,
  administeringBody: i.administeringBody,
  administeringBodyShare: i.administeringBodyShare,
  schemeCode: i.schemeCode,
  deliveryRegion: i.deliveryRegion,
  schemeOperators: i.schemeOperators,
} as InstrumentRow);

const rendered = (s: string) => oneLine(s, ROW_TITLE_CHARS).toLowerCase();

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsid_collide");
  const all = publishableInstruments();
  const byCountry = new Map<string, DbInstrument[]>();
  for (const i of all) {
    const c = i.country ?? "??";
    byCountry.set(c, [...(byCountry.get(c) ?? []), i]);
  }

  let leavesAtRisk = 0, classesAtRisk = 0;
  let separatedRaw = 0, survivesCut = 0, cutDeletesIt = 0, neverSeparated = 0;
  const examples: string[] = [];

  for (const [country, insts] of [...byCountry].sort()) {
    const rows = insts.map(rowOf);
    // The label the collapse groups on BEFORE the disambiguator speaks: the
    // door label, cut, exactly as `rowRenderedLabel` would see an un-qualified
    // row. This is the population a founder could be shown two of.
    const pre = new Map<string, InstrumentRow[]>();
    for (const r of rows) {
      const k = rendered(doorLabelFor(insts.find((i) => i.id === r.instrumentId)!));
      pre.set(k, [...(pre.get(k) ?? []), r]);
    }
    const colliding = [...pre.values()].filter((g) => g.length > 1);
    if (!colliding.length) continue;
    // Production's own disambiguator, on the whole country's rows at once —
    // the widest table any single founder in this country could be handed.
    distinguishRowNames(rows);
    for (const g of colliding) {
      classesAtRisk++;
      leavesAtRisk += g.length;
      const raw = new Set(g.map((r) => r.instrument.trim().toLowerCase()));
      const cut = new Set(g.map((r) => rendered(r.instrument)));
      if (raw.size === 1) { neverSeparated += g.length; continue; }
      separatedRaw += g.length;
      if (cut.size === raw.size) { survivesCut += g.length; continue; }
      cutDeletesIt += g.length;
      if (examples.length < 12) {
        examples.push(`${country} ${g.length} leaves, raw ${raw.size} distinct -> cut ${cut.size}\n`
          + g.map((r) => `      ${r.instrumentId}\n        raw: ${r.instrument}\n        cut: ${rendered(r.instrument)}`).join("\n"));
      }
    }
  }

  console.log(`publishable leaves                                  ${all.length}`);
  console.log(`...in a same-country class that renders alike        ${leavesAtRisk}  (${classesAtRisk} classes)`);
  console.log(`   the disambiguator finds NOTHING to say            ${neverSeparated}`);
  console.log(`   it separates them AND the cut keeps it            ${survivesCut}`);
  console.log(`   it separates them AND THE CUT DELETES IT          ${cutDeletesIt}`);
  console.log("");
  for (const e of examples) console.log("  " + e + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
