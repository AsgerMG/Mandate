// wsDQ — THE DIFF: shipped order versus model order, and what reached the page.
//
// Reads the two `run_<arm>.json` files for one company and writes `diff.md`.
// It asserts nothing and tunes nothing; it lays the two runs side by side so a
// reader can see which rows entered, which left, and how far down the list the
// model reached.
//
// ── The first thing it checks, before anything is attributed to the arm ──
// THE CONTROL. The arms run in two processes and a live web-search call sits
// upstream of the pool, so the two runs can differ for reasons that have
// nothing to do with the model. If the pools that reached the seam are not the
// same SET, the comparison is contaminated and this file says so at the top,
// in place of a conclusion.
//
//   COMPANY="Cisteo MEDICAL" npx tsx scripts/_wsdq_diff.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import { OUT_ROOT, slugOf } from "./_wsdq_paths";

interface Row {
  instrumentId: string; instrument: string; administeringBody?: string;
  country?: string; capitalType?: string; descriptor?: string;
  typicalAward?: number; typicalAwardN?: number; description?: string;
}
interface Trace {
  arm: string; poolIn: string[]; poolOut: string[]; poolDetail: Row[];
  menu: string[]; picks: number[]; pickedIds: string[]; unsure: number[];
  retrieved: { instrumentId: string; text: string }[];
  turns: { round: number; system: string; user: string; reply: string; thinking: string; eur: number }[];
  fellBack: string | null; eur: number;
}
interface Run {
  company: string; arm: string; secs: number; failure: string | null;
  levers: Record<string, unknown>;
  corpus: Record<string, unknown>;
  rankerLine: string; armLine: string;
  cost: { eur: number; calls: number };
  frozenProvenance: Record<string, unknown>;
  trace: Trace | null;
  decision: Record<string, string[]> | null;
  report: Record<string, unknown> | null;
}

const one = (s: unknown, n = 96) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
};

function main() {
  const want = process.env.COMPANY ?? "";
  const dir = path.join(OUT_ROOT, slugOf(want));
  const load = (arm: string): Run => {
    const f = path.join(dir, `run_${arm}.json`);
    if (!existsSync(f)) throw new Error(`missing ${f}`);
    return JSON.parse(readFileSync(f, "utf8")) as Run;
  };
  const off = load("off");
  const on = load(process.env.ARM ?? "adviser");
  const L: string[] = [];
  const p = (s = "") => L.push(s);

  const prov = off.frozenProvenance;
  p(`# ${off.company} — arm off vs arm ${on.arm}`);
  p();
  p(`won fund (the answer key, never shown to any model): \`${prov.wonInstrument}\``);
  p(`> ${one(prov.wonInstrumentName, 400)}`);
  p();

  // ── 0. IS THIS A CONTROLLED COMPARISON? ────────────────────────────────
  p(`## 0. The control`);
  p();
  const poolOff = off.trace?.poolIn ?? [];
  const poolOn = on.trace?.poolIn ?? [];
  const setEq = poolOff.length === poolOn.length
    && new Set(poolOff).size === new Set([...poolOff, ...poolOn]).size;
  const seqEq = poolOff.length === poolOn.length && poolOff.every((x, i) => x === poolOn[i]);
  p(`| | off | ${on.arm} |`);
  p(`|---|---|---|`);
  p(`| corpus | ${off.corpus.source} ${off.corpus.instruments} @ ${off.corpus.hydratedAt} | ${on.corpus.source} ${on.corpus.instruments} @ ${on.corpus.hydratedAt} |`);
  p(`| ranker | ${off.rankerLine} | ${on.rankerLine} |`);
  p(`| pool at the seam | ${poolOff.length} rows | ${poolOn.length} rows |`);
  p(`| seconds | ${off.secs} | ${on.secs} |`);
  p(`| cost | EUR ${off.cost.eur.toFixed(4)} over ${off.cost.calls} calls | EUR ${on.cost.eur.toFixed(4)} over ${on.cost.calls} calls |`);
  p();
  p(setEq
    ? `**The pool that reached the seam is the same SET on both arms**, so every difference below is the arm's doing.${seqEq ? " It is the same SEQUENCE too." : " The sequences differ, which the arm alone cannot cause and is worth reading as drift in the upstream research call."}`
    : `**██ THE POOLS DIFFER AS SETS (${poolOff.filter((x) => !poolOn.includes(x)).length} only off, ${poolOn.filter((x) => !poolOff.includes(x)).length} only on). The comparison below is CONTAMINATED** by the live comparable-company search upstream of the pool, and nothing here may be attributed to the model alone.`);
  p();
  if (on.trace?.fellBack) {
    p(`**██ THE ARM FELL BACK: ${on.trace.fellBack}** The published table on the treatment side is the shipped order's.`);
    p();
  }
  p(`levers: \`${JSON.stringify(on.levers)}\``);
  p();
  p(`arm line: \`${on.armLine}\``);
  p();

  // ── 1. THE POOL, BOTH ORDERS ──────────────────────────────────────────
  const byId = new Map<string, Row>();
  for (const r of [...(off.trace?.poolDetail ?? []), ...(on.trace?.poolDetail ?? [])]) {
    if (!byId.has(r.instrumentId)) byId.set(r.instrumentId, r);
  }
  const won = String(prov.wonInstrument ?? "");
  const mark = (id: string) => (id === won ? " **← WON**" : "");
  const rankOff = new Map(poolOff.map((id, i) => [id, i]));
  p(`## 1. The pool, both orders`);
  p();
  p(`The shipped ranker's order is the left column. The model was shown the ${on.trace?.menu.length ?? 0}-row menu in that order and named ${on.trace?.picks.length ?? 0}.`);
  p();
  p(`| # | shipped order (arm off) | after arm ${on.arm} | moved |`);
  p(`|---:|---|---|---|`);
  const outOn = on.trace?.poolOut ?? [];
  for (let i = 0; i < Math.max(poolOff.length, outOn.length); i++) {
    const a = poolOff[i], b = outOn[i];
    const from = b != null ? rankOff.get(b) : undefined;
    const delta = from == null ? "" : from === i ? "—" : from > i ? `▲ from ${from}` : `▼ from ${from}`;
    p(`| ${i} | ${a ? `${one(byId.get(a)?.instrument ?? a, 60)}${mark(a)}` : ""} | ${b ? `${one(byId.get(b)?.instrument ?? b, 60)}${mark(b)}` : ""} | ${delta} |`);
  }
  p();
  const wonPoolRank = poolOff.indexOf(won);
  p(wonPoolRank < 0
    ? `The fund this company actually won is **NOT IN THE POOL AT ALL**. No selector can pick what it was not shown, so nothing below is a test of whether the model could have found it — only of what it does with the rows it has.`
    : `The fund this company actually won sits at pool position **${wonPoolRank}** with the arm off, and at **${outOn.indexOf(won)}** after the arm.`);
  p();

  // ── 2. WHAT THE MODEL CHOSE, AND HOW FAR IT REACHED ───────────────────
  p(`## 2. What the model chose`);
  p();
  if (!on.trace?.turns.length) {
    p(`No model call was made on this arm.`);
  } else {
    p(`| pick | menu rank | fund | what it funds |`);
    p(`|---:|---:|---|---|`);
    (on.trace.picks ?? []).forEach((menuIdx, n) => {
      const id = on.trace!.pickedIds[n];
      const r = byId.get(id);
      p(`| ${n + 1} | ${menuIdx} | ${one(r?.instrument ?? id, 70)}${mark(id)} | ${one(r?.description ?? r?.descriptor, 80)} |`);
    });
    p();
    const deepest = Math.max(-1, ...(on.trace.picks ?? []));
    p(`Deepest reach: menu rank **${deepest}** of ${(on.trace.menu.length || 1) - 1}. ` +
      `Kept from the shipped top ${on.trace.picks.length}: ` +
      `${(on.trace.picks ?? []).filter((i) => i < on.trace!.picks.length).length}.`);
    p();
    if (on.trace.unsure.length) {
      p(`It declared itself unsure about menu rank(s) ${on.trace.unsure.join(", ")} ` +
        `and was shown ${on.trace.retrieved.length} retrieved requirement chunk(s):`);
      p();
      for (const c of on.trace.retrieved) {
        p(`- \`${c.instrumentId}\` — ${one(c.text, 260)}`);
      }
      p();
      const r1 = on.trace.turns.find((t) => t.round === 1);
      const r2 = on.trace.turns.find((t) => t.round === 2);
      if (r1 && r2) {
        const pick = (s: string) => (s.match(/"picks"\s*:\s*\[([^\]]*)\]/) ?? [])[1] ?? "?";
        p(`Round 1 picked \`[${pick(r1.reply)}]\`; after retrieval round 2 picked \`[${pick(r2.reply)}]\`. ` +
          (pick(r1.reply) === pick(r2.reply)
            ? `**Retrieval did not change its mind.**`
            : `**Retrieval changed its mind.**`));
        p();
      }
    } else {
      p(`It declared nothing unsure, so no retrieval fired.`);
      p();
    }
    if (on.decision) {
      p(`Against the peer prior: followed ${on.decision.followed?.length ?? 0}, ` +
        `overrode ${on.decision.overrode?.length ?? 0}, ` +
        `reached past it for ${on.decision.reached?.length ?? 0}.`);
      p();
    }
  }

  // ── 3. WHAT PUBLISHED ─────────────────────────────────────────────────
  const pub = (r: Run) => ((r.report?.institutions as Record<string, unknown>[]) ?? [])
    .map((i) => String(i.institution));
  const pOff = pub(off), pOn = pub(on);
  p(`## 3. What published`);
  p();
  p(`| # | arm off | arm ${on.arm} |`);
  p(`|---:|---|---|`);
  for (let i = 0; i < Math.max(pOff.length, pOn.length); i++) {
    p(`| ${i + 1} | ${pOff[i] ?? ""} | ${pOn[i] ?? ""} |`);
  }
  p();
  const entered = pOn.filter((x) => !pOff.includes(x));
  const left = pOff.filter((x) => !pOn.includes(x));
  p(`Entered the table: ${entered.length ? entered.map((x) => `**${x}**`).join(", ") : "(none)"}`);
  p();
  p(`Left the table: ${left.length ? left.map((x) => `**${x}**`).join(", ") : "(none)"}`);
  p();

  // ── 4. THE FOUNDER, AS THE SYSTEM SAW THEM ────────────────────────────
  p(`## 4. The founder, as the system saw them`);
  p();
  p(`description (${prov.descriptionChars} chars, provenance \`${prov.descriptionSource}\`):`);
  p();
  p("```");
  p(String((off as unknown as { request?: { description?: string } }).request?.description
    ?? (JSON.parse(readFileSync(path.join(dir, "founder.json"), "utf8")) as
      { request: { description: string } }).request.description));
  p("```");
  p();
  const fr = JSON.parse(readFileSync(path.join(dir, "founder.json"), "utf8")) as
    { request: Record<string, unknown>; provenance: Record<string, unknown> };
  p(`intake answers reaching the seam:`);
  p();
  for (const [k, v] of Object.entries(fr.request.eligibility as Record<string, unknown>)) {
    p(`- \`${k}\`: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  p();
  const asked = (fr.provenance.questionsAsked as { question: string }[]) ?? [];
  p(`adaptive round: ${fr.provenance.adaptiveRoundRun ? "ran" : "did not run"}, ` +
    `${asked.length} question(s) asked, ` +
    `${(fr.provenance.genericAnswersMerged as unknown[] ?? []).length} merged into eligibility, ` +
    `${fr.provenance.projectAnswersKept} project answer(s) kept.`);
  p();
  p(`withheld by the replay policy, with the reason each: see \`founder.json\` → ` +
    `\`provenance.withheldByPolicy\` (${(fr.provenance.withheldByPolicy as unknown[] ?? []).length} fields).`);
  p();

  const outFile = path.join(dir, "diff.md");
  writeFileSync(outFile, L.join("\n"));
  console.log(`wrote ${outFile}`);
  console.log(`control: pools ${setEq ? "SAME SET" : "██ DIFFERENT SETS"}${seqEq ? ", same sequence" : ""}`);
  console.log(`published off:  ${pOff.join(" | ")}`);
  console.log(`published ${on.arm}: ${pOn.join(" | ")}`);
  console.log(`entered: ${entered.join(", ") || "(none)"}`);
  console.log(`left:    ${left.join(", ") || "(none)"}`);
  console.log(`cost: off EUR ${off.cost.eur.toFixed(4)} + ${on.arm} EUR ${on.cost.eur.toFixed(4)}`);
}

main();
