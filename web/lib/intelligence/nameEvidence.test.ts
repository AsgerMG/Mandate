import { describe, expect, it } from "vitest";

import { NAME_SOURCE, registerNamesTheRow } from "./nameEvidence";

describe("registerNamesTheRow", () => {
  it("withholds a row the loader named after its own partition key", () => {
    // `satr_pt_equity` is the register's country crossed with the FILTER SET we
    // send to its search API. It reached a Portuguese founder's 18-row pool
    // unblocked, as "National state aid (equity)", typical award EUR 255,571.
    expect(registerNamesTheRow({ nameSource: NAME_SOURCE.partitionKey })).toBe(false);
  });

  it("keeps every row somebody named", () => {
    // All four of these point at a namer: the register's own case title, the
    // feed's words, a human reading the official page, or a family key that
    // traces to a published identifier. None may be withheld by this axis.
    for (const value of [NAME_SOURCE.deterministic, NAME_SOURCE.curated,
                         NAME_SOURCE.programmeFeed, NAME_SOURCE.caseRegister]) {
      expect(registerNamesTheRow({ nameSource: value })).toBe(true);
    }
  });

  it("keeps a row whose nameSource is absent, and does not treat that as an answer", () => {
    // Deliberate, and the reason check_name_evidence.ts has a second half. A
    // corpus that has not been asked the question must not silently lose every
    // fund in it -- so the default is OFFERABLE, and something else has to
    // insist the question was actually asked.
    expect(registerNamesTheRow({})).toBe(true);
    expect(registerNamesTheRow({ nameSource: null })).toBe(true);
  });

  it("does not withhold on a value it does not recognise", () => {
    // A fifth name_source arriving from the ETL is a vocabulary change, not a
    // reason to delete rows. Only the one declared value withholds.
    expect(registerNamesTheRow({ nameSource: "some_future_value" })).toBe(true);
  });
});
