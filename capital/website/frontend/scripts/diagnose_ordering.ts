// The won fund is a candidate 98% of the time and reaches the five 35% of the
// time. Sixty-three points are lost purely in ORDERING. This prints, for every
// holdout case where the won fund is in the pool and below the cut, the five
// rows that beat it with every component of the score that put them there --
// and the won fund's own components on the same line -- so the question "what do
// the five have that the won fund lacks" is answered from the numbers rather
// than from a hypothesis.
//
//   SET=__recallSetPlus.json SPLIT=holdout N=200 npx tsx scripts/diagnose_ordering.ts
//
// Nothing here reimplements the ranker. Every scorer is imported from
// shortlist.ts, so a component printed here is the component that ran.
import { readFileSync } from "fs";
import path from "path";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }
if (process.env.NO_PG) delete process.env.DATABASE_URL;

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import {
  THEME_DOMINANT_WEIGHT, awardScorer, objectiveScorer, peerPrior, instById,
} from "../lib/intelligence/shortlist";
import { sectorFit } from "../lib/intelligence/fit";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import type { DbInstrument } from "../lib/intelligence/corpus";

interface Parts {
  id: string; rank: number; channel: string; parent: string;
  theme: number; sector: number; fit: number; ticket: number; obj: number;
  peer: number; demote: boolean; eventCount: number; awardP50: number | null;
  sameParentAsWon: boolean;
}

const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const med = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

async function main() {
  await hydrateDbInstruments();
  const all0 = loadDbInstruments();
  const byId = new Map(all0.map((i) => [i.id, i]));
  const setFile = process.env.SET ?? "__recallSetPlus.json";
  const all = JSON.parse(readFileSync(
    path.join(process.cwd(), "lib", "intelligence", setFile), "utf8")) as any[];
  const split = process.env.SPLIT ?? "holdout";
  const set = all.filter((r) => split === "all" || r.split === split);
  const N = Math.min(Number(process.env.N ?? 200), set.length);
  const step = Math.max(1, Math.floor(set.length / N));
  const sample = set.filter((_, i) => i % step === 0).slice(0, N);

  // Accumulators. "won" is the fund the company really won; "beat" is the five
  // rows shown above it.
  const wonP: Parts[] = [];
  const beatP: Parts[] = [];
  let inPool = 0, hit5 = 0, miss = 0, notPool = 0;
  // How many of the five that beat the won fund are its siblings.
  const sibsInFive: number[] = [];
  // Where the won fund's own score sits relative to the fifth row's.
  const gapToFifth: number[] = [];
  const ranks: number[] = [];
  let wonDemoted = 0, wonReassignedDown = 0;
  // Which single component, swapped alone, would have lifted the won fund past
  // the fifth row. Counted per case; a case can be rescued by more than one.
  const rescuedBy = new Map<string, number>();
  // THE decisive split. When the won fund's regime already holds slots in the
  // five, is the won leaf the best of its group (so the group needs LIFTING) or
  // is it below siblings that took those slots (so the group needs REORDERING)?
  // Every remedy points at one of these two and not the other.
  const groupSize: number[] = [];
  const wonRankInGroup: number[] = [];
  const bestGroupSlot: number[] = [];
  let needLift = 0, needReorder = 0, groupHasNoSlot = 0;
  // For the reorder cases: how the won leaf compares with the sibling that
  // actually took the group's best slot.
  const vsSib = { theme: [] as number[], sector: [] as number[], peer: [] as number[],
                  events: [] as number[], award: [] as number[] };

  for (const t of sample) {
    const description = t.description || t.selfDescription || undefined;
    const eligibility = {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: undefined,
    };
    const v = await computeVerdict("TestCo", t.country, eligibility as never, {
      targetMarkets: [t.country], capitalSought: ["grant", "loan"], description,
    } as never);
    const order: string[] = v.candidateInstrumentIds ?? [];
    const at = order.indexOf(t.instrument);
    if (at < 0) { notPool++; continue; }
    inPool++;
    if (at < 5) { hit5++; continue; }
    miss++;
    ranks.push(at + 1);

    // Rebuild the components for this founder, with the same inputs the row
    // sort saw. `semanticFundMatch` memoises per description, so this is the
    // same map the verdict ranked on, not a second query.
    const rel = await semanticFundMatch(description ?? "");
    const pool = order.map((id) => byId.get(id)).filter((i): i is DbInstrument => Boolean(i));
    const awd = awardScorer(pool, "b500k_2m5");
    const obj = objectiveScorer(pool.map((i) => i.id),
      ["industrial_research", "experimental_development"]);
    const peerRank = new Map(
      peerPrior(t.country, t.sector ?? "other").map((id, i) => [id, i]));
    const table = (v.instrumentTable ?? []) as any[];
    const demoteOf = new Map<string, boolean>(
      table.map((r) => [r.instrumentId, r.fit !== "" && r.fit !== "startup_ready"
        && r.fit !== "consortium_institutional"]));
    const wantParent = byId.get(t.instrument)?.parentId ?? t.instrument;

    const partsFor = (id: string, rank: number): Parts | undefined => {
      const inst = byId.get(id);
      if (!inst) return undefined;
      const theme = rel.get(id) ?? 0;
      const sec = sectorFit(inst.sectorMix, t.sector ?? "other");
      return {
        id, rank, channel: inst.sourceFamilyBucket ?? "?",
        parent: inst.parentId ?? id,
        theme, sector: sec,
        fit: THEME_DOMINANT_WEIGHT * theme + (1 - THEME_DOMINANT_WEIGHT) * sec,
        ticket: awd(inst), obj: obj(id),
        peer: peerRank.get(id) ?? 999,
        demote: demoteOf.get(id) ?? false,
        eventCount: inst.eventCount ?? 0,
        awardP50: inst.awardP50 ?? null,
        sameParentAsWon: (inst.parentId ?? id) === wantParent,
      };
    };

    const won = partsFor(t.instrument, at + 1);
    const five = order.slice(0, 5)
      .map((id, i) => partsFor(id, i + 1))
      .filter((p): p is Parts => Boolean(p));
    if (!won || five.length < 5) continue;
    wonP.push(won);
    beatP.push(...five);
    sibsInFive.push(five.filter((f) => f.sameParentAsWon).length);
    gapToFifth.push(won.fit - five[4].fit);
    if (won.demote) wonDemoted++;
    // Would a single component, applied as a multiplier on top of `fit`, have
    // put the won fund above the fifth row?
    const fifth = five[4];
    const wouldRescue = (label: string, w: number, f: number) => {
      if (w > f) rescuedBy.set(label, (rescuedBy.get(label) ?? 0) + 1);
    };
    wouldRescue("theme alone", won.theme, fifth.theme);
    wouldRescue("sectorFit alone", won.sector, fifth.sector);
    wouldRescue("fit x ticket", won.fit * won.ticket, fifth.fit * fifth.ticket);
    wouldRescue("fit x objective", won.fit * won.obj, fifth.fit * fifth.obj);
    wouldRescue("peer rank alone", -won.peer, -fifth.peer);
    wouldRescue("eventCount alone", won.eventCount, fifth.eventCount);
    if (won.fit > fifth.fit) wonReassignedDown++;

    // The group, as the table actually holds it: every pool row sharing the won
    // fund's parent, in the shipped order.
    const group = order
      .map((id, i) => ({ id, slot: i + 1 }))
      .filter((g) => (byId.get(g.id)?.parentId ?? g.id) === wantParent);
    groupSize.push(group.length);
    const rankIn = group.findIndex((g) => g.id === t.instrument) + 1;
    wonRankInGroup.push(rankIn);
    const best = group[0];
    bestGroupSlot.push(best.slot);
    if (best.slot > 5) groupHasNoSlot++;
    else if (rankIn === 1) needLift++;   // best of its group and still cut
    else {
      needReorder++;
      const sib = partsFor(best.id, best.slot);
      if (sib) {
        vsSib.theme.push(won.theme - sib.theme);
        vsSib.sector.push(won.sector - sib.sector);
        vsSib.peer.push(won.peer - sib.peer);
        vsSib.events.push(won.eventCount - sib.eventCount);
        vsSib.award.push((won.awardP50 ?? 0) - (sib.awardP50 ?? 0));
      }
    }
  }

  const col = (label: string, pick: (p: Parts) => number) => {
    const w = wonP.map(pick).filter((x) => Number.isFinite(x));
    const b = beatP.map(pick).filter((x) => Number.isFinite(x));
    console.log(`  ${label.padEnd(22)} won  mean ${mean(w).toFixed(3)}  med ${med(w).toFixed(3)}` +
                `     |  the five  mean ${mean(b).toFixed(3)}  med ${med(b).toFixed(3)}`);
  };

  console.log(`set=${setFile} split=${split}  replayed ${sample.length}`);
  console.log(`  in pool ${inPool}   in five ${hit5}   in pool below the cut ${miss}   not in pool ${notPool}`);
  console.log(`  rank of the won fund when below the cut: median ${med(ranks)}  p90 ${med(ranks.slice(0))}  max ${Math.max(...ranks, 0)}`);
  console.log(`\nCOMPONENT BY COMPONENT, over ${wonP.length} ordering misses:`);
  col("theme percentile", (p) => p.theme);
  col("sectorFit", (p) => p.sector);
  col("fit (0.85/0.15)", (p) => p.fit);
  col("ticket multiplier", (p) => p.ticket);
  col("objective multiplier", (p) => p.obj);
  col("peer rank (999=unk)", (p) => p.peer);
  col("eventCount", (p) => p.eventCount);
  col("awardP50", (p) => p.awardP50 ?? NaN);

  console.log(`\n  won fund demoted by the non-startup-ready tier: ${wonDemoted}/${wonP.length}`);
  console.log(`  won fund's raw fit ALREADY above the fifth row's: ${wonReassignedDown}/${wonP.length}`);
  console.log(`  siblings of the won fund among the five: mean ${mean(sibsInFive).toFixed(2)},` +
              ` at least one in ${sibsInFive.filter((n) => n > 0).length}/${sibsInFive.length}`);
  const peerKnownWon = wonP.filter((p) => p.peer < 999).length;
  const peerKnownBeat = beatP.filter((p) => p.peer < 999).length;
  console.log(`  known to the peer prior: won ${peerKnownWon}/${wonP.length}` +
              `   the five ${peerKnownBeat}/${beatP.length}`);

  console.log(`\nWHICH SINGLE COMPONENT WOULD HAVE RESCUED THE CASE (of ${wonP.length}):`);
  for (const [k, n] of [...rescuedBy].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${(100 * n / wonP.length).toFixed(0)}%  ${k}`);
  }

  console.log(`\nLIFT OR REORDER -- the decisive split, over ${wonRankInGroup.length} misses:`);
  console.log(`  the won fund's REGIME holds no slot in the five   ${groupHasNoSlot}` +
              `  (${(100 * groupHasNoSlot / wonRankInGroup.length).toFixed(0)}%)  -> needs LIFT`);
  console.log(`  regime holds a slot, won leaf is its best member   ${needLift}` +
              `  (${(100 * needLift / wonRankInGroup.length).toFixed(0)}%)  -> needs LIFT`);
  console.log(`  regime holds a slot, siblings outrank the won leaf ${needReorder}` +
              `  (${(100 * needReorder / wonRankInGroup.length).toFixed(0)}%)  -> needs REORDER`);
  console.log(`  group size in pool: median ${med(groupSize)}  mean ${mean(groupSize).toFixed(1)}`);
  console.log(`  won fund's rank INSIDE its group: median ${med(wonRankInGroup)}` +
              `  mean ${mean(wonRankInGroup).toFixed(1)}`);
  console.log(`  group's best slot in the table:   median ${med(bestGroupSlot)}` +
              `  mean ${mean(bestGroupSlot).toFixed(1)}`);
  if (vsSib.theme.length) {
    console.log(`\n  REORDER cases -- won leaf MINUS the sibling holding the group's best slot:`);
    for (const [k, v] of Object.entries(vsSib)) {
      console.log(`    ${k.padEnd(8)} median ${med(v).toFixed(3)}   ` +
                  `won is higher in ${v.filter((x) => x > 0).length}/${v.length}`);
    }
  }

  // Channel composition: is the won fund losing to its own channel or to another?
  const chanWon = new Map<string, number>(), chanBeat = new Map<string, number>();
  for (const p of wonP) chanWon.set(p.channel, (chanWon.get(p.channel) ?? 0) + 1);
  for (const p of beatP) chanBeat.set(p.channel, (chanBeat.get(p.channel) ?? 0) + 1);
  console.log(`\nCHANNEL of the won fund vs the five that beat it:`);
  const chans = new Set([...chanWon.keys(), ...chanBeat.keys()]);
  for (const c of [...chans].sort((a, b) => (chanBeat.get(b) ?? 0) - (chanBeat.get(a) ?? 0))) {
    console.log(`  ${c.padEnd(24)} won ${String(chanWon.get(c) ?? 0).padStart(4)}` +
                `   in the five ${String(chanBeat.get(c) ?? 0).padStart(4)}`);
  }
}
main();
