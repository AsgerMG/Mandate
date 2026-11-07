/**
 * Capital's three intake routes (/api/intelligence, /verdict, /intake) accept
 * the shared Mandate profile.
 *
 * A request may carry `profile` (the CompanyProfile of ./profile.ts). When it
 * does, the company-describing fields of capital's body (company, country,
 * description, capitalSought, eligibility) are DERIVED from it and any sent
 * alongside are ignored; session state (eligibilityBeforeRound, profileSignal,
 * projectAnswers, candidateInstrumentIds, wantProfileSignal) passes through.
 * When it does not, the body is returned untouched, so every existing caller
 * (panel.tsx's basePayload, every harness) behaves exactly as before.
 *
 * profileRequest.test.ts proves the route's own sanitised input is identical
 * whether a founder's body is sent as-is or lifted into a profile and sent so.
 */
import { sanitizeEligibility } from "../intelligence/sanitize";
import {
  fromCapitalRequest, ProfileError, toCapitalRequest, validateProfile,
  type CapitalProfileRequest, type CompanyProfile,
} from "./profile";

const DERIVED = ["company", "country", "description", "capitalSought", "eligibility"] as const;

export type WithProfile<T> = T & { profile?: unknown };

/** The body the route reads, or `{ error }` for a profile outside the vocabulary. */
export function resolveProfileBody<T extends object>(body: WithProfile<T>):
  { body: T } | { error: string } {
  if (body.profile === undefined || body.profile === null) return { body };
  let profile: CompanyProfile;
  try {
    profile = validateProfile(body.profile);
  } catch (e) {
    return { error: e instanceof ProfileError ? e.message : "Invalid profile." };
  }
  const rest: Record<string, unknown> = { ...body };
  delete rest.profile;
  for (const k of DERIVED) delete rest[k];
  return { body: { ...rest, ...toCapitalRequest(profile) } as T };
}

/** A RAW capital body (as a client posts it) -> a profile: capital's own
 *  whitelist first, so the lift sees exactly what the route would. */
export function fromCapitalBody(raw: CapitalProfileRequest): CompanyProfile {
  return fromCapitalRequest({ ...raw, eligibility: sanitizeEligibility(raw.eligibility) });
}
