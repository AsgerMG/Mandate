// LOCAL-ONLY (lib/bench/guard.ts). The saved bench runs (mandate/eval/runs/
// bench/*.md, in the repo). GET lists them with their grade (or one, ?file=);
// POST writes the owner's grade into the run's grading block. Not committed:
// the owner commits.
import { readdirSync } from "node:fs";
import path from "node:path";
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { parseGrade, RUN_FILE_RE, runBrain, writeGrade, type RunSummary } from "@/lib/bench/model";
import { BENCH_RUNS_DIR, nowIso, readRepoFile, repoPath, repoRoot, writeRepoFile } from "@/lib/bench/store";

export const dynamic = "force-dynamic";

function summary(file: string, md: string): RunSummary {
  const g = parseGrade(md);
  return {
    file, date: file.slice(0, 10), case: file.slice(11, -3), brain: runBrain(md, file),
    title: md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? file, grade: g.grade, graded_at: g.graded_at,
  };
}

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const file = new URL(req.url).searchParams.get("file");
  if (file !== null) {
    const abs = repoPath(file, "run");
    const md = abs && readRepoFile(abs);
    if (!md) return fail("no such run", 404);
    return json({ run: summary(file, md), markdown: md, grade: parseGrade(md) });
  }
  let files: string[] = [];
  try { files = readdirSync(path.join(repoRoot(), BENCH_RUNS_DIR)).filter((f) => RUN_FILE_RE.test(f)); } catch { /* none yet */ }
  const runs = files.map((f) => summary(f, readRepoFile(repoPath(f, "run")!) ?? "")).sort((a, b) => b.file.localeCompare(a.file));
  return json({ runs });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req, 60_000);
  if (!body || typeof body.file !== "string") return fail("file required");
  const abs = repoPath(body.file, "run");
  const md = abs && readRepoFile(abs);
  if (!abs || !md) return fail("no such run", 404);
  const grade = body.grade;
  if (typeof grade !== "number" || !Number.isInteger(grade) || grade < 1 || grade > 5) return fail("grade must be 1 to 5");
  const off = typeof body.off === "string" ? body.off : "";
  const rewrite = typeof body.rewrite === "string" ? body.rewrite : "";
  if (off.length > 20_000 || rewrite.length > 20_000) return fail("text too long");
  const next = writeGrade(md, { grade, off, rewrite }, nowIso());
  writeRepoFile(abs, next);
  return json({ run: summary(body.file, next), grade: parseGrade(next), path: path.join(BENCH_RUNS_DIR, body.file) });
}
