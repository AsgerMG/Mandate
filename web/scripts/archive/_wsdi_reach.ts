// wsDI — what the five unwired stores are WORTH, before a byte of them is wired.
//
// FREE: one Postgres read, no model calls, no embeds.
//
// The question is not "how many funds carry this field". A field present on 577
// funds that says the same thing about every sibling is worth nothing to a
// chooser, because the chooser's whole job is to order funds that are ALREADY
// in the pool together. So the metric is the one `measure_sibling_coverage.ts`
// established — the residual class inside a multi-leaf regime — extended to
// PAIRS, and split into the only two buckets that matter:
//
//   separates            the two siblings carry different values
//   UNIQUELY separates   ...and nothing already wired separates them
//
// "Already wired" is read off corpus.ts's own SELECT, not guessed: the 31
// columns it lists plus the gate requirements it merges in. A store whose
// unique-separation count is near zero is a store the prompt budget should
// refuse, however clean and however large.
//
//   npx tsx scripts/_wsdi_reach.ts
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsdi_reach", ["DATABASE_URL"]);

const h = (s: unknown): string =>
  s == null ? "" : String(s).trim().toLowerCase().replace(/\s+/g, " ");

/** Award magnitude, not the cent: two siblings whose medians differ by a euro
 *  are not separated by award in any sense a founder can act on. */
const mag = (v: unknown): string =>
  v == null || Number(v) <= 0 ? "" : String(Math.round(Math.log10(Number(v))));

interface Row {
  id: string; parent_id: string | null; name: string; country: string;
  [k: string]: unknown;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const { rows } = await db.query<Row>(`
    SELECT id, parent_id, name, country, capital_type, is_framework,
           source_family_bucket, administering_body, administering_body_share,
           last_year, scheme_code, scheme_end_date, route_status,
           successor_scheme, application_url, sector_mix, scheme_operators,
           award_p25, award_p50, award_p75, award_n, intensity_p50,
           delivery_region, delivery_region_share,
           description, eligibility_text, eligibility_confidence,
           catchment_region, catchment_regions, catchment_source
      FROM funding_instruments`);

  // ── The stores that are NOT columns ──────────────────────────────────────
  const clauses = await db.query(`
    SELECT instrument_id, clause_type, clause_key, text, quote, source_file
      FROM eligibility_clauses ORDER BY instrument_id, clause_type, clause_key`);
  const app = await db.query(`
    SELECT instrument_id, channel, timeline, url, quote, source_file
      FROM instrument_application ORDER BY instrument_id`);
  const gates = await db.query(`
    SELECT instrument_id, gate_key, requirement, value
      FROM eligibility_gates ORDER BY instrument_id, gate_key`);

  interface Clause { instrument_id: string; clause_type: string; clause_key: string; text: string }
  interface App { instrument_id: string; quote: string | null }
  interface Gate { instrument_id: string; gate_key: string; requirement: string; value: string | null }
  const byInst = <T extends { instrument_id: string }>(rs: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rs) (m.get(r.instrument_id) ?? m.set(r.instrument_id, []).get(r.instrument_id)!).push(r);
    return m;
  };
  const clauseBy = byInst(clauses.rows as Clause[]);
  const appBy = byInst(app.rows as App[]);
  const gateBy = byInst(gates.rows as Gate[]);

  // signals_digest is a build artefact, not a table.
  let digest: Record<string, unknown[]> = {};
  try {
    const fs = await import("node:fs");
    const p = "public/data/signals_digest.json";
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    digest = (j.instruments ?? {}) as Record<string, unknown[]>;
  } catch { /* absent is a finding, reported below */ }

  // ── Two baselines, and the second is the one the verdict rests on ────────
  //
  // BASELINE-ALL is every wired column. It separates 100% of sibling pairs and
  // is therefore useless as a comparison: `scheme_code`, `application_url` and
  // the gate `value` strings differ between almost any two rows, so measuring
  // "does this store add anything nothing else has" against it can only ever
  // return zero. Two funds having different URLs is not a reason to prefer one.
  //
  // BASELINE-ROW is what the chooser is actually SHOWN — the selector's own
  // rendered row (fundSelection.ts's `renderRow` when this was written; that
  // module is deleted, see project-mgmt/findings/dead_ranker_wsDO.md, and the
  // field list below is the surviving statement of what it printed):
  // the delivery body, the award magnitude, the capital type, the
  // last award year, the within-family sector share, and the requirements that
  // are distinctive rather than boilerplate. That is the honest question a new
  // store has to answer: does it give the model a REASON it does not already
  // have on the row?
  const wired = (r: Row): string => [
    h(r.capital_type), mag(r.award_p50), mag(r.award_p25), mag(r.award_p75),
    h(r.administering_body), h(r.delivery_region), h(r.source_family_bucket),
    h(r.scheme_code), h(r.last_year), h(r.scheme_end_date), h(r.route_status),
    h(r.successor_scheme), h(r.application_url), h(r.sector_mix),
    h(r.scheme_operators), h(r.intensity_p50), h(r.country),
    (gateBy.get(r.id) ?? []).map((g) => `${g.gate_key}=${h(g.requirement)}|${h(g.value)}`).join("~"),
  ].join("¦");

  // NAME is wired too, and it separates almost every pair by construction —
  // which is exactly why it is reported on its own line rather than folded
  // into the baseline. "The names differ" is not a reason to prefer one fund.
  const nameKey = (r: Row) => h(r.name);

  // `distinctiveRequirements` (deleted with fundSelection.ts; the rule is
  // preserved in project-mgmt/findings/dead_ranker_wsDO.md) drops any requirement shared
  // by more than a third of the candidates, because the two largest gate keys
  // sit on 584 instruments each and printing them 58 times is a third of the
  // prompt spent saying nothing. Reproduced here at corpus scale so the row
  // baseline is the row the model reads, not a richer one.
  const reqCount = new Map<string, number>();
  for (const g of gates.rows as { instrument_id: string; requirement: string }[]) {
    reqCount.set(h(g.requirement), (reqCount.get(h(g.requirement)) ?? 0) + 1);
  }
  const REQ_CUTOFF = Math.ceil(rows.length * 0.35);
  const distinctiveReq = (r: Row) => (gateBy.get(r.id) ?? [])
    .map((g) => h(g.requirement))
    .filter((q) => q && (reqCount.get(q) ?? 0) < REQ_CUTOFF)
    .sort().slice(0, 2).join("~");

  /** What the deleted `renderRow` printed, and nothing else. */
  const rowKey = (r: Row): string => [
    h(r.administering_body), mag(r.award_p50), h(r.capital_type), h(r.last_year),
    h(r.sector_mix), distinctiveReq(r),
  ].join("¦");

  // ── The five candidates ──────────────────────────────────────────────────
  const stores: [string, (r: Row) => string][] = [
    ["description", (r) => h(r.description)],
    ["eligibility_text", (r) => h(r.eligibility_text)],
    ["description+eligibility_text", (r) => h(r.description) + "¦" + h(r.eligibility_text)],
    ["eligibility_clauses", (r) => (clauseBy.get(r.id) ?? [])
      .map((c) => `${c.clause_key}=${h(c.text)}`).join("~")],
    ["instrument_application.quote", (r) => (appBy.get(r.id) ?? [])
      .map((a) => h(a.quote)).join("~")],
    ["catchment_regions", (r) => h(r.catchment_regions)],
    ["signals_digest", (r) => JSON.stringify(digest[r.id] ?? "")],
  ];

  const byRegime = new Map<string, Row[]>();
  for (const r of rows) {
    const p = r.parent_id ?? r.id;
    (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r);
  }
  const groups = [...byRegime.values()].filter((g) => g.length > 1);
  const leaves = groups.reduce((a, g) => a + g.length, 0);

  // Every sibling PAIR the ranker has to order.
  const pairs: [Row, Row][] = [];
  for (const g of groups) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) pairs.push([g[i], g[j]]);
  }

  console.log(`corpus ${rows.length} instruments · ${groups.length} multi-leaf regimes ` +
    `holding ${leaves} leaves · ${pairs.length} sibling pairs`);
  const wiredSep = pairs.filter(([a, b]) => wired(a) !== wired(b));
  const nameSep = pairs.filter(([a, b]) => nameKey(a) !== nameKey(b));
  const rowSep = pairs.filter(([a, b]) => rowKey(a) !== rowKey(b));
  console.log(`  BASELINE-ALL  separated by every wired column + gates: ${wiredSep.length} ` +
    `(${(100 * wiredSep.length / pairs.length).toFixed(1)}%)  <- useless as a comparison`);
  console.log(`  separated by name alone (a label, never a reason):     ${nameSep.length} ` +
    `(${(100 * nameSep.length / pairs.length).toFixed(1)}%)`);
  console.log(`  BASELINE-ROW  separated by what the chooser is shown:  ${rowSep.length} ` +
    `(${(100 * rowSep.length / pairs.length).toFixed(1)}%)`);
  const blind = pairs.filter(([a, b]) => rowKey(a) === rowKey(b));
  console.log(`  BLIND pairs: the model reads two identical rows:       ${blind.length} ` +
    `(${(100 * blind.length / pairs.length).toFixed(1)}%)\n`);

  console.log(`store                          reach/${rows.length}  reach@leaves   separates   UNIQUELY separates`);
  for (const [label, key] of stores) {
    const reach = rows.filter((r) => key(r).replace(/[¦~"]/g, "").length > 0).length;
    const reachLeaf = groups.flat().filter((r) => key(r).replace(/[¦~"]/g, "").length > 0).length;
    const sep = pairs.filter(([a, b]) => key(a) !== key(b));
    // BOTH present: a value against an absence is a coverage gap masquerading
    // as a distinction, and a chooser that leans on it prefers the fund that
    // happened to be scraped.
    const sepBoth = sep.filter(([a, b]) => key(a).replace(/[¦~"]/g, "") && key(b).replace(/[¦~"]/g, ""));
    const uniq = blind.filter(([a, b]) => key(a) !== key(b) &&
      key(a).replace(/[¦~"]/g, "") && key(b).replace(/[¦~"]/g, ""));
    console.log(`${label.padEnd(30)} ${String(reach).padStart(5)} ` +
      `${String(reachLeaf).padStart(8)}/${leaves}  ` +
      `${String(sepBoth.length).padStart(6)} both-present (${String(sep.length).padStart(5)} any)  ` +
      `${String(uniq.length).padStart(6)} (${(100 * uniq.length / Math.max(1, blind.length)).toFixed(1)}% of blind)`);
  }

  // ── Length, because the prompt budget is the constraint ──────────────────
  console.log(`\nSIZE of each store, over instruments that carry it (chars)`);
  for (const [label, key] of stores) {
    const lens = rows.map((r) => key(r).length).filter((n) => n > 2).sort((a, b) => a - b);
    if (!lens.length) { console.log(`${label.padEnd(30)} absent`); continue; }
    const q = (p: number) => lens[Math.min(lens.length - 1, Math.floor(p * lens.length))];
    console.log(`${label.padEnd(30)} p25 ${String(q(0.25)).padStart(5)}  median ${String(q(0.5)).padStart(5)}` +
      `  p75 ${String(q(0.75)).padStart(5)}  p95 ${String(q(0.95)).padStart(6)}  max ${String(lens[lens.length - 1]).padStart(6)}`);
  }

  // ── clause types, since only some of them can bear on a choice ───────────
  const ct = new Map<string, number>();
  for (const c of clauses.rows as { clause_type: string }[]) ct.set(c.clause_type, (ct.get(c.clause_type) ?? 0) + 1);
  console.log(`\neligibility_clauses ${clauses.rows.length} rows over ` +
    `${clauseBy.size} instruments: ` + [...ct].sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`).join(", "));
  console.log(`instrument_application ${app.rows.length} rows over ${appBy.size} instruments; ` +
    `with a quote: ${(app.rows as { quote: string | null }[]).filter((a) => a.quote).length}`);
  console.log(`signals_digest instruments keyed: ${Object.keys(digest).length}`);

  await db.end();
}
main();
