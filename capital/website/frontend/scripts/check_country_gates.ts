/**
 * A country-typed comparator must name a country the corpus recognises.
 *
 * FREE — no model calls, no cache. It reads `reference/europe_scope.json`, the same
 * file `ETL/lib/europe_scope.py` reads, so the vocabulary is READ by both
 * languages and restated by neither.
 *
 * ── The defect ────────────────────────────────────────────────────────────
 * `eligibility.ts` compares a founder's answer to `spec.allowed` by string
 * equality. `entityCountries` and `activityCountries` are the only gated fields
 * with no entry in `data/vocabularies.json` — their vocabulary is "the
 * countries of Europe", too long to hand-write — and `encode_gates.py` guarded
 * out-of-vocabulary values with `if vocab and ...`. For exactly these two
 * fields `vocab` was undefined, so the guard never ran and any string became a
 * live comparator.
 *
 * Measured 2026-08-08, 371 encoded country rules:
 *   - `SATR Gb Equity` held entityCountries in ["East Midlands", "Eastern",
 *     "London", ...] — the English REGIONS of its own scheme, in a field whose
 *     answers are countries. A British founder answers "United Kingdom",
 *     matches nothing, and the fund is hidden from the only population it was
 *     written for.
 *   - 20 rules stored a raw ISO code: entityCountries in ["ES"], ["NO"],
 *     ["SE"], ["LV"], ["EE"]. A Spanish founder answers "Spain". Those rules
 *     had never once fired.
 *   - Others read in ["EEA"], ["European Union"], ["Europe"],
 *     ["Sub-Saharan Africa"], ["Slovak Republic"], ["Czech Republic"].
 *
 * None of it failed anything. A rule that silently stops gating looks exactly
 * like a rule that passes, which is why this is a check and not a comment.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     A value stored under a country-typed field must be one of the corpus's
 *     own country NAMES.
 *
 * Stated as a property, with a test that decides values nobody has seen: it is
 * membership in europe_scope.json, not a list of the seven strings that
 * happened to break. Add a country to the corpus and this check follows.
 *
 * ── Direction is part of the property, not an exemption ───────────────────
 *   positive (in / equals) — an unresolvable value can never be satisfied, so
 *       the rule hides the fund. FAILURE.
 *   negative (not_in)      — "not_in ['Russia']" excludes a real place outside
 *       the founder population. Inert, but TRUE. Rewriting a fund's own rule to
 *       tidy our bookkeeping would be the worse error, so these are reported
 *       and never failed.
 *
 * DATABASE_URL is OPTIONAL: with no database this checks nothing and says so,
 * rather than failing a CI runner that has no corpus to read.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
const CREDENTIALS = requireCredentials(
  "check_country_gates", [], { optional: ["DATABASE_URL"] });

const COUNTRY_FIELDS = new Set(["entityCountries", "activityCountries"]);

/** The canon, read from the file ETL reads. Never restated here. */
function corpusCountryNames(): Set<string> {
  const p = path.resolve(__dirname, "../../../reference/europe_scope.json");
  const scope = JSON.parse(readFileSync(p, "utf8")) as {
    countries: { iso2: string; name: string }[];
  };
  if (!scope.countries?.length) {
    throw new Error(`${p} holds no countries; the canon cannot be empty`);
  }
  return new Set(scope.countries.map((c) => c.name));
}

function dsn(): string | null {
  return CREDENTIALS === "offline" ? null : process.env.DATABASE_URL ?? null;
}

type Spec = { op?: string; allowed?: string[]; value?: string };

async function main() {
  const names = corpusCountryNames();
  const url = dsn();
  if (!url) {
    console.log("check_country_gates: no DATABASE_URL, nothing to check " +
                `(canon holds ${names.size} countries)`);
    return;
  }

  const db = new Client({ connectionString: url });
  await db.connect();
  const { rows } = await db.query(
    `SELECT g.id, g.instrument_id, fi.name, g.intake_field_resolved AS field,
            g.value_spec, substr(g.requirement, 1, 90) AS req
       FROM eligibility_gates g
       JOIN funding_instruments fi ON fi.id = g.instrument_id
      WHERE g.value_spec IS NOT NULL
        AND g.intake_field_resolved IN ('entityCountries','activityCountries')
      ORDER BY g.id`);
  await db.end();

  const failures: string[] = [];
  const inert: string[] = [];
  let checked = 0;

  for (const r of rows) {
    if (!COUNTRY_FIELDS.has(r.field)) continue;
    const spec: Spec = typeof r.value_spec === "string"
      ? JSON.parse(r.value_spec) : r.value_spec;
    const op = spec.op ?? "";
    const values = spec.allowed ?? (spec.value ? [spec.value] : []);
    if (!values.length) continue;
    checked += 1;
    const unknown = values.filter((v) => !names.has(v));
    if (!unknown.length) continue;
    const where = `gate ${r.id} (${r.instrument_id}, ${String(r.name).slice(0, 40)}) ` +
                  `${r.field} ${op} ${JSON.stringify(unknown)}`;
    if (op === "not_in") inert.push(`  ${where}\n      ${r.req}`);
    else failures.push(`  ${where}\n      ${r.req}`);
  }

  console.log(`check_country_gates: ${checked} country-typed comparators, ` +
              `canon holds ${names.size} countries`);
  if (inert.length) {
    console.log(`\n  ${inert.length} not_in rules name a place outside the corpus. ` +
                `True, inert, deliberately not failed:`);
    for (const line of inert.slice(0, 10)) console.log(line);
  }
  if (failures.length) {
    console.error(`\nFAIL — ${failures.length} positive country rules no founder ` +
                  `answer can satisfy. Each one hides its fund:`);
    for (const line of failures) console.error(line);
    console.error("\nFix: python3 ETL/terms/encode_gates.py repair-countries");
    process.exitCode = 1;
    return;
  }
  console.log("  PASS — every positive country rule names a country a founder can answer.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
