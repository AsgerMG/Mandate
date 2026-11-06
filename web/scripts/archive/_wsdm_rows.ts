// wsDM — DOES THE SCHEME'S OWN SENTENCE REACH THE PRODUCTION ROW?
//
// The claim this script exists to stop being made on trust: wsDI shipped
// `schemeText.ts` and a `funds` field, and the merge commit said "the scheme's
// own words reach the row the model chooses from". They did not. `AxisFund` is
// built by two offline scripts and consumed by `fundSelection.ts`, which has no
// production caller; `InstrumentRow` — the row the shipped path builds and any
// selector reads — had no such field at all.
//
// So this walks the REAL build path: loadDbInstruments -> selectInstrumentRows
// -> materialiseInstrumentTable, the same two calls the pipeline makes, and
// prints what `description` is on the rows that come out. It reports coverage
// on the whole pool rather than the published six, because the pool is what a
// selector reads and coverage on six rows is a sample of size six.
//
// Free and deterministic: no model call. It passes no `semantic` map to
// `selectInstrumentRows`, so no embedding is computed on this path.
//
// ── Why VOYAGE_KEY is declared anyway ─────────────────────────────────────
// `shortlist.ts` reaches `semanticFundMatch`, and `check_env_loader`'s P4 is
// per MODULE rather than per call: a script that CAN reach a credential
// declares it. That over-approximation is the safe direction and it costs this
// harness nothing, because the production path it exists to walk is the one
// that DOES rank semantically -- the day this script is extended to hand
// `selectInstrumentRows` a real `semantic` map, an undeclared key would have
// it silently measuring the lexical order instead. Declaring is how that stays
// impossible rather than merely unlikely. `_wsdc_rows.ts`, its sibling on the
// same path, declares both.
//
//   npx tsx scripts/_wsdm_rows.ts
//   COUNTRY=FR,DE npx tsx scripts/_wsdm_rows.ts
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("_wsdm_rows", ["DATABASE_URL", "VOYAGE_KEY"]);

import { hydrateDbInstruments } from "../../lib/intelligence/corpus";
import { selectInstrumentRows, materialiseInstrumentTable } from "../../lib/intelligence/shortlist";
import { FUNDS_SENTENCE_CHARS } from "../../lib/intelligence/schemeText";

const pct = (n: number, d: number) => d ? `${((100 * n) / d).toFixed(1)}%` : "n/a";

async function main() {
  await hydrateDbInstruments();
  const countries = (process.env.COUNTRY ?? "FR,DE,ES,IT,SE,NL").split(",");
  let withDesc = 0, total = 0, chars = 0, over = 0;
  const seen = new Set<string>();
  for (const country of countries) {
    const input = {
      fieldChannels: new Set<string>(), founderCountries: [country],
      capitalSought: ["grant"], ticketBand: "b500k_2m5", consortiumOk: true,
      description: "a robotics company building autonomous warehouse handling systems",
      founderSector: "industrial_tech",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never;
    const rows = materialiseInstrumentTable(selectInstrumentRows(input), input);
    console.log(`\n=== ${country} — ${rows.length} rows in the pool ===`);
    for (const [n, r] of rows.slice(0, 6).entries()) {
      console.log(`  ${n + 1}. ${r.instrument}`);
      console.log(`       descriptor  (ours) : ${r.descriptor ?? "(none)"}`);
      console.log(`       description (its own): ${r.description ?? "(none on file)"}`);
    }
    for (const r of rows) {
      const key = r.instrumentId ?? `${country}:${r.instrument}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total++;
      if (r.description) {
        withDesc++;
        chars += r.description.length;
        if (r.description.length > FUNDS_SENTENCE_CHARS + 1) over++;
      }
    }
  }
  console.log(`\n--- across ${total} distinct pool rows in ${countries.length} markets ---`);
  console.log(`  carry a description : ${withDesc} (${pct(withDesc, total)})`);
  console.log(`  mean length         : ${withDesc ? Math.round(chars / withDesc) : 0} chars` +
    ` (budget ${FUNDS_SENTENCE_CHARS})`);
  // The budget is the point of the module; a row over it means something is
  // rendering the raw column and the prompt cost is unbounded.
  console.log(`  over budget         : ${over}` +
    (over ? "  <-- BUDGET BREACH, fundsSentence was bypassed" : "  (none)"));
  if (over) process.exit(1);
}
main();
