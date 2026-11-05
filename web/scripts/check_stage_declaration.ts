// A NUMBER PRESENTED AS END-TO-END MUST SAY WHICH PIPELINE IT IS ABOUT.
//
// ── The defect ─────────────────────────────────────────────────────────────
// `runIntelligence` makes a paid, web-search-grounded call on every brief.
// What it returns unions into `fieldChannels`, which decides which channels
// enter the pool at all and sets `usedInField` — tier 1 of the row sort, above
// the entire score. `npm run stages` does not make that call. Neither does
// `npm run trace`. Neither did `_wsdr_curve.ts`, which generated the committed
// pool-recall curve the selector's own prompt quotes its base rate from.
//
// Every one of those numbers was read as end-to-end for weeks, and none of the
// three reports said the stage was missing, because nothing required them to.
// The instrument was not wrong; it was silent about its own subject, which is
// the failure mode this repo pays for over and over.
//
// ── THE PROPERTY ───────────────────────────────────────────────────────────
//
//     A STAGE THE REQUEST PATH RUNS MUST EITHER RUN IN THE HARNESS, OR BE
//     DECLARED ABSENT IN THAT HARNESS'S OWN OUTPUT.
//
// Enforced in two halves, and NEITHER half is a list of stage names:
//
//   THE COMPILER   `HarnessStages` is `Record<PipelineStep, StageDisposition>`
//                  over the request path's own stage vocabulary. A stage added
//                  to `runIntelligence` tomorrow stops every declaring harness
//                  building until somebody answers for it. That is the test for
//                  the unseen STAGE, and it needs nothing from this file.
//
//   THIS CHECK     the test for the unseen HARNESS. Which scripts owe a
//                  declaration is DERIVED, not listed: an npm script whose
//                  import graph reaches `lib/intelligence/memoCandidates` is
//                  reproducing the request path all the way to the candidates a
//                  founder's brief is published from, so whatever it prints
//                  will be read as a statement about the product. Write a new
//                  one tomorrow, wire it into package.json, and it is in scope
//                  on the next run with no edit here.
//
// Why the npm scripts and not all thirty-four files that reach that module: an
// npm script is the surface somebody TYPES and then quotes. A workstream's own
// `_wsXX_` harness answers a question inside one investigation and is read by
// the person who wrote it, in the week they wrote it. Requiring a declaration
// there would be a ceremony, and a ceremony is how a real banner stops being
// read. The line is drawn at package.json rather than at a filename pattern
// because package.json is where this repo says what is standing.
//
// FREE and hermetic: reads source, runs nothing, needs no database.
//
// Run: npx tsx scripts/check_stage_declaration.ts
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = process.cwd();
/** The module that turns a pool into the candidates a brief publishes from.
 *  Reaching it is what makes a script's output a statement about the product
 *  rather than about one of its parts. */
const PUBLISHES_FROM = path.resolve(ROOT, "lib", "intelligence", "memoCandidates.ts");
const DECLARATION = path.resolve(ROOT, "lib", "intelligence", "stageDeclaration.ts");

function walk(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === "node_modules" || name === ".next" || name === "public") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Comments stripped, for the reason check_env_loader strips them: this file,
 *  the module it guards and half the harnesses DESCRIBE the defect in prose,
 *  and a check that cannot tell an explanation from an implementation would
 *  force everyone to stop explaining. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => {
      const i = l.search(/(^|[^:'"`\\])\/\//);
      return i === -1 ? l : l.slice(0, l.indexOf("//", i));
    })
    .join("\n");
}

function resolveImport(fromFile: string, spec: string, known: Set<string>): string | null {
  const target = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [`${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")]) {
    if (known.has(cand)) return cand;
  }
  return null;
}

const SOURCES = new Map(
  [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "scripts"))]
    .map((f) => [path.resolve(f), code(readFileSync(f, "utf8"))] as const),
);
const KNOWN = new Set(SOURCES.keys());
const EDGES = new Map<string, string[]>();
for (const [abs, body] of SOURCES) {
  const out: string[] = [];
  // Static and dynamic both: the harnesses use `await import(...)` precisely so
  // their env preamble runs first, and a graph that followed only `from` would
  // miss every one of them.
  for (const m of body.matchAll(/(?:from|import\()\s*["'](\.[^"']+)["']/g)) {
    const dep = resolveImport(abs, m[1], KNOWN);
    if (dep) out.push(dep);
  }
  EDGES.set(abs, out);
}

function reaches(entry: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(EDGES.get(cur) ?? []));
  }
  return false;
}

/** The scripts this repo says are standing, read out of package.json rather
 *  than matched on a filename convention. */
function npmEntryPoints(): { script: string; file: string }[] {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as
    { scripts: Record<string, string> };
  const out: { script: string; file: string }[] = [];
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    for (const m of cmd.matchAll(/(scripts\/[A-Za-z0-9_.-]+\.tsx?)/g)) {
      const abs = path.resolve(ROOT, m[1]);
      if (KNOWN.has(abs)) out.push({ script: name, file: abs });
    }
  }
  return out;
}

interface Finding { script: string; file: string; why: string }

function audit(): { owed: string[]; findings: Finding[] } {
  const owed: string[] = [];
  const findings: Finding[] = [];
  for (const { script, file } of npmEntryPoints()) {
    if (!reaches(file, PUBLISHES_FROM)) continue;
    owed.push(`${script} (${path.relative(ROOT, file)})`);
    const body = SOURCES.get(file) ?? "";
    // BOTH halves, and the second is the one that matters: importing the
    // module and never rendering it is a declaration nobody reads, which is
    // the same nothing as no declaration at all.
    if (!reaches(file, DECLARATION) || !/renderStageDeclaration\s*\(/.test(body)) {
      findings.push({
        script, file: path.relative(ROOT, file),
        why: !reaches(file, DECLARATION)
          ? "never reaches lib/intelligence/stageDeclaration"
          : "reaches the declaration module but never calls renderStageDeclaration",
      });
    }
  }
  return { owed, findings };
}

/** A check that cannot fail is a check that has already failed. This asks the
 *  graph a question whose answer is known: the declaration module itself does
 *  not reach `memoCandidates`, so a rule that reported it would be matching on
 *  something other than what it claims to. */
function selfTest(): string[] {
  const bad: string[] = [];
  if (reaches(DECLARATION, PUBLISHES_FROM)) {
    bad.push("stageDeclaration.ts reaches memoCandidates.ts — the reachability walk is "
      + "following an edge it should not, so every finding below is suspect");
  }
  if (!reaches(path.resolve(ROOT, "scripts", "measure_funnel.ts"), PUBLISHES_FROM)) {
    bad.push("measure_funnel.ts does NOT reach memoCandidates.ts — the walk found no path "
      + "where one certainly exists, so this check would pass on an empty question");
  }
  return bad;
}

function main(): void {
  const broken = selfTest();
  if (broken.length) {
    for (const b of broken) console.error(`SELF-TEST: ${b}`);
    process.exit(1);
  }
  const { owed, findings } = audit();
  if (!owed.length) {
    // The empty-set pass this repo has shipped before, refused out loud.
    console.error("check_stage_declaration: NO npm script reaches memoCandidates.ts. "
      + "Either the graph is broken or the funnel is gone; either way this check just "
      + "asked a question about nothing.");
    process.exit(1);
  }
  console.log(`check_stage_declaration: ${owed.length} npm script(s) reproduce the request `
    + `path as far as the candidates a brief publishes from:`);
  for (const o of owed) console.log(`  ${o}`);
  if (!findings.length) {
    console.log("ok — every one of them declares, in its own output, what the request path "
      + "does that it does not.");
    return;
  }
  console.error("");
  for (const f of findings) {
    console.error(`FAIL  npm run ${f.script}  (${f.file})`);
    console.error(`      ${f.why}`);
  }
  console.error("");
  console.error("Each of these prints a number that will be read as a statement about the "
    + "product. Declare the request path's stages with `renderStageDeclaration` from "
    + "lib/intelligence/stageDeclaration.ts and print the block. The record is exhaustive "
    + "by the compiler, so the only work is saying, per stage, what this run does.");
  process.exit(1);
}

main();
