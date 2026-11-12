import { describe, expect, it } from "vitest";
import { benchEnabled, brainToolHint, parseLanded, parseWebSources } from "./events";

describe("benchEnabled", () => {
  it("is on only in local development with the explicit flag, never on Vercel", () => {
    expect(benchEnabled({ NODE_ENV: "development", MANDATE_BENCH_LOCAL: "1" })).toBe(true);
    expect(benchEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(benchEnabled({ NODE_ENV: "production", MANDATE_BENCH_LOCAL: "1" })).toBe(false);
    expect(benchEnabled({ NODE_ENV: "development", MANDATE_BENCH_LOCAL: "1", VERCEL: "1" })).toBe(false);
  });
});

describe("parseLanded", () => {
  it("reads sections and bold lead-ins that name what they are", () => {
    const l = parseLanded("## Decisions\n- Pick EU first [c1]\n- Hold Germany\n\n**Flags:**\n- No licence\n\n**Next step:** call the EIF\n\nWhich way?");
    expect(l).toEqual({ decisions: ["Pick EU first [c1]", "Hold Germany"], flags: ["No licence"], steps: ["call the EIF"], question: "Which way?" });
  });
  it("leaves prose with a bold opening alone", () => {
    const l = parseLanded("**Germany: no route today.** The counter-guarantee needs a bank [w3].\n\nHow do you lend today?");
    expect(l.decisions).toEqual([]);
    expect(l.question).toBe("How do you lend today?");
  });
});

describe("parseWebSources", () => {
  it("takes the label, URL and quote of a listed web source", () => {
    const s = parseWebSources('- [w1] [KWG §1](https://www.gesetze-im-internet.de/kredwg/__1.html), 12 Nov 2026: "die Gewährung von Gelddarlehen"');
    expect(s.w1).toEqual({ url: "https://www.gesetze-im-internet.de/kredwg/__1.html", label: "KWG §1", quote: "die Gewährung von Gelddarlehen" });
  });
});

describe("brainToolHint", () => {
  it("names the country in plain words", () => {
    expect(brainToolHint("match_status", { country: "IT" }).label).toBe("checking Italy's status rules");
    expect(brainToolHint("unknown_tool", {}).label).toBe("checking the record");
  });
});
