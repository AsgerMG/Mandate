// wsCC — STEP 1: derive the RICH PROFILE from the demand side.
//
// The product owner's target assumes full founder information: a founder, or a
// VC who knows the business, telling us everything relevant about the company,
// the technology, the plan and the money. That intake cannot be imagined; its
// shape has to come from what the funds actually demand.
//
// So: take every FILTER gate on a publishable instrument — the conditions that
// decide whether an applicant may apply at all — and group them by WHAT THEY
// DEMAND rather than by which of today's 25 intake fields happens to carry
// them. Grouping is done on the corpus's own voyage-3.5 gate embeddings
// (`eligibility_embeddings`, source_type='gate'), which are already computed,
// so this step costs nothing.
//
// Two properties are reported per demand cluster, and they are the whole point:
//
//   REACHED — does today's intake ask anything that decides this cluster?
//             (a mapped intake_field, per `vocabularies.json`.)
//   SHAPE   — what a founder would have to SAY to answer it: a declared scalar
//             or enumeration, a number in the project's own units, or prose
//             about the project. That is the rich profile's section list, and
//             it is derived here rather than assumed.
//
// Nothing in this file names a fund, a country or a sector.
import { readFileSync, writeFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscc_demand", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;
const TAU = Number(process.env.TAU ?? 0.72);
const OUT = process.env.CLUSTERS_OUT;
const VOCAB = JSON.parse(readFileSync(process.cwd() + "/../../data/vocabularies.json", "utf8"));
const REACH: Record<string, string> = VOCAB.fieldReach;

export type GateRow = {
  iid: string; gate_key: string; field: string; role: string;
  requirement: string; value: string | null; spec: string | null;
  verification_level: string; vec: Float32Array | null;
};

export function parseVec(s: unknown): Float32Array | null {
  if (s == null) return null;
  const a = JSON.parse(String(s)) as number[];
  const v = new Float32Array(a.length);
  let n = 0;
  for (let i = 0; i < a.length; i++) { v[i] = a[i]; n += a[i] * a[i]; }
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}
export const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s;
};

/** Canopy clustering at a cosine threshold. Deterministic: gates are visited in
 *  a fixed order (longest text first, then id), each joins the first centroid
 *  within TAU, else opens one. TAU is the only knob and it is swept, never
 *  fitted — the granularity curve is the result, not a tuned point. */
export function canopy(rows: GateRow[], tau: number): number[] {
  const order = rows.map((_, i) => i).sort((x, y) => {
    const d = rows[y].requirement.length - rows[x].requirement.length;
    return d !== 0 ? d : (rows[x].iid + rows[x].gate_key).localeCompare(rows[y].iid + rows[y].gate_key);
  });
  const cid = new Array<number>(rows.length).fill(-1);
  const cents: Float32Array[] = [];
  // Gates with no embedding fall back to normalised text identity, in their own
  // id space, so an absent vector can never MERGE two demands it cannot compare.
  const textCid = new Map<string, number>();
  for (const i of order) {
    const r = rows[i];
    if (!r.vec) {
      const k = "T:" + r.requirement.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!textCid.has(k)) textCid.set(k, cents.length + textCid.size + 1_000_000);
      cid[i] = textCid.get(k)!;
      continue;
    }
    let best = -1, bs = tau;
    for (let c = 0; c < cents.length; c++) { const s = dot(r.vec, cents[c]); if (s >= bs) { bs = s; best = c; } }
    if (best < 0) { cents.push(r.vec); cid[i] = cents.length - 1; } else cid[i] = best;
  }
  return cid;
}

export async function loadGates(db: Client, ids: Set<string> | null) {
  const g = await db.query(`
    SELECT g.instrument_id, g.gate_key, g.gate_role, g.requirement, g.value,
           g.value_spec, g.verification_level,
           COALESCE(g.intake_field_resolved, g.intake_field) AS f,
           e.embedding
      FROM eligibility_gates g
      LEFT JOIN eligibility_embeddings e
        ON e.source_type = 'gate' AND e.instrument_id = g.instrument_id AND e.source_key = g.gate_key`);
  const rows: GateRow[] = [];
  for (const r of g.rows) {
    const iid = String(r.instrument_id);
    if (ids && !ids.has(iid)) continue;
    rows.push({
      iid, gate_key: String(r.gate_key), field: (r.f ?? "none") as string,
      role: String(r.gate_role ?? ""), requirement: String(r.requirement ?? ""),
      value: r.value == null ? null : String(r.value),
      spec: r.value_spec == null ? null : JSON.stringify(r.value_spec),
      verification_level: String(r.verification_level ?? ""),
      vec: parseVec(r.embedding),
    });
  }
  return rows;
}

export function readPub(): Set<string> | null {
  if (!PUB) return null;
  // A named refusal, not a stack trace: the failure mode that once deleted 141
  // correct filters and exited 0 was a guard that silently measured nothing, and
  // an ENOENT buried in a Node trace is only one review away from the same
  // thing. Both branches are asserted to fire; see the finding.
  let raw: string;
  try { raw = readFileSync(PUB, "utf8"); }
  catch { console.error(`PUBLISHABLE allow-list not readable at ${PUB} — refusing to measure the whole corpus by accident`); process.exit(1); }
  const ids = new Set<string>(JSON.parse(raw).map(String));
  if (ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing to measure nothing"); process.exit(1); }
  return ids;
}

if (process.argv[1] && process.argv[1].endsWith("_wscc_demand.ts")) {
  (async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const ids = readPub();
    const all = await loadGates(db, ids);
    const filters = all.filter((r) => r.role === "filter");
    const withVec = filters.filter((r) => r.vec).length;
    console.log(`population ${ids ? ids.size : "whole corpus"} instruments`);
    console.log(`filter gates ${filters.length} on ${new Set(filters.map((r) => r.iid)).size} instruments; ` +
      `embedding present ${withVec} (${(100 * withVec / filters.length).toFixed(1)}%)\n`);

    for (const tau of [0.95, 0.9, 0.85, 0.8, 0.75, 0.72, 0.7, 0.65, 0.6]) {
      const cid = canopy(filters, tau);
      const k = new Set(cid).size;
      console.log(`  TAU ${tau.toFixed(2)}   demand clusters ${String(k).padStart(5)}   ` +
        `distinct requirement texts ${new Set(filters.map((r) => r.requirement.toLowerCase())).size}`);
    }

    const cid = canopy(filters, TAU);
    const byC = new Map<number, GateRow[]>();
    filters.forEach((r, i) => (byC.get(cid[i]) ?? byC.set(cid[i], []).get(cid[i])!).push(r));

    console.log(`\n=== DEMAND TAXONOMY at TAU ${TAU} — ${byC.size} clusters, largest first ===`);
    console.log("what the funds demand, grouped by MEANING rather than by which intake field carries it\n");
    const rank = [...byC.entries()].sort((a, b) => b[1].length - a[1].length);
    let shown = 0;
    for (const [c, list] of rank) {
      if (shown++ >= 45) break;
      const insts = new Set(list.map((r) => r.iid)).size;
      const fields = new Map<string, number>();
      for (const r of list) fields.set(r.field, (fields.get(r.field) ?? 0) + 1);
      const top = [...fields].sort((a, b) => b[1] - a[1]);
      const encoded = list.filter((r) => r.spec != null).length;
      const reach = top[0][0] === "none" ? "UNASKED" : (REACH[top[0][0]] ?? "?").toUpperCase();
      const ex = list.slice().sort((a, b) => b.requirement.length - a.requirement.length)[Math.floor(list.length / 2)];
      console.log(`#${String(c).padStart(4)}  gates ${String(list.length).padStart(4)}  inst ${String(insts).padStart(4)}  ` +
        `encoded ${String(Math.round(100 * encoded / list.length)).padStart(3)}%  ${reach.padEnd(11)} ` +
        `field=${top.map(([f, n]) => `${f}:${n}`).slice(0, 3).join(" ")}`);
      console.log(`        "${ex.requirement.replace(/\s+/g, " ").slice(0, 150)}"`);
    }

    // ── the head of the distribution, which is what a rich intake must cover ──
    const cum: number[] = [];
    let acc = 0;
    for (const [, list] of rank) { acc += list.length; cum.push(acc); }
    const pct = (p: number) => cum.findIndex((v) => v >= p * filters.length) + 1;
    console.log(`\nCONCENTRATION of demand: ${pct(0.5)} clusters cover 50% of filter gates, ` +
      `${pct(0.8)} cover 80%, ${pct(0.95)} cover 95%, ${byC.size} cover all.`);

    // ── how much of the demand today's intake reaches ─────────────────────────
    const buckets = new Map<string, { g: number; c: Set<number> }>();
    filters.forEach((r, i) => {
      const b = r.field === "none" ? "UNASKED (no intake field)" : (REACH[r.field] ?? "?");
      const e = buckets.get(b) ?? { g: 0, c: new Set<number>() };
      e.g++; e.c.add(cid[i]); buckets.set(b, e);
    });
    console.log("\nREACH of today's intake over the demand population");
    for (const [b, e] of [...buckets].sort((a, b2) => b2[1].g - a[1].g))
      console.log(`  ${b.padEnd(28)} gates ${String(e.g).padStart(5)}  demand clusters ${String(e.c.size).padStart(5)}`);

    if (OUT) {
      writeFileSync(OUT, JSON.stringify(filters.map((r, i) => ({
        iid: r.iid, gate_key: r.gate_key, field: r.field, cid: cid[i],
        requirement: r.requirement, value: r.value, encoded: r.spec != null,
      }))));
      console.log(`\nwrote ${filters.length} clustered gates -> ${OUT}`);
    }
    await db.end();
  })();
}
