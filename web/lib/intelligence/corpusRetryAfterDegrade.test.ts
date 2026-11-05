/**
 * A DEGRADED CORPUS MUST NOT BE PERMANENT.
 *
 * ── The production defect ──────────────────────────────────────────────────
 * `hydrateDbInstruments()` no-opped on `dbInstrumentsCache !== undefined`, and
 * a serverless instance whose one cold-start read was cancelled therefore held
 * the committed snapshot for its whole life. Observed on the live deployment
 * 2026-08-18: of six instances, the one that lost the race at 23:09:52.498Z
 * served 8 of the sample's 32 requests off the snapshot, minutes after the
 * database had recovered, because the process never asked again.
 *
 * ── What is asserted, and why in these terms ───────────────────────────────
 * Not "is there a retry", not "is the cooldown 30 seconds" — both are
 * mechanism, and both would keep passing on a day the harm found a new route.
 * The property is the OUTCOME a founder gets:
 *
 *     a process serving the snapshot because Postgres refused must return to
 *     Postgres once Postgres answers again, without being restarted
 *
 * The second test is its necessary other half, and is the one that stops the
 * fix being "retry on every request": while the database is still refusing, a
 * process must not pay a fresh connection per request. Together they pin the
 * behaviour from both sides, so neither can be satisfied by deleting the other.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What the fake register does when asked. Mutated per test. */
let refusing = true;
/** Every connect() the module makes, so "did it ask again" is observable. */
let connects = 0;

vi.mock("pg", () => ({
  Client: class {
    async connect() { connects++; }
    async query(sql: string) {
      if (/^\s*SET\s/i.test(sql)) return { rows: [] };
      if (refusing) throw new Error("canceling statement due to statement timeout");
      return { rows: [] };
    }
    async end() { /* nothing to release */ }
  },
}));

const RETRY_AFTER_MS = 30_000;

describe("a degraded hydration is retried, not kept", () => {
  beforeEach(() => {
    vi.resetModules();
    connects = 0;
    refusing = true;
    process.env.DATABASE_URL = "postgres://not-a-real-host/never-dialled";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T23:09:52.498Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DATABASE_URL;
  });

  it("returns to Postgres once Postgres answers again", async () => {
    const corpus = await import("./corpus");
    await corpus.hydrateDbInstruments();
    expect(corpus.corpusProvenance()).toMatchObject({ source: "snapshot", degraded: true });

    // The register recovers. Nothing restarts; the same process simply serves
    // its next request after the cooldown.
    refusing = false;
    vi.setSystemTime(Date.now() + RETRY_AFTER_MS + 1);
    await corpus.hydrateDbInstruments();

    const p = corpus.corpusProvenance();
    expect(p.source).toBe("postgres");
    expect(p.degraded).toBe(false);
  });

  it("does not open a connection per request while it is still refusing", async () => {
    const corpus = await import("./corpus");
    await corpus.hydrateDbInstruments();
    const afterFirst = connects;
    expect(afterFirst).toBe(1);

    // Ten more founders arrive inside the cooldown. A retry-every-request fix
    // would make each of them pay a connection to a database already known to
    // be refusing, on the request path, before their brief starts.
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(Date.now() + 1000);
      await corpus.hydrateDbInstruments();
    }
    expect(connects).toBe(afterFirst);
    expect(corpus.corpusProvenance().source).toBe("snapshot");

    // And once the cooldown has passed it does ask — otherwise the test above
    // could be satisfied by never retrying at all.
    vi.setSystemTime(Date.now() + RETRY_AFTER_MS + 1);
    await corpus.hydrateDbInstruments();
    expect(connects).toBe(afterFirst + 1);
  });

  it("a process with no DATABASE_URL is on the snapshot deliberately, and retries nothing", async () => {
    delete process.env.DATABASE_URL;
    const corpus = await import("./corpus");
    await corpus.hydrateDbInstruments();
    expect(corpus.corpusProvenance()).toMatchObject({ source: "snapshot", degraded: false });
    vi.setSystemTime(Date.now() + RETRY_AFTER_MS * 10);
    await corpus.hydrateDbInstruments();
    expect(connects).toBe(0);
  });
});
