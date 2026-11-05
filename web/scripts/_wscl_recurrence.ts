// wsCL, part 1 — is one body's back catalogue MANY FUNDS, or ONE FUND OBSERVED
// MANY TIMES? And what does collapsing it to the live instance do to EXACT@5?
//
// ── The finding this starts from ───────────────────────────────────────────
// wsCJ (findings/address_door_wsCJ.md) split every instrument that has a
// sibling into three kinds and measured the shape of our indistinguishability:
//
//   T territorial    76   7.0%   same notified scheme, different bodies
//   C catalogue     295  27.1%   ONE body's own repeated calls
//   S scheme-level  717  65.9%   sole door of its own notification
//
// The address cannot touch C, which is the biggest single block, and wsCJ's
// over-credit line — fuse everything sharing a blank `scheme_code` — read
// +36.0 tune / +32.8 holdout. That number is the CEILING of any catalogue
// collapse and it is not a result, because the key it used fuses ADEME's
// bicycle-tourism call with its biomass-heat call. This file asks what is left
// of it once the collapse is only allowed where the rows really are one fund.
//
// ── THE PROPERTY: what makes two rows EDITIONS of one recurring programme ──
// Stated so it decides rows nobody has seen, and containing no fund, country,
// sector or language. Two instruments A and B are editions of one programme
// when all of:
//
//   (1) SAME CATALOGUE.  Same regime, and the same administering body — or
//       neither names one. This is wsCJ's C relation and nothing else: an
//       edition is something a body does again, so two bodies is never it.
//
//   (2) SAME SUBJECT.  Their names denote the same thing once every DIGIT RUN
//       is deleted. A year and a legal reference number are both digits and
//       neither is subject matter: the year is precisely what distinguishes
//       one edition from the next, and `Orden CIN/1502/2021` differs from
//       `Orden de 26 de diciembre de 2023` in nothing a founder cares about.
//       Compared as a token set at WEIGHTED Jaccard >= theta, so word order and
//       the ceremonial preamble a register wraps a call in do not separate them.
//
//   (3) THE DIFFERENCE IS TIME, NOT A LOT NUMBER.  Digits were deleted in (2)
//       so they could not separate two editions; they must therefore be
//       inspected before the two rows are declared editions at all, because
//       the deleted digits are sometimes the ONLY thing that distinguished
//       them. Exactly one of:
//         EDITION    the names carry different CALENDAR YEARS — a four-digit
//                    run in a plausible calendar range. A year is a point in
//                    time in every register in every language, so this names
//                    no country and no feed.
//         DUPLICATE  the names carry the SAME digit runs (usually none at
//                    all). Then nothing numeric distinguishes them and the
//                    same programme has been entered twice.
//       Anything else — digit runs that differ but are not years — is
//       REFUSED. `Horizon EU CL1` and `Horizon EU CL6` differ in a LOT
//       NUMBER, and a lot is not a later edition of another lot. Reading it
//       as one is the wsM collapse `rowIdentity.ts` exists to prevent.
//
//   TOKENS are the >= MIN_TOKEN-character pieces of the accent-stripped,
//   digit-stripped name. The length floor removes function words in every
//   European language at once — de/la/que/por/se, of/the/and, und/für, och —
//   WITHOUT naming any of them, which a stop-word list could not do for a
//   language the corpus has not met yet. Its failure mode is stated and
//   measured below (§1c): a language whose content words are shorter than the
//   floor would be under-tokenised, so the floor is reported against the
//   observed token-length distribution of the whole corpus rather than
//   asserted.
//
// ── WHY THE JACCARD IS WEIGHTED, which is not a refinement ────────────────
// A plain token-set Jaccard grouped `Horizon EU CL1` with `Horizon EU CL6` at
// EVERY theta including 1.00, and `IPCEI Batteries` with `IPCEI Cloud`. Both
// are wrong and both are the SAME error: once digits and short tokens go, those
// names reduce to the catalogue's own name — `horizon`, `ipcei` — and two rows
// that agree on nothing but the catalogue they are already known to share have
// not been shown to be one programme. That is exactly the failure
// `rowIdentity.ts` records from wsM, and a set intersection cannot see it
// because the shared token is doing no work.
//
// So each token is weighted by its INVERSE DOCUMENT FREQUENCY WITHIN ITS OWN
// CATALOGUE, ln(N/df). A token in every name of the catalogue weighs exactly
// zero, so it can neither join two rows nor pad a similarity, and no list of
// boilerplate words is needed — the catalogue supplies its own. Two rows whose
// entire shared vocabulary weighs zero have a union weight of zero, and that is
// REFUSED rather than scored: we have no evidence they are one programme, and
// the conservative direction for a collapse is not to collapse.
//
// It is self-tuning and it names nothing. A register that wraps every call in
// `Appel à projets` and a register that wraps none of them are handled by the
// same line of code, and a feed loaded tomorrow gets its own boilerplate
// discounted without this file being edited.
//
//   theta is NEVER TUNED. Every number below is printed as a ladder across
//   theta so the reader sees the sensitivity instead of a chosen point.
//
// ── The independent evidence, because a name test proves nothing on its own ─
// A lexical rule that groups rows can always be accused of grouping them
// because they are lexically similar. So each grouping is checked against a
// SEPARATE representation the rule never sees: `instrument_profiles.embedding`
// — what a fund FUNDS, built from award titles, not from the name. If the
// groups are real, within-group cosine is far above the cosine of two rows
// drawn from the same catalogue at random. If it is not, the rule has grouped
// prose.
//
// ── FREE ───────────────────────────────────────────────────────────────────
// Postgres reads only. No model calls, no embeds, no writes.
//
//   npx tsx scripts/_wscl_recurrence.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wscl_recurrence", ["DATABASE_URL"]);

import { Client } from "pg";

import { isClosed, SOURCE_WINDOW_POLICY } from "../lib/intelligence/liveness";

export interface Inst {
  id: string;
  parent_id: string | null;
  name: string | null;
  country: string | null;
  administering_body: string | null;
  scheme_code: string | null;
  scheme_end_date: string | null;
  scheme_end_date_basis: string | null;
  source_window_policy: string | null;
  last_year: number | null;
  successor_scheme: string | null;
  is_framework: boolean | null;
  event_count: number | null;
}

/** The shortest token treated as carrying subject matter. See the property. */
export const MIN_TOKEN = 4;

/** The thetas every table is printed across. Not a search space — a sensitivity
 *  band, so no number in this file rests on a chosen point. */
export const THETAS = [0.5, 0.6, 0.7, 0.8, 0.9];

export function contentTokens(name: string | null): Set<string> {
  if (!name) return new Set();
  const flat = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // strip accents
    .toLowerCase()
    .replace(/[0-9]+/g, " ")                            // strip DIGIT RUNS
    .replace(/[^a-z]+/g, " ");
  return new Set(flat.split(" ").filter((t) => t.length >= MIN_TOKEN));
}

/** Plain set Jaccard. Kept only so §2b can print what the weighting changed. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Token weights inside ONE catalogue: ln(N/df). A token every name carries
 *  weighs zero, so the catalogue discounts its own boilerplate. */
export function idfWeights(names: Set<string>[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const s of names) for (const t of s) df.set(t, (df.get(t) ?? 0) + 1);
  const w = new Map<string, number>();
  for (const [t, n] of df) w.set(t, Math.log(names.length / n));
  return w;
}

/**
 * Weighted Jaccard, or NULL when the two names share no vocabulary that carries
 * any weight at all.
 *
 * Null is REFUSAL and never zero-similarity-therefore-separate — the two are
 * the same decision here (do not group) but not the same claim, and §2 reports
 * the refusals separately so a catalogue whose names are all boilerplate is
 * visible rather than silently ungrouped.
 */
export function weightedJaccard(
  a: Set<string>, b: Set<string>, w: Map<string, number>,
): number | null {
  let inter = 0, union = 0;
  const all = new Set([...a, ...b]);
  for (const t of all) {
    const wt = w.get(t) ?? 0;
    union += wt;
    if (a.has(t) && b.has(t)) inter += wt;
  }
  if (union <= 0) return null;
  return inter / union;
}

/** wsCJ's classification, restated verbatim so the two files cannot disagree
 *  about which rows are a catalogue. A blank `scheme_code` is the ABSENCE of a
 *  notification and never a join key — that one line is wsCJ's +36-vs-+0.4. */
export type Kind = "T" | "C" | "S";
export function classify(leaf: Inst, siblings: Inst[]): Kind {
  const code = leaf.scheme_code ?? "";
  const same = siblings.filter((s) => (s.scheme_code ?? "") === code);
  if (same.length <= 1) return "S";
  if (!code) return "C";
  const bodies = new Set(same.map((s) => s.administering_body).filter(Boolean));
  return bodies.size > 1 ? "T" : "C";
}

/** The catalogue a row belongs to: its regime and its body. Condition (1). */
export function catalogueKey(r: Inst): string {
  return `${r.parent_id ?? r.id} ${(r.administering_body ?? "").trim().toLowerCase()}`;
}

/** Every digit run in a name, in order. */
export function digitRuns(name: string | null): string[] {
  return String(name ?? "").match(/[0-9]+/g) ?? [];
}

/** The digit runs that are calendar years: four digits in a plausible range.
 *  A universal property of dates, not a property of any register or language. */
export function yearsIn(name: string | null): Set<string> {
  return new Set(digitRuns(name).filter((d) =>
    d.length === 4 && Number(d) >= 1990 && Number(d) <= 2100));
}

export type Relation = "edition" | "duplicate" | "not_time";

/**
 * Condition (3): is the numeric difference between two names TIME?
 *
 * `not_time` is the guard that stops `Horizon EU CL1` being read as a later
 * edition of `Horizon EU CL6`. The digits were deleted before the subject
 * comparison so they could not separate two years; that makes it mandatory to
 * ask what they were before concluding anything.
 */
export function timeRelation(a: string | null, b: string | null): Relation {
  const ya = [...yearsIn(a)].sort().join(","), yb = [...yearsIn(b)].sort().join(",");
  if (ya !== yb) return "edition";
  const da = digitRuns(a).slice().sort().join(","), db = digitRuns(b).slice().sort().join(",");
  if (da === db) return "duplicate";
  return "not_time";
}

export interface Grouping {
  /** id -> group id. A row alone in its group maps to its own id. */
  groupOf: Map<string, string>;
  groups: Map<string, string[]>;
  /** Smallest pairwise similarity inside each multi-member group. Under
   *  complete linkage this is >= theta by construction, and it is printed
   *  anyway: a table that asserts its own invariant is a table that will keep
   *  asserting it after someone changes the linkage. */
  weakestLink: Map<string, number>;
  /** Pairs the vocabulary weighting could not score at all: everything they
   *  share weighs zero inside their own catalogue. */
  refusedNoVocab: number;
  /** Pairs whose subject matched but whose numeric difference is not time. */
  refusedNotTime: number;
  /** Relation that formed each multi-member group. */
  relationOf: Map<string, Relation>;
}

/**
 * Group the given rows into editions at `theta`.
 *
 * COMPLETE LINKAGE, deliberately. Single linkage chained seven ADEME calls into
 * one group whose weakest internal pair scored 0.00 — A matches B and B matches
 * C, so A and C are declared one fund having been compared to nothing. A
 * collapse hides rows, so the merge rule has to be the one where EVERY member
 * has been shown to be the same programme as every other member, not the one
 * where a path exists.
 */
export function groupEditions(rows: Inst[], theta: number): Grouping {
  const byCat = new Map<string, Inst[]>();
  for (const r of rows) {
    const k = catalogueKey(r);
    (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(r);
  }
  const toks = new Map<string, Set<string>>();
  const nameOf = new Map<string, string | null>();
  for (const r of rows) { toks.set(r.id, contentTokens(r.name)); nameOf.set(r.id, r.name); }

  const groupOf = new Map<string, string>();
  const groups = new Map<string, string[]>();
  const weakestLink = new Map<string, number>();
  const relationOf = new Map<string, Relation>();
  let refusedNoVocab = 0, refusedNotTime = 0;

  for (const [, members] of byCat) {
    const w = idfWeights(members.map((m) => toks.get(m.id)!));
    const sim = new Map<string, number>();
    const rel = new Map<string, Relation>();
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i].id, b = members[j].id;
        const s = weightedJaccard(toks.get(a)!, toks.get(b)!, w);
        if (s == null) { refusedNoVocab++; continue; }
        const t = timeRelation(nameOf.get(a)!, nameOf.get(b)!);
        if (s >= theta && t === "not_time") { refusedNotTime++; }
        sim.set(`${a}|${b}`, s);
        rel.set(`${a}|${b}`, t);
      }
    }
    const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const admissible = (a: string, b: string) =>
      (sim.get(pair(a, b)) ?? -1) >= theta && rel.get(pair(a, b)) !== "not_time";

    // Complete linkage: merge the two clusters whose WEAKEST cross pair is
    // strongest, and only while every cross pair is admissible.
    let clusters = members.map((m) => [m.id]);
    for (;;) {
      let best = -1, bi = -1, bj = -1;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          let min = 1, ok = true;
          for (const a of clusters[i]) {
            for (const b of clusters[j]) {
              if (!admissible(a, b)) { ok = false; break; }
              min = Math.min(min, sim.get(pair(a, b))!);
            }
            if (!ok) break;
          }
          if (ok && min > best) { best = min; bi = i; bj = j; }
        }
      }
      if (bi < 0) break;
      clusters[bi] = clusters[bi].concat(clusters[bj]);
      clusters = clusters.filter((_, k) => k !== bj);
    }
    for (const c of clusters) {
      const g = c.slice().sort()[0];
      for (const id of c) groupOf.set(id, g);
      groups.set(g, c);
      if (c.length < 2) continue;
      let min = 1;
      let anyEdition = false;
      for (let i = 0; i < c.length; i++) {
        for (let j = i + 1; j < c.length; j++) {
          min = Math.min(min, sim.get(pair(c[i], c[j])) ?? 0);
          if (rel.get(pair(c[i], c[j])) === "edition") anyEdition = true;
        }
      }
      weakestLink.set(g, min);
      relationOf.set(g, anyEdition ? "edition" : "duplicate");
    }
  }
  return { groupOf, groups, weakestLink, refusedNoVocab, refusedNotTime, relationOf };
}

export function pct(n: number, d: number) { return d ? `${((100 * n) / d).toFixed(1)}%` : "n/a"; }

export async function loadCorpus(db: Client): Promise<Inst[]> {
  const { rows } = await db.query<Inst>(`
    SELECT id, parent_id, name, country, administering_body, scheme_code,
           scheme_end_date, scheme_end_date_basis, source_window_policy,
           last_year, successor_scheme, is_framework, event_count
      FROM funding_instruments`);
  if (!rows.length) throw new Error("_wscl_recurrence: corpus read returned nothing");
  return rows;
}

export function livenessFacts(r: Inst) {
  return {
    schemeEndDate: r.scheme_end_date,
    schemeEndBasis: r.scheme_end_date_basis,
    lastYear: r.last_year,
    successorScheme: r.successor_scheme,
    sourceWindowPolicy: r.source_window_policy,
  };
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const rows = await loadCorpus(db);

  const family = new Map<string, Inst[]>();
  for (const r of rows) {
    const k = r.parent_id ?? r.id;
    (family.get(k) ?? family.set(k, []).get(k)!).push(r);
  }
  const kindOf = new Map<string, Kind>();
  for (const r of rows) kindOf.set(r.id, classify(r, family.get(r.parent_id ?? r.id)!));
  const cat = rows.filter((r) => kindOf.get(r.id) === "C");

  console.log("=".repeat(78));
  console.log("1  THE CATALOGUE POPULATION, AND WHETHER IT REPEATS ITSELF");
  console.log("=".repeat(78));
  const counts = { T: 0, C: 0, S: 0 } as Record<Kind, number>;
  for (const k of kindOf.values()) counts[k]++;
  console.log(`instruments ${rows.length}   T ${counts.T} (${pct(counts.T, rows.length)})` +
    `   C ${counts.C} (${pct(counts.C, rows.length)})   S ${counts.S} (${pct(counts.S, rows.length)})`);
  console.log(`(reproduces wsCJ: T 76 / C 295 / S 717 of 1088)`);

  // 1c — the token floor, measured rather than asserted.
  const lens = new Map<number, number>();
  for (const r of rows) {
    for (const t of String(r.name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[0-9]+/g, " ").replace(/[^a-z]+/g, " ").split(" ").filter(Boolean)) {
      lens.set(t.length, (lens.get(t.length) ?? 0) + 1);
    }
  }
  const totalTok = [...lens.values()].reduce((a, b) => a + b, 0);
  const dropped = [...lens].filter(([l]) => l < MIN_TOKEN).reduce((a, [, n]) => a + n, 0);
  console.log(`\n1c  THE TOKEN FLOOR (MIN_TOKEN=${MIN_TOKEN}) discards ${dropped}/${totalTok} ` +
    `(${pct(dropped, totalTok)}) of corpus name tokens.`);
  console.log(`    length histogram: ` + [1, 2, 3, 4, 5, 6, 7, 8].map((l) =>
    `${l}:${pct(lens.get(l) ?? 0, totalTok)}`).join(" "));
  console.log(`    TEST FOR AN UNSEEN LANGUAGE: a corpus whose share below the floor is much`);
  console.log(`    above this is one whose content words are shorter than the floor, and the`);
  console.log(`    floor must be lowered for it. Nothing here names a language.`);

  console.log("\n" + "=".repeat(78));
  console.log("2  HOW MUCH OF THE CATALOGUE IS ONE PROGRAMME REPEATED");
  console.log("=".repeat(78));
  console.log(`theta   C rows in a group of >=2     groups  largest  weakest link  ` +
    `groups by relation      refused (no vocab / not time)`);
  for (const theta of THETAS) {
    const g = groupEditions(cat, theta);
    const multi = [...g.groups.entries()].filter(([, v]) => v.length > 1);
    const inGroup = multi.reduce((a, [, v]) => a + v.length, 0);
    const weak = [...g.weakestLink.values()].sort((a, b) => a - b);
    const ed = multi.filter(([k]) => g.relationOf.get(k) === "edition").length;
    console.log(`${theta.toFixed(2)}    ${String(inGroup).padStart(4)} / ${cat.length}  ` +
      `${pct(inGroup, cat.length).padStart(7)}     ${String(multi.length).padStart(4)}` +
      `    ${String(Math.max(0, ...multi.map(([, v]) => v.length))).padStart(4)}` +
      `     ${weak.length ? `${weak[0].toFixed(2)}` : " n/a"}` +
      `         ${String(ed).padStart(3)} edition / ${String(multi.length - ed).padStart(3)} duplicate` +
      `      ${g.refusedNoVocab} / ${g.refusedNotTime}`);
  }

  // 2b — what the weighting refused, stated because it is the safety property.
  {
    const plainByCat = new Map<string, Inst[]>();
    for (const r of cat) { const k = catalogueKey(r); (plainByCat.get(k) ?? plainByCat.set(k, []).get(k)!).push(r); }
    let plainPairs = 0, weightedPairs = 0;
    for (const [, members] of plainByCat) {
      const tk = members.map((m) => contentTokens(m.name));
      const w = idfWeights(tk);
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          if (jaccard(tk[i], tk[j]) >= 0.9) plainPairs++;
          const s = weightedJaccard(tk[i], tk[j], w);
          if (s != null && s >= 0.9) weightedPairs++;
        }
      }
    }
    console.log(`\n2b  AT theta 0.90, PLAIN set Jaccard links ${plainPairs} catalogue pairs and the`);
    console.log(`    IDF-WEIGHTED one links ${weightedPairs}. The difference is rows that agree on`);
    console.log(`    nothing but the catalogue's own name — Horizon EU CL1 with CL6, IPCEI`);
    console.log(`    Batteries with IPCEI Cloud — which a set intersection cannot tell from a`);
    console.log(`    real repeat and which the weighting scores at zero.`);
  }

  // Regime concentration, printed BESIDE the gain and never separately.
  console.log(`\nREGIME CONCENTRATION of the grouped rows (a gain that is one regime is not a finding)`);
  for (const theta of THETAS) {
    const g = groupEditions(cat, theta);
    const byRegime = new Map<string, number>();
    for (const [gid, ids] of g.groups) {
      if (ids.length < 2) continue;
      const r = cat.find((x) => x.id === ids[0])!;
      const k = `${r.parent_id ?? r.id}|${r.country ?? "?"}`;
      byRegime.set(k, (byRegime.get(k) ?? 0) + ids.length);
      void gid;
    }
    const s = [...byRegime].sort((a, b) => b[1] - a[1]);
    const tot = s.reduce((a, [, n]) => a + n, 0);
    console.log(`  theta ${theta.toFixed(2)}: ${tot} rows across ${s.length} regime(s), largest ` +
      `${tot ? pct(s[0]?.[1] ?? 0, tot) : "n/a"} -- ${s.slice(0, 5).map(([k, n]) => `${k}:${n}`).join(" ") || "(none)"}`);
  }

  console.log("\n" + "=".repeat(78));
  console.log("3  THE INDEPENDENT CHECK — do the groups agree with WHAT THE FUND FUNDS?");
  console.log("=".repeat(78));
  console.log("`instrument_profiles.embedding` is built from award titles and the grouping");
  console.log("rule never sees it. If the groups are real, within-group cosine sits far above");
  console.log("two rows drawn from the same catalogue at random.");
  const ids = cat.map((r) => r.id);
  const { rows: profRows } = await db.query<{ a: string; b: string; cos: number }>(
    `SELECT p1.instrument_id AS a, p2.instrument_id AS b,
            1 - (p1.embedding <=> p2.embedding) AS cos
       FROM instrument_profiles p1 JOIN instrument_profiles p2 ON p1.instrument_id < p2.instrument_id
      WHERE p1.instrument_id = ANY($1) AND p2.instrument_id = ANY($1)`, [ids]);
  const cosOf = new Map<string, number>();
  for (const r of profRows) cosOf.set(`${r.a} ${r.b}`, Number(r.cos));
  const cos = (x: string, y: string) => cosOf.get(x < y ? `${x} ${y}` : `${y} ${x}`);
  const byCat = new Map<string, Inst[]>();
  for (const r of cat) { const k = catalogueKey(r); (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(r); }
  const q = (v: number[], p: number) => v.length ? v.sort((a, b) => a - b)[Math.floor(p * (v.length - 1))] : NaN;
  console.log(`\ntheta   within-group cosine (p25/p50/p75)   same-catalogue-not-grouped (p25/p50/p75)   n`);
  for (const theta of THETAS) {
    const g = groupEditions(cat, theta);
    const inside: number[] = [], outside: number[] = [];
    for (const members of byCat.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const c = cos(members[i].id, members[j].id);
          if (c == null) continue;
          (g.groupOf.get(members[i].id) === g.groupOf.get(members[j].id) ? inside : outside).push(c);
        }
      }
    }
    if (!inside.length) { console.log(`${theta.toFixed(2)}    (no group formed)`); continue; }
    console.log(`${theta.toFixed(2)}    ${q(inside, 0.25).toFixed(3)} / ${q(inside, 0.5).toFixed(3)} / ${q(inside, 0.75).toFixed(3)}` +
      `                 ${q(outside, 0.25).toFixed(3)} / ${q(outside, 0.5).toFixed(3)} / ${q(outside, 0.75).toFixed(3)}` +
      `                ${inside.length} / ${outside.length}`);
  }

  console.log("\n" + "=".repeat(78));
  console.log("4  IS A CLOSED INSTANCE ABLE TO OCCUPY A SLOT IN A LIVE FOUNDER'S FIVE?");
  console.log("=".repeat(78));
  const closedRows = rows.filter((r) => isClosed(livenessFacts(r)));
  console.log(`rows the corpus itself calls CLOSED: ${closedRows.length} of ${rows.length} (${pct(closedRows.length, rows.length)})`);
  console.log(`  of which the basis is a CALL DEADLINE (permanently shut): ` +
    `${closedRows.filter((r) => r.scheme_end_date_basis === "call_deadline").length}`);
  console.log(`  those are excluded by publishableInstruments() before ranking; §5 of`);
  console.log(`  _wscl_collapse.ts checks the shipped pools for them directly.`);
  const window_ = rows.filter((r) => r.source_window_policy === SOURCE_WINDOW_POLICY.publishesWindow);
  const restsOnAbsence = window_.filter((r) => !r.scheme_end_date);
  console.log(`\nTHE EXPOSURE, which is not the same question:`);
  console.log(`  rows whose register STATES application windows            ${window_.length}`);
  console.log(`  ... of which we hold NO deadline at all                   ${restsOnAbsence.length}  ${pct(restsOnAbsence.length, rows.length)} of the corpus`);
  console.log(`  These are open in the product because our copy is silent, not because the`);
  console.log(`  register is. Rule Zero forbids calling them closed from our columns; what`);
  console.log(`  they are is UNVERIFIED, and every one of them can hold a slot today.`);
  const byRegime = new Map<string, number>();
  for (const r of restsOnAbsence) {
    const k = `${r.parent_id ?? r.id}|${r.country ?? "?"}`;
    byRegime.set(k, (byRegime.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...byRegime].sort((a, b) => b[1] - a[1])) console.log(`      ${k.padEnd(34)} ${String(n).padStart(4)}`);

  await db.end();
}

if (process.argv[1] && process.argv[1].endsWith("_wscl_recurrence.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
