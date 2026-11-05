// wsEO — LEGIBILITY CENSUS ON THE OPEN POOL.
//
// The question P1 exists to answer is not "how much description does the corpus
// hold" but "how much of what a founder can actually be shown says what the fund
// pays for". Those are different populations and the second is smaller.
//
// So every count here is taken over `publishableInstruments()` — the product's
// own definition of a row a founder may see — and never over the corpus. A fund
// that has expired buys nothing however well described it is.
//
// FREE by construction: ANTHROPIC_API_KEY is deleted before any import.
//
//   npx tsx scripts/_wsey_census.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsey_census", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, type DbInstrument,
} from "../lib/intelligence/corpus";
import {
  FUNDS_SENTENCE_CHARS, beyondTitle, fundsFloor, fundsSentence, oneLine,
} from "../lib/intelligence/schemeText";
import OBJECTIVES from "../lib/intelligence/__objectives.json";

const objectives = OBJECTIVES as Record<string, { useOfFunds?: string[]; articles?: string[] }>;

/** Does this row render a line a model can read, through production's own
 *  renderer? `beyondTitle` is the repeats-the-title filter the menu applies;
 *  the floor is the one `check_funds_line` fails the build over. */
function legible(i: DbInstrument): boolean {
  const d = (i.description ?? "").trim();
  if (!d) return false;
  const title = oneLine(i.name);
  if (!beyondTitle(d, title)) return false;
  const line = fundsSentence(d, FUNDS_SENTENCE_CHARS);
  return line.trim().length >= fundsFloor();
}

/** A gate that says what the fund PAYS FOR, in the founder's own vocabulary. */
function positiveUseOfFunds(i: DbInstrument): boolean {
  return i.gates.some((g) =>
    g.intakeFieldResolved === "useOfFunds" && g.gateRole === "filter");
}

/** Any gate at all that constrains the project's scope rather than the applicant. */
function anyScopeGate(i: DbInstrument): boolean {
  return i.gates.some((g) => g.gateFamily === "G5_use_of_funds" || g.gateFamily === "G1_nexus");
}

function objectiveUse(i: DbInstrument): boolean {
  return (objectives[i.id]?.useOfFunds?.length ?? 0) > 0;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsey_census");
  const all = loadDbInstruments();
  // Gates arrive in PHASE TWO, per-shortlist, and `publishableInstruments()`
  // returns fresh objects each call. Hydrate BEFORE taking the pool, or every
  // gate count below reads zero and reads as a corpus with no encoded layer.
  await hydrateGatesFor(all.map((i) => i.id));
  const open = publishableInstruments();
  const pct = (n: number, d: number) => `${((100 * n) / (d || 1)).toFixed(1)}%`;

  console.log(`corpus rows        ${all.length}`);
  console.log(`OPEN pool          ${open.length}   (publishableInstruments)`);
  console.log("");
  const withDesc = open.filter((i) => (i.description ?? "").trim().length > 0);
  const leg = open.filter(legible);
  const withUse = open.filter(positiveUseOfFunds);
  const withScope = open.filter(anyScopeGate);
  const withObj = open.filter(objectiveUse);
  console.log(`description present ${withDesc.length.toString().padStart(4)}  ${pct(withDesc.length, open.length)}`);
  console.log(`renders a line      ${leg.length.toString().padStart(4)}  ${pct(leg.length, open.length)}   (beyondTitle + >= ${fundsFloor()} chars)`);
  console.log(`useOfFunds FILTER   ${withUse.length.toString().padStart(4)}  ${pct(withUse.length, open.length)}`);
  console.log(`any scope gate      ${withScope.length.toString().padStart(4)}  ${pct(withScope.length, open.length)}`);
  console.log(`objective useOfFunds${withObj.length.toString().padStart(4)}  ${pct(withObj.length, open.length)}`);

  const roles = new Map<string, number>();
  const fields = new Map<string, number>();
  const fams = new Map<string, number>();
  for (const i of open) for (const g of i.gates) {
    roles.set(String(g.gateRole), (roles.get(String(g.gateRole)) ?? 0) + 1);
    fields.set(String(g.intakeFieldResolved ?? g.intakeField), (fields.get(String(g.intakeFieldResolved ?? g.intakeField)) ?? 0) + 1);
    fams.set(String(g.gateFamily), (fams.get(String(g.gateFamily)) ?? 0) + 1);
  }
  console.log("\ngate rows on the open pool, by role / family / resolved field:");
  console.log("  roles  " + [...roles].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));
  console.log("  fams   " + [...fams].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));
  console.log("  fields " + [...fields].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}=${v}`).join(" "));

  // ── OWN gates, straight off the table ────────────────────────────────────
  // The counts above are POST-INHERITANCE: `resolveInheritedGates` gives every
  // child of a regime its parent's rules, so 100% of the pool "has a scope
  // gate" and half of it "has a useOfFunds filter" while the row itself may
  // assert nothing. What P1 can move is what the ROW says, so both are
  // reported, and the difference between them is the finding.
  const { Client } = await import("pg");
  const cl = new Client({ connectionString: process.env.DATABASE_URL });
  await cl.connect();
  const ids = open.map((i) => i.id);
  const q = async (sql: string) =>
    (await cl.query(sql, [ids])).rows as Record<string, string>[];
  const ownUse = new Set((await q(
    `SELECT DISTINCT instrument_id FROM eligibility_gates
      WHERE instrument_id = ANY($1) AND gate_role = 'filter'
        AND intake_field_resolved = 'useOfFunds'`)).map((r) => r.instrument_id));
  const ownAny = new Set((await q(
    `SELECT DISTINCT instrument_id FROM eligibility_gates
      WHERE instrument_id = ANY($1)`)).map((r) => r.instrument_id));
  const ownScope = new Set((await q(
    `SELECT DISTINCT instrument_id FROM eligibility_gates
      WHERE instrument_id = ANY($1) AND gate_family IN ('G5_use_of_funds','G1_nexus')`))
    .map((r) => r.instrument_id));
  const polarity = await q(
    `SELECT COALESCE(value_spec::json->>'op','(none)') AS op, COUNT(*)::text AS n
       FROM eligibility_gates WHERE instrument_id = ANY($1) AND value_spec IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC`);
  await cl.end();
  console.log("\nOWN gates (the row's own rules, before inheritance):");
  console.log(`  any gate at all     ${String(ownAny.size).padStart(4)}  ${pct(ownAny.size, open.length)}`);
  console.log(`  a scope gate        ${String(ownScope.size).padStart(4)}  ${pct(ownScope.size, open.length)}`);
  console.log(`  a useOfFunds FILTER ${String(ownUse.size).padStart(4)}  ${pct(ownUse.size, open.length)}`);
  console.log("  comparator polarity " + polarity.map((r) => `${r.op}=${r.n}`).join(" "));

  const mute = open.filter((i) => !(i.description ?? "").trim() && !ownScope.has(i.id) && !objectiveUse(i));
  console.log("");
  console.log(`SAYS NOTHING AT ALL ${mute.length.toString().padStart(4)}  ${pct(mute.length, open.length)}  ` +
    `(no description, no scope gate, no objective)`);

  const byCountry = new Map<string, { open: number; desc: number; mute: number }>();
  for (const i of open) {
    const e = byCountry.get(i.country) ?? { open: 0, desc: 0, mute: 0 };
    e.open += 1;
    if ((i.description ?? "").trim()) e.desc += 1;
    byCountry.set(i.country, e);
  }
  for (const i of mute) byCountry.get(i.country)!.mute += 1;
  console.log("\nby country (open rows, described, mute):");
  for (const [cc, e] of [...byCountry].sort((a, b) => (b[1].open - b[1].desc) - (a[1].open - a[1].desc))) {
    if (e.open - e.desc === 0) continue;
    console.log(`  ${cc.padEnd(4)} open=${String(e.open).padStart(4)} described=${String(e.desc).padStart(4)} ` +
      `(${pct(e.desc, e.open).padStart(6)})  undescribed=${String(e.open - e.desc).padStart(4)}  mute=${String(e.mute).padStart(4)}`);
  }

  writeFileSync("/tmp/wsey_census_before.json", JSON.stringify({
    openPool: open.length,
    described: withDesc.length,
    legible: leg.length,
    useOfFundsFilter: withUse.length,
    anyScopeGate: withScope.length,
    objectiveUseOfFunds: withObj.length,
    mute: mute.length,
    undescribedIds: open.filter((i) => !(i.description ?? "").trim())
      .map((i) => ({ id: i.id, name: i.name, country: i.country, parentId: i.parentId,
        events: i.eventCount, totalEur: i.totalEur })),
    muteIds: mute.map((i) => i.id),
  }, null, 1));
  console.log("\nwrote /tmp/wsey_census_before.json");
}
main();
