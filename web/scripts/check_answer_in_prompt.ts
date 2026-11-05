/**
 * An answer we collect must reach the MODEL that writes the brief.
 *
 * FREE, OFFLINE. No credentials, no database, no model call. It builds two
 * strings and reads them.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 * `check_gate_field_reach.ts` asks whether an answer can reach the evaluator.
 * `check_answer_reach.ts` asks whether anything then DOES something with it,
 * and proves that against the ROWS. Neither can see the last consumer, and on
 * this product it is the decisive one: no model ranks today, so the writer is
 * the de facto selector, and what the writer knows about the founder is one
 * string built in one function.
 *
 * That string was a hand-kept list of twenty lines, and on 2026-08-18 it was
 * short of SEVEN intake fields — `sector`, `useOfFunds`, `region`,
 * `activities`, `exclusionFlags`, `institutionalOwner` and `balanceBand`.
 * Three of those are the fields `ANSWER_USE` declares `ranks: true` and all
 * three are asked on SCREEN ONE. The block is headed AUTHORITATIVE, so their
 * absence is not "unmentioned": it is missing from the one place the writer is
 * instructed to trust. `sector` and `useOfFunds` are by name the two answers
 * `tableInputFromAnswers` was written to stop losing — the ranking half of that
 * repair landed and the prompt half did not.
 *
 * Nothing threw, then or since. It produced a slightly worse brief, which is
 * the failure mode that survives longest.
 *
 * ── The property ──────────────────────────────────────────────────────────
 *     For every field of EligibilityAnswers, there is an answer a founder can
 *     really give for which the field's value appears in the founder-facts
 *     block each model-facing stage is handed.
 *
 * A property with a test, not a register. No field is enumerated here: the list
 * is `keyof EligibilityAnswers` via `ANSWER_LABEL`, which the compiler keeps
 * exhaustive, and the answers tried come from the product's own vocabulary. A
 * field added to the intake tomorrow is in scope the day someone gives it a
 * label.
 *
 * ── The three exemptions, and why each expires ────────────────────────────
 * `FIELD_REACH` already says which fields nothing can answer. A block cannot
 * be blamed for omitting a value that can never exist, so `unreachable` and
 * `staged` fields are skipped HERE and owned by `check_gate_field_reach.ts` and
 * by the arm's own env var. Both exemptions are read off the declaration rather
 * than written down, so the day a staged field is switched on it is graded like
 * any other.
 *
 *   npx tsx scripts/check_answer_in_prompt.ts
 */
import { knownFacts, sayIntakeValue } from "../lib/intelligence/knownFacts";
import { scopingProfileBlock, PROFILE_BLOCK } from "../lib/intelligence/pipeline";
import {
  ANSWER_LABEL, FIELD_REACH, FIELD_VALUE_DOMAIN, type EligibilityAnswers,
} from "../lib/intelligence/types";
import { VOCABULARY } from "../lib/intelligence/vocabulary";

// Pinned OFFLINE, deliberately, because the header above says this run needs no
// credentials and nothing enforced it. Every module below reads DATABASE_URL and
// VOYAGE_KEY lazily, inside the functions that use them, so destroying them here
// is what makes the claim true rather than merely stated: with the keys present
// this would have ranked on pgvector against Postgres and printed a number
// indistinguishable from the offline one it advertises.
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;


/** One answer a founder could really give for this field, drawn from the
 *  product's own vocabulary, from `FIELD_REACH.sample` for the fields that
 *  have no enumerable one, and never invented here. A field this cannot
 *  probe FAILS rather than being skipped: the fields with no fixed answer set
 *  are precisely the ones that have broken (`region` was asked, answered and
 *  dropped for as long as it existed, with a green build throughout). */
function sampleFor(field: keyof EligibilityAnswers): unknown | undefined {
  const declared = FIELD_REACH[field].sample;
  if (declared !== undefined) return declared;
  const vocab = VOCABULARY[field as string];
  if (!vocab?.values.length) return undefined;
  const v = vocab.values[vocab.values.length - 1];
  return vocab.multi ? [v] : v;
}

/** Does the block state this field's value at all?
 *
 *  Matched through `sayIntakeValue` — the product's OWN rendering of that value
 *  — rather than against the raw token or a guess at the wording. A guard that
 *  greps for the raw token fails on every field we print as a human label
 *  (`b50m_plus` renders as "EUR 50M+"), and one that greps for a label written
 *  out here is a second copy of a rendering, which is the defect class this
 *  file exists to catch. Rewording a label therefore keeps this green, and
 *  DROPPING a field turns it red — which is the split that matters. */
function statesValue(block: string, field: keyof EligibilityAnswers, sample: unknown): boolean {
  const hay = block.toLowerCase();
  return (Array.isArray(sample) ? sample : [sample])
    .every((v) => hay.includes(sayIntakeValue(field, v).toLowerCase()));
}

function main() {
  const fields = (Object.keys(ANSWER_LABEL) as (keyof EligibilityAnswers)[]);
  const answers: EligibilityAnswers = {};
  const skipped: string[] = [];
  const unprobeable: string[] = [];

  for (const f of fields) {
    const via = FIELD_REACH[f].via;
    // Nothing can put a value here, or nobody is asked it yet. Owned by
    // check_gate_field_reach and by the arm's env var; grading it here would
    // report a second copy of that finding as a new one.
    if (via === "unreachable" || via === "staged") { skipped.push(`${f} (${via})`); continue; }
    const s = sampleFor(f);
    if (s === undefined) { unprobeable.push(f); continue; }
    (answers as Record<string, unknown>)[f] = s;
  }

  // Exactly the shape a route hands the pipeline, and nothing more: a probe
  // carrying a field no request can carry grades a prompt no founder sees.
  // `targetMarkets: ["Germany"]` was here until wsIK removed the field.
  const req = {
    company: "Probe GmbH", country: "Germany", description: "",
    companyType: undefined,
  };
  const blocks: [string, string][] = [
    ["memo writer (scoping profile)", scopingProfileBlock(answers)],
    ["adaptive round (known facts)", knownFacts(req, answers)],
  ];

  console.log(`check_answer_in_prompt — PROFILE_BLOCK=${PROFILE_BLOCK}\n`);
  if (skipped.length) console.log(`  not asked, so out of scope: ${skipped.join(", ")}`);

  let bad = 0;
  if (unprobeable.length) {
    console.error(`\n  NO PROBE ANSWER for: ${unprobeable.join(", ")}`);
    console.error("  A guard must not skip its own hard cases. Give the field a "
      + "`sample` in FIELD_REACH.");
    bad += unprobeable.length;
  }

  for (const [name, block] of blocks) {
    const missing = fields.filter((f) =>
      (answers as Record<string, unknown>)[f] !== undefined
      && !statesValue(block, f, (answers as Record<string, unknown>)[f]));
    const n = fields.filter((f) => (answers as Record<string, unknown>)[f] !== undefined).length;
    console.log(`\n  ${name}: ${n - missing.length}/${n} answered field(s) stated`);
    if (missing.length) {
      bad += missing.length;
      for (const f of missing) {
        console.error(`    MISSING  ${f}  (${ANSWER_LABEL[f]}, domain `
          + `${FIELD_VALUE_DOMAIN[f]}, asked ${FIELD_REACH[f].via})`);
      }
    }
  }

  if (bad) {
    console.error(`\ncheck_answer_in_prompt: ${bad} answer(s) the intake collects `
      + `never reach a model that reads them.\n`
      + `  A question we ask and an answer we do not forward is worse than a\n`
      + `  question we do not ask: the founder pays for it either way and the\n`
      + `  brief is written as if they had declined. Render the block from\n`
      + `  ANSWER_LABEL (see knownFacts.ts) rather than from a list.`);
    process.exitCode = 1;
    return;
  }
  console.log("\n  OK — every answered field reaches every model-facing block.");
}

main();
