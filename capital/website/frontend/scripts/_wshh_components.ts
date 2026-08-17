// wsHH — WHICH PART OF THE PROFILE CARRIES THE OPINION, AND IS ANY PART OF IT
//        RIGHT ABOUT THE DOOR?
//
// @ws-active until 2026-09-30
//
// `_wshh_cosines.ts` establishes that the shipped index has a large and
// confident opinion about which of two sibling doors matches a founder, and
// that the opinion is right 44.9% of the time — at or below the coin flip a
// pair conditioned on our own top pick has to clear. That closes the RANKING
// route: no re-expression of those numbers can help, because the percentile
// map is a rank transform of the cosines and cannot reverse a pair.
//
// It leaves one live objection, and this script is the whole of it:
//
//   THE PROFILE IS NOT THE TOPIC. `build_instrument_profiles.py` assembles
//   nine sections, of which the funded-project titles, the register activity
//   lines and the child-scheme names are all AWARD HISTORY. wsHA measured the
//   doors differing in their DESCRIPTION (95.8%) and their ELIGIBILITY TEXT
//   (79.1%) — the two sections a founder's own words are actually about. If
//   the topic signal is in there and drowned by 40 award titles, the fix is in
//   `build_profiles` and not in `shortlist.ts`.
//
// So: re-embed each door FIVE ways and ask each one the same question the
// shipped index was asked. `profile` is the control and must reproduce the
// live index, or this harness is embedding something other than what ships.
//
// ── FREE ───────────────────────────────────────────────────────────────────
// Voyage embeddings and Postgres reads. ANTHROPIC_API_KEY is deleted before
// anything that could reach it is imported. NO PAID MODEL CALL.
//
//   OUT=/tmp/wshh_components.json npx tsx scripts/_wshh_components.ts
//
// @ws-active until 2026-09-30
import { readFileSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
if (requireCredentials("wshh_components", ["DATABASE_URL", "VOYAGE_KEY"]) === "offline") {
  throw new Error("_wshh_components: NO_PG is set; there is no vector index to read.");
}

import { corpusProvenance, hydrateDbInstruments, loadDbInstruments, requireLiveCorpus }
  from "../lib/intelligence/corpus";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet, reattributeMissingAnswers, type RecallRow }
  from "./recallSet";

const PAIRS = path.resolve(process.cwd(), "..", "..",
  "project-mgmt", "evidence", "wsha_door_pairs_2026-08-17.jsonl");
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";
const BATCH = 64;

/** The five documents a door can be, cheapest hypothesis first. `profile` is
 *  the control: it is what ships, so its numbers must reproduce the live index.
 *  Named as a property of the SECTION rather than as a list of ids, so a door
 *  the corpus adds tomorrow is covered by the same expression. */
const VARIANTS = ["name", "description", "eligibility", "descElig", "profile"] as const;
type Variant = typeof VARIANTS[number];

interface WshaPair {
  founder: string; regime: string;
  won: { id: string }; shown: { id: string }; draw: string;
}

const cos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb));
};

async function embed(texts: string[], kind: "query" | "document"): Promise<number[][]> {
  const key = process.env.VOYAGE_KEY;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ input: chunk, model: MODEL, input_type: kind }),
    });
    if (!res.ok) throw new Error(`voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    for (const r of sorted) out.push(r.embedding);
  }
  return out;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wshh_components");
  if (corpusProvenance().source !== "postgres") {
    throw new Error("_wshh_components: the corpus is not Postgres; there are no embeddings.");
  }

  const pairs = readFileSync(PAIRS, "utf8").trim().split("\n")
    .map((l) => JSON.parse(l) as WshaPair);
  const DRAW = "13cb71cf3a1d1847";
  if (!pairs.every((p) => p.draw === DRAW)) {
    throw new Error(`_wshh_components: the evidence file is not on draw ${DRAW}.`);
  }

  const { rows: all } = loadRecallSet("wsHH profile components");
  const corpus = loadDbInstruments();
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), () => true);
  const byName = new Map<string, RecallRow>();
  for (const r of fixed.rows.filter((x) => x.split === "holdout" && isDescribed(x))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (!byName.has(r.name)) byName.set(r.name, r);
  }
  const policy: FounderPolicy = founderPolicyFromEnv();

  const doorIds = [...new Set(pairs.flatMap((p) => [p.won.id, p.shown.id]))].sort();
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const rows = (await client.query(
    `SELECT f.id, f.name, COALESCE(f.description,'') AS description,
            COALESCE(f.eligibility_text,'') AS eligibility_text,
            COALESCE(p.profile_text,'') AS profile_text
       FROM funding_instruments f
       LEFT JOIN instrument_profiles p ON p.instrument_id = f.id
      WHERE f.id = ANY($1)`, [doorIds])).rows as {
        id: string; name: string; description: string;
        eligibility_text: string; profile_text: string;
      }[];
  await client.end();
  if (rows.length !== doorIds.length) {
    throw new Error(`_wshh_components: ${rows.length} of ${doorIds.length} doors resolved.`);
  }

  const textOf = (r: typeof rows[number], v: Variant): string => {
    switch (v) {
      case "name": return r.name ?? "";
      case "description": return r.description;
      case "eligibility": return r.eligibility_text;
      case "descElig": return `${r.description}\n\n${r.eligibility_text}`.trim();
      case "profile": return r.profile_text;
    }
  };

  // A door with no text for a variant is EXCLUDED from that variant's tally,
  // never scored as zero: an empty document embeds to some arbitrary point and
  // a pair decided by it would be decided by nothing. Coverage is reported per
  // variant alongside the rate, so a variant cannot look good by answering on
  // the pairs that suit it.
  const vec: Record<Variant, Map<string, number[]>> = Object.fromEntries(
    VARIANTS.map((v) => [v, new Map<string, number[]>()])) as never;
  for (const v of VARIANTS) {
    const present = rows.filter((r) => textOf(r, v).trim().length > 0);
    console.log(`embedding ${present.length}/${rows.length} door(s) as ${v}`);
    const embs = await embed(present.map((r) => textOf(r, v)), "document");
    present.forEach((r, i) => vec[v].set(r.id, embs[i]));
  }

  const founders = pairs.map((p) => {
    const row = byName.get(p.founder);
    if (!row) throw new Error(`_wshh_components: ${p.founder} not in the population.`);
    return (founderIntake(row, policy).opts.description ?? "").trim();
  });
  const uniq = [...new Set(founders)];
  console.log(`embedding ${uniq.length} distinct founder description(s) as query`);
  const qEmb = await embed(uniq, "query");
  const qOf = new Map(uniq.map((d, i) => [d, qEmb[i]]));

  const out = pairs.map((p, i) => {
    const q = qOf.get(founders[i])!;
    const per: Record<string, { won: number | null; shown: number | null }> = {};
    for (const v of VARIANTS) {
      const w = vec[v].get(p.won.id), s = vec[v].get(p.shown.id);
      per[v] = { won: w ? cos(q, w) : null, shown: s ? cos(q, s) : null };
    }
    return { founder: p.founder, regime: p.regime, wonId: p.won.id, shownId: p.shown.id, per };
  });

  console.log("");
  for (const v of VARIANTS) {
    const scored = out.filter((o) => o.per[v].won !== null && o.per[v].shown !== null);
    const wins = scored.filter((o) => o.per[v].won! > o.per[v].shown!).length;
    console.log(
      `${v.padEnd(12)} won>shown ${String(wins).padStart(3)}/${String(scored.length).padStart(3)}`
      + ` = ${(100 * wins / (scored.length || 1)).toFixed(1)}%`
      + `   (${pairs.length - scored.length} pair(s) had no text on one side)`);
  }

  const dest = process.env.OUT ?? "/tmp/wshh_components.json";
  writeFileSync(dest, JSON.stringify({ draw: DRAW, variants: VARIANTS, pairs: out }, null, 2));
  console.log(`\nwrote ${dest}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
