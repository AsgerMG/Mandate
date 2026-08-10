/** wsCY — why an AI company is offered a film and television scheme. FREE. */
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("wscy_film", ["DATABASE_URL", "VOYAGE_KEY"]);
async function main() {
  const { hydrateDbInstruments, loadDbInstruments, matchCompany, findPeersBySubsector, isGenericSubsector } = await import("../lib/intelligence/corpus");
  const { semanticFundMatch } = await import("../lib/intelligence/semantic");
  const { COMPANIES } = await import("../lib/intelligence/__benchCompanies");
  await hydrateDbInstruments();
  const c = COMPANIES.find((x) => x.company === "Aleph Alpha")!;
  const sem = await semanticFundMatch(c.description);
  const all = loadDbInstruments();
  const film = all.filter((i) => /Film|Fernseh|Kino|cinema|audiovis/i.test(i.name));
  console.log(`instruments whose NAME says film/TV: ${film.length}`);
  const scored = film.map((i) => ({ i, s: sem.get(i.id) })).filter((x) => x.s !== undefined)
    .sort((a, b) => (b.s! - a.s!));
  const vals = [...sem.values()].sort((a, b) => b - a);
  console.log(`semantic scores in play: n=${vals.length} max=${vals[0]?.toFixed(3)} p50=${vals[Math.floor(vals.length/2)]?.toFixed(3)} min=${vals[vals.length-1]?.toFixed(3)}`);
  for (const { i, s } of scored.slice(0, 6)) {
    const rank = vals.indexOf(s!) + 1;
    console.log(`\n  ${i.name.slice(0, 78)}`);
    console.log(`    id=${i.id} parent=${i.parentId} country=${i.country} capital=${i.capitalType} channel=${i.sourceFamilyBucket}`);
    console.log(`    SEMANTIC score=${s!.toFixed(3)}  rank ${rank} of ${vals.length}`);
    console.log(`    body=${i.administeringBody}`);
    console.log(`    sectorMix=${JSON.stringify(i.sectorMix)}`);
    console.log(`    sampleTitles=${JSON.stringify((i.sampleProjectTitles ?? []).slice(0, 4))}`);
    console.log(`    gates=${i.gates.length} events=${i.eventCount} totalEur=${i.totalEur}`);
  }
  const self = matchCompany(c.company, c.country);
  const sub = self.matched && !isGenericSubsector(self.subsector) ? self.subsector : "";
  console.log(`\nself matched=${self.matched} subsector=${self.subsector} channels=${JSON.stringify(self.channels)}`);
  const peers = sub ? findPeersBySubsector(sub, { country: c.country, limit: 4, exclude: [c.company] }) : [];
  console.log(`peers=${peers.map((p) => `${p.name}[${p.channels.join(",")}]`).join(" | ")}`);
}
main();
