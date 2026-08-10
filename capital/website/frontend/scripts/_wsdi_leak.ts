// wsDI — the leak argument for `funding_instruments.description`, TESTED.
//
// FREE: one Postgres read and one file read. No model calls.
//
// "Clean by construction — no beneficiary, award or title column" is an
// argument about the SCHEMA, and the schema is not what a founder reads. The
// column holds free text fetched from a granting body's own web page, and a
// granting body is perfectly capable of listing its own beneficiaries on that
// page. So the argument is checked against the data:
//
//   1. does any recall-set company's NAME appear in any description?
//   2. does any recall-set company's own intake DESCRIPTION appear in the
//      description of the fund that company won?
//   3. how much of a description is already inside the answer key
//      (`instrument_profiles.profile_text`) — i.e. is it new text at all?
//
// (3) is the one that surprises: `build_instrument_profiles.py` already writes
// `description` into every profile at 600 chars. It is not unwired from the
// RANKER. It is unwired from the ROW.
//
//   npx tsx scripts/_wsdi_leak.ts
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { loadRecallSet } from "./recallSet";

loadEnvLocal();
requireCredentials("wsdi_leak", ["DATABASE_URL"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Legal-form words and other tokens that make two unrelated companies share a
 *  substring. Stated as a PROPERTY — a token carried by many distinct
 *  companies in the set is an identity of none of them — rather than a list,
 *  so it holds for a corpus that grows new suffixes. */
function genericTokens(names: string[]): Set<string> {
  const df = new Map<string, number>();
  for (const n of names) for (const t of new Set(norm(n).split(" "))) df.set(t, (df.get(t) ?? 0) + 1);
  const out = new Set<string>();
  for (const [t, d] of df) if (d > 2 || t.length < 4) out.add(t);
  return out;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const inst = await db.query<{ id: string; description: string | null }>(
    `SELECT id, description FROM funding_instruments WHERE description IS NOT NULL`);
  const prof = new Map<string, string>((await db.query<{ instrument_id: string; profile_text: string }>(
    `SELECT instrument_id, profile_text FROM instrument_profiles`))
    .rows.map((r) => [r.instrument_id, r.profile_text]));
  await db.end();

  const { file, rows } = loadRecallSet() as unknown as {
    file: string; rows: { name: string; instrument: string; description?: string }[] };
  const generic = genericTokens(rows.map((r) => r.name));

  // (1) company name inside any description
  let nameHits = 0;
  const examples: string[] = [];
  for (const r of rows) {
    // The WHOLE normalised name as one contiguous string, not a bag of its
    // rare tokens. The bag test returned 318 "hits" and every one inspected was
    // a common word — "SPIN LIFE" matching a page that says "life sciences".
    // A leak is the company's identity appearing in the text, and an identity
    // is the whole name.
    const needle = norm(r.name);
    if (needle.length < 12 || norm(r.name).split(" ").every((t) => generic.has(t))) continue;
    for (const i of inst.rows) {
      if (norm(i.description ?? "").includes(needle)) {
        nameHits++;
        if (examples.length < 8) examples.push(`${r.name} -> ${i.id}`);
        break;
      }
    }
  }

  // (2) a company's own intake text inside the description of the fund it won
  let selfHits = 0;
  const byId = new Map(inst.rows.map((i) => [i.id, i.description ?? ""]));
  for (const r of rows) {
    const d = norm(r.description ?? "");
    if (d.length < 24) continue;
    const target = norm(byId.get(r.instrument) ?? "");
    if (!target) continue;
    // A 6-word shingle: long enough that a coincidence is implausible, short
    // enough that a paraphrase still trips it.
    const w = d.split(" ");
    for (let k = 0; k + 6 <= w.length; k++) {
      if (target.includes(w.slice(k, k + 6).join(" "))) { selfHits++; break; }
    }
  }

  // (3) already inside the answer key?
  let inProfile = 0, hasProfile = 0;
  for (const i of inst.rows) {
    const p = norm(prof.get(i.id) ?? "");
    if (!p) continue;
    hasProfile++;
    const head = norm(i.description ?? "").slice(0, 120);
    if (head && p.includes(head)) inProfile++;
  }

  console.log(`recall set ${file}: ${rows.length} companies`);
  console.log(`descriptions on ${inst.rows.length} instruments\n`);
  console.log(`1. a recall-set company NAME appears in some fund's description: ${nameHits}`);
  if (examples.length) console.log(`   ${examples.join("\n   ")}`);
  console.log(`2. a company's own intake text appears in the description of the fund it WON: ${selfHits}`);
  console.log(`3. the description is ALREADY inside instrument_profiles.profile_text: ` +
    `${inProfile} of ${hasProfile} instruments that have a profile`);
}
main();
