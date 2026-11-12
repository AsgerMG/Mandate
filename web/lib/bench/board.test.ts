import { describe, expect, it } from "vitest";
import { boardBlocks, boardIsEmpty, flowLayers, foldBoard, money, moneyRange, monthsOf, readBoard, splitCite, withoutBoard } from "./board";
import { BOARD_FIXTURES, FINTECH, FORKLIFT } from "./board-fixtures";
import { parseLanded } from "./events";

const fence = (o: unknown) => "```mandate-board\n" + JSON.stringify(o) + "\n```";

describe("board blocks", () => {
  it("the fixtures read without a single warning", () => {
    for (const [name, c] of Object.entries(BOARD_FIXTURES)) {
      const f = foldBoard(c.messages);
      expect(f.warnings, name).toEqual([]);
      expect(boardIsEmpty(f.board), name).toBe(false);
    }
  });

  it("a later turn updates the board by id instead of restating it", () => {
    const f = foldBoard(FORKLIFT.messages);
    expect(f.blocks).toBe(3);
    const dk = f.board.routes!.levels.find((l) => l.id === "dk")!;
    // turn 2 set Buyer Financing to probe; turn 3 opened it; turn 4 did not mention it
    expect(dk.doors.find((d) => d.id === "eifo-buyer")!.status).toBe("open");
    expect(dk.doors.find((d) => d.id === "eifo-coinvest")!.why).toMatch(/lead has agreed/);
    const equity = f.board.roadmap!.tracks.find((t) => t.id === "equity")!;
    expect(equity.steps.find((s) => s.id === "lead-brief")!.status).toBe("done");
    expect(equity.steps.find((s) => s.id === "close")).toBeTruthy(); // kept from turn 3
    expect(f.board.roadmap!.origin).toBe("2026-12"); // a partial roadmap keeps the origin
    expect(f.board.answer!.lines).toHaveLength(3); // turn 4 had no answer: turn 3's stands
    expect(f.board.stage).toBe("next_steps");
    expect(f.fresh.has("routes:dk:eifo-coinvest")).toBe(true);
    expect(f.fresh.has("routes:dk:eifo-buyer")).toBe(false);
  });

  it("an item that does not fit is left out and named, the rest kept", () => {
    const w: string[] = [];
    const b = readBoard({
      routes: { levels: [{ id: "eu", level: "eu", label: "EU", doors: [
        { id: "a", name: "A", status: "open", why: "fits" },
        { id: "b", name: "B", status: "maybe", why: "bad status" },
      ] }] },
      risks_flags: [{ kind: "flag", severity: "high", title: "No id given", fix: "derive one" }],
    }, w);
    expect(b.routes!.levels[0].doors.map((d) => d.id)).toEqual(["a"]);
    expect(w.join(" ")).toMatch(/doors\[1\].*status/);
    expect(b.risks_flags![0].id).toBe("no-id-given");
  });

  it("invalid JSON is reported, not thrown", () => {
    const f = foldBoard([{ role: "agent", text: "Prose.\n\n```mandate-board\n{ nope\n```" }]);
    expect(f.blocks).toBe(0);
    expect(f.warnings[0]).toMatch(/not valid JSON/);
  });

  it("forgives a trailing comma and nothing else", () => {
    const f = foldBoard([{ role: "agent", text: "```mandate-board\n{\"answer\": {\"lines\": [\"Go EU.\"], \"confidence\": \"high\", \"open_question\": \"Who lends?\",},}\n```" }]);
    expect(f.board.answer?.confidence).toBe("high");
  });

  it("process edges must name nodes that exist", () => {
    const w: string[] = [];
    const b = readBoard({ process: [{ id: "p", title: "P", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b", label: "x" }, { from: "a", to: "zz", label: "y" }] }] }, w);
    expect(b.process![0].edges).toHaveLength(1);
    expect(w[0]).toMatch(/not there/);
  });
});

describe("the prose around the board", () => {
  it("folds complete and still-streaming blocks out of the reply", () => {
    const text = `Lead with the EU.\n\n${fence({ answer: { lines: ["x"], confidence: "low", open_question: "y?" } })}\n\nWhich way?`;
    expect(boardBlocks(text)).toHaveLength(1);
    const shown = withoutBoard(text);
    expect(shown).not.toMatch(/mandate-board|confidence/);
    expect(shown).toMatch(/Board tab/);
    expect(shown).toMatch(/Which way\?$/);
    expect(withoutBoard("Prose.\n\n```mandate-board\n{\"answer\": {")).toBe("Prose.\n\n*Drawing the board…*");
  });

  it("the What-landed panel does not read the board's JSON as a question", () => {
    const l = parseLanded(withoutBoard(FINTECH.messages[3].text));
    expect(l.question).toBe("Who signs each loan and who holds it?");
  });
});

describe("helpers", () => {
  it("formats money compactly, ranges once", () => {
    expect(money(12_000_000)).toBe("€12M");
    expect(money(2_500_000)).toBe("€2.5M");
    expect(money(400_000)).toBe("€400K");
    expect(moneyRange({ amount: 2_000_000, amount_max: 3_000_000 })).toBe("€2–3M");
    expect(moneyRange({ amount: 500_000, amount_max: 1_000_000 })).toBe("€500K–€1M");
    expect(moneyRange({})).toBeNull();
  });
  it("months from dates and offsets", () => {
    expect(monthsOf(2, "2026-12")).toBe(2);
    expect(monthsOf("2027-02", "2026-12")).toBe(2);
    expect(monthsOf("2027-01-16", "2026-12")).toBeCloseTo(1.5, 1);
  });
  it("splits citation ids from labels", () => {
    expect(splitCite(["c3", "[w8]", "judgement", "(unverified)"])).toEqual({ ids: ["c3", "w8"], labels: ["judgement", "unverified"] });
  });
  it("lays out a flow with a cycle as layers plus a return arc", () => {
    const p = FORKLIFT.messages.length && foldBoard(FORKLIFT.messages).board.process![0];
    const l = flowLayers(p.nodes, p.edges);
    expect(l.back.size).toBe(1);
    expect(l.col.aps).toBe(0);
    expect(l.col.cust).toBeGreaterThan(l.col.aps);
  });
});
