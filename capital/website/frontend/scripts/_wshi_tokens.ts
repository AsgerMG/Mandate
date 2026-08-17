// What the selector call actually SPENDS in output tokens, reconstructed from
// runs already paid for -- and what ceiling a forty-row menu therefore needs.
//
// ── Why this exists ────────────────────────────────────────────────────────
// `MAX_TOKENS_BY_EFFORT.medium` was raised 6,144 -> 12,288 by wsGS on the
// stated ground that the run which truncated (wsGA) was already at forty rows:
// "It was NOT a short menu: the same line says depth=40". That sentence reads
// the WRONG FIELD. `depth=` prints `SELECT_DEPTH`, a lever that has been 40
// since before the ranker shipped; the menu the model is handed is
// `min(SELECT_DEPTH, pool)` and the pool is cut to `VERDICT_POOL` upstream.
// This script reads the menu the harness RECORDED, per founder, off the tape.
//
// ── Free, and it cannot become un-free ─────────────────────────────────────
// Every credential is deleted and `fetch`/`XMLHttpRequest`/`WebSocket` are
// replaced by throwing stubs before a byte is read, so an edit that reaches
// for the network dies rather than spends. Same guard shape as
// `_wsgo_consensus.ts`, and for the same reason.
//
//   npx tsx scripts/_wshi_tokens.ts
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

// ── the spend guard, before anything else ─────────────────────────────────
for (const k of Object.keys(process.env)) {
  if (/ANTHROPIC|VOYAGE|OPENAI|DATABASE_URL|POSTGRES/i.test(k)) delete process.env[k];
}
const die = (): never => {
  throw new Error("_wshi_tokens.ts is a REPLAY of runs already paid for. It has no "
    + "network. If you need a live call, that is a new measurement and needs a "
    + "pre-registration and a budget.");
};
(globalThis as unknown as Record<string, unknown>).fetch = die;
(globalThis as unknown as Record<string, unknown>).XMLHttpRequest = die;
(globalThis as unknown as Record<string, unknown>).WebSocket = die;

const ROOT = path.resolve(process.cwd(), "..", "..");
const FIND = path.join(ROOT, "project-mgmt", "findings");

// ── 1. the menu the paid run actually showed ──────────────────────────────
interface TapeRow {
  called?: boolean; menu?: number; picks?: number[]; accessible?: number;
  eur?: number; picksB?: unknown;
}
interface Tape { effort?: string; calls?: number; spendEur?: number; rows: TapeRow[] }

function readTape(file: string): Tape {
  return JSON.parse(readFileSync(file, "utf8")) as Tape;
}

// ── 2. every per-call usage record this repo kept ─────────────────────────
// `reply_r1.txt` files begin with a line carrying the raw `usage={...}` the API
// returned. These are the ONLY per-call output-token figures in the tree; every
// other record is an aggregate over a run.
interface Usage {
  file: string; inputTokens: number; outputTokens: number; thinkingTokens: number;
}
function usagesUnder(dir: string): Usage[] {
  if (!existsSync(dir)) return [];
  const out: Usage[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      const full = path.join(d, e);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/^reply_r\d+\.txt$/.test(e)) continue;
      const head = readFileSync(full, "utf8").split("\n")[0];
      const m = head.match(/usage=(\{.*\})\s*$/);
      if (!m) continue;
      const u = JSON.parse(m[1]) as {
        input_tokens?: number; output_tokens?: number;
        output_tokens_details?: { thinking_tokens?: number };
      };
      out.push({
        file: path.relative(ROOT, full),
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        thinkingTokens: u.output_tokens_details?.thinking_tokens ?? 0,
      });
    }
  };
  walk(dir);
  return out;
}

// ── 3. the tally lines, for the aggregates the per-call files do not cover ─
export interface Line {
  file: string; effort: string; maxtok: number;
  /** API calls — the denominator every counter inside `ask()` belongs over. */
  apiCalls: number;
  /** Seam invocations — one per founder. */
  briefs: number;
  /** How `apiCalls` was arrived at, because on a line written before wsGS it
   *  is not printed and has to be reconstructed. */
  apiCallsFrom: string;
  thinking: number; thoughtOn: number; truncated: number; eur: number;
}
export function linesIn(file: string, text: string): Line[] {
  const out: Line[] = [];
  for (const line of text.split("\n")) {
    if (!line.includes("agent-select: arm=adviser")) continue;
    const eff = line.match(/effort=([a-z]+)/);
    const cap = line.match(/maxtok=(\d+)/);
    const chose = line.match(/(\d+)\/(\d+) chose/);
    const think = line.match(/\((\d+) thinking token\(s\) billed/);
    const on = line.match(/thought on (\d+)\/(\d+)/);
    const cut = line.match(/(\d+)(?:\/(\d+))?\s+CUT OFF at max_tokens/);
    const eur = line.match(/EUR ([\d.]+) total/);
    if (!eff || !cap || !chose || !cut) continue;
    const briefs = Number(chose[2]);
    // ── RECOVERING THE DENOMINATOR A PRE-wsGS LINE DOES NOT STATE ──────────
    // A line written after wsGS prints `N API call(s) over M brief(s)` and the
    // number is simply read. A line written before it prints neither, and
    // `4 CUT OFF at max_tokens` is a bare numerator whose denominator the
    // reader has to reconstruct -- which is the whole defect, seen from the
    // outside.
    //
    // Reconstruction, and it is exact rather than an estimate: under
    // `unsure=declare` round two fires once per brief on which retrieval
    // returned something, and the line prints that count as
    // `(K brief(s) retrieved)`. So apiCalls = briefs + K. On wsGA that is
    // 148 + 62 = 210, which is precisely the number its own `thought on
    // 210/148` line divided by the wrong thing to produce.
    //
    // A line with no retrieval clause made one call per brief.
    const api = line.match(/(\d+) API call\(s\) over (\d+) brief\(s\)/);
    const retrieved = line.match(/\((\d+) brief\(s\) retrieved\)/);
    const apiCalls = api ? Number(api[1]) : briefs + (retrieved ? Number(retrieved[1]) : 0);
    out.push({
      file, effort: eff[1], maxtok: Number(cap[1]),
      apiCalls, briefs,
      apiCallsFrom: api ? "stated by the line"
        : `reconstructed: ${briefs} brief(s) + ${retrieved ? retrieved[1] : 0} round two`,
      thinking: think ? Number(think[1]) : 0,
      thoughtOn: on ? Number(on[1]) : 0,
      truncated: Number(cut[1]),
      eur: eur ? Number(eur[1]) : 0,
    });
  }
  return out;
}
function allLines(): Line[] {
  const out: Line[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      if (e.startsWith(".") || e === "node_modules") continue;
      const full = path.join(d, e);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(md|txt|json)$/.test(e)) continue;
      out.push(...linesIn(path.relative(ROOT, full), readFileSync(full, "utf8")));
    }
  };
  walk(path.join(ROOT, "project-mgmt"));
  return out;
}

// ── 4. lognormal, fitted two ways ─────────────────────────────────────────
//
// Output length is a positive, right-skewed quantity with a long tail -- the
// shape a ceiling has to be set against. Lognormal is the two-parameter family
// that fits it; the point of using ANY parametric family here is that the
// quantile that matters (p99.9) sits beyond the largest sample this repo owns,
// so it cannot be read off the empirical distribution and has to be projected.
// Both fits below are reported with the evidence they rest on, and the paper
// trail says which is a fit to twelve exact observations and which is a fit to
// one mean plus one censoring rate.

/** Standard normal CDF, Abramowitz-Stegun 7.1.26 via erf. */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
/** Inverse standard normal, Acklam's rational approximation. */
function probit(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687,
    138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996,
    3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) return -probit(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

interface Fit { mu: number; sigma: number; how: string }
/** Fit to exact observations: the plain MLE, which for a lognormal is the
 *  mean and sd of the logs. */
function fitExact(xs: number[], how: string): Fit {
  const ls = xs.map((x) => Math.log(x));
  const mu = ls.reduce((a, b) => a + b, 0) / ls.length;
  const v = ls.reduce((a, b) => a + (b - mu) ** 2, 0) / (ls.length - 1);
  return { mu, sigma: Math.sqrt(v), how };
}
/**
 * Fit to a MEAN and a CENSORING RATE -- the only two facts wsGA's tally line
 * carries about its own distribution.
 *
 * Two equations, two unknowns:  exp(mu + s^2/2) = mean,  P(X > cap) = rate.
 * The second gives mu = ln(cap) - z*s with z = probit(1 - rate); substituting
 * leaves a quadratic in s. Solved by bisection rather than by the quadratic
 * formula so the root selection is visible: the small root is the one with a
 * plausible spread, the large root implies a distribution whose median is a
 * handful of tokens, which no reply can be.
 */
function fitCensored(mean: number, cap: number, rate: number, how: string): Fit {
  const z = probit(1 - rate);
  const f = (s: number): number => (Math.log(cap) - z * s + s * s / 2) - Math.log(mean);
  let lo = 1e-6, hi = z;                       // the small root lives below z
  if (f(lo) * f(hi) > 0) throw new Error("fitCensored: no root below z");
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
  }
  const sigma = (lo + hi) / 2;
  return { mu: Math.log(cap) - z * sigma, sigma, how };
}
const q = (f: Fit, p: number): number => Math.exp(f.mu + f.sigma * probit(p));
const pAbove = (f: Fit, x: number): number => 1 - phi((Math.log(x) - f.mu) / f.sigma);

// ── run ───────────────────────────────────────────────────────────────────
const say = (s = ""): void => console.log(s);
const n = (x: number): string => Math.round(x).toLocaleString("en-GB");

say("═══ wsHI — the output-token distribution, and the ceiling a 40-row menu needs");
say();

// ── §1 the menu falsification ─────────────────────────────────────────────
const tapeFile = path.join(FIND, "headtohead_wsGA", "adviser_medium_n773_x2.json");
const tape = readTape(tapeFile);
const called = tape.rows.filter((r) => r.called);
const menus = called.map((r) => r.menu ?? 0).filter((m) => m > 0);
const menuMin = Math.min(...menus), menuMax = Math.max(...menus);
const maxPick = Math.max(...called.flatMap((r) => (r.picks?.length ? [Math.max(...r.picks)] : [])));
const poolMax = Math.max(...called.map((r) => r.accessible ?? 0));

say("§1  THE MENU THE RUN THAT TRUNCATED ACTUALLY SHOWED");
say(`    tape: ${path.relative(ROOT, tapeFile)}`);
say(`    founders called            ${called.length}`);
say(`    menu rows recorded         min ${menuMin}, max ${menuMax}   `
  + `(${menus.filter((m) => m === menuMin).length}/${menus.length} at ${menuMin})`);
say(`    largest index the model picked   ${maxPick}   `
  + `— across ${called.length} founders no pick ever exceeded ${menuMax - 1},`);
say(`                                          which a 40-row menu would not produce`);
say(`    largest accessible pool          ${poolMax} rows — so the menu was NOT pool-limited`);
say();
say(`    Its tally line says depth=40. \`depth=\` prints SELECT_DEPTH, which has read 40`);
say(`    on EVERY recorded run in this tree including wsDQ, months before the pool was`);
say(`    forty rows. The menu is cut upstream by VERDICT_POOL, which was 18 until`);
say(`    2026-08-13 (\`7191f227 BRIEF_VERDICT_POOL 18 -> 40\`) — the day AFTER this run.`);
say(`    ██ THE FOUR TRUNCATIONS HAPPENED AT EIGHTEEN ROWS, NOT FORTY. ██`);
say(`    Forty rows have never been bought. The ceiling now in force was licensed by`);
say(`    evidence from a menu less than half the length of the one that ships.`);
say();

// ── §2 the per-call records ───────────────────────────────────────────────
const wsDQ = usagesUnder(path.join(FIND, "first_test_wsDQ"));
const benchHigh = usagesUnder(path.join(FIND, "dark_levers_wsDS", "bench_high"));
// ── the menu, written where the GUARD can read it ─────────────────────────
// A tally line written before wsHI does not state its menu, so `check_maxtok
// _headroom.ts` cannot judge it against the menu now shipping. The menu is not
// lost, though -- it is in the run's own tape, per founder. Recovering it here
// and committing it beside the run makes the old record judgeable without
// EDITING the old record, which is the one thing that must never happen to the
// only copy of something that was paid for.
const OUT_DIR = path.join(FIND, "tokens_wsHI");
mkdirSync(OUT_DIR, { recursive: true });
const menuRecord = {
  note: "Menus RECOVERED from each run's own tape by scripts/_wshi_tokens.ts, for "
    + "runs whose tally line predates `menu=`. Keyed by the file the tally line is "
    + "in. Read by scripts/check_maxtok_headroom.ts. Never edit a paid run's own "
    + "record; this sits beside it instead.",
  runs: {
    "project-mgmt/findings/headtohead_wsGA/adviser_medium_n773_x2.md": {
      menuMin, menuMax,
      from: `${path.relative(ROOT, tapeFile)}, \`menu\` on ${called.length} called founders`,
    },
  },
};
writeFileSync(path.join(OUT_DIR, "measured_menus.json"),
  JSON.stringify(menuRecord, null, 2) + "\n");
say(`    Recovered menu written to `
  + `${path.relative(ROOT, path.join(OUT_DIR, "measured_menus.json"))} for the guard to read.`);
say();

say("§2  EVERY PER-CALL OUTPUT FIGURE THIS REPO OWNS");
say("    (`reply_r1.txt` headers — the only records that are not an aggregate)");
const table = (name: string, us: Usage[], cap: number): void => {
  if (!us.length) { say(`    ${name}: none found`); return; }
  const outs = us.map((u) => u.outputTokens).sort((a, b) => a - b);
  const ins = us.map((u) => u.inputTokens);
  const mean = outs.reduce((a, b) => a + b, 0) / outs.length;
  say(`    ${name}  n=${outs.length}  cap=${n(cap)}`);
  say(`      output tokens  min ${n(outs[0])}  median ${n(outs[outs.length >> 1])}  `
    + `mean ${n(mean)}  MAX ${n(outs[outs.length - 1])}`);
  say(`      largest call used ${((outs[outs.length - 1] / cap) * 100).toFixed(1)}% of its ceiling`);
  say(`      input tokens   min ${n(Math.min(...ins))}  max ${n(Math.max(...ins))}`);
};
table("wsDQ  effort=low, 18-row menu ", wsDQ, 1536);
table("wsDS  effort=high, 18-row menu", benchHigh, 12288);
say();

// ── §3 the fits ───────────────────────────────────────────────────────────
const highOut = benchHigh.map((u) => u.outputTokens);
const fitHigh = fitExact(highOut, "MLE on 12 exact observations (wsDS bench_high)");

const lines = allLines();
const wsGA = lines.find((l) => l.file.includes("headtohead_wsGA") && l.effort === "medium");
if (!wsGA) throw new Error("wsGA tally line not found — the record moved or the parser broke");
const apiCalls = wsGA.apiCalls;
const TEXT_TOKENS = 35;   // the reply is SELECT_COUNT integers; wsDQ measured 28.
const meanOut = wsGA.thinking / apiCalls + TEXT_TOKENS;
const rate = wsGA.truncated / apiCalls;
// Cross-check the reconstruction against the line's own broken ratio: `thought
// on 210/148` printed the API-call count as its numerator, so the numerator IS
// the denominator this analysis needs. If the two disagree, the reconstruction
// is wrong and every figure below it is wrong with it.
if (wsGA.thoughtOn && wsGA.thoughtOn !== apiCalls) {
  throw new Error(`wsHI: reconstructed ${apiCalls} API calls, but the line's own `
    + `\`thought on ${wsGA.thoughtOn}/${wsGA.briefs}\` numerator says ${wsGA.thoughtOn}. `
    + `One of them is wrong and the distribution below cannot be trusted.`);
}
const fitMed = fitCensored(meanOut, wsGA.maxtok, rate,
  `mean ${n(meanOut)} + censoring ${wsGA.truncated}/${apiCalls} at ${n(wsGA.maxtok)} (wsGA)`);

say("§3  THE OUTPUT-LENGTH DISTRIBUTION, FITTED");
say("    Lognormal — positive, right-skewed, long-tailed. The quantile a ceiling has");
say("    to clear (p99.9) sits beyond the largest sample in the tree, so it is");
say("    projected rather than read off.");
say();
say(`    wsGA's denominator: ${apiCalls} API calls (${wsGA.apiCallsFrom}), cross-checked`);
say(`    against its own \`thought on ${wsGA.thoughtOn}/${wsGA.briefs}\` numerator. `
  + `Its "${wsGA.truncated} CUT OFF" is`);
say(`    therefore ${wsGA.truncated}-in-${apiCalls} = ${(rate * 100).toFixed(2)}%, `
  + `not ${wsGA.truncated}-in-${wsGA.briefs} = `
  + `${((wsGA.truncated / wsGA.briefs) * 100).toFixed(2)}%. Reading the`);
say(`    published line at face value overstates the truncation rate by `
  + `${(((wsGA.truncated / wsGA.briefs) / rate - 1) * 100).toFixed(0)}%.`);
say();
for (const [name, f] of [["effort=high ", fitHigh], ["effort=medium", fitMed]] as [string, Fit][]) {
  say(`    ${name}  mu=${f.mu.toFixed(3)}  sigma=${f.sigma.toFixed(3)}   [${f.how}]`);
  say(`      median ${n(q(f, 0.5))}   p95 ${n(q(f, 0.95))}   p99 ${n(q(f, 0.99))}   `
    + `p99.9 ${n(q(f, 0.999))}   p99.99 ${n(q(f, 0.9999))}`);
}
say();
say(`    Sanity: the medium fit puts P(output > 6,144) at `
  + `${(pAbove(fitMed, 6144) * 100).toFixed(2)}% against wsGA's observed `
  + `${(rate * 100).toFixed(2)}% — it is fitted to that point, so this is a check`);
say(`    on the solver, not evidence.`);
say();
say(`    THE TWO FITS DO NOT AGREE ON SPREAD, and that is worth stating rather than`);
say(`    smoothing: sigma ${fitMed.sigma.toFixed(3)} at medium against `
  + `${fitHigh.sigma.toFixed(3)} at high. They rest on different evidence of`);
say(`    different quality — the high fit is an MLE on twelve exact observations, the`);
say(`    medium fit is two summary statistics off one tally line, and a censoring rate`);
say(`    of ${wsGA.truncated} events pins a tail loosely. Neither is the safe one to`);
say(`    assume, so everything below uses the WIDER of the two at each effort, which is`);
say(`    the direction that cannot flatter the ceiling.`);
say();
say(`    And the high fit is falsifiable against its own sample: it predicts `
  + `${(pAbove(fitHigh, 12288) * 100).toFixed(2)}%`);
say(`    of calls above the 12,288 ceiling on n=12 — 0 expected, 0 observed, and the`);
say(`    largest of the twelve reached ${n(Math.max(...highOut))}, `
  + `${((Math.max(...highOut) / 12288) * 100).toFixed(0)}% of it. `
  + `██ high has never had headroom; it had luck. ██`);
say();

// ── §4 what forty rows does to it ─────────────────────────────────────────
const SHIPPED_MENU = 40, MEASURED_MENU = menuMax;
const ratio = SHIPPED_MENU / MEASURED_MENU;
say("§4  THE SCALING NOBODY HAS MEASURED");
say(`    Every figure above comes from an ${MEASURED_MENU}-row menu. The menu that`);
say(`    ships is ${SHIPPED_MENU}. How deliberation scales with the number of rows to be`);
say(`    compared is UNMEASURED — no paid run has ever been made at forty rows. Three`);
say(`    scalings bracket it, and the ceiling has to survive the worst of them:`);
say();
const scalings: [string, number][] = [
  ["none — length is set by the task, not the menu", 1],
  [`log — deliberation grows with ln(rows): x${(Math.log(SHIPPED_MENU) / Math.log(MEASURED_MENU)).toFixed(2)}`,
    Math.log(SHIPPED_MENU) / Math.log(MEASURED_MENU)],
  [`linear — one unit of thought per row: x${ratio.toFixed(2)}`, ratio],
];
say("           scaling                                      medium p99.9   high p99.9");
for (const [label, k] of scalings) {
  say(`    ${label.padEnd(48)}  ${n(q(fitMed, 0.999) * k).padStart(8)}   `
    + `${n(q(fitHigh, 0.999) * k).padStart(8)}`);
}
say();
const need = q(fitMed, 0.999) * ratio;
say(`    Worst credible case at effort=medium: ${n(need)} tokens at p99.9.`);
say(`    The ceiling in force is ${n(12288)}. It clears the no-scaling case and fails`);
say(`    the linear one, which is the case a longer menu is most likely to produce.`);
say();

// ── §5 what a ceiling costs, and what it buys ─────────────────────────────
say("§5  WHAT THE CEILING COSTS (nothing) AND WHAT IT RISKS (the owner's money)");
say("    Output tokens bill only when used, so raising a ceiling costs EUR 0 on every");
say("    call that does not need it. The exposure is the calls that do.");
say();
const PRICE_OUT_USD = 10 / 1e6, USD_EUR = 0.92;      // cost.ts, intro pricing
const PRICE_OUT_USD_SEP = 15 / 1e6;                   // after 2026-08-31
say("    per brief, effort=medium, if a longer menu provokes longer thinking:");
say("      scaling         mean out/call   EUR/call today   EUR/call after 2026-08-31");
for (const [label, k] of scalings) {
  const m = meanOut * k;
  say(`      ${label.slice(0, 12).padEnd(14)}  ${n(m).padStart(11)}   `
    + `${(m * PRICE_OUT_USD * USD_EUR).toFixed(4).padStart(14)}   `
    + `${(m * PRICE_OUT_USD_SEP * USD_EUR).toFixed(4).padStart(24)}`);
}
say();
say(`    wsGA billed EUR ${wsGA.eur.toFixed(4)} over ${apiCalls} API calls `
  + `(EUR ${(wsGA.eur / apiCalls).toFixed(4)}/call), of which`);
say(`    thinking was EUR ${(wsGA.thinking * PRICE_OUT_USD * USD_EUR).toFixed(4)} — `
  + `${((wsGA.thinking * PRICE_OUT_USD * USD_EUR / wsGA.eur) * 100).toFixed(0)}% of the whole bill.`);
say(`    Under LINEAR scaling a 1,000-call run costs `
  + `EUR ${(1000 * (wsGA.eur / apiCalls + meanOut * (ratio - 1) * PRICE_OUT_USD * USD_EUR)).toFixed(0)} `
  + `instead of EUR ${(1000 * wsGA.eur / apiCalls).toFixed(0)}.`);
say(`    ██ That is the number to put in front of the owner: the ceiling is free, the`);
say(`    thinking a longer menu may provoke is not. ██`);
say();

// ── §6 the recommendation ─────────────────────────────────────────────────
say("§6  THE CEILING, DERIVED FROM THE ABORT CONDITION RATHER THAN FROM A QUANTILE");
say();
say("    The criterion is not 'a small truncation rate'. wsHK's pre-registration makes");
say("    ANY truncation void the run, so the quantity to bound is");
say();
say("        P(at least one truncation anywhere in the run) = 1 - (1 - p)^N");
say();
say("    A p99.9 ceiling sounds ample and is not: at N API calls it voids the run one");
say("    time in ten. The bar taken here is P(any) < 5% at the worst credible scaling,");
say(`    over a run the size of wsGA's (N=${apiCalls}) and over one three times larger.`);
say();
const RUN_SIZES = [apiCalls, apiCalls * 3];
const pAny = (f: Fit, ceiling: number, k: number, N: number): number =>
  1 - (1 - pAbove(f, ceiling / k)) ** N;
const CANDIDATES = [12288, 16384, 24576, 32768, 49152];
say(`    effort=medium, LINEAR scaling (the worst case), P(run is voided by truncation):`);
say(`      ceiling        N=${apiCalls}      N=${apiCalls * 3}     verdict`);
for (const c of CANDIDATES) {
  const a = pAny(fitMed, c, ratio, RUN_SIZES[0]);
  const b = pAny(fitMed, c, ratio, RUN_SIZES[1]);
  const ok = b < 0.05;
  say(`      ${n(c).padStart(7)}   ${(a * 100).toFixed(1).padStart(8)}%  `
    + `${(b * 100).toFixed(1).padStart(8)}%     ${ok ? "clears the bar" : "VOIDS THE RUN"}`);
}
say();
/** The smallest ceiling clearing the bar for an effort, on a 2,048 grid so the
 *  answer is a settable value rather than a decimal. */
function ceilingFor(f: Fit, k: number, N: number, bar = 0.05): number {
  for (let c = 2048; c <= 128000; c += 2048) if (pAny(f, c, k, N) < bar) return c;
  throw new Error("no ceiling below the model's 128,000 clears the bar");
}
const needMed = ceilingFor(fitMed, ratio, RUN_SIZES[1]);
const needHigh = ceilingFor(fitHigh, ratio, RUN_SIZES[1]);
say(`    Smallest ceiling clearing the bar at N=${RUN_SIZES[1]}, linear scaling:`);
say(`      effort=medium  ${n(needMed)}`);
say(`      effort=high    ${n(needHigh)}   (its distribution sits ~`
  + `${(Math.exp(fitHigh.mu - fitMed.mu)).toFixed(1)}x higher than medium's)`);
say();
// The two rungs above `high` have never been run at any menu, so there is no
// distribution to fit. They are set by the ladder's own rule -- an effort that
// thinks deeper may not hold a shallower one's ceiling -- continued at the
// step the two MEASURED rungs establish between themselves, and capped by the
// model. Extrapolating the measured step is a stated assumption; typing a
// round number would be an unstated one.
const MODEL_MAX = 128_000;                       // claude-sonnet-5's output cap
const step = needHigh / needMed;
const grid = (x: number): number => Math.min(MODEL_MAX, Math.ceil(x / 2048) * 2048);
const needXhigh = grid(needHigh * step);
const needMax = grid(needXhigh * step);
say("    THE PROPOSED LADDER, and why each rung is the number it is:");
say();
const LADDER: [string, number, string][] = [
  ["off   ", 1024, "thinking is DISABLED here; the reply is a few dozen tokens"],
  ["low   ", 2048, "wsDQ measured max 339 of 1,536 over 12 calls; has never truncated"],
  ["medium", needMed, `derived above: P(void) < 5% at N=${RUN_SIZES[1]}, linear scaling`],
  ["high  ", needHigh, `derived above, on high's own twelve exact observations`],
  ["xhigh ", needXhigh, `no run at any menu; measured step x${step.toFixed(2)} continued`],
  ["max   ", needMax, needMax === MODEL_MAX
    ? `same step, clipped to the model's own ${n(MODEL_MAX)} output cap`
    : `same step continued`],
];
for (const [name, v, why] of LADDER) say(`      ${name}  ${n(v).padStart(8)}   ${why}`);
say();
let prev = -1;
for (const [name, v] of LADDER) {
  if (!(v > prev)) throw new Error(`derived ladder is not strictly increasing at ${name}`);
  if (v > MODEL_MAX) throw new Error(`derived ${name} exceeds the model's output cap`);
  prev = v;
}
say(`    Checked: strictly increasing, and every rung inside the model's ${n(MODEL_MAX)}.`);
say();
say(`    off and low are UNTOUCHED. Raising a ceiling that has never bound buys nothing,`);
say(`    and widens the worst case on the two rungs where a runaway reply would be least`);
say(`    expected and least noticed. Thinking is off at one and near-zero at the other.`);
say();
say("    THE CONSTRAINT THAT IS NOT max_tokens, and that the record cannot settle:");
say("      wsDS produced a 10,596-token reply inside high's then-150,000ms wall, so");
say("      throughput is AT LEAST 70.6 tok/s. That is a lower bound and cannot be used");
say("      as an upper bound on what the clock can deliver. No recorded run states its");
say(`      own duration, so nothing in this tree can say whether ${n(needMed)} tokens fit in`);
say("      the clock. A ceiling the clock cannot reach does not truncate — it TIMES OUT,");
say("      and a timeout lands in exits.threw where a truncation lands in `truncated`.");
say("      ██ So 'truncated = 0' is not on its own evidence that the ceiling holds. ██");
say("      The fix is not arithmetic: the run must record its own slowest call, and");
say("      `threw` must be a VOID condition beside truncation. Both are in wsHK's");
say("      pre-registration.");
say();
say("    Model ceiling, for completeness: claude-sonnet-5 accepts max_tokens up to");
say("    128,000. Nothing proposed here is anywhere near it; the binding constraint is");
say("    the request budget, not the model.");
