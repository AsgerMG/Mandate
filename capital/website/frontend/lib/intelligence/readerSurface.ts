// WHAT A FOUNDER READS, IN ONE DEFINITION.
//
// A rule about the reader's text is only as good as the answer to "which text
// is that". `briefChecks.ts` used to hold a hand-written union of nine fields
// and the report renders far more than nine, so `readerText` replaced it with a
// WALK: every string in the report that is not a machine identifier, whatever
// nesting it is at, with no edit here when a field is added.
//
// It moved out of that file the moment a second caller needed it. The walk is
// now read by two things that must never disagree about its answer:
//
//   * `checkBrief`, which asks whether a rule is broken anywhere a founder
//     reads, and
//   * `redactReaderIds` (pipeline.ts), which REPAIRS the same surface before
//     the report is served.
//
// A check and a repair scoped to different sets of fields is the shape of a
// defect that passes: the repair cleans what somebody remembered and the check
// grades the same list, while the field neither of them names ships broken.
// So the collector and the rewriter are the same walk, one key set, one file.

/** Keys whose values are machine identifiers rather than prose a founder
 *  reads. Everything else in the report is on the page in some form.
 *
 *  This is a closed set because the report's SHAPE is closed -- these are the
 *  keys the renderer resolves into hrefs and lookups rather than printing. A
 *  key added tomorrow is prose until someone says otherwise, which is the safe
 *  default: the cost of scanning an identifier is a false positive someone
 *  reads, and the cost of missing a field is a rule that silently stops
 *  applying to it. */
export const NON_READER_KEYS = new Set([
  "url", "link", "channel", "instrumentId", "generatedAt", "provenance",
  "schemeCode", "id", "kind", "verdict", "accessMode",
  // A citation names a document. That is an identifier, and showing it is the
  // product working -- a rule displayed without its source is not evidence. The
  // first run of this walk over a real brief flagged 40 `.pdf` locators as
  // "internal machinery in reader text", which is precisely the crying wolf
  // briefChecks.ts's own header refuses.
  "file", "locator",
  // Computed, ranked on, and NOT PRINTED (see panelReport). Text nobody reads
  // cannot violate a rule about what a founder reads. It carries the gate-count
  // phrasing verbatim, so leaving it in would have made every brief fail
  // BRIEF-4 forever on a string that never reaches the page.
  "whyEasy",
]);

/** Every string in the report a founder can read, whatever nesting it is at. */
export function readerText(value: unknown, key = ""): string[] {
  if (typeof value === "string") return NON_READER_KEYS.has(key) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((x) => readerText(x, key));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !NON_READER_KEYS.has(k))
      .flatMap(([k, x]) => readerText(x, k));
  }
  return [];
}

/**
 * The same walk, rewriting instead of collecting: a copy of `value` with `fn`
 * applied to every string a founder reads and to no other.
 *
 * Non-reader keys are carried through UNTOUCHED rather than dropped -- this
 * returns a report, not a transcript, and `link.url` and `instrumentId` have to
 * survive it intact. Non-string leaves (the euro figures, the counts) are
 * likewise returned as they came.
 */
export function mapReaderText<T>(value: T, fn: (s: string) => string, key = ""): T {
  if (typeof value === "string") {
    return (NON_READER_KEYS.has(key) ? value : fn(value)) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((x) => mapReaderText(x, fn, key)) as unknown as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([k, x]) => [k, NON_READER_KEYS.has(k) ? x : mapReaderText(x, fn, k)]),
    ) as unknown as T;
  }
  return value;
}
