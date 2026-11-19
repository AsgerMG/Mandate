// LOCAL-ONLY (lib/bench/guard.ts). "Needs you" for one brain: GET ?brain=
// lists what the owner can do to improve it, most valuable first (lib/bench/
// needs.ts). POST records the owner's answer on a kept playbook change or on a
// case's checks, appended to the bench folder; the repo is changed afterwards
// by a session that reads those answers, never by this route.
import { fail, guard, json, readJson } from "@/lib/bench/guard";
import { BRAINS, type Brain } from "@/lib/bench/model";
import { appendOwnerReview, loopsFor, needsFor } from "@/lib/bench/needs";
import { nowIso } from "@/lib/bench/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const b = new URL(req.url).searchParams.get("brain");
  if (!BRAINS.includes(b as Brain)) return fail("brain must be wincent or regina");
  return json({ ...needsFor(b as Brain), loops: loopsFor(b as Brain) });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req, 20_000);
  if (!body || (body.kind !== "approve" && body.kind !== "confirm")) return fail("kind must be approve or confirm");
  if (typeof body.ref !== "string" || !/^(proposal:\d{1,4}|case:[a-z0-9][a-z0-9_-]{0,80})$/.test(body.ref)) return fail("bad ref");
  if (body.verdict !== "ok" && body.verdict !== "change") return fail("verdict must be ok or change");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
  if (body.verdict === "change" && !note) return fail("say what to change");
  appendOwnerReview({ kind: body.kind, ref: body.ref, verdict: body.verdict, note, at: nowIso() });
  return json({ ok: true });
}
