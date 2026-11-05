/**
 * THE RECORDED ANSWER TO "does this programme continue past the round we hold",
 * and the copy a founder reads when it does.
 *
 * `liveness.ts` states the property and the state (`CALL_RECURRENCE`,
 * `callStatus`). This module is where the recorded fact and its provenance
 * live, and it is a LEAF for the same reason `evidenceTier.ts` and
 * `nameEvidence.ts` are: no fs, no pg, no import of corpus.ts. `corpus.ts` has
 * to ask it during hydration, and a module corpus.ts imports may not import
 * corpus.ts back. See lib/intelligence/ARCHITECTURE.md.
 *
 * ── WHERE THIS FACT BELONGS, AND WHERE IT IS ─────────────────────────────
 * It belongs in `funding_instruments.call_recurrence`, beside
 * `source_window_policy` and `route_status`, written at ETL time and — this
 * part is not optional — kept OUT of `BUILT_COLUMNS` in
 * ETL/events/load/populate_funding_instruments.py, which does
 * `DELETE FROM funding_instruments` and restores only the columns it does not
 * build. `route_status` records what happens otherwise: eleven IPCEI rows came
 * back offerable, silently, after a rebuild erased the judgement.
 *
 * It is not there yet, because populating it is a corpus write and this
 * workstream may not make one. So the fact arrives from the same place the
 * evidence does: `project-mgmt/evidence/*.jsonl`, projected by
 * `scripts/emit_call_recurrence.ts` into `./callRecurrence.generated.ts`.
 *
 * That is a stopgap in ONE respect only — its WIDTH. It covers the rows
 * somebody has read the funder's page for, and no others. It is not a stopgap
 * in kind: every entry carries the URL, the read date and a verbatim quote, so
 * it is a stronger record than a column would be on its own, and reading it
 * from the file keeps the axis and its evidence from drifting apart. When the
 * column exists, `corpus.ts` reads it and this file becomes the emitter's
 * target instead of the request path's.
 *
 * ── WHAT MAY NOT BE SAID ─────────────────────────────────────────────────
 * No reopening date. We do not hold one; that is definitionally what puts a row
 * in this state. Every sentence below is either a fact recorded on the row (the
 * window that shut, the date the page was read) or the recurrence statement
 * itself. `liveness.ts` forbids the copy supplying a declaration the funder
 * never made, and a date is the easiest one to supply by accident.
 */
import { CALL_RECURRENCE, isBetweenCalls, type LivenessFacts } from "./liveness";
import { CALL_RECURRENCE_RECORDS } from "./callRecurrence.generated";

/** One funder-page reading, as `project-mgmt/evidence/README.md` defines it.
 *  `url` and `checkedAt` are required and not optional: a verdict with no page
 *  behind it is not a funder statement, and the emitter drops it. */
export interface RecurrenceRecord {
  id: string;
  /** `CALL_RECURRENCE` — what this page establishes about continuation. */
  recurrence: string;
  /** The evidence file's own verdict, carried through because the copy differs:
   *  `open` means a later round was running when the page was read;
   *  `between_calls` means later rounds have run and none is open. */
  funderVerdict: string;
  url: string;
  checkedAt: string;
  /** Verbatim, in the source language. Null when the verdict rests on an
   *  absence, which the README makes an explicit state rather than a blank. */
  quote: string | null;
  funderSays: string;
  /** Which evidence file supplied it. */
  source: string;
}

/** The funder's reading for this row, or undefined when nobody has asked.
 *
 *  Undefined is NOT "does not recur". It is the unexamined state, and it
 *  suppresses, because that is what the corpus does today and a change that
 *  quietly widened it would be the inference this axis exists to refuse. */
export function recurrenceRecord(id: string): RecurrenceRecord | undefined {
  return CALL_RECURRENCE_RECORDS[id];
}

/** The value `LivenessFacts.callRecurrence` takes for this row. Null when
 *  unexamined. One call site: hydration in corpus.ts. */
export function recordedCallRecurrence(id: string): string | null {
  return CALL_RECURRENCE_RECORDS[id]?.recurrence ?? null;
}

/**
 * THE CAVEAT. Rendered by CODE from the recorded fact, never asked of the
 * writer.
 *
 * `watchOnly.ts` is the whole argument for that and it was learned three times:
 * every lever given to the model for expressing "this one is not straight-
 * forward" gets used to smuggle weak funds in, and the model wrote "monitor
 * calls" into the copy of rows it had itself flagged actionable. A between-calls
 * row's caveat is a fact about the corpus, not a judgement about the founder,
 * so the model has no business producing it and no channel through which to
 * omit it.
 *
 * Returns null for a row that is not between calls, so a caller cannot attach
 * this sentence to an open fund.
 */
export function betweenCallsCaveat(
  row: LivenessFacts & { id?: string },
  asOf?: string,
): string | null {
  if (!isBetweenCalls(row, asOf)) return null;
  const rec = row.id ? recurrenceRecord(row.id) : undefined;
  const shut = row.schemeEndDate ? String(row.schemeEndDate).slice(0, 10) : null;
  const window = shut ? `The application window we hold closed on ${shut}.` : "The application window we hold has closed.";
  // `open` and `between_calls` are different sentences because the pages say
  // different things. Neither states when the next window is; we do not hold
  // one, and that is what put the row in this state.
  const body = rec?.funderVerdict === "open"
    // No em-dashes: this is code-built copy, and the house de-dash in
    // `assembleBriefRows` is applied to MODEL prose only.
    ? `When the funder's own page was read on ${rec.checkedAt} it was running a later round of this programme. ` +
      `We do not hold that round's dates, so check the funder's page for the current window before planning around it.`
    : `The funder's own page shows this programme running in rounds beyond the one we hold` +
      (rec ? ` (read ${rec.checkedAt})` : "") +
      `, so it is expected to open again. We do not hold the next window.`;
  return `${window} ${body}`;
}

/** Where the caveat's claim comes from, so a row can cite it the way every
 *  other sourced statement in the brief does. */
export function betweenCallsSource(id: string): { url: string; checkedAt: string; quote: string | null } | null {
  const rec = recurrenceRecord(id);
  return rec ? { url: rec.url, checkedAt: rec.checkedAt, quote: rec.quote } : null;
}

/**
 * ROWS THIS AXIS HAS NOT BEEN ASKED ABOUT, and it is the number that matters.
 *
 * A row suppressed on an expired call deadline with no recorded recurrence
 * answer is a row we are asserting a programme ended without having asked. That
 * is the defect, and it does not go away by being handled correctly — it goes
 * away by somebody reading the page. So the count is exposed, `check_liveness`
 * ratchets it, and it is never allowed to look like a pass.
 *
 * Deliberately NOT a list of ids: the population changes every time a deadline
 * is loaded, and a check that names today's rows is a check that stops working
 * next month.
 */
export function unexaminedClosedRows<T extends LivenessFacts & { id: string }>(
  rows: readonly T[],
  isShutOrBetween: (r: T) => boolean,
): T[] {
  return rows.filter((r) => isShutOrBetween(r) && !recurrenceRecord(r.id));
}

/** True when the row's recorded answer says the funder's own source calls this
 *  the whole programme. Distinct from unexamined, and the distinction is the
 *  point: this row is suppressed on the FUNDER's statement, not on ours. */
export function recordedSingleCall(id: string): boolean {
  return recurrenceRecord(id)?.recurrence === CALL_RECURRENCE.singleCall;
}
