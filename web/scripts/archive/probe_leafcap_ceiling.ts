// What is the CEILING the leaf cap has to clear, not just today's widest group?
//
// Three readings, widest first:
//   publishable   what the cap sees today
//   in corpus     every row already loaded, publishable or not. A liveness
//                 change alone (a deadline extended, a successor recorded) moves
//                 rows from the second number into the first WITHOUT any load.
//   register      state-aid case numbers known to the register for that country,
//                 which is the size of the loadable universe.
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("probe_leafcap_ceiling", ["DATABASE_URL"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus,
} from "../../lib/intelligence/corpus";
import { leafCapGroups } from "../../lib/intelligence/leafCap";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("probe_leafcap_ceiling");
  const p = corpusProvenance();
  console.log(`corpus=${p.source} instruments=${p.instruments} at ${p.hydratedAt}`);

  const pubGroups = new Map(
    leafCapGroups(publishableInstruments()).map((g) => [`${g.channel}|${g.country}`, g.n]));
  // The same arithmetic over every LEAF in the corpus, publishable or not: what
  // the cap would see if every currently-closed row reopened. Same leaf test as
  // publishableInstruments (not a framework row, not a rollup), minus the
  // liveness and data-floor filters — which are exactly the filters a data load
  // or a register update can flip without anyone touching the cap.
  const rows = loadDbInstruments();
  const hasChildren = new Set(rows.map((i) => i.parentId).filter(Boolean) as string[]);
  const leaves = rows.filter((i) => !i.isFramework && !hasChildren.has(i.id));
  const all = new Map(leafCapGroups(leaves).map((g) => [`${g.channel}|${g.country}`, g.n]));

  const keys = [...new Set([...pubGroups.keys(), ...all.keys()])]
    .sort((a, b) => (all.get(b) ?? 0) - (all.get(a) ?? 0));
  console.log("\n  pub   corpus  channel / country");
  for (const k of keys.slice(0, 20)) {
    console.log(`${String(pubGroups.get(k) ?? 0).padStart(5)}  ${String(all.get(k) ?? 0).padStart(6)}  ${k.replace("|", "  ")}`);
  }

  const url = process.env.DATABASE_URL!;
  const { Client } = await import("pg");
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await c.connect();
  try {
    const cols = (await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'state_aid_cases' ORDER BY 1`)).rows.map((r) => r.column_name);
    console.log(`\nstate_aid_cases columns: ${cols.join(", ") || "(table absent)"}`);
    if (cols.length) {
      const q = await c.query(
        `SELECT country, COUNT(*) n FROM state_aid_cases GROUP BY 1 ORDER BY 2 DESC LIMIT 12`);
      console.log("register cases by country:");
      for (const r of q.rows) console.log(`  ${String(r.n).padStart(5)}  ${r.country}`);
    }
  } catch (e) {
    console.log(`\nregister probe failed: ${(e as Error).message}`);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
