// WHAT DOES A FOUNDER ACTUALLY READ?
//
// EXACT@5 says the right leaf is on the page. It does not say the founder can
// TELL WHICH ROW IT IS. Under a door-level row that distinction is the whole
// product: twelve leaves of SA.111723 are twelve different regional bodies, and
// if all twelve render "FR R&D state aid scheme SA.111723" then a hit on the
// metric is a miss on the page.
//
// So print the five rows, exactly as they are labelled, for one founder per
// market. Free, deterministic, and the only check that can catch a row reading
// like a database key.
//
//   npx tsx scripts/show_rows.ts            # a handful of markets
//   COUNTRY=FR npx tsx scripts/show_rows.ts
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("show_rows", ["DATABASE_URL", "VOYAGE_KEY"]);

import { hydrateDbInstruments, loadDbInstruments } from "../../lib/intelligence/corpus";
import {
  selectInstrumentRows, materialiseInstrumentTable, displayInstitutionName,
} from "../../lib/intelligence/shortlist";
import { nameableBody, VIA } from "../../lib/intelligence/rowIdentity";

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const countries = (process.env.COUNTRY ?? "FR,DE,ES,IT,SE").split(",");
  for (const country of countries) {
    const input = {
      fieldChannels: new Set<string>(), founderCountries: [country],
      capitalSought: ["grant"], ticketBand: "b500k_2m5", consortiumOk: true,
      description: "a robotics company building autonomous warehouse handling systems",
      founderSector: "industrial_tech",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never;
    const rows = materialiseInstrumentTable(selectInstrumentRows(input), input);
    console.log(`\n=== ${country} ===`);
    for (const [n, r] of rows.slice(0, 5).entries()) {
      const inst = r.instrumentId ? byId.get(r.instrumentId) : undefined;
      const body = inst ? nameableBody(inst as never) : null;
      console.log(`  ${n + 1}. ${r.instrument}`);
      console.log(`       renders as : ${displayInstitutionName(r)}`);
      console.log(`       door label : ${r.schemeCode && body
        ? `${r.schemeCode} ${VIA} ${body}` : "(no door -- scheme row)"}`);
      console.log(`       id=${r.instrumentId}  scheme=${r.schemeCode ?? "-"}` +
        `  body=${r.administeringBody ?? "-"}`);
    }
  }
}
main();
