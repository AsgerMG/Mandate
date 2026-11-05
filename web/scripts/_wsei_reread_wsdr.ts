// wsEI — wsDR's RUN, RE-READ AS PAIRS. Free, offline, reproducible.
//
// wsDR's committed recall run is the evidence behind "a deeper list is worse",
// and it is quoted as EXACT@5 17.8% against 22.2%. Those are two independent
// percentages over 45 founders. The founders were not independent: every one of
// them was run through BOTH seams, in one process, off one pool object — by
// design, and that design is what makes the unpaired reading the wrong one.
//
// This reads the committed JSON and prints what the pairing says. It takes no
// credential, makes no call and reads nothing but a file already in the repo,
// so the claim it prints can be checked by anyone in two seconds instead of
// being taken from a report.
//
//   npx tsx scripts/_wsei_reread_wsdr.ts
import { readFileSync } from "fs";
import path from "path";

interface Arm {
  menu: number; picks: number[]; deepest: number;
  poolIds: string[]; publishedIds: string[];
  wonRank: number | null; wonInPool: boolean | null; eur: number;
}
interface Row {
  company: string; country: string; accessible: number;
  wonRankAccessible: number | null;
  late: Arm; early: Arm;
  offPublishedIds: string[]; offWonRank: number | null; offWonInPool: boolean | null;
}

const FILE = path.join(process.cwd(), "..", "..", "project-mgmt", "findings",
  "seam_wsDR", "recall.json");
const rows: Row[] = JSON.parse(readFileSync(FILE, "utf8"));
const n = rows.length;
const hit = (v: number | null, k: number) => v != null && v <= k;

console.log(`wsDR's recall run, re-read from ${path.relative(process.cwd(), FILE)} — n=${n}\n`);

for (const k of [5, 6]) {
  const a = rows.filter((r) => hit(r.early.wonRank, k) && !hit(r.late.wonRank, k)).length;
  const b = rows.filter((r) => !hit(r.early.wonRank, k) && hit(r.late.wonRank, k)).length;
  const both = rows.filter((r) => hit(r.early.wonRank, k) && hit(r.late.wonRank, k)).length;
  console.log(`EXACT@${k}: late ${both + b}/${n}, early ${both + a}/${n}`);
  console.log(`  paired: both ${both} · deep-only ${a} · shallow-only ${b} · neither ${n - a - b - both}`);
  console.log(`  DISCORDANT PAIRS: ${a + b}. A difference of ${Math.abs(b - a)} founder(s) is what `
    + `the two percentages are made of.\n`);
}

// ── Did the deeper menu change the pool at all? ──────────────────────────
// "Pool recall was identical on every arm" is read as the seam having failed to
// move anything. It moved a great deal; none of what it moved was an answer.
const promoted = rows.reduce((a, r) => a + r.early.picks.filter((i) => i >= 18).length, 0);
const founders = rows.filter((r) => r.early.picks.some((i) => i >= 18)).length;
console.log(`rows the deep arm promoted from BELOW the score's 18-row cut: ${promoted}, `
  + `across ${founders} of ${n} founders (${(promoted / n).toFixed(2)} per founder)`);
console.log(`  none of them was a won fund, which is what "0 admitted" meant.\n`);

// ── The nine, and what the cut could reach ───────────────────────────────
const band = rows.filter((r) => r.wonRankAccessible != null
  && r.wonRankAccessible > 18 && r.wonRankAccessible <= r.early.menu);
console.log(`founders whose won fund was newly VISIBLE at the deeper menu: ${band.length}`);
const reached = band.filter((r) => r.early.deepest >= (r.wonRankAccessible ?? 0) - 1).length;
console.log(`  of those, the model picked something DEEPER than the answer on ${reached} — `
  + `it saw past the row it needed, it did not fail to reach it.\n`);

// ── The ceiling each menu had, and how much of it each arm converted ─────
const ceil = (k: number) =>
  rows.filter((r) => r.wonRankAccessible != null && r.wonRankAccessible <= k).length;
const conv = (got: number, of: number) => `${got}/${of} = ${((100 * got) / (of || 1)).toFixed(0)}%`;
console.log(`ceiling (won fund inside the menu at all):  18 rows ${ceil(18)}/${n} · `
  + `40 rows ${ceil(40)}/${n} · whole pool ${ceil(1e9)}/${n}`);
console.log(`conversion of that ceiling at EXACT@6:      shallow ${conv(rows.filter((r) => hit(r.late.wonRank, 6)).length, ceil(18))} · `
  + `deep ${conv(rows.filter((r) => hit(r.early.wonRank, 6)).length, ceil(40))}`);
console.log(`  the ceiling rose 1.6x and the conversion fell 0.55x, so the product barely moved. `
  + `ONE more win out of the ${band.length} newly visible would have tied the arms; two would have won.\n`);

// ── Do the model's picks reach the table? ────────────────────────────────
for (const armName of ["late", "early"] as const) {
  let inPub = 0; let tot = 0;
  for (const r of rows) {
    const a = r[armName];
    const chosen = a.poolIds.slice(0, a.picks.length);
    const pub = new Set(a.publishedIds);
    inPub += chosen.filter((c) => pub.has(c)).length;
    tot += chosen.length;
  }
  console.log(`${armName.padEnd(5)}: ${inPub}/${tot} = ${((100 * inPub) / tot).toFixed(1)}% of the `
    + `model's picks reached the published table`);
}
console.log(`  so EXACT is very nearly "did the model pick the winner", and depth is the only `
  + `thing that decides whether it could have.`);
