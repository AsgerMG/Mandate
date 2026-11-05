// The regions an instrument's OWN notification declares, cut offline so a guard
// can read them without a database.
//
// ── Why this file exists ───────────────────────────────────────────────────
// `check_winner_not_blocked.ts` asserts that a territorial screen never removes
// a fund from a company the register says WON it. That property is worth
// nothing unless it is measured on every commit, and a check that needs
// DATABASE_URL is a check that skips on CI, on a fresh worktree, and in every
// pull request — which is the shape `loadEnv.ts` records as a green build with
// the floors never evaluated.
//
// The answer key it grades against is already committed. The one input that was
// not is this: two columns of `funding_instruments` that no export carries.
// `public/data/instrument_terms.json` holds gates, awards and liveness and has
// never held a catchment. So it is cut here, once, into a committed artifact.
//
// ── OFFICIAL ONLY, and why the filter belongs in the producer ─────────────
// `catchment_source` distinguishes a region the EC State aid case register
// DECLARES from a region we inferred from where money has landed. Only the
// first is a statement about who may apply; the second is award history, and a
// screen built on it would remove a fund because nobody like you has won it
// yet. The consumer therefore never sees the inferred kind at all — a filter
// that lives in the check can be forgotten by the next check, a filter that
// lives in the cut cannot.
//
// ABSENT IS UNKNOWN, NOT EMPTY. An instrument the register is silent about is
// omitted from `catchments` rather than written as `[]`, because `[]` reads as
// "declares a catchment containing nowhere" and would block everybody. 61% of
// the corpus is silent; the consumer must keep every one of them.
//
// ── Rebuild ────────────────────────────────────────────────────────────────
// Named by ETL/refresh.py (step `official_catchments`, after the Postgres
// publish that fills the column) so it is re-derived by the weekly refresh
// rather than when somebody remembers. Manually:
//
//   cd website/frontend && npx tsx scripts/emit_official_catchments.ts
import { writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("emit_official_catchments", ["DATABASE_URL"]);

import { Client } from "pg";

/** Bound to a constant and written by name, so the tie between this producer
 *  and the file it produces is visible from the source — the shape
 *  `check_artifact_reachability.py` looks for. */
const OUT = path.join(process.cwd(), "lib", "intelligence",
  "officialCatchments.generated.json");

/** The one source of catchment that states who may APPLY. Anything else is a
 *  footprint. Matched as a prefix because the column carries variants
 *  (`ec_case_register`, `ec_case_register_regional`). */
const OFFICIAL_PREFIX = "ec_case_register";

export interface OfficialCatchments {
  generatedAt: string;
  /** Said in the artifact, not only in this file, so a reader who opens the
   *  JSON alone can tell what the region list is a statement ABOUT. */
  source: string;
  instruments: number;
  official: number;
  narrowerThanCountry: number;
  /** id -> declared regions. An id ABSENT here is one the register is silent
   *  about, which is UNKNOWN and must never be read as a removal. */
  catchments: Record<string, string[]>;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<{
    id: string; catchment_regions: string | null; catchment_source: string | null;
  }>(`SELECT id, catchment_regions, catchment_source FROM funding_instruments`);
  await db.end();

  const catchments: Record<string, string[]> = {};
  let narrower = 0;
  for (const r of rows) {
    if (!(r.catchment_source ?? "").startsWith(OFFICIAL_PREFIX)) continue;
    if (!r.catchment_regions) continue;
    const list = JSON.parse(r.catchment_regions) as string[];
    if (!Array.isArray(list) || !list.length) continue;
    catchments[r.id] = list;
    if (list.some((x) => x.length > 2)) narrower++;
  }

  // A cut that came back empty is not an artifact, it is a deletion. Writing it
  // would switch the guard that reads it from red to a clean 0/0 — the exact
  // failure `_wscj_screen.ts` throws over rather than printing.
  if (!rows.length || !Object.keys(catchments).length) {
    throw new Error(`emit_official_catchments: read ${rows.length} instrument(s) `
      + `and ${Object.keys(catchments).length} official catchment(s). Refusing to `
      + `overwrite the committed artifact with an empty cut.`);
  }

  const out: OfficialCatchments = {
    generatedAt: new Date().toISOString(),
    source: "funding_instruments.catchment_regions, restricted to rows whose "
      + `catchment_source starts with "${OFFICIAL_PREFIX}" — the region the `
      + "scheme's own notification declares, never one inferred from award "
      + "history. An id absent from `catchments` is one the register is silent "
      + "about: UNKNOWN, never a removal.",
    instruments: rows.length,
    official: Object.keys(catchments).length,
    narrowerThanCountry: narrower,
    // Sorted, so a re-cut of an unchanged corpus is a no-op in the diff.
    catchments: Object.fromEntries(
      Object.entries(catchments).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${OUT}`);
  console.log(`  ${out.instruments} instruments, ${out.official} with an official `
    + `catchment, ${out.narrowerThanCountry} narrower than their country`);
}

main().catch((e) => { console.error(e); process.exit(1); });
