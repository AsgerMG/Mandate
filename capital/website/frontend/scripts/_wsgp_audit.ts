// wsGP diagnostic: WHICH FIELDS DOES THE HARNESS ANSWER THAT PRODUCTION CANNOT?
//
// Not a guard and not published. It builds every founder in the shipped recall
// set through `founderIntake` and, for each field that actually carried a
// value, prints what production's own reach table says about that field and
// whether the value is one production's vocabulary can produce.
//
// FREE: reads two committed trees. No credentials, no network, no database.
import { FIELD_REACH } from "../lib/intelligence/types";
import { VOCABULARY } from "../lib/intelligence/vocabulary";
import { regionOptions } from "../lib/intelligence/regions.generated";
import { toIso2 } from "../lib/intelligence/countryCodes";
import { founderIntake, founderPolicyFromEnv, ALL_INTAKE_FIELDS } from "./founderIntake";
import type { IntakeField } from "./founderIntake";
import { loadRecallSet } from "./recallSet";

const { rows } = loadRecallSet("wsGP audit");
const policy = founderPolicyFromEnv();

const setCount = new Map<IntakeField, number>();
const badValues = new Map<IntakeField, Map<string, number>>();
let optsCapital = 0, optsDesc = 0, optsMarkets = 0;

for (const r of rows) {
  const f = founderIntake(r as never, policy);
  for (const k of ALL_INTAKE_FIELDS) {
    const v = (f.eligibility as Record<string, unknown>)[k];
    if (v === undefined) continue;
    setCount.set(k, (setCount.get(k) ?? 0) + 1);
    const vocab = VOCABULARY[k];
    if (!vocab || !vocab.values.length) continue;
    for (const one of Array.isArray(v) ? v : [v]) {
      if (typeof one !== "string") continue;
      if (vocab.values.includes(one)) continue;
      const m = badValues.get(k) ?? new Map<string, number>();
      m.set(one, (m.get(one) ?? 0) + 1);
      badValues.set(k, m);
    }
  }
  if (f.opts.capitalSought.length) optsCapital++;
  if (f.opts.description) optsDesc++;
  if (f.opts.targetMarkets.length) optsMarkets++;
}

console.log(`\n${rows.length} founders replayed under `
  + `identity=${policy.identity} answers=${policy.answers} capital=${policy.capital} `
  + `consortium=${policy.consortium ?? "(unanswered)"}\n`);
console.log("field                 set      FIELD_REACH.via   arm            arm state  production can populate?");
for (const k of [...setCount.keys()].sort()) {
  const reach = FIELD_REACH[k];
  const arm = reach.armEnv ?? "";
  const state = arm ? (process.env[arm] === "on" ? "ON" : "OFF") : "-";
  const can = reach.via === "unreachable" ? "NO — nothing can answer it"
    : reach.via === "staged" && state !== "ON" ? `NO — control not rendered while ${arm} is off`
    : "yes";
  console.log(`${k.padEnd(20)} ${String(setCount.get(k)).padStart(5)}   `
    + `${reach.via.padEnd(16)}  ${arm.padEnd(36)} ${state.padEnd(4)}  ${can}`);
}
console.log("\nvalues outside production's own vocabulary:");
if (!badValues.size) console.log("  (none — every value handed over is one the founder's control can produce)");
for (const [k, m] of badValues) {
  console.log(`  ${k}: ${[...m].map(([v, n]) => `${v} x${n}`).join(", ")}`);
}
console.log(`\ncomputeVerdict opts: capitalSought non-empty on ${optsCapital}, `
  + `description on ${optsDesc}, targetMarkets on ${optsMarkets} of ${rows.length}`);

// ── The same question one level down: is every VALUE one production offers? ─
// A field production asks can still be handed a value its control cannot
// produce, and the effect is identical — a gate fires on an answer no founder
// could have given. `region` is the case with no fixed vocabulary: its options
// are derived from the founder's country, so only `regionOptions` can judge it.
{
  const bad = new Map<string, number>();
  let checked = 0;
  for (const r of rows) {
    const f = founderIntake(r as never, policy);
    const region = (f.eligibility as Record<string, unknown>).region;
    if (typeof region !== "string") continue;
    checked++;
    const offered = regionOptions(
      (f.eligibility.entityCountries ?? []).map(toIso2).filter(Boolean));
    if (!offered.some((o) => o.value === region)) {
      bad.set(region, (bad.get(region) ?? 0) + 1);
    }
  }
  console.log(`\nregion values checked against the control's own option list: `
    + `${checked} supplied, ${[...bad.values()].reduce((a, b) => a + b, 0)} not offered`);
  for (const [v, n] of bad) console.log(`  ${v} x${n}`);
}
