// LOCAL-ONLY (lib/bench/guard.ts). The Knowledge page: the knowledge map
// (mandate/brains/wincent/knowledge_map.yaml) held up against the graph-core tables, per market
// and part (institutions, products, processes, priority roles, org charts), with what is missing
// and which org charts changed since they were last extracted. Read-only.
import { fail, guard, json } from "@/lib/bench/guard";
import { knowledgeCoveragePy } from "@/lib/bench/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const r = knowledgeCoveragePy();
  if (!r.ok) return fail(`coverage could not be computed: ${r.error}`, 500);
  return json(JSON.parse(r.out));
}
