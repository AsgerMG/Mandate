// wsCS — does the SEAT ALLOCATION have to be a constant?
//
// `applyPeerPrecedence` splits the five visible seats between two signals that
// measure as equal alone. wsCM measured three FIXED splits and closed them:
// `all` (score 0 seats) 27.6, `head` (1) 26.8, `alternate` (3) 24.8 on tune
// N=250. It read that gradient as flat at the top and the axis as closed.
//
// Flat on AVERAGE is not the same claim. A reserved seat that is worth
// something where the score has separated the top row, and worth less than
// nothing where the score has produced a pack of near-identical rows, averages
// to flat and is not flat. No fixed split can express that difference, so
// wsCM's three arms could not have found it either way.
//
// `PEER_FILL=confident` makes the count a function of the table: the score
// keeps the leading rows it SEPARATED, by `scoreSeats` in shortlist.ts.
// `confident-both` applies the same rule to the specific branch, where the
// fixed 3 is switched on `descriptionIsSpecific` — a PROXY for exactly the
// confidence this reads directly.
//
// This script is the A/B. It reports, per arm:
//
//   * the attestation, first, because a run that averaged the embedding and
//     lexical rankers is not evidence about either;
//   * EXACT@5 with a 95% half-width;
//   * THE SEAT DISTRIBUTION. A null on this arm has two readings — the seat
//     count moved and the page did not care, or the count never moved — and
//     they are opposite conclusions. Without the distribution they cannot be
//     told apart, which is the shape of every false null in this repo.
//   * PAIRED flips against a baseline run, and the REGIME CONCENTRATION of the
//     winners and losers, because a candidate once scored +1.7 that was seven
//     leaves in one regime.
//
// FREE: one Voyage embed and one Postgres read per pair, no model calls. Run
// the arms ONE AT A TIME and read the tally line each time.
//
//   SPLIT=tune N=600 OUT=/tmp/head.json       npx tsx scripts/_wscs_seats.ts
//   PEER_FILL=confident SPLIT=tune N=600 OUT=/tmp/conf.json BASE=/tmp/head.json \
//     npx tsx scripts/_wscs_seats.ts
import { writeFileSync, readFileSync, existsSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscs_seats", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { PEER_FILL } from "../lib/intelligence/shortlist";
import { readTrace, traceOn, traceReset } from "../lib/intelligence/tableTrace";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

interface Out {
  want: string; regime: string; country: string; hit: boolean;
  branch: "specific" | "flat" | "none";
  /** Seats the score kept. -1 where peer precedence did not run at all. */
  seats: number;
  /** Rank of the won leaf in the published order, or null if it is not there. */
  rankFinal: number | null;
}

const num = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wscs_seats");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const answerMode = (process.env.ANSWERS ?? "off") as AnswerMode;
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  const set = pop.graded.filter((r) => (split === "all" || r.split === split)
    && (!process.env.DESCRIBED || isDescribed(r)));
  if (!set.length) throw new Error(`no rows match split=${split}`);
  const N = Math.min(num(process.env.N, 250), set.length);
  const seed = num(process.env.SEED, DEFAULT_SEED);
  const sample = sampleRecall(set, N, seed);

  traceOn();
  resetRankerTally();
  resetGateHydration();
  const out: Out[] = [];
  for (const t of sample) {
    resetGateHydration();
    traceReset();
    const a = answersFor(t, answerMode);
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: a.region,
    } as never, {
      targetMarkets: [t.country], capitalSought: a.capitalSought,
      description: t.description || t.selfDescription || undefined,
      log: new ExclusionLog(),
    } as never);
    const top5 = (v.instrumentTable ?? []).slice(0, 5)
      .map((r: { instrumentId?: string }) => r.instrumentId).filter(Boolean) as string[];
    const { peerBranch, scoreSeats, stages } = readTrace();
    const final = stages.find((s) => s.name === "final");
    const idx = final ? final.ids.indexOf(t.instrument) : -1;
    out.push({
      want: t.instrument, regime: String(byId.get(t.instrument)?.parentId ?? t.instrument),
      country: t.country, hit: top5.includes(t.instrument),
      branch: peerBranch, seats: scoreSeats, rankFinal: idx < 0 ? null : idx + 1,
    });
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`set=${setFile} split=${split} seed=${seed} PEER_FILL=${PEER_FILL} ` +
              `replayed ${out.length}`);
  const hits = out.filter((r) => r.hit).length;
  console.log(`\nEXACT@5 ${hits}/${out.length} ` +
    `(${(100 * hits / out.length).toFixed(1)}% +/-${halfWidth(hits, out.length).toFixed(1)})`);

  // ── What the arm actually DID ────────────────────────────────────────────
  const ran = out.filter((r) => r.branch !== "none");
  console.log(`\nSEATS THE SCORE KEPT  (peer precedence ran on ${ran.length}/${out.length};` +
              ` the rest had no peer prior or too short a table)`);
  const bySeats = new Map<number, { n: number; hit: number }>();
  for (const r of ran) {
    const e = bySeats.get(r.seats) ?? { n: 0, hit: 0 };
    e.n += 1; e.hit += r.hit ? 1 : 0; bySeats.set(r.seats, e);
  }
  for (const [k, e] of [...bySeats].sort((x, y) => x[0] - y[0])) {
    console.log(`  ${String(k).padStart(3)} seat(s)  ${String(e.n).padStart(4)} founders  ` +
      `EXACT@5 ${(100 * e.hit / e.n).toFixed(1)}% +/-${halfWidth(e.hit, e.n).toFixed(1)}`);
  }
  for (const b of ["flat", "specific"] as const) {
    const g = ran.filter((r) => r.branch === b);
    if (!g.length) continue;
    const h = g.filter((r) => r.hit).length;
    const s = g.map((r) => r.seats).sort((x, y) => x - y);
    console.log(`  branch ${b.padEnd(9)} n=${String(g.length).padStart(4)}  ` +
      `EXACT@5 ${(100 * h / g.length).toFixed(1)}% +/-${halfWidth(h, g.length).toFixed(1)}  ` +
      `seats min ${s[0]} median ${s[s.length >> 1]} max ${s[s.length - 1]}`);
  }

  // ── Paired against a baseline run, with regime concentration ─────────────
  const basePath = process.env.BASE;
  if (basePath && existsSync(basePath)) {
    const base = JSON.parse(readFileSync(basePath, "utf8")) as { rows: Out[]; arm: string };
    const byWant = new Map(base.rows.map((r, i) => [`${i}:${r.want}`, r]));
    let won = 0, lost = 0;
    const wonRegimes = new Map<string, number>(), lostRegimes = new Map<string, number>();
    let seatsMoved = 0;
    out.forEach((r, i) => {
      const b = byWant.get(`${i}:${r.want}`);
      if (!b) throw new Error(`the two runs did not draw the same pairs at index ${i} ` +
        `(${r.want} here, ${base.rows[i]?.want} there) -- a paired comparison of two ` +
        "different draws is not a comparison");
      if (r.seats !== b.seats) seatsMoved += 1;
      if (r.hit && !b.hit) { won += 1; wonRegimes.set(r.regime, (wonRegimes.get(r.regime) ?? 0) + 1); }
      if (!r.hit && b.hit) { lost += 1; lostRegimes.set(r.regime, (lostRegimes.get(r.regime) ?? 0) + 1); }
    });
    const baseHits = base.rows.filter((r) => r.hit).length;
    console.log(`\nPAIRED against ${basePath} (arm ${base.arm}), same draw pair for pair:`);
    console.log(`  ${base.arm} ${(100 * baseHits / base.rows.length).toFixed(1)}%  ->  ` +
      `${PEER_FILL} ${(100 * hits / out.length).toFixed(1)}%   ` +
      `delta ${((100 * hits / out.length) - (100 * baseHits / base.rows.length)).toFixed(1)} points`);
    console.log(`  seat count differs on ${seatsMoved}/${out.length} founders ` +
      `(${(100 * seatsMoved / out.length).toFixed(0)}%)`);
    console.log(`  discordant ${won + lost}: +${won} / -${lost}`);
    // The standing rule: concentration beside every gain. A gain that is one
    // regime is a regime effect wearing a ranking result's clothes.
    const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])
      .slice(0, 3).map(([k, n]) => `${k} x${n}`).join(", ") || "none";
    console.log(`  gains over ${wonRegimes.size} regime(s): ${top(wonRegimes)}`);
    console.log(`  losses over ${lostRegimes.size} regime(s): ${top(lostRegimes)}`);
  }

  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify({
      arm: PEER_FILL, set: setFile, split, seed, n: out.length,
      ranker: rankerTallyLine(), rows: out,
    }));
    console.log(`\n  -> ${process.env.OUT}`);
  }
}

main();
