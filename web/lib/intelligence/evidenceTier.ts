/**
 * WHAT A GATE IS ALLOWED TO DO TO A FOUNDER. THE definition — one place.
 *
 * Two questions, and the pair of them is the whole test for whether a single
 * encoded rule may end a conversation on its own:
 *
 *   isCited      — is the rule traceable to the fund's own text?
 *   isStructural — is failing it a fact about the company, not a choice?
 *
 * A gate that is both is CONCLUSIVE: `assessInstrument` calls the instrument
 * `blocked` on one of them, and `accessiblePool` then deletes the row without
 * telling the founder it existed. Everything else narrows, explains, or waits.
 *
 * ── Why this is a leaf, and what the extraction bought ────────────────────
 * Both predicates lived in verdict.ts, which imports corpus.ts. That put them
 * out of reach of corpus.ts itself — and corpus.ts is where gate INHERITANCE
 * is decided, which is precisely a place that needs to ask "would this rule
 * end the conversation?" before handing it down. The alternative was to
 * restate an evidence tier there, and a second definition of an evidence tier
 * is the defect this repo has already paid for three times (see
 * evidenceTiers.json).
 *
 * So: no imports that reach fs or pg, and no import of corpus.ts. Same shape,
 * and the same reason, as ./nameEvidence.ts and ./countryCodes.ts — a leaf can
 * be asked a question without dragging its dependencies along. See
 * lib/intelligence/ARCHITECTURE.md and scripts/check_client_boundary.ts.
 */
import EVIDENCE_TIERS from "./evidenceTiers.json";
import { fieldSeverity } from "./types";

/**
 * Can this founder do anything about a failed rule?
 *
 * ── Why severity, not arithmetic ───────────────────────────────────────────
 * `blocked` used to mean "two or more filters failed". The median publishable
 * instrument carries TWO filters in total, so failing the single most
 * disqualifying rule it has — establishment, headcount, an excluded activity —
 * left the fund published with a polite note. Every out-of-scope company in
 * the red-team set got a full table that way: a US business with no European
 * entity was offered German state aid, and a 40,000-person corporate was
 * offered SME-only lanes.
 *
 * What makes a failure fatal is not how many friends it has. It is whether the
 * founder could turn up differently. Where they are established, how many
 * people they employ, what they sell, who owns them: not this quarter. Whether
 * they will run a consortium, co-finance a quarter of the cost, or open a
 * local entity: a decision, and the brief exists to put that decision in front
 * of them.
 *
 * Read off the intake field the gate is encoded against, so it holds for
 * instruments and countries nobody has looked at yet.
 *
 * The classification itself lives with the fields in types.ts, keyed so the
 * compiler demands it for every intake field. Keeping it in the verdict engine
 * made it a list that engine happened to hold, which a new field could quietly
 * miss.
 */

/** True when failing this rule is a fact about the company, not a choice. */
export function isStructural(field: string): boolean {
  return fieldSeverity(field) === "structural";
}

/** The minimum a gate must expose to be tiered, so Postgres rows, the JSON
 *  snapshot and a hand-built fixture can all satisfy it. Structural rather
 *  than `Pick<DbGate, ...>`, because naming DbGate here would import the
 *  module this one exists to stay out of. */
export interface EvidenceFacts {
  verificationLevel?: string | null;
  /** True when this row is being judged by somebody else's document — a rule
   *  handed down from a register bucket rather than a rulebook. Set by
   *  `mergeInheritedGates` in corpus.ts, which is the only place that knows
   *  whose row the rule is landing on. See the property stated there. */
  borrowed?: boolean;
}

/** Everything needed to say what a gate MAY DO, and nothing else about it. */
export interface GateFacts extends EvidenceFacts {
  gateRole?: string | null;
  valueSpec?: unknown | null;
}

/** The intake field a gate's spec is written against — never `intakeField`,
 *  which the bulk extractor owns and overwrites. */
export function specField(gate: GateFacts): string | undefined {
  const f = (gate.valueSpec as { field?: unknown } | null | undefined)?.field;
  return typeof f === "string" && f ? f : undefined;
}

/** May this gate decide a verdict at all? */
export function isFilter(gate: GateFacts): boolean {
  // Untriaged gates (gateRole undefined) are still honoured, so the system
  // degrades safely while encoding coverage grows.
  return (!gate.gateRole || gate.gateRole === "filter") && Boolean(gate.valueSpec);
}

/**
 * Rules traceable to the fund's own text.
 *
 * ── Why disqualification needs this second test ───────────────────────────
 * Severity says whether a founder COULD answer differently. It says nothing
 * about whether we are right that the rule exists.
 *
 * Most of the corpus outside state aid carries `llm_classified` gates: a
 * generic five-rule stub per instrument, inferred rather than read off a
 * document. The content is usually sound — ADEME's says "must be registered
 * or operating in France", which is certainly true — but it is not quotable,
 * and it was never encoded, so the largest French development bank has never
 * once been filtered by country.
 *
 * Refusing to encode uncited rules leaves those instruments permanently
 * unknown, which is its own failure: the brief publishes them without any idea
 * whether the founder qualifies. Encoding them and letting them disqualify is
 * worse — it would close a fund to a founder on the strength of a sentence we
 * cannot show them.
 *
 * So uncited rules NARROW but never CONDEMN. A failing uncited rule is a named
 * obstacle with its source stated; only a rule we can point at in the fund's
 * own text can end the conversation.
 *
 * ── "THE FUND'S OWN" IS A FACT ABOUT THE PAIR, NOT ABOUT THE GATE ────────
 * A tier is earned against a document, and a document belongs to a row. Hand
 * the same gate down to a sibling and the quote is still real, but it is no
 * longer in the text the founder is reading — it is hearsay about them. That
 * is what `borrowed` records, and it is why this predicate reads it: the answer
 * to "may this rule end the conversation" cannot be right if it is computed
 * from the rule alone. See `mergeInheritedGates` in corpus.ts for whose rules
 * get it and for the sixteen founders it cost.
 */
// Read from evidenceTiers.json, not written out here. The same policy used to
// live as this Set and as a Python tuple in embed_eligibility.py, and they
// diverged the day `register_derived` was added: the row showed those gates
// while the embedder refused to embed them, so the advisor could display a fact
// it could not retrieve. One file, both languages.
const CITED = new Set(EVIDENCE_TIERS.cited.tiers);

export function isCited(gate: EvidenceFacts): boolean {
  if (gate.borrowed) return false;
  return CITED.has(gate.verificationLevel ?? "");
}

/**
 * `register_derived` is a third thing, and the reason it exists is that neither
 * existing tier describes it honestly.
 *
 * It is not cited: a GBER article inferred from a scheme's award history is a
 * majority vote (the floor is 50%, and a typical carrier is 43 of 64 awards),
 * so it describes what the scheme HAS funded, never what it requires. Calling
 * it cited would let it read as the fund's own eligibility rule.
 *
 * But it is not a model inference either, which is what `inventory_inferred`
 * connotes and what the narrowing rules above are calibrated for. The
 * aid_objective code is filed per award by the granting authority itself in the
 * SATR transparency register. That provenance is stronger than an extraction.
 *
 * So it is attributable-but-not-cited: good enough to state as a fact about how
 * the instrument is structured, not good enough to judge a founder by. It is
 * read by structuringNotes and by nothing else.
 *
 * These gates DO carry a valueSpec — the statutory aid-intensity ceiling the
 * article implies — so what keeps them out of verdicts is gateRole, not the
 * absence of a spec. `aid_intensity` describes the money, never the applicant,
 * and `isFilter()` in verdict.ts admits only gateRole='filter'.
 * evidenceTier.test.ts pins that, because the day an aid_intensity spec becomes
 * a filter is the day a founder is disqualified by a majority vote.
 */
const ATTRIBUTABLE = new Set(EVIDENCE_TIERS.attributable.tiers);

export function isAttributable(gate: EvidenceFacts): boolean {
  return ATTRIBUTABLE.has(gate.verificationLevel ?? "");
}

/**
 * WOULD THIS ONE RULE, ON ITS OWN, END THE CONVERSATION?
 *
 * The three questions above asked as the single one every caller actually has.
 * A filter that is cited and lands on a structural field is the only kind
 * `assessInstrument` calls `blocked` off a single failure — and `blocked` is
 * not a demotion: `accessiblePool` deletes the row, so the founder never learns
 * the fund existed. Every other gate narrows, explains or waits.
 *
 * It is the question a caller asks when it is about to APPLY a rule to somebody
 * rather than evaluate it, which is why it lives beside the tiers rather than
 * inside the verdict engine. `mergeInheritedGates` in corpus.ts is the first
 * such caller.
 */
export function isConclusive(gate: GateFacts): boolean {
  const field = specField(gate);
  return field !== undefined && isFilter(gate) && isCited(gate) && isStructural(field);
}
