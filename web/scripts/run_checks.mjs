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
import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(FRONTEND, "..", "..");

// ── The findings go into the tree, because nowhere else reaches anybody ─────
//
// On 2026-08-18 thirteen of these were red on main, and seven had been red
// since 2026-08-12 — 139 consecutive commits at the 20-a-day rate this repo
// works at. SIX of the seven run in CI on every push, so CI had been red 139
// times. The result reached nobody: this repository is private, no checkout in
// the project carries a GitHub token, `gh run list` and the Actions API both
// fail for every agent that works here, and the only channel was an email to
// the owner. Three agents found the reds by tripping over them.
//
// A result that reaches nobody is not a result. So the suite writes what it
// found into a committed file, and `scripts/check_red_debt.ts` — which runs
// inside `npx vitest run`, the four-second command every agent here types —
// refuses a tree whose findings are stale, or red and unowned.
// project-mgmt/, NOT data/. `data` is in .gitignore, so a record written
// there would be invisible to a fresh clone and to CI — and this repo has a
// standing rule that no CI step may read gitignored data, for exactly this
// reason. It is caught here rather than in six weeks because the first thing
// this file asserts is that somebody can SEE the result.
const RECORD = path.join(ROOT, "project-mgmt", "check_status.json");

/**
 * The one line a person reads for a check: the check's OWN last words.
 *
 * A failing check says so on a line that names the failure; a passing one says
 * so on its last. Prefer the former, fall back to the latter. Same rule and the
 * same reason as `_summarise` in ETL/lib/guard_verdicts.py — an acceptance is
 * bound to this string, so it must be the check's sentence and never anything
 * this file invents about it.
 */
function summarise(output) {
  const lines = output.split("\n")
    // Terminal colour, and node's own deprecation noise, are not the check's
    // words about itself.
    .map((l) => l.replace(/\u001b\[[0-9;]*m/g, "").trimEnd())
    .filter((l) => l.trim() && !/^\(node:\d+\)|^\(Use `node /.test(l));
  if (!lines.length) return "";
  // `[verdict] x = failed …` is the publisher's boilerplate, not the check's
  // finding: it says the same sixty words for every guard and would bind an
  // acceptance to a sentence that cannot distinguish two failures. Skipped when
  // choosing the loud line, kept as a last resort.
  const own = lines.filter((l) => !l.trim().startsWith("[verdict]"));
  const loud = [...own].reverse().find((l) => /FAIL|failed|ERROR|Error:/.test(l));
  return (loud ?? own[own.length - 1] ?? lines[lines.length - 1]).trim().slice(0, 400);
}

/**
 * Run one check, echoing its output live AND keeping it.
 *
 * `spawnSync` with pipes would have withheld five minutes of a slow check's
 * output until it finished; a suite you cannot watch is a suite people stop
 * running, which is the disease this file is treating. So it streams.
 */
function run(argv) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let out = "";
    const child = spawn(argv[0], argv.slice(1), {
      cwd: FRONTEND, stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (b) => { out += b.toString(); process.stdout.write(b); });
    child.stderr.on("data", (b) => { out += b.toString(); process.stderr.write(b); });
    child.on("close", (status, signal) => {
      // A signal (or a missing binary) yields status null. That is a failure,
      // and reporting it as 0 would be this file's own version of the bug it
      // fixes.
      resolve({ code: status === null ? 1 : status, ms: Date.now() - t0,
                summary: summarise(out) + (signal ? ` (killed by ${signal})` : "") });
    });
    child.on("error", (err) => {
      const line = `${argv.join(" ")}: ${err.message}`;
      process.stderr.write(line + "\n");
      resolve({ code: 1, ms: Date.now() - t0, summary: line });
    });
  });
}

/** Ordered: hermetic and fast first, corpus- and network-reading last. */
const CHECKS = [
  // FIRST, and it is about this suite rather than about the product: is what
  // the tree says the build last found still true, and is every red one
  // somebody has looked at? It judges the PREVIOUS run's record, because this
  // run's rows are written at the end — which is the honest reading. Two
  // seconds, hermetic.
  ["a red check is owned", ["npx", "tsx", "scripts/check_red_debt.ts"]],
  ["typecheck", ["npx", "tsc", "--noEmit"]],
  ["unit tests", ["npx", "vitest", "run"]],
  ["segment config is a literal", ["npx", "tsx", "scripts/check_revalidate_literal.ts"]],
  ["output contracts", ["npx", "tsx", "scripts/check_contracts.ts"]],
  // Directly under it, because it reads the same tree and asks the one question
  // that check does not: `check_contracts` asks whether every rule is routed and
  // enforced, this asks whether the PROSE states a frequency the code computes at
  // request time. Two rates were live in the selector's system prompt while the
  // same call carried the curve-derived ones in the user prompt.
  ["a contract states no rate", ["npx", "tsx", "scripts/check_prompt_rates.ts"]],
  // Directly under it because it reads the same detector on the other file
  // assembled verbatim into a prompt, and asks the question that one does not:
  // whether every euro figure the model is handed says what it is a quantity
  // OF. Four different bases were printed as four bare numbers and the model
  // matched them. See lib/intelligence/money.ts.
  ["a euro figure says what it is a quantity of", ["npx", "tsx", "scripts/check_money_basis.ts"]],
  // Beside `check_contracts` because it grades the other half of the same
  // claim: that one counts a rule enforced when a literal names it, this one
  // asks whether the check deciding it is reachable from a request at all.
  ["a rule's check can actually run", ["npx", "tsx", "scripts/check_check_reachability.ts"]],
  ["rendered numbers", ["npx", "tsx", "scripts/check_rendered_numbers.ts"]],
  // Its sibling one level up: `check_rendered_numbers` says no number a VISITOR
  // reads may be an unsourced literal, and this says no number the OWNER PLANS
  // ON may be. Same hermetic class -- two committed trees, no credentials,
  // sub-second -- and it sits here rather than beside the recall floor because
  // the figures it watches are precisely the ones quoted in rooms where the
  // floor has not been run.
  ["published figures", ["npx", "tsx", "scripts/check_published_figures.ts"]],
  // Beside the published figures because it is the same shape one layer down:
  // that one says no number the OWNER PLANS ON may be unsourced, this one says no
  // CEILING measured to bind on a paid run may still be in force. Hermetic — one
  // leaf module, one route file, the committed project-mgmt/ tree — and it reads
  // runs rather than values, so a future run that truncates reds the build.
  ["a measured ceiling was raised", ["npx", "tsx", "scripts/check_maxtok_headroom.ts"]],
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
  // Immediately after it, because it is the same defect one level up. That one
  // says a harness must declare the CREDENTIALS it reads, because a run without
  // them measures the fallback and prints a number indistinguishable from a
  // real one. This one says a harness must declare the STAGES it does not run,
  // for exactly that reason: `npm run stages` has never called the paid
  // comparable search whose output is tier 1 of the row sort, and the funnel
  // figure was read as end-to-end for weeks.
  ["a harness declares the stages it does not run",
   ["npx", "tsx", "scripts/check_stage_declaration.ts"]],
  ["client/server boundary", ["npx", "tsx", "scripts/check_client_boundary.ts"]],
  ["payload budget", ["npx", "tsx", "scripts/check_payload_budget.ts"]],
  // Next to the payload budget because they read the same two artifacts and
  // ask opposite questions: that one asks whether the request carries too much,
  // this one whether the FALLBACK carries too little. `check_hydration_parity`
  // is the stronger version and runs far later, but it needs credentials and it
  // compares published rows -- so a column that no ranker reads and every
  // prompt does slips past it. Hermetic and static; costs milliseconds.
  ["both stores select the same columns", ["npx", "tsx", "scripts/check_store_columns.ts"]],
  // Immediately after it, and NOT instead of it: that one asks whether the
  // corpus holds funds for each profile, this one asks whether the MEMO -- a
  // different pool, a different order, a different cut -- actually hands the
  // founder a table. An archetype was receiving ZERO ROWS while the line above
  // reported it passing, because the two are not the same question and only one
  // of them is what the founder reads.
  ["every archetype gets a table", ["npx", "tsx", "scripts/check_memo_table.ts"]],
  ["liveness has one definition", ["npx", "tsx", "scripts/check_liveness.ts"]],
  ["openness is evidenced", ["npx", "tsx", "scripts/check_window_evidence.ts"]],
  // Directly beneath the two of them because it asks the question neither can.
  // `check_liveness` asks whether "is this fund open" has ONE definition, and
  // `check_window_evidence` whether openness rests on a deadline we hold. Both
  // were green on 2026-08-18 while a scheme that ended 2020-12-30 was published
  // to a real founder as row 5 of seven with a link and a EUR 980,817 award,
  // because the fact its openness rested on -- an award in 2022 -- had itself
  // expired and nothing asked whether a fact can go out of date. It reads the
  // PUBLISHED table against live Postgres, not the corpus: three stages sit
  // between the rule and the founder.
  ["no door is offered on an expired fact", ["npx", "tsx", "scripts/check_dead_doors.ts"]],
  ["offer routes are sourced", ["npx", "tsx", "scripts/check_offer_route.ts"]],
  // Directly beneath it because it is the same class of question one step
  // earlier: that one asks whether a row is an OFFER, this one whether it is an
  // OBJECT. Twelve rows the loader had named after its own partition keys were
  // in founders' pools -- Poland's ENTIRE pool was eight of them -- and every
  // check in this list was green.
  ["a row is named by something outside its id",
   ["npx", "tsx", "scripts/check_name_evidence.ts"]],
  // Directly beneath it, one stage later and on a different subject. That one
  // asks whether the RECORD was named by something outside its id -- a
  // provenance column. This asks whether the LABEL the disambiguator builds for
  // it reveals one -- the text itself. A row passes that one and fails this:
  // SA.111728's five leaves all carry a register-given title, and two of them
  // still reached a real founder reading
  // "· rnd  sa 111728  ministere de l economie et des finances" three weeks
  // after 22 rows were renamed away from exactly that ministry. Hermetic,
  // sub-second, and it grades the WHOLE publishable corpus as one table, so no
  // bench profile has to happen to draw the group.
  ["a displayed name is not an id",
   ["npx", "tsx", "scripts/check_row_name_not_id.ts"]],
  // And directly beneath THAT, because it is the third question about one
  // string and the only one asked of the string as it is CUT. Those two ask
  // what a name is built out of; this asks whether the 120 characters a reader
  // actually gets still tell two funds apart. Four Catalan ICF loan lines
  // notified under four different aid regulations reached the model's menu as
  // one string four times, and the collapse below the menu resolved that by
  // demoting three real funds out of the table. Hermetic, sub-second, and it
  // grades each market's whole offerable pool as one table -- the widest table
  // any founder in that market can be handed -- so no bench profile has to
  // happen to draw the group.
  ["a cut title still tells two funds apart",
   ["npx", "tsx", "scripts/check_row_titles_distinct.ts"]],
  // ── WHY THIS WAS INVISIBLE, WHICH IS THE POINT ────────────────────────────
  // It ran in ci.yml and NOWHERE ELSE. So `check_red_debt` -- the thing that
  // exists precisely because nobody can see CI -- reported "every check is
  // observed, fresh, and green or owned" while this one was failing on every
  // push to main and mailing the owner each time. A check the debt register
  // cannot see is the exact defect the debt register was built for, and it had
  // one of its own.
  //
  // It is red right now, on four rows, and legitimately: two Bpifrance and two
  // Innovasjon Norge instruments are shown to a founder under the name of the
  // body that grants them. That is a decision the owner holds, not a bug to
  // paper over -- the check's own message forbids both escapes (delete the row,
  // invent a label). It stays red and OWNED until he answers.
  ["a row is not named after the body that grants it",
   ["npx", "tsx", "scripts/check_body_named_rows.ts"]],
  // Hermetic Python: the register's own words for each aid-instrument code,
  // our decision about what kind of capital that is, and the committed corpus
  // snapshot. It sits here rather than with the other corpus checks because
  // what it watches is a whole KIND of capital going missing: G (Guarantee) and
  // DG (Direct grant) were transposed, and the corpus held zero guarantees from
  // a feed publishing 17,023 guarantee awards.
  ["capital kinds match the register",
   ["python3", "../../ETL/schema/check_register_instrument_kinds.py"]],
  // The two ETL-side guards that watch whether guards and artifacts are
  // REACHABLE. They live in the CI python job, and on 2026-08-18 both were red
  // on main — outside the thirteen everyone counted, because `npm run check`
  // could not see them and nobody in this repo can see CI. Bringing them into
  // the suite is not a fifteenth and sixteenth guard: it is the same two, in
  // the one place their result now lands in the tree. Hermetic, under a second
  // each.
  ["every guard runs somewhere, or says why not",
   ["python3", "../../ETL/schema/check_guard_reachability.py"]],
  ["every committed artifact can be rebuilt",
   ["python3", "../../ETL/schema/check_artifact_reachability.py"]],
  // The weekly ETL died on 2026-08-16 reading a committed file that has never
  // existed where it runs, and stayed dead for three days: the corpus of record
  // stopped being refreshed and nothing in this suite could tell. It imports
  // every script the cron names, with every tracked data/ path made unreadable.
  ["the cron can read what it imports",
   ["python3", "../../ETL/schema/check_cron_image_inputs.py"]],
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
  // The same drop from the founder's side rather than the fund's: not "is this
  // winner deleted", but "did DELETION follow from answering a question we
  // chose to ask". The owner's binding decision is that a second-screen answer
  // informs the ranker and never removes a fund, and `accessiblePool` is the
  // one seam that removes. Builds ~700 real pools, so it is the slow member of
  // the hermetic block -- about two minutes -- and it is placed by cost rather
  // than by what it reads.
  ["asking a question never costs a fund",
    ["npx", "tsx", "scripts/check_asking_cannot_shrink.ts"]],
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
  // The same question one level up, and they are not the same question: that
  // one asks whether a harness answered the intake FOR the founder, this one
  // whether the question is answerable by a founder at all. /api/intelligence
  // read three fields `basePayload()` has never sent, so only a bench could
  // fill them -- and the benches did.
  ["a route reads only what a founder can send",
    ["npx", "tsx", "scripts/check_request_surface.ts"]],
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
  // And the THIRD consumer, which neither of the two above can see: the model
  // that writes the brief. No model ranks today, so the writer is the de facto
  // selector, and what it knows about the founder is one string. That string
  // was a hand-kept list and had lost seven intake fields, `sector`,
  // `useOfFunds` and `region` among them. Free and offline, so it runs here
  // rather than beside the paid stages.
  ["answers reach the writer", ["npx", "tsx", "scripts/check_answer_in_prompt.ts"]],
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
const deep = process.argv.includes("--deep");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

// ── The two checks that cost more than everything else put together ────────
// `cadence: weekly` in suite_tiers takes a check off the default path. On
// 2026-08-18 two measurements were 506s of a 690s suite; without them it is
// about three minutes, which is the difference between a command people run
// before they push and one they run at the end of a workstream if at all.
// Safe only because their ROWS still age in project-mgmt/check_status.json — see the
// `$why_cadence` note beside the tiers.
let CADENCE = {};
try {
  CADENCE = JSON.parse(readFileSync(path.join(ROOT, "data", "guard_registry.json"), "utf8"))
    .suite_tiers ?? {};
} catch { /* check_red_debt.ts validates the registry; this only reads it */ }
const isWeekly = (label) => CADENCE[label]?.cadence === "weekly";
const skipped = [];

const results = [];
for (const [label, argv] of CHECKS) {
  if (only && !argv.join(" ").includes(only) && !label.includes(only)) continue;
  if (!only && !deep && isWeekly(label)) { skipped.push(label); continue; }
  process.stdout.write(`\n[1m── ${label}[0m\n`);
  const r = await run(argv);
  results.push({ label, argv: argv.join(" "), ...r });
  if (r.code !== 0 && bail) break;
}

// ── Write what was found ───────────────────────────────────────────────────
// `--no-record` exists for one case and is typed: a run whose result must not
// speak for the tree, such as a deliberate experiment. It is not the default,
// because the default is the one people run before they push.
if (!process.argv.includes("--no-record")) {
  const prior = existsSync(RECORD)
    ? JSON.parse(readFileSync(RECORD, "utf8"))
    : { observations: {} };
  const at = new Date().toISOString();
  const observations = { ...(prior.observations ?? {}) };
  for (const r of results) {
    observations[r.label] = { argv: r.argv, code: r.code, summary: r.summary, at, ms: r.ms };
  }
  // A row for a check the suite no longer runs would age forever and could
  // never be cleared. A FULL run owns the list; an `--only=` or `--bail` run
  // saw only part of the suite and must not prune on that.
  const suite = CHECKS.map(([label]) => label);
  if (!only && !bail) {
    for (const k of Object.keys(observations)) {
      if (!suite.includes(k)) delete observations[k];
    }
  }
  writeFileSync(RECORD, JSON.stringify({
    $why: [
      "What the check suite last found, one row per check, each with its own",
      "timestamp. Written by website/frontend/scripts/run_checks.mjs and read by",
      "website/frontend/scripts/check_red_debt.ts, which runs inside `npx vitest",
      "run` -- the four-second command every agent in this repo types -- and fails",
      "on a row that is stale, or red and unowned, or held under an expired",
      "acceptance.",
      "",
      "It exists because CI is unobservable here. The repository is private and no",
      "checkout carries a GitHub token, so on 2026-08-18 six checks had been red in",
      "CI across 139 consecutive commits on main and the only channel for that fact",
      "was an email to one person.",
      "",
      "MERGED, not replaced: `npm run check --only=<label>` refreshes one row, so a",
      "stale row costs one check to clear rather than a twelve-minute suite.",
      "Regenerate any row with the command in its `argv`."
    ],
    suite,
    observations: Object.fromEntries(
      Object.entries(observations).sort(([a], [b]) => (a < b ? -1 : 1))),
  }, null, 1) + "\n");
  process.stdout.write(`\nrecorded ${results.length} result(s) in ${path.relative(ROOT, RECORD)}\n`);
}

// ── Who is hurt when this one fails? ───────────────────────────────────────
// Every check declares it in data/guard_registry.json -> suite_tiers, and only
// a `founder` red fails the build. A `report` red is run, recorded and printed
// in full, and stops nothing.
//
// The suite went from 0 checks on 14 July to 59 on 18 August, and on the day it
// reached 59 thirteen were red on main with seven of them a week old. Every one
// had been individually justified, and nothing had ever asked what a failure
// would COST — so a founder being sent to a scheme that closed in 2020 and a
// markdown file missing a provenance tag went red in the same colour. That is
// what taught three separate agents to read past all thirteen in one day.
let TIERS = {};
try {
  TIERS = JSON.parse(readFileSync(path.join(ROOT, "data", "guard_registry.json"), "utf8"))
    .suite_tiers ?? {};
} catch { /* check_red_debt.ts is the reader that validates this */ }
const tierOf = (label) => TIERS[label]?.tier ?? "founder";

const failed = results.filter((r) => r.code !== 0 && tierOf(r.label) === "founder");
const reported = results.filter((r) => r.code !== 0 && tierOf(r.label) === "report");
process.stdout.write(`\n[1m── summary[0m\n`);
for (const r of results) {
  const mark = r.code === 0
    ? "[32m ok  [0m"
    : (tierOf(r.label) === "founder" ? "[31mFAIL[0m" : "[33mnote[0m");
  process.stdout.write(`  ${mark}  ${r.label.padEnd(34)} ${(r.ms / 1000).toFixed(1)}s\n`);
}
if (skipped.length) {
  process.stdout.write(
    `\n  not run (cadence: weekly — \`npm run check --deep\`, or --only=): `
    + `${skipped.join(", ")}\n  Their rows in project-mgmt/check_status.json still age, and `
    + `check_red_debt fails once one passes the cap.\n`);
}
if (reported.length) {
  process.stdout.write(
    `\n[33m${reported.length} report-tier check(s) are red. Recorded, not a build failure:[0m\n`);
  for (const r of reported) {
    process.stdout.write(`  ${r.label}\n      ${r.summary}\n`
      + `      watches: ${TIERS[r.label]?.protects ?? "(undeclared)"}\n`);
  }
}
if (failed.length) {
  // The list, and then the DIFFERENTIATION. Thirteen reds printed as one
  // block is what taught three agents in a row to read past them: a defect,
  // a guard grading the wrong subject and a corpus-state fact owned by a
  // republish take opposite work, and only the registry knows which is which.
  process.stdout.write(
    `\n[31m${failed.length} of ${results.length} failed:[0m `
    + `${failed.map((f) => f.label).join(", ")}\n`
    + `Every check ran. This is the whole list, not the first item on it.\n`);
  // Printed from the registry, never judged here. check_red_debt.ts is the one
  // reader that decides whether an acceptance APPLIES — bound to the failure,
  // dated, capped, classed — because an acceptance interpreted in two places is
  // an acceptance that means two things.
  let rows = [];
  try {
    const reg = JSON.parse(readFileSync(path.join(ROOT, "data", "guard_registry.json"), "utf8"));
    rows = Object.entries(reg.suite_accepted ?? {})
      .filter(([k]) => !k.startsWith("$"))
      .map(([k, v]) => [k, v.class, v.owner, v.review, v.since]);
  } catch (err) {
    process.stdout.write(`\n  (could not read suite_accepted: ${err.message})\n`);
  }
  const unowned = failed.filter((f) => !rows.some(([k]) => k === f.label));
  if (rows.length) {
    process.stdout.write(`\nheld in data/guard_registry.json -> suite_accepted:\n`);
    for (const [k, cls, owner, review, since] of rows) {
      // Against EVERY result, not against `failed` — `failed` is founder-tier
      // only, so a report-tier check that is red was being printed as "now
      // green, delete the entry", which is advice to delete a live entry.
      const live = results.some((r) => r.label === k && r.code !== 0);
      process.stdout.write(
        `  ${live ? "" : "(NOW GREEN, delete the entry) "}${k.padEnd(38)} `
        + `${String(cls).padEnd(13)} ${String(owner).padEnd(20)} `
        + `red since ${since}, review ${review}\n`);
    }
  }
  if (unowned.length) {
    process.stdout.write(
      `\n[31m${unowned.length} of them NOBODY HAS LOOKED AT:[0m `
      + `${unowned.map((f) => f.label).join(", ")}\n`
      + `Fix each, or write it down in data/guard_registry.json -> suite_accepted\n`
      + `with a class, an owner, the date it went red and a review date.\n`
      + `check_red_debt.ts fails \`npx vitest run\` until one or the other happens.\n`);
  }
  process.exit(1);
}
process.stdout.write(`\n[32mall ${results.length} checks passed[0m\n`);
