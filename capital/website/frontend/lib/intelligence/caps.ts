// The funnel constants, in one leaf module, so a check can read them without
// reaching a database.
//
// ── Why this module exists, and why it imports nothing ─────────────────────
// These constants narrow the memo path between the corpus and the published
// table, and they only work as a funnel if each is strictly wider than the
// next:
//
//     VERDICT_POOL -> WRITER_CANDIDATE_CAP -> BRIEF_LIMITS.institutionsMax
//
// The sentence NAMES them and does not count them (wsEW). It used to open
// "Four caps", listing three, while `check_contracts.ts` opened "Five caps"
// over the same funnel, listing four — two different wrong numbers for one
// chain, and each of them wrong the moment a constant joins or leaves it. A
// list a reader can count against the code cannot drift; a tally beside it can
// only ever be a second copy of the same fact.
//
// Nothing asserted that ordering until `check_contracts.ts` did, and that
// check is HERMETIC by design: no DATABASE_URL, no VOYAGE_KEY, so it runs on
// CI and on a fresh worktree. Importing the constants from `shortlist.ts` and
// `memoCandidates.ts` to compare them dragged the whole corpus layer in behind
// them and `check_env_loader` failed the build for exactly that, correctly —
// a check that silently acquires a credential dependency is a check that
// silently stops running.
//
// The alternative was to retype the numbers in the check, which is the defect
// the check exists to catch. So the constants moved to a module with NO
// imports at all, and their old homes re-export them: every existing caller is
// unchanged, and there is still exactly one definition of each.
//
// `institutionsMax` deliberately stays in `briefChecks.ts` next to the rule
// that enforces it; that module is already hermetic.
//
// ── THERE ARE TWO FUNNELS, AND THAT IS THE OPEN DEFECT (wsDO) ──────────────
// The chain above is the MEMO's. The founder's instant screen runs a second,
// shorter one out of `computeVerdict`: the same `buildInstrumentTableHydrated`
// pool, cut straight to `DISPLAY_CAP = 6`, with no blocked-row drop, no
// display-name collapse and no re-sort. So the two surfaces of one request
// disagree about which funds are in the table, not merely about their order,
// and every recall figure this repo publishes is measured on the short funnel
// while the founder acts on the long one.
//
// The design that merges them into one path with one ranker -- and the prefix
// property that makes the merge checkable ("screen one's six rows are the
// first six of the memo's order") -- is written down in
// project-mgmt/findings/dead_ranker_wsDO.md §4, together with the order of
// operations. Read it before changing any constant in this file: after the
// merge, VERDICT_POOL stops being a second cut and becomes how deep the
// selector is allowed to read.

/**
 * ── EVERY DEPTH IN THIS FUNNEL IS A LEVER, AND EVERY ONE OF THEM THROWS ────
 *
 * These numbers were constants, and three of them were `Number(process.env.X ??
 * n)` — which is the same defect wearing a lever's clothes. `Number("fourty")`
 * is `NaN`, `Math.min(NaN, rows.length)` is `NaN`, and `rows.slice(0, NaN)` is
 * the EMPTY ARRAY: a typo in a depth silently hands the model no menu at all
 * and the run reports the fallback's number under the treatment's name. That is
 * the exact failure `AGENT_SELECT_SEAM` and `AGENT_SELECT_EFFORT` already throw
 * to prevent, and it applies with more force here, because a depth arm is
 * precisely the thing somebody will sweep from a shell loop.
 *
 * So: read ONCE at module scope, validated, and loud. A depth is a positive
 * integer, or the literal `all` where reading everything is a meaningful arm.
 *
 * `all` is `Infinity` on purpose rather than a large number. `Math.min(depth,
 * rows.length)` is then exactly "the whole list" for every founder, where a
 * stand-in like 9999 is "the whole list" only until somebody's pool is bigger —
 * and the prompt's own base-rate sentence reads the length of the menu it
 * actually built, so an honest Infinity stays honest and a stand-in does not.
 */
export function depthLever(
  name: string,
  fallback: number,
  opts: { all?: boolean; min?: number } = {},
): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return parseDepth(raw, name, { ...opts, fallback });
}

/**
 * ── WHAT A DEPTH IS, ONCE ──────────────────────────────────────────────────
 *
 * `depthLever` reads ONE depth out of ONE environment variable. A harness that
 * SWEEPS depths reads a list of them out of one variable, and every argument
 * above applies to each element with more force: a sweep is exactly the place a
 * typo arrives, and `rows.slice(0, NaN)` is the empty array at every K in the
 * list, so a swept funnel would print a column of zeroes under a treatment's
 * name rather than erroring.
 *
 * The rule is therefore stated once here and `depthLever` delegates to it,
 * rather than a sweep re-implementing "integer, or the word all" beside it.
 * `where` names whatever the value came from — a variable, or one element of a
 * list — so the message points at the thing the reader has to fix.
 */
export function parseDepth(
  raw: string,
  where: string,
  opts: { all?: boolean; min?: number; fallback?: number } = {},
): number {
  if (opts.all && raw === "all") return Infinity;
  const n = Number(raw);
  const min = opts.min ?? 1;
  if (!Number.isInteger(n) || n < min) {
    throw new Error(
      `${where} must be an integer >= ${min}${opts.all ? ` or "all"` : ""}, got "${raw}". ` +
      `It is read once, up front, precisely so a typo cannot read as ` +
      `${opts.fallback ?? "a default"} — or, worse, as NaN, which slices every list to ` +
      `nothing without erroring.`);
  }
  return n;
}

/**
 * ── THE ARM ITSELF, MOVED HERE FOR THE SAME REASON THE DEPTHS WERE (wsEN) ──
 *
 * `AGENT_SELECT` is a PURE ENVIRONMENT READ. It lived in `agentSelect.ts`, and
 * every module that needed to know whether the ranker is on therefore imported
 * the Anthropic client, the corpus layer and the retrieval path behind one
 * string — the identical defect that moved `SELECT_DEPTH` and `VERDICT_POOL`
 * into this file, and that `check_env_loader` failed the build for.
 *
 * The reader that forced it is `rankerAsks.ts`, which must refuse to run while
 * the stage its questions are FOR is off. Asking that question through
 * `agentSelect.ts` would make the question stage depend on the ranking stage's
 * whole implementation in order to read one word out of the environment.
 *
 * `agentSelect.ts` re-exports it, so every existing caller is unchanged and
 * there is still exactly one definition.
 *
 * ── `adviser` IS THE DEFAULT. THE MODEL RANKS THE SUBSET (wsGB) ───────────
 * It was `off`, and this file said so at four places. The architecture has
 * always been "our code selects the candidate subset, an LLM ranks that
 * subset"; what shipped was the first half of it, with the second half built,
 * measured and switched off. The owner closed that on 2026-08-12: the ranker
 * ships, and the head-to-head becomes a baseline rather than a gate.
 *
 * WHY `adviser` AND NOT ONE OF THE OTHER FOUR. Each is excluded by something
 * already on record, not by taste:
 *
 *   `rows`     the same seat with no thinking, no prior and no retrieval. It is
 *              the arm that was measured and lost: EXACT@6 17% against the
 *              shipped 27%, with CHANNEL@5 falling 92% -> 75% — the model
 *              leaving the right neighbourhood, not picking the wrong sibling.
 *   `assist`   freezes the first `SELECT_KEEP` seats of the DETERMINISTIC
 *              order. Shipping it would ship the thing this workstream removed,
 *              in three of seven seats.
 *   `dry`      builds the prompt and never calls. It prices the arm; it cannot
 *              be the arm.
 *   `reverse`  publishes the worst candidate first, on purpose, and refuses to
 *              boot in a production build two guards below.
 *
 * `adviser` is also the TREATMENT arm named in `project-mgmt/wsGA_prereg.md`,
 * so what ships is the configuration the pre-registered run measures, not a
 * neighbour of it.
 *
 * ── `off` IS NOW THE CONTROL, AND IT IS STILL REACHABLE ───────────────────
 * Nothing about the flip makes the off path dead: it is the control arm of the
 * head-to-head, `scripts/_wsga_headtohead.ts` runs it by name, and every
 * failure inside `agentSelectRows` still degrades to the same order it
 * produces. What changed is which one you get by saying nothing.
 *
 * A CONSEQUENCE THAT IS NOT AN ACCIDENT: a brief now makes one more model call
 * than it did, so the arm must be spelled `off` by any harness that means to be
 * free. A harness carrying its own `?? "off"` would have gone on reporting the
 * control's name over the treatment's spend — `scripts/_wsga_headtohead.ts`
 * held exactly that copy and now reads this constant instead.
 */
export type AgentSelectArm = "off" | "rows" | "assist" | "adviser" | "dry" | "reverse";
const ARMS: AgentSelectArm[] = ["off", "rows", "assist", "adviser", "dry", "reverse"];

/**
 * Read ONCE, at module scope, and throw on anything unrecognised.
 *
 * A flag consulted per call is a flag that can change mid-run, and a flag that
 * silently treats a typo as "off" is how an arm reports the control's number
 * under the treatment's name. Both failure modes have cost this repo a
 * retracted figure, so neither is available here.
 */
export const AGENT_SELECT_ARM: AgentSelectArm = (() => {
  const raw = process.env.AGENT_SELECT ?? "adviser";
  if (!ARMS.includes(raw as AgentSelectArm)) {
    throw new Error(
      `AGENT_SELECT must be one of ${ARMS.join("|")}, got "${raw}". ` +
      `It is read once at module scope precisely so a typo cannot read as ` +
      `"adviser" — which is now the default and now SPENDS.`);
  }
  if (raw === "reverse") {
    // Two guards, because "default off" is not enough for an arm whose whole
    // purpose is to publish the WRONG funds.
    //
    // 1. It cannot start in a production build at all. A Next.js build and a
    //    `next start` both run with NODE_ENV=production, so a machine serving
    //    founders refuses to boot with this set rather than serving nonsense.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AGENT_SELECT=reverse is a DIAGNOSTIC that deliberately publishes the " +
        "worst-ranked funds first. It is not a product arm and it must never " +
        "run in a production build.");
    }
    // 2. It says so, once, on stderr, in every process that loads it. A run
    //    whose output looks like a ranking is a run whose log said this.
    console.warn(
      "[agentSelect] ARM=reverse — THE POOL IS BEING REVERSED. This is not a " +
      "ranking and not a product arm: it exists only to prove that the order " +
      "of the pool reaches the published memo. Any table produced under it is " +
      "deliberately wrong.");
  }
  return raw as AgentSelectArm;
})();

/** The pool `runIntelligence()` cuts to before anything is screened or written.
 *
 *  NOT `synthesize()`, which is what this said and where the cut has not lived
 *  for some time: the expression is `accessiblePool(...).slice(0, VERDICT_POOL)`
 *  in `runIntelligence`, above the ranker call, and `synthesize` is handed the
 *  result. Pointing at the wrong function matters here because this is the
 *  number the seam experiments move, and the two are on opposite sides of the
 *  model call that `AGENT_SELECT_SEAM` relocates.
 *
 *  Deliberately wider than `DISPLAY_CAP`: funds a founder cannot access are
 *  dropped AFTER assessment, so a pool of six meant a founder blocked on three
 *  of them got a three-row brief while perfectly good candidates at rank seven
 *  were never looked at. Dropping must be able to backfill, not shrink the
 *  table.
 *
 *  ── 18 -> 40, ON THE SWEPT FUNNEL (wsGM) ─────────────────────────────────
 *  `POOL_SWEEP=18,25,40,60,all npm run stages`, n=897 held-out described
 *  founders, one per company, postgres, all 814 requests on the embedding
 *  ranker, draw 13cb71cf3a1d1847. Every depth is a projection of ONE pool object
 *  per founder, so the columns are paired to the founder:
 *
 *    the answer is inside the cut   18: 49.8%  25: 55.7%  40: 66.7%
 *                                   60: 71.3%  all: 79.5%   (+/-3.1 at 40)
 *    every stage below the cut      IDENTICAL at every depth, all 897
 *
 *  The second line is the one that decided it. With no model in the loop a wider
 *  cut is a superset with an identical prefix and `orderMemoCandidates` does not
 *  sort, so exactly one thing could have moved the rows below: a better-
 *  evidenced sibling admitted deep, winning its label class under
 *  `preferBetterEvidencedRow` — a total order INDEPENDENT OF POSITION — and
 *  demoting the row that held that label near the top. Counted on the whole
 *  `toWriter` id list rather than on the won fund, at every depth up to the
 *  whole pool: it fires on 0 of 897. The deterministic cost of widening is not
 *  small, it is zero.
 *
 *  40 AND NOT WIDER, and the rule was fixed before the numbers arrived: the
 *  widest K that is <= `SELECT_DEPTH` (a row past the depth is never shown and
 *  can only rank behind every pick — see the guard at the bottom of this file),
 *  is a MEASURED point of `POOL_RECALL_KS` (`poolRecallAt` interpolates, and the
 *  base rate the prompt quotes must be a point on the curve rather than a point
 *  on a chord of it — `check_pool_recall_curve` now reds on that), and loses no
 *  founder on the deterministic path. 60 fails the first two; `all` fails the
 *  first. Both become available the moment `SELECT_DEPTH` and the curve move
 *  with them, and 79.5% says what they would be worth.
 *
 *  ── WHAT THIS BUYS IS A CEILING, NOT A RESULT, AND THAT IS THE HONEST WORD ─
 *  `pool_cut` is the most any ranker can deliver at a depth; it is not what a
 *  founder receives. Realising it is the model's job, and the model's pick rate
 *  on a longer menu is the ONE quantity no free run can measure. The arithmetic
 *  is on the record so it can be checked rather than believed: population
 *  EXACT@5 is `P(won inside K) x c_K`, so widening to 40 loses only if `c_K`
 *  falls 51.0% -> 38.1%, a 25.3% relative collapse on the rows the model was
 *  already being shown. `project-mgmt/findings/widen_wsGM.md` is where that is
 *  stated as a falsification test, and the paid run that settles it is item 2 of
 *  `project-mgmt/AWAITING_APPROVAL.md`.
 *
 *  Two things push the other way and neither is a guess. wsDQ's diagnosis of the
 *  old prompt was "the model was told to reach down a list that usually does not
 *  contain the answer, and it obeyed"; `baseRateSentence` reads the length of
 *  the menu it actually built, so at 40 the model is told the answer is present
 *  75% of the time rather than 55%, and that 40% of the time — double the 20% at
 *  eighteen — it is present BELOW the sixth row, "which is the whole of what a
 *  choice of yours can win". And on the last paid run the model converted 22 of
 *  the 51 founders whose fund sat at menu ranks 7-18, where the deterministic
 *  order converted 0 of 51: reaching down a long list is the thing this arm
 *  demonstrably does.
 *
 *  ── WHERE THE 18 CAME FROM, WHICH IS NOT A RECALL OR COST NUMBER (wsGD) ───
 *  It has never been sized for the job it does today. `89ece816` (2026-07-26,
 *  "Brief shape: up to 5 institutions, never fewer than 2") widened it 14 -> 18
 *  and gave the whole reason in its own message:
 *
 *      "Three successive filters thin the pool before the writer sees it -
 *       off-theme large-scale channels, duplicate institution names,
 *       conclusively blocked funds - so the candidate pool now runs wider
 *       (14 -> 18) and the writer is shown 9."
 *
 *  So 18 is a BACKFILL BUFFER: the writer's cap plus enough headroom that three
 *  named filters could not shrink the table below it. All three are now gone
 *  from the stretch it was buffering:
 *
 *    off-theme large-scale channels  SEL-LARGE-SCALE fires in
 *      `selectInstrumentRows`, upstream of the table, so it cannot thin the
 *      pool after the cut.
 *    duplicate institution names     DEMOTES since wsGB (`nameCollision.ts`,
 *      SEL-DUPE-NAME `demote-not-delete`) and measured at 4 rows across 22
 *      markets — it costs the pool a place, not a row.
 *    conclusively blocked funds      `accessiblePool` runs BEFORE the cut since
 *      the pool cut was moved (see pipeline.ts's "The cut comes AFTER the drop"
 *      and `accessiblePool`'s own docstring), so it cannot thin it either.
 *
 *  So the buffer's original job is finished, and it is not what this number is
 *  for any more. Since wsGB removed the band sort it is the MENU THE RANKER
 *  READS, and 40 is chosen for that job on the sweep above rather than inherited
 *  from the job it used to do. The buffering it still incidentally provides is
 *  free: the name collapse demotes 0 rows past the writer's cap on 897 of 897
 *  founders at every depth measured, so no amount of headroom is being spent on
 *  it either way. Read the guard below for the one thing a wider pool cannot
 *  buy.
 *
 *  ── ACCEPTS `all`, BECAUSE THE WHOLE POOL IS NOW A MEANINGFUL ARM (wsGD) ──
 *  `SELECT_DEPTH` has taken `all` since wsEI, on the stated ground that reading
 *  everything is an arm somebody will want to run. On the late seam this
 *  constant IS the menu, so the identical argument applies to it and it did not
 *  take the word — "hand the ranker the whole accessible pool", which is what
 *  the owner's step 2 has always described, was simply not expressible. A large
 *  stand-in would not do: `Math.min(pool, 9999)` is "everything" only until
 *  somebody's pool is bigger, and `depthLever` says exactly this about `all`
 *  being Infinity rather than a number.
 *
 *  The prompt stays honest at `all`. `agentSelect` quotes the base rate at
 *  `poolRecallAt(listLength)` — the length of the menu it actually built — not
 *  at this constant, so an infinite pool quotes the real depth of a real menu.
 *  The harness headers that DID print this constant now fall back to the
 *  deepest measured point, the same way `check_pool_recall_curve.ts` already
 *  handles an infinite `SELECT_DEPTH`. */
export const VERDICT_POOL = depthLever("BRIEF_VERDICT_POOL", 40, { all: true });

/** How deep into the ranked pool the SELECTOR reads. See `agentSelect.ts`'s
 *  header: this is a ceiling/chance trade, not a taste.
 *
 *  On the memo seam the pool is `VERDICT_POOL` rows, which is fewer than this,
 *  so the bound is currently slack there and the selector reads the whole pool.
 *  It is kept as a bound rather than deleted because it is the knob that would
 *  move with the seam if the seam ever moves earlier -- and a depth that
 *  silently equals "everything" is exactly the kind of constant that becomes
 *  wrong without anyone editing it.
 *
 *  ── Why it lives HERE and not in agentSelect.ts, where it was ─────────────
 *  It is the other seam depth, so it belongs beside `VERDICT_POOL`; and its
 *  only non-ranker reader is `check_pool_recall_curve.ts`, which asserts that
 *  the base-rate curve covers both seams. Importing it from `agentSelect.ts`
 *  dragged the Anthropic client and the whole corpus layer in behind one
 *  number, and `check_env_loader` failed the build for exactly that --
 *  CORRECTLY: a guard that silently acquires a credential dependency is a
 *  guard that silently stops running. This is the same move, for the same
 *  reason, that put `VERDICT_POOL` and `WRITER_CANDIDATE_CAP` here for
 *  `check_contracts.ts`. `agentSelect.ts` re-exports it, so every existing
 *  caller is unchanged and there is still exactly one definition.
 *
 *  ── IT IS THE CUT, AT THE EARLY SEAM, AND IT WAS NOT SLACK THERE (wsEI) ──
 *  The comment above is true of the LATE seam only. Under
 *  `AGENT_SELECT_SEAM=early` this bound is what the model's menu is cut to, and
 *  it bit on 36 of wsDR's 45 founders, whose accessible pools ran to a median
 *  of 91 rows. "The early seam hands it the whole accessible pool" was never
 *  what happened: it handed it forty rows. `all` is the arm that would.
 *
 *  Accepts `all` for exactly that reason. See `depthLever`. */
export const SELECT_DEPTH = depthLever("AGENT_SELECT_DEPTH", 40, { all: true });

/**
 * How many rows the selector NAMES.
 *
 * ── THE SIX WAS THE WRONG PAGE'S CAP (wsEN) ───────────────────────────────
 * It was 6, and the reason recorded beside it was: "DISPLAY_CAP is 6; asking
 * for exactly the number the page shows means a short reply is a visible
 * defect." `DISPLAY_CAP` is the INSTANT SCREEN's cut — the second, shorter
 * funnel this file's header calls the open defect. It is not the page this
 * stage feeds. The memo publishes `BRIEF_LIMITS.institutionsMax`, which is 7,
 * so the sentence's own argument produces 7 and the constant said 6.
 *
 * What the mismatch costs is the seventh published seat: the model names six,
 * `agentSelectRows` fills every remaining place from the empirical ranker's own
 * order, and the last row of the founder's table is therefore chosen by the
 * order this arm exists to test rather than by the arm. A measurement of a
 * seven-row table where the model was allowed to reach six of the seats
 * understates the arm and cannot say by how much.
 *
 * ── THE TIE, AND WHERE IT IS ASSERTED ─────────────────────────────────────
 * `institutionsMax` lives in `briefChecks.ts`, beside the rule that enforces
 * it, and this module imports NOTHING by design. So the number is not copied
 * from there — it is TIED to it in `scripts/check_contracts.ts`, which reads
 * both constants and reds the build if this one ever falls below the published
 * cap. That is the same arrangement, for the same reason, as the funnel
 * ordering that check already asserts.
 *
 * ── AT THE EARLY SEAM THIS IS THE PROMOTION BUDGET (wsEI) ────────────────
 * and it, not `SELECT_DEPTH`, is what bounds how much of the pool the seam can
 * change. The permutation `agentSelect.ts` builds is `[...chosen, ...everything
 * else in the shipped order]`, and `runIntelligence` then cuts to
 * `VERDICT_POOL`. So the memo pool under `AGENT_SELECT_SEAM=early` is
 * SELECT_COUNT rows the model named plus the first `VERDICT_POOL -
 * SELECT_COUNT` of the score's own order. A row below the score's cut enters
 * ONLY by being named; a row at score rank 13..18 leaves only by being
 * displaced.
 *
 * That is why wsDR's early arm read "0 admitted, 0 dropped" on the WON fund
 * while changing the pool substantially: it promoted 64 rows from below rank 18
 * across 30 of its 45 founders, 1.4 per founder, and none of the 64 was an
 * answer. Depth was moved and the budget was not, so the widening bought six
 * seats, not a wider pool.
 *
 * Validated, not `Number(...)`: see `depthLever`. `AGENT_SELECT_COUNT=six` used
 * to yield NaN, and `menuRows.length <= NaN` is false while `.slice(0, NaN)` is
 * empty, so every reply parsed to no usable pick and the run reported the
 * shipped order under the treatment's name.
 *
 * IT IS A PRODUCTION NUMBER NOW (wsGB). The line here used to close "NOT A
 * PRODUCTION CHANGE... the arm is off by default", and the arm is on by
 * default. This is how many of the seven published seats the model fills; the
 * rest fall to the pool's own order, which is the fallback and not a second
 * ranker.
 */
export const SELECT_COUNT = depthLever("AGENT_SELECT_COUNT", 7);

/** How many candidates the WRITER is shown, ahead of the cut to
 *  `BRIEF_LIMITS.institutionsMax`.
 *
 *  Lowered from 9. The writer must return a note per candidate, and how often
 *  it does depends on how many it is shown: at 9 one company came back
 *  covering 5 of 9, losing two Horizon clusters and two Innovation Fund
 *  routes.
 *
 *  ── WHAT AN OMISSION COSTS, WHICH IS NOT WHAT IT USED TO COST (wsGC) ──────
 *  Three paragraphs stood here reasoning about "the number of candidates the
 *  writer may reject before the table gets short", because a candidate the
 *  writer never mentioned WAS dropped. It is not any more: which rows publish
 *  is decided by rank in `assembleBriefRows`, and a row with no note publishes
 *  from its own facts. So an omission costs a row its written assessment, not
 *  its seat, and the difference between this cap and the published one is no
 *  longer a budget for the writer to spend.
 *
 *  That does not make this cap free. It is still what the writer is asked to
 *  write, and 9 is the value at which it measurably stopped writing all of
 *  them, so a rise in `WRT-NO-NOTE` is still what sends it back down -- the
 *  cost has simply moved from a lost fund to a thinner row.
 *
 *  ── WHY 8, AND WHAT THE ONE SPARE SEAT IS FOR (wsGI) ──────────────────────
 *  8 is `BRIEF_LIMITS.institutionsMax + 1` and has never been anything else.
 *  `05575942` set it, and gave the whole reason in its own message: "7 shown
 *  against 7 published is zero headroom, and the writer declines candidates
 *  routinely." The first clause is still true; the second was retired by wsGC
 *  three paragraphs up. So the constant has tracked the published cap since it
 *  was 7 = 6+1, and NOBODY HAS EVER SAID WHAT THE SPARE SEAT BUYS.
 *
 *  It buys BACKFILL DEPTH AGAINST THE WATCH-ONLY DEMOTION, and nothing else.
 *  `publishRankByKey` ranks by candidate order, so the published table is the
 *  head of the ranked list and the only thing that disturbs that head is
 *  `assembleBriefRows` sorting watch-only rows to the back. Stated as the
 *  property, with the test for a case nobody has seen -- `briefRows.test.ts`
 *  sweeps EVERY watch-only pattern over a list three longer than the published
 *  cap, at four cap values, rather than the cases we have met:
 *
 *      a candidate at 1-based rank r publishes IFF
 *          r <= WRITER_CANDIDATE_CAP  AND  r - w(r) <= institutionsMax
 *      where w(r) is the number of watch-only rows strictly above it.
 *
 *  Two things follow, and they are what any proposal to move this number has
 *  to answer:
 *
 *    WITH NO WATCH-ONLY ROW THIS CONSTANT IS INERT. The founder reads ranks
 *      1..institutionsMax at a cap of 8, of 12, of 18. It is not a recall
 *      lever, and the loss the funnel prints against "the writer's candidate
 *      cap" belongs to the ORDER: a fund at rank 9 of the candidate list is
 *      lost at the PUBLISHED cap whatever this number is.
 *
 *    RANK institutionsMax+k NEEDS k WATCH-ONLY ROWS ABOVE IT. Measured on the
 *      33 real briefs in `brief_records` that reached a writer (production's own
 *      `dropped_watch_only`, read-only, no model call): 0 watch-only rows on 27
 *      of them, 1 on 4, 2 on 2, never 3. So P(>=2) = 6.1% and P(>=3) = 0, and
 *      rank 10 has never been reachable on a recorded brief AT ANY CAP VALUE.
 *
 *  ── THE DECISION, AND THE NUMBER THAT WOULD OVERTURN IT ───────────────────
 *  MEASURED, on the whole 897-founder held-out population, clean EMBEDDING run,
 *  `npm run stages` 2026-08-13: raising this to the whole pool is worth
 *  **0.12 points**, against a +/-3.2 half-width on the row it would move. 18
 *  founders have their fund at rank 9 and 6.1% of briefs demote twice; below
 *  rank 9 the probability is zero and 28 more founders are unreachable at any
 *  value. The report prints the table; this is its bottom line.
 *
 *  It is CHEAP, not expensive, and that is the point: priced from production's
 *  own `writerCandidateEvidence` (929 chars, ~258 input tokens per candidate,
 *  measured over 96 candidates for free) and from 40 recorded published rows
 *  (243 chars of model prose, ~88 output tokens), an extra candidate is EUR
 *  0.0013 against a recorded EUR 0.24 brief. So the reason to leave it at 8 is
 *  that it buys nothing, NOT that it costs something. What it WOULD cost is the
 *  one thing already on record above: at 9 the writer stopped writing all of
 *  them.
 *
 *  Raise it when the measured P(w >= 2) times the rank-9 mass exceeds the
 *  measuring run's own half-width. `npm run stages` prints both, and the
 *  watch-only budget it reads comes from `brief_records` rather than from this
 *  comment, so the day the writer starts hedging this decision reverses itself
 *  in a number instead of in a memory. */
export const WRITER_CANDIDATE_CAP = 8;

// ── THE FUNNEL INVARIANT, ASSERTED WHERE THE LEVER CAN BREAK IT ───────────
// `check_contracts.ts` already asserts VERDICT_POOL > WRITER_CANDIDATE_CAP >
// institutionsMax, and that check is the right place for the STATIC ordering.
// It cannot cover this file any more, though: it runs in its own process with
// its own environment, so it grades the DEFAULTS while a swept `BRIEF_VERDICT_
// POOL` grades something else. A pool narrower than the writer's cap makes the
// pipeline cut to a number of rows it never assembled and the brief goes short
// with nothing anywhere saying why — the exact symptom that check exists to
// stop, arriving by the one route it cannot see.
//
// So the half of the funnel this file owns is asserted at module scope, where
// the lever is read. It fires on a bad sweep, at import, before a founder is
// served or a euro is spent.
if (VERDICT_POOL <= WRITER_CANDIDATE_CAP) {
  throw new Error(
    `BRIEF_VERDICT_POOL is ${VERDICT_POOL} and WRITER_CANDIDATE_CAP is ${WRITER_CANDIDATE_CAP}. ` +
    `The pool is what the writer's candidates are drawn from, and it is spent further by the ` +
    `blocked drop and the display-name dedupe before the cut, so it must be strictly wider.`);
}

// ── THE OTHER END OF THE POOL LEVER, WHICH IS SILENT (wsGD) ───────────────
// A pool WIDER than `SELECT_DEPTH` buys nothing that a founder can read, and
// nothing in the code says so. `agentSelectRows` cuts the menu to
// `rows.slice(0, Math.min(SELECT_DEPTH, rows.length))`, so a row past that
// depth is never shown to the model; and the permutation it returns is
// `[...chosen, ...everything else in the shipped order]`, so an unshown row can
// only sit behind all `SELECT_COUNT` picks — at publish rank SELECT_COUNT+1 or
// worse, which is past `BRIEF_LIMITS.institutionsMax`. It cannot publish.
//
// That makes `BRIEF_VERDICT_POOL=60` against `AGENT_SELECT_DEPTH=40` a sweep
// that reports 60 in its levers line and measures 40 — the precise failure
// `depthLever` was written to prevent, arriving through a PAIR of levers rather
// than through one bad string, so neither validator can see it.
//
// A WARNING AND NOT A THROW. The excess is inert, not wrong: it costs a little
// assessment work and changes no output, and a hard failure would break every
// harness that legitimately sweeps one lever without the other. What is not
// acceptable is that it be silent.
if (VERDICT_POOL > SELECT_DEPTH) {
  console.warn(
    `[caps] BRIEF_VERDICT_POOL is ${Number.isFinite(VERDICT_POOL) ? VERDICT_POOL : "all"} ` +
    `but AGENT_SELECT_DEPTH is ${SELECT_DEPTH}. The selector's menu is cut to the depth, and a ` +
    `row it was never shown can only rank behind every row it chose — past the published cap. ` +
    `The effective pool is ${SELECT_DEPTH}` +
    (Number.isFinite(VERDICT_POOL)
      ? `; the extra ${VERDICT_POOL - SELECT_DEPTH} row(s) cannot reach a founder. `
      : `; every row past it cannot reach a founder. `) +
    `Move AGENT_SELECT_DEPTH with it, or set it to "all".`);
}

/**
 * ── THE THINKING LEVER AND ITS TWO CEILINGS (moved here by wsGS) ───────────
 *
 * These lived in `agentSelect.ts` and are read from there by every harness, so
 * that module re-exports them and no caller changes. They moved for the reason
 * every other constant in this file moved: `check_maxtok_headroom.ts` has to
 * compare a committed run's recorded ceiling against the ceiling in force, and
 * reading it through `agentSelect.ts` would drag the Anthropic client and the
 * corpus layer in behind one number — which is what `check_env_loader` fails a
 * build for, correctly.
 *
 * `off` is an EFFORT LEVEL here, not the absence of one, and that is what makes
 * thinking measurable as a lever. The arm previously had exactly one thinking
 * setting -- adaptive at `low` -- so "what does thinking buy" had no control to
 * be measured against except a different ARM, which changes the prompt, the
 * prior and the retrieval path at the same time. Naming `off` on this axis
 * keeps every one of those fixed and moves the one thing under test.
 */
export const EFFORTS = ["off", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkEffort = (typeof EFFORTS)[number];
/** Validated at module scope for the same reason the arm is: an unrecognised
 *  effort must fail loudly, not silently fall through to the model default and
 *  bill at a depth nobody chose. */
export const THINK_EFFORT: ThinkEffort = (() => {
  const raw = process.env.AGENT_SELECT_EFFORT ?? "low";
  if (!EFFORTS.includes(raw as ThinkEffort)) {
    throw new Error(`AGENT_SELECT_EFFORT must be one of ${EFFORTS.join("|")}, got "${raw}"`);
  }
  return raw as ThinkEffort;
})();

/**
 * ── THE CEILING HAS TO RISE WITH THE EFFORT, AND THIS IS NOT A TUNING KNOB ──
 *
 * `max_tokens` caps thinking and reply TOGETHER. The arm shipped 1,536 for the
 * adviser, which is ample at effort `low` -- Nortal's own prompt spends 360-519
 * thinking tokens there and answers in 37 characters. It is NOT ample above it.
 * Measured on that same prompt (`scripts/_wsds_probe.ts`, both runs recorded in
 * `findings/dark_levers_wsDS/probe_thinking.txt`):
 *
 *   effort low,  max_tokens 1536   360 thinking, answered
 *   effort high, max_tokens 1536   1,535 thinking, stop_reason=max_tokens,
 *                                  NO text block at all -> empty reply
 *   effort high, max_tokens 8192   5,995 thinking, answered
 *
 * An empty reply is counted as a fallback and publishes the shipped order. So a
 * thinking sweep run against a fixed 1,536 would have reported the CONTROL's
 * table under the treatment's banner at every level above `low`, and reported
 * it as the model declining to choose rather than as a truncation. That is the
 * exact class of error this workstream exists to stop, and it would have been
 * invisible: the tally line says "FELL BACK", not "was cut off".
 *
 * These numbers are ceilings, not budgets -- nothing bills for headroom, only
 * for tokens actually spent -- so they are set well clear of the measured spend
 * rather than trimmed to it. The cost of being generous is a worse worst case;
 * the cost of being tight is a measurement that silently describes the control.
 *
 * ── AND ONE OF THEM WAS MEASURED TO BIND, WHICH VOIDED A PAID RUN (wsGS) ──
 *
 * `findings/headtohead_wsGA/adviser_medium_n773_x2.md` records, in its own tally
 * line: `effort=medium maxtok=6144 ... 4 CUT OFF at max_tokens`. Truncation was
 * a declared VOID condition in `project-mgmt/wsGA_prereg.md` -- "a truncated
 * reply is indistinguishable downstream from a model that declined" -- and it
 * breached, so that run's headline does not stand.
 *
 * ── AND wsGS THEN READ THE WRONG FIELD TO SIZE THE REPLACEMENT (wsHI) ─────
 *
 * This paragraph used to end: "It was NOT a short menu: the same line says
 * `depth=40`, so the eighteen-row era was already over and forty rows are what
 * bound." That is false, and the tape says so per founder.
 *
 * `depth=` prints `SELECT_DEPTH`. That lever has read 40 on EVERY recorded run
 * in this tree -- including wsDQ, from long before the pool was forty rows --
 * because it is a cap, not a measurement. The menu the model is handed is cut
 * upstream by `VERDICT_POOL`, which was 18 until `7191f227 BRIEF_VERDICT_POOL
 * 18 -> 40` on 2026-08-13, THE DAY AFTER wsGA ran.
 * `findings/headtohead_wsGA/adviser_medium_n773_x2.json` records `menu: 18` on
 * all 98 called founders, no pick index above 17, and accessible pools up to
 * 128 rows -- so eighteen was the lever, not the founder.
 *
 *   THE FOUR TRUNCATIONS HAPPENED AT EIGHTEEN ROWS. FORTY HAS NEVER BEEN RUN.
 *
 * A tally line that cannot state the menu it used is how that happened, so the
 * line now prints `menu=` from the rows actually handed over. See
 * `agentSelectTallyLine`.
 *
 * ── THE PROPERTY, stated so it covers a level nobody has run yet ──────────
 *
 *   A CEILING MEASURED TO BIND AT AN EFFORT MAY NOT REMAIN IN FORCE THERE, and
 *   its replacement must clear a ceiling that a run at that effort OR DEEPER
 *   was measured to reach without binding.
 *
 * It is stated over the recorded runs rather than over a table of values, so an
 * effort level added tomorrow is covered and so is a rung nobody has measured:
 * `scripts/check_maxtok_headroom.ts` reads every committed tally line under
 * project-mgmt/, and any future run that truncates turns it red until the
 * ceiling above it moves. No number in this file is the guard's input.
 *
 * ── SIZING THE REPLACEMENT: THE BAR IS THE ABORT CONDITION, NOT A QUANTILE ─
 *
 * wsGS set `medium` to 12,288 because `high` had carried that ceiling across 46
 * recorded calls -- but every one of those calls was an EIGHTEEN-row menu too,
 * so the evidence and the defect share the same blind spot.
 *
 * `scripts/_wshi_tokens.ts` derives these numbers instead, free, from every
 * per-call usage record in the tree (`reply_r1.txt` headers: 12 exact
 * observations at `high`, 12 at `low`) plus the tally lines' aggregates. Output
 * length is lognormal; the fits are
 *
 *   effort=high    mu 8.741  sigma 0.367   MLE on 12 exact observations
 *   effort=medium  mu 7.627  sigma 0.529   mean 2,361 + censoring 4/210 @ 6,144
 *
 * The quantity to bound is NOT the truncation rate. wsHK's pre-registration
 * makes any truncation void the run, so what matters is
 *
 *   P(at least one truncation anywhere in the run) = 1 - (1 - p)^N
 *
 * and a p99.9 ceiling voids a 630-call run one time in ten. The bar taken is
 * P(void) < 5% at N = 630 -- three times wsGA's 210 API calls -- under the
 * worst credible menu scaling, which is linear in rows (18 -> 40, x2.22).
 * Menu scaling is UNMEASURED and this is deliberately its pessimistic end.
 *
 * That bar gives `medium` 34,816 and `high` 57,344 directly. `xhigh` and `max`
 * have never been run at any menu and have no distribution to fit, so they
 * continue the x1.65 step the two measured rungs establish between themselves,
 * clipped to claude-sonnet-5's own 128,000 output cap. Extrapolating a measured
 * step is a stated assumption; a round number would be an unstated one.
 *
 * `off` and `low` are UNTOUCHED. Thinking is disabled at one and near-zero at
 * the other (wsDQ: max 339 of 1,536 over 12 calls), neither has ever truncated,
 * and widening a ceiling that has never bound only worsens the worst case on
 * the two rungs where a runaway reply would be least expected.
 *
 * ── WHAT THIS DOES NOT FIX, AND WHY A ZERO CAN STILL LIE ──────────────────
 *
 * A ceiling the clock cannot reach does not truncate -- it TIMES OUT, and a
 * timeout lands in `exits.threw` where a truncation lands in `truncated`. The
 * record cannot settle whether 34,816 tokens fit in 150,000ms: wsDS produced a
 * 10,596-token reply inside high's then-150s wall, which bounds throughput from
 * BELOW at 70.6 tok/s and therefore says nothing about the ceiling. No recorded
 * run states its own duration.
 *
 * So `truncated = 0` is not on its own evidence that the ceiling holds. The
 * tally now reports the slowest call it made, and wsHK's pre-registration voids
 * on `threw` as well as on truncation. Timeouts are deliberately NOT moved
 * here: wsGS raised them one commit ago and there is no measurement to justify
 * moving them again.
 */
/**
 * ── AND THEN THE TRANSPORT REFUSED TO CARRY THEM (wsHO) ───────────────────
 *
 * wsHI derived `off 1,024 / low 2,048 / medium 34,816 / high 57,344 /
 * xhigh 96,256 / max 128,000` against its own abort condition, and every one of
 * the four values above `low` was UNSENDABLE. `@anthropic-ai/sdk` refuses a
 * NON-STREAMING request whose `max_tokens` implies more than ten minutes of
 * generation, client-side, before a socket is opened:
 *
 *     client.js, calculateNonstreamingTimeout
 *     expectedTime = (60min * max_tokens) / 128,000   throws if > 10min
 *     => max_tokens > 128,000 * (10/60) = 21,333 cannot be sent
 *
 * `agentSelect.ts` does not stream. So every call at `medium` and above threw
 * into `exits.threw`, `agentSelectRows` caught it, THE SHIPPED ORDER WAS
 * PUBLISHED, and the run billed EUR 0.0000 — a run reporting the CONTROL's
 * number under the TREATMENT's banner, which is the one failure shape no
 * counter in the tally line can tell from success. wsHO measured it live on the
 * first two calls it tried to buy: `2 the call threw, shipped order kept`.
 *
 * PRODUCTION WAS NEVER AFFECTED — `AGENT_SELECT_EFFORT` defaults to `low` and
 * `low` is untouched here. What was affected is every paid MEASUREMENT above
 * it, including the one wsHK is pre-registered to run.
 *
 * ── Why these numbers, and what they are not ──────────────────────────────
 *
 * They are NOT a distribution's answer. They are what the transport will carry,
 * spaced so the ladder stays strictly increasing, with the top left below the
 * 21,333 boundary rather than on it because the SDK computes it in floating
 * point and a ceiling that depends on a rounding mode is not a ceiling.
 * `medium` clears 13,654 — the value `check_maxtok_headroom.ts` property 4
 * requires, being wsGA's binding 6,144 scaled by the 40/18 menu ratio — so the
 * property that made wsHI raise it at all is still satisfied.
 *
 * wsHI's own bar (P(any truncation in a 630-call run) < 5% under linear menu
 * scaling) needed 32,768 and IS THEREFORE UNREACHABLE ON A NON-STREAMING
 * REQUEST AT ANY VALUE. That is the finding, and it is not fixed by choosing a
 * different number here.
 *
 * ── The one-line way back to wsHI's ladder ────────────────────────────────
 * Stream the request — `messages.stream(...).finalMessage()` in place of
 * `messages.create(...)` — and the limit disappears entirely, at which point
 * these values may go back to wsHI's derived ones. `check_maxtok_headroom.ts`
 * property 5 reads whether the seam streams and asks the SDK itself whether it
 * would send each value, so that restoration is guarded rather than remembered
 * and an SDK upgrade that moves the boundary moves the guard with it.
 */
/* ── `low` IS THE RUNG THAT SHIPS, AND IT WAS AT 92.3% (wsHO, 2026-08-18) ──
 * Every rung above `low` threw before a socket opened, so wsHO's 85 paid calls
 * ran HERE — at the forty-row menu production serves. Measured: mean output 215
 * tokens, p95 1,017, and a largest reply of **1,891 against a ceiling of
 * 2,048**. Nothing truncated, and that is the point: 0 of 85 is a pass, and one
 * more sentence on that founder's reply would have made it a truncated brief in
 * production rather than a red line in a test.
 *
 * `low` was left alone by wsHI on EIGHTEEN-row evidence, at a time when the
 * menu was eighteen. wsHO then measured menu scaling as SUPER-linear — menu
 * x2.22 gives mean output x3.6 and max x5.6 — so the one rung nobody re-sized
 * is the one now carrying the widened menu.
 *
 * 8,192 is 4.3x the largest reply seen and 8x p95, it stays far below the
 * SDK's non-streaming limit of 21,333 that killed the four rungs above, and it
 * keeps the ladder strictly increasing. It costs NOTHING: output tokens bill
 * only when used, and 95.6% of this call's bill is the prompt.
 */
export const MAX_TOKENS_BY_EFFORT: Record<ThinkEffort, number> = {
  off: 1024, low: 8192, medium: 14_336, high: 16_384, xhigh: 18_432, max: 20_480,
};

/**
 * Same argument as the token ceiling, for the clock.
 *
 * 40 seconds was chosen when the arm could not think. At `high` the probe spent
 * 5,995 thinking tokens on one call, and a timeout is indistinguishable
 * downstream from a model that declined -- both return the shipped order
 * through the same catch. A sweep whose deeper arms quietly time out measures
 * latency, not judgement.
 *
 * ── AND RAISING A TOKEN CEILING WITHOUT THE CLOCK JUST MOVES THE FAULT ────
 *
 * A ceiling the clock cannot reach is not a ceiling. `medium` carried 6,144
 * tokens against 90 seconds; at 12,288 the same wall would cut the call off
 * before the ceiling ever bound -- and a timeout lands in `exits.threw` where a
 * truncation lands in `truncated`, so the FIX for one defect would have hidden
 * the other in the quieter counter. The two levers move together or neither
 * moves.
 *
 * The clock is bounded from above by the route, not by taste:
 * `app/api/intelligence/route.ts` declares `maxDuration = 300`, and the writer
 * runs after this stage inside the same 300 seconds. So `max`'s 300,000 is
 * already the whole request's budget and cannot rise; `medium` and `high` rise
 * to 150s and 200s, which keeps every level strictly inside the route with room
 * for the stage that follows it. NOT A PRODUCTION CHANGE: `AGENT_SELECT_EFFORT`
 * defaults to `low`, whose 40 seconds is untouched.
 */
export const TIMEOUT_BY_EFFORT: Record<ThinkEffort, number> = {
  off: 40_000, low: 40_000, medium: 150_000, high: 200_000,
  xhigh: 240_000, max: 300_000,
};

/** The route this stage runs inside, in milliseconds. Named here so the guard
 *  that checks the clock does not have to parse a Next segment config, and so
 *  the reason a timeout may not rise is a value rather than a sentence.
 *  Mirrors `maxDuration` in `app/api/intelligence/route.ts`; tied to it by
 *  `check_maxtok_headroom.ts`, which reads both. */
export const REQUEST_BUDGET_MS = 300_000;
