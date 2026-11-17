import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendOwnerReview, brainOfScenario, needsFor, readScenarioHead } from "./needs";

const CASE = `# a comment
id: heldout_x
job: funding-routes
status: draft_pending_owner
founder_says: >
  We make sensors.
  What money is there?
must:
  - Works the regional level as its own door.
  - "Cites the rule: no figure without a source."
  - A long check that goes on
    over two lines.
must_not:
  - Treats the region as a footnote.
`;

describe("reading a scenario", () => {
  it("reads the scalars, the folded ask and both lists, including quoted and wrapped items", () => {
    const h = readScenarioHead(CASE);
    expect(h).toMatchObject({ id: "heldout_x", job: "funding-routes", status: "draft_pending_owner", founder_says: "We make sensors. What money is there?" });
    expect(h.must).toEqual(["Works the regional level as its own door.", "Cites the rule: no figure without a source.", "A long check that goes on over two lines."]);
    expect(h.must_not).toEqual(["Treats the region as a footnote."]);
  });
  it("assigns a case to its brain by the same rule as the eval loop", () => {
    expect(brainOfScenario("heldout_bnpl", "policy-regulatory")).toBe("regina");
    expect(brainOfScenario("fintech_guarantees", "funding-routes")).toBe("wincent");
  });
});

describe("needs you", () => {
  let repo: string; let data: string;
  beforeEach(() => {
    repo = mkdtempSync(path.join(os.tmpdir(), "needs-repo-")); data = mkdtempSync(path.join(os.tmpdir(), "needs-data-"));
    process.env.MANDATE_BENCH_ROOT = repo; process.env.MANDATE_BENCH_DATA = data;
    mkdirSync(path.join(repo, "mandate/eval/scenarios"), { recursive: true });
    mkdirSync(path.join(repo, "mandate/eval/loop/proposals"), { recursive: true });
    writeFileSync(path.join(repo, "mandate/eval/scenarios/heldout_x.yaml"), CASE);
    writeFileSync(path.join(repo, "mandate/eval/scenarios/regina_y.yaml"), CASE.replace("heldout_x", "regina_y").replace("funding-routes", "policy-regulatory").replace("draft_pending_owner", "draft_pending_expert"));
    writeFileSync(path.join(repo, "mandate/eval/loop/proposals/02_status_unlocks.md"), "# Proposal 2\nthe diff");
    writeFileSync(path.join(repo, "mandate/eval/loop/log.jsonl"), [
      { step: "propose", n: 2, brain: "wincent", check: "status_unlocks" },
      { step: "decide", proposal: 2, verdict: "KEEP", rows: [{ case: "fintech", before: 3, after: 4 }] },
      { step: "propose", n: 3, brain: "wincent", check: "status_unlocks" },
      { step: "decide", proposal: 3, verdict: "REVERT", rows: [] },
    ].map((r) => JSON.stringify(r)).join("\n") + "\n");
  });
  afterEach(() => { delete process.env.MANDATE_BENCH_ROOT; delete process.env.MANDATE_BENCH_DATA; });

  it("lists only this brain's asks: a kept change (not a reverted one) and the case checks", () => {
    const w = needsFor("wincent").needs;
    expect(w.map((n) => `${n.kind}:${n.ref}`)).toEqual(["approve:proposal:2", "confirm:case:heldout_x"]);
    expect(w[0].body?.markdown).toContain("the diff");
    expect(w[1].body?.must).toHaveLength(3);
    const r = needsFor("regina").needs;
    expect(r.map((n) => `${n.kind}:${n.ref}`)).toEqual(["expert:case:regina_y"]);
  });
  it("an answered ask leaves the list", () => {
    appendOwnerReview({ kind: "approve", ref: "proposal:2", verdict: "ok", note: "", at: "2026-11-17T00:00:00Z" });
    appendOwnerReview({ kind: "confirm", ref: "case:heldout_x", verdict: "change", note: "check 2 is too strict", at: "2026-11-17T00:00:00Z" });
    expect(needsFor("wincent").needs).toEqual([]);
  });
});
