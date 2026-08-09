/**
 * A filter that can reject an answer must be able to accept one.
 *
 * FREE — no model calls, no network, no credentials. Reads the committed
 * corpus snapshot, which is the same file the site falls back to.
 *
 * ── The defect ────────────────────────────────────────────────────────────
 * `region` is evaluable through exactly one operator. `region_within` is the
 * only branch of `evaluateSpec` that calls `regionsOverlap`, and therefore the
 * only one that knows NUTS ids are a hierarchy. One gate carried
 *
 *     {"op":"in","field":"region","allowed":["Sweden"]}   "Applicant must be a
 *                                                          Swedish company"
 *
 * A founder answers `region` with a NUTS id — the sanitiser enforces it,
 * `pickRegion` rejects anything `regionNameFor` does not know — so "SE11" was
 * compared as a string against "Sweden" and the rule could never be true. It
 * could, however, be FALSE, for every Swedish founder who answered the
 * question. `region` is structural and the gate was cited, so one false was
 * conclusive: `assessInstrument` returned `blocked`, and blocked never reaches
 * the founder. The fund was hidden from exactly the applicants it admits.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     No encoded filter may be able to REJECT an answer it can never ACCEPT.
 *
 * Formally, over the answers a founder can actually give for the field: if any
 * of them makes the comparator false, at least one of them must make it true.
 * A comparator that only ever rejects is not a filter, it is a hidden
 * disqualification with an eligibility rule's face on.
 *
 * The line is drawn at REJECTION rather than at inertness because that is
 * where comparator.ts itself draws it: null is "not assessable" and never a
 * blocker, false hides a fund. An all-null comparator wastes an extraction; an
 * only-false comparator costs a founder a fund they qualify for. Both are
 * counted here, and the second fails the build. See INERT_CEILING for why the
 * first is a ratchet rather than a pass.
 *
 * ── Derived, never restated ───────────────────────────────────────────────
 * Which operators can act on which field is NOT a table in this file. It is
 * computed by RUNNING the product's own two functions:
 *
 *   sanitizeEligibility  decides what counts as an answer to a field. It is
 *       the one whitelist between a real request and the evaluator, so a
 *       candidate that does not survive it is not an answer a founder can give
 *       — which is exactly what disqualified "Sweden" as a `region`.
 *   evaluateSpec         decides what the comparator does with it. Adding an
 *       operator to comparator.ts, or widening one, changes this check's
 *       verdict on the next run with no edit here.
 *
 * The candidate answers come from the corpus and the vocabulary, never from a
 * list written out here: the values the spec itself names, the field's own
 * vocabulary, every NUTS id for a field that takes one, the numbers around a
 * numeric threshold, and one string belonging to none of them (so that
 * `not_in` on a free-text field is satisfiable the way it really is). Anything
 * the sanitiser then throws away is not a candidate.
 *
 * ── Why it reads the snapshot, not Postgres ───────────────────────────────
 * A check whose input can be absent passes vacuously, and that is how a script
 * deleted 141 correct filters and exited 0. `instrument_terms.json` is
 * committed, so this check cannot be skipped by a runner without a database,
 * and it fails outright if the file yields no filters at all. Agreement
 * between the snapshot and Postgres is a different property, already asserted
 * by check_hydration_parity and check_corpus_census.
 */
import { readFileSync } from "fs";
import path from "path";
import { evaluateSpec, type ValueSpec } from "../lib/intelligence/comparator";
import { VOCABULARY } from "../lib/intelligence/vocabulary";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import { FIELD_ENUM_HINTS } from "../lib/intelligence/types";
import { REGIONS_BY_COUNTRY } from "../lib/intelligence/regions.generated";

/**
 * Comparators that produce no verdict at all, for any answer.
 *
 * They are inert, not harmful — `evaluateSpec` returns null and null is never
 * a blocker — and they are the standing business of the reach family of
 * checks: check_gate_field_reach fails the frozen band orders that cause most
 * of them, and reband_ticket_gates.py is the pass that clears them. Failing
 * here as well would put two guards permanently red for one cause.
 *
 * So the count ratchets instead. It may fall, never rise: a new inert
 * comparator is a new encoder that cannot express its field, which is the
 * defect this whole workstream is about, and it must not arrive quietly.
 *
 * It stood at 58 when this check was written and fell to 45 when
 * reband_ticket_gates.py was finally applied to both stores. Lower it when it
 * falls again; never raise it.
 */
const INERT_CEILING = 45;

const SYNTHETIC_STRING = "a-value-no-comparator-names";

const corpusPath = path.join(process.cwd(), "public", "data", "instrument_terms.json");

interface Gate {
  requirement?: string;
  gateRole?: string | null;
  valueSpec?: Record<string, unknown> | string | null;
}
interface Record_ { id: string; name?: string; gates?: Gate[] }

const isMulti = (field: string) => Boolean(VOCABULARY[field]?.multi);

/** Every value a comparator names, whichever key it names them under. */
function namedValues(spec: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  if (Array.isArray(spec.allowed)) out.push(...spec.allowed);
  for (const key of ["value", "maxAllowed", "minAllowed"]) {
    if (spec[key] !== undefined) out.push(spec[key]);
  }
  return out;
}

/** The field's own declared vocabulary, wherever the product declares it. */
function declaredValues(field: string): unknown[] {
  const vocab = VOCABULARY[field];
  if (vocab?.values.length) return [...vocab.values];
  if (field in REGION_FIELDS) return REGION_FIELDS[field];
  const hint = FIELD_ENUM_HINTS[field];
  if (hint?.options?.length) return hint.options.map((o) => o.value);
  return [];
}

/** Region ids are not a fixed VOCABULARY list — the options are derived per
 *  founder from their country — so they are read from the same generated table
 *  `regionsOverlap` and `pickRegion` match against. */
const REGION_FIELDS: Record<string, string[]> = {
  region: Object.values(REGIONS_BY_COUNTRY).flatMap((rs) => rs.map((r) => r.id)),
};

/** Numbers worth trying, drawn from the comparator's own threshold: a numeric
 *  operator is satisfiable exactly when a number on the right side of its
 *  bound is an answer the field accepts. */
function numericCandidates(spec: Record<string, unknown>): number[] {
  const t = spec.threshold;
  if (typeof t !== "number") return [];
  return [t, t + 1, t - 1];
}

/** The answers a founder could really give for this field, out of everything
 *  worth trying — decided by the sanitiser, which is the whitelist every real
 *  request passes through. */
function admissibleAnswers(field: string, spec: Record<string, unknown>): unknown[] {
  const tried = [
    ...namedValues(spec),
    ...declaredValues(field),
    ...numericCandidates(spec),
    SYNTHETIC_STRING,
  ];
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const v of tried) {
    const key = `${typeof v}:${String(v)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const probe = isMulti(field) ? [v] : v;
    const kept = (sanitizeEligibility({ [field]: probe }) ?? {}) as Record<string, unknown>;
    const got = kept[field];
    const survived = Array.isArray(probe)
      ? Array.isArray(got) && (got as unknown[]).includes(v)
      : got === v;
    if (survived) out.push(probe);
  }
  return out;
}

const records = (JSON.parse(readFileSync(corpusPath, "utf8")).records ?? []) as Record_[];

const rejectionOnly: string[] = [];
const inert: { field: string; op: string }[] = [];
let filters = 0;
let unprobeable = 0;

for (const rec of records) {
  for (const gate of rec.gates ?? []) {
    // Only filters. `aid_intensity` describes the money, not the applicant,
    // and isFilter() admits gateRole 'filter' or unset.
    if (gate.gateRole && gate.gateRole !== "filter") continue;
    const spec = (typeof gate.valueSpec === "string"
      ? JSON.parse(gate.valueSpec)
      : gate.valueSpec) as Record<string, unknown> | null;
    if (!spec || typeof spec.field !== "string") continue;
    const field = spec.field;
    filters += 1;

    const answers = admissibleAnswers(field, spec);
    if (!answers.length) {
      // No candidate survives the sanitiser, so nothing here can be proved
      // either way. An unprovable comparator is not a passing one.
      unprobeable += 1;
      rejectionOnly.push(
        `  UNPROVABLE  ${rec.id} — ${JSON.stringify(spec)}\n` +
        `      No value this check can construct is an admissible answer to ` +
        `"${field}", so whether the rule can ever be satisfied cannot be shown.`);
      continue;
    }
    let canAccept = false;
    let canReject = false;
    for (const a of answers) {
      const r = evaluateSpec(spec as unknown as ValueSpec, a);
      if (r === true) { canAccept = true; break; }
      if (r === false) canReject = true;
    }
    if (canAccept) continue;
    if (canReject) {
      rejectionOnly.push(
        `  REJECTS EVERYONE  ${rec.id} — ${JSON.stringify(spec)}\n` +
        `      ${(gate.requirement ?? "").slice(0, 100)}\n` +
        `      No answer a founder can give to "${field}" satisfies this, and ` +
        `some make it false. Every founder who answers the question is ` +
        `disqualified by a rule that admits nobody.`);
    } else {
      inert.push({ field, op: String(spec.op) });
    }
  }
}

console.log(`check_comparator_admits: ${filters} encoded filters in ` +
            `${path.relative(process.cwd(), corpusPath)}`);

// Non-vacuity. The corpus is committed, so an empty read means the file moved
// or the export broke — either way this check has proved nothing and must say
// so rather than exit 0.
if (!filters) {
  console.error("\nFAIL — no encoded filters were read. This check proved " +
                "nothing; the corpus snapshot is missing or empty.");
  process.exitCode = 1;
} else if (rejectionOnly.length) {
  console.error(`\nFAIL — ${rejectionOnly.length} comparator(s) can reject an ` +
                `answer they can never accept:`);
  for (const line of rejectionOnly) console.error(line);
  console.error(
    "\nA structural, cited one of these makes assessInstrument return " +
    "'blocked', and blocked never reaches the founder. Reroute the rule to a " +
    "field that can express it (ETL/terms/encode_regions.py refile-national) " +
    "or drop the comparator.");
  process.exitCode = 1;
} else {
  const byPair = new Map<string, number>();
  for (const i of inert) {
    const k = `${i.field} ${i.op}`;
    byPair.set(k, (byPair.get(k) ?? 0) + 1);
  }
  console.log(`  ${inert.length} inert comparator(s) — no answer produces any ` +
              `verdict, so they never block anyone (ceiling ${INERT_CEILING}):`);
  for (const [k, n] of [...byPair].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(3)}  ${k}`);
  }
  if (inert.length > INERT_CEILING) {
    console.error(`\nFAIL — inert comparators rose to ${inert.length}, above ` +
                  `the ceiling of ${INERT_CEILING}. Something is writing ` +
                  `comparators whose operator cannot act on their field. Fix ` +
                  `the encoder, do not raise the ceiling.`);
    process.exitCode = 1;
  } else {
    if (unprobeable) console.log(`  ${unprobeable} unprobeable`);
    console.log("  PASS — every encoded filter that can reject an answer can " +
                "also accept one.");
  }
}
