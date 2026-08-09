// Is `openQuestionClass.generated.json` still about THIS corpus?
//
// ── What can go wrong, and why it is invisible ────────────────────────────
// A requirement the artifact has never seen is never asked about. That is the
// safe direction — a corpus that grows adds no questions until the classifier
// is re-run — but it is also completely silent: the product simply stops
// offering open questions on the newest funds, reads as "there was nothing
// worth asking", and nobody finds out. A rebuild path without a staleness
// check only fixes the drift nobody knew about.
//
// So this measures COVERAGE: of the requirements that are in scope for an open
// question, how many does the artifact have a judgement for? It is a RATCHET,
// in the shape `check_comparator_admits.ts` already uses — the uncovered count
// may fall, never rise. Re-run the emitter and lower the ceiling.
//
// ── What it reads ─────────────────────────────────────────────────────────
// The COMMITTED corpus snapshot, `public/data/instrument_terms.json`, and the
// committed artifact. No credentials, no network, no gitignored data, so this
// is reproducible by anyone on the same commit — which is the property a
// ratchet needs to mean anything.
//
//   npx tsx scripts/check_open_question_class.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MIN_SUBSTANTIVE_LEN, openQuestionClassStats, requirementClassOf,
} from "../lib/intelligence/openQuestions";

/** The artifact this check watches, named literally so the tie between the
 *  guard and the file it guards is visible from the source rather than
 *  inferable through two imports. `check_artifact_reachability.py` looks for
 *  exactly this. */
const WATCHES = "openQuestionClass.generated.json";

/** The uncovered requirement texts allowed today. IT MAY FALL, NEVER RISE.
 *  Raising it is not a fix; re-running the emitter is. */
const UNCOVERED_CEILING = 400;

interface SnapGate {
  requirement?: string; gate_role?: string; gateRole?: string;
  value_spec?: unknown; valueSpec?: unknown;
}
interface SnapInstrument { id?: string; gates?: SnapGate[] }

function main() {
  const file = path.join(process.cwd(), "public", "data", "instrument_terms.json");
  // `records`, not `instruments` — and reading the wrong key gives an empty
  // list, a 0/0 coverage figure and a clean-looking pass over nothing. That is
  // why the non-vacuity guard below exists and why it fires before any verdict.
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { records?: SnapInstrument[] };
  const instruments = parsed.records ?? [];

  const inScope = new Set<string>();
  const covered = new Set<string>();
  const byClass: Record<string, number> = {};
  let filters = 0;

  for (const inst of instruments) {
    for (const g of inst.gates ?? []) {
      const role = g.gate_role ?? g.gateRole;
      if (role && role !== "filter") continue;
      filters += 1;
      const spec = g.value_spec ?? g.valueSpec;
      const decidable = Boolean(spec && typeof spec === "object"
        && (spec as { op?: string }).op);
      if (decidable) continue;
      const req = (g.requirement ?? "").trim();
      if (req.length < MIN_SUBSTANTIVE_LEN) continue;
      inScope.add(req);
      const k = requirementClassOf(req);
      if (k) { covered.add(req); byClass[k] = (byClass[k] ?? 0) + 1; }
    }
  }

  const stats = openQuestionClassStats();
  console.log(`watching ${WATCHES}`);
  console.log(`snapshot: ${instruments.length} instruments, ${filters} filter gates`);
  console.log(`artifact: ${stats.classified}/${stats.candidates} classified by `
    + `${stats.model || "(unknown)"} at ${stats.generatedAt || "(unknown)"}`);
  console.log(`in scope for an open question: ${inScope.size} distinct texts`);
  console.log(`  covered by the artifact     : ${covered.size} `
    + `(${inScope.size ? (100 * covered.size / inScope.size).toFixed(1) : "0"}%)  ${JSON.stringify(byClass)}`);
  const uncovered = inScope.size - covered.size;
  console.log(`  UNCOVERED                   : ${uncovered} (ceiling ${UNCOVERED_CEILING})`);

  // NON-VACUITY. A snapshot that failed to parse into gates, or an artifact
  // that loaded as {}, would otherwise read as a clean pass over nothing —
  // which is the failure mode that once published a confident green over 0
  // instruments.
  if (!inScope.size) {
    console.error("\nFAIL — no requirement was in scope. Either the snapshot has no "
      + "gates or the scope test is broken; either way this check measured nothing.");
    process.exit(1);
  }
  if (!stats.classified) {
    console.error("\nFAIL — the artifact loaded with no classifications at all. "
      + "Every open question is silently off.");
    process.exit(1);
  }
  if (uncovered > UNCOVERED_CEILING) {
    console.error(`\nFAIL — ${uncovered} requirement texts have no judgement, above the `
      + `ceiling of ${UNCOVERED_CEILING}.\n`
      + `  Those requirements are silently never asked about. Re-run\n`
      + `  scripts/emit_open_question_class.ts and LOWER the ceiling; raising it\n`
      + `  is not a fix, it is a record that the drift was accepted.`);
    process.exit(1);
  }
  console.log(`\nPASS — the classification still covers the corpus within the ratchet.`);
}

main();
