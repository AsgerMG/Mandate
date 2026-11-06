/**
 * WHAT THE SECTOR TERM IS WORTH TODAY, AND WHAT IT WOULD BE WORTH IF THE
 * CORPUS OF RECORD'S SECTOR COLUMN REACHED THE RANKER.
 *
 * FREE — one Postgres read. `VOYAGE_KEY` is deleted before the corpus module
 * loads, so no embedding is bought and the numbers are identical on a machine
 * that holds the key and one that does not. No model calls of any kind.
 *
 * ── The question ───────────────────────────────────────────────────────────
 * Screen one orders on
 *
 *     rowRelevance = wTheme * theme + (1 - wTheme) * sectorFit(mix, sector)
 *
 * and `sectorFit` reads `funding_instruments.sector_mix`, which
 * `populate_funding_instruments.py` derives by counting the SECTORS OF THE
 * COMPANIES a fund has funded. The mix therefore inherits, exactly, whatever
 * `companies.sector_top` holds in the store the rebuild runs against.
 *
 * On 2026-08-13 the two stores disagree about that column: the corpus of
 * record can name eight families and the workstation copy eleven
 * (`_wsgz_record_families.py`). The mixes that ship were built on the eleven.
 * So the live score is NOT degraded — and the question worth measuring is what
 * it costs IF a rebuild ever runs where the column is thin.
 *
 * ── Why the counterfactual is exact and not a simulation ───────────────────
 * A family no company in a store carries cannot appear in any mix counted from
 * that store. That is arithmetic, not modelling: for a founder in such a
 * family `mix[sector]` is absent for EVERY fund, so `sectorFit` returns 0
 * everywhere, and an added term that is constant across the pool contributes
 * nothing to the order. The term does not get worse — it stops existing, and
 * `rowRelevance` silently becomes `wTheme * theme` for those founders.
 *
 * The surviving families are not left intact either: their mixes would be
 * counted from a biased subsample of labelled companies, and the bias is
 * reported per family so the distortion is a figure rather than an adjective.
 *
 * ── Nothing here is enumerated ─────────────────────────────────────────────
 * The surviving family set is INPUT (`--surviving=`), emitted by
 * `_wsgz_record_families.py --emit` from whichever store is named. This file
 * knows no sector names, so it measures whatever the corpus lost, including
 * nothing.
 *
 * Reproduce:
 *   python3 scripts/_wsgz_record_families.py <record.sqlite> --emit
 *   npx tsx scripts/_wsgz_sector_resolution.ts --surviving=<csv from above>
 */
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
const CREDS = requireCredentials("_wsgz_sector_resolution", ["DATABASE_URL"]);

// Proof rather than intention: the semantic path is one import away in the
// module graph and this script must never buy an embedding.
delete process.env.VOYAGE_KEY;

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  if (CREDS === "offline") {
    console.log("_wsgz_sector_resolution: skipped — NO_PG=1. The mixes it measures "
      + "are the LIVE ones; the snapshot is a different corpus and answering off it "
      + "would compare the wrong two things.");
    return;
  }
  const { hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus } =
    await import("../../lib/intelligence/corpus");
  const { sectorFit, hasSectorHistory } = await import("../../lib/intelligence/fit");
  const { SECTOR_OPTIONS } = await import("../../lib/intelligence/types");
  const { COMPANIES } = await import("../../lib/intelligence/__benchCompanies");
  const { toIso2 } = await import("../../lib/intelligence/countryCodes");

  await hydrateDbInstruments();
  requireLiveCorpus("_wsgz_sector_resolution");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const pubs = corpus.filter((i) => offerable.has(i.id));
  const withMix = pubs.filter((i) => hasSectorHistory(i.sectorMix));
  const sectors = SECTOR_OPTIONS.map((o) => o.value);

  const survivingArg = arg("surviving");
  const surviving = new Set(
    (survivingArg ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  if (!surviving.size) {
    throw new Error("--surviving= is required: the families the corpus of record can "
      + "still name. Emit it with `python3 scripts/_wsgz_record_families.py <db> --emit`; "
      + "typing it by hand is how a measurement starts describing a corpus nobody read.");
  }
  /** The same mix, counted in a store that labels only the surviving families. */
  const thinned = (mix: Record<string, number>) =>
    Object.fromEntries(Object.entries(mix).filter(([k]) => surviving.has(k)));

  console.log(`live corpus: ${pubs.length} publishable leaves, ${withMix.length} with a `
    + `sector mix, ${sectors.length} founder sectors in the vocabulary`);
  console.log(`families the corpus of record can name: ${surviving.size} `
    + `[${[...surviving].sort().join(", ")}]`);

  // ── Per founder sector: how much ORDER the term carries, now and after ────
  // "Resolution" is not the mean. A term that scores every fund 0.4 has a fine
  // mean and orders nothing. What matters is how many funds it separates: how
  // many score above zero at all, and how many pile onto the 1.0 ceiling that
  // SECTOR_FULL_MATCH_SHARE creates.
  console.log(`\n  ${"founder sector".padEnd(28)}${"n>0".padStart(6)}`
    + `${"ceil".padStart(6)}${"distinct".padStart(10)}${"mean".padStart(8)}`
    + `   |   ${"n>0".padStart(5)}${"ceil".padStart(6)}${"distinct".padStart(10)}`
    + `${"mean".padStart(8)}  ${"flips".padStart(7)}`);
  console.log(`  ${"".padEnd(28)}${"--- on the mixes that ship ---".padStart(30)}`
    + `   |   ${"--- rebuilt on the record ---".padStart(29)}`);
  let deadFor = 0;
  for (const s of sectors) {
    const now = withMix.map((i) => sectorFit(i.sectorMix, s) ?? 0);
    const cf = withMix.map((i) => sectorFit(thinned(i.sectorMix!), s) ?? 0);
    const nz = (xs: number[]) => xs.filter((x) => x > 0).length;
    const ceil = (xs: number[]) => xs.filter((x) => x >= 1).length;
    const dis = (xs: number[]) => new Set(xs.map((x) => x.toFixed(3))).size;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    // How much of the ORDER survives: pairs the term separates today that it
    // no longer separates, plus pairs it separates the other way round.
    let flips = 0, comparable = 0;
    for (let a = 0; a < withMix.length; a += 1) {
      for (let b = a + 1; b < withMix.length; b += 1) {
        if (now[a] === now[b]) continue;
        comparable += 1;
        if (Math.sign(now[a] - now[b]) !== Math.sign(cf[a] - cf[b])) flips += 1;
      }
    }
    if (nz(cf) === 0) deadFor += 1;
    const pct = comparable ? (100 * flips) / comparable : 0;
    console.log(`  ${s.padEnd(28)}${String(nz(now)).padStart(6)}`
      + `${String(ceil(now)).padStart(6)}${String(dis(now)).padStart(10)}`
      + `${mean(now).toFixed(3).padStart(8)}   |   ${String(nz(cf)).padStart(5)}`
      + `${String(ceil(cf)).padStart(6)}${String(dis(cf)).padStart(10)}`
      + `${mean(cf).toFixed(3).padStart(8)}  ${pct.toFixed(1).padStart(6)}%`);
  }
  console.log(`\n  the term is IDENTICALLY ZERO — no order at all — for ${deadFor} of `
    + `${sectors.length} founder sectors once the mixes are rebuilt on the record.`);

  // ── The same thing where a founder meets it: their own candidate rows ─────
  // Not the memo pool (that needs an embedding and this script buys none) but
  // the leaves the founder's country can draw on, which is the set the pool is
  // cut from. The question is how many rows the term can tell apart at all.
  console.log(`\n  per archetype — the leaves their country can draw on:`);
  console.log(`  ${"archetype".padEnd(26)}${"sector".padEnd(28)}${"leaves".padStart(7)}`
    + `${"share".padStart(7)}${"ceil".padStart(6)}${"|".padStart(4)}`
    + `${"share".padStart(7)}${"ceil".padStart(6)}`);
  for (const t of COMPANIES) {
    const iso = toIso2(t.country);
    const mine = withMix.filter((i) => !i.country || i.country === iso || i.country === "EU");
    const now = mine.map((i) => sectorFit(i.sectorMix, t.sector) ?? 0);
    const cf = mine.map((i) => sectorFit(thinned(i.sectorMix!), t.sector) ?? 0);
    const pos = (xs: number[]) => xs.filter((x) => x > 0).length;
    const ceil = (xs: number[]) => xs.filter((x) => x >= 1).length;
    console.log(`  ${t.archetype.slice(0, 25).padEnd(26)}${t.sector.padEnd(28)}`
      + `${String(mine.length).padStart(7)}${String(pos(now)).padStart(7)}`
      + `${String(ceil(now)).padStart(6)}${"|".padStart(4)}${String(pos(cf)).padStart(7)}`
      + `${String(ceil(cf)).padStart(6)}`);
  }
  console.log(`\n  "share" is how many of those leaves score ANY sector signal; "ceil" `
    + `how many tie at the\n  ${"".padEnd(2)}SECTOR_FULL_MATCH_SHARE ceiling, where the `
    + `term stops separating them.`);
}

main();
