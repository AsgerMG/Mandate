import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal(); requireCredentials("chan", ["DATABASE_URL"]);
import { hydrateDbInstruments, loadDbInstruments } from "../../lib/intelligence/corpus";
import { readFileSync } from "fs";
(async () => {
  await hydrateDbInstruments();
  const ch = new Map(loadDbInstruments().map((i) => [i.id, (i as any).sourceFamilyBucket as string]));
  for (const f of ["/tmp/wsci_tune.json", "/tmp/wsci_regoff.json"]) {
    const rows = JSON.parse(readFileSync(f, "utf8")).filter((r: any) => r.pool);
    let absent = 0; const nch: number[] = []; const missing = new Map<string, number>();
    for (const r of rows) {
      const pc = new Set(r.pool.map((p: any) => ch.get(p[0])));
      nch.push(pc.size);
      const w = ch.get(r.want);
      if (!pc.has(w)) { absent++; missing.set(w!, (missing.get(w!) ?? 0) + 1); }
    }
    nch.sort((a, b) => a - b);
    console.log(f.split("/").pop(), "n=" + rows.length,
      " won CHANNEL absent from the pool:", absent, (100 * absent / rows.length).toFixed(1) + "%",
      " channels per pool: median", nch[Math.floor(nch.length / 2)], "max", nch[nch.length - 1]);
    console.log("   channels missed:", [...missing].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
  }
})();
