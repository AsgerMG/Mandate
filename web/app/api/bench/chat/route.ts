// LOCAL-ONLY (lib/bench/guard.ts). Starts a turn of a bench conversation and
// streams it as NDJSON; GET re-attaches to a running turn after a reload.
// The turn runs Claude Code headless as the conversation's agent on the
// owner's own plan (no API key, no API cost): lib/bench/turns.ts.
import { fail, guard, readJson } from "@/lib/bench/guard";
import { AGENTS, BRAIN_LABEL, BRAINS, isId, titleFrom, type Agent, type BenchConversation, type Brain, type ConversationKind } from "@/lib/bench/model";
import { getConversation, getMandate, interviewGuides, newId, nowIso, saveConversation, updateConversation } from "@/lib/bench/store";
import { isRunning, startTurn, TurnBusy, turnStream } from "@/lib/bench/turns";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req, 60_000);
  if (!body) return fail("expected a JSON object");
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return fail("message required");
  if (message.length > 20_000) return fail("message too long (20,000 characters at most)");

  let conv: BenchConversation | null = null;
  if (body.conversationId !== undefined && body.conversationId !== null) {
    if (!isId(body.conversationId)) return fail("bad conversationId");
    conv = getConversation(body.conversationId);
    if (!conv) return fail("no such conversation", 404);
  } else {
    const agent = (body.agent ?? "wincent") as Agent;
    if (!AGENTS.includes(agent)) return fail("unknown agent");
    const brain = (agent === "interviewer" ? body.brain : agent) as Brain;
    if (!BRAINS.includes(brain)) return fail("unknown brain");
    const kind: ConversationKind = agent === "interviewer" ? (body.kind === "lesson" ? "lesson" : "interview") : "chat";
    let mandateId: string | null = null;
    if (body.mandateId !== undefined && body.mandateId !== null) {
      if (!isId(body.mandateId) || !getMandate(body.mandateId)) return fail("no such mandate", 404);
      mandateId = body.mandateId;
    }
    let guide: string | undefined;
    if (kind === "interview") {
      if (typeof body.guide !== "string" || !interviewGuides().includes(body.guide)) return fail("pick an interview guide");
      guide = body.guide;
    }
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : titleFrom(message);
    const now = nowIso();
    conv = {
      id: newId("c"), mandate_id: mandateId, agent, brain, kind, title, ...(guide ? { guide } : {}),
      session_id: null, messages: [], cites: {}, sources: [], saved: [], created_at: now, updated_at: now,
    };
    saveConversation(conv);
  }

  if (isRunning(conv.id)) return fail(`${BRAIN_LABEL[conv.agent]} is still answering the last message in this conversation.`, 409);
  if (body.retry === true) {
    // Retry: drop the failed exchange (the same message, an unfinished reply) before sending again.
    updateConversation(conv.id, (c) => {
      const [q, a] = c.messages.slice(-2);
      if (q?.role === "client" && q.text === message && a?.role === "agent" && (a.error || a.interrupted || !a.text)) c.messages.splice(-2, 2);
    });
  }
  try { startTurn(conv.id, message); }
  catch (e) { return e instanceof TurnBusy ? fail(e.message, 409) : fail((e as Error).message, 500); }
  return turnStream(conv.id) ?? fail("the turn ended before it could be followed", 500);
}

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get("conversationId");
  if (!isId(id)) return fail("bad conversationId");
  return turnStream(id) ?? new Response(null, { status: 204 });
}
