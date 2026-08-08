// Would this batch of fetched text actually SEPARATE anything?
//
// The failure this exists to prevent: a source is found, it returns prose for
// twenty leaves, the prose is the programme page every one of those leaves
// hangs off, and it is therefore IDENTICAL across all twenty. Loading it moves
// the residual class by exactly zero while reporting "coverage 55% -> 75%".
// Coverage is not the scoreboard; separation is. France already carries 34
// ADEME leaves whose text came from one catalogue, and three of those texts are
// shared by three leaves each -- so this is a thing that has happened here, not
// a hypothetical.
//
// So: before any write, score the candidate batch the way the scoreboard will
// score it afterwards. Read the corpus from Postgres, overlay the candidate
// text in memory, and report the country's mean residual class and @5 ceiling
// before and after. Nothing is written.
//
// It reuses publishableInstruments() and the same class key as
// measure_sibling_by_country.ts, deliberately: a second private copy of either
// would let this script bless a batch the real scoreboard then refuses.
//
//   npx tsx scripts/simulate_text_lift.ts <candidates.json> [FR]
//
// candidates.json is an array of {instrument_id | name, found, eligibility_text,
// source_url} -- BOTH the shape ETL/terms/load_scheme_text.py consumes
// (`instrument_id`) and the looser shape a fetch agent emits while it still
// only knows the scheme by its title (`name`). Scoring the loader's own key is
// the point: a dry run that blessed a file the loader then matched to
// different rows would be worse than no dry run. Rows with found:false, or text
// at or under the 40-char floor that loader enforces, are ignored exactly as it
// would ignore them.
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { readFileSync } from "fs";

loadEnvLocal();
requireCredentials("simulate_text_lift", ["DATABASE_URL"]);

const MIN_TEXT_LEN = 40; // matches ETL/terms/load_scheme_text.py

const h = (s: unknown) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");

type Stats = { leaves: number; mean: number; uniq: number; le5: number; over20: number };

function score(groups: any[][], cc: string, key: (r: any) => string): Stats {
  let n = 0, clsSum = 0, uniq = 0;
  const sizes: number[] = [];
  for (const g of groups) {
    const mine = cc === "ALL" ? g : g.filter((r: any) => r.country === cc);
    if (!mine.length) continue;
    const cls = new Map<string, number>();
    for (const r of g) cls.set(key(r), (cls.get(key(r)) ?? 0) + 1);
    for (const r of mine) {
      const k = cls.get(key(r))!;
      clsSum += k; sizes.push(k);
      if (k === 1) uniq++;
    }
    n += mine.length;
  }
  const pc = (f: (s: number) => boolean) => (100 * sizes.filter(f).length) / (n || 1);
  return {
    leaves: n,
    mean: clsSum / (n || 1),
    uniq: (100 * uniq) / (n || 1),
    le5: pc((s) => s <= 5),
    over20: pc((s) => s > 20),
  };
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: simulate_text_lift.ts <candidates.json> [CC]");
  const cc = (process.argv[3] ?? "FR").toUpperCase();

  const { Client } = await import("pg");
  const { publishableInstruments, hydrateDbInstruments } = await import("../lib/intelligence/corpus");

  await hydrateDbInstruments();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const before = new Map<string, string>();
  const idByName = new Map<string, string[]>();
  const knownIds = new Set<string>();
  for (const r of (await db.query(
    `SELECT id, name, eligibility_text FROM funding_instruments`)).rows) {
    if (r.eligibility_text && String(r.eligibility_text).length > MIN_TEXT_LEN) {
      before.set(r.id, r.eligibility_text);
    }
    knownIds.add(r.id);
    const k = String(r.name ?? "").trim();
    if (!idByName.has(k)) idByName.set(k, []);
    idByName.get(k)!.push(r.id);
  }
  await db.end();

  // ── Overlay the candidates ────────────────────────────────────────────────
  const cands: any[] = JSON.parse(readFileSync(file, "utf8"));
  const after = new Map(before);
  let applied = 0, tooShort = 0, notFound = 0, unmatched: string[] = [];
  for (const c of cands) {
    if (c.found === false) { notFound++; continue; }
    const t = String(c.eligibility_text ?? "").trim();
    if (t.length <= MIN_TEXT_LEN) { tooShort++; continue; }
    // instrument_id is the loader's key and wins when present; name is the
    // fallback for a batch an agent produced before ids were resolved. A name
    // is NOT unique in this corpus, so it deliberately fans out to every row
    // carrying it -- the same fan-out a name-keyed load would cause, which is
    // exactly the risk a dry run should show rather than hide.
    const cid = String(c.instrument_id ?? "").trim();
    const ids = cid
      ? (knownIds.has(cid) ? [cid] : [])
      : (idByName.get(String(c.name ?? "").trim()) ?? []);
    if (!ids.length) { unmatched.push(cid || String(c.name)); continue; }
    for (const id of ids) { after.set(id, t); applied++; }
  }

  console.log(`candidates ${cands.length}: applied ${applied}, ` +
    `found:false ${notFound}, under ${MIN_TEXT_LEN} chars ${tooShort}, name not in corpus ${unmatched.length}`);
  for (const u of unmatched) console.log(`   UNMATCHED NAME: ${u}`);

  // ── Distinctness of the batch ITSELF, which is the question ───────────────
  //
  // Reported before the corpus-wide number because it is the one that says
  // whether the SOURCE discriminates, independent of what the corpus already
  // holds. A batch of 26 texts collapsing to 3 distinct strings has told us
  // about 3 funds, whatever the coverage column then says.
  const distinct = new Set<string>();
  for (const c of cands) {
    const t = String(c.eligibility_text ?? "").trim();
    if (c.found !== false && t.length > MIN_TEXT_LEN) distinct.add(h(t));
  }
  console.log(`\nBATCH DISTINCTNESS: ${distinct.size} distinct texts over ${applied} leaves` +
    `  -> best achievable mean class within the batch ${(applied / (distinct.size || 1)).toFixed(1)}`);
  if (distinct.size && applied / distinct.size > 3) {
    console.log(`  WARNING: this source is largely handing siblings the SAME page.`);
  }

  // ── What it does to the country ───────────────────────────────────────────
  const pub = publishableInstruments();
  const byRegime = new Map<string, any[]>();
  for (const r of pub) {
    const p = r.parentId ?? r.id;
    if (!byRegime.has(p)) byRegime.set(p, []);
    byRegime.get(p)!.push(r);
  }
  const groups = [...byRegime.values()].filter((g) => g.length > 1);

  const keyFor = (m: Map<string, string>) => (r: any) =>
    h(r.administeringBody) + "|" + h(r.deliveryRegion) + "|" + h(m.get(r.id));

  console.log("");
  const head = `${"".padEnd(9)}${"leaves".padStart(7)}${"mean class".padStart(12)}` +
    `${"unique".padStart(9)}${"<=5 (ceiling@5)".padStart(17)}${">20".padStart(8)}`;
  console.log(head);
  console.log("-".repeat(head.length));
  for (const label of ["BEFORE", "AFTER"]) {
    const s = score(groups, cc, keyFor(label === "BEFORE" ? before : after));
    console.log(`${(cc + " " + label).padEnd(9)}${String(s.leaves).padStart(7)}` +
      `${s.mean.toFixed(1).padStart(12)}${(s.uniq.toFixed(0) + "%").padStart(9)}` +
      `${(s.le5.toFixed(0) + "%").padStart(17)}${(s.over20.toFixed(0) + "%").padStart(8)}`);
  }
  console.log("\nNothing was written. This is a dry run.");
}
main();
