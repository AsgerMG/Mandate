// wsCI — WHERE the fifteen points go.
//
// Four routes to a HIGHER ceiling have each returned +0.0 (ranking wsBU,
// per-fund evidence wsBY, stage-2 questions wsCE, door-level rows wsCG2). The
// same measurements say the product delivers EXACT@5 25% against a ceiling of
// 40.0% that the six already-ranking intake fields permit (wsCA). Nobody has
// established where those fifteen points are lost, and every failed attempt
// above was raising a bar we are not standing on.
//
// This is the autopsy, and it is deliberately NOT a theory. It replays the same
// pairs `measure_recall.ts` replays, through the same `computeVerdict`, with
// the funnel's own `ExclusionLog` attached — the register that already records
// every removal by rule id — and asks of every MISS the one question that
// decides what to do next:
//
//   1  NEVER IN THE POOL      a screen or a gate removed it before ranking
//   2  CUT BEFORE THE TABLE   the leaf cap, a collapse, a dedupe
//   3  RANKED BELOW FIVE      it was on the table and lost on score
//   4  UNWINNABLE             its residual class is larger than five, so no
//                             ranker fed only what a founder can state could
//                             have put it in five rows
//
// ── The definitions, so a number here reconciles with wsCA's 40.0% ─────────
// Bucket 4 is wsCA's ceiling complement, computed per pair rather than in
// aggregate: the won leaf's RESIDUAL CLASS is the set of publishable siblings
// in its own regime that are indistinguishable from it given the encoded
// demands of the six fields that already rank, plus region as the corpus
// records it. That key is `_wsca_marginal.ts`'s `shipped()` verbatim — same
// fields, same order, same matchable-only rule (a decidable `filter`
// `value_spec`, never mere presence). A leaf whose class exceeds five cannot
// be separated from its class-mates by anything a founder answers, so it is
// the honest floor rather than a defect.
//
// A standalone leaf is its own regime and its class is 1, so it is always
// winnable. This is the one place the autopsy population is wider than wsCA's
// (which measured multi-leaf regimes only): the recall set grades standalone
// funds too, and excluding them here would report the floor as higher than it
// is.
//
// ── Precedence, stated because it is the whole result ──────────────────────
// Winnability and mechanism are INDEPENDENT facts and are reported as a cross
// tab, not a priority chain. A pair can be both unwinnable and country-blocked;
// collapsing that into one bucket by fiat would let the ordering of the chain
// decide the headline. So:
//
//   the four buckets      = the mechanism (1/2/3) for WINNABLE misses,
//                           plus bucket 4 for every UNWINNABLE miss
//   the cross tab         = printed underneath, so the fiat is visible
//
// ── Free ───────────────────────────────────────────────────────────────────
// One Voyage embed per pair and one Postgres read. No model calls. Same cost
// shape as `measure_recall.ts`.
//
//   SPLIT=tune N=250 npx tsx scripts/_wsci_autopsy.ts
//   SPLIT=tune N=250 EXAMPLES=3 npx tsx scripts/_wsci_autopsy.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsci_autopsy", ["DATABASE_URL", "VOYAGE_KEY"]);

import { Client } from "pg";

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../../lib/intelligence/corpus";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import { computeVerdict } from "../../lib/intelligence/pipeline";
import { doorKey } from "../../lib/intelligence/rowIdentity";
import { EXCLUSION_RULES, type ExclusionRuleId } from "../../lib/intelligence/rules";
import { rankerTallyLine, resetRankerTally } from "../../lib/intelligence/semantic";
import {
  founderIntake, founderPolicyFromEnv, IntakeTally, type FounderPolicy,
} from "../founderIntake";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "../recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "../recallSet";

/** Where a rule sits in the autopsy's four buckets.
 *
 *  Assigned by the PROPERTY the rule acts on, not by its `stage` string: three
 *  of the rules that fire at the "leaf" stage are screens (a country the
 *  founder cannot draw on, a channel that is national by construction, a row
 *  whose openness is unconfirmed) and three are caps (the per-channel leaf
 *  limit, the display-name collapse, the capital-type deprioritisation). A
 *  bucket built on `stage` would call the first three "cut before the table",
 *  which is exactly the distinction this workstream exists to make. */
const BUCKET_OF_RULE: Record<ExclusionRuleId, 1 | 2> = {
  "SEL-LARGE-SCALE": 1,
  "SEL-CHANNEL-CAP": 1,
  "SEL-CHANNEL-NOT-SELECTED": 1,
  "SEL-COUNTRY": 1,
  "SEL-NATIONAL-EMPTY": 1,
  "SEL-UNCONFIRMED-OPEN": 1,
  "VER-BLOCKED": 1,
  "SEL-CAPITAL": 2,
  // A cap, and a DIFFERENT cap from `SEL-LEAF-CAP` — until wsGK the writer
  // candidate cut was logged under that id, so both landed in this bucket
  // under one name and neither count could be read on its own.
  "CUT-WRITER-CAP": 2,
  "SEL-LEAF-CAP": 2,
  "SEL-DUPE-NAME": 2,
  // Writer-stage and cut-stage rules cannot fire on this path: computeVerdict
  // is model-free and does not cut to the published count. Mapped anyway so
  // the record is total and a future call site cannot silently fall through.
  "WRT-WATCH-ONLY": 2,
  "WRT-NO-NOTE": 2,
  "CUT-CAP": 2,
};

const h = (s: unknown) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");

/** The six fields wsCA proved already rank, in its order. Read from the same
 *  place `_wsca_marginal.ts` reads them so the two cannot drift: a class size
 *  computed on a different key is not the ceiling anyone quoted. */
const RANKS = ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"];

/** id -> how many publishable siblings share its residual class, itself
 *  included. 1 means the six fields separate it outright. */
async function residualClassSizes(offerable: Set<string>): Promise<Map<string, number>> {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      `SELECT id, parent_id, delivery_region FROM funding_instruments`);
    const g = await db.query(
      `SELECT instrument_id, COALESCE(intake_field_resolved, intake_field) AS f,
              gate_role, value_spec FROM eligibility_gates`);
    const val = new Map<string, Map<string, Set<string>>>();
    for (const r of g.rows) {
      const f = r.f ?? "none";
      const id = String(r.instrument_id);
      if (!val.has(id)) val.set(id, new Map());
      if (!val.get(id)!.has(f)) val.get(id)!.set(f, new Set());
      // MATCHABLE only: a decidable comparator on a filter-role gate. Presence
      // of some prose mentioning the field is wsAO's null model and is
      // deliberately not credited — see wsCA §6.
      if (r.value_spec != null && r.gate_role === "filter") {
        val.get(id)!.get(f)!.add(JSON.stringify(r.value_spec));
      }
    }
    const sig = (id: string, f: string) => {
      const s = val.get(id)?.get(f);
      return s && s.size ? [...s].sort().join("~") : "";
    };
    const pop = rows.filter((r) => offerable.has(String(r.id)));
    if (!pop.length) throw new Error("residualClassSizes: no publishable instrument matched the corpus");
    const key = (r: Record<string, unknown>) => {
      const id = String(r.id);
      return RANKS.map((f) => sig(id, f)).join("|") + "|" + h(r.delivery_region);
    };
    const counts = new Map<string, number>();
    for (const r of pop) {
      const k = String(r.parent_id ?? r.id) + " " + key(r);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const out = new Map<string, number>();
    for (const r of pop) {
      const k = String(r.parent_id ?? r.id) + " " + key(r);
      out.set(String(r.id), counts.get(k)!);
    }
    return out;
  } finally {
    await db.end();
  }
}

interface Verdict {
  company: string;
  country: string;
  want: string;
  wantRegime: string;
  classSize: number;
  winnable: boolean;
  hit: boolean;
  rank: number | null;     // 1-based index in the candidate list, null if absent
  /** Rank among the candidates from the won leaf's OWN regime. This is the
   *  line that separates the two failures inside bucket 3 and they need
   *  different medicine: a won leaf at overall rank 20 but regime rank 1 lost
   *  to OTHER programmes and only a better cross-regime score can save it,
   *  while one at regime rank 7 lost to its own siblings and a sibling-choice
   *  rule can. Null when it never entered the candidate list. */
  regimeRank: number | null;
  /** How many of the five published rows are siblings of the won leaf. A miss
   *  with siblings on the table is the fund's own programme being shown and
   *  the wrong door named — the shape a within-regime rule can address. */
  siblingsInTop5: number;
  poolSize: number;
  /** The whole candidate list, in rank order, as (id, regime, door) triples.
   *
   *  Dumped so a re-ranking rule can be SIMULATED off one run rather than
   *  measured by another. The published five are literally `pool[0..4]` —
   *  `computeVerdict` slices the candidate array and nothing reorders it
   *  afterwards — so any rule that only reorders or filters this list can have
   *  its exact EXACT@5 computed from this dump, for free and without a second
   *  250-verdict replay. That is what makes "try the smallest change" cheap
   *  enough to do more than once. */
  pool?: [string, string, string][];
  bucket: 1 | 2 | 3 | 4;
  rule: string;            // the rule that fired, or a pseudo-rule
  detail: string;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsci_autopsy");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const classOf = await residualClassSizes(offerable);

  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const mode = process.env.MODE;
  const answerMode = (process.env.ANSWERS ?? "off") as AnswerMode;
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  // The same two knobs `measure_recall.ts` documents, and for the same reason:
  // POP restricts the DRAW and supplies nothing, REGION supplies an answer and
  // restricts nothing, so `POP=region_known` with `REGION=off` and with
  // `REGION=strict` are the same rows in the same order under the same seed
  // and the only difference between the arms is whether the founder answered.
  // Fusing them is how a change of sample was once reported as an effect.
  const leakFreeRegion = (r: { regionSource?: string; region?: string }) =>
    r.regionSource === "other_scheme" ? (r.region || undefined) : undefined;
  const regionMode = process.env.REGION;
  if (regionMode && !["off", "strict", "any"].includes(regionMode)) {
    throw new Error(`unknown REGION=${regionMode} (expected: off, strict, any)`);
  }
  const popMode = process.env.POP;
  if (popMode && popMode !== "region_known") throw new Error(`unknown POP=${popMode}`);
  const regionOf = (r: { regionSource?: string; region?: string }): string | undefined =>
    !regionMode || regionMode === "off" ? undefined
      : regionMode === "strict" ? leakFreeRegion(r) : r.region || undefined;
  const set = pop.graded.filter((r) => (split === "all" || r.split === split)
    && (!mode || r.mode === mode)
    && (!process.env.DESCRIBED || isDescribed(r))
    && (popMode !== "region_known" || Boolean(leakFreeRegion(r))));
  if (!set.length) throw new Error(`no rows match split=${split} mode=${mode ?? "any"}`);
  const N = Math.min(Number(process.env.N ?? 250), set.length);
  const seed = Number(process.env.SEED ?? DEFAULT_SEED);
  const sample = sampleRecall(set, N, seed);

  const out: Verdict[] = [];
  // Which ranker served each pair, counted across the whole run. A run that
  // averaged the embedding ranker over some pairs and the lexical fallback over
  // others is not one measurement, and until `rankerTallyLine` existed nothing
  // on screen could say so -- see the note on the tally in semantic.ts.
  resetRankerTally();
  resetGateHydration();
  // ── The founder, from the shared resolver ────────────────────────────────
  // This file's own bucket 2 was 100% `SEL-CAPITAL` against the constant
  // `capitalSought: ["grant","loan"]` that used to be written on the line
  // below — the harness declining every tax-credit and equity instrument on
  // its own behalf, published as a product finding. `founderIntake` is now the
  // only thing that decides what this founder said, and it withholds the
  // preference rather than pinning a filter. See scripts/founderIntake.ts.
  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(),
    answers: answerMode,
    regionOverride: (r) => regionOf(r),
  };
  const tally = new IntakeTally();
  for (const t of sample) {
    resetGateHydration();
    const log = new ExclusionLog();
    const f = founderIntake(t, policy);
    tally.add(f);
    const v = await computeVerdict(f.company, f.country, f.eligibility as never, {
      ...f.opts, log,
    } as never);
    const pool: string[] = v.candidateInstrumentIds ?? [];
    const top5 = (v.instrumentTable ?? []).slice(0, 5)
      .map((r: { instrumentId?: string }) => r.instrumentId).filter(Boolean) as string[];
    const want = t.instrument;
    const rank = pool.indexOf(want);
    const hit = top5.includes(want);
    const classSize = classOf.get(want) ?? 1;
    const winnable = classSize <= 5;
    // The rule that acted on THIS instrument. Two subjects have to be tried,
    // and looking only at the first was a real defect in this file: three of
    // the rules — the channel cap, the large-scale thematic floor and the
    // national-empty case — act on a CHANNEL and record the channel code, so an
    // instrument removed with its whole channel matched nothing and came back
    // as "no rule fired". That is the difference between "we do not know why
    // this fund is missing" and "the channel cap of MIN_CHANNELS_CONSIDERED
    // took it", which are opposite instructions about what to do next.
    //
    // Instrument first: a per-leaf rule is the more specific fact, and a leaf
    // can be removed individually from a channel that was itself admitted.
    const wantChannel = byId.get(want)?.sourceFamilyBucket;
    const ev = log.all().find((e) => e.subject === want)
      ?? (wantChannel ? log.all().find((e) => e.subject === wantChannel) : undefined);
    let bucket: 1 | 2 | 3 | 4;
    let rule: string;
    let detail = ev?.detail ?? "";
    if (!winnable) {
      bucket = 4;
      rule = "class>5";
      detail = `residual class ${classSize} among publishable siblings`;
    } else if (rank >= 0) {
      bucket = 3;
      rule = "RANK";
      detail = `candidate rank ${rank + 1} of ${pool.length}`;
    } else if (ev) {
      bucket = BUCKET_OF_RULE[ev.ruleId];
      rule = ev.ruleId;
    } else {
      // No rule named it and it is not a candidate. Two ways that happens, and
      // they are different problems, so they are never merged: its channel was
      // never in play at all (nothing records a per-instrument event for a
      // channel that was not selected), or it lost the per-channel leaf cut
      // silently. Both are screens the founder cannot see, so both are bucket 1
      // and the pseudo-rule says which.
      const inst = byId.get(want);
      const chan = inst?.sourceFamilyBucket ?? "(unknown)";
      const chanOnTable = pool.some((id) => byId.get(id)?.sourceFamilyBucket === chan);
      bucket = 1;
      rule = chanOnTable ? "NO-EVENT/channel-present" : "NO-EVENT/channel-absent";
      detail = `channel ${chan}${chanOnTable ? " reached the table without this leaf" : " never reached the table"}`;
    }
    const regimeOf = (id: string) => String(byId.get(id)?.parentId ?? id);
    const wantRegime = regimeOf(want);
    const sameRegimePool = pool.filter((id) => regimeOf(id) === wantRegime);
    out.push({
      company: f.company,
      country: t.country, want, wantRegime,
      classSize, winnable, hit, rank: rank >= 0 ? rank + 1 : null,
      regimeRank: rank >= 0 ? sameRegimePool.indexOf(want) + 1 : null,
      siblingsInTop5: top5.filter((id) => regimeOf(id) === wantRegime).length,
      poolSize: pool.length,
      pool: process.env.OUT ? pool.map((id) => {
        const i = byId.get(id);
        return [id, regimeOf(id),
          i ? doorKey(i.id, (i as { parentId?: string | null }).parentId ?? null, i as never) : `leaf::${id}`,
        ] as [string, string, string];
      }) : undefined,
      bucket, rule, detail,
    });
  }

  // ── report ────────────────────────────────────────────────────────────────
  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  // WHO was replayed, field by field. A bucket is a claim about why a founder
  // did not see a fund, and it is unreadable without what that founder said.
  for (const line of tally.lines(policy)) console.log(line);
  console.log(`set=${setFile} split=${split}${mode ? ` mode=${mode}` : ""} seed=${seed}` +
    `${popMode ? ` pop=${popMode}` : ""}${regionMode ? ` region=${regionMode}` : ""}` +
    ` replayed ${out.length}`);
  const hits = out.filter((r) => r.hit).length;
  console.log(`\nEXACT@5 ${hits}/${out.length} (${(100 * hits / out.length).toFixed(1)}% +/-${halfWidth(hits, out.length).toFixed(1)})`);
  const winnable = out.filter((r) => r.winnable).length;
  console.log(`ceiling on this draw: ${winnable}/${out.length} (${(100 * winnable / out.length).toFixed(1)}%)` +
    `  <- pairs whose residual class fits five rows`);
  // ── THE ORACLE CAP, printed where it is measured ─────────────────────────
  // wsCK's 91.6% is this number and nothing else: the share of pairs whose won
  // leaf is in the candidate pool AT ALL. A perfect answer to "which exact leaf
  // is yours" cannot beat it, because a question can only reorder what is
  // there. It was quoted for weeks as the cap on the product; it is the cap for
  // whatever founder the harness replayed, and until this workstream that
  // founder was `"TestCo"` asking for grants-or-loans with 18 of 23 intake
  // fields unsupplied. It is printed here, beside the intake disclosure that
  // says who was asked, so the two can never again be read apart.
  const inPool = out.filter((r) => r.rank !== null).length;
  console.log(`ORACLE CAP  ${inPool}/${out.length} (${(100 * inPool / out.length).toFixed(1)}%)` +
    `  <- the won leaf is in the candidate pool at all; no question can beat this`);
  const misses = out.filter((r) => !r.hit);
  console.log(`\nTHE LOSS: ${misses.length} misses (${(100 * misses.length / out.length).toFixed(1)} points of the ${out.length}-pair draw)`);

  const NAME: Record<number, string> = {
    1: "NEVER IN THE POOL   (a screen or a gate removed it)",
    2: "CUT BEFORE THE TABLE(leaf cap / collapse / dedupe)",
    3: "RANKED BELOW FIVE   (on the table, lost on score)",
    4: "UNWINNABLE          (residual class > 5)",
  };
  console.log(`\nbucket                                     misses   % of loss   % of draw`);
  for (const b of [1, 2, 3, 4] as const) {
    const n = misses.filter((r) => r.bucket === b).length;
    console.log(`${b}  ${NAME[b].padEnd(38)}${String(n).padStart(6)}` +
      `${`${(100 * n / misses.length).toFixed(1)}%`.padStart(12)}${`${(100 * n / out.length).toFixed(1)}%`.padStart(12)}`);
  }
  const actionable = misses.filter((r) => r.bucket !== 4).length;
  console.log(`   ACTIONABLE (1+2+3)                     ${String(actionable).padStart(6)}` +
    `${`${(100 * actionable / misses.length).toFixed(1)}%`.padStart(12)}${`${(100 * actionable / out.length).toFixed(1)}%`.padStart(12)}`);

  console.log(`\nBY RULE (what actually fired), winnable misses only`);
  const byRule = new Map<string, number>();
  for (const r of misses) if (r.bucket !== 4) byRule.set(r.rule, (byRule.get(r.rule) ?? 0) + 1);
  for (const [k, n] of [...byRule].sort((a, b) => b[1] - a[1])) {
    const what = (EXCLUSION_RULES as Record<string, { what: string }>)[k]?.what ?? "";
    console.log(`  ${k.padEnd(28)}${String(n).padStart(5)}   ${what.slice(0, 90)}`);
  }

  // The fiat made visible: a pair can be unwinnable AND screened out, and the
  // chain above credits it to bucket 4. This says how often that happened, so
  // nobody has to take the ordering on trust.
  console.log(`\nCROSS TAB — mechanism regardless of winnability (the precedence made visible)`);
  const mech = (r: Verdict) => r.rank !== null ? "3 ranked below five"
    : r.rule.startsWith("NO-EVENT") || BUCKET_OF_RULE[r.rule as ExclusionRuleId] === 1
      ? "1 never in the pool" : "2 cut before the table";
  const cells = new Map<string, number>();
  for (const r of misses) {
    const k = `${mech(r)} ${r.winnable ? "winnable" : "unwinnable"}`;
    cells.set(k, (cells.get(k) ?? 0) + 1);
  }
  console.log(`  mechanism              winnable  unwinnable`);
  for (const m of ["1 never in the pool", "2 cut before the table", "3 ranked below five"]) {
    console.log(`  ${m.padEnd(24)}${String(cells.get(`${m} winnable`) ?? 0).padStart(6)}` +
      `${String(cells.get(`${m} unwinnable`) ?? 0).padStart(12)}`);
  }

  // ── Inside bucket 3, which is where the loss lands ────────────────────────
  // "A genuine ranking miss" is two different failures wearing one label, and
  // they take different medicine. Printed here because the distribution
  // between them is what decides whether anything short of a better ranker can
  // move this bucket at all.
  const b3 = misses.filter((r) => r.bucket === 3);
  if (b3.length) {
    console.log(`\nINSIDE BUCKET 3 — the two failures a single label was hiding`);
    const band = (n: number) => n <= 6 ? "6 (just off)" : n <= 10 ? "7-10" : n <= 20 ? "11-20"
      : n <= 50 ? "21-50" : "51+";
    const hist = new Map<string, number>();
    for (const r of b3) hist.set(band(r.rank!), (hist.get(band(r.rank!)) ?? 0) + 1);
    console.log(`  overall candidate rank of the won leaf`);
    for (const k of ["6 (just off)", "7-10", "11-20", "21-50", "51+"]) {
      const n = hist.get(k) ?? 0;
      if (n) console.log(`    rank ${k.padEnd(14)}${String(n).padStart(5)}  ${(100 * n / b3.length).toFixed(0)}% of bucket 3`);
    }
    const own = b3.filter((r) => r.regimeRank! > 1).length;
    const sib = b3.filter((r) => r.siblingsInTop5 > 0).length;
    console.log(`  lost to its OWN SIBLINGS (regime rank > 1)      ${String(own).padStart(5)}  ${(100 * own / b3.length).toFixed(0)}%` +
      `   <- a within-regime rule could reach these`);
    console.log(`  lost to OTHER PROGRAMMES (regime rank 1)        ${String(b3.length - own).padStart(5)}  ${(100 * (b3.length - own) / b3.length).toFixed(0)}%` +
      `   <- only a better cross-regime score reaches these`);
    console.log(`  a sibling of the won leaf IS on the published five ${String(sib).padStart(2)}  ${(100 * sib / b3.length).toFixed(0)}%` +
      `   <- right programme, wrong door`);
    const medianPool = [...b3.map((r) => r.poolSize)].sort((a, c) => a - c)[Math.floor(b3.length / 2)];
    console.log(`  median candidate pool the ranker had to order:  ${medianPool}`);
  }

  // Concentration, printed WITH every bucket and never separately: a bucket
  // that is one regime is a fact about one programme, not about the product.
  console.log(`\nREGIME CONCENTRATION per bucket (a bucket that is one regime is not a finding)`);
  for (const b of [1, 2, 3, 4] as const) {
    const g = new Map<string, number>();
    for (const r of misses.filter((x) => x.bucket === b)) g.set(r.wantRegime, (g.get(r.wantRegime) ?? 0) + 1);
    const s = [...g].sort((a, c) => c[1] - a[1]);
    const tot = s.reduce((a, [, n]) => a + n, 0);
    console.log(`  bucket ${b}: ${tot} miss(es) across ${s.length} regime(s), largest ` +
      `${tot ? (100 * (s[0]?.[1] ?? 0) / tot).toFixed(0) : "0"}% -- ${s.slice(0, 4).map(([k, n]) => `${k}:${n}`).join(" ") || "(none)"}`);
  }

  const nEx = Number(process.env.EXAMPLES ?? 1);
  console.log(`\nWORKED EXAMPLES`);
  for (const b of [1, 2, 3, 4] as const) {
    for (const r of misses.filter((x) => x.bucket === b).slice(0, nEx)) {
      console.log(`  [${b}] ${r.want}  founder in ${r.country}  regime ${r.wantRegime}` +
        `  class ${r.classSize}  rank ${r.rank ?? "-"}\n      ${r.rule}: ${r.detail}`);
    }
  }

  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify(out, null, 0));
    console.log(`\nper-pair verdicts -> ${process.env.OUT}`);
  }
}

main();
