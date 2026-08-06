// Generate the committed semantic-score cache the offline checks read.
//
// Semantic fund matching needs pgvector, and every check in this repo runs
// NO_PG. Without this artifact the whole suite would validate the lexical
// fallback while production ranks on embeddings -- the award-median defect
// again, in a different place.
//
// Run with DATABASE_URL and VOYAGE_KEY set, commit the result.
import { readFileSync, writeFileSync } from "fs";
import path from "path";

// Load .env.local like every other script here.
//
// Without this the emitter is a NO-OP THAT LOOKS LIKE A SUCCESS: with no
// DATABASE_URL, `semanticFundMatch` falls back to reading this very artifact
// and the run writes its own input straight back, reporting the right number of
// descriptions. A statistic change was regenerated that way and silently kept
// the old values.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["\']|["\']$/g, "");
  }
} catch { /* rely on the process environment */ }
import { semanticFundMatch, semanticSeparation } from "../lib/intelligence/semantic";

export const OUT = path.join(process.cwd(), "lib", "intelligence", "semanticCache.generated.json");

export async function build(): Promise<string> {
  // The guard the fallback makes necessary: refuse rather than echo.
  if (!process.env.DATABASE_URL || !process.env.VOYAGE_KEY) {
    throw new Error("emit_semantic_cache needs DATABASE_URL and VOYAGE_KEY. "
      + "Without them semanticFundMatch reads this artifact and the run would "
      + "rewrite it unchanged while reporting success.");
  }
  const { ARCHETYPES } = await import("../lib/intelligence/__archetypes");
  const { RED_TEAM } = await import("../lib/intelligence/__redTeam").catch(() => ({ RED_TEAM: [] as any[] }));
  const descriptions = [
    ...ARCHETYPES.map((a: any) => a.description),
    ...(RED_TEAM ?? []).map((r: any) => r.description),
  ].filter((d): d is string => typeof d === "string" && d.trim().length >= 12);

  // `separation` travels with the scores because it cannot be recovered from
  // them: the scores are percentile ranks, which are uniform for every query.
  // Without it every offline check would take the opposite ranking branch from
  // production, which is the failure this artifact exists to prevent.
  const out: Record<string, { scores: Record<string, number>; separation?: number }> = {};
  for (const d of [...new Set(descriptions)]) {
    const m = await semanticFundMatch(d);
    if (!m.size) continue;
    const sep = semanticSeparation(d);
    out[d] = {
      scores: Object.fromEntries([...m].map(([k, v]) => [k, Number(v.toFixed(6))])),
      ...(sep === undefined ? {} : { separation: Number(sep.toFixed(6)) }),
    };
  }
  return JSON.stringify(out, null, 1) + "\n";
}

if (process.argv[1]?.endsWith("emit_semantic_cache.ts")) {
  build().then((t) => {
    writeFileSync(OUT, t);
    console.log(`emit_semantic_cache -> ${path.relative(process.cwd(), OUT)} (${Object.keys(JSON.parse(t)).length} descriptions)`);
  });
}
