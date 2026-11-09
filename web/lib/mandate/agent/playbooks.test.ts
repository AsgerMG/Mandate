import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPlaybooks, renderGenerated } from "./playbooksSource";
import { PLAYBOOKS } from "./playbooks.generated";

describe("playbooks ship as written", () => {
  it("the generated module equals mandate/playbooks (run scripts/emit_playbooks.ts)", () => {
    const want = renderGenerated(readPlaybooks());
    const have = readFileSync(resolve(__dirname, "playbooks.generated.ts"), "utf8");
    expect(have).toBe(want);
  });

  it("carries the method, both personas, and the funding-routes job", () => {
    expect(PLAYBOOKS.core.method).toContain("Grounded or labelled");
    expect(PLAYBOOKS.core.wincent).toContain("Wincent");
    expect(PLAYBOOKS.core.regina).toContain("Regina");
    expect(PLAYBOOKS.jobs["funding-routes"].text).toContain("Hausbank");
  });
});
