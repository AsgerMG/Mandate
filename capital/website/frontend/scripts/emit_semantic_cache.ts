// Generate the committed semantic-score cache the offline checks read.
//
// Semantic fund matching needs pgvector, and every check in this repo runs
// NO_PG. Without this artifact the whole suite would validate the lexical
// fallback while production ranks on embeddings -- the award-median defect
// again, in a different place.
//
// Run with DATABASE_URL and VOYAGE_KEY set, commit the result:
//     npx tsx scripts/emit_semantic_cache.ts
import { writeFileSync } from "fs";
import path from "path";

// Load .env.local like every other script here -- from the repo root as well as
// the frontend, via the one shared loader.
//
// Without credentials the emitter is a NO-OP THAT LOOKS LIKE A SUCCESS: with no
// DATABASE_URL, `semanticFundMatch` falls back to reading this very artifact
// and the run writes its own input straight back, reporting the right number of
// descriptions. A statistic change was regenerated that way and silently kept
// the old values. The guard in `build()` is what makes that impossible; reading
// BOTH env files is what stops the guard from firing on a worktree that has the
// credentials at the root, where they are documented to live.
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// The same two keys `build()` refuses without, declared where every other
// harness declares them. The throw in build() stays: it is what stops the
// emitter grading its own output, and it must hold for a caller that imports
// build() rather than running this file.
requireCredentials("emit_semantic_cache", ["DATABASE_URL", "VOYAGE_KEY"]);

import { corpusProvenance, hydrateDbInstruments, requireLiveCorpus } from "../lib/intelligence/corpus";
import { semanticFundMatch, semanticSeparation } from "../lib/intelligence/semantic";

export const OUT = path.join(process.cwd(), "lib", "intelligence", "semanticCache.generated.json");

/** Every instrument the live index can rank, straight out of Postgres.
 *
 *  Read INDEPENDENTLY of `semanticFundMatch`, on purpose: the whole failure
 *  this file guards against is the emitter grading its own output, so the
 *  expected id set must not come from the same call that produces the scores. */
async function liveProfileIds(): Promise<Set<string>> {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT instrument_id FROM instrument_profiles WHERE embedding IS NOT NULL");
    return new Set(res.rows.map((r: { instrument_id: string }) => r.instrument_id));
  } finally {
    await client.end();
  }
}

export async function build(): Promise<string> {
  // The guard the fallback makes necessary: refuse rather than echo.
  if (!process.env.DATABASE_URL || !process.env.VOYAGE_KEY) {
    throw new Error("emit_semantic_cache needs DATABASE_URL and VOYAGE_KEY. "
      + "Without them semanticFundMatch reads this artifact and the run would "
      + "rewrite it unchanged while reporting success.");
  }
  // Say which corpus this artifact is being cut from, and stop if it is not the
  // live one. Same rule as every harness that prints a figure: the scores below
  // ARE a figure, they just get committed instead of printed.
  await hydrateDbInstruments();
  requireLiveCorpus("emit_semantic_cache");
  const prov = corpusProvenance();
  const expected = await liveProfileIds();
  console.log(`  corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(`  instrument_profiles with an embedding: ${expected.size}`);

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
  // ── Refuse to write a PARTIAL artifact ────────────────────────────────────
  // `semanticFundMatch` returns an EMPTY MAP on any failure -- a dead Voyage
  // key, a statement timeout, an index mid-rebuild -- because a founder's memo
  // must survive that. Here the same silence is the bug: the old loop did
  // `if (!m.size) continue`, so a run with an expired key wrote `{}` and
  // reported "0 descriptions" with exit code 0. That is the echo defect wearing
  // different clothes, and it is caught by asserting the property that actually
  // matters: EVERY description must score EVERY instrument the live index
  // holds. Anything less and the offline suite ranks against a corpus subset,
  // scoring the missing funds 0 -- indistinguishable from "thematically wrong".
  const problems: string[] = [];
  for (const d of [...new Set(descriptions)]) {
    const m = await semanticFundMatch(d);
    if (!m.size) {
      problems.push(`no scores at all for "${d.slice(0, 60)}"`);
      continue;
    }
    const missing = [...expected].filter((id) => !m.has(id));
    const extra = [...m.keys()].filter((id) => !expected.has(id));
    if (missing.length || extra.length) {
      problems.push(`"${d.slice(0, 60)}" scored ${m.size} of ${expected.size} profiles `
        + `(${missing.length} missing, ${extra.length} not in the index)`);
    }
    const sep = semanticSeparation(d);
    out[d] = {
      scores: Object.fromEntries([...m].map(([k, v]) => [k, Number(v.toFixed(6))])),
      ...(sep === undefined ? {} : { separation: Number(sep.toFixed(6)) }),
    };
  }
  if (problems.length) {
    throw new Error(
      `emit_semantic_cache: the live index did not answer for every description.\n`
      + problems.slice(0, 5).map((p) => `  - ${p}`).join("\n")
      + (problems.length > 5 ? `\n  ... and ${problems.length - 5} more` : "")
      + `\n  Writing this would commit a partial ranking that the offline suite`
      + `\n  would then treat as the truth. Nothing was written.`);
  }
  if (!Object.keys(out).length) {
    throw new Error("emit_semantic_cache: no descriptions produced scores; nothing written.");
  }
  return JSON.stringify(out, null, 1) + "\n";
}

if (process.argv[1]?.endsWith("emit_semantic_cache.ts")) {
  build().then((t) => {
    writeFileSync(OUT, t);
    const parsed = JSON.parse(t) as Record<string, { scores: Record<string, number> }>;
    const perDesc = new Set(Object.values(parsed).map((v) => Object.keys(v.scores).length));
    console.log(`emit_semantic_cache -> ${path.relative(process.cwd(), OUT)} `
      + `(${Object.keys(parsed).length} descriptions x ${[...perDesc].join("/")} instruments)`);
  }).catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
