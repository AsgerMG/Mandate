import { NextRequest } from "next/server";
import { generateIntakeQuestions } from "@/lib/intelligence/pipeline";
import type { IntelligenceRequest } from "@/lib/intelligence/types";

// Phase 1: a fast, single model call that returns the tailored clarifying
// questions to ask before the memo. Node runtime (Anthropic SDK + fund-process
// reads); never statically optimised.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: IntelligenceRequest;
  try {
    body = (await request.json()) as IntelligenceRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.company || !body.company.trim()) {
    return Response.json({ error: "A company name is required." }, { status: 400 });
  }

  try {
    const questions = await generateIntakeQuestions({
      company: body.company.trim(),
      sector: body.sector?.trim() || undefined,
      country: body.country?.trim() || undefined,
      description: body.description?.trim() || undefined,
      companyType: body.companyType?.trim() || undefined,
      capitalSought: Array.isArray(body.capitalSought)
        ? body.capitalSought.filter((v) => typeof v === "string")
        : undefined,
    });
    // Never block the memo on intake: an empty list just skips the questions.
    return Response.json({ questions });
  } catch (err) {
    console.error("intake route failed:", err);
    return Response.json({ questions: [] });
  }
}
