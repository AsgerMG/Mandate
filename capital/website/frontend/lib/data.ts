// Typed interfaces for the JSON data files produced by analysis/run.py.

// synthesis.json — corpus-wide KPIs read by the home page and layout footer.
export interface Synthesis {
  companies: number;
  events: number;
  champions: number;
  stepCompanies: number;
  totalCapitalEur: string;
  totalCapitalEurRaw: number;
  countries: number;
  sourceFamilies: number;
  sectors: number;
}
