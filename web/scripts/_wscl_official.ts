// wsCL, part 4 — ASK THE OFFICIAL REGISTER, because Rule Zero says our columns
// may not answer this.
//
// §4 of `_wscl_collapse.ts` establishes that no CLOSED row reaches a founder:
// `isClosed()` drops all 101 of them before ranking and not one appears in a
// published five on either split. What it also establishes is that 169 rows are
// open for a different reason — their register DOES state application windows,
// and we simply hold no date for them. Their openness rests on our copy's
// silence.
//
// Rule Zero forbids resolving that from our own columns, and it has been paid
// for twice: IPCEI was reported closed while the Commission's page said
// candidates were in the design phase, and the "a dead call stops paying" test
// was measured FALSIFIED because 50 of Spain's 80 correctly-closed convocatorias
// award after their end date. So this file asks the register.
//
// ── The register, and why it is the right one ─────────────────────────────
// 76 of those 169 rows are ADEME's, and every one of them cites a page of the
// Transition Écologique des Entreprises catalogue. That catalogue is published
// as OPEN DATA on data.gouv.fr by the state startup that runs it, carrying
// `date_ouverture` and `date_cloture` per dispositif. It is the same register
// the rows cite, in machine-readable form — not a proxy for it.
//
// ── What it can and cannot decide ─────────────────────────────────────────
// It can decide two things officially:
//   1. IS THIS DISPOSITIF STILL PUBLISHED? A catalogue of currently-available
//      aid that no longer lists one has stopped offering it. That is the
//      register's statement, not our inference.
//   2. DOES THE REGISTER STATE A WINDOW FOR IT? `date_cloture`, present or
//      absent, per row — which is precisely what `source_window_policy`
//      records and what a stale copy of ours cannot supply.
// It cannot decide that a row we hold and the register no longer lists is
// "closed" in the sense `isClosed()` means. Absence from a catalogue is weaker
// than a stated deadline, and it is reported here as what it is.
//
// FREE — one HTTPS GET of a public open-data export plus one Postgres read.
// Reads NO gitignored data and is not part of `npm run check`; the export is
// fetched at run time and written to a scratch path.
//
//   npx tsx scripts/_wscl_official.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wscl_official", ["DATABASE_URL"]);

import { Client } from "pg";

/** data.gouv.fr dataset: "Catalogue des dispositifs d'aides à la transition
 *  écologique pour les entreprises". Resolved through the API so the run picks
 *  up whatever export is current rather than pinning a stale snapshot URL. */
const DATASET = "catalogue-des-dispositifs-daides-a-la-transition-ecologique-pour-les-entreprises";
const CACHE = process.env.TEE_CSV ?? "/tmp/wscl/tee.csv";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => {
    const o: Record<string, string> = {};
    head.forEach((h, k) => { o[h] = r[k] ?? ""; });
    return o;
  });
}

/** The dispositif a URL points at, in whichever of the register's two URL
 *  shapes it was recorded. */
const slug = (u: string) =>
  (u.match(/aides-entreprise\/([a-z0-9-]+)/) ?? u.match(/catalogue\/[a-z]+\/([a-z0-9-]+)/) ?? [])[1] ?? "";

/** A title reduced to comparable form. Both sides are the register's own
 *  titles, so this is a join and not a similarity judgement. */
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function fetchCatalogue(): Promise<string> {
  if (existsSync(CACHE)) return readFileSync(CACHE, "utf8");
  const meta = await fetch(`https://www.data.gouv.fr/api/1/datasets/${DATASET}/`);
  if (!meta.ok) throw new Error(`_wscl_official: data.gouv.fr returned ${meta.status}`);
  const j = await meta.json() as { resources: { format: string; url: string }[] };
  const csv = j.resources.find((r) => r.format === "csv");
  if (!csv) throw new Error("_wscl_official: the dataset published no CSV resource");
  const body = await fetch(csv.url);
  if (!body.ok) throw new Error(`_wscl_official: resource fetch returned ${body.status}`);
  const text = await body.text();
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, text);
  return text;
}

async function main() {
  const off = parseCsv(await fetchCatalogue());
  if (!off.length) throw new Error("_wscl_official: the official export parsed to nothing");
  const bySlug = new Map<string, Record<string, string>>();
  const byTitle = new Map<string, Record<string, string>>();
  for (const r of off) {
    const s = slug(r.url_source ?? ""); if (s) bySlug.set(s, r);
    const t = norm(r.titre ?? ""); if (t) byTitle.set(t, r);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<{ id: string; name: string; eligibility_source_url: string | null }>(`
    SELECT id, name, eligibility_source_url FROM funding_instruments
     WHERE COALESCE(parent_id, id) = 'ademe_aid'
       AND source_window_policy = 'publishes_window' AND scheme_end_date IS NULL`);
  await db.end();
  if (!rows.length) throw new Error("_wscl_official: no rows to ask about — the population is empty, which is not a pass");

  const today = new Date().toISOString().slice(0, 10);
  const withCloture = off.filter((r) => (r.date_cloture ?? "").trim());
  const pastCloture = withCloture.filter((r) => r.date_cloture.slice(0, 10) < today);

  console.log("=".repeat(78));
  console.log("WHAT THE OFFICIAL REGISTER SAYS ABOUT THE ROWS OUR COPY CANNOT DATE");
  console.log("=".repeat(78));
  console.log(`official catalogue (data.gouv.fr, TEE): ${off.length} dispositifs`);
  console.log(`  state a date_cloture in the export      ${withCloture.length}  (${pastCloture.length} already passed)`);
  console.log(`  The export is THIN on windows — which is the register's own shape, and it is`);
  console.log(`  exactly why a rule may not read window policy off loaded values.`);

  let stillListed = 0, gone = 0;
  const goneNames: string[] = [];
  const dupPage = new Map<string, string[]>();
  for (const r of rows) {
    const s = slug(String(r.eligibility_source_url ?? ""));
    if (s) (dupPage.get(s) ?? dupPage.set(s, []).get(s)!).push(r.id);
    if ((s && bySlug.has(s)) || byTitle.has(norm(r.name ?? ""))) stillListed++;
    else { gone++; goneNames.push(String(r.name).slice(0, 72)); }
  }
  console.log(`\nour rows whose openness rests on our copy holding no deadline: ${rows.length}`);
  console.log(`  the register STILL publishes the dispositif        ${stillListed}` +
    `  ${((100 * stillListed) / rows.length).toFixed(1)}%`);
  console.log(`  the register NO LONGER publishes it                ${gone}` +
    `  ${((100 * gone) / rows.length).toFixed(1)}%   <- offered by us, withdrawn there`);
  console.log(`  Absence from a live catalogue is WEAKER than a stated deadline and is not`);
  console.log(`  \`closed\` in the sense isClosed() means. It is the register declining to`);
  console.log(`  offer the thing we are still putting in front of founders.`);
  for (const n of goneNames.slice(0, 12)) console.log(`     no longer listed: ${n}`);

  const dup = [...dupPage.entries()].filter(([, v]) => v.length > 1);
  console.log(`\nAND THE REGISTER'S VERDICT ON DUPLICATION, which is not a judgement of ours:`);
  console.log(`  our rows citing a dispositif page       ${[...dupPage.values()].reduce((a, v) => a + v.length, 0)}`);
  console.log(`  distinct dispositif pages cited         ${dupPage.size}`);
  console.log(`  pages cited by MORE THAN ONE of our rows ${dup.length}` +
    `  covering ${dup.reduce((a, [, v]) => a + v.length, 0)} rows`);
  for (const [s, v] of dup) console.log(`     ${v.length}x  ${s}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
