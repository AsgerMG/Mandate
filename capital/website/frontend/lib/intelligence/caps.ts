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
 * The arms. `off` is the default and is bit-identical to the shipped path.
 * `reverse` is the ONE arm that is not a candidate for shipping and never will
 * be — see `reverseNonsense` in `agentSelect.ts` for what it is for.
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
  const raw = process.env.AGENT_SELECT ?? "off";
  if (!ARMS.includes(raw as AgentSelectArm)) {
    throw new Error(
      `AGENT_SELECT must be one of ${ARMS.join("|")}, got "${raw}". ` +
      `It is read once at module scope precisely so a typo cannot read as "off".`);
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
 *  on nothing. */
export const VERDICT_POOL = depthLever("BRIEF_VERDICT_POOL", 18);

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
 * NOT A PRODUCTION CHANGE. It is read only when the arm is on, and the arm is
 * off by default.
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
 *  cost has simply moved from a lost fund to a thinner row. */
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
