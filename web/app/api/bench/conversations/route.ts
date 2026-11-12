// LOCAL-ONLY (lib/bench/guard.ts). The saved conversations (outside the repo:
// ~/Mandate-backups/bench/conversations). GET lists them (or one, ?id=);
// PATCH renames one or moves it into a mandate. Nothing is deleted here.
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { isId } from "@/lib/bench/model";
import { getConversation, getMandate, interviewGuides, listConversations, summarise, updateConversation } from "@/lib/bench/store";
import { isRunning } from "@/lib/bench/turns";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  if (id !== null) {
    if (!isId(id)) return fail("bad id");
    const c = getConversation(id);
    if (!c) return fail("no such conversation", 404);
    const running = isRunning(id);
    // A reply still marked unfinished with no turn running was cut off (a restart).
    const last = c.messages[c.messages.length - 1];
    if (!running && last?.role === "agent" && last.interrupted && !last.error && !last.text)
      last.error = "This reply was cut off (the app restarted). Retry to send the message again.";
    return json({ conversation: c, running });
  }
  const m = q.get("mandateId");
  if (m !== null && m !== "none" && !isId(m)) return fail("bad mandateId");
  const list = listConversations(m === null ? {} : { mandate_id: m === "none" ? null : m });
  return json({ conversations: list.map((c) => summarise(c, isRunning(c.id))), guides: interviewGuides() });
}

export async function PATCH(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req, 5_000);
  if (!body || !isId(body.id)) return fail("bad id");
  const title = body.title;
  if (title !== undefined && (typeof title !== "string" || !title.trim() || title.length > 120)) return fail("title must be 1-120 characters");
  const mandateId = body.mandateId;
  if (mandateId !== undefined && mandateId !== null && (!isId(mandateId) || !getMandate(mandateId))) return fail("no such mandate", 404);
  const c = updateConversation(body.id, (c) => {
    if (typeof title === "string") c.title = title.trim();
    if (mandateId !== undefined) c.mandate_id = mandateId as string | null;
  });
  return c ? json({ conversation: summarise(c) }) : fail("no such conversation", 404);
}
