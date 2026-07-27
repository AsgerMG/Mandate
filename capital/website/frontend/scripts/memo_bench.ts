/**
 * Run REAL companies — one per next-generation archetype — through the actual
 * memo pipeline, and dump each brief for quality review.
 *
 * This is an OUTPUT-QUALITY harness, not a unit test. check_archetypes.ts
 * asserts the machinery behaves; this reads what a founder would actually be
 * handed and asks whether it is any good.
 *
 * Calls runIntelligence() directly rather than POSTing to /api/intelligence:
 * the route rate-limits at 5 per hour per IP, which a 12-company sweep would
 * trip immediately. Same pipeline, same prompts, same model calls — and, since
 * 2026-07-27, the same sanitiser, because skipping it made this harness test a
 * path no founder can take. sanitize.ts had gone stale after the vocabulary
 * split and was silently dropping `sector` and every `activities` value on
 * every live request, while twelve green bench runs reported nothing wrong.
 *
 * COSTS REAL MONEY — each company is a full research + synthesis run.
 *
 * Runs a SMALL ROTATING SAMPLE by default (2 companies), not the whole set.
 * Each run picks the ones least recently tested and records the timestamp in
 * memo-bench/history.json, so repeated runs cover everything over time while
 * keeping any single batch cheap. A full 12-company sweep is real money.
 *
 * Run: npx tsx scripts/memo_bench.ts                    # 2 least-recently-tested
 *      npx tsx scripts/memo_bench.ts --sample 4
 *      npx tsx scripts/memo_bench.ts --only "Robotics,MedTech"
 *      npx tsx scripts/memo_bench.ts --all              # everything, costs the most
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}


const words = (s: unknown) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;

/**
 * The brief's documented shape (types.ts IntelligenceReport): bottomLine
 * bullets, UP TO five institutions, one positioning paragraph, one
 * stateOfPlay paragraph, caveats — with the three prose parts inside a ~700
 * word budget. Asserted on every bench run: quality regressions here are
 * invisible to the deterministic checks and only show up by measuring output.
 */
function checkMemoShape(r: Record<string, unknown>): string[] {
  const out: string[] = [];
  const bl = (r.bottomLine as string[]) ?? [];
  if (bl.length < 4 || bl.length > 5) out.push(`bottomLine ${bl.length} bullets (want 4-5)`);
  const longest = Math.max(0, ...bl.map(words));
  if (longest > 25) out.push(`longest bullet ${longest}w (want <=25)`);
  const nInst = ((r.institutions as unknown[]) ?? []).length;
  // Max 5, min 2. Fewer than 2 is only defensible for a business the law
  // excludes from most aid, so it is flagged for a human to judge, not failed.
  if (nInst > 5) out.push(`institutions ${nInst} (max 5)`);
  // Fewer than two is allowed: the brief ships what is real rather than
  // padding to a minimum with routes the founder cannot act on. Only an empty
  // table is a failure.
  else if (nInst === 0) out.push("institutions 0 (empty table)");
  const body = words(bl.join(" ")) + words(r.positioning) + words(r.stateOfPlay);
  if (body > 700) out.push(`body ${body}w (want <=700)`);
  if (!String(r.caveats ?? "").trim()) out.push("caveats missing");
  for (const [k, cap] of [["positioning", 130], ["stateOfPlay", 130]] as [string, number][]) {
    const n = words((r as Record<string, unknown>)[k]);
    if (n > cap * 1.15) out.push(`${k} ${n}w (want <=${cap})`);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.indexOf("--only");
  const only = onlyArg !== -1 ? args[onlyArg + 1].split(",").map((s) => s.trim()) : null;
  const concArg = args.indexOf("--concurrency");
  const concurrency = concArg !== -1 ? Number(args[concArg + 1]) : 3;

  const { hydrateDbInstruments } = await import("../lib/intelligence/corpus");
  const { runIntelligence } = await import("../lib/intelligence/pipeline");
  await hydrateDbInstruments();

  const sampleArg = args.indexOf("--sample");
  const sample = sampleArg !== -1 ? Number(args[sampleArg + 1]) : 2;
  const all = args.includes("--all");

  // Least-recently-tested first, so successive small runs sweep the set.
  const HISTORY = "memo-bench/history.json";
  const history: Record<string, number> = existsSync(HISTORY)
    ? JSON.parse(readFileSync(HISTORY, "utf8"))
    : {};
  let targets = COMPANIES.filter((c) => !only || only.includes(c.archetype));
  if (!only && !all) {
    targets = [...targets]
      .sort((a, b) => (history[a.archetype] ?? 0) - (history[b.archetype] ?? 0))
      .slice(0, sample);
  }
  const untested = COMPANIES.filter((c) => !history[c.archetype]).length;
  console.log(`${untested} of ${COMPANIES.length} archetypes never tested\n`);
  mkdirSync("memo-bench", { recursive: true });
  console.log(`running ${targets.length} companies, concurrency ${concurrency}\n`);

  // Stamp every result with the code that produced it. Without this the
  // scoreboard silently mixes versions: three defects sat on the board that
  // had all been fixed, they were just measured on older runs, which reads as
  // "still broken" and sends you fixing it twice.
  let code = "unknown";
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain -- ../../website ../../ETL", { encoding: "utf8" }).trim();
    code = dirty ? `${sha}+dirty` : sha;
  } catch { /* not a git checkout — leave it unknown */ }
  console.log(`code ${code}\n`);

  const results: Record<string, unknown>[] = [];
  const queue = [...targets];
  const workers = Array.from({ length: concurrency }, async () => {
    for (;;) {
      const c = queue.shift();
      if (!c) return;
      const t0 = Date.now();
      const { archetype, company, country, description } = c;
      // Read straight off the typed BenchCompany. The previous
      // `rest as Record<string, string>` casts silently accepted any field
      // name, so a rename in __benchCompanies.ts would have produced undefined
      // answers rather than a compile error — the same
      // vocabulary-drift-with-no-alarm fault this refactor exists to remove.
      const rawEligibility = {
        sector: c.sector,
        activities: c.activities ?? ["none"],
        useOfFunds: ["experimental_development", "industrial_research"],
        entityCountries: [country],
        exclusionFlags: ["none"],
        cofinancingBand: ">50%",
        consortium: "unsure",
        borrowerModel: c.borrowerModel ?? "operating",
        fteBand: c.fteBand,
        ticketBand: c.ticketBand,
        developmentStage: c.developmentStage,
      };
      // Through the SAME sanitiser the API route uses. Calling runIntelligence
      // with raw answers made this harness test a path no founder can take:
      // sanitize.ts silently dropped `sector` (stale vocabulary) and every
      // `activities` value, and twelve green bench runs said nothing was
      // wrong. If the sanitiser rejects something the bench sets, that IS the
      // bug and it should show up here as a worse brief.
      const eligibility = sanitizeEligibility(rawEligibility);
      for (const k of Object.keys(rawEligibility)) {
        if ((eligibility as Record<string, unknown> | undefined)?.[k] === undefined) {
          console.warn(`  [%s] sanitiser dropped "%s" — the live route would too`,
            archetype, k);
        }
      }
      let report: Record<string, unknown> | null = null;
      let error: string | null = null;
      try {
        await runIntelligence(
          { company, country, description, capitalSought: ["grant", "loan"], eligibility } as never,
          (e: { type: string; data?: unknown; message?: string }) => {
            if (e.type === "report") report = e.data as Record<string, unknown>;
            if (e.type === "error") error = e.message ?? "unknown error";
          },
        );
      } catch (err) {
        // Keep the stack. bunq failed four times in four different ways and a
        // bare String(err) sent the last debugging pass after the writer when
        // the failure had moved to another stage entirely.
        error = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      }
      const secs = Math.round((Date.now() - t0) / 1000);
      const shape = report ? checkMemoShape(report) : ["no report"];
      results.push({ archetype, company, country, secs, error, shape, report, code,
        capitalSought: ["grant", "loan"] });
      console.log(
        `  ${archetype.padEnd(28)} ${company.padEnd(18)} ${secs}s ` +
        (error ? "ERROR: " + error.split("\n")[0] : shape.length ? "SHAPE: " + shape.join("; ") : "ok"),
      );
    }
  });
  await Promise.all(workers);

  const stamp = Date.now();
  for (const r of results) if (!r.error) history[r.archetype as string] = stamp;
  writeFileSync(HISTORY, JSON.stringify(history, null, 1));
  writeFileSync(`memo-bench/run-${stamp}.json`, JSON.stringify(results, null, 1));
  const remaining = COMPANIES.filter((c) => !history[c.archetype]).map((c) => c.archetype);
  console.log(`\nwrote memo-bench/run-${stamp}.json`);
  console.log(remaining.length ? `still untested: ${remaining.join(", ")}` : "every archetype has been tested");
}

main();
