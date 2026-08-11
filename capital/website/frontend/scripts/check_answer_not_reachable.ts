// Nothing a founder's request can reach may read the answer key.
//
// ── Why this exists, and why it is an import-graph check ────────────────────
//
// This project grades itself on "did the fund this company actually won appear
// in the published rows". Several stores in this repo ANSWER that question
// directly, and three of them sit in the same directory the memo path imports
// from:
//
//   lib/intelligence/profileLeakIndex.generated.json   1.7 MB, all 1,088
//       `instrument_profiles.profile_text` values, up to 40 REAL WINNING
//       PROJECT TITLES each, committed, credential-free. A `readFileSync` from
//       any memo-path module reaches it in milliseconds.
//   lib/intelligence/__recallSet*.json                 the answer key itself:
//       `description -> the instrument that company won`.
//   instrument_profiles.profile_text                   the same text in
//       Postgres. The shipped ranker touches this table and is safe ONLY
//       because it consumes a scalar percentile; any query selecting the text
//       hands over the answer.
//
// A fourth is subtler and already loaded: `funding_instruments.sample_project_
// titles` is SELECTed in corpus.ts, parsed onto `DbInstrument`, and read by
// nothing. It is one property access away from any module in the path.
//
// ── The property ────────────────────────────────────────────────────────────
//
//   NO MODULE REACHABLE FROM THE MEMO PATH MAY NAME AN ANSWER-BEARING SOURCE.
//
// Reach is DERIVED from the import graph, transitively, exactly as
// check_env_loader.ts derives credential reach — not from a hand-kept list of
// files, because a new module that imports a bad one would not be on such a
// list. The entry points are the two things a founder's request runs:
// `computeVerdict` and `runIntelligence`, both in lib/intelligence/pipeline.ts.
//
// It is a NAME check, not a behaviour check. That is the point: a leak here is
// worth more than a leak anywhere else in the product, so the bar is "this
// module does not mention the answer", not "this module probably does not use
// it". Diagnostics, harnesses and the leak guard itself name these sources
// legitimately and are not reachable from the request path, so they are not
// implicated by construction rather than by exemption.
//
// Prove it can fail:
//   PROVE=1 npx tsx scripts/check_answer_not_reachable.ts
// The walk itself lives in `_import_graph.ts` and is shared with
// `check_check_reachability.ts`, which asks the same question ("what can a
// request reach") about a different set of modules. Two copies of that
// derivation would agree today and drift the first time either guard's
// resolver was fixed.
import { readFileSync } from "fs";
import path from "path";

import { code, reachable, walk } from "./_import_graph";

const ROOT = process.cwd();
const LIB = path.join(ROOT, "lib");
const ENTRY = path.join(LIB, "intelligence", "pipeline.ts");

/** The answer-bearing sources, each with why it answers the question.
 *  A PROPERTY per source, not a list of files that happen to be bad today. */
const ANSWER_SOURCES: { pattern: RegExp; what: string }[] = [
  { pattern: /profileLeakIndex/,
    what: "the full profile corpus: up to 40 real winning project titles per fund" },
  { pattern: /__recallSet/,
    what: "the answer key itself — description to the instrument that company won" },
  { pattern: /\bprofile_text\b/,
    what: "instrument_profiles.profile_text — the text the leak index is built from" },
  { pattern: /\bsample_project_titles\b|\bsampleProjectTitles\b/,
    what: "real award titles, already loaded onto DbInstrument and read by nothing" },
  { pattern: /public_funding_events/,
    what: "the award table the ground truth is drawn from" },
  { pattern: /\bsatr_staging\b/,
    what: "beneficiary_name on every row" },
];

function main() {
  const files = walk(LIB);
  const known = new Set(files);
  if (!known.has(ENTRY)) {
    console.error(`check_answer_not_reachable: cannot find the entry point ${ENTRY}`);
    process.exit(1);
  }

  const inPath = reachable([ENTRY], known, ROOT);
  const findings: string[] = [];
  for (const f of [...inPath].sort()) {
    const src = code(readFileSync(f, "utf8"));
    for (const { pattern, what } of ANSWER_SOURCES) {
      if (pattern.test(src)) {
        findings.push(`  ${path.relative(process.cwd(), f)}\n      names ${what}`);
      }
    }
  }

  // Anti-vacuity: a check that reaches nothing reports green forever. The
  // request path is a large graph; if it collapses to a handful of modules the
  // resolver has broken and the result means nothing.
  if (inPath.size < 20) {
    console.error(`check_answer_not_reachable: FAILED — the import graph resolved to ` +
      `only ${inPath.size} module(s) from ${path.relative(process.cwd(), ENTRY)}. ` +
      `That is not the memo path; the resolver is broken and a green result here ` +
      `would be meaningless.`);
    process.exit(1);
  }

  if (process.env.PROVE) {
    console.log(`  PROVE: ${inPath.size} modules reachable from the request path`);
    console.log(`  PROVE: planting a reference makes this red — the check reads NAMES,`);
    console.log(`         so adding \`sampleProjectTitles\` to any of them fails the build`);
  }

  if (findings.length) {
    console.error(`\ncheck_answer_not_reachable: FAILED — ${findings.length} module(s) ` +
      `on the memo path name an answer-bearing source:\n`);
    for (const f of findings) console.error(f);
    console.error(`\nA founder's request must not be able to read what that founder won.`);
    console.error(`These sources exist for measurement and for the leak guard, neither of`);
    console.error(`which runs a request. If a fund fact is genuinely needed on the page,`);
    console.error(`take it from a store with no beneficiary, award or title column —`);
    console.error(`eligibility_gates and eligibility_clauses are safe by construction.`);
    process.exit(1);
  }

  console.log(`check_answer_not_reachable: ok — ${inPath.size} modules reachable from ` +
    `the request path, none names an answer-bearing source ` +
    `(${ANSWER_SOURCES.length} sources checked).`);
}

main();
