// wsCB — read what the unencoded gates actually SAY, per tranche, so the
// "encodable in principle vs undecidable" split is a reading of the text and
// not an inference from a column.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
requireCredentials("wscb_samples", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;
const VOCAB = JSON.parse(readFileSync(process.cwd() + "/../capital/data/vocabularies.json", "utf8"));
const REACH: Record<string, string> = VOCAB.fieldReach;
const FIELD = process.env.FIELD;
const N = Number(process.env.N ?? 14);

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = PUB ? new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String)) : null;
  if (ids && ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }
  const g = await db.query(`
    SELECT eg.instrument_id, eg.gate_key, eg.requirement, eg.value, eg.quote,
           eg.intake_field, eg.intake_field_resolved, eg.verification_level, eg.encoding_method
      FROM eligibility_gates eg
     WHERE eg.gate_role='filter' AND eg.value_spec IS NULL AND eg.verification_level <> 'llm_classified'`);
  let rows = (ids ? g.rows.filter((r) => ids.has(String(r.instrument_id))) : g.rows)
    .map((r) => ({ ...r, field: (r.intake_field_resolved ?? r.intake_field ?? "none") as string }));
  if (FIELD) rows = rows.filter((r) => r.field === FIELD);
  console.log(`cited-or-better NULL-spec filter gates${FIELD ? ` on ${FIELD}` : ""}: ${rows.length}`);

  let s = 20260809;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const k = FIELD ? r.gate_key : `${REACH[r.field] ?? "UNMAPPED"} / ${r.field}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  for (const [k, list] of [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, FIELD ? 12 : 40)) {
    console.log(`\n=== ${k}  (${list.length}) ===`);
    for (const r of [...list].sort(() => rnd() - 0.5).slice(0, N)) {
      console.log(`  [${r.gate_key}] value=${JSON.stringify(r.value)} :: ${String(r.requirement).slice(0, 190).replace(/\s+/g, " ")}`);
    }
  }
  await db.end();
})();
