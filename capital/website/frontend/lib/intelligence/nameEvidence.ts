/**
 * Does anything outside a row's own id NAME it? THE definition — one place.
 *
 * ── The property ──────────────────────────────────────────────────────────
 * A ROW MAY BE OFFERED ONLY IF SOMETHING OUTSIDE ITS OWN ID NAMES IT.
 *
 * The test for an unseen row: point at the field in the source record, or the
 * official publication, the name was read from. If the loader assembled the
 * name from its own partition keys, the row is a bucket and not a fund.
 *
 * ── What it cost to leave unasked ────────────────────────────────────────
 * `publishableInstruments()` asks whether a row has CHILDREN, not whether it is
 * a FUND, and twelve childless bucket labels passed it:
 *
 *   satr_ee_equity, satr_lt_equity, satr_pt_equity   the register's country
 *       crossed with the FILTER SET we send to its search API. `SATR Pt Equity`
 *       reached a Portuguese founder's 18-row pool unblocked, rendered as
 *       "National state aid (equity)", typical award EUR 255,571.
 *   eight sudop_*                                    a short slug we invented
 *       per query against Poland's SUDOP API. Poland's ENTIRE offerable pool
 *       was these eight rows; not one real Polish fund was in it.
 *   chips_ju_kdt_unknown                             our parse fallback for a
 *       CORDIS topic code carrying no year.
 *
 * None carries a scheme code, an application URL or a register name. It went
 * unseen because no bench archetype covers EE, LT, PT or PL.
 *
 * ── Why this module reads a column and does not compute one ──────────────
 * Because computing it over-fires, and the over-fire is expensive in the
 * opposite direction. `nameSource === "deterministic"` selects 372 rows.
 * "The name is a mechanical re-casing of the id" selects 94 — and 82 of those
 * are real funds: the eleven IPCEI waves, the eight Innovation Fund lots, every
 * Horizon Europe cluster and Joint Undertaking. Nothing readable from the ROW
 * separates `horizon_eu_cl4`, whose token is CORDIS's own topic-code prefix,
 * from `satr_pt_equity`, whose token is ours.
 *
 * The distinction lives in the EXTRACTOR that composes the event's `source`
 * string, so it is recorded there — declared per feed in
 * data/reference/family_name_evidence.json, written by
 * ETL/events/load/populate_funding_instruments.py (and by
 * ETL/terms/assign_name_evidence.py for a corpus that already exists), and
 * merely READ here. Same shape, and the same reason, as `sourceWindowPolicy`.
 *
 * A leaf module: no imports, so a "use client" component may import it without
 * dragging the corpus in. See lib/intelligence/ARCHITECTURE.md.
 */

/** Who named a row. The ETL's vocabulary, spelled once for the product. */
export const NAME_SOURCE = {
  /** Composed by us from register fields, or from a family key that traces to
   *  a published identifier. A name, and offerable. */
  deterministic: "deterministic",
  /** A human read the official page and wrote the name. */
  curated: "curated",
  /** The feed's own words for the object. */
  programmeFeed: "programme_feed",
  /** The Commission's title for a notified scheme. */
  caseRegister: "case_register",
  /**
   * NOBODY named it. The name is a mechanical re-casing of a key the loader
   * composed out of its own query partitioning. The only value that withholds
   * a row — and the only one that is a statement about US rather than about a
   * source, which is why its evidence is a file:line in this repo.
   */
  partitionKey: "partition_key",
} as const;

/** The minimum a row must expose to be judged, so Postgres rows, the JSON
 *  snapshot and the SQLite rows can all satisfy it. */
export interface NameEvidenceFacts {
  nameSource?: string | null;
}

/**
 * May this row be PROPOSED to a founder as a fund?
 *
 * Absent or unrecognised is `true`, deliberately, and in the same conservative
 * direction as `hasOfferRoute` and `isClosed`: withholding a row is a claim,
 * and the claim here is one the ETL makes explicitly. A corpus that has not
 * been asked the question yet must not silently delete every fund in it —
 * `check_name_evidence.ts` is what makes sure it has been asked.
 */
export function registerNamesTheRow(row: NameEvidenceFacts): boolean {
  return row.nameSource !== NAME_SOURCE.partitionKey;
}
