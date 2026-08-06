import { readFileSync } from "fs";
import path from "path";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
import { hydrateDbInstruments } from "../../lib/intelligence/corpus";
import { semanticFundMatch, semanticSeparation } from "../../lib/intelligence/semantic";
import { THEME_SPREAD_FLOOR } from "../../lib/intelligence/shortlist";

async function main() {
  await hydrateDbInstruments();
  const set = JSON.parse(readFileSync(path.join(process.cwd(), "lib", "intelligence",
    process.env.SET ?? "__recallSetPlus.json"), "utf8")) as any[];
  const rows = set.filter((r: any) => r.split === "holdout");
  const step = Math.max(1, Math.floor(rows.length / Number(process.env.N ?? 150)));
  const sample = rows.filter((_: any, i: number) => i % step === 0).slice(0, Number(process.env.N ?? 150));
  const byMode: Record<string, { n: number; on: number; undef: number; sum: number }> = {};
  for (const t of sample) {
    const d = t.description || t.selfDescription || undefined;
    await semanticFundMatch(d);
    const s = semanticSeparation(d);
    const k = t.description ? "real description" : "canned template";
    byMode[k] ??= { n: 0, on: 0, undef: 0, sum: 0 };
    byMode[k].n++;
    if (s === undefined) byMode[k].undef++;
    else { byMode[k].sum += s; if (s >= THEME_SPREAD_FLOOR) byMode[k].on++; }
  }
  console.log(`THEME_SPREAD_FLOOR = ${THEME_SPREAD_FLOOR}`);
  for (const [k, v] of Object.entries(byMode))
    console.log(`  ${k.padEnd(18)} n=${v.n}  informative ${v.on} (${(100*v.on/v.n).toFixed(0)}%)  undefined ${v.undef}  mean separation ${(v.sum/Math.max(v.n-v.undef,1)).toFixed(3)}`);
}
main();
