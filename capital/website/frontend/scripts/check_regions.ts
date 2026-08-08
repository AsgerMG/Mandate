// Fails the build when the generated region module drifts from the NUTS
// reference data it is generated from.
//
// The module is generated because the frontend cannot import from outside its
// own tree. Generated-and-then-edited is the failure this guards: a region id
// that exists in one place and not the other does not throw, it just silently
// stops matching, and a regional scheme quietly reverts to being offered
// nationwide — the exact bug the region field was added to fix.
//
// Hermetic ON PURPOSE, and it says so below rather than merely happening to be:
// this compares a committed generated module against committed reference data,
// so two people must get the same answer whatever either of them has in the
// environment. It imports `toIso2` from corpus.ts, which is a pure string
// function — but corpus.ts is also where DATABASE_URL is read, and "the pure
// helper I imported cannot possibly open a connection" is exactly the reasoning
// that has to stop being made by hand.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGIONS_BY_COUNTRY, regionOptions } from "../lib/intelligence/regions.generated";
import { toIso2 } from "../lib/intelligence/corpus";

delete process.env.DATABASE_URL;

const ROOT = join(__dirname, "..", "..", "..");
const ref = JSON.parse(
  readFileSync(join(ROOT, "data", "reference", "nuts_regions.json"), "utf8"),
) as { regions: Record<string, { id: string; name: string }[]> };

const problems: string[] = [];

// Eurostat does not use ISO codes for two members: NUTS writes EL for Greece
// and UK for the United Kingdom. The generator normalises to ISO2, so this
// check must compare on the same footing or it reports drift forever.
const NUTS_TO_ISO2: Record<string, string> = { EL: "GR", UK: "GB" };
const refByIso: Record<string, { id: string; name: string }[]> = {};
for (const [cc, rows] of Object.entries(ref.regions)) {
  refByIso[NUTS_TO_ISO2[cc] ?? cc] = rows;
}

for (const [cc, rows] of Object.entries(refByIso)) {
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
  if (!refByIso[cc]) problems.push(`${cc}: in generated module but not in the reference data`);
}

// ── Every country the corpus actually holds must resolve to regions ───────
// Coverage was uneven in a way no per-file check would have caught: Eurostat
// writes EL for Greece and UK for the United Kingdom where ISO writes GR and
// GB, and nine enlargement countries were missing from the name->code map
// entirely. Each failed identically and silently — the region question simply
// stopped being asked for that country, and nothing anywhere reported it.
//
// Driven off the corpus rather than a list kept here, so adding a country to
// the corpus is what makes this check demand regions for it.
const terms = JSON.parse(
  readFileSync(join(__dirname, "..", "public", "data", "instrument_terms.json"), "utf8"),
) as { records: { country: string | null }[] };

const uncovered: string[] = [];

const corpusCountries = [...new Set(
  terms.records.map((r) => r.country).filter((c): c is string => Boolean(c) && c !== "EU"),
)].sort();

for (const raw of corpusCountries) {
  const cc = toIso2(raw);
  if (!cc) {
    problems.push(`${raw}: in the corpus but does not resolve to an ISO2 code`);
  } else if (regionOptions([cc]).length === 0) {
    // Distinguish OUR drift from a gap in the classification itself. The
    // United Kingdom is the real case: Eurostat dropped it from NUTS after
    // Brexit, so no amount of correctness here produces UK regions. That is a
    // coverage limit to state plainly, not a bug to fail the build on —
    // whereas a country the classification DOES cover having no regions here
    // means we broke something.
    (refByIso[cc] ? problems : uncovered).push(
      refByIso[cc]
        ? `${raw} (${cc}): the classification covers it but the module has no regions`
        : `${raw} (${cc})`);
  }
}

if (uncovered.length) {
  console.log(
    `check_regions: ${uncovered.length} corpus ${uncovered.length === 1 ? "country is" : "countries are"} ` +
    `outside the NUTS classification, so regional rules there stay unevaluable: ${uncovered.join(", ")}`);
}

if (problems.length) {
  console.error("check_regions: generated module is stale — run `python3 ETL/terms/emit_regions.py`");
  for (const p of problems.slice(0, 12)) console.error(`  ${p}`);
  process.exit(1);
}

const total = Object.values(REGIONS_BY_COUNTRY).reduce((n, r) => n + r.length, 0);
console.log(`check_regions: ok — ${total} regions across ${Object.keys(REGIONS_BY_COUNTRY).length} countries`);
