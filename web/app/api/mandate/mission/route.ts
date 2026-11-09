import { NextRequest } from "next/server";
import { withCostTracking } from "@/lib/intelligence/cost";
import { checkQuota, recordCost } from "@/lib/intelligence/quota";
import { realCapital } from "@/lib/mandate/agent/capital";
import { sdkClient } from "@/lib/mandate/agent/loop";
import { runMission } from "@/lib/mandate/agent/mission";
import { httpPolicyApi, mandateApiFromEnv } from "@/lib/mandate/agent/services";
import {
  assertMissionRequest,
  demoMissionEvents,
  type MissionEvent,
} from "@/lib/mandate/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const line = (encoder: TextEncoder, event: MissionEvent) =>
  encoder.encode(`${JSON.stringify(event)}\n`);

const NDJSON = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store, no-transform",
  "x-accel-buffering": "no",
};

/**
 * POST /api/mandate/mission: a MissionEvent NDJSON stream.
 *
 * `?demo=1` (development only) is the owner's scripted preview, unchanged.
 * Without it, a LIVE mission runs the agent runtime (lib/mandate/agent): it
 * spends money, so it needs mandate-api configured (MANDATE_API_URL +
 * MANDATE_SERVICE_TOKEN), and in production an operator key
 * (`x-mandate-key` = MANDATE_MISSION_KEY) until founder accounts exist. Spend
 * is metered (cost.ts) and counted against the daily ceiling (quota.ts).
 */
export async function POST(request: NextRequest) {
  const demo = request.nextUrl.searchParams.get("demo") === "1";
  if (demo && process.env.NODE_ENV === "production") {
    return Response.json({ error: "The mission preview is available in development only." }, { status: 404 });
  }

  let input;
  try {
    input = assertMissionRequest(await request.json());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "invalid mission request" },
      { status: 400 },
    );
  }
  const encoder = new TextEncoder();

  if (demo) {
    if (input.mode !== "demo" || input.workspaceId !== "demo-workspace") {
      return Response.json({ error: "invalid preview workspace" }, { status: 400 });
    }
    const events = demoMissionEvents(input.objective);
    const stream = new ReadableStream({
      async start(controller) {
        for (const event of events) {
          controller.enqueue(line(encoder, event));
          await new Promise((resolve) => setTimeout(resolve, event.type === "decision" ? 450 : 250));
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: NDJSON });
  }

  // ── live ────────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    const key = process.env.MANDATE_MISSION_KEY;
    if (!key || request.headers.get("x-mandate-key") !== key) {
      return Response.json({ error: "Live missions are not open yet." }, { status: 404 });
    }
  }
  const mandate = mandateApiFromEnv();
  if (!mandate) {
    return Response.json({ error: "mandate-api is not configured (MANDATE_API_URL, MANDATE_SERVICE_TOKEN)." }, { status: 503 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const quota = await checkQuota(ip, "mandate/mission");
  if (!quota.allowed) return Response.json({ error: quota.message }, { status: 429 });

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: MissionEvent) => {
        try { controller.enqueue(line(encoder, e)); } catch { /* client went away; the mission still saves */ }
      };
      const { result, eur, calls } = await withCostTracking(() =>
        runMission(input, { client: sdkClient(), mandate, policy: httpPolicyApi(), capital: realCapital }, emit));
      recordCost(quota.requestId, eur);
      if (result.missionId) emit({ type: "cost", missionId: result.missionId, eur: Number(eur.toFixed(4)), calls });
      controller.close();
    },
  });
  return new Response(stream, { headers: NDJSON });
}
