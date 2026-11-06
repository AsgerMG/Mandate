/**
 * wsIU — WHAT NAMING THE EIGHT NORWEGIAN LEAVES DOES TO THE RATCHET, AND WHAT
 * IT DOES NOT DO TO THE OTHER NINE CLASSES.
 *
 * Hermetic and free: the committed snapshot through the shipped naming chain,
 * the same rows and the same grouping `check_row_titles_distinct.ts` uses. No
 * DATABASE_URL, no network, no model. Two arms on one snapshot:
 *
 *   ARM A   production
 *   ARM B   production with `funding_instruments.name` replaced on the eight
 *           `innovasjon_norge_*` rows by the funder's own `Virkemiddelkategori`
 *           for that leaf, mutated in memory and never written.
 *
 * Prints the ratchet under each arm and every remaining class, so a claim that
 * the guard comes down is a number this file produced rather than an estimate.
 *
 * Run: npx tsx scripts/_wsiu_titles.ts
 */
import { cutTitlesApart } from "../../lib/intelligence/rowTitleCut";
import { ROW_TITLE_CHARS } from "../../lib/intelligence/schemeText";
import type { InstrumentRow } from "../../lib/intelligence/types";

/** The funder's own category label per leaf slug, byte-for-byte from
 *  `CATEGORY_MAP` in ETL/events/extract/extract_innovasjon_norge.py, which took
 *  it from Innovasjon Norge's CC0 `Tildelinger.csv`. Canonical per slug: the
 *  source also spells `Distriksutviklingstilskudd`, and writing the raw cell
 *  would give one source two names for one leaf. */
const IN_CATEGORY: Record<string, string> = {
  innovasjon_norge_grant_startup: "Oppstartstilskudd",
  innovasjon_norge_grant_innovation: "Innovasjonstilskudd",
  innovasjon_norge_grant_regional: "Distriktsutviklingstilskudd",
  innovasjon_norge_grant_cluster: "Klynger og nettverk",
  innovasjon_norge_grant_international: "Internasjonale tilskuddsprogrammer",
  innovasjon_norge_grant_sector: "Næringsspesifikke utviklingstiltak",
  innovasjon_norge_loan_lowrisk: "Lavrisikolån",
  innovasjon_norge_loan_risk: "Risikolån og garantier",
};

async function main() {
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../../lib/intelligence/corpus");
  const { distinguishRowNames, nameRowsAsDoors } = await import("../../lib/intelligence/shortlist");
  const pool = publishableInstruments();
  if (!pool.length) throw new Error("empty pool — run from web");

  const measure = (rename: boolean) => {
    const byCountry = new Map<string, InstrumentRow[]>();
    for (const i of pool) {
      const name = rename && IN_CATEGORY[i.id] ? IN_CATEGORY[i.id] : i.name;
      const r = {
        channel: i.sourceFamilyBucket ?? i.id, instrument: name, ticket: "", usedInField: false,
        fit: "", instrumentId: i.id, country: i.country, capitalType: i.capitalType,
        administeringBody: i.administeringBody, administeringBodyShare: i.administeringBodyShare,
        schemeCode: i.schemeCode, deliveryRegion: i.deliveryRegion,
        schemeOperators: i.schemeOperators,
      } as InstrumentRow;
      byCountry.set(i.country ?? "??", [...(byCountry.get(i.country ?? "??") ?? []), r]);
    }
    let sameName = 0, merged = 0;
    const classes: string[] = [];
    const labels = new Map<string, string>();
    for (const [country, rows] of [...byCountry].sort()) {
      distinguishRowNames(rows);
      nameRowsAsDoors(rows);
      merged += cutTitlesApart(rows.map((r) => r.instrument), ROW_TITLE_CHARS).merged.length;
      const byFull = new Map<string, InstrumentRow[]>();
      for (const r of rows) {
        labels.set(r.instrumentId as string, r.instrument);
        const k = r.instrument.trim().toLowerCase();
        byFull.set(k, [...(byFull.get(k) ?? []), r]);
      }
      for (const [k, g] of byFull) {
        if (g.length < 2) continue;
        sameName += g.length;
        classes.push(`  ${country}  x${g.length}  ${JSON.stringify(k.slice(0, 80))}\n`
          + g.map((r) => `           ${r.instrumentId}`).join("\n"));
      }
    }
    return { sameName, merged, classes, labels };
  };

  const a = measure(false);
  const b = measure(true);

  console.log(`ARM A (production)      ${a.sameName} rows share a full name, `
    + `${a.classes.length} classes, ${a.merged} merged by the cut`);
  console.log(`ARM B (category names)  ${b.sameName} rows share a full name, `
    + `${b.classes.length} classes, ${b.merged} merged by the cut`);
  console.log(`\nRATCHET ${a.sameName} -> ${b.sameName}\n`);

  console.log("WHAT THE FOUNDER READS ON THE EIGHT, ARM B — the SHIPPED renderer:");
  for (const id of Object.keys(IN_CATEGORY)) {
    console.log(`  ${id.padEnd(38)} ${JSON.stringify(a.labels.get(id))}`
      + `\n  ${" ".repeat(38)} -> ${JSON.stringify(b.labels.get(id))}`);
  }
  console.log("\nCLASSES REMAINING IN ARM B:");
  for (const c of b.classes) console.log(c);
}

main();
