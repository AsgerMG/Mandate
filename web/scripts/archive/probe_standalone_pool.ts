// WHY does a fund that is never the answer take a third of the five rows?
//
// Scratch probe for WS-BB. Two readings of WS-AW's finding, and this asks the
// question that separates them:
//
//   (1) SELECTION DEFECT — standalone leaves are over-represented in the pool
//       relative to their chance of being right.
//   (2) ANSWER-KEY ARTIFACT — they are never TESTED, so "never right" is a
//       property of the key, not of the fund.
//
// The discriminator is not the intersection count (WS-AU already has that, and
// it is empty). It is WHETHER THE KEY COULD EVER CONTAIN THEM. The recall set
// is built from awards that were MADE. A leaf with zero awards on record cannot
// be an answer under any ranker, so its absence from the key carries no
// information about selection at all.
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
requireCredentials("probe_standalone_pool", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../../lib/intelligence/corpus";
import { loadRecallSet } from "../recallSet";

const pct = (n: number, d: number) => `${(100 * n / Math.max(1, d)).toFixed(1)}%`;

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("probe_standalone_pool");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const regimeOf = (id: string) => byId.get(id)?.parentId ?? id;
  const regimeSize = new Map<string, number>();
  for (const i of corpus) {
    if (!offerable.has(i.id)) continue;
    const r = regimeOf(i.id);
    regimeSize.set(r, (regimeSize.get(r) ?? 0) + 1);
  }
  const standalone = (id: string) => (regimeSize.get(regimeOf(id)) ?? 0) < 2;
  const pubs = corpus.filter((i) => offerable.has(i.id));

  // ── 1. Can the answer key contain a leaf at all? ──────────────────────────
  // The key is built from awards. `eventCount` is how many awards a leaf has on
  // record. Zero is not "unpopular"; it is "structurally absent from the key".
  console.log(`\n1. CAN THE ANSWER KEY EVER NAME THIS LEAF?`);
  console.log(`   eventCount is the number of AWARDS on record. The recall set is`);
  console.log(`   built from awards, so eventCount = 0 means the key cannot name it.\n`);
  const grp = (list: typeof pubs, label: string) => {
    const zero = list.filter((i) => i.eventCount === 0).length;
    console.log(`   ${label.padEnd(34)} n=${String(list.length).padStart(4)}` +
      `  zero-award ${String(zero).padStart(4)} (${pct(zero, list.length)})`);
  };
  grp(pubs, "all publishable leaves");
  grp(pubs.filter((i) => standalone(i.id)), "  standalone");
  grp(pubs.filter((i) => !standalone(i.id)), "  sibling-grouped");
  for (const c of ["ES", "NO", "EE", "LV", "DE", "IT", "FR", "SE"]) {
    const inC = pubs.filter((i) => (i.country || "").toUpperCase() === c);
    if (!inC.length) continue;
    grp(inC.filter((i) => standalone(i.id)), `${c} standalone`);
    grp(inC.filter((i) => !standalone(i.id)), `${c} sibling-grouped`);
  }

  // ── 2. What the answer key actually names ────────────────────────────────
  const { rows } = loadRecallSet();
  const answerIds = new Set<string>(rows.map((r) => r.instrument));
  const answered = pubs.filter((i) => answerIds.has(i.id));
  console.log(`\n2. THE ANSWER KEY, over every pair in the active set`);
  console.log(`   distinct answer instruments in corpus  ${answered.length}`);
  console.log(`   ...standalone                          ${answered.filter((i) => standalone(i.id)).length}`);
  console.log(`   ...zero-award                          ${answered.filter((i) => i.eventCount === 0).length}`);

  // The control WS-AW's GB stratum could not supply: standalone leaves that DO
  // have awards. If standalone-ness were what keeps a leaf out of the key, these
  // would be absent too.
  console.log(`\n   Standalone leaves that CAN be graded, by country:`);
  console.log(`   ${"country".padEnd(10)} standalone  with awards  is an answer`);
  const cs = new Map<string, { a: number; w: number; ans: number }>();
  for (const i of pubs) {
    if (!standalone(i.id)) continue;
    const k = (i.country || "(none)").toUpperCase();
    const c = cs.get(k) ?? { a: 0, w: 0, ans: 0 };
    c.a++; if (i.eventCount > 0) c.w++; if (answerIds.has(i.id)) c.ans++;
    cs.set(k, c);
  }
  for (const [k, c] of [...cs].sort((a, b) => b[1].a - a[1].a)) {
    console.log(`   ${k.padEnd(10)} ${String(c.a).padStart(10)}${String(c.w).padStart(13)}` +
      `${String(c.ans).padStart(14)}`);
  }

  // The decisive contingency table: is "never an answer" explained by
  // "no awards on record" without reference to selection at all?
  console.log(`\n   Every publishable leaf, cross-tabulated:`);
  console.log(`                        is an answer   never an answer`);
  for (const [label, sel] of [
    ["has awards  (eventCount>0)", (i: any) => i.eventCount > 0],
    ["no awards   (eventCount=0)", (i: any) => i.eventCount === 0],
  ] as const) {
    const s = pubs.filter(sel);
    console.log(`   ${label}  ${String(s.filter((i) => answerIds.has(i.id)).length).padStart(10)}` +
      `${String(s.filter((i) => !answerIds.has(i.id)).length).padStart(18)}`);
  }

  // ── 3. The Spanish pool, by construction ─────────────────────────────────
  const es = pubs.filter((i) => (i.country || "").toUpperCase() === "ES");
  console.log(`\n3. SPAIN — what the 88 actually are`);
  const bysrc = new Map<string, { n: number; alone: number; zero: number; ans: number }>();
  for (const i of es) {
    const k = i.id.split("__")[0];
    const c = bysrc.get(k) ?? { n: 0, alone: 0, zero: 0, ans: 0 };
    c.n++;
    if (standalone(i.id)) c.alone++;
    if (i.eventCount === 0) c.zero++;
    if (answerIds.has(i.id)) c.ans++;
    bysrc.set(k, c);
  }
  console.log(`   ${"id prefix".padEnd(28)}    n  alone  zero-award  is-answer`);
  for (const [k, c] of [...bysrc].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`   ${k.padEnd(28)} ${String(c.n).padStart(4)}` +
      `${String(c.alone).padStart(7)}${String(c.zero).padStart(12)}${String(c.ans).padStart(11)}`);
  }

  // ── 4. What signal a zero-award leaf carries into the row sort ───────────
  // rowRelevance = (theme, sectorFit) * ticketFit. sectorFit reads sectorMix,
  // which is computed FROM awards; ticketFit reads awardP50, likewise. A leaf
  // with no awards has neither, so the question is what the scorers give it.
  console.log(`\n4. WHAT A ZERO-AWARD LEAF BRINGS TO THE ROW SORT`);
  const has = (i: any, f: string) => i[f] != null &&
    (typeof i[f] !== "object" || Object.keys(i[f]).length > 0);
  for (const [label, sel] of [
    ["standalone", (i: any) => standalone(i.id)],
    ["sibling-grouped", (i: any) => !standalone(i.id)],
    ["ES standalone", (i: any) => standalone(i.id) && (i.country || "").toUpperCase() === "ES"],
    ["ES sibling-grouped", (i: any) => !standalone(i.id) && (i.country || "").toUpperCase() === "ES"],
  ] as const) {
    const s = pubs.filter(sel as any);
    const f = (name: string) => pct(s.filter((i) => has(i, name)).length, s.length);
    console.log(`   ${label.padEnd(20)} n=${String(s.length).padStart(4)}` +
      `  sectorMix ${f("sectorMix").padStart(6)}  awardP50 ${f("awardP50").padStart(6)}` +
      `  lastYear ${f("lastYear").padStart(6)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
