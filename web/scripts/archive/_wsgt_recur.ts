// wsGT: does the CORPUS hold a later edition of a closed call? Read-only.
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
requireCredentials("_wsgt_recur", ["DATABASE_URL"]);
import { readFileSync } from "fs";
import { Client } from "pg";
import { isClosed, today, SCHEME_END_BASIS } from "../../lib/intelligence/liveness";
import { catalogueKey, contentTokens, idfWeights, weightedJaccard, timeRelation, yearsIn, type Inst } from "./_wscl_recurrence";

const asOf = today();
const THETA = Number(process.env.THETA ?? 0.7);

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query<Inst>(`
    select id, parent_id, name, country, administering_body, scheme_code,
           scheme_end_date, scheme_end_date_basis, source_window_policy,
           last_year, successor_scheme, is_framework, event_count
      from funding_instruments`);
  await c.end();

  const facts = (r: Inst) => ({
    schemeEndDate: r.scheme_end_date, schemeEndBasis: r.scheme_end_date_basis,
    lastYear: r.last_year, successorScheme: r.successor_scheme,
    sourceWindowPolicy: r.source_window_policy,
  });
  const closedCall = rows.filter((r) => isClosed(facts(r), asOf)
    && r.scheme_end_date_basis === SCHEME_END_BASIS.callDeadline);
  console.log(`corpus ${rows.length}  closed-by-call-deadline ${closedCall.length}  theta ${THETA}`);

  // catalogue-local IDF, exactly wsCL's construction
  const byCat = new Map<string, Inst[]>();
  for (const r of rows) {
    const k = catalogueKey(r);
    (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(r);
  }
  const toks = new Map<string, Set<string>>();
  for (const r of rows) toks.set(r.id, contentTokens(r.name));

  const sibs = new Map<string, Inst[]>();   // closed row -> later-edition siblings
  for (const [, members] of byCat) {
    const w = idfWeights(members.map((m) => toks.get(m.id)!));
    for (const a of members) {
      if (!closedCall.includes(a)) continue;
      const out: Inst[] = [];
      for (const b of members) {
        if (b.id === a.id) continue;
        const s = weightedJaccard(toks.get(a.id)!, toks.get(b.id)!, w);
        if (s == null || s < THETA) continue;
        if (timeRelation(a.name, b.name) !== "edition") continue;
        // strictly LATER in time than the closed row
        const ya = Math.max(...[...yearsIn(a.name)].map(Number), -1);
        const yb = Math.max(...[...yearsIn(b.name)].map(Number), -1);
        const laterByName = yb > ya;
        const laterByDate = (b.scheme_end_date ?? "") > (a.scheme_end_date ?? "");
        if (!laterByName && !laterByDate) continue;
        out.push(b);
      }
      if (out.length) sibs.set(a.id, out);
    }
  }
  console.log(`closed rows with a LATER edition present in the corpus: ${sibs.size} / ${closedCall.length}`);
  let alsoClosed = 0;
  for (const [, ss] of sibs) if (ss.every((s) => isClosed(facts(s), asOf))) alsoClosed++;
  console.log(`  ... of which EVERY later edition is itself closed: ${alsoClosed}`);

  // against wsGL's funder-page ground truth
  const ev = readFileSync("../capital/project-mgmt/evidence/wsgl_closed_calls_2026-08-13.jsonl", "utf8")
    .trim().split("\n").map((l) => JSON.parse(l));
  console.log(`\nwsGL's 15 audited rows — funder verdict vs corpus falsifier:`);
  for (const e of ev) {
    const hit = sibs.get(e.instrument_id);
    console.log(`  ${e.verdict.padEnd(14)} later-edition-in-corpus=${hit ? String(hit.length) : "0"}  ${e.instrument_id}`);
  }
  const tally = new Map<string, [number, number]>();
  for (const e of ev) {
    const t = tally.get(e.verdict) ?? [0, 0];
    t[0]++; if (sibs.has(e.instrument_id)) t[1]++;
    tally.set(e.verdict, t);
  }
  console.log("");
  for (const [v, [n, k]] of tally) console.log(`  ${v}: ${k}/${n} would be recovered by the corpus falsifier`);
})();
