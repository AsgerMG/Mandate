// wsIF — what `funding_instrument_sources` records for the same-name leaves.
// Read-only. Free.
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsif_sources", ["DATABASE_URL"]);

import { Pool } from "pg";

const IDS = [
  "innovasjon_norge_grant_cluster", "innovasjon_norge_grant_innovation",
  "innovasjon_norge_grant_international", "innovasjon_norge_grant_regional",
  "innovasjon_norge_grant_sector", "innovasjon_norge_grant_startup",
  "bpifrance_innovup_leader_idf", "bpifrance_inov", "bpifrance_pmup_idf",
  "altum_aue", "altum_aui", "cdti_idi", "cdti_neotec",
  "bdns_conv_880456", "bdns_conv_880548", "bdns_conv_880457", "bdns_conv_880579",
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  for (const tbl of ["funding_instrument_sources", "instrument_application", "instrument_profiles"]) {
    const c = await pool.query(
      "select column_name from information_schema.columns where table_name=$1 order by ordinal_position",
      [tbl]);
    console.log("== " + tbl + " ==");
    console.log("  " + c.rows.map((r) => r.column_name).join("  "));
  }
  console.log("");
  const r = await pool.query(
    "select * from funding_instrument_sources where instrument_id = any($1) order by instrument_id",
    [IDS]);
  console.log("== funding_instrument_sources rows ==");
  for (const x of r.rows) console.log("  " + JSON.stringify(x).slice(0, 400));
  console.log("");
  const a = await pool.query(
    "select * from instrument_application where instrument_id = any($1) order by instrument_id", [IDS]);
  console.log("== instrument_application rows ==");
  for (const x of a.rows) console.log("  " + JSON.stringify(x).slice(0, 500));
  console.log("");
  const p = await pool.query(
    "select instrument_id, left(profile_text, 260) t from instrument_profiles where instrument_id = any($1) order by instrument_id",
    [IDS]);
  console.log("== instrument_profiles ==");
  for (const x of p.rows) console.log("  " + x.instrument_id + "  " + JSON.stringify(x.t));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
