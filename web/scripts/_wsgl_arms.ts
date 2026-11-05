// What each proposed repair recovers AT THE VER-BLOCKED STAGE, exactly.
//
// The stage is a pure function of (instrument gates, founder answers), so the
// counterfactual needs no embedding and no model: re-decide `assessInstrument`
// for the 70 blocked founders with one set of gates suppressed and count how
// many stop being `blocked`. Costs nothing and can be re-run on any corpus.
import { readFileSync } from "fs";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal(); delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsgl_arms", ["DATABASE_URL"]);
import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, type DbGate, type DbInstrument,
} from "../lib/intelligence/corpus";
import { assessInstrument } from "../lib/intelligence/verdict";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { loadRecallSet, reattributeMissingAnswers } from "./recallSet";

type Arm = { name: string; drop: (g: DbGate, i: DbInstrument) => boolean };

async function main() {
  await hydrateDbInstruments(); requireLiveCorpus("wsgl_arms");
  const blob = JSON.parse(readFileSync(process.env.IN as string, "utf8"));
  const rows = (blob.rows as any[]).filter((r) => r.stage === "ver_blocked_structural");
  await hydrateGatesFor([...new Set(rows.map((r) => r.instrument))]);
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const parentOf = new Map(corpus.map((i) => [i.id, i.parentId ?? ""]));
  const nameSourceOf = new Map(corpus.map((i) => [i.id, (i as any).nameSource ?? ""]));
  const inCorpus = new Set(byId.keys());
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const { rows: raw } = loadRecallSet("wsgl arms");
  const keyed = new Map(reattributeMissingAnswers(
    raw, (id) => inCorpus.has(id), (id) => offerable.has(id)).rows
    .map((r) => [`${r.name}::${r.instrument}`, r]));
  const policy = founderPolicyFromEnv();

  const inheritedFromPartitionKey = (g: DbGate, i: DbInstrument) =>
    Boolean((g as any).inherited) && nameSourceOf.get(parentOf.get(i.id) ?? "") === "partition_key";
  // Arm A applied to the request path measured: accessible pool recall
  // 90% -> 91%, verified winners the gate screen would delete 274 -> 251, and
  // check_winner_not_gated's judgeable population 6,167 -> 4,610 pairs, under
  // its floor of 6,000. Reverted for that last figure. See corpus.ts,
  // resolveInheritedGates.

  const arms: Arm[] = [
    { name: "baseline", drop: () => false },
    { name: "A  no inheritance from a parent nothing outside our loader names",
      drop: inheritedFromPartitionKey },
    { name: "B  unseed satr_it_rnd/g1-territorio only",
      drop: (g) => (g as any).gateKey === "g1-territorio" },
    { name: "C  unseed the two borrowerModel gates that mean 'not a sole trader'",
      drop: (g) => {
        const s = (g as any).valueSpec;
        return s?.field === "borrowerModel" && s?.op === "not_in"
          && Array.isArray(s.allowed) && s.allowed.includes("operating");
      } },
    { name: "D  A + C together", drop: (g, i) => {
        const s = (g as any).valueSpec;
        const c = s?.field === "borrowerModel" && s?.op === "not_in"
          && Array.isArray(s.allowed) && s.allowed.includes("operating");
        return c || inheritedFromPartitionKey(g, i);
      } },
  ];

  for (const arm of arms) {
    let stillBlocked = 0, freed = 0;
    const freedBy = new Map<string, number>();
    for (const r of rows) {
      const t = keyed.get(`${r.name}::${r.instrument}`);
      const inst = byId.get(r.instrument);
      if (!t || !inst) continue;
      const f = founderIntake(t as never, policy);
      const trimmed = { ...inst, gates: inst.gates.filter((g) => !arm.drop(g, inst)) };
      const a = assessInstrument(trimmed, f.eligibility as never);
      if (a.status === "blocked") { stillBlocked++; continue; }
      freed++;
      const k = r.blockers.map((b: any) => b.field).join("+");
      freedBy.set(k, (freedBy.get(k) ?? 0) + 1);
    }
    console.log(`${arm.name.padEnd(64)} blocked=${String(stillBlocked).padStart(3)}  `
      + `freed=${String(freed).padStart(3)}  (+${((freed / 820) * 100).toFixed(1)} pts of 820)`
      + (freedBy.size ? `  ${[...freedBy].map(([k, v]) => `${k}:${v}`).join(" ")}` : ""));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
