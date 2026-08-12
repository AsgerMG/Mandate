// wsDI — the leak argument for the fund's OWN PROSE COLUMNS, TESTED.
//
// `funding_instruments.description` and `.eligibility_text` are two halves of
// one fetch of one page: what the scheme pays for, and who it says may apply.
// wsFG put the second on the candidate row beside the first, so both are run
// through the same probes here rather than one being argued from the other.
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

/** Case, punctuation and DIACRITICS folded, in that order.
 *
 *  The diacritic fold is not tidiness, it decides what the shingle test below
 *  measures. Without it `[^a-z0-9]` treats every accented letter as a
 *  SEPARATOR, so "au périmètre de l'entreprise" normalises to eight tokens
 *  ("au p rim tre de l entreprise") and a six-TOKEN window over it spans three
 *  WORDS of French stop-language. wsFG's first run of probe (2) over
 *  `eligibility_text` reported exactly one hit and it was that: "au p rim tre
 *  de l" shared by a company narrative and a fund page, both French, sharing
 *  no content at all. Folded, the window is six real words again and the hit
 *  is gone — and every accented company NAME in probe (1) becomes one token
 *  instead of several, which makes that probe stricter too. */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Mn}+/gu, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

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

/** Probes (1) and (2) for one prose column.
 *
 *  Parameterised rather than copied, because wsFG added a SECOND column off the
 *  same fetch of the same page (`eligibility_text`) and the leak argument for
 *  it is word-for-word the leak argument for the first. Two copies of this
 *  would agree until one of them was fixed. */
function probeColumn(
  label: string,
  texts: { id: string; text: string | null }[],
  rows: { name: string; instrument: string; description?: string }[],
  generic: Set<string>,
): string[] {
  // (1) company name inside any of this column's values
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
    for (const i of texts) {
      if (norm(i.text ?? "").includes(needle)) {
        nameHits++;
        if (examples.length < 8) examples.push(`${r.name} -> ${i.id}`);
        break;
      }
    }
  }

  // (2) a company's own intake text inside the value on the fund it WON
  let selfHits = 0;
  const byId = new Map(texts.map((i) => [i.id, i.text ?? ""]));
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

  const out = [
    `${label}: ${texts.length} instruments carry it`,
    `  1. a recall-set company NAME appears in some fund's ${label}: ${nameHits}`,
  ];
  if (examples.length) out.push(`     ${examples.join("\n     ")}`);
  out.push(`  2. a company's own intake text appears in the ${label} of the fund it WON: ${selfHits}`);
  return out;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const inst = await db.query<{ id: string; description: string | null; eligibility_text: string | null }>(
    `SELECT id, description, eligibility_text FROM funding_instruments
      WHERE description IS NOT NULL OR eligibility_text IS NOT NULL`);
  const prof = new Map<string, string>((await db.query<{ instrument_id: string; profile_text: string }>(
    `SELECT instrument_id, profile_text FROM instrument_profiles`))
    .rows.map((r) => [r.instrument_id, r.profile_text]));
  await db.end();

  const { file, rows } = loadRecallSet() as unknown as {
    file: string; rows: { name: string; instrument: string; description?: string }[] };
  const generic = genericTokens(rows.map((r) => r.name));

  const described = inst.rows.filter((i) => i.description)
    .map((i) => ({ id: i.id, text: i.description }));
  // The SECOND prose column, added by wsFG. Same page, same fetch, same
  // argument — so it gets the same two probes rather than an assurance.
  const eligible = inst.rows.filter((i) => i.eligibility_text)
    .map((i) => ({ id: i.id, text: i.eligibility_text }));

  // (3) already inside the answer key? Asked of `description` only, and that
  // is not an oversight: the question is whether the column is NEW to the
  // ranker, and `build_instrument_profiles.py` writes `description` into every
  // profile at 600 chars while writing no eligibility text at all.
  let inProfile = 0, hasProfile = 0;
  for (const i of inst.rows) {
    const p = norm(prof.get(i.id) ?? "");
    if (!p) continue;
    hasProfile++;
    const head = norm(i.description ?? "").slice(0, 120);
    if (head && p.includes(head)) inProfile++;
  }

  console.log(`recall set ${file}: ${rows.length} companies\n`);
  console.log(probeColumn("description", described, rows, generic).join("\n"));
  console.log("");
  console.log(probeColumn("eligibility_text", eligible, rows, generic).join("\n"));
  console.log(`\n3. the description is ALREADY inside instrument_profiles.profile_text: ` +
    `${inProfile} of ${hasProfile} instruments that have a profile`);
}
main();
