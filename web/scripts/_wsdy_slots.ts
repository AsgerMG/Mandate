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
//   npx tsx scripts/_wsdy_slots.ts [dir]//
// ██ THE THEME TEST IN HERE IS WITHDRAWN. wsIB, 2026-08-19. ██
//
// Every number this file prints about "the prompt's own two disqualifiers" is a
// number about strict string equality between one taxonomy label and another.
// That test throws out the fund the company ACTUALLY WON on 43.6% and 46.2% of
// founders across the two paid forty-row tapes, against the 48.4% and 48.0% at
// which it condemns the model, and the sector rule it attributes to the prompt
// is not in the prompt: `buildPrompt`'s only sector sentence is a tie-break
// about the TITLE and disqualifies nothing. The tests themselves now live once,
// in `scripts/_ruler.ts`, and `npx tsx scripts/_wsib_ruler.ts` reproduces every
// figure below before reporting the calibrated ones -- 48.4% becomes 3.3%, and
// 26 of 78 founders short of seats becomes 0 of 78. This file is kept so the
// withdrawn numbers can still be reproduced; do not quote them.
//
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("_wsdy_slots", ["DATABASE_URL", "VOYAGE_KEY"]);

import { readFileSync, existsSync } from "fs";
import path from "path";

import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import { SECTOR_WORD } from "../lib/intelligence/shortlist";
import { awardMedian, awardMismatch, menuRows, themeMismatch } from "./_ruler";

const DIR = process.argv[2] ?? path.join(
  process.cwd(), "..", "..", "project-mgmt", "findings", "first_test_wsDQ");

/** THE SECTOR MAP THAT WAS HERE HELD SIX ENTRIES WHERE `shortlist.ts` HOLDS
 *  TEN. A founder in `energy & cleantech` or `materials & chemicals` therefore
 *  had EVERY described row counted off-theme, because `theme` came back
 *  undefined and the expression `!desc || (theme && ...)` is falsy for it. None
 *  of the twelve bench companies is in one of the four missing sectors, so this
 *  file's own numbers are unchanged by the repair -- but the three other copies
 *  of this ruler imported `SECTOR_WORD` and this one did not, which is what a
 *  "keep in sync" comment buys. The tests now live once, in `_ruler.ts`. */

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
  const rows = menuRows(readFileSync(f, "utf8"));
  let onTheme = 0, rightSize = 0, both = 0;
  for (const r of rows) {
    // Both applied GENEROUSLY, as they always were here: a row with no
    // descriptor is on theme and a row with no median is the right size, so
    // `null` -- cannot say -- counts as surviving.
    const t = themeMismatch(r.block, SECTOR_WORD[c.sector]) !== true;
    const s = awardMismatch(awardMedian(r.block), c.ticketBand) !== true;
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
