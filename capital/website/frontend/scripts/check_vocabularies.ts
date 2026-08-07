/**
 * Does every answer a founder can give correspond to something in the data?
 *
 * FREE — reads the instrument corpus and the intake option lists, no model
 * calls, no spend.
 *
 * ── The structural fault this exists to stop ──────────────────────────────
 * Intake vocabularies were invented ALONGSIDE the data rather than derived
 * FROM it, so the two drifted and nothing noticed:
 *
 *   * CAPITAL_OPTIONS offers "Recoverable advances" and "Tax credits &
 *     reliefs". No instrument in the corpus carries those capital types, so
 *     picking one matches nothing, and the graded fallback in
 *     selectLeafInstruments then relaxes capital type entirely — the founder's
 *     answer is silently discarded and they get a table of whatever was left.
 *   * SECTOR_OPTIONS says `health_lifesciences`. The corpus says
 *     `health_life_sciences`. Same concept, different string, no join.
 *   * SECTOR_OPTIONS has `financial_services` and `excluded_activities`, which
 *     are not sectors in the corpus at all; the corpus has
 *     `industrial_manufacturing`, `semiconductors_electronics`,
 *     `mobility_transport`, `space`, `materials_chemicals` and
 *     `defense_security`, which a founder cannot pick.
 *
 * None of this shows up as an error. It shows up as a slightly worse brief,
 * which is exactly why it survived so long. A failing check is the only thing
 * that keeps the two vocabularies married, so this runs alongside
 * check_archetypes.ts and is meant to stay at zero.
 */
import { readFileSync } from "node:fs";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("check_vocabularies", ["DATABASE_URL", "VOYAGE_KEY"]);
// NO_PG=1 scores the local JSON snapshot instead of live Postgres. Without it
// this check reads production, which lags the local DB until a publish — and
// then reports fixes as still broken.

interface Problem { axis: string; detail: string; }

async function main() {
  const { hydrateDbInstruments, loadDbInstruments } = await import("../lib/intelligence/corpus");
  const { SECTOR_OPTIONS, CAPITAL_OPTIONS, TICKET_BANDS } =
    await import("../lib/intelligence/types");
  const { VOCABULARY } = await import("../lib/intelligence/vocabulary");
  await hydrateDbInstruments();
  const instruments = loadDbInstruments();
  const problems: Problem[] = [];

  // ── The ETL's copy must BE this copy ────────────────────────────────────
  // encode_gates.py reads data/vocabularies.json rather than restating the
  // vocabulary, so the only way it can drift is if that file goes stale after
  // a change to types.ts. Regenerating and comparing closes the last gap:
  // without this the projection is just a fourth place to forget.
  const { build, OUT } = await import("./emit_vocabulary");
  const expected = build();
  let onDisk = "";
  try { onDisk = readFileSync(OUT, "utf8"); } catch { /* missing */ }
  if (onDisk !== expected) {
    problems.push({
      axis: "etl projection",
      detail: onDisk
        ? "data/vocabularies.json is STALE — the ETL encoder is working from an " +
          "older vocabulary than the product. Run: npx tsx scripts/emit_vocabulary.ts"
        : "data/vocabularies.json is missing — the ETL encoder cannot start. " +
          "Run: npx tsx scripts/emit_vocabulary.ts",
    });
  }

  // ── The sanitiser must accept exactly what the form offers ──────────────
  // sanitize.ts is the only thing standing between a real request and the
  // pipeline, and it silently DROPS any value it does not recognise. It held a
  // hand-copy of the sector list that went stale on the vocabulary split, so
  // every live request lost its sector while the bench, which bypasses the
  // route, saw nothing wrong. Derived now, and checked here so it stays that way.
  const { sanitizeEligibility } = await import("../lib/intelligence/sanitize");
  for (const [field, vocab] of Object.entries(VOCABULARY)) {
    if (!vocab.values.length) continue;
    for (const value of vocab.values) {
      const probe = vocab.multi ? { [field]: [value] } : { [field]: value };
      // sanitizeEligibility returns undefined when NOTHING survives, which is
      // itself the failure being tested for — so it must be handled, not
      // dereferenced. A guard that throws instead of reporting is a guard that
      // gets commented out.
      const out = (sanitizeEligibility(probe) ?? {}) as Record<string, unknown>;
      const kept = vocab.multi
        ? Array.isArray(out[field]) && (out[field] as string[]).includes(value)
        : out[field] === value;
      if (!kept) {
        problems.push({
          axis: "sanitiser",
          detail: `"${value}" is offered for ${field} but sanitizeEligibility drops it — ` +
            `a founder choosing it has their answer discarded before anything can use it`,
        });
      }
    }
  }

  // ── Capital: every option must reach at least one instrument ─────────────
  // Imported, never copied. A local mirror of the mapping was the first thing
  // this script got wrong: it went stale the moment the real one was fixed and
  // reported two failures that no longer existed. Duplicating a vocabulary to
  // check a vocabulary is the exact fault being checked for.
  const { CAPITAL_SOUGHT_TO_DB: CAPITAL_MAP } = await import("../lib/intelligence/shortlist");
  const dbCapital = new Set(instruments.map((i) => i.capitalType).filter(Boolean));
  for (const opt of CAPITAL_OPTIONS as readonly { value: string; label: string }[]) {
    const targets = CAPITAL_MAP[opt.value];
    if (!targets) {
      problems.push({ axis: "capital", detail: `"${opt.value}" has no entry in CAPITAL_SOUGHT_TO_DB` });
      continue;
    }
    const reachable = targets.filter((t) => dbCapital.has(t));
    if (!reachable.length) {
      problems.push({
        axis: "capital",
        detail: `"${opt.value}" (${opt.label}) maps to [${targets.join(", ")}], none of which exist in the corpus — ` +
          `picking it matches nothing and the answer is silently discarded`,
      });
    }
  }
  const unreachableCapital = [...dbCapital].filter(
    (c) => c !== "framework" && c !== "unknown" &&
      !Object.values(CAPITAL_MAP).some((t) => t.includes(c as string)));
  for (const c of unreachableCapital) {
    problems.push({ axis: "capital", detail: `corpus capital type "${c}" is reachable by no intake option` });
  }

  // ── Sector: the intake vocabulary must be the corpus vocabulary ──────────
  // Read from the instrument corpus's own company taxonomy via a sample of
  // sectorTop values the pipeline actually routes on (see topicsFor).
  const CORPUS_SECTORS = [
    "health_life_sciences", "energy_cleantech", "mobility_transport",
    "industrial_manufacturing", "semiconductors_electronics", "software_data_ai",
    "space", "defense_security", "agrifood", "materials_chemicals", "other",
  ];
  const intakeSectors = (SECTOR_OPTIONS as readonly { value: string }[]).map((s) => s.value);
  for (const s of intakeSectors) {
    if (!CORPUS_SECTORS.includes(s)) {
      const near = CORPUS_SECTORS.find((c) => c.replace(/_/g, "") === s.replace(/_/g, ""));
      problems.push({
        axis: "sector",
        detail: near
          ? `intake "${s}" vs corpus "${near}" — same concept, different string, so they never join`
          : `intake "${s}" is not a corpus sector; nothing in the record is classified this way`,
      });
    }
  }
  for (const c of CORPUS_SECTORS) {
    if (c !== "other" && !intakeSectors.includes(c)) {
      problems.push({ axis: "sector", detail: `corpus sector "${c}" cannot be selected by a founder` });
    }
  }

  // ── Ticket bands: every band should have instruments near its midpoint ────
  const bandValues = (TICKET_BANDS as readonly { value: string }[]).map((b) => b.value);
  for (const b of bandValues) {
    if (!/^b|^gt|^lt/.test(b)) {
      problems.push({ axis: "ticket", detail: `band "${b}" does not follow the b*/gt*/lt* convention` });
    }
  }

  const byAxis = new Map<string, Problem[]>();
  for (const p of problems) byAxis.set(p.axis, [...(byAxis.get(p.axis) ?? []), p]);
  for (const [axis, ps] of byAxis) {
    console.log(`\n${axis.toUpperCase()}  (${ps.length})`);
    for (const p of ps) console.log(`  - ${p.detail}`);
  }
  console.log(
    problems.length
      ? `\n${problems.length} vocabulary mismatches — every one is an answer that cannot do its job`
      : "\nall intake vocabularies correspond to the data",
  );
  process.exitCode = problems.length ? 1 : 0;
}

main();
