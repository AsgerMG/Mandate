// LOCAL-ONLY (lib/bench/guard.ts). The eval runs as conversations (Train,
// Review runs): every conversation tagged eval_run (written by
// mandate/eval/run_conversation.py, or a re-test), summarised with its grades
// and how many comments it has, plus the review sets.
import { guard, json } from "@/lib/bench/guard";
import { evalRunSummary, type EvalRunSummary } from "@/lib/bench/model";
import { listConversations, listReviewSets } from "@/lib/bench/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const runs = listConversations().map(evalRunSummary).filter((r): r is EvalRunSummary => !!r);
  return json({ runs, sets: listReviewSets() });
}
