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
    // Archived one-offs: kept for the record, never run, out of lint and build.
    "scripts/archive/**",
    "archive/**",
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

  // ── A computed value nothing reads is an ERROR in lib/ ────────────────────
  // These five were listed here as warnings-with-a-note, one line each, on the
  // reasoning that "each is a finding rather than a tidy-up". Three of them
  // then turned out to be founder-facing defects (see project-mgmt/findings/
  // 2026-08-08_wsBL_discarded_answers.md), and the fourth week in a row of the
  // same class went by. A warning in a list of warnings is a note nobody is
  // required to read; the note was right and it changed nothing.
  //
  // So it is an error in `lib/`, which is the shipped product. The rule is
  // cheap and it catches the exact shape three of this month's defects had:
  // `prior` computed and dropped, `consortiumOk` destructured and dropped,
  // `ticketFit` computed one token from being used. It cannot catch the fourth
  // shape — an answer that reaches a scorer nothing consults — which is what
  // `check_answer_reach.ts` is for. The two together cover the class.
  //
  // Not `scripts/`: a diagnostic harness that pulls six columns and prints two
  // is doing its job, and erroring on it would only teach people to disable
  // the rule.
  //
  // Suppressing it stays possible and is meant to cost something: an inline
  // disable with the reason at the site. That is strictly better than a
  // warning, because the reason ends up where the next reader is standing
  // rather than in a config file they will never open.
  {
    files: ["lib/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        // The one exemption: pulling a key out to drop it, `const { _dropped,
        // ...report } = body`, is a deliberate discard and reads as one.
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },
]);

export default eslintConfig;
