// wsIF — WHAT THE CORPUS ALREADY HOLDS THAT COULD SEPARATE THE SAME-NAME LEAVES.
//
// Free. Read-only Postgres, no model call, no Voyage call, no write.
//
// The question is NOT "what could we invent". It is "which column already holds
// a fact the SOURCE published, per leaf, that differs across the class". A rule
// that reads such a column is a naming rule; if no column holds one, the repair
// is a source-side extraction and a different, larger workstream.
//
//   npx tsx scripts/_wsif_facts.ts
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsif_facts", ["DATABASE_URL"]);

import { Pool } from "pg";

const IDS = [
  "innovasjon_norge_grant_cluster", "innovasjon_norge_grant_innovation",
  "innovasjon_norge_grant_international", "innovasjon_norge_grant_regional",
  "innovasjon_norge_grant_sector", "innovasjon_norge_grant_startup",
  "innovasjon_norge_loan_lowrisk", "innovasjon_norge_loan_risk",
  "bpifrance_innovup_leader_idf", "bpifrance_inov", "bpifrance_pmup_idf",
  "altum_aue", "altum_aui",
  "cdti_idi", "cdti_neotec",
  "bdns_conv_880456", "bdns_conv_880548", "bdns_conv_880457", "bdns_conv_880579",
  "satr_fr_rnd__sa_111723__ministere_de_l_economie_et_des_finances",
  "satr_fr_rnd__sa_111723__ministere_de_la_transition_ecologique_et_solidai",
  "satr_fr_rnd__sa_111723__ministere_des_armees",
  "satr_fr_equity__sa_111723__ministere_de_l_economie_et_des_finances",
  "satr_fr_equity__sa_111723__ministere_de_la_transition_ecologique_et_solidai",
  "satr_fr_rnd__sa_111726__direction_generale_de_l_amenagement_du_logement_",
  "satr_fr_rnd__sa_111726__ministere_de_la_transition_ecologique_et_solidai",
  "satr_it_rnd__sa_110595__ministero_dell_universita_e_della_ricerca_direzi",
  "satr_it_rnd__sa_110595__ufficio_coordinamento_pnrr_e_dipartimenti_di_ecc",
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const cols = await pool.query(
    "select column_name, data_type from information_schema.columns "
    + "where table_name = 'funding_instruments' order by ordinal_position");
  console.log("== funding_instruments columns ==");
  console.log(cols.rows.map((r) => r.column_name + ":" + r.data_type).join("  "));
  console.log("");

  // Everything on the row, so nothing that could separate is missed by a
  // hand-picked SELECT.
  const r = await pool.query(
    "select * from funding_instruments where id = any($1)", [IDS]);
  const byId = new Map(r.rows.map((x) => [x.id, x]));

  // Which columns actually DIFFER inside each class.
  const classes: [string, string[]][] = [
    ["NO Innovasjon Norge grants", IDS.slice(0, 6)],
    ["NO Innovasjon Norge loans", IDS.slice(6, 8)],
    ["FR Bpifrance", IDS.slice(8, 11)],
    ["LV Altum", IDS.slice(11, 13)],
    ["ES CDTI", IDS.slice(13, 15)],
    ["ES IGAPE pesca", ["bdns_conv_880456", "bdns_conv_880548"]],
    ["ES IGAPE agricola", ["bdns_conv_880457", "bdns_conv_880579"]],
    ["FR SA.111723 rnd", IDS.slice(19, 22)],
    ["FR SA.111723 equity", IDS.slice(22, 24)],
    ["FR SA.111726", IDS.slice(24, 26)],
    ["IT SA.110595", IDS.slice(26, 28)],
  ];

  for (const [label, ids] of classes) {
    console.log("== " + label + " ==");
    const rows = ids.map((id) => byId.get(id)).filter(Boolean);
    if (rows.length < ids.length) {
      console.log("  MISSING from funding_instruments: "
        + ids.filter((id) => !byId.has(id)).join(", "));
    }
    if (!rows.length) { console.log(""); continue; }
    const keys = Object.keys(rows[0]);
    for (const k of keys) {
      const vals = rows.map((x) => JSON.stringify(x[k]));
      if (new Set(vals).size < 2) continue;
      console.log("  DIFFERS  " + k);
      for (let n = 0; n < rows.length; n++) {
        console.log("      " + ids[n].slice(-42).padEnd(44) + " " + vals[n].slice(0, 220));
      }
    }
    console.log("");
  }

  // Do the EVENTS carry the funder's own category label? That is the question
  // for Innovasjon Norge: the id encodes a slug of `Virkemiddelkategori`, but a
  // naming rule may only read a column, never an id fragment.
  const ev = await pool.query(
    "select column_name from information_schema.columns where table_name = 'funding_events' "
    + "order by ordinal_position");
  console.log("== funding_events columns ==");
  console.log(ev.rows.map((x) => x.column_name).join("  "));
  console.log("");
  const evCols = new Set(ev.rows.map((x) => x.column_name as string));
  const idCol = evCols.has("instrument_id") ? "instrument_id" : "funding_instrument_id";
  if (evCols.has(idCol) && evCols.has("source")) {
    const sample = await pool.query(
      "select " + idCol + " as iid, source, count(*) n from funding_events "
      + "where " + idCol + " like 'innovasjon_norge%' group by 1,2 order by 1,2 limit 60");
    console.log("== innovasjon_norge events: instrument x source ==");
    for (const x of sample.rows) console.log("  " + String(x.iid).padEnd(40) + " " + x.source + "  n=" + x.n);
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
