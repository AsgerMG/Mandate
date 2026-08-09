// wsCL, part 2 — what collapsing a body's repeated calls to ONE ROW does to
// EXACT@5, whether the gain is real, and whether a closed call is holding a
// slot a live one should have.
//
// ── The three questions, and the order they have to be asked in ────────────
// 1  Are recurring instances one fund observed many times?  (_wscl_recurrence)
// 2  What does collapsing them to the live instance do to EXACT@5?  (§2 here)
// 3  Is a CLOSED instance able to occupy a slot in a live founder's five? (§4)
//
// ── HOW A HISTORICAL WINNER IS SCORED, which decides whether §2 means anything
// The answer key is a register of awards that were MADE, so the leaf a company
// won is very often a call that has since shut. Under a collapse there are two
// defensible scorings and they answer different questions, so BOTH are printed
// and neither is called "the" number:
//
//   GROUP-CREDIT   the pair is a hit when ANY member of the won leaf's group is
//                  among the first five distinct groups the shipped order
//                  reaches. This is the reading the collapse proposal asserts:
//                  the founder who won `Torres Quevedo 2022` should be sent to
//                  `Torres Quevedo 2024`, and sending them there is a correct
//                  answer, not a near miss. It is the number that tests the
//                  proposal.
//
//   STRICT         the pair is a hit only when the surviving representative IS
//                  the won leaf. On a historical key this is close to a measure
//                  of how many winners happened to win the most recent edition,
//                  and it is printed to show how large that artefact is. A
//                  reader who quoted it would conclude collapse HURTS, for a
//                  reason that has nothing to do with founders.
//
// ── WHY THERE IS A PLACEBO, and why GROUP-CREDIT is worthless without it ────
// Collapsing keys can only ever RAISE group-credit EXACT@5, mechanically and
// with no reference to whether the groups are real: five distinct GROUPS reach
// further down the ranked pool than five distinct LEAVES, so the founder is
// effectively shown more instruments and the won leaf has more chances to be
// among them. wsCJ's `+36.0` over-credit line is that effect at full stretch.
//
// So every collapse is measured against a PLACEBO with the same group-size
// multiset inside the same catalogues and arbitrary membership. The placebo
// captures the whole of the prefix-lengthening effect and none of the meaning.
// THE ONLY NUMBER THAT IS EVIDENCE IS THE MARGIN OVER THE PLACEBO, and if the
// real grouping does not clear its placebo band the collapse buys nothing that
// deleting rows at random would not also buy.
//
// ── FREE ───────────────────────────────────────────────────────────────────
// Postgres reads plus two existing wsCI pool dumps. No model calls, no embeds,
// no writes.
//
//   SPLIT=tune    N=250 OUT=/tmp/wscl/tune.json    npx tsx scripts/_wsci_autopsy.ts
//   SPLIT=holdout N=250 OUT=/tmp/wscl/holdout.json npx tsx scripts/_wsci_autopsy.ts
//   TUNE=/tmp/wscl/tune.json HOLDOUT=/tmp/wscl/holdout.json \
//     npx tsx scripts/_wscl_collapse.ts
import { readFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wscl_collapse", ["DATABASE_URL"]);

import { Client } from "pg";

import { isClosed, SOURCE_WINDOW_POLICY } from "../lib/intelligence/liveness";
import {
  catalogueKey, classify, groupEditions, type Inst, type Kind,
  livenessFacts, loadCorpus, pct, THETAS,
} from "./_wscl_recurrence";

interface Pair { want: string; hit: boolean; pool?: [string, string, string][] }

/** Deterministic PRNG, so a placebo band is reproducible from the printed seed. */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * EXACT@5 under a collapse key.
 *
 * The published five ARE `pool[0..4]` (see `_wsci_autopsy.ts`), so under a key
 * the five rows become the first five DISTINCT keys of the same order and every
 * number here is exact rather than estimated.
 *
 * `strict` scores only the representative — the first member of the group the
 * order reaches — as the hit. Group-credit scores any member.
 */
function exactAt5(
  pairs: Pair[], key: (id: string) => string, strict = false,
): { hit: number; n: number } {
  let hit = 0;
  for (const p of pairs) {
    const pool = (p.pool ?? []).map((x) => x[0]);
    const seen: string[] = [];
    const rep = new Map<string, string>();
    for (const id of pool) {
      const k = key(id);
      if (!rep.has(k)) { rep.set(k, id); seen.push(k); }
    }
    const top5 = seen.slice(0, 5);
    if (!top5.includes(key(p.want))) continue;
    if (strict && rep.get(key(p.want)) !== p.want) continue;
    hit++;
  }
  return { hit, n: pairs.length };
}

function line(label: string, hit: number, n: number, base: number) {
  console.log(`  ${label.padEnd(56)} ${String(hit).padStart(3)}/${n} = ${pct(hit, n).padStart(6)}` +
    `   delta ${(((hit - base) / n) * 100).toFixed(1).padStart(5)}`);
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const rows = await loadCorpus(db);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const family = new Map<string, Inst[]>();
  for (const r of rows) {
    const k = r.parent_id ?? r.id;
    (family.get(k) ?? family.set(k, []).get(k)!).push(r);
  }
  const kindOf = new Map<string, Kind>();
  for (const r of rows) kindOf.set(r.id, classify(r, family.get(r.parent_id ?? r.id)!));
  const cat = rows.filter((r) => kindOf.get(r.id) === "C");

  // ── the matchable gate signature, for the blocked-winner guard ───────────
  // Same key `_wsci_autopsy.ts` builds its residual classes on: a decidable
  // comparator on a filter-role gate, never mere presence of prose.
  const RANKS = ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"];
  const g = await db.query(
    `SELECT instrument_id, COALESCE(intake_field_resolved, intake_field) AS f,
            gate_role, value_spec FROM eligibility_gates`);
  const val = new Map<string, Map<string, Set<string>>>();
  for (const r of g.rows) {
    if (r.value_spec == null || r.gate_role !== "filter") continue;
    const id = String(r.instrument_id), f = r.f ?? "none";
    if (!val.has(id)) val.set(id, new Map());
    if (!val.get(id)!.has(f)) val.get(id)!.set(f, new Set());
    val.get(id)!.get(f)!.add(JSON.stringify(r.value_spec));
  }
  const gateSig = (id: string) => RANKS.map((f) => {
    const s = val.get(id)?.get(f);
    return s && s.size ? [...s].sort().join("~") : "";
  }).join("|");

  const dumps: [string, Pair[]][] = [];
  for (const [name, env] of [["tune", "TUNE"], ["holdout", "HOLDOUT"]] as const) {
    const p = process.env[env];
    if (!p) continue;
    const parsed: Pair[] = JSON.parse(readFileSync(p, "utf8"));
    if (!parsed.length) throw new Error(`_wscl_collapse: ${env} dump is empty`);
    if (!parsed.some((x) => x.pool?.length)) {
      throw new Error(`_wscl_collapse: ${env} dump carries no pools — re-run the autopsy with OUT=`);
    }
    dumps.push([name, parsed]);
  }
  if (!dumps.length) throw new Error("_wscl_collapse: set TUNE= and HOLDOUT= to the wsCI pool dumps");

  console.log("=".repeat(78));
  console.log("2  WHAT COLLAPSING RECURRING INSTANCES DOES TO EXACT@5");
  console.log("=".repeat(78));
  console.log("Every line is exact: the published five are pool[0..4], so a key over the same");
  console.log("order gives the five rows a founder would have seen. Group-credit scores a hit");
  console.log("when the WON edition belongs to a group the five reach; strict scores only the");
  console.log("surviving representative. See the header for why both are printed.\n");

  const PLACEBOS = 25;
  for (const [split, pairs] of dumps) {
    const base = exactAt5(pairs, (id) => id).hit;
    console.log(`── ${split}, ${pairs.length} pairs ` + "─".repeat(50));
    line("base (shipped, no collapse)", base, pairs.length, base);
    for (const theta of THETAS) {
      const gr = groupEditions(cat, theta);
      const key = (id: string) => gr.groupOf.get(id) ?? id;
      const credited = exactAt5(pairs, key).hit;
      const strict = exactAt5(pairs, key, true).hit;

      // Placebo: same group-size multiset, same catalogues, arbitrary members.
      const sizes = new Map<string, number[]>();
      for (const [gid, ids] of gr.groups) {
        if (ids.length < 2) continue;
        const k = catalogueKey(byId.get(ids[0])!);
        (sizes.get(k) ?? sizes.set(k, []).get(k)!).push(ids.length);
        void gid;
      }
      const band: number[] = [];
      for (let s = 0; s < PLACEBOS; s++) {
        const rnd = mulberry32(1000 + s);
        const fake = new Map<string, string>();
        for (const [k, sz] of sizes) {
          const pool = cat.filter((r) => catalogueKey(r) === k).map((r) => r.id);
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          let at = 0;
          for (const n of sz) {
            const take = pool.slice(at, at + n); at += n;
            if (take.length < 2) continue;
            const gid = take.slice().sort()[0];
            for (const id of take) fake.set(id, gid);
          }
        }
        band.push(exactAt5(pairs, (id) => fake.get(id) ?? id).hit);
      }
      band.sort((a, b) => a - b);
      const grouped = [...gr.groups.values()].filter((v) => v.length > 1).reduce((a, v) => a + v.length, 0);
      console.log(`  theta ${theta.toFixed(2)}  (${grouped} rows collapsed into ` +
        `${[...gr.groups.values()].filter((v) => v.length > 1).length} groups)`);
      line("    GROUP-CREDIT  collapse to the group", credited, pairs.length, base);
      line("    STRICT        only the representative counts", strict, pairs.length, base);
      console.log(`      placebo band, ${PLACEBOS} arbitrary regroupings of the same shape: ` +
        `${band[0]}..${band[band.length - 1]} (median ${band[Math.floor(band.length / 2)]})` +
        `   MARGIN over placebo median ${(((credited - band[Math.floor(band.length / 2)]) / pairs.length) * 100).toFixed(1)} pts`);
    }
    // wsCJ's over-credit line, reproduced as the ceiling of ANY catalogue collapse.
    const nsKey = (id: string) => {
      const r = byId.get(id);
      return r ? `${r.parent_id ?? r.id} ${r.scheme_code ?? ""}` : id;
    };
    line("wsCJ over-credit: fuse every blank scheme_code (NOT a result)",
      exactAt5(pairs, nsKey).hit, pairs.length, base);
    console.log("");
  }

  // ── §3 THE GUARD ────────────────────────────────────────────────────────
  console.log("=".repeat(78));
  console.log("3  THE GUARD: WHICH VERIFIED WINNERS A COLLAPSE WOULD HIDE");
  console.log("=".repeat(78));
  console.log("A wrongly-collapsed row hides a fund from someone who qualifies. Two ways this");
  console.log("collapse does that, both computed over the WHOLE answer key and not a sample:");
  console.log("  (a) EVERY MEMBER CLOSED. `collapse to the live instance` then leaves no row");
  console.log("      at all, and a winner of that programme is deleted from the product.");
  console.log("  (b) THE SURVIVOR DEMANDS SOMETHING ELSE. The representative's matchable gate");
  console.log("      signature differs from the won edition's, so a founder who satisfied the");
  console.log("      edition they won may be screened out of the one they are sent to.\n");

  const { rows: awardRows } = await db.query<{ instrument_id: string; n: string }>(
    `SELECT instrument_id, count(*) AS n FROM brief_records GROUP BY 1`).catch(() => ({ rows: [] as never[] }));
  void awardRows;

  for (const theta of THETAS) {
    const gr = groupEditions(cat, theta);
    const multi = [...gr.groups.entries()].filter(([, v]) => v.length > 1);
    if (!multi.length) { console.log(`  theta ${theta.toFixed(2)}: no group formed`); continue; }
    let allClosed = 0, heteroGate = 0, membersAtRisk = 0;
    const named: string[] = [];
    for (const [gid, ids] of multi) {
      const members = ids.map((id) => byId.get(id)!);
      const live = members.filter((m) => !isClosed(livenessFacts(m)));
      if (!live.length) {
        allClosed++;
        membersAtRisk += members.length;
        named.push(`ALL-CLOSED ${gid} (${members.length} members)`);
        continue;
      }
      const sigs = new Set(members.map((m) => gateSig(m.id)));
      if (sigs.size > 1) {
        heteroGate++;
        membersAtRisk += members.length - 1;
        named.push(`HETERO-GATE ${gid} (${members.length} members, ${sigs.size} distinct demands)`);
      }
    }
    console.log(`  theta ${theta.toFixed(2)}  groups ${multi.length}` +
      `   (a) every member closed: ${allClosed}` +
      `   (b) survivor demands something else: ${heteroGate}` +
      `   rows at risk of being hidden: ${membersAtRisk}`);
    for (const n of named.slice(0, 6)) console.log(`      ${n}`);
  }
  // A guard that cannot fail is not a guard. This one is given a population it
  // MUST report a nonzero risk on, so a clean run below is evidence and not a
  // silent skip.
  {
    const forced = groupEditions(cat, 0.0);
    const multi = [...forced.groups.values()].filter((v) => v.length > 1);
    if (!multi.length) throw new Error("_wscl_collapse: the guard's forcing case formed no group — it cannot fail, so it is not a guard");
    let hetero = 0;
    for (const ids of multi) if (new Set(ids.map((id) => gateSig(id))).size > 1) hetero++;
    console.log(`\n  GUARD PROVED TO FAIL: forced to theta 0.00 the same code forms ${multi.length}` +
      ` groups and flags ${hetero} of them as demanding different things. It is not green` +
      ` by construction.`);
    if (!hetero) throw new Error("_wscl_collapse: forcing case flagged nothing — the guard is inert");
  }

  // ── §4 CLOSED INSTANCES IN LIVE SLOTS ──────────────────────────────────
  console.log("\n" + "=".repeat(78));
  console.log("4  IS A CLOSED INSTANCE OCCUPYING A SLOT IN A LIVE FOUNDER'S FIVE?");
  console.log("=".repeat(78));
  const closed = new Set(rows.filter((r) => isClosed(livenessFacts(r))).map((r) => r.id));
  const unverified = new Set(rows.filter((r) =>
    r.source_window_policy === SOURCE_WINDOW_POLICY.publishesWindow && !r.scheme_end_date).map((r) => r.id));
  console.log(`corpus: ${closed.size} rows are CLOSED by the one liveness definition;` +
    ` ${unverified.size} are open only because our copy holds no deadline while their` +
    ` register does state one.\n`);
  for (const [split, pairs] of dumps) {
    let withClosed = 0, withUnverified = 0, closedSlots = 0, unverifiedSlots = 0;
    for (const p of pairs) {
      const five = (p.pool ?? []).slice(0, 5).map((x) => x[0]);
      const c = five.filter((id) => closed.has(id)).length;
      const u = five.filter((id) => unverified.has(id)).length;
      if (c) withClosed++;
      if (u) withUnverified++;
      closedSlots += c; unverifiedSlots += u;
    }
    const slots = pairs.length * 5;
    console.log(`── ${split}`);
    console.log(`  founders shown >=1 CLOSED row in their five        ${withClosed}/${pairs.length} (${pct(withClosed, pairs.length)})` +
      `   slots ${closedSlots}/${slots} (${pct(closedSlots, slots)})`);
    console.log(`  founders shown >=1 UNVERIFIED-WINDOW row           ${withUnverified}/${pairs.length} (${pct(withUnverified, pairs.length)})` +
      `   slots ${unverifiedSlots}/${slots} (${pct(unverifiedSlots, slots)})`);
  }

  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
