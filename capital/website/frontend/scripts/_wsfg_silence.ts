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
import {
  beyondTitle, DEMANDS_SENTENCE_CHARS, fundsSentence,
} from "../lib/intelligence/schemeText";
import { isCited } from "../lib/intelligence/verdict";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  judgementCriteria, tableInputFromAnswers, VERDICT_POOL,
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
 *  A share on its own cannot separate the two causes, and they are not the same
 *  defect and do not belong to the same team:
 *
 *    SUPPRESSED — the row's OWN composers would have produced a line from what
 *      the corpus holds, and the rendered row has none. That is a bug on this
 *      side of the ETL, and this workstream is what such a number is for. It
 *      should be zero.
 *    NOTHING RENDERABLE — the composers produce nothing, so there was no
 *      sentence to suppress. The fix is an extraction run, not a renderer
 *      change.
 *
 *  ── Asked by CALLING the composers, never by re-deriving them ─────────────
 *  A tempting shortcut is "does the instrument hold a description, an
 *  eligibility text, or a cited gate". That measurement is WRONG and this file
 *  shipped it for one run: it called ten rows suppressed that are correctly
 *  silent. Every cited gate on those ten is either decided by the engine
 *  already (`valueSpec` — it is a screen, and the row states its verdict
 *  elsewhere) or is a `programme_fact`/`obligation`/`vague` about ministerial
 *  deadlines, flat-rate indirect-cost percentages and DNSH compliance. Printing
 *  those is the `structuringNotes` bargain this row is deliberately kept out
 *  of: "Aid is not available to an undertaking in difficulty" on twenty-eight
 *  rows of one menu separates none of them.
 *
 *  So the question is put to `judgementCriteria` and `fundsSentence`
 *  themselves. They are the one definition of what a row may say; a second copy
 *  of their rules here would agree with them until the day one of them changed,
 *  and this diagnostic would then report a defect class that does not exist. */
function whySilent(inst: DbInstrument | undefined): "suppressed" | "nothing renderable" {
  if (!inst) return "nothing renderable";
  const funds = beyondTitle(inst.name, fundsSentence(inst.description));
  const who = fundsSentence(inst.eligibilityText, DEMANDS_SENTENCE_CHARS);
  return funds || who || judgementCriteria(inst).length ? "suppressed" : "nothing renderable";
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsfg_silence");
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));

  const semantic = await semanticFundMatch(DESCRIPTION);

  const why = { suppressed: 0, "nothing renderable": 0, holdsRules: 0, holdsCited: 0 };
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
      founderCountries: founderCountryList(country, eligibility.entityCountries),
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
      const verdict = whySilent(inst);
      why[verdict]++;
      // Rows that LOOK recoverable in a column count and are not: they hold
      // rules, but every one is uncited, engine-decided, or a programme fact.
      if (verdict === "nothing renderable"
        && (inst?.gates ?? []).some((g) => (g.requirement ?? "").trim())) why.holdsRules++;
      if (verdict === "nothing renderable"
        && (inst?.gates ?? []).some((g) => isCited(g))) why.holdsCited++;
    }

    table.push(
      `  ${country.padEnd(12)} ${String(menu.length).padStart(3)} rows   ` +
      `SILENT ${String(silent.length).padStart(3)} (${pct(silent.length, menu.length).padStart(6)})   ` +
      FUND_LINES.map((l) =>
        `${l} ${pct(menu.filter((r) => r.has[l]).length, menu.length).padStart(6)}`).join("  ") +
      `   prompt ${(prompt.length / 1000).toFixed(1)}k`);
    if (process.env.VERBOSE) {
      for (const r of silent) {
        const inst = byId.get(pool[r.index]?.instrumentId ?? "");
        table.push(`        silent [${whySilent(inst)}]: [${r.index}] ${r.title}` +
          `  desc=${(inst?.description ?? "").length} elig=${(inst?.eligibilityText ?? "").length}` +
          ` cited=${(inst?.gates ?? []).filter((g) => isCited(g)).length}` +
          ` gates=${(inst?.gates ?? []).length}`);
      }
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
  console.log(`  of the ${totals.silent} silent row(s): ${why.suppressed} SUPPRESSED ` +
    `(this row's own composers produce a line and the row has none — a defect ` +
    `HERE, and it should be 0) / ${why["nothing renderable"]} NOTHING RENDERABLE ` +
    `(the composers produce nothing — an extraction gap, not a renderer one)`);
  console.log(`    of those, ${why.holdsRules} hold rules and ${why.holdsCited} hold ` +
    `CITED rules, none of them admissible on a row: every one is decided by the ` +
    `engine already, or is a programme fact rather than a condition on the applicant`);
  console.log(`  mean prompt ${(totals.chars / Math.max(1, totals.menus) / 1000).toFixed(2)}k chars ` +
    `over ${totals.menus} menu(s); ${(totals.chars / 1000).toFixed(1)}k total`);
}

main().catch((e) => { console.error(e); process.exit(1); });
