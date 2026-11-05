/**
 * wsIO — WHAT THE MISSING CHANNELS IN `channelPrior.generated.json` ACTUALLY DO.
 *
 * FREE, OFFLINE, REPRODUCIBLE. No credentials, no database, no network, no model
 * call. `DATABASE_URL` and `VOYAGE_KEY` are DESTROYED below rather than merely
 * unset -- and this is NOT `NO_PG=1`, which additionally suppresses the live
 * corpus in ways this run wants to be explicit about. Inputs are committed
 * files: the fund snapshot (`public/data/instrument_terms.json`), the peer index
 * (`public/data/companies_index.json`), the active recall set, and whichever
 * channel prior `ARM` selects.
 *
 *   ARM=shipped npx tsx scripts/_wsio_prior.ts
 *   ARM=/abs/path/to/prior_fixed.json npx tsx scripts/_wsio_prior.ts
 *
 * ── WHAT IT MEASURES, AND WHY THIS IS THE RIGHT TARGET ────────────────────
 * `channelPrior` is read at exactly two sites (shortlist.ts 2472, 2518), both
 * through `blendedFit`:
 *
 *   2472  the BACKFILL order -- which channels take the free slots up to
 *         MIN_CHANNELS_CONSIDERED. This is a real decision: it is pool
 *         membership, and a channel out of the pool cannot produce a row.
 *   2518  the order of `rest`, the channel traversal order. The rows that
 *         traversal produces are then re-sorted by a comparator that ends in
 *         `instrumentId.localeCompare` -- a TOTAL order -- so for any two rows
 *         carrying instrument ids the traversal order cannot survive. It
 *         survives only between rows with no instrument id at all, which tie at
 *         every level and keep their arrival order under a stable sort.
 *
 * So the question "what does a zero cell do" is really "does the POOL change",
 * and this run answers it on the funnel's own 897 founders by building
 * production's own table twice and diffing.
 *
 * The outcome measures are the won fund's position in the row order the founder
 * would be served: EXACT@6 (the business metric) and mean reciprocal rank (the
 * sensitivity instrument wsII established, because EXACT@6's half-width floors
 * near 4 points at any affordable n).
 */
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const PRIOR = path.join(process.cwd(), "lib", "intelligence", "channelPrior.generated.json");
const ARM = process.env.ARM ?? "shipped";
const BACKUP = readFileSync(PRIOR, "utf8");
if (ARM !== "shipped") {
  if (!existsSync(ARM)) throw new Error(`ARM=${ARM} is not a file`);
  copyFileSync(ARM, PRIOR);
}
process.on("exit", () => writeFileSync(PRIOR, BACKUP));

/* eslint-disable @typescript-eslint/no-require-imports */
import {
  findPeersBySubsector, isGenericSubsector, loadDbInstruments, matchCompany,
  publishableInstruments,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import {
  buildInstrumentTable, DISPLAY_CAP, founderCountryList, tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, loadRecallSet, partitionByOfferable,
  reattributeMissingAnswers, type AnswerMode, type RecallRow,
} from "./recallSet";

function founders(): RecallRow[] {
  const { rows: all } = loadRecallSet();
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const graded = partitionByOfferable(fixed.rows, (id) => offerable.has(id)).graded;
  const n = Number(process.env.N ?? 897);
  return sampleRecall(graded, Math.min(n, graded.length), DEFAULT_SEED);
}

/** Production's own table, gate-free. `buildInstrumentTableHydrated` is the
 *  request path's entry and needs Postgres for the gates; the gates change a
 *  row's VERDICT, never its channel or its position in this sort, and the
 *  channel pool is what this run is about. */
function tableFor(r: RecallRow) {
  const policy = { ...founderPolicyFromEnv(), answers: (process.env.ANSWERS ?? "off") as AnswerMode };
  const f = founderIntake(r, policy);
  const self = matchCompany(f.company, f.country);
  const sub = self.matched && !isGenericSubsector(self.subsector) ? self.subsector : "";
  const dbPeers = sub
    ? findPeersBySubsector(sub, { country: f.country, limit: 4, exclude: [f.company] }) : [];
  const log = new ExclusionLog();
  return buildInstrumentTable({
    fieldChannels: new Set<string>(dbPeers.flatMap((p) => p.channels)),
    founderCountries: founderCountryList(
      f.country, (f.eligibility.entityCountries ?? []) as string[]),
    capitalSought: (f.opts.capitalSought ?? []) as string[],
    description: f.opts.description ?? "",
    semantic: undefined,
    ...tableInputFromAnswers(f.eligibility as never),
    log,
  } as never);
}

function main() {
  const set = founders();
  const priorFile = JSON.parse(readFileSync(PRIOR, "utf8")) as { global: Record<string, number> };
  console.log(`ARM=${ARM}  founders=${set.length}  prior channels=${Object.keys(priorFile.global).length}`);
  const out: Record<string, unknown>[] = [];
  for (const r of set) {
    const rows = tableFor(r);
    const rank = rows.findIndex((x) => x.instrumentId === r.instrument) + 1;
    out.push({
      company: r.name, won: r.instrument, rank,
      rows: rows.length,
      channels: [...new Set(rows.map((x) => x.channel))],
      order: rows.map((x) => `${x.channel}:${x.instrumentId ?? ""}`),
    });
  }
  const graded = out.filter((o) => (o.rank as number) > 0);
  const exact = out.filter((o) => (o.rank as number) > 0 && (o.rank as number) <= DISPLAY_CAP).length;
  const recip = out.reduce((a, o) => a + ((o.rank as number) > 0 ? 1 / (o.rank as number) : 0), 0);
  console.log(`in-table ${graded.length}/${out.length}  EXACT@${DISPLAY_CAP} ${(exact / out.length * 100).toFixed(1)}%  meanRecip ${(recip / out.length).toFixed(4)}`);
  const dest = process.env.OUT;
  if (dest) { writeFileSync(dest, out.map((o) => JSON.stringify(o)).join("\n") + "\n"); console.log(`tape -> ${dest}`); }
}

main();
