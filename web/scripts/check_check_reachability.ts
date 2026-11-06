/**
 * A rule is enforced when the check that decides it CAN RUN on a request.
 *
 * FREE — reads the import graph. No model calls, no DB, no credentials.
 *
 * ── The defect this closes, and the exact sentence that made it costly ─────
 *
 * `scripts/check_contracts.ts` builds its set of enforced rules like this:
 *
 *     const enforced = new Set([...CHECK_RULE_IDS, ...QUESTION_RULE_IDS,
 *                               ...SELECTION_RULE_IDS, ...RANKER_ASK_RULE_IDS]);
 *
 * and then fails the build for any contract rule that is in neither that set
 * nor the unenforced register. It is a good check and it grades the wrong
 * thing: a rule counts as enforced because an ARRAY LITERAL NAMES IT. Whether
 * the function that decides the rule is ever called is not asked.
 *
 * On the day this was written that gap was not hypothetical. `checkSelection`
 * — the decider for SELECT-1 and SELECT-2 — had call sites in one bench script
 * and one unit test, and NONE anywhere a founder's request could reach. Two
 * rules were counted enforced and were enforced nowhere. Meanwhile the
 * selector's own system prompt told the model, verbatim, that "rules marked
 * (hard) are checked mechanically after you reply". We told a model something
 * untrue and the build agreed with us.
 *
 * `checkQuestions` and `checkGroundedQuestions` were in the same state, on six
 * more rules, for the same reason: two bench scripts and no request path.
 *
 * ── The property ───────────────────────────────────────────────────────────
 *
 *   A RULE ID COUNTS AS ENFORCED ONLY IF THE MODULE EXPORTING ITS `*_RULE_IDS`
 *   IS TRANSITIVELY IMPORT-REACHABLE FROM A REQUEST ENTRY POINT.
 *
 * Derived, not enumerated. The rule-id modules are DISCOVERED by their export
 * shape rather than listed here, so a fifth check module written tomorrow is
 * judged with no edit in this file — which is the same reason `check_contracts`
 * discovers contract directories instead of naming three of them.
 *
 * The entry points are the two things a founder's request runs: the memo
 * pipeline, and every route under `app/api/`. Both, because the two halves of
 * this product's checking live on either side of that split — the brief's rules
 * are decided inside `pipeline.ts` and the screen's rules are decided in the
 * intake route, and a guard that knew only one of them would licence the other
 * to rot.
 *
 * ── AND THE SAME PROPERTY ONE LEVEL DOWN, BECAUSE THE FIRST ONE IS CHEAP ──
 *
 *   EVERY `check*` FUNCTION A RULE-ID MODULE EXPORTS IS NAMED SOMEWHERE ON
 *   THE REQUEST PATH.
 *
 * Module reach alone is bought by ONE call. `questionChecks.ts` exports three
 * deciders covering seven rules; wiring `checkScreenFields` into the intake
 * route makes the module reachable and would have reported all seven enforced
 * while `checkQuestions` (Q-1..Q-5) and `checkGroundedQuestions` (Q-10) were
 * still called by nothing but two bench scripts. That is the original defect —
 * a literal standing in for an enforcement — arriving one level down, and a
 * guard that could not see it would have licensed exactly the state it was
 * written to end. It was the true state of this module on the day both
 * properties were written.
 *
 * Still derived, not enumerated: the functions are DISCOVERED from each rule-id
 * module's own exports, so a fourth decider added to any of them is judged with
 * no edit here.
 *
 * ── What "reachable" is and is not ─────────────────────────────────────────
 * Import reach is a NECESSARY condition and not a sufficient one: a module can
 * be imported and its function never called. The name test above closes the gap
 * that matters and does not close it completely — a call inside a branch no
 * request takes is still a name on the request path. The stronger claim, "this
 * function runs on every request", is not decidable statically without becoming
 * a register of call sites. Where the call site itself matters,
 * `contractReach.test.ts` asserts it directly, by reading the pipeline's source
 * for the call.
 *
 * A name, not a parsed call expression, for the same reason `check_doc_
 * identifiers` resolves generously: the question is "is this decider wired in
 * at all", and a guard that answered a narrower one would start failing on
 * legitimate indirection and be turned off. Comments are stripped first, so a
 * function named only in an explanation of why it is NOT called — which is the
 * exact shape this repo writes — does not resolve.
 *
 * Prove it can fail:
 *   PROVE=1 npx tsx scripts/check_check_reachability.ts
 */
import { readFileSync } from "fs";
import path from "path";

import { code, reachable, walk } from "./_import_graph";

const ROOT = process.cwd();
const LIB = path.join(ROOT, "lib");
const APP = path.join(ROOT, "app");

/** The memo path. `runIntelligence` and `computeVerdict` both live here. */
const PIPELINE = path.join(LIB, "intelligence", "pipeline.ts");

/** A module declares the rules it can decide by exporting them. Matched on the
 *  SHAPE of that declaration, so the set of check modules is discovered rather
 *  than listed — the same reason `check_contracts` discovers contract
 *  directories. */
const RULE_IDS_EXPORT = /export\s+const\s+([A-Z][A-Z0-9_]*_RULE_IDS)\s*(?::[^=]+)?=\s*\[([^\]]*)\]/g;

/** A decider: an exported function whose name says it decides rules. Discovered
 *  from the module's own exports, so a fourth one added tomorrow is judged with
 *  no edit here. */
const CHECK_EXPORT = /export\s+(?:async\s+)?function\s+(check[A-Z]\w*)/g;

interface RuleModule {
  file: string;
  exportName: string;
  ids: string[];
  /** Every `check*` the module exports. Empty is possible and is not a defect:
   *  a module may declare ids it decides through a differently named entry. */
  deciders: string[];
}

function ruleModules(files: string[]): RuleModule[] {
  const out: RuleModule[] = [];
  for (const f of files) {
    const src = code(readFileSync(f, "utf8"));
    const deciders = [...src.matchAll(CHECK_EXPORT)].map((m) => m[1]);
    for (const m of src.matchAll(RULE_IDS_EXPORT)) {
      const ids = [...m[2].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
      out.push({ file: f, exportName: m[1], ids, deciders });
    }
  }
  return out;
}

/** Every identifier named anywhere on the request path, comments stripped.
 *  Comments matter: this repo writes long explanations of why a thing is NOT
 *  called, and a decider that resolved against its own obituary would be
 *  reported as wired in. */
function namesOnPath(inPath: Set<string>, ownFiles: Set<string>): string {
  const parts: string[] = [];
  for (const f of inPath) {
    // A module does not wire itself in. `questionChecks.ts` names all three of
    // its own deciders simply by declaring them.
    if (ownFiles.has(f)) continue;
    try { parts.push(code(readFileSync(f, "utf8"))); } catch { /* unreadable */ }
  }
  return parts.join("\n");
}

function main() {
  const files = [...walk(LIB), ...walk(APP)];
  const known = new Set(files);

  // Every route under app/api is a thing a founder's browser can call. Found by
  // the framework's own file convention rather than by a list, so a route added
  // tomorrow is an entry point with no edit here.
  const routes = files.filter(
    (f) => f.startsWith(APP + path.sep) && path.basename(f) === "route.ts");
  const entries = [PIPELINE, ...routes];

  const missing = entries.filter((e) => !known.has(e));
  if (missing.length) {
    console.error(`check_check_reachability: cannot find entry point(s):\n` +
      missing.map((m) => `  ${path.relative(ROOT, m)}`).join("\n"));
    process.exit(1);
  }

  const inPath = reachable(entries, known, ROOT);
  const modules = ruleModules(files);

  // ── Anti-vacuity, twice ──────────────────────────────────────────────────
  // A check that reaches nothing, or finds nothing to judge, reports green
  // forever. Both halves of this one can fail that way independently: the
  // resolver can break, and the export-shape regex can stop matching.
  if (inPath.size < 20) {
    console.error(`check_check_reachability: FAILED — the import graph resolved to only ` +
      `${inPath.size} module(s) from ${entries.length} entry point(s). That is not the ` +
      `request path; the resolver is broken and a green result would be meaningless.`);
    process.exit(1);
  }
  if (modules.length < 2) {
    console.error(`check_check_reachability: FAILED — found ${modules.length} module(s) ` +
      `exporting a *_RULE_IDS array. The repo has several; the discovery pattern has ` +
      `stopped matching and this check is grading nothing.`);
    process.exit(1);
  }

  const ownFiles = new Set(modules.map((m) => m.file));
  const onPath = namesOnPath(inPath, ownFiles);
  if (onPath.length < 10_000) {
    console.error(`check_check_reachability: FAILED — the request path's sources read to ` +
      `only ${onPath.length} character(s). Nothing could resolve against that, so every ` +
      `decider would report as wired in or none would, and either way this is grading ` +
      `nothing.`);
    process.exit(1);
  }

  const problems: string[] = [];
  let deciderCount = 0;
  let wired = 0;
  for (const m of modules.sort((a, b) => a.file.localeCompare(b.file))) {
    if (!inPath.has(m.file)) {
      problems.push(
        `  ${path.relative(ROOT, m.file)}\n` +
        `      exports ${m.exportName} (${m.ids.join(", ")}), and no request can reach it.\n` +
        `      Those ${m.ids.length} rule(s) are counted enforced by check_contracts and are\n` +
        `      enforced on nothing a founder is ever handed.`);
      continue;
    }
    // Reachable. Now the finer question: is every decider it exports actually
    // named out here, or did one call buy the whole module a clean bill?
    for (const d of m.deciders) {
      deciderCount++;
      if (new RegExp(`\\b${d}\\b`).test(onPath)) { wired++; continue; }
      problems.push(
        `  ${path.relative(ROOT, m.file)}\n` +
        `      exports ${d}(), and nothing on the request path names it — while the\n` +
        `      module IS reachable, so ${m.exportName} (${m.ids.join(", ")}) reads as\n` +
        `      enforced. One decider wired in does not enforce the rest.`);
    }
  }

  if (process.env.PROVE) {
    console.log(`  PROVE: ${inPath.size} modules reachable from ${entries.length} entry ` +
      `point(s) (${path.relative(ROOT, PIPELINE)} + ${routes.length} API route(s))`);
    console.log(`  PROVE: ${modules.length} rule-id module(s) discovered, ` +
      `${modules.reduce((n, m) => n + m.ids.length, 0)} rule id(s) between them`);
    console.log(`  PROVE: ${wired}/${deciderCount} exported check function(s) named on the ` +
      `request path`);
    console.log(`  PROVE: deleting the production call to a check — which is the state`);
    console.log(`         SELECT-1 and SELECT-2 were found in — makes this red, because`);
    console.log(`         nothing on the request path would import the module any more.`);
    console.log(`  PROVE: deleting ONE of three calls into a module that keeps the other`);
    console.log(`         two — the state checkQuestions and checkGroundedQuestions were`);
    console.log(`         in — makes this red on the second property, not the first.`);
  }

  if (problems.length) {
    console.error(`\ncheck_check_reachability: FAILED — ${problems.length} finding(s): a rule ` +
      `is declared enforced and its decider cannot run:\n`);
    for (const p of problems) console.error(p);
    console.error(`\nA rule counts as enforced when the check that decides it can run on a`);
    console.error(`request. Either call the check from the request path — observationally,`);
    console.error(`like checkBrief at the end of synthesize: record, never repair, never`);
    console.error(`gate — or move its rules into unenforcedRules.ts and say why they cannot`);
    console.error(`run. What is not available is counting them enforced because a literal`);
    console.error(`names them, least of all while a system prompt tells a model they are`);
    console.error(`"checked mechanically after you reply".\n`);
    process.exit(1);
  }

  console.log(`check_check_reachability: ok — ${modules.length} check module(s) with ` +
    `${modules.reduce((n, m) => n + m.ids.length, 0)} rule id(s), every module reachable ` +
    `from a request entry point and all ${deciderCount} exported decider(s) named there ` +
    `(${inPath.size} modules in path, ${routes.length} API routes).`);
}

main();
