// The three properties that decide whether the model's judgement survives the
// last hundred lines before the writer.
//
// Every case here is built from the COMMITTED CORPUS SNAPSHOT rather than from
// hand-written verdicts, because the shapes that broke are shapes of the real
// data: instruments that share a rendered name, instruments no encoded filter
// can assess, instruments a founder's own answers close. A fixture can be given
// whatever status the test needs, which is exactly how a sort over
// `VERDICT_RANK` came to look harmless.
import { describe, expect, it } from "vitest";

import { loadDbInstruments } from "./corpus";
import { assessInstrument, type VerdictStatus } from "./verdict";
import { displayInstitutionName } from "./shortlist";
import { ExclusionLog } from "./exclusions";
import {
  orderMemoCandidates, publishRankByKey, WRITER_CANDIDATE_CAP,
  type MemoCandidateInput,
} from "./memoCandidates";
import type { EligibilityAnswers, IntelligenceRequest, InstrumentRow } from "./types";

/** A founder answer set that really does close doors: an Icelandic company (in
 *  the EEA, so not excluded wholesale) outside every national scheme in the
 *  corpus, in a sector most schemes do not name. Chosen for its effect, not for
 *  any property of Iceland — the tests below assert on the BUCKETS it produces
 *  and fail loudly if it stops producing them. */
// Every value here is drawn from the declared vocabulary (SECTOR_OPTIONS,
// TICKET_BANDS, USE_OF_FUNDS_OPTIONS, ...). It arrived with four that were not
// -- `ticketBand: "1-5M"`, `developmentStage: "scaling"` -- and only the first
// was a type error, because most of EligibilityAnswers is typed `string`. An
// out-of-vocabulary answer does not throw: it silently fails to satisfy every
// comparator written against the field, so the buckets below would have been
// buckets of a founder who cannot exist.
const ANSWERS: EligibilityAnswers = {
  entityCountries: ["Iceland"],
  sector: "other",
  useOfFunds: ["experimental_development"],
  fteBand: "250+",
  ticketBand: "b2m5_15m",
  developmentStage: "scaling_revenue",
  exclusionFlags: ["none"],
  activities: ["none"],
  borrowerModel: "operating",
};

/** Corpus instruments bucketed by the verdict THIS answer set gives them. */
function byStatus(answers: EligibilityAnswers): Map<VerdictStatus, string[]> {
  const out = new Map<VerdictStatus, string[]>();
  for (const inst of loadDbInstruments()) {
    const s = assessInstrument(inst, answers).status;
    out.set(s, [...(out.get(s) ?? []), inst.id]);
  }
  return out;
}

function rowFor(id: string, over: Partial<InstrumentRow> = {}): InstrumentRow {
  const inst = loadDbInstruments().find((i) => i.id === id);
  return {
    channel: inst?.sourceFamilyBucket ?? "state_aid_satr",
    instrument: inst?.name ?? id,
    ticket: "",
    usedInField: false,
    fit: "",
    instrumentId: id,
    country: inst?.country ?? "EU",
    administeringBody: inst?.administeringBody,
    schemeCode: inst?.schemeCode,
    ...over,
  } as InstrumentRow;
}

function order(rows: InstrumentRow[], over: Partial<MemoCandidateInput> = {}) {
  return orderMemoCandidates({
    instrumentTable: rows,
    req: {
      company: "TestCo", country: "Iceland", description: "a test company",
      capitalSought: ["grant"], targetMarkets: ["Iceland"], eligibility: ANSWERS,
    } as IntelligenceRequest,
    records: [], dbPeers: [], eligibilityScreen: [],
    log: new ExclusionLog(),
    ...over,
  });
}

const ids = (rows: { row: InstrumentRow }[]) =>
  rows.map((r) => r.row.instrumentId ?? r.row.channel);
const multiset = (xs: string[]) => [...xs].sort();

describe("orderMemoCandidates returns a PERMUTATION of instrumentTable", () => {
  // ── The property ────────────────────────────────────────────────────────
  //   `ordered` is a permutation of `instrumentTable`: the same multiset, with
  //   nothing added and nothing removed.
  //
  // Two `.filter()`s stood here. Reinstating EITHER turns every case below red,
  // which is the point: this is not a test that the current code does what it
  // does, it is a test that the array the writer's pool is cut from is never
  // edited by a rule about what a founder should SEE.

  it("keeps every row when the pool holds funds this founder cannot access", () => {
    // The dead filter's case. `accessiblePool` runs before this in production,
    // so nothing here should ever be blocked — but a table that IS handed
    // blocked rows must still return them, or the count of what the memo
    // dropped is a number nobody can source.
    const buckets = byStatus(ANSWERS);
    const blocked = (buckets.get("blocked") ?? []).slice(0, 6);
    expect(blocked.length,
      "the snapshot no longer holds a fund this answer set closes; the case this "
      + "pins cannot be constructed and the test would pass vacuously").toBeGreaterThan(2);
    const rows = blocked.map((id) => rowFor(id));
    const { ordered } = order(rows);
    expect(multiset(ids(ordered))).toEqual(multiset(rows.map((r) => r.instrumentId!)));
  });

  it("keeps every row when two of them render under one institution name", () => {
    // The name filter's case, on real colliding rows: 322 instruments share
    // only 143 display names.
    const seen = new Map<string, string[]>();
    for (const inst of loadDbInstruments()) {
      const name = displayInstitutionName(rowFor(inst.id));
      seen.set(name, [...(seen.get(name) ?? []), inst.id]);
    }
    const colliding = [...seen.values()].find((g) => g.length >= 3);
    expect(colliding,
      "no three instruments in the snapshot render under one institution name; "
      + "the collapse this pins has nothing to collapse").toBeTruthy();
    const rows = colliding!.slice(0, 3).map((id) => rowFor(id));
    const { ordered } = order(rows);
    expect(multiset(ids(ordered))).toEqual(multiset(rows.map((r) => r.instrumentId!)));
    // DEMOTED, not deleted: exactly one of the three keeps a visible slot and
    // the other two sit behind everything visible, where they can only take a
    // seat the visible rows did not fill.
    const label = (r: { row: InstrumentRow }) => displayInstitutionName(r.row);
    const first = label(ordered[0]);
    expect(ordered.filter((r) => label(r) === first).length).toBe(3);
    expect(ordered.length).toBe(3);
    // Not first-wins: reversing the input must not change which row survives.
    const reversedIn = order([...rows].reverse());
    expect(ids(reversedIn.ordered)[0]).toBe(ids(ordered)[0]);
  });

  it("logs SEL-DUPE-NAME on the demoted rows rather than on the survivor", () => {
    const seen = new Map<string, string[]>();
    for (const inst of loadDbInstruments()) {
      const name = displayInstitutionName(rowFor(inst.id));
      seen.set(name, [...(seen.get(name) ?? []), inst.id]);
    }
    const colliding = [...seen.values()].find((g) => g.length >= 3)!;
    const rows = colliding.slice(0, 3).map((id) => rowFor(id));
    const log = new ExclusionLog();
    order(rows, { log });
    expect(log.countsByRule()["SEL-DUPE-NAME"]).toBe(rows.length - 1);
  });

  it("keeps every row over a mixed pool, which is the shape production sees", () => {
    const buckets = byStatus(ANSWERS);
    const mixed = [
      ...(buckets.get("open") ?? []).slice(0, 5),
      ...(buckets.get("unknown") ?? []).slice(0, 5),
      ...(buckets.get("one_blocker") ?? []).slice(0, 3),
      ...(buckets.get("blocked") ?? []).slice(0, 3),
    ];
    expect(mixed.length).toBeGreaterThan(8);
    const rows = mixed.map((id) => rowFor(id));
    const { ordered } = order(rows);
    expect(ordered.length).toBe(rows.length);
    expect(multiset(ids(ordered))).toEqual(multiset(mixed));
  });
});

describe("the incoming order IS the memo's order", () => {
  // ── The property ────────────────────────────────────────────────────────
  //   Two rows that render under DIFFERENT institution names leave this
  //   function in the same relative order they entered it, whatever their
  //   verdict, ease, staleness, country or score.
  //
  // ── Why this is the case that matters most in this file (wsGB) ───────────
  // It replaces "a row the model NAMED keeps its seat", which tested a `pinned`
  // argument that promoted the selector's picks past a verdict-band sort. Both
  // are gone. `AGENT_SELECT` defaults to `adviser`, `agentSelectRows` returns
  // `[...chosen, ...the rest in the pool's order]`, and nothing here reorders
  // it — so the model's ranking reaches the writer by ARRIVING in it, not by
  // being defended from a second ranking downstream. This case is what says the
  // second ranking has not come back.
  //
  // ── The disaster it simulates ───────────────────────────────────────────
  // Reinstate ANY sort key here — the old `VERDICT_RANK` band, a fit score, an
  // ease score — and this goes red, because the fixture is built to contradict
  // the band the shipped code used to sort on: `unknown` rows first, where
  // `VERDICT_RANK` puts them last.

  /** Ids whose rendered institution names are all distinct, so the one rule
   *  that DOES move a row here — the display-name collapse — cannot fire and
   *  be mistaken for a sort. */
  function distinctlyNamed(candidateIds: string[], want: number): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of candidateIds) {
      const name = displayInstitutionName(rowFor(id));
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(id);
      if (out.length === want) break;
    }
    return out;
  }

  it("keeps an order that contradicts the band the shipped code used to sort on", () => {
    const buckets = byStatus(ANSWERS);
    const unknown = distinctlyNamed(buckets.get("unknown") ?? [], 3);
    const open = distinctlyNamed(
      (buckets.get("open") ?? []).filter((id) => !unknown.includes(id)),
      WRITER_CANDIDATE_CAP);
    expect(open.length, "the snapshot no longer holds eight distinctly-named `open` "
      + "funds for this founder; the case this pins cannot be constructed")
      .toBe(WRITER_CANDIDATE_CAP);
    expect(unknown.length).toBe(3);

    // `unknown` FIRST. `VERDICT_RANK` ranks `open` above `unknown`, so the sort
    // this file used to run would move all three of these to the back and past
    // the writer cap.
    const wanted = [...unknown, ...open];
    const { ordered, toWriter } = order(wanted.map((id) => rowFor(id)));
    expect(ids(ordered)).toEqual(wanted);
    expect(ids(toWriter)).toEqual(wanted.slice(0, WRITER_CANDIDATE_CAP));
  });

  it("is red under a fixture that is already in band order, so the case is real", () => {
    // The control. Without it the assertion above would pass on a pool the band
    // sort would not have moved, and the disaster it claims to simulate never
    // happened. Here the SAME rows are handed over in the order a band sort
    // produces, and the two orders must genuinely differ.
    const buckets = byStatus(ANSWERS);
    const unknown = distinctlyNamed(buckets.get("unknown") ?? [], 3);
    const open = distinctlyNamed(
      (buckets.get("open") ?? []).filter((id) => !unknown.includes(id)),
      WRITER_CANDIDATE_CAP);
    const bandOrder = [...open, ...unknown];
    expect(ids(order(bandOrder.map((id) => rowFor(id))).ordered)).toEqual(bandOrder);
    expect(bandOrder).not.toEqual([...unknown, ...open]);
  });
});

describe("the brief publishes the CANDIDATE order, not the writer's note order", () => {
  // ── The property ────────────────────────────────────────────────────────
  //   The published rows are the head of the candidate order, minus rows the
  //   writer declined to write about.
  //
  // The disaster: a writer that returns its notes reversed. It has been told
  // three times not to reorder (FUND-12, the prompt, 02-funds.md), so a
  // reversed reply is a model DISOBEYING — and the shipped code read it as a
  // ranking. With the published cap below the candidate cap, a permutation is
  // a deletion.
  const rowKeys = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("ignores a reversed reply", () => {
    const reversed = [...rowKeys].reverse();
    const rank = publishRankByKey(rowKeys, reversed);
    expect(rowKeys.map((k) => rank.get(k))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("is red under the control arm, so the fixture is really reversed", () => {
    // Without this the test above passes on a fixture that happens to be in
    // order, and the disaster it claims to simulate never happened.
    const reversed = [...rowKeys].reverse();
    const rank = publishRankByKey(rowKeys, reversed, "writer");
    expect(rowKeys.map((k) => rank.get(k))).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("ranks an unmentioned row last under either arm", () => {
    // `worth` decides whether an unmentioned row publishes; the rank must not
    // also decide it, or one judgement is applied twice.
    const rank = publishRankByKey(rowKeys, ["c", "a"]);
    expect(rank.get("h")).toBe(7);
    const writerArm = publishRankByKey(rowKeys, ["c", "a"], "writer");
    expect(writerArm.get("h")).toBeUndefined();
  });

  it("survives a writer that repeats a key", () => {
    const rank = publishRankByKey(rowKeys, ["b", "b", "a"], "writer");
    expect(rank.get("b")).toBe(0);
    expect(rank.get("a")).toBe(2);
  });
});
