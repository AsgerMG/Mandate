// wsEO — emit a fetch target list for the UNDESCRIBED rows of the OPEN pool.
//
// One file per country, in the shape `load_scheme_text.py` already reads back:
// data/raw/scheme_enrichment/targets_<CC>_wsEO.json. Everything the fetching
// agent needs to identify the scheme without guessing — the registered scheme
// code, the administering body, any application URL we already hold — and
// nothing about what anyone won.
//
//   COUNTRIES=EU,SE,NO npx tsx scripts/_wseo_targets.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wseo_targets", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";

const OUT = "/Users/asgermollergrimberg/Wincent/data/raw/scheme_enrichment";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wseo_targets");
  void loadDbInstruments();
  const want = new Set((process.env.COUNTRIES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const open = publishableInstruments();
  const undescribed = open.filter((i) => !(i.description ?? "").trim());
  for (const cc of want) {
    const rows = undescribed.filter((i) => i.country === cc).map((i) => ({
      instrument_id: i.id,
      name: i.name,
      country: i.country,
      sa_number: i.schemeCode ?? null,
      body: i.administeringBody ?? null,
      known_url: i.applicationUrl ?? i.application?.url ?? null,
      awards_on_record: i.eventCount,
      total_eur: i.totalEur,
      last_year: i.lastYear ?? null,
    }));
    const path = `${OUT}/targets_${cc}_wsEO.json`;
    writeFileSync(path, JSON.stringify(rows, null, 1));
    console.log(`${cc}  ${rows.length} targets -> ${path}`);
  }
}
main();
