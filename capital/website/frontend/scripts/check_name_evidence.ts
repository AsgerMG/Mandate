/**
 * No row a founder can be offered may be one the loader named after its own
 * partition key.
 *
 * HERMETIC: the committed corpus snapshot rendered through the shipped
 * predicates. No DATABASE_URL, no network, so it runs on CI and on a fresh
 * worktree — and it cannot pass by having nothing to read, because it fails on
 * an empty pool.
 *
 * ── The property ──────────────────────────────────────────────────────────
 * A ROW MAY BE OFFERED ONLY IF SOMETHING OUTSIDE ITS OWN ID NAMES IT.
 *
 * Twelve rows failed it and nothing anywhere went red. `SATR Pt Equity` — the
 * register's country crossed with the FILTER SET we send to its search API —
 * landed unblocked in a Portuguese founder's 18-row pool as "National state aid
 * (equity)", typical award EUR 255,571. Poland's entire offerable pool was
 * eight `Sudop *` rows, one per query we run against the SUDOP API, with no
 * real Polish fund among them. It went unseen because no bench archetype covers
 * EE, LT, PT or PL, which is exactly why a check has to ask the question of
 * every row rather than of the profiles we happen to test.
 *
 * ── The two halves, and why the second is the load-bearing one ───────────
 * A. No publishable row carries `partition_key`. Goes red the moment the filter
 *    in `publishableInstruments()` is removed.
 * B. Every publishable row carries SOME `nameSource`. This is the half that
 *    catches the failure nobody would notice: `registerNamesTheRow()` returns
 *    true for a missing value, deliberately, so that a corpus which has not
 *    been asked the question does not silently delete every fund in it. That
 *    default is safe only while something insists the question WAS asked. A
 *    snapshot exported before `name_source` reached the SELECT would pass (A)
 *    on every row by carrying nothing at all.
 *
 * Run: npx tsx scripts/check_name_evidence.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NAME_SOURCE } from "../lib/intelligence/nameEvidence";

const SNAPSHOT = path.join("public", "data", "instrument_terms.json");
const KNOWN = new Set<string>(Object.values(NAME_SOURCE));

async function main() {
  // The committed snapshot rendered through the SHIPPED predicate chain, never
  // a laptop's DATABASE_URL -- same reason check_capital_reach.ts does it, and
  // trustworthy for the same reason: check_corpus_currency.ts asserts the
  // snapshot and Postgres agree and runs before this in `npm run check`.
  //
  // Through `publishableInstruments()` and not through a restatement of its
  // filters, because the thing being asserted is that THAT FUNCTION withholds
  // these rows. A check that re-derived the pool would keep passing after the
  // filter was deleted, which is the only way this can regress.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const pool = publishableInstruments();

  if (!pool.length) {
    console.error(
      "check_name_evidence: FAILED — 0 publishable instruments.\n" +
      "  Every row is vacuously well-named in an empty corpus, so this would\n" +
      "  otherwise pass having checked nothing. Run from website/frontend: the\n" +
      `  snapshot resolves from process.cwd()/public/data. cwd was ${process.cwd()}`);
    process.exit(1);
  }

  const buckets = pool.filter((r) => r.nameSource === NAME_SOURCE.partitionKey);
  const unasked = pool.filter(
    (r) => !r.nameSource || !KNOWN.has(r.nameSource));
  // Half (B) needs the raw snapshot too: the pool is what SURVIVED the filters,
  // so a corpus that carries no `nameSource` at all would show zero buckets and
  // zero unasked rows only because the column never arrived. Counting the
  // declared rows in the file proves the question reached the export.
  const records: { nameSource?: string | null }[] =
    JSON.parse(readFileSync(SNAPSHOT, "utf8")).records;
  const declared = records.filter(
    (r) => r.nameSource === NAME_SOURCE.partitionKey).length;

  if (buckets.length || unasked.length || declared === 0) {
    console.error("check_name_evidence: FAIL\n");
    if (buckets.length) {
      console.error(
        `  ${buckets.length} PUBLISHABLE row(s) are named after the loader's own ` +
        "partition key, not after any object:");
      for (const r of buckets) {
        console.error(`    ${r.id.padEnd(34)} ${(r.country ?? "--").padEnd(3)} "${r.name}"`);
      }
      console.error(
        "    They are declared `partition_key` in " +
        "reference/family_name_evidence.json and must be withheld by\n" +
        "    registerNamesTheRow() in publishableInstruments(). If that filter " +
        "was removed, restore it;\n" +
        "    if the declaration is wrong, fix it there, with the extractor line " +
        "that settles it.");
    }
    if (unasked.length) {
      console.error(
        `\n  ${unasked.length} publishable row(s) carry no recognised ` +
        "nameSource, so nobody has been asked who named them:");
      for (const r of unasked.slice(0, 10)) {
        console.error(`    ${r.id.padEnd(34)} nameSource=${JSON.stringify(r.nameSource)}`);
      }
    }
    if (declared === 0) {
      console.error(
        "\n  The snapshot carries no `partition_key` row at all, and the corpus " +
        "has 44.\n" +
        "    registerNamesTheRow() defaults a MISSING value to offerable on " +
        "purpose, so a snapshot\n" +
        "    exported without the column passes every row silently. Re-export " +
        "it\n" +
        "    (python3 website/build/eligibility_export.py) and check that " +
        "`name_source` is in both\n" +
        "    SELECTs — lib/intelligence/corpus.ts and " +
        "website/build/eligibility_export.py.");
    }
    process.exit(1);
  }

  console.log(
    `check_name_evidence: ok — every one of the ${pool.length} publishable ` +
    `rows is named by something outside its own id (${declared} partition-key ` +
    "rows in the corpus, all withheld)");
}

main();
