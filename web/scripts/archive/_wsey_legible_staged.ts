// wsEY — does the STAGED text render a line a model can read?
//
// `_wsey_census.ts` is the authority and reads Postgres, which is right: it is
// what a founder sees. But this workstream loads `--sqlite-only` by instruction,
// so the census cannot see staged text and its "renders a line" figure is frozen
// at the pre-load value until someone publishes.
//
// This applies the SAME renderer -- `beyondTitle`, `fundsSentence`, `fundsFloor`
// from lib/intelligence/schemeText.ts, imported and never restated -- to the
// rows as they now stand in SQLite. The open pool and the text come from
// `_wsey_open_coverage.py --json`, which gets liveness from `live_ids()`, which
// is `is_closed()`, which is the projection of liveness.ts. So the only thing
// this file contributes is the join; every judgement in it belongs to a module
// that already owns it.
//
// FREE by construction: ANTHROPIC_API_KEY is deleted before any import, and
// nothing here opens a network connection at all.
//
//   python3 ETL/terms/_wsey_open_coverage.py --json /tmp/x.json --with-text
//   npx tsx scripts/_wsey_legible_staged.ts /tmp/x.json
import { readFileSync } from "fs";

import { loadEnvLocal } from "../loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;

import {
  FUNDS_SENTENCE_CHARS, beyondTitle, fundsFloor, fundsSentence, oneLine,
} from "../../lib/intelligence/schemeText";

type Row = { id: string; name: string; description: string };

function legible(r: Row): boolean {
  const d = (r.description ?? "").trim();
  if (!d) return false;
  if (!beyondTitle(d, oneLine(r.name))) return false;
  return fundsSentence(d, FUNDS_SENTENCE_CHARS).trim().length >= fundsFloor();
}

const path = process.argv[2];
if (!path) throw new Error("usage: _wsey_legible_staged.ts <open_coverage.json>");
const data = JSON.parse(readFileSync(path, "utf8")) as {
  openPool: number; described: number; openRows: Row[];
};
// Optional second argument: an earlier snapshot's `describedIds`. Rows outside
// it are treated as undescribed, which gives the LIKE-FOR-LIKE before figure on
// today's open pool. Sound only because this workstream's loads never overwrite
// a description -- both UPDATEs go through COALESCE -- so a row described
// earlier still carries the same string.
const baseline: Set<string> | null = process.argv[3]
  ? new Set(JSON.parse(readFileSync(process.argv[3], "utf8")).describedIds as string[])
  : null;
const rows = (data.openRows ?? []).map((r) =>
  baseline && !baseline.has(r.id) ? { ...r, description: "" } : r);
const withDesc = rows.filter((r) => (r.description ?? "").trim().length > 0);
const leg = rows.filter(legible);
const pct = (n: number) => `${((100 * n) / (rows.length || 1)).toFixed(1)}%`;
console.log(`OPEN pool           ${rows.length}   (live_ids, SQLite)`);
console.log(`description present ${String(withDesc.length).padStart(4)}  ${pct(withDesc.length)}`);
console.log(`renders a line      ${String(leg.length).padStart(4)}  ${pct(leg.length)}   ` +
  `(beyondTitle + >= ${fundsFloor()} chars, production's own renderer)`);
console.log(`described but MUTE  ${String(withDesc.length - leg.length).padStart(4)}  ` +
  `(has a description the renderer refuses: repeats the title, or too short)`);
