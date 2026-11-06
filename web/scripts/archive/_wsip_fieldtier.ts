/**
 * wsIP — WHAT `usedInField` AS TIER 1 OF THE ROW SORT ACTUALLY COSTS.
 *
 * FREE, OFFLINE, REPRODUCIBLE. No credentials, no database, no network, no
 * model call. `DATABASE_URL` and `VOYAGE_KEY` are DESTROYED below rather than
 * merely unset -- and this is NOT `NO_PG=1`, which additionally suppresses the
 * live corpus and swaps in a lexical ranker while looking like a real number.
 * Inputs are committed files: the fund snapshot, the peer index, the recall set.
 *
 *   FIELD_TIER=on  npx tsx scripts/_wsip_fieldtier.ts      # shipped control
 *   FIELD_TIER=off npx tsx scripts/_wsip_fieldtier.ts
 *   FIELD_TIER=weight FIELD_TIER_WEIGHT=0.25 npx tsx scripts/_wsip_fieldtier.ts
 *
 * ── DECLARED STUBS (check_stage_declaration) ──────────────────────────────
 * Same two as `scripts/_wsio_prior.ts`, for the same reasons:
 *   - `buildInstrumentTable`, not `buildInstrumentTableHydrated`. The gates
 *     need Postgres and they change a row's VERDICT, never its channel or its
 *     position in this sort. This run is entirely about that sort.
 *   - `semantic: undefined`. The pgvector ranker is unavailable offline; the
 *     committed pool cache supplies `rowRelevance`'s base, identically in
 *     every arm, so no arm is advantaged by its absence.
 * `fieldChannels` is built from the founder's PEERS only and never from their
 * own award history -- the `ownHistory: "withheld"` shape. For a replayed
 * founder their own history contains the answer, and tier 1 is the most
 * valuable place in the ordering to be handed one. This is also what
 * production does for any founder not in the corpus, which is most startups.
 *
 * ── WHY BOTH OUTCOME MEASURES ─────────────────────────────────────────────
 * EXACT@6 is the business metric and its 95% half-width at n=897 is +-2.85pts,
 * so it cannot read a change smaller than ~25 founders. Mean reciprocal rank
 * moves with every founder whose won fund moves at all (wsII). A change
 * reported only on EXACT@6 is unreadable; both are printed always.
 *
 * ── AND WHY DIVERSITY ─────────────────────────────────────────────────────
 * The tier was kept on a product judgement the recall number cannot see. The
 * plausible thing it buys is a table that is not six doors of one body, so the
 * spread measures are first-class output here, not a footnote: distinct
 * funders, regimes and channels in the published six, and how many tables one
 * body dominates.
 */
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;

import { writeFileSync } from "fs";
import {
  findPeersBySubsector, isGenericSubsector, loadDbInstruments, matchCompany,
  publishableInstruments,
} from "../../lib/intelligence/corpus";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import {
  buildInstrumentTable, dbInstrumentsByBucket, DISPLAY_CAP, displayInstitutionName,
  FIELD_TIER, FIELD_TIER_WEIGHT, founderCountryList, tableInputFromAnswers,
} from "../../lib/intelligence/shortlist";
import type { InstrumentRow } from "../../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv } from "../founderIntake";
import { DEFAULT_SEED, sampleRecall } from "../recallSample";
import {
  assertAncestorConvention, loadRecallSet, partitionByOfferable,
  reattributeMissingAnswers, type AnswerMode, type RecallRow,
} from "../recallSet";

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

/** WHICH CHANNELS THE TIER IS TOLD ARE "PROVEN IN THE FOUNDER'S FIELD".
 *
 *  `FIELD_SET` is the arm axis that matters most, and it is deliberately NOT a
 *  code change to `shortlist.ts`: `fieldChannels` is already an INPUT to
 *  `buildInstrumentTable`, so swapping what feeds it isolates the SIGNAL from
 *  the TIER exactly. Same comparator, same score, same pool -- only the claim
 *  about the founder differs.
 *
 *    peers       what production computes: the channels this founder's
 *                subsector-and-country peers actually drew on. DEFAULT.
 *    constant:k  the k commonest won channels in the graded set, IDENTICAL FOR
 *                EVERY FOUNDER. wsIN's comparator, which reads nothing
 *                whatsoever about the company, and which it measured at 90.7%
 *                against the shipped door's 89.5% as a promoter of the won
 *                channel. That was a mediator; this is the six rows.
 *    empty       the tier is handed nothing and is inert by arithmetic. Must
 *                reproduce FIELD_TIER=off exactly, and is here as the harness's
 *                own control: if these two disagree the run is measuring a bug.
 *
 *  The constant is derived from the same 897 it is scored on, which flatters it
 *  -- and that is the right direction for this argument. It is the arm that
 *  must be BEATEN, so handing it every advantage makes a win over it mean
 *  something. It is 4 members of an 11-channel vocabulary; there is very little
 *  to overfit with. */
function fieldSet(): { mode: string; constant: Set<string> | null } {
  const spec = process.env.FIELD_SET ?? "peers";
  if (spec === "peers") return { mode: spec, constant: null };
  if (spec === "empty") return { mode: spec, constant: new Set() };
  const m = /^constant:(\d+)$/.exec(spec);
  if (!m) throw new Error(`unknown FIELD_SET=${spec} (expected: peers, empty, constant:<k>)`);
  const k = Number(m[1]);
  const channelOf = new Map<string, string>();
  for (const [bucket, list] of dbInstrumentsByBucket()) {
    for (const i of list) channelOf.set(i.id, bucket);
  }
  const tally = new Map<string, number>();
  for (const r of founders()) {
    const c = channelOf.get(r.instrument);
    if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, k).map(([c]) => c);
  console.log(`FIELD_SET=${spec} -> ${top.join(", ")}`);
  return { mode: spec, constant: new Set(top) };
}
const FIELD_SET = fieldSet();

function tableFor(r: RecallRow): { rows: InstrumentRow[]; flagged: number } {
  const policy = { ...founderPolicyFromEnv(), answers: (process.env.ANSWERS ?? "off") as AnswerMode };
  const f = founderIntake(r, policy);
  const self = matchCompany(f.company, f.country);
  const sub = self.matched && !isGenericSubsector(self.subsector) ? self.subsector : "";
  const dbPeers = sub
    ? findPeersBySubsector(sub, { country: f.country, limit: 4, exclude: [f.company] }) : [];
  const log = new ExclusionLog();
  const rows = buildInstrumentTable({
    fieldChannels: FIELD_SET.constant ?? new Set<string>(dbPeers.flatMap((p) => p.channels)),
    founderCountries: founderCountryList(
      f.country, (f.eligibility.entityCountries ?? []) as string[]),
    capitalSought: (f.opts.capitalSought ?? []) as string[],
    description: f.opts.description ?? "",
    semantic: undefined,
    ...tableInputFromAnswers(f.eligibility as never),
    log,
  } as never) as InstrumentRow[];
  return { rows, flagged: rows.filter((x) => x.usedInField).length };
}

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;

function main() {
  const set = founders();
  const corpus = loadDbInstruments();
  const parentOf = new Map(corpus.map((i) => [i.id, i.parentId ?? i.id]));
  /** A regime is the notified parent, or the instrument itself when it is one.
   *  Same derivation `_wsgy_rankshape.ts` uses for REGIME@k. */
  const regimeOf = (id: string | undefined) => (id ? String(parentOf.get(id) ?? id) : "");

  console.log(`FIELD_TIER=${FIELD_TIER}${FIELD_TIER === "weight" ? ` w=${FIELD_TIER_WEIGHT}` : ""}  FIELD_SET=${FIELD_SET.mode}  founders=${set.length}`);

  const out: Record<string, unknown>[] = [];
  let exact = 0, regime = 0, recip = 0, inTable = 0;
  let funders = 0, regimes = 0, channels = 0, shown = 0;
  let dominated = 0, allOneBody = 0, tablesWithFlag = 0, flagShare = 0;

  for (const r of set) {
    const { rows, flagged } = tableFor(r);
    const rank = rows.findIndex((x) => x.instrumentId === r.instrument) + 1;
    const six = rows.slice(0, DISPLAY_CAP);
    const names = six.map((x) => displayInstitutionName(x));
    const uf = new Set(names).size;
    const ur = new Set(six.map((x) => regimeOf(x.instrumentId))).size;
    const uc = new Set(six.map((x) => x.channel)).size;
    // "Dominated" is a share, not a count, so a short table is judged on its
    // own length: a 4-row table with 3 rows from one body is as dominated as a
    // 6-row table with 5, and a count threshold would call only the second one.
    const top = Math.max(0, ...[...new Set(names)].map((n) => names.filter((x) => x === n).length));
    if (six.length > 0 && top / six.length > 0.5) dominated++;
    if (six.length > 1 && uf === 1) allOneBody++;

    if (rank > 0) { inTable++; recip += 1 / rank; }
    if (rank > 0 && rank <= DISPLAY_CAP) exact++;
    if (six.some((x) => regimeOf(x.instrumentId) === regimeOf(r.instrument))) regime++;
    funders += uf; regimes += ur; channels += uc; shown += six.length;
    if (flagged > 0) tablesWithFlag++;
    flagShare += rows.length ? flagged / rows.length : 0;

    out.push({
      company: r.name, won: r.instrument, rank, rows: rows.length,
      flagged, uf, ur, uc, six: six.length,
      order: rows.map((x) => `${x.channel}:${x.instrumentId ?? ""}`),
    });
  }

  const n = set.length;
  console.log(
    `in-table ${inTable}/${n}  EXACT@${DISPLAY_CAP} ${exact}/${n} ${pct(exact, n)}  ` +
    `REGIME@${DISPLAY_CAP} ${pct(regime, n)}  meanRecip ${(recip / n).toFixed(6)}`);
  console.log(
    `published rows/table ${(shown / n).toFixed(2)}  distinct funders ${(funders / n).toFixed(3)}  ` +
    `regimes ${(regimes / n).toFixed(3)}  channels ${(channels / n).toFixed(3)}`);
  console.log(
    `one body >50% of the table ${dominated}/${n} ${pct(dominated, n)}  ` +
    `entirely one body ${allOneBody}/${n}  ` +
    `tables where the flag fires ${tablesWithFlag}/${n} ${pct(tablesWithFlag, n)}  ` +
    `mean flagged share of candidates ${(flagShare / n).toFixed(3)}`);

  const dest = process.env.OUT;
  if (dest) { writeFileSync(dest, out.map((o) => JSON.stringify(o)).join("\n") + "\n"); console.log(`tape -> ${dest}`); }
}

main();
