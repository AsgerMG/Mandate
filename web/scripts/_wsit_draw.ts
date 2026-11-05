// wsIT — rebuild the funnel draw and dump it, so a free analysis can join
// description TEXT to the committed per-founder trace.
//
// FREE. Reads two files and writes one; no database, no embeddings, no model
// calls, no credentials, no network. It therefore declares no credentials.
//
// ── Why this exists rather than a Python re-sort ──────────────────────────
// The draw is `holdout + isDescribed`, sorted by `name.localeCompare`, deduped
// to one row per company, unsampled. `localeCompare` is ICU collation; a
// codepoint sort in another language is NOT the same order, and an off-by-one
// join against a positional trace is silent. So the draw is rebuilt HERE, with
// the same import `_wsir_redact.ts` uses, and PROVEN the same way: the country
// at every index must equal the country the trace recorded at that index.
//
//   TRACE=<trace.jsonl> OUT=<file.jsonl> npx tsx scripts/_wsit_draw.ts
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

import { isDescribed, loadRecallSet } from "./recallSet";

interface TraceRow { i: number; country: string; descriptionSource?: string }

function main(): void {
  const trace = process.env.TRACE;
  const out = process.env.OUT;
  if (!trace || !out) throw new Error("_wsit_draw: TRACE=<trace.jsonl> OUT=<file.jsonl>");

  const lines = readFileSync(trace, "utf8").trim().split("\n");
  const rows = lines.slice(1).map((l) => JSON.parse(l) as TraceRow);

  const { rows: all } = loadRecallSet("wsIT draw rebuild");
  const seen = new Set<string>();
  const drawn = all
    .filter((r) => r.split === "holdout" && isDescribed(r))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));

  if (drawn.length !== rows.length) {
    throw new Error(`_wsit_draw: rebuilt draw is ${drawn.length}, trace has ${rows.length}`);
  }
  const bad = rows.findIndex((r, i) => drawn[i].country !== r.country);
  if (bad >= 0) {
    throw new Error(`_wsit_draw: index ${bad} country mismatch `
      + `(${drawn[bad].country} vs ${rows[bad].country}) — the rebuild is not the draw`);
  }
  // The provenance label is recorded in the trace as well; agreement on it is a
  // second, independent proof of the same join.
  const badSrc = rows.findIndex((r, i) =>
    r.descriptionSource !== undefined
    && String(drawn[i].descriptionSource ?? "none") !== r.descriptionSource);
  if (badSrc >= 0) throw new Error(`_wsit_draw: index ${badSrc} descriptionSource mismatch`);
  console.log(`draw rebuilt and verified: ${drawn.length}/${drawn.length} on country and provenance`);

  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(out, drawn.map((r, i) => JSON.stringify({
    i,
    name: r.name,
    country: r.country,
    sector: r.sector ?? "",
    descriptionSource: String(r.descriptionSource ?? "none"),
    descriptionRebuilt: Boolean(r.descriptionRebuilt),
    mode: r.mode,
    description: r.description ?? "",
    answerTicketBand: r.answerTicketBand ?? "",
    answerTicketSource: r.answerTicketSource ?? "",
    regionSource: r.regionSource ?? "",
    traced: r.traced ?? "",
  })).join("\n") + "\n");
  console.log(`wrote ${out}`);
}

main();
