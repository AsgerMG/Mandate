import { NextRequest } from "next/server";
import { matchCompany } from "@/lib/intelligence/corpus";
import { toIso2 } from "@/lib/intelligence/countryCodes";
import { regionOptions } from "@/lib/intelligence/regions.generated";

// Where the register says this company is, so the intake can PRE-FILL its
// region question instead of asking a founder to look up their own NUTS code.
//
// WHY THIS ROUTE EXISTS AT ALL. Region is the single highest-value question the
// intake can ask: 181 encoded, official region filters on 155 leaves, and it is
// the only field whose demands differ between siblings across the eight largest
// fund families (wsAX, wsAY). But the opening form is deliberately six fields,
// and a seventh has to earn its place. A field that arrives already answered,
// which the founder only has to glance at and correct, is a much smaller
// imposition than one they have to fill — so the pre-fill is what pays for the
// question, and this route is the pre-fill.
//
// IT IS A DEFAULT, NEVER A CLAIM. The value comes from the State Aid
// Transparency Register's beneficiary field on the company's own past awards. A
// registered address is not always where the work will happen, plenty of
// companies have more than one site, and 53.5% of the index has no region at
// all. So the response says where the value came from, the form labels it as
// derived, and the founder's edit wins outright.
//
// Node runtime: matchCompany reads the on-disk company index.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  let body: { company?: string; country?: string };
  try {
    body = (await request.json()) as { company?: string; country?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const company = body.company?.trim();
  const country = body.country?.trim();
  // No company, nothing to look up. Not an error: the form asks as the founder
  // types, so most calls in a session legitimately have too little to go on.
  if (!company) return Response.json({ region: null });

  try {
    const match = matchCompany(company, country);
    if (!match.matched || !match.region) return Response.json({ region: null });

    // THE OFFERED LIST IS THE AUTHORITY. A pre-filled value that is not one of
    // the options renders as an empty select — strictly worse than no pre-fill,
    // because the founder sees a question that looks unanswered and a form that
    // silently disagrees with itself. So the id is returned only when the
    // country the founder actually chose really offers it.
    const options = regionOptions([toIso2(country || match.country)].filter(Boolean));
    const hit = options.find((o) => o.value === match.region);
    if (!hit) return Response.json({ region: null });

    return Response.json({
      region: hit.value,
      label: hit.label,
      // Shown to the founder, because a default whose origin is invisible is
      // indistinguishable from something they typed and forgot.
      source: "registered_address",
      matchedName: match.name,
    });
  } catch (err) {
    // A failed pre-fill must never block the form: the founder can always
    // answer the question themselves, which is the state this route improves on
    // rather than replaces.
    console.error("region prefill failed:", err);
    return Response.json({ region: null });
  }
}
