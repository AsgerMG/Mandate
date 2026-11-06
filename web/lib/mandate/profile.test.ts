/** The shared Mandate profile, TypeScript half.
 *
 *  1. PARITY: this implementation reproduces mandate/profile/fixtures.json,
 *     which the Python implementation wrote, case for case.
 *  2. CAPITAL'S DERIVATION: smeStatus equals capital's own deriveSmeStatus on
 *     every combination of capital's bands.
 *  3. CAPITAL EQUIVALENCE: for every founder body the benches use (the 12
 *     archetypes, the 12 bench companies, the fixture bodies), what each of
 *     capital's routes reads after its own whitelist is IDENTICAL whether the
 *     body is sent as-is or lifted into a profile and sent as `{ profile }`.
 *     Every route is a function of exactly those inputs (company, country,
 *     description, capitalSought, sanitised eligibility, passed-through session
 *     state), so identical input is identical verdict, intake and brief. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ARCHETYPES, archetypeAnswers } from "../intelligence/__archetypes";
import { COMPANIES } from "../intelligence/__benchCompanies";
import {
  sanitizeCapitalSought, sanitizeEligibility, sanitizeFreeText, withIncorporationCountry,
} from "../intelligence/sanitize";
import { deriveSmeStatus } from "../profile/companyProfile";
import {
  FIELDS, fromCapitalRequest, fromPolicyRequest, sizeClass, smeStatus,
  toCapitalRequest, toPolicyProfile, type CapitalProfileRequest,
} from "./profile";
import { fromCapitalBody, resolveProfileBody } from "./profileRequest";
import { CAPITAL_BALANCE_BANDS, CAPITAL_FTE_BANDS, CAPITAL_TURNOVER_BANDS } from "./vocabulary";

const FIX = JSON.parse(readFileSync(resolve(__dirname, "../../../mandate/profile/fixtures.json"), "utf8"));
const nul = <T,>(v: T | undefined) => (v === undefined ? null : v);

describe("TypeScript reproduces the Python contract", () => {
  it("declares the same fields with the same kinds", () => {
    expect(Object.fromEntries(Object.entries(FIELDS).map(([k, v]) => [k, v[0]]))).toEqual(FIX.fields);
  });
  it("derives the same SME status and size class for every band combination", () => {
    for (const row of FIX.bandGrid) {
      expect([nul(smeStatus(row)), nul(sizeClass(row))], JSON.stringify(row)).toEqual([row.sme, row.sizeClass]);
    }
  });
  it("lifts every policy and capital request to the same profile", () => {
    for (const c of FIX.policyLifts) expect(fromPolicyRequest(c.request)).toEqual(c.profile);
    for (const c of FIX.capitalLifts) expect(fromCapitalRequest(c.request)).toEqual(c.profile);
  });
  it("derives the same policy and capital inputs from every profile", () => {
    for (const c of FIX.derivations) {
      expect(toPolicyProfile(c.profile)).toEqual(c.policy);
      expect(toCapitalRequest(c.profile)).toEqual(c.capital);
    }
  });
});

describe("the SME derivation is capital's on capital's bands", () => {
  it("equals deriveSmeStatus on every combination", () => {
    for (const f of CAPITAL_FTE_BANDS) for (const t of [undefined, ...CAPITAL_TURNOVER_BANDS])
      for (const b of [undefined, ...CAPITAL_BALANCE_BANDS]) {
        const a = { fteBand: f, turnoverBand: t, balanceBand: b };
        expect(smeStatus(a), JSON.stringify(a)).toBe(deriveSmeStatus(a));
      }
  });
});

/** Exactly what /api/intelligence (and /verdict, /intake) read off a body. */
function routeInput(body: Record<string, unknown>) {
  const country = (body.country as string | undefined)?.trim();
  return {
    company: (body.company as string).trim(),
    country: country || undefined,
    description: sanitizeFreeText(body.description),
    capitalSought: sanitizeCapitalSought(body.capitalSought),
    eligibility: withIncorporationCountry(sanitizeEligibility(body.eligibility), country),
    eligibilityBeforeRound: body.eligibilityBeforeRound
      ? withIncorporationCountry(sanitizeEligibility(body.eligibilityBeforeRound), country) : undefined,
    profileSignal: body.profileSignal,
    projectAnswers: body.projectAnswers,
  };
}

const BODIES: Record<string, unknown>[] = [
  ...ARCHETYPES.map((a) => ({ company: a.label, country: a.country, description: a.description,
    eligibility: archetypeAnswers(a) })),
  ...COMPANIES.map((c) => ({ company: c.company, country: c.country, description: c.description,
    capitalSought: ["grant"],
    eligibility: { sector: c.sector, fteBand: c.fteBand, ticketBand: c.ticketBand,
      developmentStage: c.developmentStage, borrowerModel: c.borrowerModel, activities: c.activities },
    // session state rides alongside the profile untouched
    eligibilityBeforeRound: { sector: c.sector },
    profileSignal: { techDepthRead: "applied_innovation" } })),
  ...FIX.capitalLifts.map((c: { request: Record<string, unknown> }) => c.request),
];

describe("capital gives identical results from the shared profile", () => {
  it(`reads the same input on all ${BODIES.length} bench bodies`, () => {
    expect(BODIES.length).toBeGreaterThanOrEqual(48);
    for (const body of BODIES) {
      const profile = fromCapitalBody(body as unknown as CapitalProfileRequest);
      const { company: _c, country: _k, description: _d, capitalSought: _s, eligibility: _e, ...session } = body;
      void _c; void _k; void _d; void _s; void _e;
      const sent = resolveProfileBody({ ...session, profile });
      if ("error" in sent) throw new Error(sent.error);
      expect(routeInput(sent.body as Record<string, unknown>), String(body.company)).toEqual(routeInput(body));
    }
  });
  it("leaves a body without a profile untouched", () => {
    const body = { company: "Acme", eligibility: { sector: "space" } };
    expect(resolveProfileBody(body)).toEqual({ body });
  });
  it("refuses a profile outside the vocabulary instead of guessing", () => {
    expect(resolveProfileBody({ profile: { name: "Acme", sector: "fintech" } })).toHaveProperty("error");
  });
});
