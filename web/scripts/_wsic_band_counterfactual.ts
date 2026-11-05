/**
 * What the wsIC gate corrections do to the QUALIFICATION BAND — the line the
 * selector was told to demote a row for.
 *
 * FREE. Two committed tapes and the committed snapshot, through the product's
 * own verdict engine. No model call, no network, no credential, no write.
 *
 * ── Why this is not `_wsgu_counterfactual.ts` ─────────────────────────────
 * That harness counts what the gate screen BLOCKS, because wsGU's corrections
 * were about rows being deleted. wsGE's by-field counting already stopped
 * `innovate_uk` blocking — two gates on one field are ONE thing in the way —
 * so the defect this measures is invisible to a blocked count and always was.
 * What it costs is the BAND: the row survives and renders as "one thing in the
 * way", and `agentSelect.ts` spent seven days telling the model that such a row
 * publishes below the open ones whatever place it gives it. So the number that
 * matters here is `one_blocker -> open`, and nothing in the repo reported it.
 *
 * ── The population is a tape, not a walk ──────────────────────────────────
 * `indicative_wsHW/free.json` is the committed free walk of all 897 held-out
 * described founders — the same draw fingerprint as wsHO, asserted in code —
 * carrying each founder's country, ticket band and the fund they actually won.
 * Replaying it costs nothing and cannot drift, where re-walking would re-embed
 * 897 queries and put the answer at the mercy of a corpus that has moved since.
 *
 * ── What it can and cannot see ────────────────────────────────────────────
 * IT SEES the verdict on the row the founder actually won, before and after,
 * which is exactly the row wsIA showed the model demoting. IT DOES NOT SEE what
 * the model then does with the changed band: that needs a paid arm and this
 * workstream has EUR 0. No gain is claimed here — only reach.
 *
 * The answers are the guard's own: country, sector and ticket band off the
 * tape, plus `borrowerModel` pinned to the constant `panel.tsx` sends for every
 * founder alive. Every other field is left undefined, as `check_winner_not_gated`
 * leaves it, so a comparator on an unasked field reads `unknown` and never as a
 * failure.
 *
 *   cd web && npx tsx scripts/_wsic_band_counterfactual.ts
 */
delete process.env.DATABASE_URL;

import { readFileSync } from "fs";
import path from "path";

import { mergeInheritedGates, type DbGate, type DbInstrument } from "../lib/intelligence/corpus";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import { assessInstrument } from "../lib/intelligence/verdict";
import { applyCorrections, loadCorrections } from "./gateCorrections";

const SNAPSHOT = path.join("public", "data", "instrument_terms.json");
const CORRECTIONS = path.join("..", "capital", "project-mgmt", "evidence",
  "wsic_gate_branch_corrections_2026-08-19.jsonl");
const TAPE = path.join("..", "capital", "project-mgmt", "findings",
  "indicative_wsHW", "free.json");

interface TapeRow {
  company: string; country: string; won: string; sector?: string;
  ticketBand?: string; stratum: string; poolRankControl?: number;
  controlSix: string[]; hitControl: boolean;
}

const records = JSON.parse(readFileSync(path.join(process.cwd(), SNAPSHOT), "utf8")).records ?? [];
const corrections = loadCorrections(CORRECTIONS);
const fixed = applyCorrections(records, corrections);
const tape = JSON.parse(readFileSync(path.join(process.cwd(), TAPE), "utf8"));
const rows: TapeRow[] = tape.rows;

const touched = new Set(corrections.map((c) => c.instrument_id));

function verdicts(recs: any[]) {
  const byId = new Map(recs.map((i: any) => [i.id, i]));
  const gatesFor = (id: string): DbGate[] => {
    const own = byId.get(id);
    if (!own) return [];
    return mergeInheritedGates(own.gates ?? [], own.parentId ? byId.get(own.parentId) : undefined);
  };
  return (r: TapeRow) => {
    const inst = byId.get(r.won);
    if (!inst) return undefined;
    const a: Record<string, unknown> = {
      entityCountries: [r.country], borrowerModel: "operating",
    };
    if (r.sector) a.sector = r.sector;
    if (r.ticketBand) a.ticketBand = r.ticketBand;
    return assessInstrument(
      { ...inst, gates: gatesFor(r.won) } as DbInstrument, a as EligibilityAnswers);
  };
}

const before = verdicts(records), after = verdicts(fixed);

const moved: TapeRow[] = [];
const bandBefore = new Map<string, number>();
const bandAfter = new Map<string, number>();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
let seen = 0, inScope = 0;

for (const r of rows) {
  const b = before(r), a = after(r);
  if (!b || !a) continue;
  seen += 1;
  bump(bandBefore, b.status);
  bump(bandAfter, a.status);
  if (touched.has(r.won)) inScope += 1;
  if (b.status !== a.status) moved.push(r);
}

console.log(`population   ${rows.length} founders, ${seen} whose won fund is in the snapshot`);
console.log(`corrections  ${corrections.length} on ${touched.size} instrument(s): ${[...touched].join(", ")}`);
console.log(`in scope     ${inScope} founders won a corrected instrument `
  + `(${((100 * inScope) / rows.length).toFixed(1)}% of ${rows.length})\n`);

const bands = [...new Set([...bandBefore.keys(), ...bandAfter.keys()])].sort();
console.log("VERDICT ON THE WON ROW, whole population");
console.log(`  ${"band".padEnd(14)} ${"before".padStart(7)} ${"after".padStart(7)}`);
for (const k of bands) {
  console.log(`  ${k.padEnd(14)} ${String(bandBefore.get(k) ?? 0).padStart(7)} `
    + `${String(bandAfter.get(k) ?? 0).padStart(7)}`);
}

const from = new Map<string, number>();
for (const r of moved) {
  const k = `${before(r)!.status} -> ${after(r)!.status}`;
  bump(from, k);
}
console.log(`\nFOUNDERS WHOSE WON ROW CHANGES BAND: ${moved.length}`);
for (const [k, n] of [...from].sort((x, y) => y[1] - x[1])) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}

// Stratum matters because a harm can only land where our own six already
// carried the won fund. wsIA's structural point: every one of these founders
// is stratum C, so this regime can only ever be harmed and never rescued.
const strat = new Map<string, number>();
for (const r of moved) bump(strat, r.stratum);
console.log(`  by stratum: ${[...strat].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);

const inSix = moved.filter((r) => r.controlSix.includes(r.won)).length;
console.log(`  ${inSix} of them already carry the won fund in our own published six`);
console.log(`  ${moved.filter((r) => r.hitControl).length} are EXACT@6 hits for the free control today`);

// The blocked count, so a reader can see for themselves that it does not move
// and that this is the reason nothing in the repo reported the defect.
const blockedBefore = [...bandBefore].find(([k]) => k === "blocked")?.[1] ?? 0;
const blockedAfter = [...bandAfter].find(([k]) => k === "blocked")?.[1] ?? 0;
console.log(`\nblocked, for contrast: ${blockedBefore} -> ${blockedAfter}`
  + `${blockedBefore === blockedAfter ? "   (unchanged — invisible to every blocked-count guard we own)" : ""}`);
