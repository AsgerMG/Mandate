// wsDY — HOW MUCH OF A SCHEME'S OWN PAGE REACHES THE MODEL, AND WHAT A BIGGER
// BUDGET WOULD BUY. Free: no database, no embedding, no model call.
//
// ── Why this exists ───────────────────────────────────────────────────────
// wsDW repaired the RULE that cuts a scheme's description into one row line —
// 51 of 133 described rows on the nine audited menus carried no usable scope
// sentence, and one of them ended after thirty-six characters. It deliberately
// did not touch the BUDGET, because the budget is a prompt-token trade with a
// measured sweep behind it and a different workstream's question.
//
// This is that question. On the Salerno row the clause naming Campania — the
// single fact that makes the fund obviously right for a founder in Campania —
// sits at character 410 of a 725-character description, against a 180-character
// budget. So the hypothesis is testable and cheap: render the nine won rows at
// a range of budgets and READ them. If the identifying fact does not appear
// even at a generous one, the hypothesis is dead at zero cost.
//
// It reads the same two committed artifacts wsDW's counter does — wsDV's nine
// recorded menus and `public/data/instrument_terms.json` — so it costs nothing
// and cannot drift from what shipped.
//
//   npx tsx scripts/_wsdy_budget.ts [rows.json]
import { readFileSync } from "fs";
import path from "path";

import { beyondTitle, fundsSentence, fundsLineDefect } from "../lib/intelligence/schemeText";

interface Case {
  company: string; country: string; won: string; wonIdx: number;
  menuIds: string[]; allBlocks: string[]; picks: number[];
}
interface Rec { id: string; name?: string | null; description?: string | null }

const CAPS = [180, 240, 300, 400, 600, 900];

const ROWS = process.argv[2] ?? path.join(
  process.cwd(), "..", "capital", "project-mgmt", "findings", "nine_wsDV", "rows.json");
const cases = JSON.parse(readFileSync(ROWS, "utf8")) as Case[];
const records = (JSON.parse(readFileSync(
  path.join(process.cwd(), "public", "data", "instrument_terms.json"), "utf8"),
).records ?? []) as Rec[];
const byId = new Map(records.map((r) => [r.id, r]));

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

// ── 1. WHAT A BIGGER BUDGET COSTS, over the rows actually rendered ─────────
// The prompt is 18 rows on the memo seam and 40 on the wsDV menus. Cost is
// stated per menu at both sizes because the seam is the thing that would move.
console.log("=".repeat(78));
console.log("COST: extra description characters per menu, at each budget");
console.log("=".repeat(78));
const menuIds = [...new Set(cases.flatMap((c) => c.menuIds))];
const perRowChars = new Map<number, number>();
for (const cap of CAPS) {
  let total = 0, rows = 0;
  for (const id of menuIds) {
    const r = byId.get(id);
    if (!r?.description) continue;
    rows++;
    total += beyondTitle(r.name, fundsSentence(r.description, cap)).length;
  }
  perRowChars.set(cap, total / Math.max(1, rows));
}
const base = perRowChars.get(180) ?? 0;
console.log(`  ${menuIds.length} distinct funds on the nine menus, ` +
  `${menuIds.filter((id) => byId.get(id)?.description).length} with a description\n`);
console.log("  cap    mean funds: chars/row   +chars on an 18-row menu   ~+input tokens");
for (const cap of CAPS) {
  const m = perRowChars.get(cap) ?? 0;
  const extra18 = (m - base) * 18;
  console.log(`  ${String(cap).padStart(4)}   ${m.toFixed(0).padStart(6)}` +
    `                  ${extra18.toFixed(0).padStart(6)}` +
    `                   ${Math.round(extra18 / 3.5).toString().padStart(5)}`);
}

// ── 2. HOW MUCH OF EACH PAGE IS STILL UNREAD ──────────────────────────────
console.log(`\n${"=".repeat(78)}`);
console.log("REACH: share of the description that reaches the model");
console.log("=".repeat(78));
for (const cap of CAPS) {
  let whole = 0, described = 0, defect = 0;
  for (const id of menuIds) {
    const r = byId.get(id);
    const d = r?.description ? norm(r.description) : "";
    if (!d) continue;
    described++;
    const line = beyondTitle(r!.name, fundsSentence(d, cap));
    if (line && !fundsLineDefect(line, d)) { /* usable */ } else defect++;
    if (d.length <= cap) whole++;
  }
  console.log(`  cap ${String(cap).padStart(4)}: ${whole}/${described} funds rendered WHOLE, ` +
    `${defect} still without a usable line`);
}

// ── 3. THE NINE WON ROWS, READ ────────────────────────────────────────────
console.log(`\n${"=".repeat(78)}`);
console.log("THE NINE WON ROWS at each budget — read these");
console.log("=".repeat(78));
for (const c of cases) {
  const r = byId.get(c.won);
  const d = r?.description ? norm(r.description) : "";
  console.log(`\n### ${c.company} (${c.country}) — won ${c.won}  [menu ${c.wonIdx}]`);
  console.log(`    title: ${norm(r?.name ?? "(none)")}`);
  if (!d) { console.log("    NO DESCRIPTION IN THE CORPUS — no budget can help"); continue; }
  console.log(`    description: ${d.length} chars`);
  let last = "";
  for (const cap of CAPS) {
    const line = beyondTitle(r!.name, fundsSentence(d, cap));
    if (line === last) { console.log(`    [${String(cap).padStart(3)}] (unchanged)`); continue; }
    last = line;
    console.log(`    [${String(cap).padStart(3)}] ${line || "(no funds: line)"}`);
  }
  if (d.length > (CAPS[CAPS.length - 1] ?? 0)) {
    console.log(`    [FULL] ${d}`);
  }
}
