/**
 * A SORT KEY THAT NEVER FIRES HAS NO PRICE.
 *
 * ── THE DEFECT THIS EXISTS TO CATCH, WHICH ALREADY HAPPENED ───────────────
 * `usedInField` is tier 1 of the row comparator, above the entire score. For a
 * year its comment carried a measured price -- "EXACT@5 51% -> 49%, REGIME@5
 * 76% -> 73%" -- and two workstreams (wsIN, wsIP) read that number as this
 * tier's cost and reasoned from it.
 *
 * It was not this tier's cost. The run that produced it (32cd36c5) replayed
 * every company as `TestCo`, and `matchCompany("TestCo", ...)` matches nothing,
 * so `fieldChannels` was EMPTY and this key was FALSE ON EVERY ROW OF EVERY
 * REPLAY. The key never fired in the run that priced it. The whole delta
 * belonged to the tier below it, which a later note re-measured ALONE at 35% ->
 * 34% -- a point in its favour rather than three against.
 *
 * wsIP then measured this tier on 897 founders with real corpus matches: it is
 * worth +0.0246 mean reciprocal rank (95% CI [+0.0166, +0.0334]) and it doubles
 * the founders whose won fund is the FIRST row, 28 -> 54. The recorded price had
 * the wrong tier AND the wrong sign.
 *
 * ── THE PROPERTY, WHICH NAMES NOTHING ─────────────────────────────────────
 *   A ranking key may only be priced on a population where it FIRES, and it
 *   fires only where it SEPARATES -- where the candidate rows do not all carry
 *   the same value for it. A key with one value across every row it sees is
 *   inert by arithmetic, and any number attributed to it was produced by
 *   something else.
 *
 * That is a property of the key's distribution, not a list of keys, channels,
 * companies or thresholds. It transfers unchanged to any future tier: ask
 * whether the candidate set is split, and refuse to believe a price taken where
 * it is not. No channel name, no company name and no fund id appears in this
 * file.
 *
 * ── WHAT IT MEASURES ──────────────────────────────────────────────────────
 * The share of founders for whom the tier is INERT: the peer draw production
 * would really do returns no channel the founder's candidate rows are in, so
 * the key cannot reorder anything. It is measured through the SAME calls the
 * request path makes, never a second copy of them, because a guard reading a
 * reimplementation of the thing it guards is how `TestCo` survived.
 *
 * ── RATCHET ───────────────────────────────────────────────────────────────
 * Exact, in the shape wsIO's `check_channel_prior_complete` established: this
 * fails when the number is WORSE than the ratchet and ALSO when it is BETTER,
 * so an improvement must be banked here in the same commit rather than left to
 * rot into headroom. The measurement is a pure function of committed files --
 * the fund snapshot, the peer index, the recall set and a fixed seed -- so an
 * exact match is reproducible rather than flaky.
 *
 * Offline and free. No credentials, no network, no model call, no database:
 * `DATABASE_URL` and `VOYAGE_KEY` are destroyed rather than trusted absent.
 * This is NOT `NO_PG=1`, which would additionally swap in a lexical ranker.
 *
 *   npx tsx scripts/check_field_tier_priced.ts
 */
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;

import {
  findPeersBySubsector, isGenericSubsector, loadDbInstruments, matchCompany,
  publishableInstruments,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import {
  buildInstrumentTable, founderCountryList, tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, loadRecallSet, partitionByOfferable,
  reattributeMissingAnswers, type AnswerMode, type RecallRow,
} from "./recallSet";

/** Founders sampled. A subsample, because this runs in CI and the full 897 is
 *  37 seconds; the seed is fixed so the number is reproducible. Raising it is
 *  safe and changes the ratchet, which is why the ratchet names it. */
const N = Number(process.env.N ?? 200);

/** Share of sampled founders on which the tier separates NOTHING.
 *  Measured 2026-08-19 at N=200, seed DEFAULT_SEED (47.5%); lowered to the
 *  measured 45.0% on 2026-11-06 (90/200), as the check itself asks. COMES
 *  DOWN, NEVER UP. */
const MAX_INERT_SHARE = 0.45;

function founders(): RecallRow[] {
  const { rows: all } = loadRecallSet();
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const graded = partitionByOfferable(fixed.rows, (id) => offerable.has(id)).graded;
  return sampleRecall(graded, Math.min(N, graded.length), DEFAULT_SEED);
}

function main() {
  const set = founders();
  let inert = 0;
  for (const r of set) {
    const policy = { ...founderPolicyFromEnv(), answers: (process.env.ANSWERS ?? "off") as AnswerMode };
    const f = founderIntake(r, policy);
    const self = matchCompany(f.company, f.country);
    const sub = self.matched && !isGenericSubsector(self.subsector) ? self.subsector : "";
    const peers = sub
      ? findPeersBySubsector(sub, { country: f.country, limit: 4, exclude: [f.company] }) : [];
    const rows = buildInstrumentTable({
      fieldChannels: new Set<string>(peers.flatMap((p) => p.channels)),
      founderCountries: founderCountryList(
        f.country, (f.eligibility.entityCountries ?? []) as string[]),
      capitalSought: (f.opts.capitalSought ?? []) as string[],
      description: f.opts.description ?? "",
      semantic: undefined,
      ...tableInputFromAnswers(f.eligibility as never),
      log: new ExclusionLog(),
    } as never) as InstrumentRow[];
    // SEPARATES, not "is true somewhere". A key true on every row orders as
    // little as one true on none, and both are the failure this guard is for.
    const flagged = rows.filter((x) => x.usedInField).length;
    if (flagged === 0 || flagged === rows.length) inert++;
  }

  const share = inert / set.length;
  const fmt = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(
    `field tier: inert on ${inert}/${set.length} founders (${fmt(share)}), ` +
    `ratchet ${fmt(MAX_INERT_SHARE)}`);

  if (share > MAX_INERT_SHARE) {
    console.error(
      `\nFAIL: the row sort's first tier now separates nothing for ${fmt(share)} of founders, ` +
      `above the recorded ${fmt(MAX_INERT_SHARE)}.\n` +
      "A key that does not separate cannot be reordering anything, so any price or gain\n" +
      "recorded at that comparator was produced by a different key. Either restore what\n" +
      "feeds the tier, or remove the tier AND the number written beside it -- but do not\n" +
      "leave a measurement standing against a key that no longer fires. That is exactly\n" +
      "how `EXACT@5 51% -> 49%` outlived the run that produced it.\n");
    process.exit(1);
  }
  if (share < MAX_INERT_SHARE) {
    console.error(
      `\nFAIL, and this is the good direction: the tier is inert on ${fmt(share)}, BETTER than\n` +
      `the recorded ${fmt(MAX_INERT_SHARE)}. Lower MAX_INERT_SHARE to ${fmt(share)} in THIS commit,\n` +
      "so the next regression is caught at the new level rather than the old one. A\n" +
      "ratchet left above the truth is headroom for a defect to hide in.\n");
    process.exit(1);
  }
  console.log("field tier: priced on a population where it fires. OK");
}

main();
