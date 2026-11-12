// LOCAL-ONLY (lib/bench/guard.ts). The accept step for what the interviewer
// proposes: GET ?path= returns the file as it is now (to diff against); POST
// writes the accepted version. Only mandate/playbooks/*.md and
// mandate/eval/scenarios/*.yaml (model.PROPOSAL_PATH_RE). Never committed here.
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { isId } from "@/lib/bench/model";
import { appendFeedback, nowIso, readFeedback, readRepoFile, repoPath, writeRepoFile } from "@/lib/bench/store";

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
  const addresses = body.addresses ?? [];
  if (!Array.isArray(addresses) || addresses.length > 60 || !addresses.every(isId)) return fail("addresses must be feedback ids");
  const from = body.conversationId;
  if (from !== undefined && from !== null && !isId(from)) return fail("bad conversationId");
  const existed = readRepoFile(abs) !== null;
  writeRepoFile(abs, body.content.endsWith("\n") ? body.content : `${body.content}\n`);
  // The feedback this change answers is resolved, with the change it produced:
  // the items the block names, and the interview it was distilled from.
  const resolved: string[] = [];
  const at = nowIso();
  for (const it of readFeedback()) {
    if (it.status !== "open") continue;
    const named = (addresses as string[]).includes(it.id);
    const ownInterview = !!from && it.kind === "interview" && it.conversation_id === from;
    if (!named && !ownInterview) continue;
    appendFeedback({ type: "status", id: it.id, status: "resolved", at, by: "accepted", paths: [body.path], ...(from ? { conversation_id: from as string } : {}) });
    resolved.push(it.id);
  }
  return json({ path: body.path, created: !existed, resolved });
}
