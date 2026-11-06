// A CUT MAY NOT MERGE TWO NAMES THAT DIFFER.
//
// ── The defect, measured rather than argued ────────────────────────────────
// `oneLine(name, ROW_TITLE_CHARS)` takes the first 120 characters. On the legal
// titles this corpus is full of, everything that tells two funds apart is past
// that. Of 760 publishable leaves, 113 share a rendered title with a leaf a
// founder in the same country could be shown beside it -- and on 64 of them a
// separating fact is present in the full name and deleted by the cut
// (`scripts/_wsid_collide.ts`, free, one Postgres read):
//
//   Línea de préstamos "ICF Emergencias" ... Reglamento (UE) núm. 2023/2831.
//   Línea de préstamos "ICF Emergencias" ... Reglamento (UE) núm. 651/2014.
//   Línea de préstamos "ICF Emergencias" ... Reglamento (UE) núm. 1408/2013.
//   Línea de préstamos "ICF Emergencias" ... Reglamento (UE) núm. 717/2014.
//
// Four loan lines, four different aid regulations, four different sets of who
// may borrow -- and one string on the page. The same shape carries "Área 1:
// Desarrollo de proyectos empresariales innovadores" against "Área 2: Nuevas
// empresas innovadoras", and the three doors of France's SA.40391, where the
// difference the disambiguator DID append (`· Grants` against `· Loans`) is cut
// off two characters after it is written.
//
// ── Why this is not a wider budget ─────────────────────────────────────────
// Raising ROW_TITLE_CHARS spends characters on every row in the corpus to fix
// the ones that collide, and it does not fix them: the ES titles above diverge
// at character 152 and 217, and the next register will publish one that
// diverges at 400. The budget is not the variable. WHERE IT IS SPENT is.
//
// ── The property, and its test for a case nobody has seen ─────────────────
// Two names that DIFFER must not come out of the cut equal. That is the whole
// rule, it names no fund, no country and no register, and its test is to run
// the function: feed it any two strings and compare the outputs. There is no
// list of known collisions here and there cannot be one -- the next colliding
// pair is whatever a register publishes next.
//
// Two names that are EQUAL must still come out equal. That half matters just as
// much: `resolveNameCollisions` exists to stop one option taking two seats, and
// a cut that manufactured a difference between two identical names would hide
// the corpus defect instead of reporting it.
//
// ── What it costs a row that is not colliding: nothing ────────────────────
// A name with no colliding peer comes back byte-identical to `oneLine`. The
// elision is spent only where two rows would otherwise be one, so this can only
// change a string that was already wrong.
//
// ── STRINGS ONLY, DELIBERATELY ────────────────────────────────────────────
// This module never names `InstrumentRow` and never reads a corpus column. It
// takes the names its caller already decided to show and returns the same names
// shorter. That keeps it outside `check_answer_not_reachable`'s scope by
// construction rather than by assertion, and it is why the group is passed in
// rather than looked up: the caller knows which rows are in front of one reader
// and this file must not have to.
import { ROW_TITLE_CHARS } from "./schemeText";

/** The marker for the characters the cut skipped over. One glyph, and a
 *  different one from `oneLine`'s trailing "..." on purpose: "..." says the
 *  name continues past here, this says the name continues THROUGH here. */
export const ELISION = "…";

/** The least of the budget the head of the title may be reduced to.
 *
 *  Below half, the row has spent its name to keep its suffix: a reader looking
 *  at "Línea de préstamos bonif… Reglamento (UE) núm. 651/2014." cannot tell
 *  which loan line it is, which is the defect this file exists to fix arriving
 *  from the other end. A group that cannot be separated inside this floor is
 *  reported as unresolved rather than separated at any price. */
const MIN_HEAD_SHARE = 0.5;

/** A group whose members diverge further and further apart resolves one layer
 *  per pass. Bounded so a pathological input cannot spin: an unresolved group
 *  is a reportable outcome, a hang is not. */
const MAX_PASSES = 8;

/** One line, whitespace collapsed. The same normalisation `oneLine` applies,
 *  and applied first here so every comparison below is over the string that
 *  would actually be shown. */
const flat = (s: string | null | undefined): string =>
  String(s ?? "").replace(/\s+/g, " ").trim();

/** `oneLine`'s cut, restated over an already-flattened string. Kept here rather
 *  than calling `oneLine` so this file has one notion of "the plain cut" and
 *  cannot flatten twice. */
const headCut = (t: string, max: number): string =>
  (t.length > max ? `${t.slice(0, max - 3)}...` : t);

/** How many leading characters every one of `xs` shares. */
function commonPrefixLength(xs: readonly string[]): number {
  if (!xs.length) return 0;
  let n = xs[0].length;
  for (const x of xs.slice(1)) {
    let i = 0;
    while (i < n && i < x.length && x[i] === xs[0][i]) i++;
    n = i;
  }
  return n;
}

export interface CutTitles {
  /** One per input, in input order, each at most `max` characters. */
  titles: string[];
  /** Groups of DISTINCT full names that still render alike. Empty is the only
   *  passing answer for a group of rows offered to one founder; a non-empty
   *  entry means two funds a reader cannot tell apart inside the budget.
   *
   *  Names that are EQUAL are not in here. Two rows carrying one name are a
   *  corpus defect, they are a different finding with a different owner, and
   *  `resolveNameCollisions` is what handles them. */
  merged: string[][];
}

/**
 * Cut every name to `max`, spending the budget on what tells them apart.
 *
 * The group is the rows rendered together. Passing one name is legal and
 * returns `oneLine`'s answer, which is what makes this safe to adopt at a call
 * site that does not yet know its peers.
 */
export function cutTitlesApart(
  names: readonly (string | null | undefined)[], max = ROW_TITLE_CHARS,
): CutTitles {
  const full = names.map(flat);
  const out = full.map((t) => headCut(t, max));
  const minHead = Math.floor(max * MIN_HEAD_SHARE);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const byCut = new Map<string, number[]>();
    full.forEach((_, i) => byCut.set(out[i], [...(byCut.get(out[i]) ?? []), i]));
    let moved = false;
    for (const [, idx] of byCut) {
      const distinct = [...new Set(idx.map((i) => full[i]))];
      if (distinct.length < 2) continue;
      // Where this group stops being one name. Everything before it is shared,
      // so it is the cheapest thing to give up.
      const p = commonPrefixLength(distinct);
      // As much tail as it takes to separate them and no more: stop at the
      // first length that buys nothing further. Rows that agree past `p` are
      // not abandoned -- they form a tighter group with a longer prefix and the
      // next pass spends the budget on that instead.
      const room = max - minHead - ELISION.length;
      const best = new Set(distinct.map((t) => t.slice(p, p + room))).size;
      let k = 1;
      while (k < room && new Set(distinct.map((t) => t.slice(p, p + k))).size < best) k++;
      const head = max - ELISION.length - k;
      // ── THE BOUNDARY, and it is the one case a reasonable guard gets wrong ─
      // `headCut` spends three characters on "...", so it shows only the first
      // `max - 3`. A pair diverging in the three characters BETWEEN that and
      // the budget collides under the plain cut while sitting inside the head
      // this function would print. Eliding there would repair nothing and print
      // the same character twice; a one-glyph marker instead of a three-glyph
      // one buys exactly the room needed, and says the same thing.
      if (p < head) {
        for (const i of idx) {
          if (full[i].length <= max) continue;
          out[i] = full[i].slice(0, max - ELISION.length) + ELISION;
          moved = true;
        }
        continue;
      }
      for (const i of idx) {
        if (full[i].length <= max) continue;
        out[i] = full[i].slice(0, head) + ELISION + full[i].slice(p, p + k);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const byCut = new Map<string, Set<string>>();
  full.forEach((t, i) => byCut.set(out[i], (byCut.get(out[i]) ?? new Set<string>()).add(t)));
  const merged = [...byCut.values()].filter((s) => s.size > 1).map((s) => [...s]);
  return { titles: out, merged };
}

/** The titles alone, for a call site that renders and does not report. */
export const cutTitles = (
  names: readonly (string | null | undefined)[], max = ROW_TITLE_CHARS,
): string[] => cutTitlesApart(names, max).titles;
