// LOCAL-ONLY (lib/bench/guard.ts). The feedback queue: one append-only JSON-lines
// file outside the repo (~/Mandate-backups/bench/feedback.jsonl). GET lists the
// items as they stand; POST records one (a reply rated good / off, a
// conversation graded 1-5, an interview to distil); PATCH dismisses or reopens.
// Every item is stamped with the brain, mandate, conversation, message and the
// playbooks in force (git sha) when it was given.
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import {
  initialStatus, isId, THEMES, type FeedbackItem, type FeedbackKind, type Theme,
} from "@/lib/bench/model";
import { appendFeedback, getConversation, newId, nowIso, playbooksInForce, readFeedback, updateConversation } from "@/lib/bench/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  return json({ items: readFeedback() });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const b = await readJson(req, 20_000);
  if (!b) return fail("expected a JSON object");
  const kind = b.kind as FeedbackKind;
  if (!["reply", "conversation", "interview"].includes(kind)) return fail("kind must be reply, conversation or interview");
  if (!isId(b.conversationId)) return fail("bad conversationId");
  const conv = getConversation(b.conversationId);
  if (!conv) return fail("no such conversation", 404);
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > 4000) return fail("the note is too long");
  const theme: Theme = THEMES.includes(b.theme as Theme) ? (b.theme as Theme) : "other";

  let rating: FeedbackItem["rating"] = null, grade: number | null = null, messageIndex: number | null = null, excerpt = conv.title;
  if (kind === "reply") {
    if (b.rating !== "good" && b.rating !== "off") return fail("rating must be good or off");
    rating = b.rating;
    const i = b.messageIndex;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= conv.messages.length || conv.messages[i].role !== "agent") return fail("messageIndex must point at a reply");
    messageIndex = i;
    excerpt = conv.messages[i].text.slice(0, 600);
  } else if (kind === "conversation") {
    if (typeof b.grade !== "number" || !Number.isInteger(b.grade) || b.grade < 1 || b.grade > 5) return fail("grade must be 1 to 5");
    grade = b.grade;
  } else {
    if (conv.agent !== "interviewer") return fail("only an interview can be sent as an interview");
    const last = [...conv.messages].reverse().find((m) => m.role === "agent" && m.text);
    excerpt = last?.text.slice(0, 600) ?? conv.title;
  }

  const item: FeedbackItem = {
    id: newId("f"), kind, brain: conv.brain, rating, grade, theme, note,
    mandate_id: conv.mandate_id, conversation_id: conv.id, message_index: messageIndex, run_file: null,
    excerpt, playbooks: playbooksInForce(conv.brain), created_at: nowIso(), status: "open",
  };
  item.status = initialStatus(item);
  appendFeedback({ type: "item", item });
  updateConversation(conv.id, (c) => {
    if (kind === "reply" && messageIndex !== null) c.messages[messageIndex].feedback = { rating: rating!, item_id: item.id, ...(note ? { note } : {}) };
    if (kind === "conversation") c.grade = { grade: grade!, item_id: item.id };
  });
  return json({ item }, 201);
}

export async function PATCH(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const b = await readJson(req, 2_000);
  if (!b || !isId(b.id)) return fail("bad id");
  if (b.status !== "dismissed" && b.status !== "open") return fail("status must be dismissed or open");
  if (!readFeedback().some((i) => i.id === b.id)) return fail("no such item", 404);
  appendFeedback({ type: "status", id: b.id, status: b.status, at: nowIso(), by: b.status === "open" ? "reopened" : "dismissed" });
  return json({ ok: true });
}
