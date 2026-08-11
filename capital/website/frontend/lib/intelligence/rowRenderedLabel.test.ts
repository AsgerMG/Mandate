// wsFE — the seat is spent on what the reader CAN READ, so that is what the
// collapse groups by.
//
// ── THE PROPERTY ───────────────────────────────────────────────────────────
//
//   NO TWO ROWS A FOUNDER IS SHOWN ARE INDISTINGUISHABLE TO A READER.
//
// The test for a pair nobody has seen needs no register: render both rows
// through the function that renders them and compare the strings. If they are
// equal it is one option shown twice, whatever the database holds behind them.
//
// ── THE RED PROOF ─────────────────────────────────────────────────────────
// The collapse keyed on the RAW label, and `distinguishRowNames` — which runs
// one line above it — appends the granting body, the delivery region or an id
// fragment to the END of a title that already collided. `oneLine` then cuts the
// title to `ROW_TITLE_CHARS` for the menu the selector reads. On the
// 200-character French and German legal titles this corpus is full of, the
// appended distinguisher is entirely past the cut, so the disambiguation exists
// only in a string nobody is shown.
//
// Measured, 36 recall founders, live corpus, arm off
// (`scripts/_wsfe_seats.ts`):
//
//   raw label       0 collisions,  0 founders   (menu AND published table)
//   rendered label  14 collisions, 8 founders   on the 40-row menu
//                    4 collisions, 4 founders   in the published seven
//
// A key that scores zero on a defect that is visibly there is not a strict key,
// it is a blind one. The two fixtures below are the shapes that produced those
// numbers, verbatim in structure: two DE leaves of one Thüringen programme and
// two of one Jülich Richtlinie, each pair separated only past character 120.
import { describe, expect, it } from "vitest";

import { resolveNameCollisions } from "./nameCollision";
import { ROW_TITLE_CHARS } from "./schemeText";
import { rowRenderedLabel } from "./shortlist";
import type { InstrumentRow } from "./types";

const row = (instrumentId: string, instrument: string): InstrumentRow =>
  ({ instrumentId, instrument, channel: "state_aid_satr" } as unknown as InstrumentRow);

/** A real German title long enough that anything appended to it is cut off. */
const THUERINGEN =
  "Förderprogramm des Freistaats Thüringen zur Förderung von Forschung, Technologie und "
  + "Innovation, Richtlinie FTI-Verbundvorhaben und Netzwerke";
const JUELICH =
  "Richtlinie über die Gewährung von Zuwendungen zur Förderung von Vorhaben im Forschungs- "
  + "und Entwicklungsbereich der industriellen Gemeinschaftsforschung";

describe("rowRenderedLabel", () => {
  it("the fixtures really are longer than the cut, or this test proves nothing", () => {
    // Without this the pair could be passing for a reason that has nothing to
    // do with truncation, and the whole file would go quietly vacuous the day
    // somebody shortened a title.
    expect(THUERINGEN.length).toBeGreaterThan(ROW_TITLE_CHARS);
    expect(JUELICH.length).toBeGreaterThan(ROW_TITLE_CHARS);
  });

  it("RED BEFORE wsFE: the raw label calls two unreadable twins distinct", () => {
    // What `distinguishRowNames` produced: the same title, plus an id fragment
    // that lands past character 120.
    const a = row("satr_de_rnd__sa_1__tab", `${THUERINGEN} · sa 1`);
    const b = row("satr_de_rnd__sa_2__tab", `${THUERINGEN} · sa 2`);

    // The raw labels differ, which is why the old key found nothing...
    expect(a.instrument).not.toBe(b.instrument);
    // ...and the labels the founder and the selector actually read are equal.
    expect(rowRenderedLabel(a)).toBe(rowRenderedLabel(b));
  });

  it("collapses both reported pairs, and demotes rather than deletes", () => {
    const input = [
      row("thu_1", `${THUERINGEN} · sa 1`),
      row("jul_1", `${JUELICH} · sa 3`),
      row("thu_2", `${THUERINGEN} · sa 2`),
      row("jul_2", `${JUELICH} · sa 4`),
      row("alone", "Eurostars"),
    ];
    const prefer = (x: InstrumentRow, y: InstrumentRow) =>
      (x.instrumentId ?? "").localeCompare(y.instrumentId ?? "");
    const { visible, demoted, collisions } =
      resolveNameCollisions(input, rowRenderedLabel, prefer);

    expect(visible.map((r) => r.instrumentId)).toEqual(["thu_1", "jul_1", "alone"]);
    expect(demoted.map((r) => r.instrumentId)).toEqual(["thu_2", "jul_2"]);
    // The invariant that makes this a demotion and not the deletion that took
    // pool recall 97% -> 83%: the losers are still in the universe.
    expect(visible.length + demoted.length).toBe(input.length);
    expect(collisions).toHaveLength(2);
  });

  it("does NOT collapse a pair the disambiguator separated inside the cut", () => {
    // The CDTI shape, and the reason the rendered label is the right key rather
    // than merely a looser one. These titles are short, so the body appended by
    // `distinguishRowNames` survives the cut and a reader can tell them apart.
    // Collapsing them would spend a seat suppressing a real second door.
    const input = [
      row("cdti_a", "Proyectos de I+D · CDTI"),
      row("cdti_b", "Proyectos de I+D · IDEPA"),
    ];
    const { visible, demoted } = resolveNameCollisions(
      input, rowRenderedLabel, (x, y) => (x.instrumentId ?? "").localeCompare(y.instrumentId ?? ""));

    expect(visible).toHaveLength(2);
    expect(demoted).toHaveLength(0);
  });

  it("case is not a distinction a reader uses", () => {
    const a = row("a", "Fonds Unique Interministériel");
    const b = row("b", "FONDS UNIQUE INTERMINISTÉRIEL");
    expect(rowRenderedLabel(a)).toBe(rowRenderedLabel(b));
  });
});
