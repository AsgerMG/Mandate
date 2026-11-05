// @ws-active until 2026-09-30
// scratch probe for wsHF; see project-mgmt/findings/body_named_rows_wsHF.md
const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
async function main() {
  delete process.env.DATABASE_URL;
  const { publishableInstruments, loadDbInstruments } = await import("../lib/intelligence/corpus");
  const all = loadDbInstruments() as any[];
  const pool = publishableInstruments() as any[];
  const poolIds = new Set(pool.map((r) => r.id));
  const hits = all.filter((r) => r.administeringBody && fold(r.name) === fold(r.administeringBody));
  console.log(`snapshot rows ${all.length}  publishable ${pool.length}  body-named ${hits.length}  publishable-and-body-named ${hits.filter((r) => poolIds.has(r.id)).length}`);
  for (const r of hits) console.log(`  ${poolIds.has(r.id) ? "OFFERABLE" : "withheld "} ${(r.nameSource ?? "-").padEnd(14)} ${(r.schemeCode ?? "-").padEnd(11)} ${r.id.padEnd(70)} "${r.name}"`);
}
main();
