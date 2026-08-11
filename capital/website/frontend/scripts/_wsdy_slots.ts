// wsDY — HOW MANY OF THE EIGHTEEN ROWS SURVIVE THE PROMPT'S OWN DISQUALIFIERS.
//
// ── The question, and why it is answered from recorded bytes ──────────────
// Three workstreams have closed three explanations for the selector's category
// errors: not depth (wsDR), not the questions (wsDT), not reasoning capacity
// (wsDS, which ran the same twelve at effort `high` on a byte-identical menu).
// The remaining suspect was the task we set it. The model answered that itself,
// unprompted, in the reasoning wsDS paid for and did not read for this purpose:
//
//   bunq   "only #2 and #4 explicitly match the software and AI sector"
//          "I'm constrained to pick 6 from this list of 18, so I need to
//           identify which ones are least egregiously mismatched"
//   Neura  "that's just three options when I need six distinct picks. Since the
//           requirement is to return exactly six selections regardless of fit
//           quality, I'll have to rank them with the best matches first"
//   Nortal "only one program (option 0) actually lands within the requested
//           bracket. Every other option falls well below"
//
// This turns that from three quotes into a count over all twelve, using the two
// disqualifiers THE PROMPT ITSELF STATES and nothing else:
//
//   "a scheme whose typical cheque is an order of magnitude away from what this
//    company needs is the wrong scheme however well the rest fits"
//   "where two are equally good, prefer the one whose title is specific to what
//    this company does"
//
// It parses the prompts exactly as recorded in project-mgmt/findings, so it
// costs nothing, makes no call, and cannot describe a prompt other than the one
// that was sent.
//
//   npx tsx scripts/_wsdy_slots.ts [dir]
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";

import { COMPANIES } from "../lib/intelligence/__benchCompanies";

const DIR = process.argv[2] ?? path.join(
  process.cwd(), "..", "..", "project-mgmt", "findings", "first_test_wsDQ");

/** The descriptor a row would carry if it were on this company's own theme.
 *  These are the corpus's own `mostly X` labels, read off the rendered rows
 *  rather than invented: the point is what a reader of the ROW sees. */
const THEME: Record<string, string> = {
  software_data_ai: "software & AI",
  industrial_manufacturing: "industrial manufacturing",
  health_life_sciences: "health & life sciences",
  agrifood: "agrifood",
  mobility_transport: "mobility & transport",
  semiconductors_electronics: "semiconductors & electronics",
};

/** The bottom of what the founder said they need, in euro. The prompt's money
 *  rule is stated against "what this company needs", and the generous reading
 *  of it -- the one that counts the MOST rows as survivors -- is the bottom of
 *  the band, divided by ten for "an order of magnitude". */
const BAND_FLOOR: Record<string, number> = {
  b100k_500k: 100_000, b500k_2m5: 500_000, b2m5_15m: 2_500_000,
  b15m_50m: 15_000_000, gt50m: 50_000_000,
};

const money = (s: string): number | null => {
  const m = s.match(/typical award EUR ([\d.]+)([MkB]?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "B" ? n * 1e9 : m[2] === "M" ? n * 1e6 : m[2] === "k" ? n * 1e3 : n;
};

interface Row { i: number; head: string; block: string }

function rowsOf(prompt: string): Row[] {
  const start = prompt.indexOf("\nCANDIDATES\n");
  const body = start < 0 ? prompt : prompt.slice(start + 12);
  const out: Row[] = [];
  let cur: Row | null = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^\[(\d+)\] /);
    if (m) { if (cur) out.push(cur); cur = { i: Number(m[1]), head: line, block: line }; }
    else if (cur && line.startsWith("     ")) cur.block += `\n${line}`;
    else if (cur && !line.trim()) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

console.log("Per company: of the 18 rows the model read, how many survive the two");
console.log("disqualifiers the prompt itself states. Both are applied GENEROUSLY —");
console.log("a row with no descriptor counts as on-theme, a row with no award median");
console.log("counts as the right size — so every number below is an UPPER bound.\n");
console.log("company             onTheme  rightSize  BOTH   asked for");
console.log("-".repeat(62));

let bothTotal = 0, n = 0, under6 = 0;
const perCompany: { company: string; both: number }[] = [];

for (const c of COMPANIES) {
  const f = path.join(DIR, slug(c.company), "prompt_r1.txt");
  if (!existsSync(f)) { console.log(`${c.company.padEnd(20)} (no recorded prompt)`); continue; }
  const rows = rowsOf(readFileSync(f, "utf8"));
  const theme = THEME[c.sector];
  const floor = (BAND_FLOOR[c.ticketBand] ?? 0) / 10;
  let onTheme = 0, rightSize = 0, both = 0;
  for (const r of rows) {
    // On theme: the row's own `mostly X` descriptor is this company's, or it
    // carries none at all. A row that names another sector is off theme.
    const desc = r.head.length ? r.block.match(/· mostly ([^·\n]+)/) : null;
    const t = !desc || (theme && desc[1].trim() === theme);
    // Right size: within an order of magnitude of the floor of the band, or no
    // median at all ("no reliable award median" is unknown, not a mismatch).
    const m = money(r.block);
    const s = m == null || m >= floor;
    if (t) onTheme++;
    if (s) rightSize++;
    if (t && s) both++;
  }
  n++; bothTotal += both;
  if (both < 6) under6++;
  perCompany.push({ company: c.company, both });
  console.log(`${c.company.padEnd(20)}${String(onTheme).padStart(5)}` +
    `${String(rightSize).padStart(10)}${String(both).padStart(8)}` +
    `      6 of ${rows.length}`);
}

console.log("-".repeat(62));
console.log(`\nmean rows surviving BOTH of the prompt's own disqualifiers: ` +
  `${(bothTotal / Math.max(1, n)).toFixed(1)} of 18`);
console.log(`companies with FEWER than the six they must name: ${under6}/${n}`);
console.log(`\nEvery seat above that count is a seat the model must fill with a row it`);
console.log(`has itself just disqualified. The prompt offers no way to name fewer.`);
