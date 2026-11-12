// LOCAL-ONLY (lib/bench/guard.ts). Sends a batch of open feedback on one brain
// to the interviewer, which proposes playbook edits and eval cases, each block
// naming the feedback it addresses (model.distilMessage). Returns the new
// conversation at once; its turn runs on the server and the page follows it.
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { BRAIN_LABEL, BRAINS, distilMessage, isId, type Brain } from "@/lib/bench/model";
import { getConversation, newId, nowIso, readFeedback, saveConversation } from "@/lib/bench/store";
import { startTurn } from "@/lib/bench/turns";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const b = await readJson(req, 20_000);
  if (!b || !BRAINS.includes(b.brain as Brain)) return fail("brain required");
  const brain = b.brain as Brain;
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 40 || !b.ids.every(isId)) return fail("pick 1 to 40 feedback items");
  const all = readFeedback();
  const items = all.filter((i) => (b.ids as string[]).includes(i.id) && i.status === "open" && i.brain === brain);
  if (!items.length) return fail("none of those items is open feedback on this brain");
  const titles: Record<string, string> = {};
  for (const i of items) if (i.conversation_id && !titles[i.conversation_id]) titles[i.conversation_id] = getConversation(i.conversation_id)?.title ?? i.conversation_id;
  const now = nowIso();
  const conv = {
    id: newId("c"), mandate_id: null, agent: "interviewer" as const, brain, kind: "distil" as const,
    title: `Distil ${items.length} feedback item${items.length === 1 ? "" : "s"} on ${BRAIN_LABEL[brain]}`,
    session_id: null, messages: [], cites: {}, sources: [], saved: [], feedback_ids: items.map((i) => i.id), created_at: now, updated_at: now,
  };
  saveConversation(conv);
  startTurn(conv.id, distilMessage(brain, items, titles));
  return json({ conversationId: conv.id }, 201);
}
