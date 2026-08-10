// What makes one published row different from the one above it.
//
// ── The defect this exists to name ─────────────────────────────────────────
// Two full briefs were rendered at seven rows and read (wsDC). Both tails were
// a catalogue: four rows carrying one legal basis, one ticket string, one
// application route, one comparables set, one sentence and one action. The
// eighth row and beyond are worth roughly two points of EXACT each and could
// not be bought, because buying them would have bought more of that.
//
// The cause is not the writer padding, and it is not the cut. It is that rows
// which ARE different were handed to the reader, and to the writer, with their
// differences absent from everything either of them looks at. The four Dutch
// rows of one brief differ by an order of magnitude in what they typically
// award, by region, by operator and by their own stated conditions; the writer
// was shown their name, their support type, their ticket band, their legal
// basis and their comparables, and those five were IDENTICAL on all four. It
// wrote four versions of one sentence because it was given one row four times.
//
// ── The property ───────────────────────────────────────────────────────────
//
//   A ROW EARNS ITS PLACE IF THE READER CAN SEE WHAT MAKES IT DIFFERENT.
//
// The test, for a case nobody has seen: take the facts the row publishes and
// remove every one whose value an earlier published row already carried. What
// remains is the row's DISTINGUISHERS.
//
//   - No distinguishers at all: the row is the same thing said again. That is
//     a selection or corpus fault and it is reported, never repaired by
//     deleting the row -- a wrongly-withheld row is a fund a founder never
//     sees, and wsCG2 established that collapsing doors of one scheme recovers
//     nothing while costing real routes.
//   - Distinguishers that nothing surfaces: the row is different and READS the
//     same. That is a presentation fault, it is the one measured in both
//     rendered briefs, and it is the one this module is built to let the page
//     and the prompt fix.
//
// ── Framing axes and distinguishing axes ───────────────────────────────────
// FRAMING axes answer "what kind of door is this, and how do I get in": the
// family above it, the legal basis it is measured against, the shape of the
// support, the route in. Rows agreeing on all of them are one kind of door
// with several instances, and stating those four facts once per group rather
// than once per row is the whole of the presentation change.
//
// Every other fact is DISTINGUISHING by default, and that default is the
// direction that fails safe: a field added to InstitutionEntry tomorrow will
// be shown rather than folded away. Identity is separate again and is never
// counted as a difference -- "it has another name" is what the reader can
// already see and is not an answer to "what would I learn from this row".
//
// Hermetic: types only, no corpus, no fs, no pg, so a check can import it.
import type { InstitutionEntry } from "./types";

/** What the reader can already see, and what a row is rather than what it
 *  offers. Never counted as saying something new: a second door under one
 *  scheme is a real second door (wsCG2) and it is its OFFER, not its
 *  identifier, that has to differ for the row to be worth reading. */
export const IDENTITY_AXES: ReadonlySet<string> = new Set([
  "institution", "channel", "schemeCode", "link", "applicationUrl",
]);

/** Written by the model from everything below. Excluded because they are the
 *  OUTPUT this module exists to differentiate: counting them as evidence that
 *  a row differs would let the writer's own paraphrase certify itself. */
const WRITER_AXES: ReadonlySet<string> = new Set(["whyEligible", "nextStep", "blockerPlain"]);

/** The four facts that answer "what kind of door is this and how do I get in".
 *  Stated once per group rather than once per row. */
export const FRAMING_AXES: readonly string[] =
  ["familyName", "legalBasis", "supportType", "applicationChannel"] as const;

/** One fact of a row, as a list of comparable pieces.
 *
 *  List-valued fields compare piece by piece rather than whole: a row carrying
 *  three statutory bullets a sibling also carries plus one of its own has said
 *  something new, and folding the whole block would hide it. That is the same
 *  reasoning the table's bullet fold already uses.
 */
function pieces(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(pieces);
  if (typeof value === "object") {
    // Only ever objects with a name and an amount today (comparable firms).
    // Serialised whole so a firm at a different amount is a different piece.
    return [JSON.stringify(value)];
  }
  const s = String(value).trim();
  return s ? [s] : [];
}

/**
 * Every fact a row publishes, keyed by axis.
 *
 * A WALK, not a register. The row's own keys are the axes, so a field added to
 * `InstitutionEntry` tomorrow is inside every rule below with no edit here --
 * which is precisely the failure mode `buildInstitutions` already paid for
 * once, where a hand-written mapping dropped six fields and nothing objected.
 */
export function rowFacts(row: InstitutionEntry): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(row as unknown as Record<string, unknown>)) {
    if (IDENTITY_AXES.has(k) || WRITER_AXES.has(k)) continue;
    const p = pieces(v);
    if (p.length) out[k] = p;
  }
  return out;
}

/** Every fact, joined, for a whole-value comparison. */
export function factAxes(row: InstitutionEntry): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rowFacts(row))) out[k] = v.join(" | ");
  return out;
}

/**
 * The axes on which `row` carries something none of `earlier` carried.
 *
 * Empty means the row said nothing new. That is a report, never a licence to
 * drop it.
 */
export function distinguishers(row: InstitutionEntry, earlier: InstitutionEntry[]): string[] {
  const before = new Map<string, Set<string>>();
  for (const e of earlier) {
    for (const [axis, ps] of Object.entries(rowFacts(e))) {
      const s = before.get(axis) ?? new Set<string>();
      for (const p of ps) s.add(p);
      before.set(axis, s);
    }
  }
  return Object.entries(rowFacts(row))
    .filter(([axis, ps]) => ps.some((p) => !(before.get(axis)?.has(p))))
    .map(([axis]) => axis);
}

/** `distinguishers`, restricted to what a reader would notice: the axes that
 *  are not part of the group's shared framing. A row whose only new facts are
 *  framing facts has started a new group and is trivially distinguishable; a
 *  row inside a group is judged on the rest. */
export function distinguishersWithin(
  row: InstitutionEntry, earlier: InstitutionEntry[],
): string[] {
  return distinguishers(row, earlier).filter((a) => !FRAMING_AXES.includes(a));
}

/** The framing signature of a row: what kind of door it is. Rows with equal
 *  signatures are instances of one kind. */
export function framingKey(row: InstitutionEntry): string {
  const f = row as unknown as Record<string, unknown>;
  return FRAMING_AXES.map((a) => pieces(f[a]).join(" ").toLowerCase()).join(" ¦ ");
}

export interface RowGroup {
  /** Index into the table of the first row of this group. */
  start: number;
  /** How many consecutive rows share the framing. */
  size: number;
  /** The framing facts, stated once. Absent entries are facts no row in the
   *  group carries. */
  shared: { axis: string; value: string }[];
}

/**
 * Consecutive published rows that are the same kind of door.
 *
 * CONSECUTIVE on purpose. Ordering is not this workstream's to touch (wsDD
 * owns selection and order), so a group is a thing the ORDER already produced
 * and this only recognises. Reordering rows to make bigger groups would be
 * changing which fund a founder reads first in order to shorten the page,
 * which is the wrong trade in the wrong direction.
 */
export function rowGroups(rows: InstitutionEntry[]): RowGroup[] {
  const out: RowGroup[] = [];
  let i = 0;
  while (i < rows.length) {
    const key = framingKey(rows[i]);
    let j = i + 1;
    while (j < rows.length && framingKey(rows[j]) === key) j += 1;
    const f = rows[i] as unknown as Record<string, unknown>;
    out.push({
      start: i,
      size: j - i,
      shared: FRAMING_AXES
        .map((axis) => ({ axis, value: pieces(f[axis]).join(" ") }))
        .filter((s) => s.value !== ""),
    });
    i = j;
  }
  return out;
}

/** Human-readable name for an axis, for the one place a group's shared facts
 *  are stated to a reader. Anything unnamed falls back to the field name,
 *  which is ugly on purpose: it is a signal that a new fact reached the page
 *  without anyone deciding how to say it. */
export const AXIS_LABEL: Readonly<Record<string, string>> = {
  familyName: "programme",
  legalBasis: "legal basis",
  supportType: "support",
  applicationChannel: "how to apply",
  descriptor: "what it funds",
  typicalAward: "typical award",
  aidIntensity: "share of project cost covered",
  comparableFirms: "comparable firms",
  judgementCriteria: "its own conditions",
  structuringNotes: "how the money is shaped",
  schemeOperators: "who takes the application",
  ticket: "ticket",
  country: "where it operates",
  lastAwardYear: "last recorded award",
  registeredPurpose: "what it is registered to fund",
};
