/**
 * Project the committed funder-page evidence into the recurrence axis.
 *
 * FREE — reads committed JSONL, writes one generated module. No DB, no model,
 * no network.
 *
 *   npx tsx scripts/emit_call_recurrence.ts          # check, exits non-zero on drift
 *   WRITE=1 npx tsx scripts/emit_call_recurrence.ts  # regenerate
 *
 * ── WHY THE EVIDENCE FILE IS THE SOURCE AND NOT A HAND-WRITTEN MAP ────────
 * `project-mgmt/evidence/README.md` sets the standard this axis has to meet:
 * one line per instrument row, each carrying the URL that was read, the date it
 * was read, and a verbatim quote in the source language — and `unsettled`
 * stated explicitly rather than defaulting either way. That is exactly the
 * evidence `CALL_RECURRENCE` requires before it will lift a row out of
 * suppression, so the axis reads the evidence rather than a copy of it.
 *
 * A row is emitted ONLY when the line carries a URL and a `checked_at`. A
 * verdict with no page behind it is not a funder statement, and this axis has
 * no other kind of input.
 *
 * ── THE MAPPING, and why `open` and `between_calls` share a value ─────────
 * The axis records ONE fact: does the programme continue past the round we
 * hold? Both `open` (the funder is running a later round right now) and
 * `between_calls` (the funder has run later rounds and this one has shut)
 * answer yes, and neither tells us the next window. `retired` answers no.
 * `unsettled` and `not_a_fund` emit nothing — the first because it is
 * explicitly no verdict, the second because it answers a different axis.
 *
 * The funder's own verdict is carried through unchanged beside the axis value,
 * because the copy a founder reads differs between the two: one says a later
 * round is open, the other says the programme runs in rounds. Collapsing them
 * in the emitted record would make the product state something the page did
 * not.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { CALL_RECURRENCE } from "../lib/intelligence/liveness";

const EVIDENCE_DIR = resolve(__dirname, "../../../project-mgmt/evidence");
export const OUT = resolve(__dirname, "../lib/intelligence/callRecurrence.generated.ts");

/** The funder verdicts this axis knows how to read, and what each one means for
 *  "does the programme continue past the round we hold". Stated as a mapping
 *  over the vocabulary `project-mgmt/evidence/README.md` defines, so a verdict
 *  added there without a decision here FAILS rather than defaulting. */
const AXIS: Record<string, string | null> = {
  open: CALL_RECURRENCE.recurs,
  between_calls: CALL_RECURRENCE.recurs,
  retired: CALL_RECURRENCE.singleCall,
  // A DIFFERENT AXIS, and emitting it here would be the conflation
  // `offerRoute.ts` was extracted to end. "Nobody can apply to this" is
  // `route_status = none`; answering it with a window value would make the
  // symptom disappear and leave a non-fund in the corpus, which is exactly what
  // `closed_beneficiary_list` did for six hours. Emits nothing.
  not_a_fund: null,
  unsettled: null,
  // The gate-file verdicts. They answer a different question entirely and
  // carry no statement about recurrence, so they emit nothing.
  gate_wrong: null,
  harness_only: null,
};

interface Rec {
  id: string;
  recurrence: string;
  funderVerdict: string;
  url: string;
  checkedAt: string;
  quote: string | null;
  funderSays: string;
  source: string;
}

export interface BuildResult {
  source: string;
  files: number; lines: number; emitted: number;
  unsettled: number; unsourced: number;
  /** Evidence files that carry no verdict in this axis's vocabulary, named so a
   *  file that MEANT to speak here and misspelled it is visible. */
  skipped: string[];
  byVerdict: Map<string, number>;
}

/** The file this SHOULD hold, from the evidence as it stands. Exported so
 *  `check_liveness` can compare it to disk without a second implementation —
 *  the shape `check_offer_route` uses, and for the same reason: a projection
 *  that nothing compares is a projection that goes stale the first time an
 *  evidence file lands and nobody re-runs the emitter. */
/** The records in a file, skipping blanks. */
function records(f: string): Record<string, unknown>[] {
  return readFileSync(join(EVIDENCE_DIR, f), "utf8").trim().split("\n")
    .filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, unknown>);
}

/**
 * IS THIS FILE ABOUT THIS AXIS AT ALL?
 *
 * ── The fault ─────────────────────────────────────────────────────────────
 * `project-mgmt/evidence/` is one directory for every kind of funder reading,
 * and `verdict` is the word each of them reached for. wsHA's door audit writes
 * `held` and `name_gap` there; wsHF's title audit writes `name_gap`; one wsHA
 * file writes a whole English sentence. Every one of those threw here, because
 * this emitter treated any `verdict` string as a claim ON THIS AXIS that it had
 * not been taught. `check_liveness` had been red since 2026-08-17 and the
 * recurrence projection unverified with it — the exact silent-staleness this
 * emitter is compared against disk to prevent.
 *
 * ── The property, and why it is not a list of filenames ───────────────────
 * A file speaks on this axis when at least one of its records carries a verdict
 * IN THIS AXIS'S VOCABULARY. Nothing else about a file is consulted — not its
 * name, not its date, not who wrote it — so an evidence file landing next year
 * from a workstream nobody here has met is admitted or ignored by what it says.
 *
 * The teeth are kept exactly where they were: INSIDE a file that speaks here,
 * an unrecognised verdict still throws, so a recurrence audit that starts
 * writing `paused` cannot be silently dropped. What is skipped is reported by
 * name, so a file that meant to speak here and misspelled its vocabulary shows
 * up as a skipped file rather than as nothing at all.
 */
function speaksOnThisAxis(f: string): boolean {
  return records(f).some((r) => r.verdict != null && String(r.verdict) in AXIS);
}

export function build(): BuildResult {
  const recs = new Map<string, Rec>();
  const all = readdirSync(EVIDENCE_DIR).filter((f) => f.endsWith(".jsonl")).sort();
  const files = all.filter(speaksOnThisAxis);
  const skipped = all.filter((f) => !files.includes(f));
  let lines = 0, unsettled = 0, unsourced = 0;
  for (const f of files) {
    for (const row of records(f)) {
      // Within a file that DOES speak here, a record with no verdict made no
      // statement — wsGL's audits mix shapes — and an unrecognised verdict is a
      // statement this axis has no decision for and still throws below.
      if (row.verdict == null) continue;
      const verdict = String(row.verdict);
      if (!(verdict in AXIS)) {
        throw new Error(
          `emit_call_recurrence: ${f} carries verdict \`${verdict}\`, which this axis has ` +
          `no decision for. Add it to AXIS with the reason, or state why it emits nothing. ` +
          `Defaulting an unknown verdict either way is the failure the evidence README names.`);
      }
      lines++;
      const axis = AXIS[verdict];
      if (axis === null) { unsettled++; continue; }
      const checked = (row.checked ?? {}) as { url?: unknown; checked_at?: unknown };
      const url = checked.url;
      const checkedAt = checked.checked_at;
      if (!url || !checkedAt) { unsourced++; continue; }
      const id = String(row.instrument_id);
      // Last file wins, and files sort by name, which for this directory is by
      // date. A later audit of the same row supersedes an earlier one.
      recs.set(id, {
        id,
        recurrence: axis,
        funderVerdict: verdict,
        url: String(url),
        checkedAt: String(checkedAt),
        quote: row.quote == null ? null : String(row.quote),
        funderSays: String(row.funder_says ?? ""),
        source: f,
      });
    }
  }

  const ids = [...recs.keys()].sort();
  const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(recs.get(id))},`).join("\n");
  const out =
`// GENERATED by website/frontend/scripts/emit_call_recurrence.ts from
// project-mgmt/evidence/*.jsonl. Do not edit by hand — regenerate.
//
// One entry per instrument row whose FUNDER'S OWN PAGE has been read and which
// carries a URL and a read date. Nothing here is derived from the corpus: the
// derivation was built, measured against these same verdicts, and recovers 0 of
// the 3 programmes that are open today. See CALL_RECURRENCE in ./liveness.ts.
//
// It is exactly as wide as the audit. A row absent from this file is a row
// nobody has asked the funder about, which suppresses on its expired window
// exactly as it does today — see \`unexaminedClosedRows\` in ./callRecurrence.ts
// for the count that makes that state loud rather than invisible.
import type { RecurrenceRecord } from "./callRecurrence";

export const CALL_RECURRENCE_RECORDS: Readonly<Record<string, RecurrenceRecord>> = {
${body}
};
`;
  const byVerdict = new Map<string, number>();
  for (const r of recs.values()) byVerdict.set(r.funderVerdict, (byVerdict.get(r.funderVerdict) ?? 0) + 1);
  return { source: out, files: files.length, lines, emitted: ids.length, unsettled, unsourced, skipped, byVerdict };
}

function main(): void {
  const r = build();
  const before = (() => { try { return readFileSync(OUT, "utf8"); } catch { return ""; } })();
  const write = process.env.WRITE === "1";
  if (write) writeFileSync(OUT, r.source);
  console.log(
    `evidence files ${r.files}  lines ${r.lines}  emitted ${r.emitted}  ` +
    `unsettled/no-recurrence-statement ${r.unsettled}  no url or read date ${r.unsourced}`);
  for (const [v, n] of [...r.byVerdict].sort()) console.log(`  ${String(n).padStart(4)}  ${v}`);
  if (r.skipped.length) {
    console.log(`  ${r.skipped.length} evidence file(s) carry no verdict in this axis's ` +
      `vocabulary and were not read: ${r.skipped.join(", ")}`);
  }
  if (!write && before !== r.source) {
    console.error(
      "\ncallRecurrence.generated.ts is STALE against the evidence. " +
      "Run WRITE=1 npx tsx scripts/emit_call_recurrence.ts");
    process.exit(1);
  }
}

// `main()` only when invoked directly, so `check_liveness` can import `build()`
// without the emitter's own reporting and exit code running inside a check.
if (process.argv[1] && process.argv[1].endsWith("emit_call_recurrence.ts")) main();
