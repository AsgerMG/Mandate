// wsCL, part 3 — THE IDENTITY TEST THE REGISTER SUPPLIES ITSELF.
//
// Parts 1 and 2 asked whether two rows are one fund by comparing their NAMES,
// which is a judgement we make about the register's prose. There is a test that
// is not a judgement: two rows that cite THE SAME PAGE of the official register
// are one object, because the register says so. Same evidence standard
// `rowIdentity.ts` holds a DOOR to, applied to identity, and it names no fund,
// country, sector or language.
//
// ── AND IT IS WRONG ON ITS OWN, WHICH IS THE POINT OF THIS FILE ───────────
// Taken at face value it makes 219 rows (20.1% of the corpus) into duplicates.
// Its single largest group is 22 rows citing
// `dogc.gencat.cat/es/document-del-dogc/index.html` — Catalonia's official
// gazette INDEX, not a page about any fund. Those 22 are loans, fair-trade
// grants, automotive R&D and flood relief, and nothing but the URL joins them.
//
// That is the identical failure as fusing a blank `scheme_code` (wsCJ) and as
// wsM's row collapse: a field that is empty of identity being used as a join
// key. So the page test carries two guards, and both are PROPERTIES rather than
// exclusions of a named domain:
//
//   (a) WITHIN ONE CATALOGUE. A page shared across regimes or bodies is not
//       identifying an object, it is a directory that several objects sit in.
//       An index is exactly the URL that many unrelated rows can reach.
//   (b) AGREEING WITH WHAT THE FUND FUNDS. `instrument_profiles.embedding` is
//       built from award titles and knows nothing about URLs. A page group
//       whose members fund different things has not identified one fund
//       whatever the URL says.
//
// Both are decidable for a feed loaded tomorrow, and (a) alone removes the
// gazette: its 22 rows sit in 22 different regimes.
//
// Free: two Postgres reads. No model calls, no embeds, no writes.
//
//   npx tsx scripts/_wscl_sourcepage.ts
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("_wscl_sourcepage", ["DATABASE_URL"]);

import { Client } from "pg";

import { isClosed } from "../../lib/intelligence/liveness";
import { catalogueKey, type Inst, livenessFacts, loadCorpus, pct } from "./_wscl_recurrence";

/**
 * The official PAGE a row cites, stripped to the thing being identified.
 *
 * Two normalisations and no more, each because the same page reaches us in more
 * than one shape: a web.archive.org wrapper is a snapshot OF a page rather than
 * a different page, and a query string is a session or a campaign tag and never
 * the identity. Anything further would be guessing that two different URLs mean
 * one thing, which is the judgement this test exists to avoid.
 */
export function sourcePage(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = String(url).trim();
  const arch = u.match(/^https?:\/\/web\.archive\.org\/web\/[^/]*\/(https?:\/\/.*)$/);
  if (arch) u = arch[1];
  u = u.split("?")[0].split("#")[0].replace(/\/+$/, "");
  return u.toLowerCase() || null;
}

export interface PageGroups {
  groupOf: Map<string, string>;
  groups: Map<string, string[]>;
  /** Rows dropped by guard (a): their page is shared outside their catalogue. */
  indexRows: number;
  indexPages: number;
}

/** Page groups AFTER guard (a). Exported so the collapse harness uses exactly
 *  this key rather than rebuilding it and drifting. */
export function pageGroups(rows: Inst[], urlOf: Map<string, string | null>): PageGroups {
  const byPage = new Map<string, string[]>();
  for (const r of rows) {
    const p = urlOf.get(r.id);
    if (!p) continue;
    (byPage.get(p) ?? byPage.set(p, []).get(p)!).push(r.id);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groupOf = new Map<string, string>();
  const groups = new Map<string, string[]>();
  let indexRows = 0, indexPages = 0;
  for (const [page, ids] of byPage) {
    if (ids.length < 2) continue;
    // (a) split the page by catalogue; a page reaching more than one catalogue
    // is a directory and identifies nothing.
    const byCat = new Map<string, string[]>();
    for (const id of ids) {
      const k = catalogueKey(byId.get(id)!);
      (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(id);
    }
    if (byCat.size > 1) { indexPages++; indexRows += ids.length; }
    for (const [k, v] of byCat) {
      if (v.length < 2) continue;
      const g = `page::${page}::${k}`;
      groups.set(g, v);
      for (const id of v) groupOf.set(id, g);
    }
  }
  for (const r of rows) if (!groupOf.has(r.id)) { groupOf.set(r.id, r.id); groups.set(r.id, [r.id]); }
  return { groupOf, groups, indexRows, indexPages };
}

export async function loadSourcePages(db: Client): Promise<Map<string, string | null>> {
  const { rows } = await db.query<{ id: string; eligibility_source_url: string | null; application_url: string | null }>(
    `SELECT id, eligibility_source_url, application_url FROM funding_instruments`);
  return new Map(rows.map((u) => [u.id, sourcePage(u.eligibility_source_url) ?? sourcePage(u.application_url)]));
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const rows = await loadCorpus(db);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const urlOf = await loadSourcePages(db);

  const raw = new Map<string, string[]>();
  for (const r of rows) {
    const p = urlOf.get(r.id);
    if (!p) continue;
    (raw.get(p) ?? raw.set(p, []).get(p)!).push(r.id);
  }
  const withUrl = [...raw.values()].reduce((a, v) => a + v.length, 0);
  const sharedRaw = [...raw.entries()].filter(([, v]) => v.length > 1);
  const sharedRawRows = sharedRaw.reduce((a, [, v]) => a + v.length, 0);

  console.log("=".repeat(78));
  console.log("ROWS THAT ARE ONE FUND BECAUSE THE OFFICIAL REGISTER SAYS SO");
  console.log("=".repeat(78));
  console.log(`instruments                                   ${rows.length}`);
  console.log(`  citing an official page                     ${withUrl}  ${pct(withUrl, rows.length)}`);
  console.log(`  distinct pages cited                        ${raw.size}`);
  console.log(`  pages cited by more than one row, RAW       ${sharedRaw.length}` +
    `  covering ${sharedRawRows} rows (${pct(sharedRawRows, rows.length)} of the corpus)`);

  const pg = pageGroups(rows, urlOf);
  const multi = [...pg.groups.entries()].filter(([, v]) => v.length > 1);
  const kept = multi.reduce((a, [, v]) => a + v.length, 0);
  console.log(`\nGUARD (a) — a page shared ACROSS catalogues is an index, not an identity`);
  console.log(`  pages it refused                            ${pg.indexPages}` +
    `  covering ${pg.indexRows} rows`);
  console.log(`  groups that survive                         ${multi.length}` +
    `  covering ${kept} rows (${pct(kept, rows.length)} of the corpus)`);
  console.log(`  the largest thing it refused is Catalonia's gazette index, cited by 22 rows`);
  console.log(`  in 22 different regimes — loans, fair-trade grants, automotive R&D. Nothing`);
  console.log(`  but the URL joined them, and no domain is named to exclude it.`);

  console.log(`\nREGIME CONCENTRATION of the surviving groups (beside the count, never after)`);
  const byRegime = new Map<string, number>();
  for (const [, v] of multi) {
    for (const id of v) {
      const r = byId.get(id)!;
      const k = `${r.parent_id ?? r.id}|${r.country ?? "?"}`;
      byRegime.set(k, (byRegime.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of [...byRegime].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(32)} ${String(n).padStart(4)}  ${pct(n, kept)}`);
  }

  console.log(`\nGUARD (b) — do the survivors agree with WHAT THE FUND FUNDS?`);
  const ids = [...pg.groupOf.keys()];
  const { rows: cosRows } = await db.query<{ a: string; b: string; cos: number }>(
    `SELECT p1.instrument_id AS a, p2.instrument_id AS b, 1 - (p1.embedding <=> p2.embedding) AS cos
       FROM instrument_profiles p1 JOIN instrument_profiles p2 ON p1.instrument_id < p2.instrument_id
      WHERE p1.instrument_id = ANY($1) AND p2.instrument_id = ANY($1)`, [ids]);
  const cosOf = new Map<string, number>();
  for (const r of cosRows) cosOf.set(`${r.a} ${r.b}`, Number(r.cos));
  const cos = (x: string, y: string) => cosOf.get(x < y ? `${x} ${y}` : `${y} ${x}`);
  const inside: number[] = [];
  for (const [, v] of multi) {
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) { const c = cos(v[i], v[j]); if (c != null) inside.push(c); }
    }
  }
  const refusedCos: number[] = [];
  for (const [page, v] of sharedRaw) {
    const cats = new Set(v.map((id) => catalogueKey(byId.get(id)!)));
    if (cats.size < 2) continue;
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) { const c = cos(v[i], v[j]); if (c != null) refusedCos.push(c); }
    }
    void page;
  }
  const q = (v: number[], p: number) => v.length ? v.slice().sort((a, b) => a - b)[Math.floor(p * (v.length - 1))] : NaN;
  console.log(`  surviving page-groups     p25/p50/p75  ${q(inside, 0.25).toFixed(3)} / ${q(inside, 0.5).toFixed(3)} / ${q(inside, 0.75).toFixed(3)}   n=${inside.length}`);
  console.log(`  pages guard (a) REFUSED   p25/p50/p75  ${q(refusedCos, 0.25).toFixed(3)} / ${q(refusedCos, 0.5).toFixed(3)} / ${q(refusedCos, 0.75).toFixed(3)}   n=${refusedCos.length}`);
  console.log(`  Guard (b) is not applied as a filter — it is the independent read on whether`);
  console.log(`  (a) kept the right things. It sees no URL and no name.`);

  let crossRegime = 0, allClosed = 0;
  for (const [, v] of multi) {
    const rs = v.map((id) => byId.get(id)!);
    if (new Set(rs.map((r) => r.parent_id ?? r.id)).size > 1) crossRegime++;
    if (rs.every((r) => isClosed(livenessFacts(r)))) allClosed++;
  }
  console.log(`\nSAFETY OF COLLAPSING ON THE SURVIVING PAGE GROUPS`);
  console.log(`  groups spanning more than one regime                             ${crossRegime}`);
  console.log(`  groups with NO live member (collapse-to-live would delete them)  ${allClosed}`);

  console.log(`\nLARGEST SURVIVING GROUPS`);
  for (const [g, v] of multi.sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
    console.log(`  ${v.length}x  ${g.replace("page::", "").slice(0, 96)}`);
    for (const id of v) console.log(`        ${String(byId.get(id)!.name).slice(0, 86)}`);
  }
  await db.end();
}

if (process.argv[1] && process.argv[1].endsWith("_wscl_sourcepage.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
