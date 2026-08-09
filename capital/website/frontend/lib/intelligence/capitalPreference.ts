// Which funds a founder's stated COUNTRY and CAPITAL preference may remove.
//
// Two pure predicates and the classification they read. No corpus, no database,
// no embeddings, no I/O — they take a string off a row and a list of strings
// off an intake answer and return a boolean.
//
// ── Why they are a module of their own ─────────────────────────────────────
// They used to live in shortlist.ts, which is the ranker: it imports semantic.ts
// (VOYAGE_KEY), verdict.ts, relevance.ts, corpus.ts and a dozen more. But the
// only other module that needs them is offerableAxes.ts — a POLICY leaf, three
// hundred lines about which corpus values may reach a founder at all, that
// needs nothing else out of the ranker.
//
// That one import edge had a cost far out of proportion to it. corpus.ts, the
// single door every corpus-reading harness in this repo goes through, imports
// offerableAxes for isWithheldByPolicy — so the module graph read
//
//     corpus.ts -> offerableAxes.ts -> shortlist.ts -> semantic.ts -> VOYAGE_KEY
//
// and check_env_loader, which derives credential reachability from that graph,
// concluded that all sixteen probe/measure/diagnose harnesses could silently
// take the semantic fallback path. None of them can: they call
// publishableInstruments() and leafCapGroups() and never rank anything. The
// check was reporting one true finding (check_answer_reach really does call
// semanticFundMatch) underneath fifteen it could not distinguish from it, and
// so it was read as noise and left red.
//
// The fix is not to teach the check about this edge. It is that the edge should
// not exist: a policy leaf has no business importing the ranker to borrow two
// pure functions. Splitting them out makes the graph say what is true, which is
// what makes the check's answer worth reading.
//
// shortlist.ts re-exports both names, so every existing import still resolves
// and there is one definition, not two.
import { toIso2 } from "./countryCodes";

// Maps the founder-facing CAPITAL_OPTIONS values to the DB's capital_type
// enum — not 1:1, "Loans & guarantees" spans three DB values.
export const CAPITAL_SOUGHT_TO_DB: Record<string, string[]> = {
  grant: ["grant"],
  loan: ["loan", "guarantee", "counter_guarantee"],
  // SATR's own code is the combined "loan / repayable advances"
  // (StateAidInstrumentLradv, 13,729 events) -- the register does not separate
  // them, so a founder asking for a recoverable advance is pointed at that
  // same population rather than at nothing. Mapping it to a capital_type no
  // instrument carried meant the option matched zero funds and the graded
  // fallback then relaxed capital type entirely, discarding the answer.
  recoverable_advance: ["loan"],
  // `blended` used to sit here, and it is the reason a founder asking for
  // "Loans & guarantees" could not be shown a fund that pays nothing else.
  // See INDEFINITE_CAPITAL below: in this corpus `blended` is not a kind of
  // capital, it is the record of a vote that did not reach its threshold.
  equity: ["equity"],
  tax_credit: ["tax_credit"],
};

/**
 * Capital-type values that name no KIND of capital, only the outcome of a vote.
 *
 * ── The property ──────────────────────────────────────────────────────────
 * A stated capital preference may remove a fund only on EVIDENCE THAT THE FUND
 * DOES NOT PROVIDE WHAT WAS ASKED FOR. `capital_type` is one label chosen by a
 * majority vote over an instrument's own awards (`family_capital_type`,
 * ETL/events/load/populate_funding_instruments.py). `blended` is not an outcome
 * of that vote — it is what the vote emits when NOTHING reached the 60%
 * threshold, for any unresolved mixture whatever the kinds involved. It cannot
 * support removing a fund, because it does not say what the fund pays.
 *
 * ── What that cost ────────────────────────────────────────────────────────
 * `blended` was mapped to the EQUITY option and was in `accessMode.DILUTIVE`,
 * so it took an explicit request for equity to see one at all. Every `blended`
 * instrument in the corpus, checked one by one against the split vote the ETL
 * records beside each label, contains NO equity: 1,451 loan against 1,526
 * guarantee (2,977 awards, a national debt programme), three grant/loan splits,
 * two grant/tax-credit splits, two register rows stating loan and grant, one
 * with no vote. The largest was therefore visible only to founders who asked
 * for equity — the one thing it does not provide — and hidden from every
 * founder who asked for the debt it does.
 *
 * ── Why `unknown` is NOT here, though it fails the same test ──────────────
 * It fails a DIFFERENT test. `blended` is a fact we hold and were misreading;
 * `unknown` is a fact we never recorded, and the two do not have the same safe
 * default. Workstream AE priced `unknown` (8 publishable instruments, reachable
 * by no intake option) and declined to admit them for a reason that still
 * holds: among the untyped instruments are vehicles named "portfolio" and
 * "investments", and three of their typed siblings carry `equity`. Admitting
 * them to a grant-seeker's pool could put a cap-table investor in front of
 * someone who never asked for one, which is precisely what
 * `passesCapitalPreference` exists to prevent. An unresolved MIXTURE we can
 * enumerate is safe to admit; an unresolved BLANK is not.
 *
 * So `unknown` stays unreachable and stays a ratchet in
 * `check_capital_reach.ts`, whose own note says the honest fix is upstream in
 * the ETL. This constant deliberately does not overrule that.
 *
 * ── Why a set of values and not a list of instruments ─────────────────────
 * The test is on what the LABEL asserts, so a capital type this file has never
 * seen is handled by its own classification rather than by being named here.
 */
export const INDEFINITE_CAPITAL = new Set(["blended"]);

export function instrumentServesCountry(instrumentCountry: string, founderCountries: string[]): boolean {
  if (!founderCountries.length) return true;      // no info yet — don't over-filter
  if (instrumentCountry === "EU") return true;     // EU-wide instruments always in play
  return founderCountries.some((c) => toIso2(c) === instrumentCountry);
}

export function instrumentServesCapital(instrumentCapitalType: string, capitalSought: string[]): boolean {
  if (!capitalSought.length) return true;
  // A label that names no kind cannot contradict what the founder asked for.
  // See INDEFINITE_CAPITAL: this is the difference between "this fund does not
  // pay grants" and "the vote about what this fund pays produced no answer",
  // which the old `allowed.has(...)` test collapsed into the same result.
  //
  // Note what is deliberately NOT done here: an UNMAPPED value does not get the
  // same treatment. Making it silence would be the more general-looking rule
  // and it would disarm `check_capital_reach.ts`, whose whole job is to fail
  // the build when a new capital type reaches no founder. A value nobody has
  // classified must be loud, not quietly admitted.
  if (INDEFINITE_CAPITAL.has(instrumentCapitalType)) return true;
  const allowed = new Set(capitalSought.flatMap((c) => CAPITAL_SOUGHT_TO_DB[c] ?? []));
  return allowed.size === 0 || allowed.has(instrumentCapitalType);
}

/** Every capital type some intake option admits. Derived from the option map
 *  rather than restated, so the two cannot drift. */
export const KNOWN_CAPITAL_TYPES = new Set(Object.values(CAPITAL_SOUGHT_TO_DB).flat());
