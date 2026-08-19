import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal(); requireCredentials("x", ["DATABASE_URL"]);
import { hydrateDbInstruments, publishableInstruments, requireLiveCorpus, type DbInstrument } from "../../lib/intelligence/corpus";
import { oneLine, ROW_TITLE_CHARS } from "../../lib/intelligence/schemeText";
import { distinguishRowNames, rowRenderedLabels } from "../../lib/intelligence/shortlist";
import { cutTitles } from "../../lib/intelligence/rowTitleCut";
import type { InstrumentRow } from "../../lib/intelligence/types";
const rowOf = (i: DbInstrument): InstrumentRow => ({
  channel: i.sourceFamilyBucket ?? i.id, instrument: i.name, ticket: "", usedInField: false, fit: "",
  instrumentId: i.id, country: i.country, capitalType: i.capitalType,
  administeringBody: i.administeringBody, administeringBodyShare: i.administeringBodyShare,
  schemeCode: i.schemeCode, deliveryRegion: i.deliveryRegion, schemeOperators: i.schemeOperators,
} as InstrumentRow);
(async () => {
  await hydrateDbInstruments(); requireLiveCorpus("x");
  const three = publishableInstruments().filter((i) => i.schemeCode === "SA.40391");
  console.log("offerable SA.40391 leaves:", three.length);
  const rows = three.map(rowOf);
  console.log("\nBEFORE distinguishRowNames, rendered by oneLine (what the menu used to read):");
  for (const r of rows) console.log(`  [${r.instrumentId}]\n    ${oneLine(r.instrument, ROW_TITLE_CHARS)}`);
  distinguishRowNames(rows);
  console.log("\nAFTER distinguishRowNames, OLD per-row cut:");
  for (const r of rows) console.log(`  [${r.instrumentId}]\n    ${oneLine(r.instrument, ROW_TITLE_CHARS)}`);
  console.log("\nAFTER distinguishRowNames, NEW group cut (what the menu reads now):");
  const t = cutTitles(rows.map((r) => r.instrument), ROW_TITLE_CHARS);
  rows.forEach((r, i) => console.log(`  [${r.instrumentId}]\n    ${t[i]}`));
  const { merged } = rowRenderedLabels(rows);
  console.log("\nunseparable groups:", merged.length);
})();
