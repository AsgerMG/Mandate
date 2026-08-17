// wsHA — THE REPORT. OFFLINE, FREE, NO CREDENTIALS.
//
// Reads `_wsha_doors.ts`'s JSON and answers the content question over the pairs
// it isolated. Split from the measurement for the reason `_wsgy_report.ts`
// states: a formatting change must never cost the run again.
//
// ── THE TABLE THIS EXISTS TO PRINT ─────────────────────────────────────────
//
//   For every column the corpus holds on an instrument, the share of sibling
//   pairs where the WON door and the SHOWN door differ at all.
//
// A field constant inside the sibling group cannot separate its doors, so the
// zeros are the finding as much as the survivors — they reduce ~40 columns to a
// short list mechanically rather than by argument.
//
// Three columns, and the split between them is the whole point:
//
//   DIFFER          the two doors do not carry the same value
//   BOTH KNOWN      ...and neither side is null. A REAL separating fact.
//   ONE KNOWN       exactly one side is null. This "differs" only because our
//                   collection is uneven, and a ranker acting on it is ranking
//                   our own coverage — the documentation-volume prior
//                   `leaf_separation_wsAO.md` §4 had to null out before it
//                   could believe gate fit.
//   BOTH BLANK      neither door carries it. Not a fact we hold at all.
//
//   IN=/tmp/wsha_doors.json npx tsx scripts/_wsha_report.ts
//
// ── AND THE ONE THING A TABLE CANNOT DECIDE ────────────────────────────────
// `PAIRS=<path>` writes the pairs out in FULL — both doors' names, their
// descriptions and their eligibility texts, untruncated. The table above says
// which columns VARY. Whether a founder could STATE the thing that varies is a
// judgement over the words themselves, and this repo's standing rule is that a
// judgement is made by reading, not by a rule invented to avoid reading. The
// dump is deterministic (sorted, every pair, no sampling), so a second reader
// grades the same rows.
//
//   IN=/tmp/wsha_doors.json PAIRS=/tmp/wsha_pairs.txt npx tsx scripts/_wsha_report.ts
//
// @ws-active until 2026-09-30
import { readFileSync, writeFileSync } from "fs";

import type { DoorRow, InstrumentSnapshot } from "./_wsha_doors";

interface Dump {
  meta: Record<string, unknown> & { fingerprint: string; n: number; ranker: string };
  rows: DoorRow[];
  snapshot: InstrumentSnapshot[];
}

/** Stable text for any value, so `{a:1,b:2}` and `{b:2,a:1}` are one value and
 *  an object difference is a difference in content rather than in key order. */
function norm(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object") {
    const seen = (x: unknown): unknown => {
      if (Array.isArray(x)) return x.map(seen);
      if (x && typeof x === "object") {
        return Object.fromEntries(
          Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
            .map(([k, val]) => [k, seen(val)]));
      }
      return x;
    };
    return JSON.stringify(seen(v));
  }
  return String(v);
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");

/** Columns computed from the AWARD TABLES — what this instrument has actually
 *  paid, to whom, when. Named here because `check_answer_not_reachable.ts` now
 *  reasons about DERIVATION as well as names: a column the founder's own award
 *  can move may not reach the model. A separating fact from this list is a
 *  finding about the corpus, never a shortcut to ship. */
const AWARD_DERIVED = new Set([
  "eventCount", "companyCount", "totalEur", "lastYear", "awardP25", "awardP50",
  "awardP75", "awardN", "intensityP50", "intensityN", "sectorMix",
  "administeringBody", "administeringBodyShare", "deliveryRegion",
  "deliveryRegionShare", "schemeOperators",
]);

/** Identity and plumbing. They differ on every pair BY CONSTRUCTION — a leaf id
 *  is unique and a regime is shared — so they are the control at each end of
 *  the table and are marked rather than dropped: a reader who does not see
 *  `id` at 100% and `parentId` at 0% cannot tell the instrument is working. */
const STRUCTURAL = new Set(["id", "parentId", "name"]);

function main() {
  const src = process.env.IN ?? "/tmp/wsha_doors.json";
  const dump = JSON.parse(readFileSync(src, "utf8")) as Dump;
  const snap = new Map(dump.snapshot.map((s) => [s.id, s]));

  // ── THE POPULATION, RECONCILED WITH wsGY ─────────────────────────────────
  // wsGY's 454 are the founders who PASS their gates and do not reach six rows,
  // so `rankAccessible !== null` is part of the definition and not a filter of
  // convenience: a founder whose won door was conclusively blocked was never
  // choosing between two doors.
  const offerable = dump.rows.filter((r) => r.offerable);
  const gatesPass = offerable.filter((r) => r.rankAccessible !== null);
  const hits = gatesPass.filter((r) => r.hit);
  const miss = gatesPass.filter((r) => !r.hit);
  const sibMiss = miss.filter((r) => r.siblingsShown.length > 0);
  const chanMiss = miss.filter((r) => r.channelAt6);

  console.log(`# wsHA — does a fact separate two doors of one regime\n`);
  console.log("```");
  console.log(`draw fingerprint    ${dump.meta.fingerprint}`);
  console.log(`population          ${dump.meta.n} founder(s)`);
  console.log(`corpus              ${dump.meta.store} instruments=${dump.meta.instruments}`);
  console.log(`ranker              ${dump.meta.ranker}`);
  console.log("```\n");

  console.log("## 1. The working set\n");
  console.log("```");
  console.log(`offerable won door                      ${offerable.length}`);
  console.log(`...gates pass                           ${gatesPass.length}`);
  console.log(`......won door in the six (HIT)         ${hits.length}  ${pct(hits.length, gatesPass.length)}`);
  console.log(`......miss                              ${miss.length}`);
  console.log(`.........SIBLING of the won door shown  ${sibMiss.length}  ${pct(sibMiss.length, miss.length)}  <- the working set`);
  console.log(`.........same CHANNEL shown             ${chanMiss.length}  ${pct(chanMiss.length, miss.length)}`);
  const regimes = new Set(sibMiss.map((r) => r.wonRegime));
  const nSib = sibMiss.map((r) => r.siblingsShown.length);
  console.log(`distinct regimes in the working set     ${regimes.size}`);
  console.log(`siblings shown per founder              mean ${(nSib.reduce((a, b) => a + b, 0) / (nSib.length || 1)).toFixed(2)}`
    + `  1:${nSib.filter((x) => x === 1).length}  2:${nSib.filter((x) => x === 2).length}`
    + `  3+:${nSib.filter((x) => x >= 3).length}`);
  console.log("```\n");

  // Which regimes carry the working set. A door problem concentrated in three
  // regimes is a collection job on three pages; one spread over sixty is not.
  const byRegime = new Map<string, number>();
  for (const r of sibMiss) byRegime.set(r.wonRegime, (byRegime.get(r.wonRegime) ?? 0) + 1);
  const top = [...byRegime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log("| regime | founders | share of working set | cumulative |");
  console.log("|---|--:|--:|--:|");
  let cum = 0;
  for (const [reg, cnt] of top) {
    cum += cnt;
    console.log(`| \`${reg}\` | ${cnt} | ${pct(cnt, sibMiss.length)} | ${pct(cum, sibMiss.length)} |`);
  }
  console.log("");

  // ── 2. FIELD BY FIELD ────────────────────────────────────────────────────
  // `top` pairs the won door with the HIGHEST-RANKED shown sibling — the door
  // we actually put in front of the founder. `all` is the strong form: the
  // field differs from EVERY shown sibling, so it could single the won door out
  // rather than merely disagreeing with one of three.
  const fieldNames = [...new Set(dump.snapshot.flatMap((s) => Object.keys(s.fields)))].sort();
  interface Tally {
    n: number; differ: number; bothKnown: number; oneKnown: number; bothBlank: number;
    differAll: number;
  }
  const tally = new Map<string, Tally>(
    fieldNames.map((f) => [f, { n: 0, differ: 0, bothKnown: 0, oneKnown: 0, bothBlank: 0, differAll: 0 }]));

  const examples = new Map<string, string[]>();
  for (const r of sibMiss) {
    const w = snap.get(r.won);
    const sibs = r.siblingsShown.map((id) => snap.get(id)).filter((s): s is InstrumentSnapshot => Boolean(s));
    if (!w || !sibs.length) continue;
    const s0 = sibs[0];
    for (const f of fieldNames) {
      const t = tally.get(f)!;
      t.n++;
      const a = norm(w.fields[f]);
      const b = norm(s0.fields[f]);
      if (a === null && b === null) { t.bothBlank++; continue; }
      if (a === null || b === null) {
        t.oneKnown++; t.differ++;
      } else if (a !== b) {
        t.differ++; t.bothKnown++;
        const ex = examples.get(f) ?? [];
        if (ex.length < 3 && !STRUCTURAL.has(f)) {
          ex.push(`${r.company} · ${f}: WON=${a.slice(0, 90)} | SHOWN=${b.slice(0, 90)}`);
          examples.set(f, ex);
        }
      }
      if (sibs.every((s) => norm(s.fields[f]) !== a)) t.differAll++;
    }
  }

  console.log("## 2. What varies inside the cell, column by column\n");
  console.log(`n = ${sibMiss.length} pairs (won door vs the highest-ranked shown sibling)\n`);
  console.log("| column | differ | BOTH KNOWN | one known only | both blank | separates from ALL shown siblings | |");
  console.log("|---|--:|--:|--:|--:|--:|---|");
  const ordered = [...tally.entries()].sort((a, b) => b[1].bothKnown - a[1].bothKnown);
  for (const [f, t] of ordered) {
    const tag = STRUCTURAL.has(f) ? "structural" : (AWARD_DERIVED.has(f) ? "award-derived" : "");
    console.log(`| \`${f}\` | ${pct(t.differ, t.n)} | **${pct(t.bothKnown, t.n)}** | ${pct(t.oneKnown, t.n)} | ${pct(t.bothBlank, t.n)} | ${pct(t.differAll, t.n)} | ${tag} |`);
  }
  console.log("");

  // ── 3. THE GATES ─────────────────────────────────────────────────────────
  // `leaf_separation_wsAO.md` §3 measured, off the corpus alone, that 83% of
  // gates are inherited and 68% of multi-leaf regimes give every leaf an
  // IDENTICAL decidable rule set. That is a structural bound and it was taken
  // over all multi-leaf regimes. This is the same question asked of the pairs
  // that actually cost us a founder, which is a different and smaller
  // population.
  const gateSig = (g: InstrumentSnapshot["gates"][number]) =>
    `${g.id}|${g.gateFamily ?? ""}|${g.gateRole ?? ""}|${g.intakeFieldResolved ?? ""}|${g.requirement}|${g.value}|${norm(g.valueSpec) ?? ""}`;
  const decidable = (g: InstrumentSnapshot["gates"][number]) =>
    g.gateRole === "filter" && g.valueSpec !== null && g.valueSpec !== undefined;

  let anyGateDiff = 0, decidableDiff = 0, ownGateDiff = 0, bothNoDecidable = 0;
  let identicalSet = 0, decidableIdentical = 0;
  const decidableFieldDiff = new Map<string, number>();
  for (const r of sibMiss) {
    const w = snap.get(r.won); const s0 = snap.get(r.siblingsShown[0]);
    if (!w || !s0) continue;
    const A = new Set(w.gates.map(gateSig));
    const B = new Set(s0.gates.map(gateSig));
    const same = A.size === B.size && [...A].every((x) => B.has(x));
    if (same) identicalSet++; else anyGateDiff++;

    const dA = new Set(w.gates.filter(decidable).map(gateSig));
    const dB = new Set(s0.gates.filter(decidable).map(gateSig));
    if (!dA.size && !dB.size) bothNoDecidable++;
    const dSame = dA.size === dB.size && [...dA].every((x) => dB.has(x));
    if (dSame) decidableIdentical++; else decidableDiff++;

    const oA = new Set(w.gates.filter((g) => !g.inherited).map(gateSig));
    const oB = new Set(s0.gates.filter((g) => !g.inherited).map(gateSig));
    if (!(oA.size === oB.size && [...oA].every((x) => oB.has(x)))) ownGateDiff++;

    // WHICH INTAKE FIELD a differing decidable gate hangs off. This is the one
    // that matters for step 3 of the question: a gate that separates two doors
    // is only useful if the founder is asked the thing it reads.
    const fieldsOfSet = (gs: InstrumentSnapshot["gates"]) => {
      const m = new Map<string, string[]>();
      for (const g of gs.filter(decidable)) {
        const k = g.intakeFieldResolved ?? "(unresolved)";
        m.set(k, [...(m.get(k) ?? []), gateSig(g)].sort());
      }
      return m;
    };
    const fa = fieldsOfSet(w.gates); const fb = fieldsOfSet(s0.gates);
    for (const k of new Set([...fa.keys(), ...fb.keys()])) {
      const x = (fa.get(k) ?? []).join("\n"); const y = (fb.get(k) ?? []).join("\n");
      if (x !== y) decidableFieldDiff.set(k, (decidableFieldDiff.get(k) ?? 0) + 1);
    }
  }

  console.log("## 3. Do the ENCODED gates already separate the two doors\n");
  console.log("```");
  const N = sibMiss.length;
  console.log(`pairs                                            ${N}`);
  console.log(`effective gate set IDENTICAL on both doors       ${identicalSet}  ${pct(identicalSet, N)}`);
  console.log(`  ...differs in any way                          ${anyGateDiff}  ${pct(anyGateDiff, N)}`);
  console.log(`DECIDABLE rule set (role=filter + valueSpec):`);
  console.log(`  identical on both doors                        ${decidableIdentical}  ${pct(decidableIdentical, N)}`);
  console.log(`  DIFFERS                                        ${decidableDiff}  ${pct(decidableDiff, N)}`);
  console.log(`  ...of the identical, neither door has ANY      ${bothNoDecidable}  ${pct(bothNoDecidable, N)}`);
  console.log(`the door's OWN (non-inherited) gates differ      ${ownGateDiff}  ${pct(ownGateDiff, N)}`);
  console.log("```\n");
  console.log("| intake field a DIFFERING decidable gate reads | pairs | share |");
  console.log("|---|--:|--:|");
  for (const [k, v] of [...decidableFieldDiff.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`| \`${k}\` | ${v} | ${pct(v, N)} |`);
  }
  console.log("");

  // ── 4. THE PAIRS THEMSELVES ──────────────────────────────────────────────
  // A handful named in full, so the funder-page reading in the finding is
  // checkable against the rows it was done on rather than asserted.
  console.log("## 4. Named pairs, largest regimes first\n");
  const shownRegimes = top.slice(0, 8).map(([r]) => r);
  for (const reg of shownRegimes) {
    const ex = sibMiss.filter((r) => r.wonRegime === reg).slice(0, 2);
    for (const r of ex) {
      const w = snap.get(r.won); const s0 = snap.get(r.siblingsShown[0]);
      console.log(`- **${r.company}** (${r.country}), regime \`${reg}\``);
      console.log(`  - WON   \`${r.won}\` — ${String(w?.fields.name ?? "")}`);
      console.log(`  - SHOWN \`${r.siblingsShown[0]}\` — ${String(s0?.fields.name ?? "")}`);
    }
  }
  console.log("");

  console.log("## 5. Example value differences on the columns that vary\n");
  for (const [f, t] of ordered) {
    if (STRUCTURAL.has(f) || !t.bothKnown) continue;
    const ex = examples.get(f);
    if (!ex?.length) continue;
    console.log(`\`${f}\` — ${pct(t.bothKnown, t.n)} both-known`);
    for (const e of ex) console.log(`  ${e}`);
  }

  // ── THE PAIRS IN FULL, FOR THE JUDGEMENT A TABLE CANNOT MAKE ─────────────
  const pairsOut = process.env.PAIRS;
  if (pairsOut) {
    const txt = (v: unknown) => (v === null || v === undefined ? "(none)" : String(v));
    const lines: string[] = [
      `wsHA pairs — ${sibMiss.length} founders, draw ${dump.meta.fingerprint}`,
      "Every founder who passed their gates, missed the fund they won, and saw a",
      "SIBLING of it. WON is the door they took; SHOWN is the highest-ranked",
      "sibling we put on the page instead.",
      "",
    ];
    // Grouped by regime and sorted, so a reader grading these is grading the
    // door choice inside one programme at a time rather than jumping between
    // regimes with every row.
    for (const r of [...sibMiss].sort((a, b) =>
      a.wonRegime.localeCompare(b.wonRegime) || a.company.localeCompare(b.company))) {
      const w = snap.get(r.won); const s0 = snap.get(r.siblingsShown[0]);
      lines.push("=".repeat(78));
      lines.push(`${r.company} (${r.country})   regime: ${r.wonRegime}`);
      lines.push(`  rank of the won door in the accessible pool: ${r.rankAccessible}/${r.accessibleLen}`);
      for (const [tag, s] of [["WON  ", w], ["SHOWN", s0]] as const) {
        lines.push("-".repeat(78));
        lines.push(`${tag} ${s?.id ?? "(missing)"}`);
        lines.push(`  name          ${txt(s?.fields.name)}`);
        lines.push(`  schemeCode    ${txt(s?.fields.schemeCode)}   capitalType ${txt(s?.fields.capitalType)}`);
        lines.push(`  body          ${txt(s?.fields.administeringBody)}`);
        lines.push(`  window        ${txt(s?.fields.schemeEndDate)} (${txt(s?.fields.schemeEndBasis)})  recurrence ${txt(s?.fields.callRecurrence)}`);
        lines.push(`  description   ${txt(s?.fields.description)}`);
        lines.push(`  eligibility   ${txt(s?.fields.eligibilityText)}`);
      }
      lines.push("");
    }
    writeFileSync(pairsOut, lines.join("\n"));
    console.log(`\nwrote ${pairsOut}  (${sibMiss.length} pairs, in full)`);
  }
}

main();
