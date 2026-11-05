// wsCO, part 2 — WHAT DOES THE OFFICIAL REGISTER PUBLISH ABOUT THE WINDOW, per
// source family, and does our copy agree?
//
// wsCL measured that 169 rows (15.5% of the corpus) carry
// `source_window_policy = publishes_window` and no deadline at all: they reach a
// founder as OPEN because our copy is silent, not because their register is.
// 35-39% of founders see at least one. This asks the registers.
//
// ── The unit, and it is the whole finding ─────────────────────────────────
// `source_window_policy` answers a question about THE OBJECT WE HOLD A RECORD
// FOR — wsBE's own discriminator: is it a register entry for the AID, or an
// aggregate we built out of AWARDS? An award file has no window field, has
// never had one, and never will, so a copy of it cannot be missing a deadline
// at any age.
//
// `reference/source_window_policy.json` was RECONSTRUCTED on 2026-08-09
// from the column values in Railway Postgres, after the original was lost with
// its worktree. The reconstruction could only recover what the column said, so
// it is keyed `(source_family_bucket, country)` — 48 declarations, no `id`, no
// `id_prefix`, no `root_id`, though the loader still supports all three. That
// grain cannot express the discriminator, because ONE family in ONE country
// holds both kinds of object:
//
//   state_aid_satr / ES   88 `bdns_conv_*`      register entries for a CALL
//                         88 `bdns_es_ayudas__*` aggregates of AWARDS
//   national_dev_banks/FR 76 `ademe_aid__*`      entries in a catalogue of AID
//                          5 bpifrance / relance built from award lists
//
// and `$mixed_at_reconstruction` records the second of those being smoothed:
// `{'publishes_no_window': 4, 'publishes_window': 77} -> publishes_window`.
//
// So the question is not "does this family publish windows". It is, per object:
// does the register we ingest FOR THIS OBJECT state one, and if it does, what
// does it say today. Only the register can answer that, so both are asked.
//
// ── FREE ──────────────────────────────────────────────────────────────────
// Public open-data endpoints, no key, no quota, no charge: data.gouv.fr for the
// French catalogue (the same join `_wscl_official.ts` built) and the BDNS
// transparency API for Spain (the same host and identity `extract_bdns.py` and
// `fetch_bdns_convocatorias.py` already use). Plus Postgres reads. Writes
// nothing to any store, runs no extractor, touches no SQLite volume.
//
//   npx tsx scripts/_wsco_window.ts             # both families
//   FAMILY=es npx tsx scripts/_wsco_window.ts   # one of them
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wsco_window", ["DATABASE_URL"]);

import { Client } from "pg";

const CACHE_DIR = process.env.WSCO_CACHE ?? "/tmp/wsco/registers";
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 350);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A title reduced to comparable form. Both sides of every join below are the
 *  REGISTER'S OWN titles — ours is written verbatim from the register by the
 *  extractor — so this is a join, not a similarity judgement. */
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function cachedJson<T>(key: string, url: string): Promise<T | null> {
  const path = `${CACHE_DIR}/${key}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  await sleep(PAUSE_MS);
  if (!res.ok) return null;
  const j = await res.json() as T;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(j));
  return j;
}

// ── Spain: the BDNS transparency API ────────────────────────────────────────
// `numeroConvocatoria` / `codigoBDNS` identifies a convocatoria; the detail
// record carries `fechaInicioSolicitud`, `fechaFinSolicitud` and `abierto`.
const BDNS = "https://www.infosubvenciones.es/bdnstrans/api";

interface BdnsHit { numeroConvocatoria: string; descripcion: string; descripcionLeng?: string | null; fechaRecepcion?: string }
interface BdnsDetail {
  codigoBDNS: string; abierto?: boolean;
  fechaInicioSolicitud?: string | null; fechaFinSolicitud?: string | null;
  textInicio?: string | null; textFin?: string | null;
}

async function bdnsSearch(title: string): Promise<BdnsHit[]> {
  const u = `${BDNS}/convocatorias/busqueda?vpd=GE&page=0&pageSize=50`
    + `&order=fechaRecepcion&direccion=desc`
    + `&descripcion=${encodeURIComponent(title)}&descripcionTipoBusqueda=1`;
  const j = await cachedJson<{ content?: BdnsHit[] }>(`bdns_q_${norm(title).replace(/ /g, "_").slice(0, 90)}`, u);
  return j?.content ?? [];
}

async function bdnsDetail(num: string): Promise<BdnsDetail | null> {
  return cachedJson<BdnsDetail>(`bdns_c_${num}`, `${BDNS}/convocatorias?vpd=GE&numConv=${num}`);
}

/** What the register says about ONE of our rows. Deliberately five states, not
 *  two: "the register states a window and it has passed" and "no register
 *  record answers to this title" are opposite instructions about what to do. */
type Verdict =
  | "no_register_record"       // nothing in the register answers to this title
  | "window_open"              // stated window, and today is inside it
  | "window_not_yet_open"      // stated window, and it has not started
  | "window_passed"            // stated window, and it has closed
  | "register_states_none";    // the record is there and states no closing date

async function askSpain(rows: { id: string; name: string }[], today: string) {
  const out: { id: string; name: string; verdict: Verdict; detail: string }[] = [];
  for (const r of rows) {
    const title = String(r.name ?? "").trim();
    if (!title) { out.push({ id: r.id, name: title, verdict: "no_register_record", detail: "row has no title to join on" }); continue; }
    const hits = (await bdnsSearch(title)).filter(
      (h) => norm(h.descripcion ?? "") === norm(title) || norm(h.descripcionLeng ?? "") === norm(title));
    if (!hits.length) { out.push({ id: r.id, name: title, verdict: "no_register_record", detail: "no convocatoria carries this exact title" }); continue; }
    // The most recent edition is the one a founder could act on. Older ones are
    // the same programme's history and cannot make it open.
    hits.sort((a, b) => String(b.fechaRecepcion ?? "").localeCompare(String(a.fechaRecepcion ?? "")));
    const d = await bdnsDetail(hits[0].numeroConvocatoria);
    if (!d) { out.push({ id: r.id, name: title, verdict: "no_register_record", detail: `detail fetch failed for ${hits[0].numeroConvocatoria}` }); continue; }
    const fin = (d.fechaFinSolicitud ?? "").slice(0, 10);
    const ini = (d.fechaInicioSolicitud ?? "").slice(0, 10);
    const tag = `conv ${d.codigoBDNS} of ${hits.length} edition(s), abierto=${d.abierto} inicio=${ini || "-"} fin=${fin || "-"}`;
    if (!fin && !ini) out.push({ id: r.id, name: title, verdict: "register_states_none", detail: tag });
    else if (fin && fin < today) out.push({ id: r.id, name: title, verdict: "window_passed", detail: tag });
    else if (ini && ini > today) out.push({ id: r.id, name: title, verdict: "window_not_yet_open", detail: tag });
    else out.push({ id: r.id, name: title, verdict: "window_open", detail: tag });
  }
  return out;
}

// ── France: the Transition Écologique des Entreprises catalogue ─────────────
const TEE_DATASET = "catalogue-des-dispositifs-daides-a-la-transition-ecologique-pour-les-entreprises";

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

const slug = (u: string) =>
  (u.match(/aides-entreprise\/([a-z0-9-]+)/) ?? u.match(/catalogue\/[a-z]+\/([a-z0-9-]+)/) ?? [])[1] ?? "";

async function teeCatalogue(): Promise<Record<string, string>[]> {
  const path = `${CACHE_DIR}/tee.csv`;
  if (existsSync(path)) return parseCsv(readFileSync(path, "utf8"));
  const meta = await fetch(`https://www.data.gouv.fr/api/1/datasets/${TEE_DATASET}/`);
  if (!meta.ok) throw new Error(`_wsco_window: data.gouv.fr returned ${meta.status}`);
  const j = await meta.json() as { resources: { format: string; url: string }[] };
  const csv = j.resources.find((r) => r.format === "csv");
  if (!csv) throw new Error("_wsco_window: the TEE dataset published no CSV resource");
  const body = await fetch(csv.url);
  if (!body.ok) throw new Error(`_wsco_window: TEE resource fetch returned ${body.status}`);
  const text = await body.text();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return parseCsv(text);
}

async function askFrance(
  rows: { id: string; name: string; url: string | null }[], today: string,
) {
  const off = await teeCatalogue();
  if (!off.length) throw new Error("_wsco_window: the TEE export parsed to nothing — that is not a pass");
  const bySlug = new Map<string, Record<string, string>>();
  const byTitle = new Map<string, Record<string, string>>();
  for (const r of off) {
    const s = slug(r.url_source ?? ""); if (s) bySlug.set(s, r);
    const t = norm(r.titre ?? ""); if (t) byTitle.set(t, r);
  }
  const out: { id: string; name: string; verdict: Verdict; detail: string }[] = [];
  for (const r of rows) {
    const rec = bySlug.get(slug(String(r.url ?? ""))) ?? byTitle.get(norm(r.name ?? ""));
    if (!rec) { out.push({ id: r.id, name: r.name, verdict: "no_register_record", detail: "the catalogue no longer publishes this dispositif" }); continue; }
    const fin = (rec.date_cloture ?? "").slice(0, 10);
    const ini = (rec.date_ouverture ?? "").slice(0, 10);
    const tag = `ouverture=${ini || "-"} cloture=${fin || "-"}`;
    if (!fin && !ini) out.push({ id: r.id, name: r.name, verdict: "register_states_none", detail: tag });
    else if (fin && fin < today) out.push({ id: r.id, name: r.name, verdict: "window_passed", detail: tag });
    else if (ini && ini > today) out.push({ id: r.id, name: r.name, verdict: "window_not_yet_open", detail: tag });
    else out.push({ id: r.id, name: r.name, verdict: "window_open", detail: tag });
  }
  return out;
}

const ORDER: Verdict[] = ["window_open", "window_not_yet_open", "window_passed", "register_states_none", "no_register_record"];
const MEANS: Record<Verdict, string> = {
  window_open: "the register states a window and today is inside it",
  window_not_yet_open: "the register states a window that has NOT STARTED — we show it as open",
  window_passed: "the register states a window and it HAS CLOSED — we show it as open",
  register_states_none: "the record is there and states no closing date — publishes_no_window for this object",
  no_register_record: "nothing in the register answers to this object — weaker than a deadline, and not `closed`",
};

function report(family: string, res: { id: string; verdict: Verdict; name: string; detail: string }[]) {
  console.log(`\n${"=".repeat(78)}\n${family}  (${res.length} rows we show as open on our copy's silence)\n${"=".repeat(78)}`);
  for (const v of ORDER) {
    const n = res.filter((r) => r.verdict === v).length;
    if (!n) continue;
    console.log(`  ${v.padEnd(22)}${String(n).padStart(4)}  ${(100 * n / res.length).toFixed(1).padStart(5)}%   ${MEANS[v]}`);
  }
  for (const v of ["window_passed", "window_not_yet_open"] as Verdict[]) {
    for (const r of res.filter((x) => x.verdict === v).slice(0, 6)) {
      console.log(`     [${v}] ${r.id.slice(0, 58)}  ${r.detail}`);
    }
  }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<{
    id: string; name: string; country: string; root_id: string | null;
    eligibility_source_url: string | null;
  }>(`SELECT id, name, country, root_id, eligibility_source_url
        FROM funding_instruments
       WHERE source_window_policy = 'publishes_window' AND scheme_end_date IS NULL
       ORDER BY country, id`);
  await db.end();
  if (!rows.length) throw new Error("_wsco_window: the population is empty, which is not a pass");

  console.log(`asked as of ${today}`);
  console.log(`rows whose openness rests on OUR COPY holding no deadline: ${rows.length}`);
  const es = rows.filter((r) => r.country === "ES");
  const fr = rows.filter((r) => r.country === "FR" && String(r.root_id ?? r.id).startsWith("ademe"));
  const other = rows.filter((r) => !es.includes(r) && !fr.includes(r));
  console.log(`  ES, aggregates of BDNS AWARDS (bdns_es_ayudas__*)   ${es.length}`);
  console.log(`  FR, entries in the TEE catalogue of AID (ademe_*)   ${fr.length}`);
  console.log(`  FR, other (bpifrance / France Relance)              ${other.length}` +
    `  <- the four rows $mixed_at_reconstruction smoothed, plus France Relance`);
  for (const r of other) console.log(`     ${r.id}`);

  const which = (process.env.FAMILY ?? "both").toLowerCase();
  const all: { id: string; register: string; verdict: Verdict; detail: string; name: string }[] = [];
  if (which === "es" || which === "both") {
    const r = await askSpain(es, today);
    report("SPAIN — BDNS transparency API (infosubvenciones.es)", r);
    all.push(...r.map((x) => ({ ...x, register: "bdns" })));
  }
  if (which === "fr" || which === "both") {
    const r = await askFrance(fr.map((x) => ({ id: x.id, name: x.name, url: x.eligibility_source_url })), today);
    report("FRANCE — TEE catalogue (data.gouv.fr)", r);
    all.push(...r.map((x) => ({ ...x, register: "tee" })));
  }
  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify({ askedAt: today, rows: all }, null, 1));
    console.log(`\nper-row register verdicts -> ${process.env.OUT}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
