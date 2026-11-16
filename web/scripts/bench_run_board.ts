/**
 * The case board of a saved eval run, checked against what CASE_BOARD.md
 * requires from the options stage onward.
 *
 *   npx tsx scripts/bench_run_board.ts <run.md> [<run.md> ...] [--json]
 *
 * Reads each loop transcript (mandate/eval/runs/loop/<tag>/<case>.md), folds
 * its mandate-board blocks with the app's own reader (lib/bench/board.ts, so
 * the check and the Board tab cannot disagree), and prints one row per run:
 * board valid, required sections present / missing, process maps, leverage
 * items, and whether the `illustrative` flag is honest (a map whose steps are
 * mostly uncited, labelled judgement, must say illustrative: true).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { boardBlocks, foldBoard, splitCite, type Board } from "../lib/bench/board";

type Row = {
  run: string;
  blocks: number;
  json_ok: boolean;
  warnings: number;
  stage: string | null;
  valid: boolean;
  present: string[];
  missing: string[];
  detail: Record<string, number | boolean | string>;
  maps: number;
  leverage: number;
  illustrative_honest: boolean | null;
  notes: string[];
};

function check(path: string): Row {
  const text = readFileSync(path, "utf8");
  // the agent's answer only: the quoted case above it carries no blocks, but cut it anyway
  const at = text.search(/^## \w+'s answer\s*$/m);
  const answer = at >= 0 ? text.slice(at) : text;
  const raw = boardBlocks(answer);
  const f = foldBoard([{ role: "agent", text: answer }]);
  const b: Board = f.board;
  const notes: string[] = [];
  const jsonBad = f.warnings.filter((w) => /not valid JSON/.test(w)).length;

  const doors = (b.routes?.levels ?? []).flatMap((l) => l.doors);
  const main = doors.filter((d) => d.status === "open" || d.status === "probe");
  const closed = doors.filter((d) => d.status === "shut" || d.status === "park");
  const roles = (b.stakeholders?.institutions ?? []).flatMap((i) => i.units.flatMap((u) => u.roles));
  const instWithP1P2 = (b.stakeholders?.institutions ?? []).filter((i) => {
    const r = i.units.flatMap((u) => u.roles);
    return r.some((x) => x.priority === "P1") && r.some((x) => x.priority === "P2");
  });
  const tracks = b.roadmap?.tracks ?? [];
  const watch = tracks.find((t) => t.id === "watch" || /watch/i.test(t.label));
  const steps = tracks.flatMap((t) => t.steps);
  const blocked = steps.filter((s) => s.status === "blocked");
  const instruments = b.funding_stack?.instruments ?? [];
  const risks = b.risks_flags ?? [];
  const maps = b.process_maps ?? [];

  const req: Record<string, boolean> = {
    routes: doors.length > 0,
    "routes:shut_or_parked": closed.length > 0,
    stakeholders: roles.length > 0,
    "stakeholders:P1+P2": instWithP1P2.length > 0,
    roadmap: steps.length > 0,
    "roadmap:watch": !!watch && watch.steps.length > 0,
    "roadmap:not_yet(blocked)": blocked.length > 0,
    funding_stack: instruments.length > 0,
    risks_flags: risks.length > 0,
  };
  if (main.length && instWithP1P2.length < Math.min(main.length, 2)) notes.push(`P1+P2 on ${instWithP1P2.length} institution(s) for ${main.length} open/probe route(s)`);

  // illustrative honesty: a map whose steps mostly carry no c/w citation must be flagged
  let honest: boolean | null = maps.length ? true : null;
  for (const m of maps) {
    const sourced = m.steps.filter((s) => splitCite(s.cite).ids.length > 0).length;
    const mostlyPattern = sourced < m.steps.length / 2;
    if (mostlyPattern && !m.illustrative) { honest = false; notes.push(`map ${m.id}: ${sourced}/${m.steps.length} steps cited, not flagged illustrative`); }
    if (!mostlyPattern && m.illustrative) notes.push(`map ${m.id}: flagged illustrative with ${sourced}/${m.steps.length} steps cited (over-cautious)`);
  }
  if (f.warnings.length) notes.push(...f.warnings.slice(0, 5));

  const present = Object.entries(req).filter(([, v]) => v).map(([k]) => k);
  const missing = Object.entries(req).filter(([, v]) => !v).map(([k]) => k);
  return {
    run: basename(path, ".md"),
    blocks: raw.length,
    json_ok: raw.length > 0 && jsonBad === 0,
    warnings: f.warnings.length,
    stage: b.stage ?? null,
    valid: raw.length > 0 && jsonBad === 0 && f.blocks > 0,
    present,
    missing,
    detail: {
      doors: doors.length, open_probe: main.length, shut_park: closed.length, institutions: b.stakeholders?.institutions.length ?? 0,
      roles: roles.length, inst_P1P2: instWithP1P2.length, tracks: tracks.length, watch_items: watch?.steps.length ?? 0,
      instruments: instruments.length, risks: risks.length, deal_breakers: risks.filter((r) => r.kind === "deal_breaker").length,
      answer: !!b.answer,
    },
    maps: maps.length,
    leverage: maps.reduce((n, m) => n + m.leverage.length, 0),
    illustrative_honest: honest,
    notes,
  };
}

const args = process.argv.slice(2);
const rows = args.filter((a) => !a.startsWith("--")).map(check);
if (args.includes("--json")) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) {
  console.log(`${r.run}: valid=${r.valid} blocks=${r.blocks} warnings=${r.warnings} stage=${r.stage} maps=${r.maps} leverage=${r.leverage} illustrative_honest=${r.illustrative_honest}`);
  console.log(`  missing: ${r.missing.join(", ") || "none"}`);
  console.log(`  ${JSON.stringify(r.detail)}`);
  for (const n of r.notes) console.log(`  - ${n}`);
}
