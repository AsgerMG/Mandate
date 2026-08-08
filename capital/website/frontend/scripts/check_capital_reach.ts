// Can a founder reach this fund by answering the intake at all?
//
// ── The property ───────────────────────────────────────────────────────────
// `instrumentServesCapital` excludes an instrument whose `capital_type` is not
// among the DB values the founder's chosen intake options map to. That is a
// filter on a RECORDED FACT, and as such it is correct: a founder who ticked
// Grants and Loans should not be handed a tax credit they did not ask for.
//
// It stops being correct the moment the fact is missing. An instrument whose
// capital type we never recorded carries the value `unknown`, no intake option
// maps to it, and it is therefore removed for EVERY founder in EVERY country
// however they answer — five options ticked or one. The founder expressed no
// preference against it; we simply have no fact, and the filter reads our
// silence as their refusal.
//
// So the property this guards, stated as a property and not as a list:
//
//   Every capital_type carried by a publishable instrument must be reachable by
//   at least one intake option. Absence of a recorded fact is not a mismatch.
//
// It is deliberately not "no instrument may carry `unknown`". A new source that
// introduces `mezzanine` or `convertible` tomorrow fails this check the same
// way, without anybody having thought of the word in advance — which is the
// only kind of check worth having, because the values that will hurt are the
// ones nobody enumerated.
//
// ── Why a ratchet and not a hard zero ──────────────────────────────────────
// The gap is real today and the honest fix is upstream: record the capital type
// in the ETL, where the fund's own documents can settle it. Guessing in the
// filter would be worse than the bug — three of the eleven EIT vehicles in this
// corpus that ARE typed carry `equity`, and two of the untyped ones are named
// "portfolio" and "investments", so admitting `unknown` to a grant-seeker's
// pool could put a cap-table investor in front of someone who never asked for
// one. That is the exact failure `passesCapitalPreference` exists to prevent.
//
// A ratchet says the true thing without pretending it is fixed: the gap is
// known, it is this size, and it may not grow. Fixing the DATA lowers the
// number; a new unreachable capital type raises it and fails the build.
//
// ── What `INDEFINITE_CAPITAL` does and does not change about this ──────────
// Workstream AR made `blended` reachable by every intake option, and that does
// NOT weaken the paragraph above. The two values fail this check for opposite
// reasons. `blended` is a fact we hold and were misreading: it is what the vote
// emits when nothing clears its threshold, its kinds are recorded beside it,
// and all five publishable ones are enumerated as loan/guarantee, grant/loan or
// grant/tax-credit -- no equity, so admitting them cannot surprise anyone with
// dilution. `unknown` is a fact we never recorded, so there is nothing to
// enumerate and no safe default, which is exactly why it stays here.
//
// An unresolved MIXTURE we can enumerate is safe to admit. An unresolved BLANK
// is not.
//
// Reachability is therefore asked of `instrumentServesCapital` ITSELF, one
// intake option at a time, rather than of a set of mapped values recomputed
// here. The two are not the same question and the difference is the whole
// point: `blended` is not in `CAPITAL_SOUGHT_TO_DB` and IS reachable, and a
// check that inspected the map instead of the function would have counted it
// as stranded and failed a build over a fund every founder can now see.
//
// Measured 2026-08-07 against Postgres (1,084 instruments, 814 publishable):
// 9 unreachable, all `unknown` — 8 EIT KIC leaves and one national development
// bank scheme carrying 2,835 awards. None of them appears as an answer in the
// recall set, so this costs no measurable recall; it costs those funds' reach.
//
// Re-derived 2026-08-08 on the 1,088 corpus: 8 of 769 publishable, still all
// `unknown`. The ratchet is lowered to match, which is the whole point of it
// being a ratchet — the gap closed by one and that one may not come back
// silently. It closed upstream, in the ETL, which is where this check has
// always said the fix belongs.
import { instrumentServesCapital } from "../lib/intelligence/shortlist";
import { CAPITAL_OPTIONS } from "../lib/intelligence/types";

/** The number of publishable instruments carrying a capital type no intake
 *  option maps to, on the corpus this was last re-derived against. A CEILING,
 *  never a target: lower it whenever the data improves, and never raise it to
 *  make a build green — a rise means a new source is landing funds no founder
 *  can reach. */
const UNREACHABLE_CEILING = 8;

async function main() {
  // The committed snapshot, never a laptop's DATABASE_URL — same reason
  // check_leaf_cap.ts does it, and it is trustworthy for the same reason:
  // check_corpus_currency.ts asserts the snapshot and Postgres agree, and runs
  // before this in `npm run check`.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");

  const stranded = new Map<string, { n: number; sample: string[] }>();
  const pub = publishableInstruments();
  const options = CAPITAL_OPTIONS.map((o) => o.value);
  for (const i of pub) {
    const t = i.capitalType || "(empty)";
    // Reachable = SOME single answer to the capital question admits it. One
    // option at a time, never the whole set at once: a fund only reachable by
    // ticking every box is not reachable by any founder who has a preference.
    if (options.some((o) => instrumentServesCapital(t, [o]))) continue;
    const e = stranded.get(t) ?? { n: 0, sample: [] };
    e.n++;
    if (e.sample.length < 4) e.sample.push(i.id);
    stranded.set(t, e);
  }
  const total = [...stranded.values()].reduce((a, b) => a + b.n, 0);

  if (total > UNREACHABLE_CEILING) {
    console.error(
      `check_capital_reach: ${total} publishable instruments carry a capital ` +
      `type no intake option maps to (ceiling ${UNREACHABLE_CEILING}).\n` +
      `  These are removed from the pool of every founder in every country, ` +
      `whatever\n  they tick, because CAPITAL_SOUGHT_TO_DB has no route to the ` +
      `value they carry:\n` +
      [...stranded].sort((a, b) => b[1].n - a[1].n).map(([t, e]) =>
        `    ${String(e.n).padStart(4)}  capital_type="${t}"   e.g. ` +
        e.sample.join(", ")).join("\n") +
      `\n\n  Fix the DATA, not the filter: record the capital type upstream so ` +
      `the\n  instrument states what it is. Where a new source legitimately ` +
      `introduces a\n  new capital type, add it to CAPITAL_SOUGHT_TO_DB under ` +
      `the intake option a\n  founder would tick to ask for it. Do NOT raise ` +
      `the ceiling to pass: a rise\n  means funds are landing that no founder ` +
      `can be shown.`);
    process.exit(1);
  }

  console.log(
    `check_capital_reach: ok — ${total} of ${pub.length} publishable ` +
    `instruments unreachable by any intake option (ceiling ${UNREACHABLE_CEILING}).`);
  if (total) {
    console.log(
      `  Known gap, not a pass mark. ` +
      [...stranded].map(([t, e]) => `${e.n} x "${t}"`).join(", ") +
      `. Every one is removed for every founder in every country. The fix is ` +
      `upstream in the ETL.`);
  }
  if (total < UNREACHABLE_CEILING) {
    console.log(
      `  The data has improved since the ceiling was set. Lower ` +
      `UNREACHABLE_CEILING to ${total} so the gain cannot be given back.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
