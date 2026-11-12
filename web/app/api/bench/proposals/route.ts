// LOCAL-ONLY (lib/bench/guard.ts). The accept step for what the interviewer
// proposes: GET ?path= returns the file as it is now (to diff against); POST
// writes the accepted version. Only mandate/playbooks/*.md and
// mandate/eval/scenarios/*.yaml (model.PROPOSAL_PATH_RE). Never committed here.
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { readRepoFile, repoPath, writeRepoFile } from "@/lib/bench/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  const abs = repoPath(rel, "proposal");
  if (!abs) return fail("the app may only write playbooks and eval scenarios");
  return json({ path: rel, current: readRepoFile(abs) });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req, 400_000);
  if (!body || typeof body.path !== "string" || typeof body.content !== "string") return fail("path and content required");
  const abs = repoPath(body.path, "proposal");
  if (!abs) return fail("the app may only write playbooks and eval scenarios");
  if (!body.content.trim()) return fail("the proposed file is empty");
  const existed = readRepoFile(abs) !== null;
  writeRepoFile(abs, body.content.endsWith("\n") ? body.content : `${body.content}\n`);
  return json({ path: body.path, created: !existed });
}
