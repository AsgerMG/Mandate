import { describe, expect, it } from "vitest";
import {
  foldFeedback, groupSources, initialStatus, lineDiff, parseGrade, parseProposals, parseScenario, parseScore, proposalPathOk, rollup, runBrain, titleFrom,
  validateMandateInput, withoutProposals, writeGrade, type BenchConversation,
} from "./model";

const conv = (id: string, texts: string[], extra: Partial<BenchConversation> = {}): BenchConversation => ({
  id, mandate_id: "m-test-1", agent: "wincent", brain: "wincent", kind: "chat", title: id, session_id: null,
  messages: texts.map((t, i) => ({ role: i % 2 ? "agent" : "client", text: t, at: `2026-11-1${i}T10:00:00Z` })),
  cites: {}, sources: [], saved: [], created_at: `2026-11-10T0${id.length}:00:00Z`, updated_at: "2026-11-12T10:00:00Z", ...extra,
});

describe("titleFrom", () => {
  it("takes the first sentence and cuts long ones at a word", () => {
    expect(titleFrom("We are a fintech lender. We raised EUR 40M.")).toBe("We are a fintech lender");
    const t = titleFrom("We deploy industrial robots in SME factories on a robots-as-a-service model across the whole of northern Italy");
    expect(t.length).toBeLessThanOrEqual(65);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("validateMandateInput", () => {
  it("requires a client name and normalises markets", () => {
    expect(validateMandateInput({}).ok).toBe(false);
    const v = validateMandateInput({ client: " Acme ", markets: "DE, FR,,DE", status: "active" });
    expect(v).toEqual({ ok: true, value: { brains: ["wincent", "regina"], client: "Acme", brief: "", profile: "", markets: ["DE", "FR"], status: "active" } });
  });
  it("rejects a bad status and over-long text; a partial update touches only what is sent", () => {
    expect(validateMandateInput({ client: "A", status: "won" }).ok).toBe(false);
    expect(validateMandateInput({ client: "A", brief: "x".repeat(5000) }).ok).toBe(false);
    expect(validateMandateInput({ status: "paused" }, true)).toEqual({ ok: true, value: { status: "paused" } });
  });
});

describe("rollup", () => {
  it("collects decisions, steps and watches across conversations, once each", () => {
    const a = conv("a", ["q", "## Decisions\n- Go EU first\n\n## Watches\n- The KfW reform"]);
    const b = conv("bb", ["q", "## Decisions\n- Go EU first\n- Park Italy\n\n**Next step:** call the EIF"]);
    const r = rollup([b, a]);
    expect(r.decisions.map((d) => d.text)).toEqual(["Go EU first", "Park Italy"]);
    expect(r.watches.map((d) => d.text)).toEqual(["The KfW reform"]);
    expect(r.steps.map((d) => d.text)).toEqual(["call the EIF"]);
    expect(r.last_activity).toBe("2026-11-12T10:00:00Z");
  });
});

describe("groupSources", () => {
  it("shows one row per document with every citation into it", () => {
    const g = groupSources({
      c2: { label: "GBER", url: "https://eur-lex.europa.eu/x#art2" },
      c1: { label: "GBER", url: "https://eur-lex.europa.eu/x" },
      c10: { label: "KfW page", url: "https://kfw.de/a" },
    }, [{ url: "https://kfw.de/a", label: "kfw.de" }, { url: "https://bmwk.de", label: "bmwk.de" }]);
    expect(g).toEqual([
      { label: "GBER", url: "https://eur-lex.europa.eu/x", ids: ["c1", "c2"] },
      { label: "KfW page", url: "https://kfw.de/a", ids: ["c10"] },
      { label: "bmwk.de", url: "https://bmwk.de", ids: [] },
    ]);
  });
});

describe("proposals", () => {
  const reply = "Habits:\n- check the stage first\n\n````file path=mandate/playbooks/policy-watch.md\n# Watch\n\n```\ncode\n```\n````\n\n````file path=web/app/evil.ts\nx\n````\n\n````file path=mandate/eval/scenarios/travel_dma.yaml\nid: travel_dma\n````";
  it("reads the file blocks the app may write, and only those", () => {
    expect(parseProposals(reply)).toEqual([
      { path: "mandate/playbooks/policy-watch.md", content: "# Watch\n\n```\ncode\n```\n", addresses: [] },
      { path: "mandate/eval/scenarios/travel_dma.yaml", content: "id: travel_dma\n", addresses: [] },
    ]);
    expect(withoutProposals(reply)).toContain("*Proposed file: `mandate/playbooks/policy-watch.md` (see Proposed changes)*");
  });
  it("refuses paths outside playbooks and scenarios", () => {
    for (const p of ["mandate/playbooks/../../.env", "mandate/playbooks/a/b.md", "/etc/passwd", "mandate/eval/scenarios/x.md", ".claude/agents/wincent.md"])
      expect(proposalPathOk(p)).toBe(false);
    expect(proposalPathOk("mandate/playbooks/interviews/x.md")).toBe(false);
    expect(proposalPathOk("mandate/playbooks/regina.md")).toBe(true);
  });
  it("diffs line by line", () => {
    expect(lineDiff("a\nb\nc\n", "a\nc\nd\n")).toEqual([{ op: " ", text: "a" }, { op: "-", text: "b" }, { op: " ", text: "c" }, { op: "+", text: "d" }]);
    expect(lineDiff("", "new\n")).toEqual([{ op: "+", text: "new" }]);
  });
});

describe("grading block", () => {
  const empty = "# Bench run: x\n\nbody\n\n## Grade (owner)\n\n```\ngrade:\nmust/must_not:\nedits: |\nplaybook: |\n```\n";
  const draft = "# Bench run\n\n## Grade (expert, module 7)\n\n```\ngrade: 1-5          # 5 send\nwrong: |            # what is wrong\nmissing: |\n```\n\ntrailer\n";
  it("reads no grade from an empty or placeholder block", () => {
    expect(parseGrade(empty).grade).toBeNull();
    expect(parseGrade(draft).grade).toBeNull();
    expect(parseGrade("no block").grade).toBeNull();
  });
  it("writes the grade, keeps the keys it does not own, and reads it back", () => {
    const next = writeGrade(empty, { grade: 3, off: "Italy is wrong.\nGermany too.", rewrite: "Start with the EIF." }, "2026-11-12T10:00:00Z");
    expect(parseGrade(next)).toEqual({ grade: 3, off: "Italy is wrong.\nGermany too.", rewrite: "Start with the EIF.", graded_at: "2026-11-12T10:00:00Z" });
    expect(next).toContain("must/must_not:");
    expect(next).toContain("playbook: |");
    expect(next.startsWith("# Bench run: x\n\nbody\n\n## Grade (owner)")).toBe(true);
    const again = writeGrade(next, { grade: 4, off: "", rewrite: "" }, "2026-11-13T10:00:00Z");
    expect(parseGrade(again).grade).toBe(4);
    expect(again.match(/## Grade/g)).toHaveLength(1);
    expect(again.match(/^grade:/gm)).toHaveLength(1);
  });
  it("keeps what follows the block and the expert's extra fields", () => {
    const next = writeGrade(draft, { grade: 2, off: "naive", rewrite: "" }, "t");
    expect(next).toContain("missing: |");
    expect(next.trimEnd().endsWith("trailer")).toBe(true);
  });
  it("adds a block to a run that has none", () => {
    expect(parseGrade(writeGrade("# Run\n", { grade: 5, off: "", rewrite: "" }, "t")).grade).toBe(5);
  });
});

describe("runBrain", () => {
  it("reads the brain from the transcript head or the file name", () => {
    expect(runBrain("# Bench run\nRegina asked first", "2026-11-11_x.md")).toBe("regina");
    expect(runBrain("# Bench run", "2026-11-11_ai_kids_regulatory_DRAFT.md")).toBe("regina");
    expect(runBrain("# Bench run: robotics", "2026-11-11_robotics.md")).toBe("wincent");
  });
});

describe("the feedback loop pieces", () => {
  it("folds item and status events, newest first, keeping the last status", () => {
    const base = { kind: "reply", brain: "wincent", rating: "off", grade: null, theme: "facts", note: "", mandate_id: null, conversation_id: "c-1", message_index: 1, run_file: null, excerpt: "", playbooks: { sha: null, dirty: false, files: [] as string[] }, status: "open" } as const;
    const items = foldFeedback([
      { type: "item", item: { ...base, id: "f-aaaaaa", created_at: "2026-11-01" } },
      { type: "item", item: { ...base, id: "f-bbbbbb", created_at: "2026-11-02" } },
      { type: "status", id: "f-aaaaaa", status: "dismissed", at: "t1", by: "dismissed" },
      { type: "status", id: "f-aaaaaa", status: "open", at: "t2", by: "reopened" },
      { type: "status", id: "f-unknown", status: "resolved", at: "t3", by: "accepted" },
    ]);
    expect(items.map((i) => [i.id, i.status])).toEqual([["f-bbbbbb", "open"], ["f-aaaaaa", "open"]]);
    expect(initialStatus({ kind: "reply", rating: "good", grade: null, note: "" })).toBe("noted");
    expect(initialStatus({ kind: "reply", rating: "good", grade: null, note: "but shorter" })).toBe("open");
    expect(initialStatus({ kind: "conversation", rating: null, grade: 3, note: "" })).toBe("open");
  });
  it("reads a scenario's fields and a grader's SCORE line", () => {
    const s = parseScenario("# c\nid: x_case\njob: funding-routes\nfounder_says: >\n  We lend.\n  To SMEs.\nfounder_followup: >\n  German GmbH.\nmust:\n  - one\n  - \"two: quoted\"\n    continued\nmust_not:\n  - three\nmodel_answer: >\n  no\n");
    expect(s).toEqual({ id: "x_case", job: "funding-routes", founder_says: "We lend. To SMEs.", founder_followup: "German GmbH.", must: ["one", "two: quoted continued"], must_not: ["three"] });
    expect(parseScore('x\nSCORE {"must_met": 2, "must_total": 5, "must_not_hit": 1, "must_not_total": 3, "grade": 3}')).toEqual({ must_met: 2, must_total: 5, must_not_hit: 1, must_not_total: 3, grade: 3 });
    expect(parseScore("no score")).toBeNull();
    expect(parseScore('SCORE {"grade": 9}')).toBeNull();
  });
  it("reads the feedback a proposal addresses", () => {
    expect(parseProposals("````file path=mandate/playbooks/regina.md addresses=f-abc123,f-def456,../x\nbody\n````")[0].addresses).toEqual(["f-abc123", "f-def456"]);
  });
});
