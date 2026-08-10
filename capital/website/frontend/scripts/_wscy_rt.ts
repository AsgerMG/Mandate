/**
 * wsCY — how many published routes are the fund's own, and how many are a
 * parent regime's addressee printed as this scheme's instruction.
 *
 * FREE: one Postgres read, no model calls, no embeddings.
 *
 * Run: npx tsx scripts/_wscy_rt.ts
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("rt", ["DATABASE_URL"]);
async function main() {
  const { hydrateDbInstruments, publishableInstruments, loadDbInstruments } = await import("../lib/intelligence/corpus");
  const { resolveRoute } = await import("../lib/intelligence/applicationRoute");
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const counts: Record<string, number> = { own: 0, programme: 0, withheld: 0, none: 0 };
  let hadRoute = 0, ownUrlNowShown = 0;
  const samples: string[] = [];
  for (const leaf of publishableInstruments()) {
    if (leaf.application?.channel) hadRoute++;
    const parent = leaf.parentId ? byId.get(leaf.parentId) : undefined;
    const r = resolveRoute({ application: leaf.application, applicationOwn: leaf.applicationOwn,
      ownApplicationUrl: leaf.applicationUrl, administeringBody: leaf.administeringBody,
      schemeOperators: leaf.schemeOperators, parentName: parent?.name });
    counts[r.provenance]++;
    if (r.url && r.url === leaf.applicationUrl && leaf.application?.url !== leaf.applicationUrl) ownUrlNowShown++;
    if (r.provenance === "withheld" && samples.length < 6) samples.push(`  ${leaf.name.slice(0,60)} | body=${leaf.administeringBody} | was: ${String(leaf.application?.channel).slice(0,70)}`);
  }
  console.log(`publishable=${publishableInstruments().length} had a route=${hadRoute}`);
  console.log(JSON.stringify(counts, null, 1));
  console.log(`fund's own link now reaching the row: ${ownUrlNowShown}`);
  console.log(samples.join("\n"));
}
main();
