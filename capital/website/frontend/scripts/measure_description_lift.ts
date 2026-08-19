// What is the founder's own description WORTH?
//
// Every previous comparison of "described" against "undescribed" cases compared
// two different POPULATIONS: EU programme winners (who have a project title) and
// national scheme winners (who do not). Those populations differ in country, in
// channel, in how many siblings the answer hides among, and in how well the
// corpus profiles them. Any gap between them is confounded by all of that.
//
// This is the paired test. The SAME company, the SAME won fund, the SAME intake
// answers, ranked twice:
//
//   real      description = what the company actually said about its project
//   template  description = the canned sector sentence, which is all a founder
//             who skips the free-text box gives us
//
// The difference is the description and nothing else, so it is the honest
// business case for asking the question on screen one.
//
// Run it against the ENRICHED set. `__recallSet.json`'s described rows are 46%
// leaky — their description sits verbatim inside the won fund's own profile text
// — which inflates the `real` arm and nothing else, so it overstates exactly the
// number this script exists to establish. `__recallSetEnriched.json` marks those
// rows and they are skipped here.
//
//   SET=__recallSetEnriched.json npx tsx scripts/measure_description_lift.ts
//   SPLIT=tune N=60 npx tsx scripts/measure_description_lift.ts
//   ARM=real npx tsx scripts/measure_description_lift.ts   # one arm only

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("measure_description_lift", ["DATABASE_URL", "VOYAGE_KEY"]);

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { loadRecallSet } from "./recallSet";

interface Pair {
  name: string; country: string; sector?: string; instrument: string;
  description?: string; selfDescription?: string; mode: string; split: string;
  descriptionSource?: string;
}

/**
 * The canned sentence a founder who skips the free-text box is represented by.
 *
 * Read off the recall set itself rather than written out here, so this cannot
 * drift from the strings the profile-mode pairs actually carry — and so no
 * sector wording is hardcoded in this file.
 */
function templateBySector(all: Pair[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of all) {
    if (r.selfDescription && r.sector && !m.has(r.sector)) m.set(r.sector, r.selfDescription);
  }
  return m;
}

async function rank(t: Pair, description: string | undefined) {
  return computeVerdict("TestCo", t.country, {
    entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
    borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
    // Identical in both arms, and uniform across pairs — see measure_recall.ts
    // for why a constant here is what keeps the objective signal leak-free.
    useOfFunds: ["industrial_research", "experimental_development"],
  } as never, {
    capitalSought: ["grant", "loan"],
    description,
  } as never);
}

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const { file: setFile, rows: all } = loadRecallSet() as unknown as { file: string; rows: Pair[] };
  const templates = templateBySector(all);

  const split = process.env.SPLIT ?? "holdout";
  // Only pairs that HAVE a real description can be measured both ways. That is
  // the point: it isolates the description from the population.
  const eligible = all.filter((r) =>
    (split === "all" || r.split === split) &&
    Boolean(r.description && r.description.trim().length >= 12) &&
    r.descriptionSource !== "own_project_title_leaks" &&
    templates.has(r.sector ?? "other"));
  const leaky = all.filter((r) => (split === "all" || r.split === split)
    && r.descriptionSource === "own_project_title_leaks").length;

  const N = Math.min(Number(process.env.N ?? 250), eligible.length);
  const step = Math.max(1, Math.floor(eligible.length / N));
  const sample = eligible.filter((_, i) => i % step === 0).slice(0, N);
  const arms = process.env.ARM ? [process.env.ARM] : ["real", "template"];

  const stat: Record<string, { pool: number; e5: number; r5: number; e1: number }> = {};
  for (const a of arms) stat[a] = { pool: 0, e5: 0, r5: 0, e1: 0 };
  // Paired outcome per case, so the McNemar counts are available and not just
  // two marginal rates that happen to differ.
  const flips = { bothHit: 0, realOnly: 0, templateOnly: 0, neither: 0 };
  const perCase: { name: string; instrument: string; source: string;
                   real: boolean; template: boolean;
                   realRegime: boolean; templateRegime: boolean }[] = [];

  let done = 0;
  for (const t of sample) {
    const want = byId.get(t.instrument);
    const wantRegime = want?.parentId ?? t.instrument;
    const hit: Record<string, boolean> = {};
    const hitRegime: Record<string, boolean> = {};
    for (const arm of arms) {
      const desc = arm === "real" ? t.description : templates.get(t.sector ?? "other");
      const v = await rank(t, desc);
      const pool: string[] = v.candidateInstrumentIds ?? [];
      const top5 = (v.instrumentTable ?? []).slice(0, 5)
        .map((r) => r.instrumentId).filter(Boolean) as string[];
      const e5 = top5.includes(t.instrument);
      if (pool.includes(t.instrument)) stat[arm].pool++;
      if (e5) stat[arm].e5++;
      if (top5[0] === t.instrument) stat[arm].e1++;
      const r5 = top5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime);
      if (r5) stat[arm].r5++;
      hit[arm] = e5;
      hitRegime[arm] = r5;
    }
    if (arms.length === 2) {
      const r = hit.real, p = hit.template;
      if (r && p) flips.bothHit++;
      else if (r) flips.realOnly++;
      else if (p) flips.templateOnly++;
      else flips.neither++;
      perCase.push({ name: t.name, instrument: t.instrument,
                     source: t.descriptionSource ?? "own_project_title",
                     real: r, template: p,
                     realRegime: hitRegime.real, templateRegime: hitRegime.template });
    }
    done++;
    if (done % 25 === 0) console.error(`  … ${done}/${sample.length}`);
  }

  const pc = (n: number) => `${String(n).padStart(4)}/${done} (${(100 * n / done).toFixed(1)}%)`;
  console.log(`\nPAIRED description test — set=${setFile}, split=${split}, ` +
              `${done} companies, both arms same case`);
  console.log(`  eligible pairs with a real description: ${eligible.length}` +
              (leaky ? `  (${leaky} excluded: description leaks into the won fund's profile)` : ""));
  console.log(`\n  arm        in pool            EXACT@1            EXACT@5            REGIME@5`);
  for (const a of arms) {
    const s = stat[a];
    console.log(`  ${a.padEnd(9)}  ${pc(s.pool)}   ${pc(s.e1)}   ${pc(s.e5)}   ${pc(s.r5)}`);
  }
  if (arms.length === 2) {
    const lift = 100 * (stat.real.e5 - stat.template.e5) / done;
    console.log(`\n  EXACT@5 lift from the founder's own words: ${lift >= 0 ? "+" : ""}${lift.toFixed(1)}pp`);
    console.log(`  paired outcomes: both ${flips.bothHit} · real only ${flips.realOnly} ` +
                `· template only ${flips.templateOnly} · neither ${flips.neither}`);
    const disc = flips.realOnly + flips.templateOnly;
    console.log(`  discordant ${disc} (${flips.realOnly} for the description, ${flips.templateOnly} against)`);

    // Split by WHERE the description came from. The two populations are not the
    // same problem: an EU programme winner is picking among a handful of
    // thematically distinct partnerships, a national-scheme winner among dozens
    // of siblings that read alike. Reporting one blended number for both is how
    // the "79.4% vs 17.2%" figure came to be read as a ranking gap when it was
    // largely a population gap.
    const bySource = new Map<string, {
      n: number; real: number; template: number; realR: number; templateR: number }>();
    for (const c of perCase) {
      const s = bySource.get(c.source)
        ?? { n: 0, real: 0, template: 0, realR: 0, templateR: 0 };
      s.n++;
      if (c.real) s.real++; if (c.template) s.template++;
      if (c.realRegime) s.realR++; if (c.templateRegime) s.templateR++;
      bySource.set(c.source, s);
    }
    console.log(`\n  by where the description came from — EXACT@5, then REGIME@5:`);
    for (const [src, s] of [...bySource].sort((a, b) => b[1].n - a[1].n)) {
      const le = 100 * (s.real - s.template) / s.n;
      const lr = 100 * (s.realR - s.templateR) / s.n;
      const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
      console.log(`    ${src.padEnd(22)} n=${String(s.n).padStart(4)}  ` +
                  `EXACT ${(100 * s.real / s.n).toFixed(1).padStart(5)}% vs ` +
                  `${(100 * s.template / s.n).toFixed(1).padStart(5)}% = ${sign(le).padStart(7)}   ` +
                  `REGIME ${(100 * s.realR / s.n).toFixed(1).padStart(5)}% vs ` +
                  `${(100 * s.templateR / s.n).toFixed(1).padStart(5)}% = ${sign(lr).padStart(7)}`);
    }
  }
}
main();
