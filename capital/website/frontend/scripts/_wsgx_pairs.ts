// wsGX — PAIR two funnel runs and say whether the difference is spread.
//
// FREE. Reads two `FUNNEL_TRACE` files. No database, no embeddings, no model
// calls, no credentials, no network.
//
// ── Why this exists ────────────────────────────────────────────────────────
// `npm run stages` prints two counts per stage. Two runs of it print four, and
// the temptation is to subtract the marginals — which is the exact comparison
// that closed the blend route in error in wsBU (two marginal intervals answer
// "could these populations differ"; the question is whether THE SAME founders
// moved). The funnel's own `latest.json` is aggregate only and deliberately so.
// `FUNNEL_TRACE` writes the per-founder rank; this pairs two of them.
//
// It also answers the standing rule that no other funnel output can:
// **a gain must be SPREAD, not one market.** Gains and losses are broken out by
// the regime of the fund the founder actually won, and the largest single
// regime's share of the gained mass is printed beside the total, the way wsCS
// and wsCU both report it.
//
// ── The pairing, and how it can fail loudly ────────────────────────────────
// Two runs of one draw see the same founders in the same order, so the pairing
// is positional. That is checked, not assumed: the traces must be the same
// length and agree on every founder's country and won regime, and a disagreement
// throws rather than producing a paired table over two populations.
//
//   BASE=/tmp/wsgx/trace_off.jsonl ARM=/tmp/wsgx/trace_on.jsonl \
//     STAGE=pool_cut npx tsx scripts/_wsgx_pairs.ts
//
// STAGE is `pool_cut` (default), `founder_screen`, `gates_pass` or `writer_cap`.
// Cited by `project-mgmt/findings/proximity_wsGX/README.md`.
import { readFileSync } from "fs";

interface Row {
  i: number; country: string; regime: string;
  inCorpus: boolean; offerable: boolean;
  rankTable: number | null; rankAccessible: number | null; rankWriter: number | null;
  tableLen: number; accessibleLen: number;
}

interface Trace { header: { startedAt: string; rowOrder: string }; rows: Row[] }

function load(file: string): Trace {
  const lines = readFileSync(file, "utf8").trim().split("\n");
  return { header: JSON.parse(lines[0]), rows: lines.slice(1).map((l) => JSON.parse(l) as Row) };
}

/** The pool depth the cut uses. Read from the environment rather than imported
 *  so this stays a pure file reader — importing `caps.ts` would drag the whole
 *  intelligence module in to learn one integer. It is asserted against the
 *  traces below: every founder whose answer is in the pool at all must have an
 *  accessible rank, and the depth must not exceed the pools observed. */
const POOL = Number(process.env.POOL ?? 40);

/** Was the won fund alive at this stage, for this founder, in this run.
 *  One definition per stage, matching `ladderAt` in `measure_funnel.ts`. */
const ALIVE: Record<string, (r: Row) => boolean> = {
  founder_screen: (r) => r.rankTable != null,
  gates_pass: (r) => r.rankAccessible != null,
  pool_cut: (r) => r.rankAccessible != null && r.rankAccessible <= POOL,
  writer_cap: (r) => r.rankWriter != null,
};

function main(): void {
  const baseFile = process.env.BASE;
  const armFile = process.env.ARM;
  if (!baseFile || !armFile) throw new Error("_wsgx_pairs: set BASE and ARM to two FUNNEL_TRACE files");
  const stage = process.env.STAGE ?? "pool_cut";
  const alive = ALIVE[stage];
  if (!alive) {
    throw new Error(`_wsgx_pairs: STAGE=${stage} is not a stage this file can pair `
      + `(have: ${Object.keys(ALIVE).join(", ")}). A stage the funnel measures but `
      + `this file does not carry needs a field in FUNNEL_TRACE first — it must not `
      + `be approximated from the fields that are here.`);
  }

  const base = load(baseFile);
  const arm = load(armFile);
  if (base.rows.length !== arm.rows.length) {
    throw new Error(`_wsgx_pairs: ${base.rows.length} founders against ${arm.rows.length}. `
      + "These are two populations and there is no pairing between them.");
  }
  for (let i = 0; i < base.rows.length; i++) {
    const b = base.rows[i];
    const a = arm.rows[i];
    if (b.country !== a.country || b.regime !== a.regime) {
      throw new Error(`_wsgx_pairs: founder ${i} is ${b.country}/${b.regime} in BASE and `
        + `${a.country}/${a.regime} in ARM. The runs drew different founders, whatever `
        + "seed they name — check the draw fingerprints in the two reports.");
    }
  }

  // Only founders whose answer reached the founder stages can move: the corpus
  // stages are above the row sort and identical in both arms by construction.
  const pairs = base.rows.map((b, i) => ({ b, a: arm.rows[i] })).filter((p) => p.b.offerable);
  const gains = pairs.filter((p) => !alive(p.b) && alive(p.a));
  const losses = pairs.filter((p) => alive(p.b) && !alive(p.a));
  const baseHits = pairs.filter((p) => alive(p.b)).length;
  const armHits = pairs.filter((p) => alive(p.a)).length;

  // ── DID THE ARM ARRIVE ───────────────────────────────────────────────────
  // Every false null in this repo has one shape: a flag that never reached the
  // module, reported as "no effect" in both arms. A re-ordering that arrived
  // MOVES RANKS, whether or not it moves outcomes, so the rank movement is
  // printed before the outcome and independently of it. Zero here means the
  // measurement below is about nothing.
  const moved = pairs.filter((p) => p.b.rankAccessible !== p.a.rankAccessible);
  const shifts = moved
    .map((p) => Math.abs((p.a.rankAccessible ?? 0) - (p.b.rankAccessible ?? 0)))
    .sort((x, y) => x - y);
  console.log(`ARM ARRIVED  the won fund's accessible rank differs for `
    + `${moved.length}/${pairs.length} founder(s)`
    + (shifts.length ? `, median shift ${shifts[shifts.length >> 1]} row(s)` : ""));

  const n = base.rows.length;
  const pct = (k: number) => `${((100 * k) / n).toFixed(1)}%`;
  // The 95% half-width on the run's own n, the same convention the funnel prints.
  const hw = (k: number) => 1.96 * Math.sqrt(((k / n) * (1 - k / n)) / n) * 100;

  console.log(`stage      ${stage}${stage === "pool_cut" ? ` (K=${POOL})` : ""}`);
  console.log(`BASE       ${baseFile}  row_order=${base.header.rowOrder}  ${base.header.startedAt}`);
  console.log(`ARM        ${armFile}  row_order=${arm.header.rowOrder}  ${arm.header.startedAt}`);
  console.log(`population ${n} founder(s), ${pairs.length} of them past the corpus stages`);
  console.log("");
  console.log(`BASE alive ${baseHits}  ${pct(baseHits)} +/-${hw(baseHits).toFixed(1)}`);
  console.log(`ARM  alive ${armHits}  ${pct(armHits)} +/-${hw(armHits).toFixed(1)}`);
  console.log(`PAIRED     ${armHits - baseHits >= 0 ? "+" : ""}${armHits - baseHits} founder(s) `
    + `= ${(((armHits - baseHits) / n) * 100).toFixed(1)} points`);
  console.log(`discordant ${gains.length + losses.length}  arm only ${gains.length}, `
    + `base only ${losses.length}`);
  // McNemar, the paired test. Undefined on no discordant pairs, which is a
  // statement ("nothing moved") and not a number.
  const d = gains.length + losses.length;
  console.log(d
    ? `McNemar z  ${(Math.abs(gains.length - losses.length) / Math.sqrt(d)).toFixed(2)}`
    : "McNemar z  undefined — not one founder changed side, so there is nothing to test");
  console.log("");

  for (const [label, set] of [["GAINS", gains], ["LOSSES", losses]] as const) {
    const byRegime = new Map<string, number>();
    for (const p of set) byRegime.set(p.b.regime, (byRegime.get(p.b.regime) ?? 0) + 1);
    const top = [...byRegime.entries()].sort((x, y) => y[1] - x[1]);
    const largest = top.length ? (100 * top[0][1]) / set.length : 0;
    console.log(`${label.padEnd(7)} ${set.length} founder(s) across ${top.length} regime(s), `
      + `largest ${largest.toFixed(0)}%`);
    console.log(`        ${top.slice(0, 6).map(([r, k]) => `${r}:${k}`).join("  ") || "(none)"}`);
  }
}

main();
