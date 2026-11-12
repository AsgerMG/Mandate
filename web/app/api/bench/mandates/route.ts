// LOCAL-ONLY (lib/bench/guard.ts). Mandates (pa_os.md §2: the client level
// above conversations), stored outside the repo. GET lists them with what
// landed across their conversations; POST creates one; PATCH edits one.
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { isId, rollup, validateMandateInput, type BenchMandate } from "@/lib/bench/model";
import { getMandate, listConversations, listMandates, newId, nowIso, saveMandate, summarise } from "@/lib/bench/store";
import { isRunning } from "@/lib/bench/turns";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get("id");
  if (id !== null) {
    if (!isId(id)) return fail("bad id");
    const m = getMandate(id);
    if (!m) return fail("no such mandate", 404);
    const convs = listConversations({ mandate_id: id });
    return json({ mandate: m, rollup: rollup(convs), conversations: convs.map((c) => summarise(c, isRunning(c.id))) });
  }
  const all = listConversations();
  return json({
    mandates: listMandates().map((m) => {
      const convs = all.filter((c) => c.mandate_id === m.id);
      const r = rollup(convs);
      return {
        mandate: m, conversations: convs.length,
        decisions: r.decisions.slice(-3).map((d) => d.text), steps: r.steps.slice(-3).map((d) => d.text),
        counts: { decisions: r.decisions.length, steps: r.steps.length, flags: r.flags.length, watches: r.watches.length },
        last_activity: r.last_activity && r.last_activity > m.updated_at ? r.last_activity : m.updated_at,
      };
    }),
  });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req, 20_000);
  const v = validateMandateInput(body);
  if (!v.ok) return fail(v.error);
  const now = nowIso();
  const m: BenchMandate = { id: newId("m"), client: "", brief: "", markets: [], status: "active", profile: "", ...v.value, created_at: now, updated_at: now };
  saveMandate(m);
  return json({ mandate: m }, 201);
}

export async function PATCH(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req, 20_000);
  if (!body || !isId(body.id)) return fail("bad id");
  const m = getMandate(body.id);
  if (!m) return fail("no such mandate", 404);
  const v = validateMandateInput(body, true);
  if (!v.ok) return fail(v.error);
  const next: BenchMandate = { ...m, ...v.value, updated_at: nowIso() };
  saveMandate(next);
  return json({ mandate: next });
}
