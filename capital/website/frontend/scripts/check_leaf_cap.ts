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
// Do NOT satisfy this check by narrowing the corpus, and do not add an
// exception for the channel that trips it. The channels that trip it are the
// national ones, which are 91% of the pool universe and, as national schemes,
// 84% of the corpus by awards — the population the cap has damaged both
// previous times.
//
// ── Why the cap is not simply derived from the pool ────────────────────────
// Deriving it — cap = the widest group, i.e. no cap — was the obvious move and
// is the wrong one. It silently re-links pool size to corpus growth, so the
// payload budget becomes the only thing between a corpus load and a request
// nobody can ship, and that failure would be the same class of surprise in the
// other direction: a number nobody chose, moving on its own. A constant with a
// guard is honest about being a choice. A derived value would look principled
// and would still need exactly this check.
import { leafCapVerdict } from "../lib/intelligence/leafCap";
import { POOL_LEAVES_PER_CHANNEL } from "../lib/intelligence/shortlist";

/** How close to the cap is worth saying out loud, as a share of it. Advisory:
 *  it changes what is PRINTED, never whether the build passes, so it cannot
 *  quietly become a second threshold with opinions of its own. */
const TIGHT = 0.15;

async function main() {
  // Deterministic by construction: the committed corpus snapshot, never a
  // laptop's DATABASE_URL, so this cannot report drift that depends on who ran
  // it — the same reason check_theme_index.ts does it. Verified when this was
  // written that the two agree exactly (1,014 instruments loaded, 721
  // publishable, identical worst group), so determinism costs nothing here.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");

  const { groups, over, worst, headroom } =
    leafCapVerdict(publishableInstruments(), POOL_LEAVES_PER_CHANNEL);

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
