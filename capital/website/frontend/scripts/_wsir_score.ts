// wsIR — score two funnel arms PAIRED, on both measures, with a null and a
// leave-one-regime-out beside them.
//
// FREE. Reads two `FUNNEL_TRACE` files and nothing else: no database, no
// embeddings, no model calls, no credentials, no network. It therefore declares
// no credentials — it reads neither DATABASE_URL nor VOYAGE_KEY, so there is no
// `requireCredentials` call to half-write.
//
// ── Why this exists beside `_wsgx_pairs.ts` ────────────────────────────────
// wsGX's pairer already does the honest binary job: it proves the arm ARRIVED,
// counts discordant pairs, runs McNemar and breaks gains out by regime. It is
// used unchanged and its output is committed beside this one. What it does not
// do is the four things the last two days established as the minimum for a
// ranking claim:
//
//   1. RECIPROCAL RANK as well as the binary. wsII built the recip instrument
//      after EXACT@6 called a real effect a null twice; wsIP resolved
//      +0.0246 [+0.0166, +0.0334] where EXACT@6 on the SAME founders in the
//      SAME run read +0.56 against a ±2.85 half-width and was unreadable.
//      wsIQ then showed the reverse on wsGA's tape — recip is not sharper as a
//      rule. So neither measure is the headline: BOTH are reported, always, and
//      a disagreement between them is a finding rather than a choice.
//   2. A PAIRED BOOTSTRAP interval. Copied from `_wsiq_rescore.ts`, which
//      validates it against wsII's published figures to four decimals.
//   3. A NULL the effect has to clear. wsIJ found a whole gradient that random
//      reordering reproduced with a steeper slope, so an effect that is not
//      compared to churn of its own size is arithmetic. See `signFlipNull`.
//   4. LEAVE-ONE-REGIME-OUT. wsHE's +2.5 was +9.1 inside one Swedish agency and
//      +0.4 everywhere else. A number without its concentration is not usable.
//
// ── The three ranks are three different questions ─────────────────────────
// `POOL_BLEND` replaces the base score, and the base score reaches the founder
// through stages that do not weigh it equally:
//
//   rankAccessible  the pool order the 40-cut reads. The base score is in FULL
//                   control here, so this is where an ordering arm has its
//                   largest possible effect. It measures REACHABILITY.
//   rankWriter      the order after `orderMemoCandidates` — the sibling
//                   reassignment, the ticket multiplier, the name collapse and
//                   PEER PRECEDENCE. For the 81% of founders on the one-seat
//                   branch, every peer-known row is placed ahead of every
//                   peer-unknown one by a POPULATION statistic, so the base
//                   score orders only the lead seat and the peer-unknown tail.
//                   It measures ACCURACY, and it is heavily damped by design.
//
// A gain at the first and not the second is not a contradiction and not a
// failure of the arm: it is the machinery between them, and it is the thing
// this workstream was asked to measure rather than argue about.
import { readFileSync } from "fs";

interface Row {
  i: number; country: string; regime?: string; group?: string; descriptionSource?: string;
  inCorpus: boolean; offerable: boolean;
  rankTable: number | null; rankAccessible: number | null; rankWriter: number | null;
  tableLen: number; accessibleLen: number;
}
interface Trace { header: { startedAt: string; rowOrder: string; awardTerm: string }; rows: Row[] }

function load(file: string): Trace {
  const lines = readFileSync(file, "utf8").trim().split("\n");
  return { header: JSON.parse(lines[0]), rows: lines.slice(1).map((l) => JSON.parse(l) as Row) };
}

const POOL = Number(process.env.POOL ?? 40);
/** The grouping key for leave-one-out. Raw traces carry `regime`; the committed
 *  redacted ones carry an opaque `group` that partitions identically. Either is
 *  read, so a finding can be reproduced from the COMMITTED files by someone who
 *  never sees a fund name — which is the whole point of committing them. */
const groupOf = (r: Row): string => r.group ?? r.regime ?? "?";
/** Optional restriction to founders whose query text came from a given source.
 *  `THEME_WEIGHT = 0.6` and the theme cosine is taken against that text, so a
 *  result on the 76.2% who query with a canned sector sentence and a result on
 *  the 12.3% who use their own words are results about two different products.
 *  Comma-separated; `own` and `canned` are shorthands for the two groupings. */
const STRATUM = process.env.STRATUM;
const OWN = ["own_award_text", "own_project_title"];
function inStratum(r: Row): boolean {
  if (!STRATUM) return true;
  const src = r.descriptionSource;
  if (src === undefined) {
    throw new Error("_wsir_score: STRATUM was set but this trace carries no "
      + "`descriptionSource`. Score the REDACTED traces, which do.");
  }
  const want = STRATUM.split(",").flatMap((t) =>
    t === "own" ? OWN : t === "canned" ? ["none"] : [t]);
  return want.includes(src);
}
const DRAWS = Number(process.env.DRAWS ?? 6000);
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const f4 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(4);
const f2 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(2);

/** seeded PRNG so every figure here is reproducible — `_wsiq_rescore.ts` */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** paired bootstrap over founders — the unit of independence. Verbatim from
 *  `_wsiq_rescore.ts`, where it reproduces wsII's published figures to four
 *  decimals; not re-derived here, because an estimator re-typed is an estimator
 *  that can disagree with the one that was validated. */
function boot(x: number[], draws = DRAWS, seed = 20260819) {
  const rnd = mulberry32(seed);
  const m: number[] = [];
  for (let d = 0; d < draws; d++) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[(rnd() * x.length) | 0];
    m.push(s / x.length);
  }
  m.sort((a, b) => a - b);
  return {
    est: mean(x), lo: m[Math.floor(0.025 * draws)], hi: m[Math.floor(0.975 * draws)],
    pPos: m.filter((v) => v > 0).length / draws,
  };
}

/** ── THE NULL ──────────────────────────────────────────────────────────────
 *  Under "this arm does nothing", a founder's paired delta is as likely to have
 *  come out the other way, so the SIGNS are exchangeable and the magnitudes are
 *  not. Flipping them at random destroys the direction of the churn while
 *  keeping its size exactly, which is the comparison wsIJ's gradient failed:
 *  the question is never "did anything move" but "did it move further one way
 *  than a coin flip over the same movement would have".
 *
 *  This is a null for the DIRECTION of an effect given the churn observed. It
 *  is NOT a substitute for a genuine random-reordering arm, which would also
 *  test whether the churn itself is larger than a shuffle produces; that arm
 *  costs a funnel run and is reported separately where it was affordable. */
function signFlipNull(x: number[], obs: number, draws = DRAWS, seed = 20260820) {
  const rnd = mulberry32(seed);
  let atLeast = 0;
  const nulls: number[] = [];
  for (let d = 0; d < draws; d++) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += rnd() < 0.5 ? x[i] : -x[i];
    const m = s / x.length;
    nulls.push(m);
    if (Math.abs(m) >= Math.abs(obs)) atLeast++;
  }
  nulls.sort((a, b) => a - b);
  return {
    p: atLeast / draws,
    lo: nulls[Math.floor(0.025 * draws)],
    hi: nulls[Math.floor(0.975 * draws)],
  };
}

interface Measure { name: string; binary: boolean; f: (r: Row) => number; fmt: (n: number) => string }

/** The measures. Binary ones are reported in POINTS (x100) so they read against
 *  the funnel's own rows; recip is reported raw, as wsIP and wsII report it. */
const MEASURES: Measure[] = [
  { name: `pool_cut@${POOL} (reach)`, binary: true, fmt: f2,
    f: (r) => (r.rankAccessible != null && r.rankAccessible <= POOL ? 100 : 0) },
  { name: "published@7", binary: true, fmt: f2,
    f: (r) => (r.rankWriter != null && r.rankWriter <= 7 ? 100 : 0) },
  { name: "EXACT@6", binary: true, fmt: f2,
    f: (r) => (r.rankWriter != null && r.rankWriter <= 6 ? 100 : 0) },
  { name: "EXACT@5", binary: true, fmt: f2,
    f: (r) => (r.rankWriter != null && r.rankWriter <= 5 ? 100 : 0) },
  { name: "recip (writer order)", binary: false, fmt: f4,
    f: (r) => (r.rankWriter != null ? 1 / r.rankWriter : 0) },
  { name: "recip (pool order)", binary: false, fmt: f4,
    f: (r) => (r.rankAccessible != null ? 1 / r.rankAccessible : 0) },
];

function main(): void {
  const baseFile = process.env.BASE;
  const armFile = process.env.ARM;
  if (!baseFile || !armFile) throw new Error("_wsir_score: set BASE and ARM to two FUNNEL_TRACE files");
  const base = load(baseFile);
  const arm = load(armFile);

  // The pairing is positional and CHECKED, never assumed — two traces of one
  // draw see the same founders in the same order, and a disagreement means the
  // runs drew different populations whatever seed they name.
  if (base.rows.length !== arm.rows.length) {
    throw new Error(`_wsir_score: ${base.rows.length} founders against ${arm.rows.length}. `
      + "These are two populations and there is no pairing between them.");
  }
  for (let i = 0; i < base.rows.length; i++) {
    if (base.rows[i].country !== arm.rows[i].country || base.rows[i].regime !== arm.rows[i].regime) {
      throw new Error(`_wsir_score: founder ${i} is ${base.rows[i].country}/${groupOf(base.rows[i])} in `
        + `BASE and ${arm.rows[i].country}/${groupOf(arm.rows[i])} in ARM — different draws.`);
    }
  }
  if (base.header.awardTerm !== arm.header.awardTerm) {
    throw new Error(`_wsir_score: AWARD_TERM differs (${base.header.awardTerm} vs `
      + `${arm.header.awardTerm}). Two levers moved, so neither is measured.`);
  }

  // Only founders past the corpus stages can move: everything above the row
  // sort is identical in both arms by construction.
  const pairs = base.rows.map((b, i) => ({ b, a: arm.rows[i] })).filter((p) => p.b.offerable && inStratum(p.b));

  console.log(`BASE       ${baseFile}`);
  console.log(`           row_order=${base.header.rowOrder}  award_term=${base.header.awardTerm}  ${base.header.startedAt}`);
  console.log(`ARM        ${armFile}`);
  console.log(`           row_order=${arm.header.rowOrder}  award_term=${arm.header.awardTerm}  ${arm.header.startedAt}`);
  console.log(`population ${base.rows.length} drawn, ${pairs.length} past the corpus stages`);

  // ── DID THE ARM ARRIVE ───────────────────────────────────────────────────
  // Printed FIRST and independently of any outcome. Every false null in this
  // repo has one shape: a flag that never reached the module, reported as "no
  // effect" in both arms. Zero here means everything below is about nothing.
  for (const [label, key] of [["pool", "rankAccessible"], ["writer", "rankWriter"]] as const) {
    const moved = pairs.filter((p) => p.b[key] !== p.a[key]);
    const shifts = moved.map((p) => Math.abs((p.a[key] ?? 0) - (p.b[key] ?? 0))).sort((x, y) => x - y);
    console.log(`ARM ARRIVED (${label.padEnd(6)}) the won fund's rank differs for ${moved.length}/${pairs.length}`
      + (shifts.length ? `, median shift ${shifts[shifts.length >> 1]} row(s)` : ""));
  }

  if (STRATUM) console.log(`STRATUM     descriptionSource in {${STRATUM}}`);
  const regimes = [...new Set(pairs.map((p) => groupOf(p.b)))];
  console.log(`regimes    ${regimes.length} distinct won-fund regime(s) in the paired population`);

  for (const m of MEASURES) {
    console.log(`\n── ${m.name} ${"─".repeat(Math.max(0, 60 - m.name.length))}`);
    const d = pairs.map((p) => m.f(p.a) - m.f(p.b));
    const b = boot(d);
    const baseline = mean(pairs.map((p) => m.f(p.b)));
    const armv = mean(pairs.map((p) => m.f(p.a)));
    console.log(`  base ${m.fmt(baseline).padStart(9)}   arm ${m.fmt(armv).padStart(9)}`);
    console.log(`  PAIRED delta ${m.fmt(b.est).padStart(9)}  [${m.fmt(b.lo)}, ${m.fmt(b.hi)}]  P(>0)=${b.pPos.toFixed(3)}`);

    if (m.binary) {
      // McNemar on the discordant pairs. The absence of this count is why
      // wsCV's closure is not a measurement of the blend.
      const gains = d.filter((v) => v > 0).length;
      const losses = d.filter((v) => v < 0).length;
      const nd = gains + losses;
      console.log(`  discordant ${nd}  (arm only ${gains}, base only ${losses})`);
      console.log(nd
        ? `  McNemar z  ${(Math.abs(gains - losses) / Math.sqrt(nd)).toFixed(2)}`
        : "  McNemar z  undefined — not one founder changed side");
    } else {
      const moved = d.filter((v) => v !== 0).length;
      console.log(`  moved      ${moved} founder(s) with a non-zero delta`);
    }

    const nul = signFlipNull(d, b.est);
    console.log(`  NULL       sign-flip 95% [${m.fmt(nul.lo)}, ${m.fmt(nul.hi)}]  p=${nul.p.toFixed(4)}`
      + `  ${Math.abs(b.est) > Math.abs(nul.hi) ? "CLEARS its null" : "INSIDE its null"}`);

    // ── LEAVE ONE REGIME OUT ────────────────────────────────────────────────
    // Reported as the WORST case, because the failure mode is a number carried
    // by one market and the reader needs the number without that market.
    const loro = regimes.map((rg) => {
      const kept = pairs.map((p, i) => ({ p, v: d[i] })).filter((x) => groupOf(x.p.b) !== rg);
      return { rg, v: mean(kept.map((x) => x.v)), n: pairs.length - kept.length };
    }).sort((x, y) => x.v - y.v);
    const worst = loro[0];
    const bestC = loro[loro.length - 1];
    console.log(`  LORO       worst ${m.fmt(worst.v)} without ${worst.rg} (n=${worst.n})`
      + `   best ${m.fmt(bestC.v)} without ${bestC.rg} (n=${bestC.n})`);
    const sameSign = loro.filter((x) => Math.sign(x.v) === Math.sign(b.est)).length;
    console.log(`             sign holds in ${sameSign}/${loro.length} leave-one-regime-out folds`);

    if (m.binary) {
      // Concentration of the NET movement, the way wsCS and wsCU report it.
      const byRegime = new Map<string, number>();
      pairs.forEach((p, i) => { if (d[i] !== 0) byRegime.set(groupOf(p.b), (byRegime.get(groupOf(p.b)) ?? 0) + d[i] / 100); });
      const top = [...byRegime.entries()].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
      const net = [...byRegime.values()].reduce((a, c) => a + c, 0);
      console.log(`  CONCENTRATION net ${net >= 0 ? "+" : ""}${net.toFixed(0)} founder(s) over ${top.length} regime(s)`
        + (top.length && net !== 0 ? `, largest single regime ${((100 * top[0][1]) / net).toFixed(0)}% (${top[0][0]})` : ""));
      console.log(`             ${top.slice(0, 6).map(([r, k]) => `${r}:${k >= 0 ? "+" : ""}${k}`).join("  ") || "(none)"}`);
    }
  }
}

main();
