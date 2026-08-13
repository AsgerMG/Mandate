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
const OUT = resolve(__dirname, "../lib/intelligence/callRecurrence.generated.ts");

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

function main(): void {
  const recs = new Map<string, Rec>();
  const files = readdirSync(EVIDENCE_DIR).filter((f) => f.endsWith(".jsonl")).sort();
  let lines = 0, unsettled = 0, unsourced = 0;
  for (const f of files) {
    for (const line of readFileSync(join(EVIDENCE_DIR, f), "utf8").trim().split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      const verdict = String(row.verdict ?? "");
      if (!(verdict in AXIS)) {
        throw new Error(
          `emit_call_recurrence: ${f} carries verdict \`${verdict}\`, which this axis has ` +
          `no decision for. Add it to AXIS with the reason, or state why it emits nothing. ` +
          `Defaulting an unknown verdict either way is the failure the evidence README names.`);
      }
      lines++;
      const axis = AXIS[verdict];
      if (axis === null) { unsettled++; continue; }
      const url = row.checked?.url;
      const checkedAt = row.checked?.checked_at;
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
  const before = (() => { try { return readFileSync(OUT, "utf8"); } catch { return ""; } })();
  const write = process.env.WRITE === "1";
  if (write) writeFileSync(OUT, out);
  console.log(
    `evidence files ${files.length}  lines ${lines}  emitted ${ids.length}  ` +
    `unsettled/no-recurrence-statement ${unsettled}  no url or read date ${unsourced}`);
  const byVerdict = new Map<string, number>();
  for (const r of recs.values()) byVerdict.set(r.funderVerdict, (byVerdict.get(r.funderVerdict) ?? 0) + 1);
  for (const [v, n] of [...byVerdict].sort()) console.log(`  ${String(n).padStart(4)}  ${v}`);
  if (!write && before !== out) {
    console.error(
      "\ncallRecurrence.generated.ts is STALE against the evidence. " +
      "Run WRITE=1 npx tsx scripts/emit_call_recurrence.ts");
    process.exit(1);
  }
}

main();
