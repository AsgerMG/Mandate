// wsGV — what the three candidate row fields are actually worth, measured on
// the corpus and on real menus, for nothing.
//
// The free ladder (`npm run stages`) has no model in it, so a change to what
// the PROMPT renders is invisible to it by construction: every stage above the
// model line is a cut this repo makes with its own code, and `renderRow`'s
// output feeds exactly one consumer, the Anthropic call. So the honest
// instrument for a row-content change is not the funnel. It is this:
//
//   COVERAGE   how many rows can say anything at all
//   VARIANCE   does the value differ ACROSS the menu (else it separates nothing)
//   SIBLINGS   does it differ INSIDE a same-scheme group (the harder cut)
//   COST       characters, against the row and against the whole prompt
//   CHANGED    how many founders' rows move at all
//
// Nothing here is a conversion number and nothing here should be quoted as one.
//
//   npx tsx scripts/_wsgv_rowfields.ts          # corpus + menus
//   MENUS=0 npx tsx scripts/_wsgv_rowfields.ts  # corpus only, no pool builds
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsgv_rowfields", ["DATABASE_URL", "VOYAGE_KEY"]);

import { buildPrompt, intakeAnswerLines } from "../../lib/intelligence/agentSelect";
import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../../lib/intelligence/corpus";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import { accessiblePool } from "../../lib/intelligence/memoCandidates";
import { regionNameFor } from "../../lib/intelligence/regions.generated";
import { resetRankerTally, semanticFundMatch } from "../../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList, registeredPurpose,
  tableInputFromAnswers, VERDICT_POOL,
} from "../../lib/intelligence/shortlist";
import { assessAll } from "../../lib/intelligence/verdict";
import { ARCHETYPES } from "../../lib/intelligence/__archetypes";
import type { EligibilityAnswers, InstrumentRow } from "../../lib/intelligence/types";

const pct = (a: number, b: number) => `${((100 * a) / (b || 1)).toFixed(1)}%`;
const quant = (xs: number[], q: number) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : 0;

function corpusPass() {
  const all = loadDbInstruments().filter((i) => !i.isFramework);
  console.log(`\n══ CORPUS ══ ${all.length} non-framework instruments\n`);

  // ── registeredPurpose ──────────────────────────────────────────────────
  const purpose = new Map<string, string>();
  for (const i of all) { const p = registeredPurpose(i.id); if (p) purpose.set(i.id, p); }
  const plen = [...purpose.values()].map((p) => p.length);
  console.log(`registeredPurpose  ${purpose.size} rows (${pct(purpose.size, all.length)})`);
  console.log(`  chars            p50 ${quant(plen, 0.5)}  p90 ${quant(plen, 0.9)}  max ${Math.max(0, ...plen)}`);
  console.log(`  distinct values  ${new Set(purpose.values()).size}`);
  // Within a notified scheme: the claim is that it has NO variance there.
  const byScheme = new Map<string, Set<string>>();
  for (const i of all) {
    const c = (i.schemeCode ?? "").trim();
    if (!c) continue;
    byScheme.set(c, (byScheme.get(c) ?? new Set()).add(purpose.get(i.id) ?? ""));
  }
  const groups = [...byScheme].filter(([, v]) => v.size >= 1);
  const multi = [...byScheme.entries()].filter(([c]) =>
    all.filter((i) => (i.schemeCode ?? "").trim() === c).length > 1);
  console.log(`  same-scheme groups with >1 leaf: ${multi.length}; ` +
    `groups where the purpose differs inside: ${multi.filter(([, v]) => v.size > 1).length}`);
  console.log(`  (${groups.length} distinct scheme codes in all)`);

  // ── award quartiles ────────────────────────────────────────────────────
  const q = all.filter((i) => i.awardP25 != null && i.awardP75 != null && (i.awardN ?? 0) >= 5);
  const wide = q.filter((i) => (i.awardP75 as number) > (i.awardP25 as number));
  const decades = q.map((i) => Math.log10(Math.max(1, i.awardP75 as number) / Math.max(1, i.awardP25 as number)));
  console.log(`\naward quartiles    ${q.length} rows (${pct(q.length, all.length)}) carry p25+p75 at n>=5`);
  console.log(`  p75 > p25        ${wide.length} (${pct(wide.length, q.length)}) — the rest print a point, not a range`);
  console.log(`  spread, decades  p50 ${decades.length ? quant(decades, 0.5).toFixed(2) : "-"}  p90 ${decades.length ? quant(decades, 0.9).toFixed(2) : "-"}`);

  // ── scheme code as a grouping cue ──────────────────────────────────────
  const withCode = all.filter((i) => (i.schemeCode ?? "").trim());
  console.log(`\nschemeCode         ${withCode.length} rows (${pct(withCode.length, all.length)})`);
  console.log(`  codes held by >1 instrument: ${multi.length}`);
}

/** What the region branch of `distinguishRowNames` actually emitted, read off
 *  the row it produced — the one observation of it available from outside. */
function regionTokenRows(rows: InstrumentRow[]): InstrumentRow[] {
  return rows.filter((r) => {
    if (!r.deliveryRegion) return false;
    const token = regionNameFor(r.deliveryRegion) ?? r.deliveryRegion;
    return r.instrument.includes(` · ${token}`);
  });
}

async function menuPass() {
  console.log(`\n══ MENUS ══ one founder per archetype, pool as the memo seam builds it\n`);
  let rowsSeen = 0, purposeRows = 0, quartileRows = 0, regionTokens = 0;
  let menusWithSchemeSibling = 0, siblingRows = 0, purposeDistinct = 0, purposeRestated = 0;
  const promptChars: number[] = [];

  for (const a of ARCHETYPES) {
    resetRankerTally();
    resetGateHydration();
    const answers: EligibilityAnswers = {
      sector: a.sector,
      entityCountries: [a.country],
      ticketBand: "b500k_2m5",
      useOfFunds: ["rnd", "capex"],
      consortium: "unsure",
      ...(a.region ? { region: a.region } : {}),
      ...(a.activities ? { activities: a.activities } : {}),
    };
    // The pool exactly as `_wsdl_menu.ts` builds it, which is the memo seam's
    // own path. A diagnostic that assembles its own differs from what ships.
    const log = new ExclusionLog();
    const semantic = await semanticFundMatch(a.description);
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: founderCountryList(a.country, answers.entityCountries),
      capitalSought: [],
      description: a.description,
      semantic,
      ...tableInputFromAnswers(answers),
      log,
    } as never);
    const pool = applyProfileSignal(
      accessiblePool(hydrated, answers, log).slice(0, VERDICT_POOL), undefined, undefined);
    const ids = pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    await hydrateGatesFor(ids);
    const assessments = assessAll(ids, answers);

    rowsSeen += pool.length;
    const withPurpose = pool.filter((r) => r.registeredPurpose);
    purposeRows += withPurpose.length;
    purposeDistinct += new Set(withPurpose.map((r) => r.registeredPurpose)).size;
    quartileRows += pool.filter((r) => r.awardP25 != null && r.awardP75 != null
      && (r.typicalAwardN ?? 0) >= 5 && (r.awardP75 as number) > (r.awardP25 as number)).length;
    const rt = regionTokenRows(pool);
    regionTokens += rt.length;

    // IS IT NEW? A line that restates what the row already says is a cost with
    // no benefit — `beyondTitle` exists because 28% of descriptions were the
    // title said back. Same question, asked of the registered purpose against
    // everything else the row prints in prose: if every content word of the
    // purpose is already somewhere on the row, it is not a new fact.
    for (const r of withPurpose) {
      const already = [r.description, r.eligibilityText, ...(r.judgementCriteria ?? [])]
        .filter(Boolean).join(" ").toLowerCase();
      const words = (r.registeredPurpose ?? "").toLowerCase()
        .replace(/\(art[^)]*\)/g, "").split(/[^\p{L}]+/u).filter((w) => w.length > 3);
      if (words.length && words.every((w) => already.includes(w))) purposeRestated++;
    }

    const codes = new Map<string, number>();
    for (const r of pool) {
      const c = (r.schemeCode ?? "").trim();
      if (c) codes.set(c, (codes.get(c) ?? 0) + 1);
    }
    const shared = [...codes.values()].filter((n) => n > 1);
    if (shared.length) menusWithSchemeSibling++;
    siblingRows += shared.reduce((s, n) => s + n, 0);

    const prompt = buildPrompt(pool, {
      country: a.country, sector: a.sector, description: a.description,
      answers: intakeAnswerLines(answers), assessments,
    }, 0, 6);
    promptChars.push(prompt.length);

    console.log(`${a.label.padEnd(24)} pool ${String(pool.length).padStart(2)}  ` +
      `purpose ${String(withPurpose.length).padStart(2)} (${new Set(withPurpose.map((r) => r.registeredPurpose)).size} distinct)  ` +
      `quartile-range ${String(pool.filter((r) => r.awardP25 != null && r.awardP75 != null && (r.typicalAwardN ?? 0) >= 5 && (r.awardP75 as number) > (r.awardP25 as number)).length).padStart(2)}  ` +
      `scheme-siblings ${String(shared.reduce((s, n) => s + n, 0)).padStart(2)}  ` +
      `region-token ${rt.length}  prompt ${prompt.length}`);
  }

  console.log(`\nover ${ARCHETYPES.length} menus, ${rowsSeen} rows:`);
  console.log(`  registeredPurpose on   ${purposeRows} (${pct(purposeRows, rowsSeen)}), ` +
    `${(purposeDistinct / ARCHETYPES.length).toFixed(1)} distinct values per menu`);
  console.log(`    of which RESTATED    ${purposeRestated} (${pct(purposeRestated, purposeRows)}) ` +
    `— every content word already elsewhere in that row's prose`);
  console.log(`  quartile range on      ${quartileRows} (${pct(quartileRows, rowsSeen)})`);
  console.log(`  rows in a scheme group ${siblingRows} (${pct(siblingRows, rowsSeen)}), ` +
    `on ${menusWithSchemeSibling}/${ARCHETYPES.length} menus`);
  console.log(`  region token in title  ${regionTokens} (${pct(regionTokens, rowsSeen)}) ` +
    `<- delivery_region's ONLY path to the prompt today`);
  console.log(`  prompt chars           p50 ${quant(promptChars, 0.5)}  max ${Math.max(...promptChars)}`);
}

/**
 * ONE FOUNDER PER MARKET, for the one question twelve archetypes cannot settle.
 *
 * `delivery_region`'s ONLY path to the prompt is the token
 * `distinguishRowNames` appends when a same-name peer group is separated by
 * region and not by body. The archetypes never hit it, and "never on twelve
 * menus" is not the same claim as "never". The precedent for a branch that
 * emits nothing is measured across markets — the scheme-code branch beside it
 * was removed on exactly that evidence — so this asks the same way.
 *
 * The sector is held fixed so the only thing varying is the market.
 */
async function countryPass() {
  const countries = [...new Set(loadDbInstruments()
    .filter((i) => !i.isFramework && i.country && i.country !== "EU")
    .map((i) => i.country as string))].sort();
  console.log(`\n══ MARKETS ══ ${countries.length}, one founder each, sector held fixed\n`);
  let rows = 0, tokens = 0, siblings = 0, purpose = 0;
  const hits: string[] = [];
  for (const country of countries) {
    resetGateHydration();
    const answers: EligibilityAnswers = {
      sector: "health_life_sciences", entityCountries: [country],
      ticketBand: "b500k_2m5", useOfFunds: ["rnd", "capex"], consortium: "unsure",
    };
    const log = new ExclusionLog();
    const semantic = await semanticFundMatch("Wearable cardiac monitoring device with regulatory clearance pending");
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: founderCountryList(country, [country]),
      capitalSought: [], description: "Wearable cardiac monitoring device with regulatory clearance pending", semantic,
      ...tableInputFromAnswers(answers), log,
    } as never);
    const pool = accessiblePool(hydrated, answers, log).slice(0, VERDICT_POOL);
    rows += pool.length;
    const rt = regionTokenRows(pool);
    tokens += rt.length;
    if (rt.length) hits.push(`${country}:${rt.length}`);
    purpose += pool.filter((r) => r.registeredPurpose).length;
    const codes = new Map<string, number>();
    for (const r of pool) {
      const c = (r.schemeCode ?? "").trim();
      if (c) codes.set(c, (codes.get(c) ?? 0) + 1);
    }
    siblings += [...codes.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);
  }
  console.log(`${countries.length} markets, ${rows} rows`);
  console.log(`  registeredPurpose on   ${purpose} (${pct(purpose, rows)})`);
  console.log(`  rows in a scheme group ${siblings} (${pct(siblings, rows)})`);
  console.log(`  region token in title  ${tokens} (${pct(tokens, rows)})` +
    `${hits.length ? ` — ${hits.join(" ")}` : " — the branch emitted nothing in any market"}`);
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsgv_rowfields");
  corpusPass();
  if (process.env.MENUS !== "0") await menuPass();
  if (process.env.MARKETS === "1") await countryPass();
}

main().then(() => process.exit(0));
