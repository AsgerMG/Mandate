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
// Measured, 36 recall founders, live corpus, arm off, with the collapse keyed
// each way (`scripts/_wsfe_seats.ts`):
//
//   raw label       0 collisions,  0 founders   (menu AND published table)
//   rendered label  18 collisions, 7 founders   on the 40-row menu
//                    6 collisions, 3 founders   in the published seven
//
// Keyed on the rendered label, both fall to 0 across 0 founders.
//
// A key that scores zero on a defect that is visibly there is not a strict key,
// it is a blind one. The two fixtures below are the shapes that produced those
// numbers, verbatim in structure: two DE leaves of one Thüringen programme and
// two of one Jülich Richtlinie, each pair separated only past character 120.
//
// ── AND WHAT wsID CHANGED, WHICH IS THE ANSWER AND NOT THE KEY ────────────
// wsFE's key was right and its remedy was the wrong half of the trade. It made
// the collapse SEE the pair — and the collapse's answer is to demote one of
// them out of the founder's table, so a real second door was being spent to pay
// for a cut. `cutTitlesApart` spends the same 120 characters on the part that
// DIFFERS, so the pair arrives distinct and both doors keep their seats. The
// collapse now fires only where the full names really are one name, which is a
// corpus defect and is somebody's to fix rather than something to hide.
//
// So these fixtures flip: the pairs below are no longer collapsed, and the
// tests assert the label separates them. The pair that MUST still collapse —
// one name, two rows — is pinned at the bottom.
import { describe, expect, it } from "vitest";

import { resolveNameCollisions } from "./nameCollision";
import { ROW_TITLE_CHARS } from "./schemeText";
import { rowRenderedLabels } from "./shortlist";
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

/** The one label, for a whole table at once. */
const labels = (rows: InstrumentRow[]) => rows.map(rowRenderedLabels(rows).labelOf);

describe("rowRenderedLabels", () => {
  it("the fixtures really are longer than the cut, or this test proves nothing", () => {
    // Without this the pair could be passing for a reason that has nothing to
    // do with truncation, and the whole file would go quietly vacuous the day
    // somebody shortened a title.
    expect(THUERINGEN.length).toBeGreaterThan(ROW_TITLE_CHARS);
    expect(JUELICH.length).toBeGreaterThan(ROW_TITLE_CHARS);
  });

  it("shows the difference instead of collapsing it (wsID)", () => {
    // What `distinguishRowNames` produced: the same title, plus a qualifier
    // that lands past character 120. Under wsFE's per-row cut both rows read
    // the same and one was demoted; the budget now reaches the qualifier.
    const a = row("satr_de_rnd__sa_1__tab", `${THUERINGEN} · sa 1`);
    const b = row("satr_de_rnd__sa_2__tab", `${THUERINGEN} · sa 2`);
    const [la, lb] = labels([a, b]);

    expect(la).not.toBe(lb);
    expect(la.length).toBeLessThanOrEqual(ROW_TITLE_CHARS);
    // The head is still the programme, so the row has not paid its subject for
    // its suffix.
    expect(la.startsWith("förderprogramm des freistaats thüringen")).toBe(true);
  });

  it("both reported pairs now keep their seats — nothing is demoted", () => {
    const input = [
      row("thu_1", `${THUERINGEN} · sa 1`),
      row("jul_1", `${JUELICH} · sa 3`),
      row("thu_2", `${THUERINGEN} · sa 2`),
      row("jul_2", `${JUELICH} · sa 4`),
      row("alone", "Eurostars"),
    ];
    const prefer = (x: InstrumentRow, y: InstrumentRow) =>
      (x.instrumentId ?? "").localeCompare(y.instrumentId ?? "");
    const { labelOf, merged } = rowRenderedLabels(input);
    const { visible, demoted, collisions } = resolveNameCollisions(input, labelOf, prefer);

    expect(visible.map((r) => r.instrumentId))
      .toEqual(["thu_1", "jul_1", "thu_2", "jul_2", "alone"]);
    expect(demoted).toEqual([]);
    expect(collisions).toEqual([]);
    // And nothing was given up quietly: the cut resolved every group.
    expect(merged).toEqual([]);
  });

  it("STILL collapses two rows that are one name, and demotes rather than deletes", () => {
    // The half of the property that does not move. Six Innovasjon Norge leaves
    // are all called "Innovasjon Norge" in the corpus today; that is one option
    // shown six times and no cut may pretend otherwise.
    const input = [
      row("in_1", THUERINGEN),
      row("in_2", THUERINGEN),
      row("alone", "Eurostars"),
    ];
    const { labelOf } = rowRenderedLabels(input);
    const { visible, demoted, collisions } = resolveNameCollisions(
      input, labelOf, (x, y) => (x.instrumentId ?? "").localeCompare(y.instrumentId ?? ""));

    expect(visible.map((r) => r.instrumentId)).toEqual(["in_1", "alone"]);
    expect(demoted.map((r) => r.instrumentId)).toEqual(["in_2"]);
    // The invariant that makes this a demotion and not the deletion that took
    // pool recall 97% -> 83%: the loser is still in the universe.
    expect(visible.length + demoted.length).toBe(input.length);
    expect(collisions).toHaveLength(1);
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
      input, rowRenderedLabels(input).labelOf,
      (x, y) => (x.instrumentId ?? "").localeCompare(y.instrumentId ?? ""));

    expect(visible).toHaveLength(2);
    expect(demoted).toHaveLength(0);
  });

  it("case is not a distinction a reader uses", () => {
    const a = row("a", "Fonds Unique Interministériel");
    const b = row("b", "FONDS UNIQUE INTERMINISTÉRIEL");
    const [la, lb] = labels([a, b]);
    expect(la).toBe(lb);
  });
});
