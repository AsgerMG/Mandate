// Per-instrument qualification: can THIS founder actually walk through THIS
// door, and if not, what is the one thing in the way?
//
// Runs on the curated gate layer written by ETL/terms/encode_gates.py — only
// gates triaged as `filter` and carrying a machine-readable `valueSpec`.
// Obligations ("works must not start before the grant decision") and programme
// facts ("aid intensity capped at 20%") are excluded: together they are half
// the corpus, and neither says anything about who qualifies.
//
// ── The asymmetry this is built around ────────────────────────────────────
// 1,018 of 1,088 instruments carry at least one encoded filter (99.7% of
// corpus euros, Postgres 2026-08-13), and the median one carries THREE. Those
// figures have moved a long way — the line here read "146 instruments, 88.2%
// of euros, median TWO" from an encoding pass seven times smaller — and the
// asymmetry below is unaffected, because it is about what a HANDFUL of rules
// can and cannot prove, and three is still a handful against a real rulebook:
//
//   * Failing a filter is CONCLUSIVE. "Must be a Swedish startup" fails a
//     German company no matter how few other rules we happen to have encoded.
//   * Passing the filters we happen to hold is NOT proof of qualification.
//     Two passed rules out of a real rulebook of thirty means "nothing we can
//     check rules you out" — which is a genuinely useful thing to say, but it
//     is not "you qualify".
//
// So the vocabulary is deliberately asymmetric: we say a door is OPEN (nothing
// disqualifies you), never that you are approved. Overclaiming here is the one
// failure that would cost a founder months.
import EVIDENCE_TIERS from "./evidenceTiers.json";
import { loadDbInstruments, type DbGate, type DbInstrument } from "./corpus";
import { evaluateSpec, type ValueSpec } from "./comparator";
import { fieldSeverity, type EligibilityAnswers } from "./types";

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
 * compiler demands it for every intake field. Keeping it here made it a list
 * this engine happened to hold, which a new field could quietly miss.
 */

/** True when failing this rule is a fact about the company, not a choice. */
export function isStructural(field: string): boolean {
  return fieldSeverity(field) === "structural";
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
 */
// Read from evidenceTiers.json, not written out here. The same policy used to
// live as this Set and as a Python tuple in embed_eligibility.py, and they
// diverged the day `register_derived` was added: the row showed those gates
// while the embedder refused to embed them, so the advisor could display a fact
// it could not retrieve. One file, both languages.
const CITED = new Set(EVIDENCE_TIERS.cited.tiers);

export function isCited(gate: Pick<DbGate, "verificationLevel">): boolean {
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
 * and isFilter() admits only gateRole='filter'. evidenceTier.test.ts pins that,
 * because the day an aid_intensity spec becomes a filter is the day a founder
 * is disqualified by a majority vote.
 */
const ATTRIBUTABLE = new Set(EVIDENCE_TIERS.attributable.tiers);

export function isAttributable(gate: Pick<DbGate, "verificationLevel">): boolean {
  return ATTRIBUTABLE.has(gate.verificationLevel ?? "");
}

export type VerdictStatus =
  /** Nothing we can check rules this founder out. */
  | "open"
  /** Exactly one filter fails, and it is curable. Worth showing WITH the fix. */
  | "one_blocker"
  /** Conclusively out. Never shown to the founder. */
  | "blocked"
  /** No encoded filter could be evaluated — we have nothing to say either way. */
  | "unknown";

export interface Blocker {
  /** Verbatim requirement text, for the "what would change it" line. */
  requirement: string;
  field: string;
  /** True only for llm_2pass/human_verified gates: assertable as fact. */
  verified: boolean;
  /** Traceable to the fund's own text. Only a cited rule may disqualify. */
  cited: boolean;
}

export interface InstrumentAssessment {
  instrumentId: string;
  status: VerdictStatus;
  /** Filters we could actually evaluate (spec present AND answer given). */
  checked: number;
  passed: number;
  blockers: Blocker[];
}

function isFilter(g: DbGate): boolean {
  // Untriaged gates (gateRole undefined) are still honoured, so the system
  // degrades safely while encoding coverage grows.
  return (!g.gateRole || g.gateRole === "filter") && Boolean(g.valueSpec);
}

/** Exported for unit tests: this is the real decision boundary, and testing
 *  it through assessAll would require loading the whole corpus. */
export function assessInstrument(
  inst: DbInstrument,
  answers: EligibilityAnswers | undefined,
): InstrumentAssessment {
  const base: InstrumentAssessment = {
    instrumentId: inst.id, status: "unknown", checked: 0, passed: 0, blockers: [],
  };
  if (!answers) return base;

  for (const gate of inst.gates) {
    if (!isFilter(gate)) continue;
    const spec = gate.valueSpec as ValueSpec | null;
    if (!spec?.field) continue;
    const answer = (answers as Record<string, unknown>)[spec.field];
    const result = evaluateSpec(spec, answer);
    if (result === null) continue; // unanswered or unevaluable — never a failure
    base.checked += 1;
    if (result) base.passed += 1;
    else base.blockers.push({
      requirement: gate.requirement, field: spec.field,
      verified: gate.verified, cited: isCited(gate),
    });
  }

  // One structural failure is conclusive. Two curable ones are a conversation.
  //
  // ── "TWO" MEANS TWO THINGS IN THE WAY, NOT TWO GATE ROWS (wsGE) ──────────
  //
  // The arithmetic clause counted BLOCKERS, and a blocker is one gate row. An
  // instrument that encodes one requirement twice therefore produced two
  // blockers off one requirement and condemned itself, and the founder was
  // told nothing because `accessiblePool` deletes a blocked row.
  //
  // The property: the ladder counts how many DISTINCT THINGS stand between
  // this founder and this fund, and the unit of a "thing" is the intake field.
  // It is the unit the founder answers in, the unit "what would change it" is
  // written in, and the unit they could turn up differently on. A founder
  // cannot fix their ticket band twice.
  //
  // The test for a case nobody has seen: an instrument carrying three
  // `entityCountries` gates, all failing for a founder established elsewhere,
  // is ONE thing in the way — where they are established — not three. It still
  // blocks, on severity, because establishment is structural and cited; what
  // changes is that it no longer blocks BY COUNTING.
  //
  // ── What it costs and what it buys, measured ─────────────────────────────
  // 820 held-out described founders, one per company, replayed through the
  // shipped build (scripts/_wsge_attribution.ts, arms in
  // scripts/_wsge_counterfactual.ts). The won fund was in the accessible pool
  // for 74.8% of them. 105 of the 184 losses were ONE field encoded twice with
  // both encodings failing, and nothing else against the fund:
  //
  //     as-is (count gate rows)      74.8%
  //     by-field (this change)       87.6%
  //     severity only (delete the
  //       arithmetic clause)         88.7%   — 9 more founders, and it would
  //                                            let five unrelated failures pass
  //
  // ██ 96 OF THOSE 105 ARE ONE FUND. ██ `innovate_uk` carries `G3-01` and
  // `G3-02`, byte-identical ticketBand specs, and it is the re-attribution
  // target for the whole GtR population — 109 of 820 founders, none of whom
  // could be recalled. Deleting that one duplicated row in Postgres would earn
  // most of the same points. This is the code half deliberately: the duplicate
  // is a shape the corpus PRODUCES rather than one bad row, and a ladder that
  // miscounts it will keep costing funds nobody has replayed yet.
  //
  // Re-derived against Postgres 2026-08-13, and the residue is still there:
  // 1,312 surplus same-field filter rows across 397 instruments, of which 606
  // are BYTE-IDENTICAL value specs across 265 instruments and the remaining 706
  // are two different specs on one field. Only the identical ones are
  // unambiguously deletable; the rest need a human to say whether they are one
  // requirement written twice or two the encoder should have merged. wsGE's
  // "668 across ~470" counted differently and is not comparable — the query
  // that produced these three numbers is in the wsGL evidence file.
  //
  // What would prove this wrong: an instrument where two gates on ONE field
  // encode two INDEPENDENT requirements a founder could satisfy separately.
  // Two `activities` exclusions — coal and tobacco — look like that case, and
  // are not: the founder gives one `activities` answer and it either clears
  // the fund's exclusions or it does not. If such a case is ever found, the
  // repair is to split the field, not to go back to counting rows.
  const structural = base.blockers.filter((b) => isStructural(b.field) && b.cited);
  const fieldsInTheWay = new Set(base.blockers.map((b) => b.field)).size;
  if (base.checked === 0) base.status = "unknown";
  else if (base.blockers.length === 0) base.status = "open";
  else if (structural.length > 0) base.status = "blocked";
  else if (fieldsInTheWay === 1) base.status = "one_blocker";
  else base.status = "blocked";
  return base;
}

export function assessAll(
  instrumentIds: string[],
  answers: EligibilityAnswers | undefined,
): Map<string, InstrumentAssessment> {
  const ids = new Set(instrumentIds);
  const out = new Map<string, InstrumentAssessment>();
  for (const inst of loadDbInstruments()) {
    if (ids.has(inst.id)) out.set(inst.id, assessInstrument(inst, answers));
  }
  return out;
}

/** Display order: doors that are open, then doors with one thing in the way,
 *  then instruments we cannot assess. `blocked` never reaches the founder. */
export const VERDICT_RANK: Record<VerdictStatus, number> = {
  open: 0, one_blocker: 1, unknown: 2, blocked: 3,
};

