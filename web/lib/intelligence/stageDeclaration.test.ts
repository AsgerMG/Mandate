import { describe, expect, it } from "vitest";

import {
  type HarnessStages, renderStageDeclaration, stageAbsent, stageDeclarationDefects,
  stageNotOnThisPath, stageReduced, stageRuns,
} from "./stageDeclaration";

/** The shape a harness declares. Written out here rather than imported from a
 *  script, because importing a harness runs its credential preamble. */
const allRunning: HarnessStages = {
  discovering: stageRuns(),
  querying_db: stageRuns(),
  generating: stageRuns(),
  done: stageRuns(),
};

describe("the stage declaration", () => {
  it("prints one line per stage of the request path, from the record's own keys", () => {
    const lines = renderStageDeclaration("a harness", allRunning);
    for (const step of Object.keys(allRunning)) {
      expect(lines.some((l) => l.includes(step))).toBe(true);
    }
  });

  it("says nothing loud when the harness runs the whole request path", () => {
    expect(renderStageDeclaration("a harness", allRunning).some((l) => l.includes("██")))
      .toBe(false);
  });

  it("banners a stage the harness does not run, and names what is missing", () => {
    const lines = renderStageDeclaration("a harness", {
      ...allRunning,
      discovering: stageAbsent("No comparable company reaches `fieldChannels`."),
    });
    const banner = lines.find((l) => l.includes("██"));
    expect(banner).toContain("discovering");
    expect(banner).toContain("ABSENT");
    expect(banner).toContain("fieldChannels");
  });

  it("banners a reduced stage too — half a stage is not a stage", () => {
    const lines = renderStageDeclaration("a harness", {
      ...allRunning,
      querying_db: stageReduced("Peers only; no web-found record is matched."),
    });
    expect(lines.find((l) => l.includes("██"))).toContain("REDUCED");
  });

  // The rule this module exists for. A declaration that says a stage is gone
  // without saying what went with it is decoration, and this repo has shipped
  // a green check whose subject was an empty set.
  it("REFUSES a stage declared absent with nothing said about what is missing", () => {
    const bad: HarnessStages = { ...allRunning, discovering: stageAbsent("   ") };
    expect(stageDeclarationDefects(bad)).toHaveLength(1);
    expect(() => renderStageDeclaration("a harness", bad)).toThrow(/what is missing/);
  });

  // The escape hatch, and the reason it is not one. The instant verdict route
  // is model-free by contract and never calls the comparable search, so a
  // harness reproducing THAT path is not short a stage — it is measuring a path
  // that does not have it. What the state costs is a sentence naming the path,
  // and that sentence is what a reader checks the claim against.
  it("does not banner a stage the harness's own request path does not have", () => {
    const lines = renderStageDeclaration("a screen harness", {
      ...allRunning,
      discovering: stageNotOnThisPath(
        "`computeVerdict`, the instant verdict route, which is model-free by contract"),
    });
    expect(lines.some((l) => l.includes("██"))).toBe(false);
    expect(lines.find((l) => l.includes("discovering"))).toContain("not on this path");
  });

  it("REFUSES not-on-this-path without naming the path", () => {
    const bad: HarnessStages = { ...allRunning, discovering: stageNotOnThisPath("") };
    expect(stageDeclarationDefects(bad)).toHaveLength(1);
    expect(() => renderStageDeclaration("a harness", bad))
      .toThrow(/which request path this run reproduces/);
  });

  // The test for an unseen case is the TYPE, so state what the type is over.
  // If `PipelineStep` gains a member, this object stops compiling — which is
  // the whole enforcement, and it is worth a test that says so out loud.
  it("is exhaustive over the request path's own stage vocabulary", () => {
    const declared = new Set(Object.keys(allRunning));
    // Every key of a Record<PipelineStep, …> is a PipelineStep, and the object
    // literal above cannot omit one. So this asserts the count only — the
    // compiler asserts the identity.
    expect(declared.size).toBeGreaterThan(0);
    expect(stageDeclarationDefects(allRunning)).toEqual([]);
  });
});
