// wsCB — what IS the unencoded population, and why is it unencoded?
// Splits the NULL-value_spec filter gates by the three things that decide
// whether a comparator could ever be written for them:
//   (a) evidence tier      — encode_gates only reads llm_cited and above
//   (b) field reachability — `unreachable` fields are refused BY CONSTRUCTION
//   (c) encoding_method    — already tried and skipped, or never attempted
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
requireCredentials("wscb_characterise", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;

const VOCAB = JSON.parse(readFileSync(process.cwd() + "/../../data/vocabularies.json", "utf8"));
const REACH: Record<string, string> = VOCAB.fieldReach;

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = PUB ? new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String)) : null;
  if (ids && ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }

  const cols = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='eligibility_gates' ORDER BY ordinal_position`);
  console.log("eligibility_gates columns:", cols.rows.map((r) => r.column_name).join(", "));

  const g = await db.query(`
    SELECT eg.*, fi.parent_id
      FROM eligibility_gates eg JOIN funding_instruments fi ON fi.id = eg.instrument_id
     WHERE eg.gate_role = 'filter' AND eg.value_spec IS NULL`);
  const rows = (ids ? g.rows.filter((r) => ids.has(String(r.instrument_id))) : g.rows).map((r) => ({
    ...r, field: (r.intake_field_resolved ?? r.intake_field ?? "none") as string,
  }));
  console.log(`\nNULL-spec filter gates (publishable): ${rows.length}`);

  const tally = (label: string, key: (r: any) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    console.log(`\n--- ${label} ---`);
    for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
  };

  const tierCol = cols.rows.map((r) => r.column_name);
  tally("by verification_level (the evidence tier encode_gates gates on)", (r) => String(r.verification_level));
  tally("by encoding_method", (r) => String(r.encoding_method));
  tally("by field reachability", (r) => `${REACH[r.field] ?? (r.field === "none" ? "UNMAPPED" : "?")}`);
  tally("has a verbatim quote?", (r) => (r.quote && String(r.quote).trim() ? "quote" : "NO QUOTE"));

  // The joint cut that actually decides encodability.
  console.log("\n--- joint: tier x reachability (the encodable cell) ---");
  const joint = new Map<string, number>();
  for (const r of rows) {
    const tier = String(r.verification_level);
    const reach = REACH[r.field] ?? (r.field === "none" ? "UNMAPPED" : "?");
    const k = `${tier.padEnd(18)} ${String(reach).padEnd(12)} ${r.quote && String(r.quote).trim() ? "quote" : "NO QUOTE"}`;
    joint.set(k, (joint.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...joint].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
  await db.end();
})();
