// wsCE — split the unencoded filter population by WHICH TOOL CAN DECIDE IT.
//
// ── The property ──────────────────────────────────────────────────────────────
// A comparator compares the founder's answer against a VALUE. So a comparator
// can decide a gate only if the gate's text supplies a value in the field's own
// domain. Call such a value a DETERMINANT.
//
//   CRISP  ⟺ the requirement text supplies a determinant in the live domain of
//            a field that is reachable and whose evaluable operator some pass
//            can emit.
//   FUZZY  ⟺ it supplies none. There is nothing for a comparator to compare
//            against, so whatever the encoder writes is a guess — and a guessed
//            filter that returns false hides a fund from someone who qualifies.
//
// This is a property with a test for unseen cases, not a register. It names no
// fund, no country, no sector and no band. The domains are READ from
// data/vocabularies.json and reference/ at run time, and each banded
// field's numeric dimension and span are derived by PARSING ITS OWN LIVE BAND
// LABELS — so a reband moves this file's answers without editing this file.
// That is exactly the property the Innovate UK defect violated: a frozen band
// list outlived its vocabulary and demanded a band no founder could select.
//
// ── The three kinds of determinant, weakest assumption first ─────────────────
// D1 ARITHMETIC   a quantity in the text whose DIMENSION matches the field's,
//                 derived from the field's own band labels, and whose magnitude
//                 falls in the span those labels cover. "fewer than 250
//                 employees" against fteBand. No model can be more right than
//                 arithmetic here, and no model is needed.
// D2 CLOSED-SET   a token belonging to an externally defined closed set the
//                 product already resolves against: an ISO country, a NUTS id,
//                 a NUTS name. "established in Portugal", "located in FRD1".
// D3 PRECEDENT    the corpus has already encoded text like this on this field.
//                 Nearest neighbour over token overlap against the (text→spec)
//                 pairs the corpus really holds. This is the only kind that
//                 needs a model, and it is the only kind whose reproducibility
//                 is evidenced rather than assumed.
//
// A gate with none of the three is FUZZY: hand it to the model-judged round.
//
// Read-only. No writes, no model calls, no gitignored inputs.
import { readFileSync, writeFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
requireCredentials("wsce_split", ["DATABASE_URL"]);

const ROOT = process.cwd() + "/../capital";
const VOCAB = JSON.parse(readFileSync(`${ROOT}/data/vocabularies.json`, "utf8"));
const REACH: Record<string, string> = VOCAB.fieldReach;
const BAND_ORDERS: Record<string, string[]> = VOCAB.bandOrders;
const BAND_BOUNDS: Record<string, number | null> = VOCAB.bandBounds;
const ENUM_VALUES: Record<string, string[]> = VOCAB.enumValues;

// ── the live geographic closed sets ─────────────────────────────────────────
const NUTS = JSON.parse(readFileSync(`${ROOT}/reference/nuts_regions.json`, "utf8"));
const NUTS_NAMES = JSON.parse(readFileSync(`${ROOT}/reference/nuts_names.json`, "utf8"));
const NUTS_IDS = new Set<string>();
const NUTS_NAME_TOKENS = new Set<string>();
(function harvestNuts() {
  const walk = (v: any) => {
    if (v == null) return;
    if (typeof v === "string") { if (/^[A-Z]{2}[0-9A-Z]{0,3}$/.test(v)) NUTS_IDS.add(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") { for (const k of Object.keys(v)) { walk(k); walk(v[k]); } }
  };
  walk(NUTS.regions ?? NUTS);
  const wn = (v: any) => {
    if (typeof v === "string" && v.length > 3 && /[a-zA-Z]/.test(v)) {
      for (const t of v.toLowerCase().split(/[^a-zà-ÿ]+/)) if (t.length > 3) NUTS_NAME_TOKENS.add(t);
    } else if (Array.isArray(v)) v.forEach(wn);
    else if (v && typeof v === "object") for (const k of Object.keys(v)) { wn(k); wn(v[k]); }
  };
  wn(NUTS_NAMES);
})();

// Country names, read from the same generated source the product resolves with.
const COUNTRY_TOKENS = new Set<string>();
(function harvestCountries() {
  const src = readFileSync(`${ROOT}/web/lib/intelligence/regions.generated.ts`, "utf8");
  for (const m of src.matchAll(/"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{3,40})"/g)) {
    const t = m[1].toLowerCase().trim();
    if (t.length > 3) COUNTRY_TOKENS.add(t);
  }
})();

// ── each banded field's DIMENSION and SPAN, parsed from its own live labels ──
// Nothing below names a band. `"1-9"` is read as a count interval because it
// parses as one; `"<2M"` as money because `M` is notation for a magnitude;
// `"<25%"` as a percentage. Reband the vocabulary and these re-derive.
type Dim = "count" | "money" | "percent" | null;
function labelDim(label: string): { dim: Dim; nums: number[] } {
  const s = label.trim();
  if (/%/.test(s)) return { dim: "percent", nums: [...s.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => +m[1].replace(",", ".")) };
  const money = /(\d+(?:[.,]\d+)?)\s*([kmb])\b/i.exec(s) || /[€$£]/.test(s);
  if (money) {
    const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
    const parts = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*([kmb])?/gi)].filter((m) => m[1]);
    // A range shares its unit: in "2-10M" the 2 is 2M. So an unsuffixed number
    // inherits the largest magnitude the label itself states. This is a rule
    // about notation, not about which bands exist, so it survives a reband.
    const stated = parts.map((m) => (m[2] ? SCALE[m[2].toLowerCase()] : 0));
    const shared = Math.max(1, ...stated);
    const nums = parts.map((m, i) => +m[1].replace(",", ".") * (stated[i] || shared));
    return { dim: "money", nums };
  }
  const plain = [...s.matchAll(/(\d+)/g)].map((m) => +m[1]);
  if (plain.length && /^[\d\s+<>-]+$/.test(s)) return { dim: "count", nums: plain };
  return { dim: null, nums: [] };
}

/** dimension + covered span for every banded field, derived live. */
const FIELD_DIM: Record<string, { dim: Dim; lo: number; hi: number }> = {};
for (const [field, labels] of Object.entries(BAND_ORDERS)) {
  // ticketBand's labels are codes; its magnitudes live in bandBounds, which is
  // the same generated file and the same single source.
  const viaBounds = labels.every((l) => l in BAND_BOUNDS);
  let dim: Dim = null;
  const nums: number[] = [];
  if (viaBounds) {
    dim = "money";
    for (const l of labels) { const b = BAND_BOUNDS[l]; if (typeof b === "number") nums.push(b); }
  } else {
    for (const l of labels) {
      const p = labelDim(l);
      if (p.dim) { dim = dim ?? p.dim; if (p.dim === dim) nums.push(...p.nums); }
    }
  }
  if (dim && nums.length) {
    FIELD_DIM[field] = { dim, lo: Math.min(...nums), hi: Math.max(...nums) };
  }
}

// ── quantity extraction from requirement text ───────────────────────────────
// Units are NOTATION, not vocabulary: currency marks and SI-style multipliers.
// A number is credited to a field only if its dimension matches and its
// magnitude sits inside the window the field's own live bands cover (widened
// one decade each way, because a rule may state a threshold just outside the
// outermost band and still be decidable against it).
const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, millions: 1e6,
  millon: 1e6, millones: 1e6, millioner: 1e6, mio: 1e6, mln: 1e6, bn: 1e9, billion: 1e9, mrd: 1e9, miljard: 1e9 };
const CUR = /[€$£]|\beur\b|\beuros?\b|\bkr\b|\bsek\b|\bdkk\b|\bnok\b|\bpln\b|\bczk\b|\bhuf\b|\bron\b|\bchf\b|\bgbp\b/i;

type Q = { dim: Dim; v: number; at: string };
function quantities(text: string): Q[] {
  const t = " " + text.toLowerCase().replace(/ /g, " ") + " ";
  const out: Q[] = [];
  // The trailing (?!\d) is not cosmetic: without it `\d{1,3}` bites "200" out
  // of "2003/361/EC" and the year guard below never sees a year at all, so a
  // citation to a Commission Recommendation was being read as a headcount.
  const re = /(?<![\w.])(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?!\d)\s*([a-z%€$£]{0,10})/g;
  for (const m of t.matchAll(re)) {
    const raw = m[1];
    // 1.234.567 / 1,234,567 are thousands separators; 2.5 / 2,5 are decimals.
    const grouped = /^\d{1,3}([ .,]\d{3})+$/.test(raw);
    let n = grouped ? +raw.replace(/[ .,]/g, "") : +raw.replace(/\s/g, "").replace(",", ".");
    if (!isFinite(n)) continue;
    const suf = (m[2] || "").trim();
    const before = t.slice(Math.max(0, m.index! - 14), m.index!);
    const after = t.slice(m.index! + m[0].length, m.index! + m[0].length + 16);
    const ctx = before + " " + suf + " " + after;

    if (suf.startsWith("%") || /^\s*(%|per\s?cent|procent|pour\s?cent)/.test(after) ) {
      out.push({ dim: "percent", v: n, at: ctx.trim() }); continue;
    }
    // A quantity with a DENOMINATOR is a rate, and a rate is a different
    // dimension wearing the same currency mark: "200 EUR/t CO2-eq" and "EUR
    // 4.00/kg" are prices, not award sizes. Crediting them to a money-banded
    // field is how a comparator comes to demand a band nobody can satisfy.
    const isRate = /^\s*(?:[a-z]{0,6})?\s*\/\s*[a-z]/.test(after) || /\//.test(suf);
    const mult = MULT[suf.replace(/[^a-z]/g, "")];
    if (mult) n *= mult;
    if (mult || CUR.test(suf) || CUR.test(before) || CUR.test(after.slice(0, 8))) {
      if (!isRate) out.push({ dim: "money", v: n, at: ctx.trim() });
      continue;
    }
    // A bare integer. Only a count candidate, and only when it is not doing
    // duty as a calendar year — a year is a different dimension wearing the
    // same notation, and no field in the live vocabulary is banded on years.
    if (Number.isInteger(n) && !(n >= 1900 && n <= 2100 && !/\d/.test(suf))) {
      out.push({ dim: "count", v: n, at: ctx.trim() });
    }
  }
  return out;
}

/** D1 — does the text carry a quantity this field's own bands could rank?
 *
 *  Two corrections that cost real precision to find:
 *
 *  (a) The window runs from ZERO, not from the lowest cut point. "turnover of
 *      at least EUR 40,000" is perfectly decidable against a scale whose first
 *      band is "<2M" — it lands in it. Flooring at lo/10 threw those away as
 *      fuzzy. Only the top needs a bound, and one decade above the highest cut
 *      point is generous.
 *
 *  (b) A quantity must be SELF-DIMENSIONING or DIMENSIONED BY ITS FIELD. Money
 *      and percentages carry their unit in the notation. A bare integer carries
 *      nothing: "TRL 3-6", "2025-27" and "at least two partners" are all bare
 *      integers, and crediting them to a headcount scale is how a comparator
 *      comes to demand a band the applicant can never satisfy. So a bare
 *      integer counts only when the FIELD it is filed under is itself ranked on
 *      a count — the field supplies the dimension the notation lacks — and
 *      never when the field is unknown.
 */
function d1(field: string, text: string): Q | null {
  const fd = FIELD_DIM[field];
  if (!fd) return null;
  const hi = fd.hi * 10;
  for (const q of quantities(text)) {
    if (q.dim !== fd.dim) continue;
    if (q.v >= 0 && q.v <= hi) return q;
  }
  return null;
}
/** Self-dimensioning only: the sole kind admissible when no field is known. */
function d1SelfDimensioned(field: string, text: string): Q | null {
  if (FIELD_DIM[field]?.dim === "count") return null;
  return d1(field, text);
}

/** D2 — does the text name a member of a closed geographic set? */
const GEO_FIELDS = new Set(["entityCountries", "activityCountries", "region"]);
function d2(field: string, text: string): string | null {
  if (!GEO_FIELDS.has(field)) return null;
  for (const m of text.matchAll(/\b([A-Z]{2}[0-9A-Z]{1,3})\b/g)) if (NUTS_IDS.has(m[1])) return m[1];
  const low = text.toLowerCase();
  for (const c of COUNTRY_TOKENS) if (low.includes(c)) return c;
  for (const t of low.split(/[^a-zà-ÿ]+/)) if (t.length > 4 && NUTS_NAME_TOKENS.has(t)) return t;
  return null;
}

const STOP = new Set(("the a an of to and or for in on be must is are with as at by that this " +
  "which not no any all their its from than more least under per any such").split(" "));
const toks = (s: string) => new Set(String(s).toLowerCase().match(/[a-z0-9%€]+/g)?.filter((t) => !STOP.has(t) && t.length > 2) ?? []);
const jac = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; const u = a.size + b.size - i; return u ? i / u : 0; };
const PRECEDENT_FLOOR = 0.35;

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const PUB = process.env.PUBLISHABLE;
  const ids = PUB ? new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String)) : null;
  if (ids && ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }

  console.log("derived field dimensions (parsed from the LIVE band labels, nothing frozen here):");
  for (const [f, d] of Object.entries(FIELD_DIM)) console.log(`  ${f.padEnd(18)} ${d.dim}  span ${d.lo} .. ${d.hi}`);
  console.log(`closed sets read live: ${NUTS_IDS.size} NUTS ids, ${NUTS_NAME_TOKENS.size} NUTS name tokens, ${COUNTRY_TOKENS.size} country tokens`);
  const wordBanded = Object.keys(BAND_ORDERS).filter((f) => !FIELD_DIM[f]);
  console.log(`banded but NOT arithmetic (word-ordered, so D1 cannot reach them): ${wordBanded.join(", ")}\n`);

  const g = await db.query(
    `SELECT id, instrument_id, gate_key, requirement, value, gate_role, value_spec,
            verification_level, COALESCE(intake_field_resolved, intake_field) AS f
       FROM eligibility_gates`);
  const gates = g.rows.map((r) => ({ ...r, iid: String(r.instrument_id), field: (r.f ?? "none") as string,
    text: String(r.value ?? "") + " " + String(r.requirement ?? "") }));

  // D3's dictionary: the (text -> spec) pairs the corpus really holds.
  const memory = new Map<string, { t: Set<string>; spec: string }[]>();
  for (const r of gates) {
    if (r.gate_role !== "filter" || r.value_spec == null) continue;
    (memory.get(r.field) ?? memory.set(r.field, []).get(r.field)!).push({ t: toks(r.text), spec: JSON.stringify(r.value_spec) });
  }
  function d3(field: string, text: string): number {
    const mem = memory.get(field); if (!mem) return 0;
    const a = toks(text); let best = 0;
    for (const m of mem) { const s = jac(a, m.t); if (s > best) best = s; }
    return best;
  }

  const cited = (r: any) => r.verification_level !== "llm_classified";
  const unenc = gates.filter((r) => r.gate_role === "filter" && r.value_spec == null);

  type Cls = { cls: string; why: string };
  function classify(r: any): Cls {
    const f = r.field;
    if (f === "none" || f == null) {
      // No field at all. Before refusing, ask whether the text carries a
      // determinant for SOME reachable field: that is a retriage target, not a
      // fuzzy one, and it is the difference between "we cannot decide it" and
      // "we never asked which question it answers".
      for (const cand of Object.keys(FIELD_DIM)) {
        if (REACH[cand] === "unreachable") continue;
        const q = d1SelfDimensioned(cand, r.text);
        if (q) return { cls: "REFILE-arithmetic", why: `${cand} ${q.dim} ${q.v}` };
      }
      if (d2("entityCountries", r.text)) return { cls: "REFILE-geo", why: "names a closed geographic set" };
      return { cls: "UNMAPPED-fuzzy", why: "no field, and no determinant for any field" };
    }
    if (!cited(r)) return { cls: "REFUSED-tier", why: "llm_classified, no verbatim quote" };
    if (REACH[f] === "unreachable") {
      if (f === "activityCountries" && d2("activityCountries", r.text)) return { cls: "REFILE-geo", why: "unreachable field carrying a locatable place" };
      return { cls: "REFUSED-unreachable", why: `nothing in the intake answers ${f}` };
    }
    const q = d1(f, r.text);
    if (q) return { cls: "CRISP-arithmetic", why: `${q.dim} ${q.v} in ${f}'s own span` };
    if (d2(f, r.text)) return { cls: "CRISP-closedset", why: "names a country or NUTS region" };
    const s = d3(f, r.text);
    if (s >= PRECEDENT_FLOOR) return { cls: "CRISP-precedent", why: `nearest encoded text on ${f} at ${s.toFixed(2)}` };
    // A banded field whose text carries NO quantity is the sharpest fuzzy
    // signal there is: the field is ordered on a number and the sentence
    // supplies none, so any band the encoder picks is invented.
    if (FIELD_DIM[f]) return { cls: "FUZZY-banded-no-quantity", why: `${f} is ranked on ${FIELD_DIM[f].dim} and the text states none` };
    return { cls: "FUZZY-judgement", why: `no determinant in ${f}'s domain and no precedent (best ${s.toFixed(2)})` };
  }

  for (const [label, pop] of [["WHOLE CORPUS", unenc], ["PUBLISHABLE", unenc.filter((r) => !ids || ids.has(r.iid))]] as const) {
    const by = new Map<string, any[]>();
    for (const r of pop) { const c = classify(r); (by.get(c.cls) ?? by.set(c.cls, []).get(c.cls)!).push({ ...r, ...c }); }
    console.log(`\n=== ${label}: ${pop.length} filter gates with no value_spec ===`);
    console.log("class".padEnd(28) + "gates".padStart(7) + "inst".padStart(6) + "  fields");
    for (const [c, rs] of [...by].sort((a, b) => b[1].length - a[1].length)) {
      const ff = [...new Set(rs.map((r) => r.field))].sort();
      console.log(c.padEnd(28) + String(rs.length).padStart(7) + String(new Set(rs.map((r) => r.iid)).size).padStart(6) +
        "  " + ff.slice(0, 7).join(",") + (ff.length > 7 ? ` +${ff.length - 7}` : ""));
    }
    const crisp = [...by].filter(([c]) => c.startsWith("CRISP")).reduce((a, x) => a + x[1].length, 0);
    const refile = [...by].filter(([c]) => c.startsWith("REFILE")).reduce((a, x) => a + x[1].length, 0);
    const fuzzy = [...by].filter(([c]) => c.startsWith("FUZZY") || c.startsWith("UNMAPPED")).reduce((a, x) => a + x[1].length, 0);
    const refused = [...by].filter(([c]) => c.startsWith("REFUSED")).reduce((a, x) => a + x[1].length, 0);
    console.log(`  CRISP ${crisp}   REFILE ${refile}   FUZZY ${fuzzy}   REFUSED-by-guard ${refused}`);
  }

  // Per-field breakdown on the publishable population, which is what ships.
  console.log("\n=== per field (publishable) ===");
  const pub = unenc.filter((r) => !ids || ids.has(r.iid));
  const perF = new Map<string, Map<string, number>>();
  for (const r of pub) {
    const c = classify(r);
    const m = perF.get(r.field) ?? perF.set(r.field, new Map()).get(r.field)!;
    m.set(c.cls, (m.get(c.cls) ?? 0) + 1);
  }
  const cols = ["CRISP-arithmetic", "CRISP-closedset", "CRISP-precedent", "REFILE-arithmetic", "REFILE-geo",
    "FUZZY-banded-no-quantity", "FUZZY-judgement", "UNMAPPED-fuzzy", "REFUSED-tier", "REFUSED-unreachable"];
  console.log("field".padEnd(22) + cols.map((c) => c.replace(/^(CRISP|FUZZY|REFILE|REFUSED)-/, (m) => m[0]).slice(0, 9).padStart(10)).join(""));
  for (const [f, m] of [...perF].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0))) {
    console.log(f.padEnd(22) + cols.map((c) => String(m.get(c) ?? "").padStart(10)).join(""));
  }

  // EMIT — hand the classification to the adjudication harness, which samples
  // it stratified by class. Written to a scratch path, never into the repo and
  // never into a store: this file is read-only about the corpus.
  if (process.env.EMIT) {
    const out = pub.map((r) => {
      const c = classify(r);
      return { id: Number(r.id), iid: r.iid, cls: c.cls, why: c.why, field: r.field,
        text: String(r.text).replace(/\s+/g, " ").trim().slice(0, 400) };
    });
    writeFileSync(process.env.EMIT, JSON.stringify(out, null, 1));
    console.log(`\nemitted ${out.length} classified gates -> ${process.env.EMIT}`);
  }

  // Samples, so the split can be checked by eye rather than believed.
  const SHOW = process.env.SHOW ? Number(process.env.SHOW) : 4;
  console.log("\n=== samples ===");
  const seen = new Map<string, any[]>();
  for (const r of pub) { const c = classify(r); (seen.get(c.cls) ?? seen.set(c.cls, []).get(c.cls)!).push({ ...r, ...c }); }
  for (const [c, rs] of [...seen].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n--- ${c} (${rs.length}) ---`);
    for (const r of rs.slice(0, SHOW)) {
      console.log(`  [${r.field}] ${r.why}`);
      console.log(`     ${String(r.text).replace(/\s+/g, " ").trim().slice(0, 210)}`);
    }
  }
  await db.end();
})();
