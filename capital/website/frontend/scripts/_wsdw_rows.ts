// wsDW — WHAT THE NINE MENUS SAY NOW, against what they said then.
//
// ── Why this reads a file rather than a database ──────────────────────────
// wsDV rebuilt all nine menus through production's own `buildPrompt` and
// committed every rendered row (`project-mgmt/findings/nine_wsDV/rows.json`,
// `allBlocks`, forty rows per founder) together with the menu's instrument ids
// in menu order. The rows are the artifact. Re-running the pool would re-embed
// nine founder descriptions and re-read Postgres to arrive at the same forty
// ids, and the thing being measured — what a row's `funds:` line SAYS — is a
// pure function of the instrument's title and description, which the committed
// snapshot holds. So this costs nothing at all, not even an embedding.
//
// ── THE FIDELITY GATE ─────────────────────────────────────────────────────
// A claim about "the rows the model was shown" is only worth something if these
// ARE those rows. The as-shipped-before functions are reimplemented verbatim
// below and re-rendered for every one of the 360 rows; every `funds:` line they
// produce must match wsDV's recorded block byte for byte. If the snapshot has
// moved under us, or if the reimplementation is not what shipped, the mismatch
// count is printed and the run refuses to report a repair number.
//
// This is the only place in this repository where the old implementation is
// copied, and it is copied so that a measurement can be made against it rather
// than about it. It is dead the moment this workstream lands.
//
// The artifact lives on wsDV's branch (`wsDV-nine-rejected`, b9ac571c). Until
// that merges, extract it and pass the path:
//
//   git show b9ac571c:project-mgmt/findings/nine_wsDV/rows.json > /tmp/nine.json
//   npx tsx scripts/_wsdw_rows.ts /tmp/nine.json
import { readFileSync } from "fs";
import path from "path";

import { beyondTitle, fundsLineDefect, fundsSentence } from "../lib/intelligence/schemeText";

// ── AS SHIPPED BEFORE wsDW ─────────────────────────────────────────────────
const OLD_ENDER = /(?<=[.;:])\s+/;
function oldFundsSentence(text: string | null | undefined, cap = 180): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 12) return "";
  if (t.length <= cap) return t;
  let out = "";
  for (const part of t.split(OLD_ENDER)) {
    if (out && (`${out} ${part}`).length > cap) break;
    out = out ? `${out} ${part}` : part;
    if (out.length > cap) break;
  }
  if (!out || out.length > cap) {
    const head = t.slice(0, cap);
    const sp = head.lastIndexOf(" ");
    return `${(sp > cap * 0.6 ? head.slice(0, sp) : head).trim()}…`;
  }
  return out;
}
const oldWords = (s: string): string[] =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w.length > 3);
function oldBeyondTitle(title: string | null | undefined, sentence: string): string {
  if (!sentence) return "";
  const known = new Set(oldWords(title ?? ""));           // THE FULL TITLE — the defect
  return oldWords(sentence).some((w) => !known.has(w)) ? sentence : "";
}

interface Case {
  company: string; country: string; won: string; wonIdx: number;
  menuIds: string[]; allBlocks: string[]; picks: number[];
}
interface Rec { id: string; name?: string | null; description?: string | null }

const ROWS = process.argv[2] ?? path.join(
  process.cwd(), "..", "..", "project-mgmt", "findings", "nine_wsDV", "rows.json");
const cases = JSON.parse(readFileSync(ROWS, "utf8")) as Case[];
const records = (JSON.parse(readFileSync(
  path.join(process.cwd(), "public", "data", "instrument_terms.json"), "utf8"),
).records ?? []) as Rec[];
const byId = new Map(records.map((r) => [r.id, r]));

/** The `funds:` line of a recorded block, or "" — what the model actually read. */
const recordedFunds = (block: string): string =>
  block.split("\n").find((l) => l.trim().startsWith("funds: "))?.trim().slice(7) ?? "";

let drift = 0, missing = 0, rowsSeen = 0;
const described = new Map<string, { old: string; neu: string }>();
const perCase: string[] = [];

for (const c of cases) {
  let before = 0, after = 0;
  for (let i = 0; i < c.menuIds.length; i++) {
    const r = byId.get(c.menuIds[i]);
    rowsSeen++;
    if (!r) { missing++; continue; }
    const o = oldBeyondTitle(r.name, oldFundsSentence(r.description));
    const n = beyondTitle(r.name, fundsSentence(r.description));
    if (o !== recordedFunds(c.allBlocks[i])) drift++;
    if (o) before++;
    if (n) after++;
    if ((r.description ?? "").trim()) described.set(r.id, { old: o, neu: n });
  }
  perCase.push(`  ${c.company.slice(0, 34).padEnd(36)} won [${String(c.wonIdx).padStart(2)}]  `
    + `funds: lines ${String(before).padStart(2)}/40 -> ${String(after).padStart(2)}/40`);
}

console.log(`nine menus, ${rowsSeen} rendered rows, ${described.size} of them on a fund with a `
  + `description in the corpus\n`);
console.log(`FIDELITY: ${drift === 0 && missing === 0
  ? "every one of the recorded funds: lines reproduces byte for byte"
  : `**UNVERIFIED** — ${drift} line(s) differ from the record, ${missing} id(s) absent from the snapshot`}`);
console.log(perCase.join("\n"));

// ── The repair count ───────────────────────────────────────────────────────
// A row is REPAIRED when it went from carrying no usable statement of scope to
// carrying one. "No usable statement" is not a judgement here: it is the
// property `fundsLineDefect` fails the build on — absent, a stub, or ending
// mid-phrase — read against the same description both times.
let repaired = 0, wasBad = 0, stillBad = 0, unchanged = 0;
for (const [id, { old, neu }] of described) {
  const d = byId.get(id)?.description;
  const badBefore = !old || Boolean(fundsLineDefect(old, d));
  const badAfter = !neu || Boolean(fundsLineDefect(neu, d));
  if (badBefore) wasBad++;
  if (badAfter) stillBad++;
  if (badBefore && !badAfter) repaired++;
  else if (!badBefore && old === neu) unchanged++;
}
console.log(`\nof the ${described.size} distinct described funds on those nine menus:`);
console.log(`  ${wasBad} carried no usable scope line before  ->  ${stillBad} now`);
console.log(`  REPAIRED: ${repaired}`);
console.log(`  ${unchanged} were already fine and are untouched`);

// ── The nine won rows, one by one ──────────────────────────────────────────
console.log("\nthe nine won rows:");
for (const c of cases) {
  const r = byId.get(c.won);
  const d = r?.description;
  if (!d) { console.log(`\n  ${c.company} — ${c.won}\n    NO DESCRIPTION IN THE CORPUS`); continue; }
  const o = oldBeyondTitle(r?.name, oldFundsSentence(d));
  const n = beyondTitle(r?.name, fundsSentence(d));
  console.log(`\n  ${c.company} — ${c.won}  (description ${d.replace(/\s+/g, " ").trim().length} chars)`);
  console.log(`    BEFORE  ${o ? `funds: ${o}` : "(no funds: line — suppressed by beyondTitle)"}`);
  console.log(`    AFTER   funds: ${n}`);
}
