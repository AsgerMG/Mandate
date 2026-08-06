// How many funds can a founder in this country actually be offered, and can
// they tell them apart?
//
// ── Why this exists beside the two sibling scripts ─────────────────────────
// `measure_sibling_coverage.ts` and `measure_sibling_by_country.ts` both score
// MULTI-LEAF REGIMES — groups of instruments sharing a parent. That is the
// right unit for the question they were written for (are the three omitted
// columns adding anything), and it is blind in a way that matters here: an
// instrument with no parent is a group of one and is dropped before any facet
// is measured.
//
// Spain's open convocatorias are exactly that population. They come from forty
// different bodies under sixty different regulatory bases, so they have no
// parent and inventing one would assert a regime that does not exist. Both
// existing scripts therefore report Spain as 9 leaves while the product offers
// 93, and a workstream could add hundreds of indistinguishable rows without
// either number moving.
//
// A founder does not choose within a regime. They choose from everything the
// product will offer them, so that is the set scored here.
//
// It reuses the real `publishableInstruments()` rather than re-deriving the
// liveness rule — a second copy of that filter is precisely the "keep in sync"
// comment that IS the bug (see lib/intelligence/liveness.ts).
//
// `--without <source-tag>` recomputes the same numbers with one source's rows
// removed, at the same moment against the same Postgres, so a load's effect can
// be isolated from whatever a neighbouring agent wrote thirty seconds ago.
//
//   npx tsx scripts/measure_country_offerable.ts ES
//   npx tsx scripts/measure_country_offerable.ts ES --without bdns_es_convocatorias_abiertas
import { readFileSync } from "fs";
for (const line of readFileSync(new URL("../../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
import { Client } from "pg";
import { hydrateDbInstruments, publishableInstruments, type DbInstrument } from "../lib/intelligence/corpus";

const h = (s: unknown) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");

async function main() {
  const args = process.argv.slice(2);
  const without = args.includes("--without") ? args[args.indexOf("--without") + 1] : undefined;
  const countries = args.filter((a) => /^[A-Z]{2}$/.test(a));
  if (!countries.length) throw new Error("name at least one country, e.g. ES");

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  // eligibility_text is joined on id rather than read off the DbInstrument:
  // corpus.ts does not select it (it feeds the profiles and the embeddings, not
  // the ranker's row fields), so reading it there is silently undefined on
  // every row and reports a mean class equal to the whole population.
  const { rows: texts } = await db.query(
    `SELECT id, eligibility_text FROM funding_instruments WHERE country = ANY($1)`, [countries]);
  const textOf = new Map(texts.map((r) => [r.id, r.eligibility_text]));
  const excluded = new Set<string>();
  if (without) {
    const { rows } = await db.query(
      `SELECT instrument_id FROM funding_instrument_sources WHERE source=$1`, [without]);
    for (const r of rows) excluded.add(r.instrument_id);
  }
  await db.end();

  // Hydrate from Postgres, or this scores the last-published JSON snapshot
  // instead of what was just written.
  await hydrateDbInstruments();
  const pub = publishableInstruments();
  console.log(`corpus publishable ${pub.length}` + (without ? `; excluding source ${without}` : ""));

  for (const cc of countries) {
    const all = pub.filter((i) => i.country === cc);
    const rows = without ? all.filter((i) => !excluded.has(i.id)) : all;
    console.log(`\n${cc}: ${rows.length} offerable` +
      (without ? `  (${all.length} with ${without}, ${all.length - rows.length} removed)` : ""));
    if (!rows.length) continue;
    const facets: [string, (i: DbInstrument) => string][] = [
      ["nothing recorded", () => ""],
      ["capital_type", (i) => h(i.capitalType)],
      ["administering_body", (i) => h(i.administeringBody)],
      ["closing date", (i) => h(i.schemeEndDate)],
      ["eligibility_text", (i) => h(textOf.get(i.id))],
      ["body + text + date", (i) =>
        h(i.administeringBody) + "|" + h(textOf.get(i.id)) + "|" + h(i.schemeEndDate)],
    ];
    for (const [label, key] of facets) {
      const cls = new Map<string, number>();
      for (const i of rows) cls.set(key(i), (cls.get(key(i)) ?? 0) + 1);
      const sum = rows.reduce((a, i) => a + cls.get(key(i))!, 0);
      const uniq = rows.filter((i) => cls.get(key(i)) === 1).length;
      console.log(`  ${label.padEnd(22)} mean class ${(sum / rows.length).toFixed(1).padStart(5)}` +
        `   uniquely identified ${String(Math.round(100 * uniq / rows.length)).padStart(3)}%` +
        `   distinct ${cls.size}`);
    }
  }
}

main();
