// Does a French industrial-decarbonisation founder reach ADEME's programme?
process.env.NO_PG = "1";
delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.VOYAGE_KEY;
import { computeVerdict } from "../lib/intelligence/pipeline";

const ADEME = "ademe_aid__aap_decarb_ind_pdr_fdi_43019f";
(async () => {
  const v = await computeVerdict("Verkor", "FR", {
    entityCountries: ["FR"], companyAgeYears: 4, headcount: 60,
  } as never, {
    capitalSought: ["grant"],
    description: "We build and operate industrial decarbonisation equipment for heavy manufacturing sites in France, cutting process heat emissions.",
  });
  const ids: string[] = (v as never as { candidateInstrumentIds: string[] }).candidateInstrumentIds ?? [];
  console.log("pool", ids.length, "ADEME rank", ids.indexOf(ADEME));
  console.log(ids.slice(0, 15).join("\n"));
})();
