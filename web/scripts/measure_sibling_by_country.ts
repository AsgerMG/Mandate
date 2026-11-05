// Per-country sibling class, over the rows the product ACTUALLY PUBLISHES.
//
// `measure_sibling_coverage.ts` answers the manager question it was written for
// — are the three omitted columns really adding nothing — over all 1014 corpus
// rows. Two things make that the wrong instrument for a country collection
// workstream:
//
//   1. It scores rows a founder is never shown. `publishableInstruments()` drops
//      frameworks, parents, and schemes whose registered end date has passed;
//      721 rows survive, not 1014. Spain is where the difference stops being
//      cosmetic — 64 of its 87 BDNS leaves are convocatorias whose application
//      window shut, so counting them scores the sibling class of a set the
//      product will not propose.
//   2. It reports one global mean. A workstream that owns one country cannot
//      tell from it whether its own rows moved, and that stopped being academic
//      when the France and Spain publishes landed on the same Postgres minutes
//      apart: the global eligibility_text mean fell 27.1 -> 16.5 while two
//      agents were writing, and neither could honestly claim it.
//
// It reuses the real `publishableInstruments()` rather than re-deriving the
// liveness rule, because a second copy of that filter is precisely the "keep in
// sync" comment that IS the bug.
//
// `eligibility_text` is fetched separately and joined on id: corpus.ts does not
// select it. That is not an oversight to fix here — the column feeds
// `build_instrument_profiles.py` and the embeddings, not the ranker's row
// fields — but it does mean this script must go to Postgres for it, and must
// hydrate the corpus from Postgres too or it would silently score the
// last-published JSON snapshot instead of what was just written.
//
//   npx tsx scripts/measure_sibling_by_country.ts [ES] [FR] ...
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("measure_sibling_by_country", ["DATABASE_URL"]);

const h = (s: string | null | undefined) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");

async function main() {
  const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()));
  const { Client } = await import("pg");
  const { publishableInstruments, hydrateDbInstruments, loadDbInstruments } =
    await import("../lib/intelligence/corpus");

  // Postgres-first, or the numbers below describe the last release snapshot.
  await hydrateDbInstruments();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const text = new Map<string, string>();
  for (const r of (await db.query(
    `SELECT id, eligibility_text FROM funding_instruments
      WHERE length(coalesce(eligibility_text,'')) > 40`)).rows) {
    text.set(r.id, r.eligibility_text);
  }
  await db.end();

  const all = loadDbInstruments();
  const pub = publishableInstruments();
  if (all.length === 0) throw new Error("empty corpus — hydration failed, refusing to report zeros");
  console.log(`corpus ${all.length} rows; publishable ${pub.length}; ` +
    `${text.size} carry eligibility_text over 40 chars\n`);

  // Sibling class is a property of the regime, so group by the same root the
  // ranker does — but only over publishable leaves: one live leaf alongside six
  // expired ones is a class of one to anybody using the product.
  const byRegime = new Map<string, typeof pub>();
  for (const r of pub) {
    const p = r.parentId ?? r.id;
    if (!byRegime.has(p)) byRegime.set(p, []);
    byRegime.get(p)!.push(r);
  }
  const groups = [...byRegime.values()].filter((g) => g.length > 1);

  type Row = (typeof pub)[number];
  const facets: [string, (r: Row) => string][] = [
    ["nothing recorded", () => ""],
    ["administering_body", (r) => h(r.administeringBody)],
    ["eligibility_text", (r) => h(text.get(r.id))],
    ["body+region+text", (r) =>
      h(r.administeringBody) + "|" + h(r.deliveryRegion) + "|" + h(text.get(r.id))],
  ];

  // A leaf counts for its own country; the class it sits in is the whole
  // regime, because that is the set the ranker has to order.
  const countries = new Set(groups.flatMap((g) => g.map((r) => r.country)));
  const wanted = [...countries].filter((c) => !only.size || only.has(c)).sort();

  const head = "country  leaves" + facets.map(([l]) => l.padStart(22)).join("");
  console.log(head);
  console.log("-".repeat(head.length));

  for (const cc of [...wanted, "ALL"]) {
    let n = 0;
    const sums = facets.map(() => ({ cls: 0, uniq: 0, present: 0 }));
    for (const g of groups) {
      const mine = cc === "ALL" ? g : g.filter((r) => r.country === cc);
      if (!mine.length) continue;
      facets.forEach(([, key], fi) => {
        const cls = new Map<string, number>();
        for (const r of g) cls.set(key(r), (cls.get(key(r)) ?? 0) + 1);
        for (const r of mine) {
          const k = cls.get(key(r))!;
          sums[fi].cls += k;
          if (k === 1) sums[fi].uniq++;
          if (key(r).replace(/\|/g, "")) sums[fi].present++;
        }
      });
      n += mine.length;
    }
    if (!n) continue;
    const cells = sums.map((s) =>
      `${(s.cls / n).toFixed(1).padStart(9)} ${String(Math.round(100 * s.uniq / n)).padStart(3)}%` +
      `${String(Math.round(100 * s.present / n)).padStart(5)}%`).join("");
    console.log(`${cc.padEnd(7)} ${String(n).padStart(6)}${cells}`);
  }
  console.log("\nper facet: mean class | % uniquely identified | % of leaves carrying the field");
}
main();
