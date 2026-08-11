// wsFG — HOW MANY OF THE ROWS A FOUNDER IS SHOWN SAY NOTHING AT ALL?
//
// ── The question, and why it is asked per COUNTRY ─────────────────────────
// A candidate row carries a title, a facts line composed by us, and then --
// where the corpus has them -- the sentences that come from the fund itself:
// what it funds, who may apply, and what it assesses. A row with none of those
// is a row a selector cannot choose ON. It can only choose it by position,
// which is the empirical ranker's answer restated, so a menu of silent rows is
// a menu with nothing in it to read.
//
// The share is NOT uniform, and that is the whole reason this walks a spread
// rather than the two markets every other diagnostic in this repo happens to
// run on. Germany and France are at zero; the Nordics and the CEE members are
// where the corpus is thinnest and where the silent rows actually live. A
// before/after measured on DE and FR would have reported "no change" on a
// defect that never touched them.
//
// ── What it measures ──────────────────────────────────────────────────────
// The REAL menu. It builds the pool exactly as `runIntelligence` does and
// calls the same `buildPrompt` the live arm calls, then reads the bytes back:
// a row is SILENT when it carries none of the fund's own sentences. Counting
// anything reconstructed here would measure a prompt nobody sends.
//
// FREE and deterministic apart from one embedding call: no Anthropic call, no
// arm, nothing is sent. `semanticFundMatch` is computed once and reused across
// every country, so the ranking each country sees is the same founder's.
//
//   npx tsx scripts/_wsfg_silence.ts
//   COUNTRY=NO,CZ npx tsx scripts/_wsfg_silence.ts
//   VERBOSE=1 npx tsx scripts/_wsfg_silence.ts     # print the silent rows
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsfg_silence", ["DATABASE_URL", "VOYAGE_KEY"]);

import { buildPrompt, intakeAnswerLines, unansweredRankingFields } from "../lib/intelligence/agentSelect";
import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, requireLiveCorpus,
  type DbInstrument,
} from "../lib/intelligence/corpus";
import { isCited } from "../lib/intelligence/verdict";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { assessAll } from "../lib/intelligence/verdict";
import type { EligibilityAnswers } from "../lib/intelligence/types";

/** A spread, not a sample of the two markets our diagnostics run on.
 *
 *  Deliberately includes DE and FR — they are the control. A change that moves
 *  the Nordics and also moves Germany is a change to the ROW, not to the gap,
 *  and only having both in the same table makes that visible. */
const COUNTRIES = (process.env.COUNTRY ??
  "Germany,France,Norway,Czechia,Estonia,Sweden,Poland,Spain,Italy,Netherlands,Finland,Denmark,Austria,Portugal")
  .split(",").map((c) => c.trim()).filter(Boolean);

/** ONE founder, moved from country to country. Holding the company fixed is
 *  what makes the country column mean the corpus rather than the founder: a
 *  different description per market would confound the two. */
const DESCRIPTION =
  "a robotics company building autonomous warehouse handling systems, with a "
  + "machine-vision stack it develops itself and pilot customers in logistics";

/** The labelled lines a row may carry that come FROM THE FUND. `facts` is ours
 *  — composed from measured columns — and `qualification` is our own read of
 *  the founder's answers, so neither counts as the fund having spoken. */
const FUND_LINES = ["funds", "who may apply", "demands"] as const;

interface RowRead {
  index: number;
  title: string;
  has: Record<string, boolean>;
  /** How many requirements the `demands:` line actually printed. The funnel
   *  this workstream narrowed ends in a COUNT, not a share: 18,362 gate
   *  instances were visible to the open rows and 781 printed. */
  demands: number;
}

/** The rendered menu, read back out of the prompt that was actually built.
 *
 *  Parsed rather than recomputed, deliberately. A second renderer here would
 *  agree with production until the day it did not, and the number this script
 *  exists to print would then describe a prompt nobody sends. */
function readMenu(prompt: string): RowRead[] {
  const out: RowRead[] = [];
  for (const line of prompt.split("\n")) {
    const head = /^\[(\d+)\]\s+(.*)$/.exec(line);
    if (head) {
      out.push({
        index: Number(head[1]), title: head[2],
        has: Object.fromEntries(FUND_LINES.map((l) => [l, false])),
        demands: 0,
      });
      continue;
    }
    const cur = out[out.length - 1];
    if (!cur) continue;
    const body = /^ {5}([a-z ]+):\s*(\S.*)$/.exec(line);
    if (body && body[1] in cur.has) {
      cur.has[body[1]] = true;
      // `renderRow` joins requirements with " / ", which is the separator this
      // reads back. Counted rather than assumed, because the whole of job two
      // was a count that had been reported as a share.
      if (body[1] === "demands") cur.demands = body[2].split(" / ").length;
    }
  }
  return out;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");

/** WHY a row is silent, which is the only thing that says what to do about it.
 *
 *  A share on its own cannot distinguish the two causes, and they are not the
 *  same defect and do not belong to the same team:
 *
 *    SUPPRESSED — the corpus holds a sentence for this fund and the renderer
 *      did not print it. That is a bug in this codebase and this script's own
 *      workstream is what such a number is for.
 *    NOTHING HELD — the corpus holds no prose and no CITED rule for the fund at
 *      all, so there is no sentence to suppress. Rendering something anyway
 *      would mean printing an `llm_classified` guess as the fund's own words,
 *      which the evidence tiers forbid and `judgementCriteria` refuses on
 *      purpose. The fix is an extraction run, not a renderer change.
 *
 *  Uncited rules are counted separately rather than folded into either, because
 *  a row with five uncited gates and nothing else looks recoverable in a column
 *  count and is not recoverable on this side of the ETL. */
function whySilent(inst: DbInstrument | undefined): "suppressed" | "nothing held" {
  if (!inst) return "nothing held";
  const prose = (inst.description ?? "").trim() || (inst.eligibilityText ?? "").trim();
  const cited = (inst.gates ?? []).some((g) => isCited(g) && (g.requirement ?? "").trim());
  return prose || cited ? "suppressed" : "nothing held";
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsfg_silence");
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));

  const semantic = await semanticFundMatch(DESCRIPTION);

  const why = { suppressed: 0, "nothing held": 0, uncitedOnly: 0 };
  const totals = { rows: 0, silent: 0, chars: 0, menus: 0, demands: 0 };
  const perLine = Object.fromEntries(FUND_LINES.map((l) => [l, 0])) as Record<string, number>;
  const table: string[] = [];

  for (const country of COUNTRIES) {
    const eligibility: EligibilityAnswers = {
      sector: "industrial_manufacturing",
      entityCountries: [country],
      ticketBand: "b500k_2m5",
      useOfFunds: ["rnd", "capex"],
      consortium: "unsure",
      fteBand: "10-49",
      turnoverBand: "<2M",
      developmentStage: "pilot_customers",
      organisationType: "private_company",
    } as EligibilityAnswers;

    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: founderCountryList(country, undefined, eligibility.entityCountries),
      capitalSought: [],
      description: DESCRIPTION,
      semantic,
      ...tableInputFromAnswers(eligibility),
      log,
    } as never);
    const pool = applyProfileSignal(
      accessiblePool(hydrated, eligibility, log).slice(0, VERDICT_POOL), undefined, undefined);
    if (!pool.length) { table.push(`  ${country.padEnd(12)} — empty pool`); continue; }
    const ids = pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    await hydrateGatesFor(ids);

    const prompt = buildPrompt(pool, {
      country, sector: eligibility.sector, description: DESCRIPTION,
      answers: intakeAnswerLines(eligibility),
      unanswered: unansweredRankingFields(eligibility),
      assessments: assessAll(ids, eligibility),
    }, 0, 6);

    const menu = readMenu(prompt);
    const silent = menu.filter((r) => FUND_LINES.every((l) => !r.has[l]));
    totals.rows += menu.length;
    totals.silent += silent.length;
    totals.chars += prompt.length;
    totals.menus++;
    totals.demands += menu.reduce((a, r) => a + r.demands, 0);
    for (const l of FUND_LINES) perLine[l] += menu.filter((r) => r.has[l]).length;
    // `buildPrompt` renders `head.map((r, i) => ...)`, so the printed index IS
    // the pool index. Read across rather than re-derived, for the same reason
    // `readMenu` parses the prompt instead of rebuilding it.
    for (const r of silent) {
      const inst = byId.get(pool[r.index]?.instrumentId ?? "");
      why[whySilent(inst)]++;
      if ((inst?.gates ?? []).some((g) => (g.requirement ?? "").trim()) &&
          whySilent(inst) === "nothing held") why.uncitedOnly++;
    }

    table.push(
      `  ${country.padEnd(12)} ${String(menu.length).padStart(3)} rows   ` +
      `SILENT ${String(silent.length).padStart(3)} (${pct(silent.length, menu.length).padStart(6)})   ` +
      FUND_LINES.map((l) =>
        `${l} ${pct(menu.filter((r) => r.has[l]).length, menu.length).padStart(6)}`).join("  ") +
      `   prompt ${(prompt.length / 1000).toFixed(1)}k`);
    if (process.env.VERBOSE) {
      for (const r of silent) table.push(`        silent: [${r.index}] ${r.title}`);
    }
  }

  console.log(`\nONE founder (${DESCRIPTION.slice(0, 48)}...), moved across ` +
    `${COUNTRIES.length} markets. The menu is the REAL prompt.\n`);
  console.log(table.join("\n"));
  console.log(`\n  ${"ALL".padEnd(12)} ${String(totals.rows).padStart(3)} rows   ` +
    `SILENT ${String(totals.silent).padStart(3)} (${pct(totals.silent, totals.rows)})   ` +
    FUND_LINES.map((l) => `${l} ${pct(perLine[l], totals.rows)}`).join("  "));
  console.log(`  ${totals.demands} requirement(s) PRINTED across those rows ` +
    `(${(totals.demands / Math.max(1, totals.rows)).toFixed(2)} per row)`);
  console.log(`  mean prompt ${(totals.chars / Math.max(1, totals.menus) / 1000).toFixed(2)}k chars ` +
    `over ${totals.menus} menu(s); ${(totals.chars / 1000).toFixed(1)}k total`);
}

main().catch((e) => { console.error(e); process.exit(1); });
