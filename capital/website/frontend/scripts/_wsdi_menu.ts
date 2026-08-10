// wsDI — the same question as `_wsdi_reach.ts`, asked where it is decided: on
// the 40-row menu the selector actually reads.
//
// FREE: reads the committed gate-1 fixture and one Postgres query. No model
// calls, no embeds.
//
// `_wsdi_reach.ts` measures the corpus. This measures the PROMPT: it renders
// each fixture case's subset through production's own `renderMenu`, so what is
// counted is the text the model is handed and not a reconstruction of it. Two
// siblings are BLIND when their rendered rows are identical once the index and
// the name are removed — the model can read both and has been given no reason
// to prefer either.
//
// It also prints characters per row, which is the budget any new field spends.
//
//   npx tsx scripts/_wsdi_menu.ts
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { renderMenu } from "../lib/intelligence/fundSelection";
import { awardBand, type AxisFund } from "../lib/intelligence/shortlistAxes";

loadEnvLocal();
requireCredentials("wsdi_menu", ["DATABASE_URL"]);

const SPLIT = process.env.SPLIT ?? "holdout";

interface Case {
  name: string; country: string; sector: string; description: string;
  want: string; wantRegime: string; baselineTop5: string[]; poolSize: number;
  subset: (AxisFund & { profile?: string })[];
}

const h = (s: unknown) => (s == null ? "" : String(s).trim().toLowerCase().replace(/\s+/g, " "));

/** Strip the index label and the fund's own name, so what is compared is the
 *  REASONS on the row rather than the label at the top of it.
 *
 *  The `(rank R of N siblings)` parenthetical is stripped too, and this is the
 *  load-bearing part. It is unique to each sibling BY CONSTRUCTION — an
 *  ordinal the renderer assigns, not a fact about the fund — so leaving it in
 *  makes every sibling pair look separated and the blind count is zero for a
 *  reason that has nothing to do with the corpus. The share percentage it sits
 *  beside is kept: that is a real, comparable quantity. */
function reasonsOf(row: string): string {
  return row.split("\n").slice(1).map((l) => l.trim()).join(" ")
    .replace(/\(\d+ of \d+ siblings\)/g, "");
}

/** ── Why "identical rows" is the wrong test, and what replaces it ──────────
 *
 *  Byte-identical sibling rows do not exist: `typical award EUR 272k` against
 *  `EUR 382k`, and two paraphrases of the SAME China-participation exclusion,
 *  make every pair look separated. Nine Horizon clusters render nine different
 *  rows and not one of them says what any cluster is ABOUT.
 *
 *  So separation is measured in substance, not in bytes. A pair is BLIND when
 *  the facts on the row put both funds in the same place a founder could act
 *  on — same body, same award BAND (the renderer's own bands, not the euro),
 *  same capital type, same rounded sector share — and the "specific to it"
 *  text is a paraphrase rather than a different demand. A store SEPARATES a
 *  pair only when its own text is substantively different, on the same
 *  measure. Two thresholds, one on each side, so a store cannot score by
 *  being verbose. */
const TOKENS = (s: string) => new Set(s.toLowerCase().match(/[a-zÀ-ɏ]{4,}/g) ?? []);
function jaccard(a: string, b: string): number {
  const A = TOKENS(a), B = TOKENS(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
/** Paraphrase, not a different demand. */
const SAME_DEMAND = 0.7;
/** A genuinely different statement, not a reworded one. */
const DIFFERENT = 0.5;

/** Whole sentences up to `cap` chars, and always at least one. */
export function sentences(text: string, cap: number): string {
  const t = (text ?? "").trim();
  if (t.length <= cap) return t;
  const parts = t.split(/(?<=[.;])\s+/);
  let out = "";
  for (const p of parts) {
    if (out && (out + " " + p).length > cap) break;
    out = out ? `${out} ${p}` : p;
  }
  return (out || t.slice(0, cap)).slice(0, cap * 2);
}

/** The rendered share, which IS a comparable quantity, without the ordinal. */
const sharePct = (reasons: string) => /(\d+)% of this family/.exec(reasons)?.[1] ?? "";
/** The "specific to it" clause, which is where a real demand would appear. */
const specific = (reasons: string) => /specific to it: (.*)$/.exec(reasons)?.[1] ?? "";

/** Split a rendered menu back into its rows, keyed by subset index. */
function rowsOf(menu: string, n: number): Map<number, string> {
  const out = new Map<number, string>();
  let cur: number | null = null; let buf: string[] = [];
  for (const line of menu.split("\n")) {
    const m = /^\[(\d+)\]/.exec(line);
    if (m) {
      if (cur != null) out.set(cur, buf.join("\n"));
      cur = Number(m[1]); buf = [line];
    } else if (cur != null && /^ {5}/.test(line)) buf.push(line);
    else if (cur != null) { out.set(cur, buf.join("\n")); cur = null; buf = []; }
  }
  if (cur != null) out.set(cur, buf.join("\n"));
  if (out.size !== n) console.error(`  ! parsed ${out.size} rows of ${n}`);
  return out;
}

async function main() {
  const fx = JSON.parse(readFileSync(`fixtures/gate1_${SPLIT}.json`, "utf8"));
  const cases: Case[] = fx.cases;

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const inst = await db.query(`
    SELECT id, description, eligibility_text, catchment_regions, catchment_source
      FROM funding_instruments`);
  const cl = await db.query(`
    SELECT instrument_id, clause_type, clause_key, text FROM eligibility_clauses`);
  const ap = await db.query(`SELECT instrument_id, quote FROM instrument_application`);
  await db.end();

  const col = new Map<string, Record<string, string | null>>(
    inst.rows.map((r) => [r.id as string, r as never]));
  const clauseBy = new Map<string, string[]>();
  for (const c of cl.rows as { instrument_id: string; clause_type: string; text: string }[]) {
    (clauseBy.get(c.instrument_id) ?? clauseBy.set(c.instrument_id, []).get(c.instrument_id)!)
      .push(`${c.clause_type}:${h(c.text)}`);
  }
  const appBy = new Map<string, string>();
  for (const a of ap.rows as { instrument_id: string; quote: string }[]) appBy.set(a.instrument_id, h(a.quote));

  let digest: Record<string, unknown[]> = {};
  try {
    digest = (JSON.parse(readFileSync("public/data/signals_digest.json", "utf8")).instruments ?? {});
  } catch { /* reported as zero */ }

  // `prose: true` is compared on token overlap, because two paraphrases of one
  // exclusion are not two demands. CODED stores — a region set, a dated digest
  // entry — carry no paraphrase risk and no shared vocabulary either, so a
  // token measure would score every pair as identical; they are compared
  // exactly. Getting this backwards is how `catchment_regions` first read as
  // separating nothing at all.
  const stores: [string, (id: string) => string, boolean][] = [
    ["description", (id) => h(col.get(id)?.description), true],
    // ── The budget sweep ──────────────────────────────────────────────────
    // The row is 408 chars today and the median description is 737, so the
    // whole column would nearly triple the menu. These lines answer the only
    // question that matters: how much of the separation survives a cut, and at
    // what length it stops paying. `sentences()` prefers the sentence that
    // separates over the paragraph that describes — it takes whole sentences
    // up to the cap rather than cutting mid-clause, because a truncated clause
    // reads as a demand the fund does not make.
    ["  description @120 (sentences)", (id) => sentences(h(col.get(id)?.description), 120), true],
    ["  description @180 (sentences)", (id) => sentences(h(col.get(id)?.description), 180), true],
    ["  description @240 (sentences)", (id) => sentences(h(col.get(id)?.description), 240), true],
    ["  description @180 (hard cut)", (id) => h(col.get(id)?.description).slice(0, 180), true],
    ["eligibility_text", (id) => h(col.get(id)?.eligibility_text), true],
    ["description+eligibility_text", (id) => h(col.get(id)?.description) + "¦" + h(col.get(id)?.eligibility_text), true],
    ["eligibility_clauses", (id) => (clauseBy.get(id) ?? []).sort().join("~"), true],
    ["instrument_application.quote", (id) => appBy.get(id) ?? "", true],
    ["catchment_regions", (id) => h(col.get(id)?.catchment_regions), false],
    ["signals_digest", (id) => JSON.stringify(digest[id] ?? ""), false],
  ];

  let rowsTotal = 0, charsTotal = 0, subsetTotal = 0;
  let sibPairs = 0, blindPairs = 0;
  let poolSum = 0;
  const storeStat = new Map<string, { sep: number; uniq: number; reach: number; chars: number; carried: number }>();
  for (const [s] of stores) storeStat.set(s, { sep: 0, uniq: 0, reach: 0, chars: 0, carried: 0 });
  // How often the WON fund is in a blind pair — the cases where the selector
  // provably cannot be asked to do better than guess.
  let wantBlind = 0, wantHasSibling = 0;

  for (const c of cases) {
    poolSum += c.poolSize;
    subsetTotal += c.subset.length;
    const menu = renderMenu({
      country: c.country, sector: c.sector, description: c.description,
      subset: c.subset, baselineTop5: c.baselineTop5,
    });
    const rows = rowsOf(menu, c.subset.length);
    rowsTotal += rows.size;
    for (const r of rows.values()) charsTotal += r.length;

    // Sibling pairs inside THIS menu.
    const byRegime = new Map<string, number[]>();
    c.subset.forEach((f, i) => {
      const k = f.regime || f.id;
      (byRegime.get(k) ?? byRegime.set(k, []).get(k)!).push(i);
    });
    let wantIsBlind = false, wantSib = false;
    for (const idxs of byRegime.values()) {
      if (idxs.length < 2) continue;
      for (let a = 0; a < idxs.length; a++) for (let b = a + 1; b < idxs.length; b++) {
        const ia = idxs[a], ib = idxs[b];
        sibPairs++;
        const ra = reasonsOf(rows.get(ia) ?? ""), rb = reasonsOf(rows.get(ib) ?? "");
        const fa = c.subset[ia], fb = c.subset[ib];
        const blind =
          h(fa.body) === h(fb.body) &&
          awardBand(fa.awardP50) === awardBand(fb.awardP50) &&
          h(fa.capitalType) === h(fb.capitalType) &&
          sharePct(ra) === sharePct(rb) &&
          jaccard(specific(ra), specific(rb)) >= SAME_DEMAND;
        if (blind) blindPairs++;
        const ida = c.subset[ia].id, idb = c.subset[ib].id;
        if (ida === c.want || idb === c.want) {
          wantSib = true;
          if (blind) wantIsBlind = true;
        }
        for (const [label, key, prose] of stores) {
          const va = key(ida), vb = key(idb);
          const both = va.replace(/[¦~"]/g, "").length > 0 && vb.replace(/[¦~"]/g, "").length > 0;
          const s = storeStat.get(label)!;
          if (both && (prose ? jaccard(va, vb) < DIFFERENT : va !== vb)) {
            s.sep++;
            if (blind) s.uniq++;
          }
        }
      }
    }
    if (wantSib) wantHasSibling++;
    if (wantIsBlind) wantBlind++;

    for (const f of c.subset) {
      for (const [label, key] of stores) {
        const v = key(f.id);
        const s = storeStat.get(label)!;
        if (v.replace(/[¦~"]/g, "").length > 0) { s.reach++; s.carried++; s.chars += v.length; }
      }
    }
  }

  console.log(`gate-1 fixture ${SPLIT}: ${cases.length} cases, mean pool ` +
    `${(poolSum / cases.length).toFixed(0)}, menu ${(subsetTotal / cases.length).toFixed(0)} rows`);
  console.log(`MENU SIZE TODAY: ${(charsTotal / rowsTotal).toFixed(0)} chars/row, ` +
    `${(charsTotal / cases.length / 1000).toFixed(1)}k chars/menu\n`);
  console.log(`sibling pairs inside a menu: ${sibPairs} over ${cases.length} cases ` +
    `(${(sibPairs / cases.length).toFixed(1)} per menu)`);
  console.log(`  BLIND (rendered rows identical once index and name are removed): ` +
    `${blindPairs} (${(100 * blindPairs / Math.max(1, sibPairs)).toFixed(1)}%)`);
  console.log(`  cases where the WON fund sits in a blind pair: ${wantBlind} of ` +
    `${wantHasSibling} with any sibling in the menu\n`);

  console.log(`store                          on menu   separates   UNIQUELY (of ${blindPairs} blind)   mean chars`);
  for (const [label] of stores) {
    const s = storeStat.get(label)!;
    console.log(`${label.padEnd(30)} ${String(s.reach).padStart(5)}/${subsetTotal}  ` +
      `${String(s.sep).padStart(6)}  ` +
      `${String(s.uniq).padStart(8)} (${(100 * s.uniq / Math.max(1, blindPairs)).toFixed(0)}%)  ` +
      `${String(Math.round(s.chars / Math.max(1, s.carried))).padStart(10)}`);
  }
}
main();
