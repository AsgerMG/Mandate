// wsEO — emit a fetch target list for the UNDESCRIBED rows of the OPEN pool.
//
// One file per country, in the shape `load_scheme_text.py` already reads back:
// data/raw/scheme_enrichment/targets_<CC>_wsEO.json. Everything the fetching
// agent needs to identify the scheme without guessing — the registered scheme
// code, the administering body, any application URL we already hold — and
// nothing about what anyone won.
//
// ── wsEY: also skip what the LOCAL store already describes ──────────────────
// The pool and the "is it described" test both come from Postgres, which is
// right: that is what a founder sees. But this workstream loads
// `--sqlite-only` by instruction, so a row described by an earlier batch is
// still undescribed in Postgres and would be handed to a fetching agent twice.
// STAGED points at the `describedIds` written by _wsey_open_coverage.py.
//
//   COUNTRIES=EE,SE,CZ STAGED=/tmp/wsey_after_b0.json npx tsx scripts/_wsey_targets.ts
import { readFileSync, writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsey_targets", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../../lib/intelligence/corpus";

const OUT = "/Users/asgermollergrimberg/Wincent/data/raw/scheme_enrichment";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsey_targets");
  void loadDbInstruments();
  const want = new Set((process.env.COUNTRIES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const open = publishableInstruments();
  const staged: Set<string> = process.env.STAGED
    ? new Set(JSON.parse(readFileSync(process.env.STAGED, "utf8")).describedIds as string[])
    : new Set();
  const undescribed = open.filter(
    (i) => !(i.description ?? "").trim() && !staged.has(i.id));
  console.log(`${open.length} open, ${undescribed.length} undescribed in neither store` +
    (staged.size ? ` (${staged.size} described in the local store)` : ""));
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
    const path = `${OUT}/targets_${cc}_wsEY.json`;
    writeFileSync(path, JSON.stringify(rows, null, 1));
    console.log(`${cc}  ${rows.length} targets -> ${path}`);
  }
}
main();
