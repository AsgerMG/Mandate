/**
 * EVERY CHANNEL THE SELECTOR CAN OFFER MUST BE REPRESENTABLE IN THE PRIOR, AND
 * A CHANNEL A CELL NEVER OBSERVED MUST NOT READ AS ONE IT MEASURED AT ZERO.
 *
 * ── The defect ─────────────────────────────────────────────────────────────
 * `channelPrior.generated.json` shipped holding 9 of the corpus's 11 channels.
 * `national_dev_banks` -- 111k events, the won channel of 471 of the funnel's
 * 897 founders -- and `eib` were in none of its 200 cells, because both arms of
 * the emitter's query carried `i.parent_id IS NOT NULL` and NDB's only route
 * into that query is a root-level source mapping. The reader is
 *
 *     PRIOR_WEIGHT * (prior[c] ?? 0)
 *
 * so a channel the artifact does not mention is scored as impossible rather
 * than as unmeasured. Nothing failed. The artifact was internally consistent,
 * normalised, and wrong about a third of the corpus.
 *
 * The same conflation ran one level down: 732 of 1,800 (cell, channel) pairs
 * were missing from cells that DID survive the observation floor -- including
 * `state_aid_satr`, the channel the emitter exists to promote, in 28 of them.
 * The back-off was per CELL and never per CHANNEL.
 *
 * ── The property, and the test for an unseen case ──────────────────────────
 * Both halves are DERIVED. The denominator is `dbInstrumentsByBucket()` -- the
 * selector's own vocabulary, the exact set the backfill iterates when it fills a
 * free slot -- and the numerator is the artifact's own keys. No channel name
 * appears here, which is the whole difference between this and a register:
 * `check_contracts` fails the build on a rule that lists its cases, and a check
 * naming `national_dev_banks` would be correct today and silently short the day
 * a twelfth bucket is loaded.
 *
 * ── Why a ratchet and not a hard zero ──────────────────────────────────────
 * The emitter is fixed and emits 11 of 11 with 0 missing keys. THE ARTIFACT IS
 * NOT: regenerating it changes what founders are served, so it comes to the
 * owner prepared rather than riding along with a check. Until it lands this
 * would be a red build, and a red check is a check people learn to skip.
 *
 * So the gap is a number that may FALL AND NEVER RISE, like
 * `check_comparator_storable` and `check_row_titles_distinct`. It fails today on
 * any change that widens the hole, and it fails the day the artifact is
 * regenerated and the ratchet is not brought down with it -- which is the only
 * way a ratchet at a non-zero value is honest.
 *
 * FREE and hermetic: two committed files, no credentials, no network, no
 * database, nothing gitignored.
 *
 * Run: npx tsx scripts/check_channel_prior_complete.ts
 */
// PINNED OFFLINE, and destroyed rather than trusted to be absent. This reads the
// selector's channel vocabulary out of the COMMITTED snapshot on purpose: the
// question is which channels the shipped artifact can express, and an answer
// that changed with whoever's DATABASE_URL happened to be in the environment
// would make the ratchet a property of a machine. `check_env_loader` accepts
// exactly this or a `requireCredentials` declaration, and a declaration here
// would be a promise this file does not want to keep.
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;

import { readFileSync } from "fs";
import path from "path";

import { dbInstrumentsByBucket } from "../lib/intelligence/shortlist";

/** ── THE RATCHETS ──────────────────────────────────────────────────────────
 *  Measured 2026-08-19 against the shipped artifact. They come DOWN, never up.
 *  Regenerating the prior takes both to 0; bring them here in the same commit. */
const MAX_UNREPRESENTED_CHANNELS = 0;
const MAX_MISSING_CELL_KEYS = 0;

type Prior = {
  channels?: string[];
  unobserved?: string[];
  global: Record<string, number>;
  byCountry: Record<string, Record<string, number>>;
  byCountrySector: Record<string, Record<string, number>>;
};

function main(): void {
  const file = path.join(process.cwd(), "lib", "intelligence", "channelPrior.generated.json");
  const prior = JSON.parse(readFileSync(file, "utf8")) as Prior;
  const offerable = [...dbInstrumentsByBucket().keys()].sort();
  if (offerable.length === 0) {
    // The snapshot resolves from process.cwd(); an empty vocabulary is "I looked
    // in the wrong place", never "the corpus has no channels". A check that
    // passes over nothing is the failure this repo has shipped before.
    console.error("check_channel_prior_complete: FAILED — the selector's channel "
      + `vocabulary is EMPTY (cwd ${process.cwd()}). Run from website/frontend.`);
    process.exit(1);
  }

  const scored = new Set(Object.keys(prior.global));
  // `unobserved` is the artifact SAYING a channel funds nobody, which is a
  // different fact from saying nothing. An artifact that declares it is not in
  // debt for it; one that stays silent is.
  const declared = new Set(prior.unobserved ?? []);
  const unrepresented = offerable.filter((c) => !scored.has(c) && !declared.has(c));

  const cells = [...Object.entries(prior.byCountry), ...Object.entries(prior.byCountrySector)];
  let missingKeys = 0;
  for (const [, cell] of cells) {
    for (const c of scored) if (!(c in cell)) missingKeys += 1;
  }

  console.log(
    `check_channel_prior_complete: ${offerable.length} channel(s) the selector can `
    + `offer, ${scored.size} scored by the prior, ${declared.size} declared unobserved.`);
  console.log(
    `  unrepresented ${unrepresented.length} (ratchet ${MAX_UNREPRESENTED_CHANNELS}), `
    + `missing (cell,channel) keys ${missingKeys} of ${cells.length * scored.size} `
    + `(ratchet ${MAX_MISSING_CELL_KEYS}).`);
  if (unrepresented.length) console.log(`  unrepresented: ${unrepresented.join(", ")}`);

  const problems: string[] = [];
  if (unrepresented.length > MAX_UNREPRESENTED_CHANNELS) {
    problems.push(
      `${unrepresented.length} channel(s) the backfill can put in a founder's pool are `
      + `scored by nothing and declared by nothing, over the ratchet of `
      + `${MAX_UNREPRESENTED_CHANNELS}. The reader is \`prior[c] ?? 0\`, so each one is `
      + `being told it is impossible: ${unrepresented.join(", ")}`);
  }
  if (missingKeys > MAX_MISSING_CELL_KEYS) {
    problems.push(
      `${missingKeys} (cell, channel) pairs are absent from a cell that survived the `
      + `observation floor, over the ratchet of ${MAX_MISSING_CELL_KEYS}. The back-off `
      + `is per cell; these channels needed it per channel.`);
  }
  // A ratchet that is never brought down is a floor, and floors here come down.
  if (unrepresented.length < MAX_UNREPRESENTED_CHANNELS || missingKeys < MAX_MISSING_CELL_KEYS) {
    problems.push(
      `the artifact is BETTER than the ratchets (${unrepresented.length} < `
      + `${MAX_UNREPRESENTED_CHANNELS} or ${missingKeys} < ${MAX_MISSING_CELL_KEYS}). `
      + `Lower them in this file, in the commit that improved it, so the next `
      + `regression is caught at the new level rather than at the old one.`);
  }

  if (problems.length) {
    console.error("\ncheck_channel_prior_complete: FAILED");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("  Regenerate: python3 ETL/terms/emit_channel_prior.py");
    process.exit(1);
  }
  console.log("check_channel_prior_complete: ok — no channel is being told it is impossible "
    + "that the artifact has not said so about on purpose.");
}

main();
