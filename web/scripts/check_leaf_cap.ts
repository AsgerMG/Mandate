// Fails the build when POOL_LEAVES_PER_CHANNEL is binding.
//
// The reasoning, and the two defects this exists to prevent a third of, are in
// `lib/intelligence/leafCap.ts` beside the arithmetic. This file is the CLI.
//
// ── The fix when this fails ────────────────────────────────────────────────
// RAISE THE CAP. It is a pool cap, not a display cap — `DISPLAY_CAP` governs
// what a founder sees, and the pool exists so the ranker and the writer can see
// past it. A wider pool costs payload and nothing else, and payload has its own
// guard in `check_payload_budget.ts`. The two checks bound the constant from
// both sides: this one says it must be large enough that ranking sees the
// answer, that one says it must be small enough to ship. Neither can be
// satisfied by quietly editing the other's number.
//
// THAT SENTENCE WAS FALSE UNTIL 2026-08-07, and it was false in the file people
// read before touching the constant. `check_payload_budget.ts` measured phase
// one only — the whole instrument corpus minus every non-framework gate — which
// does not depend on this cap by a single byte. The cap could have gone to any
// number and that check would not have moved. It now measures PHASE TWO as
// well, which is the half the cap governs (`hydrateGatesFor` over every leaf the
// pool admits plus the regime each inherits from), and prints what removing the
// cap entirely would add. So the claim is true now because the other check was
// changed, not because this comment was.
//
// Do NOT satisfy this check by narrowing the corpus, and do not add an
// exception for the channel that trips it. The channels that trip it are the
// national ones, which are 91% of the pool universe and, as national schemes,
// 84% of the corpus by awards — the population the cap has damaged both
// previous times.
//
// ── What this check measures, and what makes that trustworthy ─────────────
// The committed snapshot, with DATABASE_URL deleted, so two people on two
// machines get the same verdict. That determinism is NOT a property of reading
// a file: it is a property of the file agreeing with Postgres, which
// `check_corpus_currency.ts` asserts — including the membership clause, "N live
// instrument(s) absent from the snapshot".
//
// This matters because it has already failed here. On 2026-08-06 the snapshot
// was 62 rows behind Postgres, and this guard — written to prevent a third
// occurrence — reported GREEN at a widest group of 87 (ES) while the third
// occurrence, 103 in DE, was live in production. A guard that measures a stale
// artifact is not a guard.
//
// The dependency is therefore stated rather than duplicated: `npm run check`
// runs check_corpus_currency BEFORE this file, and this file does not grow its
// own currency logic. Two checks asserting the same property in two ways is the
// duplication that this repo keeps finding as a defect. Under `NO_PG=1` the
// currency check skips by its own declared contract — with nothing to compare
// against there is no claim to test — and this reading is then a statement
// about the committed snapshot alone, which is all a run without a database
// can honestly make.
//
// ── Why the cap is not simply derived from the pool ────────────────────────
// Deriving it — cap = the widest group, i.e. no cap — was the obvious move and
// is the wrong one. It silently re-links pool size to corpus growth, so the
// payload budget becomes the only thing between a corpus load and a request
// nobody can ship, and that failure would be the same class of surprise in the
// other direction: a number nobody chose, moving on its own. A constant with a
// guard is honest about being a choice. A derived value would look principled
// and would still need exactly this check.
//
// That argument was made while the payload cost was unmeasured. It has now been
// measured — removing the cap entirely costs 45 KB against a 4.1 MB headroom —
// so the premise "payload is the only thing between a load and an unshippable
// request" is weaker than it looked. The conclusion still stands, for the
// reason that survives the measurement: a derived cap cannot be too small, so
// it cannot fail this check, so nobody ever reads the two paragraphs above
// again. The constant stays a choice. What the measurement changes is HOW the
// number is chosen — see POOL_LEAVES_PER_CHANNEL in shortlist.ts.
import { leafCapVerdict } from "../lib/intelligence/leafCap";
import { POOL_LEAVES_PER_CHANNEL } from "../lib/intelligence/shortlist";

/** How close to the cap is worth saying out loud, as a share of it. Advisory:
 *  it changes what is PRINTED, never whether the build passes, so it cannot
 *  quietly become a second threshold with opinions of its own. */
const TIGHT = 0.15;

async function main() {
  // The committed corpus snapshot, never a laptop's DATABASE_URL — the same
  // reason check_theme_index.ts does it. See the header: this is deterministic
  // only because check_corpus_currency asserts the snapshot and Postgres agree,
  // and it read GREEN over a 62-row-stale file once already. Re-verified
  // 2026-08-07 against Postgres (1,076 instruments, 817 publishable, identical
  // worst group state_aid_satr/DE at 103) with scripts/probe_leafcap.ts.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");

  // Same floor, same reason, as check_capital_reach: "no group exceeds the cap"
  // is trivially true of no groups, and this printed "ok — cap 250, widest group
  // 0 ((none) (none)), headroom 250 across 0 channels" when started from the
  // repo root, where the snapshot path does not resolve. Headroom measured on an
  // empty corpus is the most reassuring number this check can print and the
  // least true one.
  const pub = publishableInstruments();
  if (!pub.length) {
    console.error(
      `check_leaf_cap: FAILED — 0 publishable instruments, so every group is\n`
      + `  under the cap by having no members. Run from web: the\n`
      + `  snapshot resolves from process.cwd()/public/data.\n`
      + `  cwd was ${process.cwd()}`);
    process.exit(1);
  }

  const { groups, over, worst, headroom } =
    leafCapVerdict(pub, POOL_LEAVES_PER_CHANNEL);

  if (over.length) {
    console.error(
      `check_leaf_cap: POOL_LEAVES_PER_CHANNEL (${POOL_LEAVES_PER_CHANNEL}) IS BINDING.\n` +
      `  ${over.length} channel/country group(s) hold more country-serving leaves\n` +
      `  than the cap admits, so candidates are cut before the ranker scores\n` +
      `  them, for every founder in those countries:\n` +
      over.slice(0, 10).map((g) =>
        `    ${String(g.n).padStart(4)}  ${g.channel}  ${g.country}` +
        `   (${g.n - POOL_LEAVES_PER_CHANNEL} cut before ranking)`).join("\n") +
      `\n\n  Fix: raise POOL_LEAVES_PER_CHANNEL to at least ${worst.n}, then run\n` +
      `  scripts/check_payload_budget.ts to confirm the wider pool still ships.\n` +
      `  Record the pool recall while it was binding before you raise it — that\n` +
      `  number is the only evidence of what this cost, and it is unrecoverable\n` +
      `  afterwards. Do not narrow the corpus and do not special-case a channel.`);
    process.exit(1);
  }

  console.log(
    `check_leaf_cap: ok — cap ${POOL_LEAVES_PER_CHANNEL}, widest group ` +
    `${worst.n} (${worst.channel} ${worst.country}), headroom ${headroom} ` +
    `across ${groups.length} channel/country groups.`);
  if (headroom < POOL_LEAVES_PER_CHANNEL * TIGHT) {
    console.log(
      `  NOTE: headroom is ${headroom} instrument(s). The next load into ` +
      `${worst.channel}/${worst.country} fails this check. That is the intended ` +
      `behaviour — the build stops instead of recall dropping silently.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
