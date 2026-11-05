// wsIR — turn the raw `FUNNEL_TRACE` dumps into a COMMITTABLE per-founder trace.
//
// FREE. Reads and writes files; no database, no embeddings, no model calls, no
// credentials, no network.
//
// ── The conflict this resolves ────────────────────────────────────────────
// `measure_funnel.ts` REFUSES to write a `FUNNEL_TRACE` inside the working tree,
// and it is right to: each line carries `regime`, which is the won fund's
// rollup and for a standalone fund is that fund's OWN id, so a per-founder dump
// is a partial copy of the answer key. wsGX therefore wrote its traces to a
// scratchpad — and they are GONE. The empty directory is still there. Its
// binary pairing summary survived only because that one file was committed.
//
// That is the whole problem this workstream was told to fix: every per-pair dump
// this project ever made went to `/tmp`, so eight under-measured routes cannot
// be re-scored today and we paid for all of them.
//
// Both constraints are real, so neither is broken. What gets committed is the
// trace with the ONE answer-bearing field removed:
//
//   regime  ->  an OPAQUE GROUP ID (`g0`, `g1`, …), assigned by descending
//               frequency over the population and IDENTICAL across arms.
//
// Everything a re-scoring needs survives. The pairing is positional (`i`), the
// three ranks are intact, `offerable` still selects the movable population, and
// grouping is preserved exactly — so a paired bootstrap, a McNemar, a
// leave-one-regime-out and a concentration figure can all be recomputed from
// the committed files by someone who never sees a fund name. What is DROPPED is
// only the map from group to regime NAME, which is what would make the file an
// answer key. The named aggregate breakdown is reported in the README instead,
// which is the same shape wsGX committed in `PAIRS_on.txt` and is not
// per-founder.
//
//   OUT=<dir> npx tsx scripts/_wsir_redact.ts <trace.jsonl>...
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

import { isDescribed, loadRecallSet } from "./recallSet";

/** ── THE `descriptionSource` COLUMN, AND WHY IT NEEDS NO RE-RUN ────────────
 *
 *  `THEME_WEIGHT = 0.6` (`shortlist.ts:164`), and the theme cosine is taken
 *  against the founder's description — so the dominant term in the score is
 *  computed from whatever text the recall set supplied. On the holdout, one row
 *  per company (n=3,720), that text is a CANNED SECTOR SENTENCE for 76.2% of
 *  founders; only 459 (12.3%) are the company's own words and 11.4% are another
 *  company's text borrowed across regimes. `shortlist.ts:2930` already prices
 *  the difference at 33% against 18% on the forced-specific branch.
 *
 *  If that is right, every flat ranking result in this archive may be a
 *  property of a population whose main signal is absent rather than of the
 *  product. The column is therefore worth more than its width — but it does NOT
 *  justify re-cutting an arm, because the trace is POSITIONAL over a draw that
 *  is fully reproducible offline:
 *
 *    holdout + `isDescribed`, sorted by `name.localeCompare`, deduped to one
 *    row per company, and NOT sampled (`N=0` is the whole population).
 *
 *  `reattributeMissingAnswers` cannot disturb that: it rewrites `instrument`
 *  and never adds or drops a row, so membership and order are untouched.
 *
 *  ── PROVEN BEFORE IT IS USED ──────────────────────────────────────────────
 *  The rebuild is not trusted, it is CHECKED: the reconstructed founder at
 *  every index must carry the country the trace recorded at that index, on all
 *  of them, or this throws. That is the same discipline wsIQ used on wsGA
 *  (98/98) and wsIJ before it — a reconstruction that cannot fail loudly is a
 *  guess with a join in it.
 *
 *  The label is provenance, not an answer: it says where the QUERY TEXT came
 *  from and never which fund was won. `own_project_title_leaks` is already
 *  excluded from the population by `isDescribed`. */
function drawnFounders(): { name: string; country: string; descriptionSource: string }[] {
  const { rows } = loadRecallSet("wsIR trace join");
  const seen = new Set<string>();
  return rows
    .filter((r) => r.split === "holdout" && isDescribed(r))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)))
    .map((r) => ({
      name: r.name, country: r.country,
      descriptionSource: String(r.descriptionSource ?? "none"),
    }));
}

interface Row {
  i: number; country: string; regime: string;
  inCorpus: boolean; offerable: boolean;
  rankTable: number | null; rankAccessible: number | null; rankWriter: number | null;
  tableLen: number; accessibleLen: number;
}

function load(file: string): { header: Record<string, unknown>; rows: Row[] } {
  const lines = readFileSync(file, "utf8").trim().split("\n");
  return { header: JSON.parse(lines[0]), rows: lines.slice(1).map((l) => JSON.parse(l) as Row) };
}

function main(): void {
  const out = process.env.OUT;
  const files = process.argv.slice(2);
  if (!out || !files.length) throw new Error("_wsir_redact: OUT=<dir> and at least one trace file");

  const loaded = files.map((f) => ({ f, ...load(f) }));

  // The group map is built over the UNION and applied to every arm, so a group
  // id means the same thing in every committed file. Two arms of one draw carry
  // the same regime per founder — asserted, because a silent mismatch would make
  // the committed traces unpairable in a way no later reader could detect.
  const first = loaded[0];
  for (const l of loaded.slice(1)) {
    if (l.rows.length !== first.rows.length) {
      throw new Error(`_wsir_redact: ${l.f} has ${l.rows.length} rows against ${first.f}'s ${first.rows.length}`);
    }
    for (let i = 0; i < l.rows.length; i++) {
      if (l.rows[i].regime !== first.rows[i].regime || l.rows[i].country !== first.rows[i].country) {
        throw new Error(`_wsir_redact: founder ${i} differs between ${first.f} and ${l.f} — different draws`);
      }
    }
  }

  // The draw, rebuilt and PROVEN against what the harness actually recorded.
  const drawn = drawnFounders();
  if (drawn.length !== first.rows.length) {
    throw new Error(`_wsir_redact: rebuilt draw is ${drawn.length} founders, the trace has `
      + `${first.rows.length}. The population filter here and the one in measure_funnel.ts `
      + "have diverged; the join would be off by an unknown offset.");
  }
  const mismatch = first.rows.findIndex((r, i) => drawn[i].country !== r.country);
  if (mismatch >= 0) {
    throw new Error(`_wsir_redact: at index ${mismatch} the rebuilt draw is `
      + `${drawn[mismatch].country} and the trace says ${first.rows[mismatch].country}. `
      + "The rebuild does not reproduce the draw, so descriptionSource cannot be attached.");
  }
  console.log(`draw rebuilt and verified: ${drawn.length}/${drawn.length} founders agree on country`);

  const freq = new Map<string, number>();
  for (const r of first.rows) freq.set(r.regime, (freq.get(r.regime) ?? 0) + 1);
  // Ties broken by NAME so the assignment is deterministic across machines and
  // reruns; a frequency-only sort would be at the mercy of Map order.
  const ordered = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const group = new Map(ordered.map(([regime], k) => [regime, `g${k}`]));

  mkdirSync(out, { recursive: true });
  for (const l of loaded) {
    const name = path.basename(l.f);
    const body = [JSON.stringify({
      ...l.header,
      redacted: "regime -> opaque group id; see _wsir_redact.ts",
      groups: group.size,
    })].concat(l.rows.map((r) => JSON.stringify({
      i: r.i, country: r.country, group: group.get(r.regime),
      descriptionSource: drawn[r.i].descriptionSource,
      inCorpus: r.inCorpus, offerable: r.offerable,
      rankTable: r.rankTable, rankAccessible: r.rankAccessible, rankWriter: r.rankWriter,
      tableLen: r.tableLen, accessibleLen: r.accessibleLen,
    }))).join("\n");
    writeFileSync(path.join(out, name), body + "\n");
    console.log(`wrote ${path.join(out, name)} (${l.rows.length} founders)`);
  }
  console.log(`${group.size} regime(s) mapped to opaque group ids over ${first.rows.length} founders`);
}

main();
