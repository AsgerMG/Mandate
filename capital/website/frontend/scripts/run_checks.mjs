// `npm run check` — every check runs, and you are told about all of them.
//
// ── What this replaces, and why ────────────────────────────────────────────
// This was a 27-link `&&` chain in package.json. `&&` stops at the first
// non-zero, so the command reported exactly one problem per run and silently
// skipped everything after it. On 2026-08-08 the 14th link (check_corpus_census)
// was red, which meant thirteen checks had not executed at all:
//
//   check_verdicts, check_leaf_cap, check_capital_reach, check_payload_budget,
//   check_client_boundary, check_dependencies, check_env_loader,
//   check_recall_leaks, check_extracted_quotes, check_gate_pertinence,
//   check_degradation, check_hydration_parity, check_recall_floor
//
// Four of those run nowhere else. check_recall_floor is the one that had just
// been fixed so it could not skip itself and exit 0 — and it had been sitting
// behind a red link ever since, not running for a different reason. That is the
// same defect the CI workflow fixed months earlier with `if: always()`, still
// live in the command humans actually type.
//
// ── The rule ───────────────────────────────────────────────────────────────
// A check suite reports on the BUILD, not on the first thing wrong with it.
// Every check runs; failures accumulate; the summary at the end is the whole
// picture. `--bail` restores the old behaviour for a tight edit loop, and is
// deliberately not the default: the default is the one people run before they
// push.
//
// Order still matters and is preserved — the cheap hermetic checks come first,
// so a typo surfaces in seconds rather than after the corpus-reading ones.
//
// ── Working directory ──────────────────────────────────────────────────────
// Always website/frontend, whatever the caller's cwd. Several checks resolve
// the corpus from `process.cwd()/public/data`, and from the repo root they load
// ZERO instruments and pass — check_capital_reach reported "ok — every value
// carried by the 0 publishable instruments is reachable" when run from one
// directory up. A suite that can pass by being invoked from the wrong place is
// not a suite.
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Ordered: hermetic and fast first, corpus- and network-reading last. */
const CHECKS = [
  ["typecheck", ["npx", "tsc", "--noEmit"]],
  ["unit tests", ["npx", "vitest", "run"]],
  ["segment config is a literal", ["npx", "tsx", "scripts/check_revalidate_literal.ts"]],
  ["output contracts", ["npx", "tsx", "scripts/check_contracts.ts"]],
  ["rendered numbers", ["npx", "tsx", "scripts/check_rendered_numbers.ts"]],
  // Its sibling one level up: `check_rendered_numbers` says no number a VISITOR
  // reads may be an unsourced literal, and this says no number the OWNER PLANS
  // ON may be. Same hermetic class -- two committed trees, no credentials,
  // sub-second -- and it sits here rather than beside the recall floor because
  // the figures it watches are precisely the ones quoted in rooms where the
  // floor has not been run.
  ["published figures", ["npx", "tsx", "scripts/check_published_figures.ts"]],
  // Sits in the hermetic block because it is: three committed JSON artifacts,
  // no credentials, no network. It watches the one thing the ranker cannot see
  // for itself -- whether a fund's recipient mix agrees with what those
  // recipients officially do. An AI company was published a film and television
  // scheme for want of exactly this.
  ["sector evidence", ["npx", "tsx", "scripts/check_sector_evidence.ts"]],
  // Hermetic: the committed snapshot rendered through the shipped functions, no
  // credentials, sub-second. It sits among the cheap checks because what it
  // watches is the cheapest defect in the product to ship and the most
  // expensive to notice -- a candidate row whose scope line says nothing. The
  // ranker was handed the won fund nine times and took it zero times, and not
  // one of those nine rows carried a usable one.
  ["a funds: line states a scope", ["npx", "tsx", "scripts/check_funds_line.ts"]],
  ["vocabulary contract", ["npx", "tsx", "scripts/check_vocabularies.ts"]],
  // Directly under the vocabulary contract, because it reads the same two
  // things: the stems in FIELD_ENUM_HINTS and the committed corpus snapshot.
  // That check says the ANSWER SET a comparator refers to exists; this one says
  // the QUESTION the comparator decides on is the question the rule turns on.
  // Its sibling further down, `a filter can admit someone`, asks whether a
  // comparator can ever return true — all three are ways for a filter to delete
  // a fund from a founder who qualifies, and only this one catches the case
  // where the founder answered correctly.
  ["a comparator asks the rule's question",
   ["npx", "tsx", "scripts/check_field_matches_demand.ts"]],
  ["one env loader", ["npx", "tsx", "scripts/check_env_loader.ts"]],
  ["client/server boundary", ["npx", "tsx", "scripts/check_client_boundary.ts"]],
  ["payload budget", ["npx", "tsx", "scripts/check_payload_budget.ts"]],
  // Next to the payload budget because they read the same two artifacts and
  // ask opposite questions: that one asks whether the request carries too much,
  // this one whether the FALLBACK carries too little. `check_hydration_parity`
  // is the stronger version and runs far later, but it needs credentials and it
  // compares published rows -- so a column that no ranker reads and every
  // prompt does slips past it. Hermetic and static; costs milliseconds.
  ["both stores select the same columns", ["npx", "tsx", "scripts/check_store_columns.ts"]],
  ["archetype regression", ["npx", "tsx", "scripts/check_archetypes.ts"]],
  // Immediately after it, and NOT instead of it: that one asks whether the
  // corpus holds funds for each profile, this one asks whether the MEMO -- a
  // different pool, a different order, a different cut -- actually hands the
  // founder a table. An archetype was receiving ZERO ROWS while the line above
  // reported it passing, because the two are not the same question and only one
  // of them is what the founder reads.
  ["every archetype gets a table", ["npx", "tsx", "scripts/check_memo_table.ts"]],
  ["liveness has one definition", ["npx", "tsx", "scripts/check_liveness.ts"]],
  ["openness is evidenced", ["npx", "tsx", "scripts/check_window_evidence.ts"]],
  ["offer routes are sourced", ["npx", "tsx", "scripts/check_offer_route.ts"]],
  ["regions match NUTS", ["npx", "tsx", "scripts/check_regions.ts"]],
  ["theme index is not stale", ["npx", "tsx", "scripts/check_theme_index.ts"]],
  // The base rate the SELECTOR IS TOLD. A stale curve here does not degrade a
  // ranking, it makes the prompt state a confident falsehood about the list in
  // front of the model — which is what shipped for four workstreams, unnoticed,
  // because nothing checked it.
  ["selector's base rate is current", ["npx", "tsx", "scripts/check_pool_recall_curve.ts"]],
  ["leaf cap headroom", ["npx", "tsx", "scripts/check_leaf_cap.ts"]],
  ["missing-data neutral", ["npx", "tsx", "scripts/check_missing_data_neutral.ts"]],
  ["capital reach", ["npx", "tsx", "scripts/check_capital_reach.ts"]],
  // Hermetic: the corpus snapshot is committed, so this runs everywhere and
  // cannot pass by having nothing to read. It sits among the cheap checks
  // rather than beside the corpus-reading ones for exactly that reason.
  ["a filter can admit someone", ["npx", "tsx", "scripts/check_comparator_admits.ts"]],
  // Same hermetic class: committed snapshot plus committed artifact, no
  // credentials, sub-second. It ratchets how many in-scope requirements have no
  // judgement, which is the only way a growing corpus can silently stop being
  // askable -- an unclassified requirement is never offered as a question and
  // reads exactly like "there was nothing worth asking".
  ["open questions still cover the corpus", ["npx", "tsx", "scripts/check_open_question_class.ts"]],
  // Same hermetic class again: the committed answer key plus a committed cut of
  // the declared catchments, no credentials. It sits among the cheap checks
  // because the property it watches is the most expensive one to get wrong -- a
  // territorial screen removing a fund from a company the register says WON it
  // -- and a guard against that must not be behind a link that needs a database.
  ["a winner is never screened out", ["npx", "tsx", "scripts/check_winner_not_blocked.ts"]],
  // The SAME property one stage later, and the stage that actually ships. The
  // line above watches the territorial screen, which is not shipped and whose
  // debt is 15. This one watches the encoded-gate drop inside the memo's own
  // candidate order, which IS shipped, and which was deleting the won fund for
  // 62% of the answer key until the comparator was taught that "Denmark" and
  // "DK" are one country. Same hermetic class: committed snapshot, committed
  // answer key, no credentials.
  ["a winner is never gated out of the memo",
    ["npx", "tsx", "scripts/check_winner_not_gated.ts"]],
  ["recall set does not leak", ["npx", "tsx", "scripts/check_recall_leaks.ts"]],
  // The other direction of the same property. The line above stops the ANSWER
  // KEY containing the question; this stops a founder's REQUEST being able to
  // read the answer. Both were needed: the answer key sits in the same
  // directory the memo path imports from.
  ["request path cannot reach the answer",
   ["npx", "tsx", "scripts/check_answer_not_reachable.ts"]],
  // The other half of "the number describes the product": the set may be
  // leak-free and still be graded on a founder who does not exist. This fails
  // when a harness answers the intake on the founder's behalf, which is how
  // `usedInField` — tier 1 of the row sort — came to be false on every row of
  // every EXACT@5 this repo has published. Hermetic, sub-second, no database.
  ["harness answers as the founder", ["npx", "tsx", "scripts/check_harness_intake.ts"]],
  // Hermetic, sub-second, and it reads the same answer key the recall floor
  // grades on. It sits HERE rather than beside the floor because it is the
  // cheap half of the same question: the floor needs credentials, takes three
  // and a half minutes and is skipped in CI, and a regenerated peer prior cost
  // ten graded cases while every check that actually ran stayed green.
  ["peer prior canary", ["npx", "tsx", "scripts/check_peer_prior_canary.ts"]],
  ["quotations match documents", ["npx", "tsx", "scripts/check_extracted_quotes.ts"]],
  ["dependency audit", ["npx", "tsx", "scripts/check_dependencies.ts"]],
  ["country gates", ["npx", "tsx", "scripts/check_country_gates.ts"]],
  ["gate field reach", ["npx", "tsx", "scripts/check_gate_field_reach.ts"]],
  // Immediately after it, because it is the other half of the same question:
  // reach says an answer arrives, this says something then does anything with
  // it. Four answers were lost in the gap between the two in one week.
  ["answers reach the ranker", ["npx", "tsx", "scripts/check_answer_reach.ts"]],
  ["gate pertinence", ["npx", "tsx", "scripts/check_gate_pertinence.ts"]],
  ["applicant identity", ["npx", "tsx", "scripts/check_applicant_identity.ts"]],
  ["corpus currency", ["npx", "tsx", "scripts/check_corpus_currency.ts"]],
  ["site serves the ETL's corpus", ["npx", "tsx", "scripts/check_corpus_census.ts"]],
  ["degradation policy", ["npx", "tsx", "scripts/check_degradation.ts"]],
  ["both stores agree", ["npx", "tsx", "scripts/check_hydration_parity.ts"]],
  ["recall floor", ["npx", "tsx", "scripts/check_recall_floor.ts"]],
  // LAST, and check_guard_registry.py asserts that it stays last: it is what
  // closes the loop on the corpus-side guards this machine cannot run itself.
  ["published verdicts", ["npx", "tsx", "scripts/check_verdicts.ts"]],
];

const bail = process.argv.includes("--bail");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

const results = [];
for (const [label, argv] of CHECKS) {
  if (only && !argv.join(" ").includes(only) && !label.includes(only)) continue;
  process.stdout.write(`\n[1m── ${label}[0m\n`);
  const t0 = Date.now();
  const r = spawnSync(argv[0], argv.slice(1), { cwd: FRONTEND, stdio: "inherit" });
  // A signal (or a missing binary) yields status null. That is a failure, and
  // reporting it as 0 would be this file's own version of the bug it fixes.
  const code = r.status === null ? 1 : r.status;
  results.push({ label, code, ms: Date.now() - t0 });
  if (code !== 0 && bail) break;
}

const failed = results.filter((r) => r.code !== 0);
process.stdout.write(`\n[1m── summary[0m\n`);
for (const r of results) {
  const mark = r.code === 0 ? "[32m ok [0m" : "[31mFAIL[0m";
  process.stdout.write(`  ${mark}  ${r.label.padEnd(34)} ${(r.ms / 1000).toFixed(1)}s\n`);
}
if (failed.length) {
  process.stdout.write(
    `\n[31m${failed.length} of ${results.length} failed:[0m `
    + `${failed.map((f) => f.label).join(", ")}\n`
    + `Every check ran. This is the whole list, not the first item on it.\n`);
  process.exit(1);
}
process.stdout.write(`\n[32mall ${results.length} checks passed[0m\n`);
