// The 70 cited-structural blocks, one line each, with the GATE that fired and
// the ANSWER it fired against — so each can be settled on the funder's page.
import { readFileSync, writeFileSync } from "fs";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal(); delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsgl_contradictions", ["DATABASE_URL"]);
import { hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, publishableInstruments, requireLiveCorpus } from "../lib/intelligence/corpus";
import { assessInstrument, isStructural, isCited } from "../lib/intelligence/verdict";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { loadRecallSet, reattributeMissingAnswers } from "./recallSet";

async function main() {
  await hydrateDbInstruments(); requireLiveCorpus("wsgl_contradictions");
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const blob = JSON.parse(readFileSync(process.env.IN as string, "utf8"));
  const rows = (Array.isArray(blob) ? blob : blob.rows) as any[];
  const inCorpus = new Set(byId.keys());
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const { rows: raw } = loadRecallSet("wsgl contradictions");
  const all = reattributeMissingAnswers(
    raw, (id) => inCorpus.has(id), (id) => offerable.has(id)).rows;
  const keyed = new Map(all.map((r) => [`${r.name}::${r.instrument}`, r]));
  await hydrateGatesFor([...new Set(rows.map((r: any) => r.instrument))]);
  const policy = founderPolicyFromEnv();
  const out: any[] = [];
  let nStage = 0, nMissKey = 0, nMissInst = 0, nNoBlock = 0;
  for (const r of rows) {
    if (r.stage !== "ver_blocked_structural") continue;
    nStage++;
    const t = keyed.get(`${r.name}::${r.instrument}`);
    if (!t) { nMissKey++; continue; }
    const f = founderIntake(t as never, policy);
    const inst = loadDbInstruments().find((x) => x.id === r.instrument);
    if (!inst) { nMissInst++; continue; }
    const a = assessInstrument(inst, f.eligibility as never);
    const answers = f.eligibility as unknown as Record<string, unknown>;
    for (const b of a.blockers) {
      if (!(isStructural(b.field) && b.cited)) continue;
      const g = inst.gates.find((x) => x.requirement === b.requirement);
      out.push({
        company: r.name, founder_country: r.country,
        instrument: r.instrument, instrument_name: inst.name, instrument_country: inst.country,
        field: b.field,
        founder_answer: answers[b.field],
        requirement: b.requirement,
        value_spec: (g as any)?.valueSpec ?? null,
        quote: (g as any)?.quote ?? null,
        verification_level: (g as any)?.verificationLevel ?? null,
        source_locator: (g as any)?.sourceLocator ?? null,
        eligibility_source_url: (inst as any).eligibilitySourceUrl ?? null,
        application_url: (inst as any).applicationUrl ?? null,
      });
    }
  }
  writeFileSync(process.env.OUT as string, JSON.stringify(out, null, 1));
  console.log(`stage=${nStage} missKey=${nMissKey} missInst=${nMissInst}`);
  console.log(`${out.length} blocking gate(s) across ${new Set(out.map((o) => o.company)).size} founders`);
}
main().catch((e) => { console.error(e); process.exit(1); });
