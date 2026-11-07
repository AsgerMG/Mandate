// Semantic fund matching: which instruments actually fund what this company
// does, via pgvector over instrument_profiles.
//
// This is the primary matching signal. relevance.ts (lexical IDF over gate
// text) remains as the offline fallback for when VOYAGE_KEY or Postgres is
// unavailable — it is measurably worse but never wrong-by-construction, and
// the memo must never fail because a vector query timed out.
//
// Why profiles and not eligibility_embeddings: that index holds what a fund
// DEMANDS (legal requirements). Matching a company description against rule
// text compares two different semantic spaces and measurably fails — a rail
// company retrieved IPCEI's "only depreciation costs incurred during the
// construction period" above Europe's Rail. instrument_profiles holds what a
// fund FUNDS, including the real project titles it has awarded, and beats both
// lexical and rule-embedding retrieval on every domain tested.
// Built by ETL/terms/build_instrument_profiles.py.

import { MIN_MATCHABLE_DESCRIPTION_CHARS } from "./types";
import { openPg } from "@/lib/db";
import { embedQuery as embedFor, vectorColumn, vectorLiteral } from "@/lib/embedding";

/** Keep the whole path bounded: this runs inside the memo pipeline, which is
 *  already slow, but must not hang it. */
const TIMEOUT_MS = 6000;

/** Per-invocation memo: the same description is matched once per warm lambda,
 *  not once per pipeline stage that asks. */
const cache = new Map<string, Map<string, number>>();

/** How sharply this description peaks on the corpus, on the RAW similarities.
 *
 *  Kept beside the scores rather than derived from them, because it CANNOT be
 *  derived from them: the returned map is percentile-normalised, and a
 *  percentile distribution is uniform on [0,1] by construction. Every
 *  dispersion statistic computed on it is the same number for every query --
 *  measured at 0.998 for a canned self-description and 0.998 for a real project
 *  title, which is why `themeInformative` in shortlist.ts was structurally
 *  always true and the entire "how much do we trust this founder's words"
 *  branch never ran.
 *
 *  Raw cosines do carry it. Measured over the 11 canned sector templates and 19
 *  real project descriptions in the recall set, against the live index:
 *
 *      statistic          canned    real    best single split
 *      max/mean - 1        0.281   0.454    87%
 *      (max-mean)/sd       3.35    4.07     77%
 *      max                 0.572   0.496    63%   (inverted, useless)
 *
 *  `max/mean - 1` is the statistic `THEME_SPREAD_FLOOR` was written against and
 *  it is the one that works; only the input was wrong. Note `max` alone runs
 *  BACKWARDS -- a generic sentence matches everything moderately well and scores
 *  a HIGHER top similarity than a specific one -- so any "is the best match good
 *  enough" test is worse than useless here. It has to be about the shape of the
 *  distribution, not its height. */
const separation = new Map<string, number>();

/** Dispersion of the raw similarities for `description`, or `undefined` when
 *  the index was never consulted for it (no key, no Postgres, no cache entry).
 *  Callers must treat `undefined` as "no opinion", never as zero. */
export function semanticSeparation(description: string | undefined): number | undefined {
  const desc = description?.trim();
  return desc ? separation.get(desc) : undefined;
}

/** SKEWNESS of the raw similarities. Exported for the cache emitter so the
 *  committed artifact and production can never compute it differently.
 *
 *  THE PROPERTY: a description that names something specific makes a FEW funds
 *  match much better than the bulk, which is a right tail. A canned sector
 *  sentence matches everything moderately, which is symmetric. So the question
 *  "does this text separate the funds" is a question about the SHAPE of the
 *  similarity distribution, and skewness is the statistic for a tail.
 *
 *  This replaced `max / mean - 1`, which was the right instinct read off the
 *  wrong input (percentile ranks, uniform by construction) and then, once fixed
 *  to read raw cosines, still barely discriminated. Measured over 296 holdout
 *  rows -- 61 with a real description, 235 on a canned sector template --
 *  against the live index:
 *
 *      statistic        AUC    real routed "specific"   canned routed "specific"
 *      max/mean - 1    0.610          43%                       28%
 *      SKEWNESS        0.773          52%                        4%
 *
 *  `max / mean - 1` is dominated by the corpus bulk that sets the mean, and the
 *  bulk is the same for every query. The remaining error under skewness is
 *  one-directional and it is the cheap one: half of real descriptions are
 *  treated as generic, which costs a project founder a few positions, while a
 *  canned template is almost never mistaken for a specific one, which is the
 *  error that damages the 84% of founders who have no project text.
 *
 *  Note that `max` alone runs BACKWARDS -- a generic sentence matches everything
 *  moderately well and scores a HIGHER top similarity than a specific one -- so
 *  no "is the best match good enough" test can work here. It has to be shape. */
export function separationOf(similarities: number[]): number | undefined {
  const vals = similarities.filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < 2) return undefined;
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  if (mean <= 0) return undefined;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  if (sd <= 0) return undefined;
  return vals.reduce((a, b) => a + ((b - mean) / sd) ** 3, 0) / n;
}

/**
 * WHICH RANKER ordered a table — and the ONE place that decides it.
 *
 * The choice is made by `semantic?.size`, and it was made in four separate
 * expressions inside shortlist.ts. That is not a style problem. On 2026-08-09
 * `check_answer_reach` was found to have graded the LEXICAL ranker — it
 * declared DATABASE_URL as its only credential, so a run without VOYAGE_KEY
 * got an empty score map from `semanticFundMatch`, every one of those four
 * expressions fell through to `themeRelevance`, and the check reported its
 * verdict about a ranker the product does not serve **in words identical to
 * the ones it uses about the real one**. Both runs printed
 *
 *     6 proved to rank, 17 declared memo-only
 *     PASS — every question we ask changes something a founder sees.
 *
 * and they disagreed about two fields underneath.
 *
 * The missing key was the trigger; the defect was that no harness could SAY
 * which system it had measured, because the branch that decides it was an
 * inline ternary with no name. So the predicate has a name and one home, the
 * ranker branches on it, and a harness asks the same function the ranker asked
 * rather than re-deriving the answer from the environment — which is what
 * "confirm it from the output, not from the environment" needs to be true.
 */
export type Ranker = "embedding" | "lexical";

/** The ranker that will order a table built with this semantic score map. */
export function rankerUsed(
  semantic?: ReadonlyMap<string, number> | null,
): Ranker {
  return semantic && semantic.size ? "embedding" : "lexical";
}

/** ── How many requests each ranker actually served ────────────────────────
 *
 *  `rankerUsed` answers the question for ONE request. Nothing counted it over a
 *  RUN, and that gap has a measured cost: `check_recall_floor.ts` was run twice
 *  on the same commit, same seed and same corpus on 2026-08-09 and returned
 *  `regime5 87%` (FAILED, floor 88) and then `regime5 96%` (ok) on the same
 *  136-row slice. The first run shared the machine with a 250-pair harness; the
 *  second ran alone. `semanticFundMatch` has a 3s connect and a 3s statement
 *  timeout and returns an EMPTY MAP on any failure, at which point every
 *  `rankerUsed` call site silently drops to the lexical index — the one
 *  `RANKER_DESCRIPTION` calls "measurably worse and NOT the system a founder is
 *  served by".
 *
 *  So a run can rank some pairs on embeddings and some on lexical, average the
 *  two, and print a single number with nothing on screen to say so. That is a
 *  build gate going red for a reason that is not a regression, which this repo
 *  has already paid for once ("a gate that cannot find its credentials must not
 *  be the same colour as a gate that passed").
 *
 *  This is the counting half. It records, it never decides: no caller's
 *  behaviour changes, and a harness that does not read the tally is exactly as
 *  it was. `requireLiveCorpus` and `requireCredentials` catch the two states
 *  where the WHOLE run took the fallback; this is the one they cannot see,
 *  where PART of it did.
 *
 *  Counted in `semanticFundMatch`, which is called exactly once per request, so
 *  the tally is a count of REQUESTS and not of the four `rankerUsed` call sites
 *  each request makes. A cache hit is counted too: it is still a request served
 *  by the embedding ranker. */
const tally: Record<Ranker, number> = { embedding: 0, lexical: 0 };

/** Zero the tally. Call at the start of a run that is going to report it. */
export function resetRankerTally(): void {
  tally.embedding = 0;
  tally.lexical = 0;
}

/** Requests served by each ranker since the last reset. */
export function rankerTally(): Readonly<Record<Ranker, number>> {
  return { ...tally };
}

/** One line naming what actually ranked, for a harness banner. Says nothing
 *  reassuring when the run is clean and says it loudly when it is not. */
export function rankerTallyLine(): string {
  const { embedding, lexical } = tally;
  const n = embedding + lexical;
  if (!n) return "ranker: nothing ranked";
  if (!lexical) return `ranker: all ${n} request(s) on EMBEDDING`;
  return `ranker: ${embedding}/${n} on EMBEDDING, ${lexical} FELL BACK TO LEXICAL` +
    ` -- this run averages two different systems and the number is not comparable` +
    ` with a clean one. ${RANKER_DESCRIPTION.lexical}`;
}

/** ── AND THE HALF THAT REFUSES ─────────────────────────────────────────────
 *
 *  `rankerTallyLine()` counts. It does not stop anything, and on 2026-08-12 that
 *  was the whole defect: `project-mgmt/findings/one_funnel/latest.md` was
 *  published carrying its own line reading `805 FELL BACK TO LEXICAL`, and the
 *  25.8% under it was planned from for a day. The warning was printed, committed
 *  and read past. A figure produced by the wrong ranker must not be ABLE to look
 *  like a good one, so a harness that publishes calls this instead of trusting a
 *  reader to notice the banner.
 *
 *  THE PROPERTY, with its test for a run nobody has made yet: a run may publish
 *  only if every request that ASKED the ranker was served by the embedding one.
 *  Stated over the tally rather than over an environment check, because the two
 *  come apart — `requireCredentials` proves the keys are present and
 *  `requireLiveCorpus` proves the corpus came from Postgres, and a run holding
 *  both can still take the lexical fallback on a slow machine, which is exactly
 *  what a 3s statement timeout does under load.
 *
 *  Zero-request runs pass. A harness that ranked nothing is not a harness that
 *  ranked badly, and `check_published_figures` already keys the attestation on
 *  whether a replay happened at all for the same reason. */
export function requireCleanRanker(context: string): void {
  const { lexical } = tally;
  if (!lexical) return;
  throw new Error(
    `${context}: ${rankerTallyLine()}\n`
    + `  This run may not publish. ${RANKER_DESCRIPTION.embedding}\n`
    + `  A number averaged over two ranking systems is not a number about the\n`
    + `  shipping system, and it is indistinguishable from a good one on the page.\n`
    + `  Commonest causes, in the order they actually happen: NO_PG=1 (the\n`
    + `  committed score cache misses on any description it was not cut for),\n`
    + `  a missing VOYAGE_KEY, and a loaded machine tripping the 3s statement\n`
    + `  timeout. Re-run on a quiet machine with live credentials.`);
}

/** What each ranker IS, for any harness that has to name what it measured.
 *  One sentence, and the two are not interchangeable in it. */
export const RANKER_DESCRIPTION: Record<Ranker, string> = {
  embedding:
    "EMBEDDING — pgvector over instrument_profiles, query embedded by Voyage "
    + "(VOYAGE_KEY). This is the ranker the memo ships on.",
  lexical:
    "LEXICAL — relevance.ts, IDF over gate text. The offline fallback. "
    + "Measurably worse and NOT the system a founder is served by.",
};

interface CachedMatch { scores: Record<string, number>; separation?: number }

/** Committed scores for the fixed descriptions our checks use. Read lazily so a
 *  production request never pays for a file that only tests need.
 *
 *  Carries `separation` alongside `scores` because the offline checks have to
 *  exercise the SAME branch production takes. The statistic is unrecoverable
 *  from the percentile scores, so a cache holding scores alone would send every
 *  archetype and every red-team case down whichever branch the fallback picked
 *  -- which is the award-median defect again: a check validating a path that
 *  does not ship. The older shape (description -> scores) is still read, and
 *  simply yields no separation. */
let scoreCache: Record<string, CachedMatch> | undefined;
function loadSemanticCache(): Record<string, CachedMatch> {
  if (scoreCache === undefined) {
    try {
      // Deliberate require(): this module is imported from a "use client"
      // boundary, and a top-level `import "fs"` would pull node built-ins into
      // the client bundle. Both lines need the exemption -- the disable comment
      // covered only the first, so the second has been failing CI's lint step.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readFileSync } = require("fs") as typeof import("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("path") as typeof import("path");
      const raw = JSON.parse(readFileSync(
        path.join(process.cwd(), "lib", "intelligence", "semanticCache.generated.json"),
        "utf8")) as Record<string, CachedMatch | Record<string, number>>;
      scoreCache = Object.fromEntries(Object.entries(raw).map(([d, v]) => [
        d,
        "scores" in v && typeof v.scores === "object"
          ? (v as CachedMatch)
          : { scores: v as Record<string, number> },
      ]));
    } catch (e) {
      // Loud, for the reason generatedArtifact.ts exists: an empty cache is not
      // a smaller cache, it is every offline check ranking on scores of 0 —
      // which the ranker cannot tell apart from "thematically wrong". This
      // module cannot USE that loader (a top-level `import "fs"` would reach a
      // "use client" boundary; hence the require() above and the declared
      // waiver in data/guard_registry.json), but the silence is not part of the
      // waiver.
      console.error(
        `semantic: could not read lib/intelligence/semanticCache.generated.json `
        + `(cwd ${process.cwd()}): ${e instanceof Error ? e.message : String(e)}. `
        + `Every NO_PG score in this process is 0 because the file was not read, `
        + `NOT because the corpus is thematically unrelated. `
        + `Re-cut it: npx tsx scripts/emit_semantic_cache.ts`);
      scoreCache = {};
    }
  }
  return scoreCache ?? {};
}

async function embedQuery(text: string): Promise<number[] | null> {
  // The model is whatever instrument_profiles is stored in (lib/embedding.ts).
  return embedFor(text, "capital.instrument_profiles", { timeoutMs: TIMEOUT_MS, log: true });
}

/**
 * Cosine similarity of the founder's description against every instrument
 * profile, as instrumentId -> 0-1 normalised against the best match in the set.
 *
 * Returns an empty map on ANY failure (no key, no DATABASE_URL, timeout, empty
 * index) so callers fall back to lexical matching rather than losing the memo.
 */
export async function semanticFundMatch(
  description: string | undefined,
): Promise<Map<string, number>> {
  const desc = description?.trim();
  // NOT counted in the tally, on purpose. A request with nothing long enough to
  // embed never asked the embedding ranker for anything, so it is not a
  // fallback — and counting it as one would make `rankerTallyLine` shout on
  // every profile-mode replay, which is how a warning stops being read. The
  // tally counts requests that ASKED, and how many of those got an answer.
  if (!desc || desc.length < MIN_MATCHABLE_DESCRIPTION_CHARS) return new Map();
  const cached = cache.get(desc);
  if (cached) { tally.embedding += 1; return cached; }

  const url = process.env.DATABASE_URL;
  if (!url) {
    // No Postgres: fall back to the committed score cache before giving up.
    //
    // This exists so the OFFLINE CHECKS EXERCISE PRODUCTION'S RANKING. Semantic
    // matching needs pgvector, every check in this repo runs NO_PG, and without
    // this the 115 tests, 12 archetypes and red team would all validate the
    // lexical fallback while production ranked on embeddings -- the exact shape
    // of the award-median defect, where production ranked on a statistic no test
    // ever used.
    //
    // Keyed by the description itself, generated by scripts/emit_semantic_cache.ts
    // from the archetype and red-team profiles. A description not in the cache
    // still returns empty and falls through to the lexical index, which is the
    // honest degradation for a real founder on a cold fallback.
    const hit = loadSemanticCache()[desc];
    if (!hit) { tally.lexical += 1; return new Map(); }
    if (hit.separation !== undefined) separation.set(desc, hit.separation);
    tally.embedding += 1;
    return new Map(Object.entries(hit.scores));
  }

  const out = new Map<string, number>();
  try {
    const vec = await embedQuery(desc);
    if (!vec) { tally.lexical += 1; return out; }
    const client = await openPg(url, { connectMs: 3000, statementMs: 3000 });
    try {
      // pgvector wants the literal '[a,b,c]' form, not a JS array.
      const literal = vectorLiteral(vec);
      // Score EVERY profile, not a top-K slice. instrument_profiles holds one
      // row per instrument (322 of them), so a LIMIT here was truncating a
      // table small enough to rank whole — and an instrument left out scores
      // zero, which is indistinguishable from "thematically wrong". That is
      // how selectLeafInstruments ended up ordering the Horizon partnership
      // and IPCEI buckets by raw event count: no leaf in them made the global
      // top 40, so Clean Aviation went to an AI lab and a freight platform,
      // and the Innovative Health Initiative to a govtech company. Ranking all
      // 322 is a single scan of a tiny table and costs nothing measurable.
      // ── THE TIEBREAK IS NOT COSMETIC ─────────────────────────────────────
      // This ordered by distance alone until 2026-08-12. SQL does not promise
      // an order for rows a query cannot distinguish, so two funds at the same
      // distance came back in whichever order the scan produced — and not
      // necessarily the same one twice. That would be harmless if the distance
      // were used as a number, and it is not: the block below deliberately
      // normalises by RANK, so a tie broken differently is a different rank, a
      // different fit score, and eventually a different fund in the founder's
      // five. Two runs of unmodified code differed, which is why no figure
      // from a single live run could be quoted.
      //
      // `instrument_id` is arbitrary as a rule and that is fine; the property
      // is STABILITY, not meaning. What matters is that it is total — ids are
      // unique in this table, so no pair of rows can remain unordered, and a
      // fund added next week is covered without anyone revisiting this.
      // The column and cast come from the same generated block as the query
      // model (lib/embedding.ts), so the two flip together. `IS NOT NULL`
      // drops a row with no vector in the stored space rather than ranking
      // it: during a re-embed the other column may be the only one filled.
      const { column, cast } = vectorColumn("capital.instrument_profiles");
      const res = await client.query(
        `SELECT instrument_id, 1 - (${column} <=> $1${cast}) AS similarity
           FROM instrument_profiles
          WHERE ${column} IS NOT NULL
          ORDER BY ${column} <=> $1${cast}, instrument_id`,
        [literal],
      );
      const rows = res.rows as { instrument_id: string; similarity: string | number }[];
      const scores = rows.map((r) => ({ id: r.instrument_id, s: Number(r.similarity) }));
      // ── Normalise by RANK, not by the best score ─────────────────────────
      // Cosine similarities here occupy a very narrow band: measured across
      // the whole corpus for one query, 0.275 to 0.466, mean 0.365, sd 0.034.
      // Dividing by the best match maps that band onto 0.59-1.00, so the
      // WORST-matching instrument in Europe still scored 0.59 and a fund
      // ranked 273rd of 327 scored 0.71 — nearly indistinguishable from the
      // 150th at 0.79. Against a 0.20 weight in the fit score, the difference
      // between the best thematic match and an irrelevant one came to about
      // 0.06 of the final number, which is why structural components decided
      // the ranking and thematically wrong funds kept reaching the table.
      //
      // Percentile rank uses the full 0-1 range by construction and does not
      // care how narrow the band is. It is also distribution-free, so it
      // cannot be broken by a query whose similarities happen to cluster
      // differently — which best-normalisation silently was.
      //
      // What it DOES destroy is how peaked this particular query was, and that
      // is a signal the ranker needs: it is the difference between a founder
      // who described a project and one we have only a sector template for.
      // Captured here, before the shape is thrown away. See `separation`.
      const sep = separationOf(scores.map((s) => s.s));
      if (sep !== undefined) separation.set(desc, sep);
      //
      // The rows arrive ordered by distance, so the index IS the rank.
      const n = scores.length;
      if (n === 1) {
        out.set(scores[0].id, 1);
      } else {
        for (let i = 0; i < n; i += 1) {
          out.set(scores[i].id, (n - 1 - i) / (n - 1));
        }
      }
    } finally {
      await client.end();
    }
  } catch (err) {
    console.error("semantic fund match failed, falling back to lexical:", err);
    tally.lexical += 1;
    return new Map();
  }
  // An empty result is a fallback even without a thrown error: every
  // `rankerUsed` call site tests `semantic.size`, so zero rows and a timeout
  // are the same thing downstream and have to be the same thing here.
  if (out.size) tally.embedding += 1; else tally.lexical += 1;
  cache.set(desc, out);
  return out;
}
