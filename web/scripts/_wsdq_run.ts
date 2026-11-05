// wsDQ — ONE COMPANY, ONE ARM, END TO END, EVERY STEP WRITTEN DOWN.
//
// ── What the owner asked for, and what this therefore has to emit ─────────
//   "try running it now and set the test up so that we can see every step
//    transparently and learn directly from the tests run. We don't just want a
//    yes it worked or no it didn't -- we want a direct auditable run where we
//    can derive learnings."
//
// So the deliverable is not a number. Per company per arm this writes:
//
//   run_<arm>.json   the whole record, machine-readable
//   memo_<arm>.md    the brief a founder would read, rendered
//   prompt_<arm>_r<n>.txt   the selector's prompt VERBATIM, system and user,
//                    uncut. A truncated prompt is a reconstruction, and this
//                    repo has twice graded a reconstruction of a prompt.
//   reply_<arm>_r<n>.txt    what came back, verbatim, thinking included.
//
// ── The control, stated rather than assumed ──────────────────────────────
// The founder is read from `founder.json` and handed to `runIntelligence`
// unchanged, so the intake, the adaptive round and the profile signal are
// byte-identical across arms. What is NOT frozen is the comparable-company web
// search inside `runIntelligence`: it is live, it is not reproducible, and its
// output unions into `fieldChannels`, which is tier 1 of the row sort. It can
// therefore move the pool for reasons that have nothing to do with the arm.
// That is why the seam trace records the pool on BOTH arms -- `_wsdq_diff.ts`
// checks the two pools are the same SET before it attributes any difference to
// the model, and says so loudly when they are not.
//
// ── The cost, measured and not estimated ─────────────────────────────────
// `withCostTracking` wraps the whole run, so every call the pipeline makes
// through `recordUsage` -- research, the adaptive judge, the selector, the
// writer -- is counted from the usage the API actually reported.
//
//   COMPANY="Cisteo MEDICAL" AGENT_SELECT=off     npx tsx scripts/_wsdq_run.ts
//   COMPANY="Cisteo MEDICAL" AGENT_SELECT=adviser npx tsx scripts/_wsdq_run.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsdq_run", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

import {
  AGENT_SELECT_ARM, agentSelectLastDecision, agentSelectLastTrace, agentSelectTallyLine,
  resetAgentSelectTally, setAgentSelectTracing, SELECT_COUNT, SELECT_DEPTH, THINK_EFFORT,
  LOOKUP_MAX,
} from "../lib/intelligence/agentSelect";
import { withCostTracking } from "../lib/intelligence/cost";
import { corpusProvenance, hydrateDbInstruments, requireLiveCorpus } from "../lib/intelligence/corpus";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { VERDICT_POOL } from "../lib/intelligence/shortlist";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { OUT_ROOT, slugOf } from "./_wsdq_paths";

interface Frozen {
  request: Record<string, unknown>;
  provenance: Record<string, unknown>;
}

/** The brief, as prose a human reads rather than as JSON. The point of
 *  rendering it is that the owner asked to READ the memo both ways; a table of
 *  fields is not the thing a founder is handed. */
function renderMemo(r: Record<string, unknown>, arm: string, company: string): string {
  const inst = (r.institutions as Record<string, unknown>[]) ?? [];
  const L: string[] = [];
  L.push(`# ${company} — the brief, arm=${arm}`);
  L.push("");
  L.push(`_generated ${String(r.generatedAt ?? "")}_`);
  L.push("");
  L.push("## Bottom line");
  for (const b of (r.bottomLine as string[]) ?? []) L.push(`- ${b}`);
  L.push("");
  L.push(`## Where the money is (${inst.length} row${inst.length === 1 ? "" : "s"})`);
  inst.forEach((i, n) => {
    L.push("");
    L.push(`### ${n + 1}. ${i.institution}`);
    const bits = [i.supportType, i.country, i.ticket, i.schemeCode].filter(Boolean);
    L.push(`_${bits.join(" · ")}_`);
    if (i.typicalAward) L.push(`- typical award: ${i.typicalAward} over ${i.typicalAwardN ?? "?"} awards`);
    if (i.descriptor) L.push(`- what it is: ${i.descriptor}`);
    if (i.verdict) L.push(`- verdict: ${i.verdict}`);
    if (i.blocker) L.push(`- blocker: ${i.blocker}`);
    if (i.whyEasy) L.push(`- why easy: ${i.whyEasy}`);
    if (i.note) L.push(`- note: ${i.note}`);
    if (i.nextStep) L.push(`- next step: ${i.nextStep}`);
    if (i.stale) L.push(`- STALE: ${i.stale}`);
    const cf = (i.comparableFirms as { name: string; amount: string }[]) ?? [];
    if (cf.length) L.push(`- comparables: ${cf.map((c) => `${c.name} (${c.amount})`).join(", ")}`);
  });
  L.push("");
  L.push("## Positioning");
  L.push(String(r.positioning ?? ""));
  L.push("");
  L.push("## State of play");
  L.push(String(r.stateOfPlay ?? ""));
  L.push("");
  L.push("## Caveats");
  L.push(String(r.caveats ?? ""));
  if (r.withheld) { L.push(""); L.push("## Withheld"); L.push(String(r.withheld)); }
  if (r.noDoors) { L.push(""); L.push("## No doors"); L.push(JSON.stringify(r.noDoors, null, 1)); }
  return L.join("\n");
}

async function main() {
  const want = process.env.COMPANY ?? "";
  if (!want) throw new Error("COMPANY= is required");
  const dir = path.join(OUT_ROOT, slugOf(want));
  const file = path.join(dir, "founder.json");
  if (!existsSync(file)) {
    throw new Error(`no frozen founder at ${file} — run _wsdq_founder.ts first. ` +
      `Both arms must read the SAME file or the comparison is not controlled.`);
  }
  const frozen = JSON.parse(readFileSync(file, "utf8")) as Frozen;
  const company = String(frozen.request.company);
  const arm = AGENT_SELECT_ARM;

  // Dynamic, and not a style choice: `pipeline.ts` builds its Anthropic client
  // at module scope and a static import would run it before `loadEnvLocal()`.
  // See the note in _wsdq_founder.ts.
  const { runIntelligence } = await import("../lib/intelligence/pipeline");

  await hydrateDbInstruments();
  requireLiveCorpus("wsdq_run");
  resetRankerTally();
  resetAgentSelectTally();
  // Everything below this line is recorded. Nothing above it can be.
  setAgentSelectTracing(true);

  const events: { type: string; step?: string; detail?: string; message?: string }[] = [];
  let report: Record<string, unknown> | null = null;
  let failure: string | null = null;
  const t0 = Date.now();
  const { eur, calls } = await withCostTracking(async () => {
    try {
      await runIntelligence(frozen.request as never, (e: Record<string, unknown>) => {
        if (e.type === "report") report = e.data as Record<string, unknown>;
        else events.push({
          type: String(e.type), step: e.step as string,
          detail: e.detail as string, message: e.message as string,
        });
        if (e.type === "error") failure = String(e.message ?? "unknown error");
      });
    } catch (err) {
      failure = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    }
  });
  const secs = Math.round((Date.now() - t0) / 1000);
  const trace = agentSelectLastTrace();
  const decision = agentSelectLastDecision();

  mkdirSync(dir, { recursive: true });
  // The prompts and replies as their own files. They run to tens of thousands
  // of characters and the owner asked for them verbatim: "If it is 20k
  // characters, write 20k characters."
  for (const turn of trace?.turns ?? []) {
    writeFileSync(path.join(dir, `prompt_${arm}_r${turn.round}.txt`),
      `SYSTEM (${turn.system.length} chars)\n${"=".repeat(78)}\n${turn.system}\n\n` +
      `USER (${turn.user.length} chars)\n${"=".repeat(78)}\n${turn.user}\n`);
    writeFileSync(path.join(dir, `reply_${arm}_r${turn.round}.txt`),
      `model=${turn.model}  EUR ${turn.eur.toFixed(4)}  usage=${JSON.stringify(turn.usage)}\n\n` +
      `THINKING (${turn.thinking.length} chars)\n${"=".repeat(78)}\n${turn.thinking || "(none — thinking was disabled for this arm)"}\n\n` +
      `REPLY (${turn.reply.length} chars)\n${"=".repeat(78)}\n${turn.reply}\n`);
  }

  const record = {
    company, arm, secs, failure,
    levers: {
      AGENT_SELECT: arm, depth: SELECT_DEPTH, count: SELECT_COUNT,
      effort: THINK_EFFORT, lookups: LOOKUP_MAX, verdictPool: VERDICT_POOL,
      publishedCap: BRIEF_LIMITS.institutionsMax,
      model: process.env.AGENT_SELECT_MODEL ?? "claude-sonnet-5",
    },
    corpus: corpusProvenance(),
    rankerLine: rankerTallyLine(),
    armLine: agentSelectTallyLine(),
    cost: { eur, calls },
    frozenProvenance: frozen.provenance,
    request: frozen.request,
    trace, decision,
    statusEvents: events,
    report,
  };
  writeFileSync(path.join(dir, `run_${arm}.json`), JSON.stringify(record, null, 1));
  if (report) {
    writeFileSync(path.join(dir, `memo_${arm}.md`), renderMemo(report, arm, company));
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`${company}  arm=${arm}  ${secs}s`);
  console.log(rankerTallyLine());
  console.log(agentSelectTallyLine());
  console.log(`levers: depth=${SELECT_DEPTH} count=${SELECT_COUNT} effort=${THINK_EFFORT} ` +
    `lookups=${LOOKUP_MAX} pool=${VERDICT_POOL} published_cap=${BRIEF_LIMITS.institutionsMax}`);
  console.log(`cost: EUR ${eur.toFixed(4)} over ${calls} tracked call(s)`);
  if (failure) console.log(`FAILURE: ${failure}`);
  if (trace?.fellBack) console.log(`██ THE ARM FELL BACK: ${trace.fellBack}`);
  console.log(`seam: pool ${trace?.poolIn.length ?? 0} in, menu ${trace?.menu.length ?? 0}, ` +
    `picks [${(trace?.picks ?? []).join(", ")}], unsure [${(trace?.unsure ?? []).join(", ")}], ` +
    `${trace?.retrieved.length ?? 0} retrieved chunk(s)`);
  console.log(`published: ${((report as unknown as Record<string, unknown>)?.institutions as
    { institution: string }[] ?? []).map((i) => i.institution).join(" | ") || "(none)"}`);
  console.log(`wrote ${dir}/run_${arm}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
