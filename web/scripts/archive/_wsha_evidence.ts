// wsHA — THE WORKING SET, AS EVIDENCE RATHER THAN AS PROSE.
//
// @ws-active until 2026-09-30
//
// `project-mgmt/evidence/README.md` opens with the reason this file exists:
//
//   > This directory exists because a previous audit of the same question
//   > produced ~90 non-offerable rows, reported them in prose, and was never
//   > committed. The finding is gone and cannot be acted on.
//
// The pairs are the deliverable. A table of percentages over them is a
// summary, and a summary cannot be re-graded, re-sorted, or checked against a
// funder's page by somebody who was not here. So the 287 pairs go to disk one
// JSON object per line, greppable and diffable, in the shape that directory
// already uses.
//
// ── ONE LINE PER PAIR, NOT PER INSTRUMENT ─────────────────────────────────
// The neighbouring files key on `instrument_id` because their question is
// about one row's liveness. This question is about a CHOICE BETWEEN TWO ROWS
// for one founder, so the unit is the pair — the same instrument appears on
// many lines, once per founder it cost, which is the thing worth counting.
//
// `both_known_diff` is the mechanical half of the answer: the columns on which
// the two doors actually disagree with neither side null. It is computed here
// and not asserted, so a reader can re-derive every claim in the finding from
// this file alone.
//
// FREE AND OFFLINE. Reads `_wsha_doors.ts`'s dump. No credentials, no network.
//
//   IN=/tmp/wsha_doors.json OUT=../capital/project-mgmt/evidence/wsha_door_pairs_2026-08-17.jsonl \
//     npx tsx scripts/_wsha_evidence.ts
import { writeFileSync, readFileSync } from "fs";

import type { DoorRow, InstrumentSnapshot } from "./_wsha_doors";

interface Dump {
  meta: Record<string, unknown> & { fingerprint: string };
  rows: DoorRow[];
  snapshot: InstrumentSnapshot[];
}

function norm(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** What a reader needs to tell one door from the other without opening the
 *  corpus: who runs it, what it pays, when it shuts, and whether we hold any
 *  words at all. The long texts are carried as LENGTHS and first lines — the
 *  full text is in the dump and in `_wsha_report.ts`'s `PAIRS=` output, and a
 *  JSONL whose lines are 4kB of German legal text is not greppable. */
function door(s: InstrumentSnapshot | undefined) {
  const f = s?.fields ?? {};
  const txt = (k: string) => (f[k] == null ? null : String(f[k]));
  const head = (k: string, n = 160) => {
    const v = txt(k);
    return v === null ? null : v.replace(/\s+/g, " ").trim().slice(0, n);
  };
  return {
    id: s?.id ?? null,
    name: txt("name"),
    scheme_code: txt("schemeCode"),
    capital_type: txt("capitalType"),
    administering_body: txt("administeringBody"),
    scheme_end_date: txt("schemeEndDate"),
    scheme_end_basis: txt("schemeEndBasis"),
    call_recurrence: txt("callRecurrence"),
    application_url: txt("applicationUrl") ?? txt("application.url"),
    award_p50: f.awardP50 ?? null,
    award_n: f.awardN ?? null,
    description_chars: (txt("description") ?? "").length,
    description_head: head("description"),
    eligibility_chars: (txt("eligibilityText") ?? "").length,
    eligibility_head: head("eligibilityText"),
  };
}

function main() {
  const dump = JSON.parse(
    readFileSync(process.env.IN ?? "/tmp/wsha_doors.json", "utf8")) as Dump;
  const snap = new Map(dump.snapshot.map((s) => [s.id, s]));
  const pairs = dump.rows.filter(
    (r) => r.offerable && r.rankAccessible !== null && !r.hit && r.siblingsShown.length > 0);

  const fieldNames = [...new Set(dump.snapshot.flatMap((s) => Object.keys(s.fields)))].sort();
  const lines: string[] = [];
  for (const r of [...pairs].sort((a, b) =>
    a.wonRegime.localeCompare(b.wonRegime) || a.company.localeCompare(b.company))) {
    const w = snap.get(r.won); const s0 = snap.get(r.siblingsShown[0]);
    const bothKnown: string[] = [];
    const oneKnown: string[] = [];
    for (const f of fieldNames) {
      if (f === "id" || f === "name" || f === "parentId") continue;
      const a = norm(w?.fields[f]); const b = norm(s0?.fields[f]);
      if (a === null && b === null) continue;
      if (a === null || b === null) { oneKnown.push(f); continue; }
      if (a !== b) bothKnown.push(f);
    }
    lines.push(JSON.stringify({
      founder: r.company,
      country: r.country,
      regime: r.wonRegime,
      rank_accessible: r.rankAccessible,
      accessible_len: r.accessibleLen,
      siblings_shown: r.siblingsShown.length,
      won: door(w),
      shown: door(s0),
      // The mechanical half of the finding, per pair. `both_known_diff` is the
      // only list a separating fact can come from; `one_known_diff` differs
      // because our COLLECTION is uneven and ranking on it ranks ourselves.
      both_known_diff: bothKnown,
      one_known_diff: oneKnown,
      draw: dump.meta.fingerprint,
    }));
  }
  const dest = process.env.OUT ?? "/tmp/wsha_door_pairs.jsonl";
  writeFileSync(dest, `${lines.join("\n")}\n`);
  console.log(`wrote ${dest}  (${lines.length} pairs, one JSON object per line)`);
}

main();
