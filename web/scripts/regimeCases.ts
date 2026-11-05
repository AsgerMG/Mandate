// The population every within-regime measurement must agree about.
//
// `measure_sibling_choice.ts` defined this inline, and the moment a second
// harness needed the same group ("which siblings was the chooser actually
// choosing between?") there were two ways to build it and no guarantee they
// matched. That is the failure this repo has already paid for twice — the same
// ranker against different answer keys quoted as one number — so the case
// construction is declared once and imported, not copied.
//
// Three decisions are baked in here because getting any of them wrong changes
// every number downstream:
//
//   * Siblings come from the PUBLISHABLE set. Grading against leaves the
//     product can never show would measure a chooser nobody will run.
//   * The group is the REGIME (`parent_id`), not the same-name group. The
//     regime is what the table actually spends its rows on.
//   * The group is narrowed to the founder's COUNTRY by default, because the
//     pool only ever holds leaves that serve it. `COUNTRY=0` turns that off.
import {
  loadDbInstruments, publishableInstruments, type DbInstrument,
} from "../lib/intelligence/corpus";
import { loadRecallSet } from "./recallSet";

export interface RegimeCase {
  want: DbInstrument;
  group: DbInstrument[];
  sector: string;
  country: string;
  mode: string;
  region?: string;
  regionSource?: string;
}

/** Caller must have awaited `hydrateDbInstruments()` first. */
export function buildRegimeCases(): {
  file: string; split: string; narrow: boolean;
  cases: RegimeCase[]; alone: number;
} {
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const regimes = new Map<string, DbInstrument[]>();
  for (const i of publishableInstruments()) {
    if (!i.parentId) continue;
    (regimes.get(i.parentId) ?? regimes.set(i.parentId, []).get(i.parentId)!).push(i);
  }
  const regimeOf = new Map<string, DbInstrument[]>();
  for (const g of regimes.values()) if (g.length > 1) for (const i of g) regimeOf.set(i.id, g);

  const { file, rows } = loadRecallSet();
  const split = process.env.SPLIT ?? "holdout";
  const narrow = process.env.COUNTRY !== "0";
  const cases: RegimeCase[] = [];
  let alone = 0;
  for (const r of rows as unknown as Record<string, string>[]) {
    if (split !== "all" && r.split !== split) continue;
    const want = byId.get(r.instrument);
    let g = want ? regimeOf.get(want.id) : undefined;
    if (!want || !g || !r.sector) { alone++; continue; }
    if (narrow) g = g.filter((i) => !i.country || i.country === "EU" || i.country === r.country);
    if (g.length < 2 || !g.some((i) => i.id === want.id)) { alone++; continue; }
    cases.push({ want, group: g, sector: r.sector, country: r.country, mode: r.mode,
                 region: r.region, regionSource: r.regionSource });
  }
  return { file, split, narrow, cases, alone };
}

/** Regime-size quantiles of a case list, for the banner every harness prints. */
export function sizeQuantiles(cases: RegimeCase[]): (p: number) => number {
  const sizes = cases.map((c) => c.group.length).sort((a, b) => a - b);
  return (p: number) => sizes[Math.floor(p * (sizes.length - 1))];
}
