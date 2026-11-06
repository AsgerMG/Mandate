import { describe, expect, it } from "vitest";
import { NEWS_MAX_AGE_DAYS, newsFreshness } from "./corpus";

describe("newsFreshness", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  it("is current inside the limit and states the digest's own date", () => {
    expect(newsFreshness({ generatedAt: "2026-11-01T03:00:00+00:00" }, now))
      .toEqual({ asOf: "2026-11-01", ageDays: 5, current: true });
  });
  it("is withheld past the limit: the 2 Aug laptop digest is not news on 6 Nov", () => {
    const f = newsFreshness({ generatedAt: "2026-08-02T15:23:12+00:00" }, now)!;
    expect(f.current).toBe(false);
    expect(f.ageDays).toBeGreaterThan(NEWS_MAX_AGE_DAYS);
  });
  it("treats an undated digest as not current, and no digest as null", () => {
    expect(newsFreshness({}, now)?.current).toBe(false);
    expect(newsFreshness(null, now)).toBeNull();
  });
});
