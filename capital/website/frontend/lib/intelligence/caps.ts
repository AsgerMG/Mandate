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
  if (opts.all && raw === "all") return Infinity;
  const n = Number(raw);
  const min = opts.min ?? 1;
  if (!Number.isInteger(n) || n < min) {
    throw new Error(
      `${name} must be an integer >= ${min}${opts.all ? ` or "all"` : ""}, got "${raw}". ` +
      `It is read once at module scope precisely so a typo cannot read as ${fallback} ` +
      `— or, worse, as NaN, which slices every list to nothing without erroring.`);
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

/** The pool `synthesize()` screens before cutting to the published cap.
 *
 *  Deliberately wider than `DISPLAY_CAP`: funds a founder cannot access are
 *  dropped AFTER assessment, so a pool of six meant a founder blocked on three
 *  of them got a three-row brief while perfectly good candidates at rank seven
 *  were never looked at. Dropping must be able to backfill, not shrink the
 *  table.
 *
 *  ── A LEVER SINCE wsEI, DEFAULT UNCHANGED AT 18 ──────────────────────────
 *  This is the number the product owner's architecture disputes: step 2 says
 *  the ranker is handed "the subset", and 18 is not the subset — the accessible
 *  pool it is cut from has a median of 91 rows and a mean of 87 (wsDR, 45
 *  founders) or 77 (the committed curve, 846). The won fund is inside 18 of
 *  them 44.2% of the time and inside the whole pool 77.5%.
 *
 *  It stays 18 until a depth arm on LEGIBLE rows says otherwise. wsDR's arm
 *  said deeper was worse by 2.2 points on n=45 — inside the binomial noise, and
 *  measured while 51 of 133 menu rows carried no readable sentence saying what
 *  the fund pays for. A default moved on that evidence would be a default moved
 *  on nothing.
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
 *  What the buffer was for is therefore ~2 rows of name-collapse demotion, and
 *  the constant reserves ten. Since wsGB removed the band sort it is ALSO the
 *  menu the ranker reads, and nobody has ever chosen a number for that. Read
 *  the guard below for what it can and cannot buy in that second role.
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
export const VERDICT_POOL = depthLever("BRIEF_VERDICT_POOL", 18, { all: true });

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
 *  sweeps all 1024 patterns rather than the ones we have met:
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
