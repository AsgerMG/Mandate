/**
 * The mechanically checkable half of the fund-selection contract.
 *
 * ── Why this had no check at all ──────────────────────────────────────────
 * `contracts/selection/` was not read. `loadContracts()` listed three
 * directories by name -- `_shared`, `brief`, `round2` -- and `selection` had
 * existed alongside them the whole time holding six rules, two of them (hard).
 * Not one of them was subject to the unenforced-rule check, the rule-id prefix
 * check, the enumeration check or the row-cap tie. A registry of directories is
 * the same defect as a register of banned phrases: it covers what somebody
 * remembered. The loader now discovers directories.
 *
 * The row-cap tie is the sharpest illustration. It insists exactly one contract
 * rule states the published row cap, so the number the writer is told and the
 * number the code cuts to cannot drift. SELECT-1 stated a second five, in a
 * file the tie could not see, while the brief publishes six. It no longer
 * states a number at all: the count is passed per request, from the same
 * constant the page is sized by, and `want` below is that number rather than a
 * third copy of it.
 *
 * ── What these two rules are ──────────────────────────────────────────────
 * They are the only rules in this repo about a model's STRUCTURED OUTPUT
 * rather than its prose, which is why they are decidable without reading
 * meaning: a returned index is either inside the candidate list or it is not,
 * and there are either the requested number of distinct ones or there are not.
 * A model that returns an index outside the list has selected a fund that was
 * never offered to it, and downstream that is either a crash or, worse, a row
 * about the wrong fund.
 */

export interface SelectionViolation {
  ruleId: string;
  detail: string;
}

/**
 * Every violation in a gate-2 selection.
 *
 * `want` is passed rather than hardcoded so the check cannot become the second
 * copy of a number the contract also states -- the exact drift that put a five
 * in a contract nothing read while the product moved to six.
 */
export function checkSelection(
  indices: unknown,
  candidateCount: number,
  want: number,
): SelectionViolation[] {
  const v: SelectionViolation[] = [];
  const list = Array.isArray(indices) ? indices : [];
  const whole = list.filter((i): i is number => Number.isInteger(i));
  const distinct = new Set(whole);

  if (distinct.size !== want) {
    v.push({
      ruleId: "SELECT-1",
      detail: `returned ${distinct.size} distinct indices, expected exactly ${want}` +
        (list.length !== whole.length ? ` (${list.length - whole.length} were not whole numbers)` : "") +
        (whole.length !== distinct.size ? ` (${whole.length - distinct.size} repeated)` : ""),
    });
  }
  // Out of range in either direction. A negative index reads as a valid array
  // position in some languages and as the tail in others, so it is invented
  // here exactly as an over-large one is.
  const outside = whole.filter((i) => i < 0 || i >= candidateCount);
  if (outside.length) {
    v.push({
      ruleId: "SELECT-2",
      detail: `${outside.length} index/indices outside the ${candidateCount}-candidate list: ${outside.join(", ")}`,
    });
  }
  return v;
}

/** Every rule id this module can emit, checked against the contracts. */
export const SELECTION_RULE_IDS = ["SELECT-1", "SELECT-2"] as const;
