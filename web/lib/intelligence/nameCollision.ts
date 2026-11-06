// Two rows render under one label. Which one does the founder see — and what
// happens to the other one?
//
// ── The invariant, and the defect it is here to prevent a fifth of ─────────
// A DISPLAY RULE MAY NOT DELETE FROM THE UNIVERSE.
//
// This collapse used to be a `.filter()`, and the array it filtered is the one
// `computeVerdict` derives `candidateInstrumentIds` from. So a rule whose whole
// justification is "a founder should not see the same name twice on the page"
// was removing funds from the WRITER'S POOL, where nothing downstream can
// recover them, rank them, or even report their absence. `applyPeerPrecedence`
// had already made exactly this correction for the notified-scheme repeat, on
// exactly this reasoning, with the measurement attached — pool recall fell 97%
// -> 83% when that one was a filter, and repeats go to the back instead. The
// two collapses were the same defect and only one of them had been fixed.
//
// This project has now hit that shape four times: the old name dedupe's
// `encodedCount` tie, the leaf cap binding silently, `channelServesBand`
// returning true while the register advertised a filter, and this. Every time,
// something that read as hygiene was deleting the answer.
//
// So the resolution is DEMOTION, not deletion: the loser keeps its place in the
// universe and loses only its claim on a visible slot. `visible` and `demoted`
// together are always exactly the input, which is the property the test pins
// and the reason this returns two arrays instead of one.
//
// ── Why the survivor is not simply the first ───────────────────────────────
// First-wins looked right and is not. The caller sorts by fit and channel
// priority, which knows nothing about how well each row is ENCODED, so it kept
// an Enterprise Ireland leaf with zero encoded rules over a sibling that
// returned a real "open" verdict. The caller therefore supplies `prefer` as a
// total order — evidence of its own first, then richer encoding, then id — so
// the survivor cannot depend on the order rows arrived in or on hydration
// sequence. That totality is a property the test pins directly, by running the
// same input reversed.
//
// ── Why the label is passed in rather than computed here ───────────────────
// Because computing it twice is what caused the bug this module was extracted
// during. The disambiguator grouped rows by one function and the collapse keyed
// on another; for a row carrying a real published title the two differ — the
// derived name embeds the notified scheme code and therefore SEPARATES the
// twins — so the disambiguator saw no collision to resolve and the collapse
// then deleted a fund on a key the disambiguator had never examined. One
// `labelOf`, supplied by the caller, passed to both. Two functions and two keys
// is the defect; a parameter is how it stays one.

/** A collision the caller may want to report: `row` lost the label to `kept`. */
export interface NameCollision<T> {
  row: T;
  kept: T;
  label: string;
}

export interface NameCollisionResult<T> {
  /** Input order, minus the losers. What may compete for a visible slot. */
  visible: T[];
  /** Input order. Still in the universe; appended behind everything visible. */
  demoted: T[];
  collisions: NameCollision<T>[];
}

/**
 * Resolve rows that render under the same label, by DEMOTING the losers rather
 * than removing them.
 *
 * @param rows    the ranked rows, in the order the caller wants them shown
 * @param labelOf the rendered label — the SAME function any disambiguator that
 *                ran before this used to group by, never a second one
 * @param prefer  a TOTAL order over colliding peers; negative means `a` is the
 *                one to show. Must not depend on position in `rows`.
 */
export function resolveNameCollisions<T>(
  rows: readonly T[],
  labelOf: (row: T) => string,
  prefer: (a: T, b: T) => number,
): NameCollisionResult<T> {
  // Group once. The previous shape re-scanned the whole array inside a loop
  // over the whole array, which is quadratic and, worse, made "who are this
  // row's peers" a question answered separately for every row.
  const byLabel = new Map<string, T[]>();
  for (const row of rows) {
    const label = labelOf(row);
    const peers = byLabel.get(label);
    if (peers) peers.push(row);
    else byLabel.set(label, [row]);
  }

  const losers = new Set<T>();
  const collisions: NameCollision<T>[] = [];
  for (const [label, peers] of byLabel) {
    if (peers.length === 1) continue;
    const [kept] = [...peers].sort(prefer);
    for (const row of peers) {
      if (row === kept) continue;
      losers.add(row);
      collisions.push({ row, kept, label });
    }
  }

  return {
    visible: rows.filter((r) => !losers.has(r)),
    demoted: rows.filter((r) => losers.has(r)),
    collisions,
  };
}
