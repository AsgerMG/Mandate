import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── `any` in the diagnostic harnesses ──────────────────────────────────────
  // CI's Lint step was red on `main` for months: 177 errors, 176 of them
  // `no-explicit-any` and every single one under `scripts/`. A job that is
  // always red is a job nobody reads, and this one sits in the same workflow as
  // the guards that catch founder-facing defects — so the cost of leaving it
  // red was never the `any`s, it was training everyone to scroll past a red
  // check.
  //
  // The honest reading of those 176 is that `scripts/diagnose_*`,
  // `measure_*`, `probe_*` and `simulate_*` are not the same population as
  // shipped code. They are throwaway instruments: they open a database
  // connection, splay untyped rows across a console, and are read once by the
  // person who wrote them that afternoon. Declaring an interface for the shape
  // of a `SELECT *` you will never run again buys nothing, and the alternative
  // people actually reach for is a per-line disable comment, which is the same
  // suppression with more noise.
  //
  // So the rule is off for the harnesses — deliberately, in configuration,
  // where the decision is visible — and NOT off anywhere else.
  {
    files: ["scripts/**/*.{ts,tsx,mts,mjs}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },

  // ── ...but not for the guards ─────────────────────────────────────────────
  // `scripts/check_*` and `scripts/emit_*` live under `scripts/` and are not
  // harnesses. The check_* files ARE the CI job — eighteen of them run in
  // `.github/workflows/ci.yml` and twenty-seven in `npm run check` — and the
  // emit_* files write artifacts that get committed and shipped. A guard that
  // reads a row as `any` is a guard that cannot tell a renamed column from a
  // null, which is precisely how a check passes while asserting nothing. That
  // failure mode is the one this repo keeps finding, so these keep the rule at
  // full strength. There are zero violations here today; this line is what
  // stops the next one.
  //
  // `run_checks.mjs` is the runner and belongs to the same population.
  {
    files: ["scripts/check_*.{ts,mts}", "scripts/emit_*.{ts,mts}", "scripts/run_checks.mjs"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },

  // ── The five warnings that are deliberately still here ────────────────────
  // `no-unused-vars` is a warning in eslint-config-next and stays one. Errors
  // are now zero and CI is green; these five survive on purpose, because each
  // is a finding rather than a tidy-up, and deleting the line would delete the
  // only thing pointing at it. In lib/intelligence/, which other workstreams
  // are inside — do not batch these, take them one at a time:
  //
  //   1. shortlist.ts:~1993  `prior` — `channelPrior()` is computed and never
  //      used. That is CORRECT and deliberate (commit dc046911: the prior
  //      trades national regime recall 64->100% against EU 77->15%), but the
  //      comment above it reads as though it were applied. Fix the COMMENT,
  //      not the code; make it a do-not-reapply note. Smallest of the five.
  //   2. shortlist.ts:~1558  `consortiumOk` — destructured out of
  //      InstrumentTableInput and never read in selectInstrumentRows. An
  //      intake answer the founder gives that row selection does not use.
  //      Either it feeds the selection or it should stop being threaded in.
  //   3. pipeline.ts:~831  `capitalMismatch` — residue of "Phase 4: the score
  //      selects, the writer writes" (8a078c98). The comment eight lines below
  //      says capital mismatch moved into scoreFit; confirm that, then delete.
  //   4. adaptiveRound.ts:~191  `gateKeys` — built for the round-2 schema in
  //      50d6e300 and never placed in it. Check against the memo'd gotcha that
  //      array minItems/maxItems 400s an Anthropic structured-output schema:
  //      this may be what was dropped to work around it.
  //   5. adaptiveRound.ts:~78  `topicSignature` — a whole documented function
  //      that dedupes two phrasings of the same question. Its doc comment says
  //      "a live round shipped both", so the defect it prevents is real and
  //      the prevention is not running. Largest, and the one worth a measure.
]);

export default eslintConfig;
