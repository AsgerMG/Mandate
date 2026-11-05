// @ws-active until 2026-09-30
// Does any OTHER Latin-only fold in the product decide something about a
// non-Latin string? Free, offline. wsHF, see body_named_rows_wsHF.md.
import { doorLabel, ambiguousSchemes, __resetAmbiguousSchemes } from "../lib/intelligence/doorLabel";
import { nameableBody } from "../lib/intelligence/rowIdentity";

const latin = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  delete process.env.DATABASE_URL;
  const { loadDbInstruments, publishableInstruments } = await import("../lib/intelligence/corpus");
  const all = loadDbInstruments() as any[];
  __resetAmbiguousSchemes();
  const amb = ambiguousSchemes();
  const poolIds = new Set((publishableInstruments() as any[]).map((r) => r.id));

  // A row whose NAME or BODY vanishes under a Latin-only fold.
  const vanish = all.filter((r) => (r.name && !latin(r.name)) || (r.administeringBody && !latin(r.administeringBody)));
  console.log(`rows whose name or body folds to EMPTY under [^a-z0-9]: ${vanish.length} (${vanish.filter((r) => poolIds.has(r.id)).length} offerable)`);

  // The ones where doorLabel would have qualified the row but the vacuous
  // containment test silently stops it.
  let silenced = 0;
  for (const r of vanish) {
    const x = { administeringBody: r.administeringBody, administeringBodyShare: r.administeringBodyShare, schemeCode: r.schemeCode };
    const body = nameableBody(x);
    const ambiguous = !!r.schemeCode && amb.has(r.schemeCode.trim());
    if (ambiguous && body && doorLabel(r.name, x) === r.name) {
      silenced++;
      console.log(`  SILENCED ${poolIds.has(r.id) ? "OFFERABLE" : "withheld "} ${r.id}`);
      console.log(`     name "${r.name}"  body "${body}"  -> label unchanged`);
    }
  }
  console.log(`\ndoorLabel would name a door but the Latin-only containment test stops it: ${silenced}`);
  console.log(`(the test is  flatten(name).includes(flatten(body))  -- "" includes "" is TRUE)`);
}
main();
