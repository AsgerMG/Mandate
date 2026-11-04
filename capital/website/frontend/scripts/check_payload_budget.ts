/**
 * How much data does one brief request have to load before it can think?
 *
 * FREE — measures the corpus snapshot, no model calls.
 *
 * Hydration is two-phase. Phase one loads every instrument row plus the
 * FRAMEWORK gates, because `loadDbInstruments()` is synchronous and used
 * everywhere: eligibility.ts, relevance.ts, gateReach.ts and pipeline.ts all
 * reach into `inst.gates` directly. Phase two (`hydrateGatesFor`) then fetches
 * the full gate rows for the instruments the pool admits, plus the regime each
 * one inherits from. Both are paid on every request, and both stop being fine
 * quietly, which is the dangerous kind of limit — nothing fails, requests just
 * get slower until someone notices.
 *
 * So the limit is measured and enforced rather than left to be discovered.
 *
 * ── This check used to measure only half the request, and it was the half
 *    that cannot move ────────────────────────────────────────────────────────
 * It measured the size of `public/data/instrument_terms.json` minus every
 * non-framework gate — i.e. phase one — and `check_leaf_cap.ts` cited it as the
 * bound on `POOL_LEAVES_PER_CHANNEL` from the shipping side: "this one says the
 * cap must be large enough that ranking sees the answer, that one says it must
 * be small enough to ship."
 *
 * That was false. Phase one does not depend on the cap in any way, so the cap
 * could have been raised to any number at all and this check would not have
 * moved by a byte. The constant with the worst defect history in the product
 * was bounded on one side only, and the file that said otherwise was the file
 * people read before changing it.
 *
 * PHASE TWO is the cap-sensitive half, so it is measured here now:
 *
 *     worst case = max over founder countries C of
 *       sum over channels of the OWN gates of min(cap, leaves serving C)
 *       plus the own gates of every distinct regime those leaves inherit from
 *
 * An upper bound on purpose. It ignores the capital-preference filter, the
 * ticket filter and the name dedupe, every one of which only ever REMOVES rows
 * from the pool. A budget wants the bound, not the average — the average is
 * what makes a limit surprising.
 *
 * OWN gates, not merged ones: corpus.ts merges a regime's gates into each of
 * its children at load, so counting the merged copy bills one regime's gates
 * once per sibling, where the query returns each row exactly once.
 *
 * ── The designed fix, when this trips ─────────────────────────────────────
 * If PHASE ONE is what grew: two-phase hydration is already done for gates, so
 * the next move is the instrument rows themselves — load the columns selection
 * needs, and fetch the rest for the ~20 instruments that survive. The work is
 * not the query, it is that four modules currently assume the whole row is in
 * memory, so each needs an explicit "fields for these ids" step first.
 *
 * If PHASE TWO is what grew: that is `POOL_LEAVES_PER_CHANNEL` doing its job as
 * a ceiling, and the trade is a real one — see `scripts/check_leaf_cap.ts`,
 * which bounds the same constant from the recall side. Lowering the cap to pass
 * this check is only legitimate if check_leaf_cap still passes at the new
 * value; if it cannot, the two-phase gate fetch needs to become a two-phase
 * fetch of the fields WITHIN a gate, since it is `quote` and `source_locator`
 * that carry the weight and neither is read until a row reaches the table.
 *
 * Run: npx tsx scripts/check_payload_budget.ts
 */
import { readFileSync, statSync } from "node:fs";

/** Above this, the whole-corpus-per-request design has to be replaced rather
 *  than tuned. Set from measurement: 327 instruments cost 1.8 MB, so this is
 *  roughly 1,500 instruments — the point at which a cold request spends more
 *  time hydrating than the founder will tolerate. */
const BUDGET_MB = 8;
/** Warn well before the wall, so the replacement is planned, not scrambled. */
const WARN_MB = 4;

const FILE = "public/data/instrument_terms.json";

interface Rec {
  id: string;
  parentId?: string | null;
  country: string;
  isFramework?: boolean;
  sourceFamilyBucket?: string | null;
  gates?: object[];
}

/** Worst-case phase-two cost, and the founder who pays it. */
function phaseTwoWorstCase(
  pub: { id: string; country: string; sourceFamilyBucket?: string | null }[],
  byId: Map<string, Rec>,
  ownBytes: Map<string, number>,
  cap: number,
) {
  let worst = { country: "(none)", bytes: 0, leaves: 0 };
  for (const c of new Set(pub.map((i) => i.country).filter((x) => x && x !== "EU"))) {
    // `instrumentServesCountry` admits the founder's own country and every
    // EU-wide instrument, which is why the EU tier is counted into each
    // country rather than beside it — the same arithmetic leafCap.ts does.
    const byChannel = new Map<string, typeof pub>();
    for (const i of pub) {
      if (i.country !== c && i.country !== "EU") continue;
      const k = i.sourceFamilyBucket ?? "(none)";
      byChannel.set(k, [...(byChannel.get(k) ?? []), i]);
    }
    const wanted = new Set<string>();
    let leaves = 0;
    for (const list of byChannel.values()) {
      for (const i of list.slice(0, cap)) {
        leaves++;
        wanted.add(i.id);
        const p = byId.get(i.id)?.parentId;
        if (p && byId.has(p)) wanted.add(p);
      }
    }
    let bytes = 0;
    for (const id of wanted) bytes += ownBytes.get(id) ?? 0;
    if (bytes > worst.bytes) worst = { country: c, bytes, leaves };
  }
  return worst;
}

async function main() {
  // Deterministic by construction: the committed corpus snapshot, never a
  // laptop's DATABASE_URL. That determinism is a property of the two corpora
  // AGREEING, which `check_corpus_currency.ts` asserts separately and which
  // this file does not re-implement — see the same note in check_leaf_cap.ts.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const { POOL_LEAVES_PER_CHANNEL } = await import("../lib/intelligence/shortlist");

  const bytes = statSync(FILE).size;
  const data = JSON.parse(readFileSync(FILE, "utf8")) as { records: Rec[] };
  const instruments = data.records.length;
  const gates = data.records.reduce((n, r) => n + (r.gates?.length ?? 0), 0);

  const ownBytes = new Map<string, number>();
  for (const r of data.records) {
    ownBytes.set(r.id, (r.gates ?? []).reduce(
      (n, g) => n + JSON.stringify(g).length + 1, 0));
  }
  const byId = new Map(data.records.map((r) => [r.id, r]));

  // What PRODUCTION loads in phase one: instruments plus FRAMEWORK gates only.
  // Framework gates carry their citation because no shortlist ever fetches it
  // for them. The JSON file still carries every gate because it is the offline
  // fallback, so measuring the file alone overstates phase one — and understates
  // the request, which also pays phase two.
  const heavy = data.records.reduce(
    (n, r) => (r.isFramework ? n : n + (ownBytes.get(r.id) ?? 0)), 0);
  const phaseOne = bytes - heavy;

  const pub = publishableInstruments();
  const worst = phaseTwoWorstCase(pub, byId, ownBytes, POOL_LEAVES_PER_CHANNEL);
  // What the cap is actually holding back, priced: the same worst case with no
  // cap at all. This is the number that says whether the constant is a shipping
  // constraint today or purely a ceiling on future growth.
  const uncapped = phaseTwoWorstCase(pub, byId, ownBytes, Number.MAX_SAFE_INTEGER);

  const totalBytes = phaseOne + worst.bytes;
  const mb = totalBytes / 1e6;
  const perInstrument = phaseOne / Math.max(1, instruments);

  console.log(`per-request payload ${mb.toFixed(2)} MB   (worst founder: ${worst.country})`);
  console.log(`  phase one         ${(phaseOne / 1e6).toFixed(2)} MB   ` +
    `(every instrument + framework gates; independent of the pool cap)`);
  console.log(`  phase two         ${(worst.bytes / 1e6).toFixed(2)} MB   ` +
    `(gates for ${worst.leaves} leaves + their regimes, at cap ${POOL_LEAVES_PER_CHANNEL})`);
  console.log(`full snapshot       ${(bytes / 1e6).toFixed(2)} MB   ` +
    `(JSON fallback; ${(heavy / 1e6).toFixed(2)} MB of it deferred to the shortlist)`);
  console.log(`instruments         ${instruments.toLocaleString()}`);
  console.log(`gates               ${gates.toLocaleString()}`);
  console.log(`per instrument      ${(perInstrument / 1024).toFixed(1)} KB   (phase one)`);
  console.log(`cost of the cap     ${((uncapped.bytes - worst.bytes) / 1024).toFixed(0)} KB ` +
    `would be added by removing POOL_LEAVES_PER_CHANNEL entirely ` +
    `(${uncapped.leaves - worst.leaves} more leaves)`);
  console.log(`headroom to budget  ${(BUDGET_MB - mb).toFixed(1)} MB ` +
    `(~${Math.max(0, Math.floor((BUDGET_MB * 1e6 - totalBytes) / perInstrument)).toLocaleString()} more instruments at today's phase-one rate)`);

  if (mb > BUDGET_MB) {
    console.error(
      `\nFAIL: one request no longer fits the per-request budget of ${BUDGET_MB} MB.\n` +
      `Phase one is ${(phaseOne / 1e6).toFixed(2)} MB and phase two is ` +
      `${(worst.bytes / 1e6).toFixed(2)} MB for a founder in ${worst.country}.\n` +
      `Read which half grew before reaching for either lever; the two fixes are\n` +
      `different and are described at the top of this file.`);
    process.exitCode = 1;
  } else if (mb > WARN_MB) {
    console.warn(
      `\nWARN: past ${WARN_MB} MB. Plan the next hydration split now rather than\n` +
      `when it breaks; see the note at the top of this file.`);
  } else {
    console.log("\nwithin budget");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
