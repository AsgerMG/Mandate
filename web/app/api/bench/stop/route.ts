// LOCAL-ONLY (lib/bench/guard.ts). Stops a running turn: kills the claude
// process and its children. The partial reply stays, marked stopped.
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { isId } from "@/lib/bench/model";
import { stopTurn } from "@/lib/bench/turns";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req, 2_000);
  if (!body || !isId(body.conversationId)) return fail("bad conversationId");
  return json({ stopped: stopTurn(body.conversationId) });
}
