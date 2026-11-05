// A STAGE THE REQUEST PATH RUNS MUST EITHER RUN IN THE HARNESS, OR BE DECLARED
// ABSENT IN THAT HARNESS'S OWN OUTPUT.
//
// ── What this exists to stop happening again ───────────────────────────────
// `discoverAndResearch` is a paid, web-search-grounded model call the request
// path makes on EVERY brief. Its matched output unions into `fieldChannels`
// (pipeline.ts, in `runIntelligence`), and `fieldChannels` does two things that
// decide what a founder reads: it seeds `codes` in `selectInstrumentRows`,
// which is WHICH CHANNELS ARE IN THE POOL AT ALL, and it sets `usedInField`,
// which is TIER 1 OF THE ROW SORT, compared above the entire score.
//
// Not one free instrument in this repo runs it. `measure_funnel.ts` -- what
// `npm run stages` runs, and where the funnel number comes from -- builds
// `fieldChannels` from `dbPeers` alone and passes `records: []`. So does
// `_wsdr_curve.ts`, which generated the committed pool-recall curve the
// selector's own prompt quotes its base rate from. So does every harness in
// `scripts/`. Measured on the fifty-one recovered production runs in
// `project-mgmt/findings/stage_declared_wsIM/`, that stage added at least one
// channel on 27 of them; on the funnel's own 897 founders `fieldChannels` is
// EMPTY on 308.
//
// None of that makes the funnel number wrong. It makes it a number about a
// pipeline, and the report never said WHICH pipeline. This module is how it
// says so.
//
// ── The property, and the test for an unseen case ──────────────────────────
// `PipelineStep` is the request path's own vocabulary for its stages: the
// literals `runIntelligence` emits and the panel renders to the founder while
// they wait. A harness that reproduces the request path declares a disposition
// for EVERY member of it, and `Record<PipelineStep, StageDisposition>` is what
// enforces that -- the compiler, not a list in a check. Add a stage to the
// request path tomorrow and every harness fails to build until it answers for
// it, whether or not anyone remembers this file exists.
//
// That is deliberately not an enumeration of stage names. `check_contracts`
// fails the build on a rule that names its cases, and a check holding a list of
// stages would be exactly that: correct today, silently short the day a stage
// is added, which is the failure it would exist to prevent.
//
// Nothing here is allowed to say a stage is missing WITHOUT SAYING WHAT IS
// MISSING. "absent" with an empty reason is how a banner becomes decoration,
// and this repo has shipped a check that printed `ok -- every value carried by
// the 0 publishable instruments is reachable`.
import type { PipelineStep } from "./types";

export type StageDisposition =
  /** The harness runs this stage as the request path runs it. */
  | { state: "runs" }
  /** The harness runs it, but not on everything the request path gives it.
   *  `missing` names what it does not see. */
  | { state: "reduced"; missing: string }
  /** The harness does not run this stage at all. `missing` names what the
   *  request path gets from it that this run therefore never had. */
  | { state: "absent"; missing: string }
  /** THE ONE THING "the request path" GLOSSES OVER, and it is not a loophole.
   *  There are two request paths, not one. `/api/intelligence`'s memo route
   *  runs `runIntelligence`, which calls `discoverAndResearch`. The instant
   *  verdict route runs `computeVerdict`, which is MODEL-FREE BY CONTRACT and
   *  never has. A harness reproducing the second one faithfully owes no
   *  apology for a stage the second one does not have, and forcing it to
   *  declare that stage ABSENT would make the banner mean two different things.
   *
   *  So this state exists, and it costs the author a sentence naming WHICH
   *  path they reproduce -- which is exactly the sentence a reader needs to
   *  tell an honest use of it from a dodge. `measure_funnel` may not use it for
   *  `discovering`: it cuts to the writer's candidates and reports EXACT@K on
   *  that order, which is the memo's path and not the screen's. */
  | { state: "not_on_this_path"; path: string };

/** Compiler-exhaustive over the request path's own stages. This type, and not
 *  any check, is the test for an unseen case. */
export type HarnessStages = Record<PipelineStep, StageDisposition>;

export const stageRuns = (): StageDisposition => ({ state: "runs" });
export const stageReduced = (missing: string): StageDisposition =>
  ({ state: "reduced", missing });
export const stageAbsent = (missing: string): StageDisposition =>
  ({ state: "absent", missing });
export const stageNotOnThisPath = (path: string): StageDisposition =>
  ({ state: "not_on_this_path", path });

/** Every way a declaration can be true in the type system and useless on the
 *  page. Exported so the test states the rule once and the renderer enforces
 *  it on every run rather than trusting the author. */
export function stageDeclarationDefects(stages: HarnessStages): string[] {
  const out: string[] = [];
  for (const [step, d] of Object.entries(stages) as [PipelineStep, StageDisposition][]) {
    if (d.state === "runs") continue;
    const said = d.state === "not_on_this_path" ? d.path : d.missing;
    if (!said.trim()) {
      out.push(`stage \`${step}\` is declared ${d.state} with no statement of `
        + (d.state === "not_on_this_path" ? "which request path this run reproduces"
          : "what is missing"));
    }
  }
  return out;
}

/**
 * The declaration block, in the register the report already uses for its
 * levers line and its not-the-shipped-order banner: one line per stage, and a
 * loud paragraph for anything the run did not do.
 *
 * Keyed off `Object.keys(stages)` and not off a list written here, so the
 * block grows with the type. Returns lines rather than printing, so the funnel
 * can put them inside its fenced header and a bench can put them on stdout.
 */
export function renderStageDeclaration(harness: string, stages: HarnessStages): string[] {
  const defects = stageDeclarationDefects(stages);
  if (defects.length) {
    throw new Error(
      `${harness}: the stage declaration is not readable as written — ${defects.join("; ")}. `
      + `A stage declared absent without naming what is missing is a banner, not a `
      + `declaration, and the whole point of the block is that a number cannot be `
      + `quoted as end-to-end while a stage of the request path is stubbed out.`);
  }
  const entries = Object.entries(stages) as [PipelineStep, StageDisposition][];
  const pad = Math.max(...entries.map(([s]) => s.length));
  const lines = [
    `request stages     ${harness} against \`runIntelligence\`, stage by stage`,
  ];
  for (const [step, d] of entries) {
    if (d.state === "runs") { lines.push(`  ${step.padEnd(pad)}  runs`); continue; }
    if (d.state === "not_on_this_path") {
      lines.push(`  ${step.padEnd(pad)}  not on this path — ${d.path}`);
      continue;
    }
    lines.push(`  ${step.padEnd(pad)}  ${d.state.toUpperCase()} — ${d.missing}`);
  }
  // A stage the harness's OWN request path does not have is not a stub, so it
  // does not banner. Everything else does.
  const stubbed = entries.filter(
    (e): e is [PipelineStep, Extract<StageDisposition, { missing: string }>] =>
      e[1].state === "absent" || e[1].state === "reduced");
  for (const [step, d] of stubbed) {
    lines.push("");
    lines.push(`██ THE REQUEST PATH'S \`${step}\` STAGE IS ${d.state.toUpperCase()} IN THIS RUN. `
      + `${d.missing} Every number below is a measurement of a pipeline that `
      + `${d.state === "absent" ? "DOES NOT HAVE that stage" : "runs that stage on less than the request path hands it"}`
      + `, not of the one a founder is served. Do not quote a figure from this run as `
      + `end-to-end without saying so.`);
  }
  return lines;
}
