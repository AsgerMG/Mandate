// Fails the build when the generated region module drifts from the NUTS
// reference data it is generated from.
//
// The module is generated because the frontend cannot import from outside its
// own tree. Generated-and-then-edited is the failure this guards: a region id
// that exists in one place and not the other does not throw, it just silently
// stops matching, and a regional scheme quietly reverts to being offered
// nationwide — the exact bug the region field was added to fix.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGIONS_BY_COUNTRY } from "../lib/intelligence/regions.generated";

const ROOT = join(__dirname, "..", "..", "..");
const ref = JSON.parse(
  readFileSync(join(ROOT, "data", "reference", "nuts_regions.json"), "utf8"),
) as { regions: Record<string, { id: string; name: string }[]> };

const problems: string[] = [];

for (const [cc, rows] of Object.entries(ref.regions)) {
  // Same rule the generator applies: one entry per name, the broader id wins.
  const best = new Map<string, string>();
  for (const r of rows) {
    const prev = best.get(r.name);
    if (!prev || r.id.length < prev.length) best.set(r.name, r.id);
  }
  const expected = [...best.entries()]
    .map(([name, id]) => ({ id, name }))
    // Code-point order, NOT localeCompare: the generator sorts in Python and
    // the two disagree on accented names (Åland, Łódzkie), which would report
    // drift on every run and train people to ignore this check.
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const actual = REGIONS_BY_COUNTRY[cc] ?? [];
  if (actual.length !== expected.length) {
    problems.push(`${cc}: generated has ${actual.length} regions, reference has ${expected.length}`);
    continue;
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i].id !== expected[i].id || actual[i].name !== expected[i].name) {
      problems.push(
        `${cc}: ${actual[i].id} "${actual[i].name}" != ${expected[i].id} "${expected[i].name}"`);
      break;
    }
  }
}

for (const cc of Object.keys(REGIONS_BY_COUNTRY)) {
  if (!ref.regions[cc]) problems.push(`${cc}: in generated module but not in the reference data`);
}

if (problems.length) {
  console.error("check_regions: generated module is stale — run `python3 ETL/terms/emit_regions.py`");
  for (const p of problems.slice(0, 12)) console.error(`  ${p}`);
  process.exit(1);
}

const total = Object.values(REGIONS_BY_COUNTRY).reduce((n, r) => n + r.length, 0);
console.log(`check_regions: ok — ${total} regions across ${Object.keys(REGIONS_BY_COUNTRY).length} countries`);
