// LOCAL-ONLY (lib/bench/guard.ts). Review sets: a list of eval runs handed to
// a reviewer (the expert), opened in order at /bench/review/<id>. Kept outside
// the repo (~/Mandate-backups/bench/review-sets), one file each; never deleted.
//   GET ?id=<set>                         the set and its runs, in order
//   POST {title, note?, conversation_ids} a new set
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { evalRunSummary, isId, validateReviewSet, type ReviewSet } from "@/lib/bench/model";
import { getConversation, getReviewSet, listReviewSets, newId, nowIso, saveReviewSet } from "@/lib/bench/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const id = new URL(req.url).searchParams.get("id");
  if (id === null) return json({ sets: listReviewSets() });
  if (!isId(id)) return fail("bad id");
  const set = getReviewSet(id);
  if (!set) return fail("no such review set", 404);
  const runs = set.conversation_ids.map((cid) => {
    const c = getConversation(cid);
    return c ? evalRunSummary(c) : null;
  });
  return json({ set, runs, missing: set.conversation_ids.filter((_, i) => !runs[i]) });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const v = validateReviewSet(await readJson(req, 20_000));
  if (!v.ok) return fail(v.error);
  const notRuns = v.value.conversation_ids.filter((cid) => { const c = getConversation(cid); return !c || !evalRunSummary(c); });
  if (notRuns.length) return fail(`not an eval run: ${notRuns.join(", ")}`, 404);
  const set: ReviewSet = { id: newId("set"), ...v.value, created_at: nowIso() };
  saveReviewSet(set);
  return json({ set, url: `/bench/review/${set.id}` }, 201);
}
