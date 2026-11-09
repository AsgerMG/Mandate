import type { CompanyProfile } from "./profile";

export type Specialist = "regina" | "wincent" | "mandate";
export type Confidence = "low" | "medium" | "high";
export type ActionStatus = "open" | "in_progress" | "done" | "dismissed";

export interface EvidenceRef {
  id: string;
  specialist: Exclude<Specialist, "mandate">;
  title: string;
  publisher: string;
  canonicalUrl: string;
  publishedAt?: string;
  retrievedAt: string;
  locator?: string;
  excerpt?: string;
}

export interface WorkspaceDecision {
  id: string;
  missionId: string;
  title: string;
  recommendation: string;
  rationale: string;
  confidence: Confidence;
  dueAt?: string;
  createdAt: string;
  evidence: EvidenceRef[];
  /** ADDITIVE (agent runtime): the rationale as labelled claims. `rationale`
   *  is the same claims rendered as prose, so a UI that ignores this loses
   *  nothing. A `cited` claim's ids are EvidenceRef ids' prefixes ("c3"). */
  claims?: Claim[];
  /** ADDITIVE: who wrote it. */
  createdBy?: Specialist;
}

/** ADDITIVE (agent runtime). Every factual claim is cited or labelled. */
export interface Claim {
  text: string;
  basis: "cited" | "judgement" | "unverified";
  citationIds: string[];
}

export interface WorkspaceAction {
  id: string;
  decisionId?: string;
  title: string;
  status: ActionStatus;
  dueAt?: string;
  createdAt: string;
  /** ADDITIVE (agent runtime): what to do, a ready-to-send draft (the founder
   *  always sends), and who it is addressed to. */
  detail?: string;
  draft?: string;
  stakeholder?: { name: string; organisation?: string; role?: string; channel?: string; contact?: string; contactVerified?: boolean };
}

/** ADDITIVE (agent runtime): a gap in the company's position that blocks or
 *  weakens a route. */
export interface WorkspaceFlag {
  id: string;
  missionId: string;
  title: string;
  severity: "blocker" | "major" | "minor";
  fix: string;
  claims: Claim[];
  evidence: EvidenceRef[];
  createdBy: Specialist;
  createdAt: string;
}

/** ADDITIVE (agent runtime): one ordered step of the plan. */
export interface WorkspacePlanStep {
  id: string;
  missionId: string;
  ordinal: number;
  title: string;
  detail: string;
  horizon?: "this_week" | "this_month" | "this_quarter" | "later";
  decisionId?: string;
  createdAt: string;
}

/** ADDITIVE (agent runtime): something the radar watches for this workspace. */
export interface WorkspaceWatch {
  id: string;
  missionId: string;
  kind: "route" | "rule" | "institution" | "consultation" | "case" | "agenda";
  subject: string;
  routeStatus?: "pursue" | "probe" | "parked" | "closed";
  trigger: string;
  jurisdiction?: string;
  createdAt: string;
}

/** ADDITIVE (agent runtime): the written deliverable that closes a mission. */
export interface MissionDeliverable {
  title: string;
  summary: string;
  sections: { heading: string; claims: Claim[] }[];
  questions: { question: string; why: string }[];
  evidence: EvidenceRef[];
}

export interface WorkspaceSnapshot {
  mode: "live" | "demo";
  workspace: { id: string; name: string };
  profile: { id: string; version: number; payload: CompanyProfile };
  coverage: {
    policy: string[];
    capital: string[];
  };
  decisions: WorkspaceDecision[];
  actions: WorkspaceAction[];
  asOf: string;
}

export interface MissionRequest {
  workspaceId: string;
  profileId: string;
  profileVersion: number;
  objective: string;
  mode?: "live" | "demo";
  /** ADDITIVE: a job playbook to load up front (mandate/playbooks/<job>.md). */
  job?: string;
}

export type MissionEvent =
  | { type: "mission_started"; missionId: string; objective: string }
  | { type: "specialist_started"; missionId: string; specialist: Exclude<Specialist, "mandate">; scope: string }
  | { type: "specialist_completed"; missionId: string; specialist: Exclude<Specialist, "mandate">; summary: string }
  | { type: "decision"; missionId: string; decision: WorkspaceDecision }
  | { type: "action"; missionId: string; action: WorkspaceAction }
  | { type: "mission_completed"; missionId: string }
  | { type: "error"; missionId?: string; message: string; recoverable: boolean }
  // ── ADDITIVE, emitted by the live runtime (web/lib/mandate/agent) ──────────
  // A UI that does not know a type ignores it (the workspace page branches on
  // `type` and drops the rest), so these never break the scripted demo.
  /** A specialist or the orchestrator used a tool: for a live activity feed. */
  | { type: "tool_used"; missionId: string; specialist: Specialist; tool: string; summary: string }
  /** Prose from an agent: a specialist's report, the orchestrator's framing. */
  | { type: "message"; missionId: string; specialist: Specialist; text: string }
  | { type: "flag"; missionId: string; flag: WorkspaceFlag }
  | { type: "plan_step"; missionId: string; step: WorkspacePlanStep }
  | { type: "watch"; missionId: string; watch: WorkspaceWatch }
  /** The written deliverable, once, before mission_completed. */
  | { type: "deliverable"; missionId: string; deliverable: MissionDeliverable }
  /** Measured spend so far, in euros (lib/intelligence/cost.ts). */
  | { type: "cost"; missionId: string; eur: number; calls: number };

export function assertMissionRequest(value: unknown): MissionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("mission request must be an object");
  }
  const body = value as Record<string, unknown>;
  for (const key of ["workspaceId", "profileId", "objective"] as const) {
    if (typeof body[key] !== "string" || !body[key].trim()) {
      throw new Error(`${key} is required`);
    }
  }
  if (!Number.isInteger(body.profileVersion) || Number(body.profileVersion) < 1) {
    throw new Error("profileVersion must be a positive integer");
  }
  if (body.mode !== undefined && body.mode !== "live" && body.mode !== "demo") {
    throw new Error("mode must be live or demo");
  }
  if (body.job !== undefined && (typeof body.job !== "string" || !/^[a-z0-9-]+$/.test(body.job))) {
    throw new Error("job must be a playbook name");
  }
  return {
    workspaceId: String(body.workspaceId),
    profileId: String(body.profileId),
    profileVersion: Number(body.profileVersion),
    objective: String(body.objective).trim(),
    mode: body.mode as MissionRequest["mode"],
    ...(body.job ? { job: String(body.job) } : {}),
  };
}

export const DEMO_WORKSPACE: WorkspaceSnapshot = {
  mode: "demo",
  workspace: { id: "demo-workspace", name: "Northstar Bio" },
  profile: {
    id: "demo-profile",
    version: 1,
    payload: {
      name: "Northstar Bio",
      description: "Clinical decision-support software for European hospitals.",
      sector: "health_life_sciences",
      subsectors: ["digital_health"],
      incorporationCountry: "DK",
      markets: ["EU", "FR", "DE"],
      developmentStage: "scaling_revenue",
      usesAi: true,
      handlesPersonalData: true,
    },
  },
  coverage: {
    policy: ["European Union", "France", "Germany"],
    capital: ["Grants", "Loans", "Public equity"],
  },
  decisions: [
    {
      id: "demo-decision-market",
      missionId: "demo-mission-market",
      title: "Choose the first launch market",
      recommendation: "Choose Germany if the EIC route is strategic; choose France if launch speed is the priority.",
      rationale: "Germany offers stronger capital alignment, while France has the lower-friction regulatory route for this profile.",
      confidence: "medium",
      dueAt: "2026-11-15T17:00:00.000Z",
      createdAt: "2026-11-06T12:00:00.000Z",
      evidence: [
        {
          id: "demo-evidence-ai-act",
          specialist: "regina",
          title: "Regulation (EU) 2024/1689",
          publisher: "Official Journal of the European Union",
          canonicalUrl: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
          publishedAt: "2024-07-12T00:00:00.000Z",
          retrievedAt: "2026-11-06T08:00:00.000Z",
        },
      ],
    },
    {
      id: "demo-decision-ai-act",
      missionId: "demo-mission-policy",
      title: "Assign ownership of the AI Act model card",
      recommendation: "Put the model card under the product assurance owner before the next release gate.",
      rationale: "The clinical-assistance feature falls inside the higher-scrutiny path for the illustrative profile.",
      confidence: "medium",
      dueAt: "2026-11-12T17:00:00.000Z",
      createdAt: "2026-11-06T10:00:00.000Z",
      evidence: [
        {
          id: "demo-evidence-ai-act-2",
          specialist: "regina",
          title: "Regulation (EU) 2024/1689",
          publisher: "Official Journal of the European Union",
          canonicalUrl: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
          publishedAt: "2024-07-12T00:00:00.000Z",
          retrievedAt: "2026-11-06T08:00:00.000Z",
        },
      ],
    },
    {
      id: "demo-decision-eic",
      missionId: "demo-mission-capital",
      title: "Qualify the EIC route before committing application time",
      recommendation: "Resolve the consortium condition before treating the next EIC window as part of the financing plan.",
      rationale: "The ticket and development stage align, but consortium eligibility remains unresolved.",
      confidence: "low",
      dueAt: "2026-11-15T17:00:00.000Z",
      createdAt: "2026-11-06T09:00:00.000Z",
      evidence: [],
    },
  ],
  actions: [
    {
      id: "demo-action-consortium",
      decisionId: "demo-decision-market",
      title: "Confirm whether the EIC consortium route is viable",
      status: "open",
      dueAt: "2026-11-12T17:00:00.000Z",
      createdAt: "2026-11-06T12:01:00.000Z",
    },
    {
      id: "demo-action-model-card",
      decisionId: "demo-decision-ai-act",
      title: "Assign the AI Act model-card owner",
      status: "open",
      dueAt: "2026-11-12T17:00:00.000Z",
      createdAt: "2026-11-06T10:01:00.000Z",
    },
  ],
  asOf: "2026-11-06T12:01:00.000Z",
};

export function demoMissionEvents(objective: string): MissionEvent[] {
  const missionId = `demo-mission-${Date.now()}`;
  const decision: WorkspaceDecision = {
    id: `demo-decision-${Date.now()}`,
    missionId,
    title: "Choose the first launch market",
    recommendation: "Prioritise Germany if non-dilutive capital is decisive; prioritise France if launch speed is decisive.",
    rationale: "The policy and capital records point in different directions. The recommendation therefore depends on the constraint stated in the mandate.",
    confidence: "medium",
    dueAt: "2026-11-15T17:00:00.000Z",
    createdAt: new Date().toISOString(),
    evidence: DEMO_WORKSPACE.decisions[0].evidence,
  };
  const action: WorkspaceAction = {
    id: `demo-action-${Date.now()}`,
    decisionId: decision.id,
    title: "Confirm whether the EIC consortium route is viable",
    status: "open",
    dueAt: "2026-11-12T17:00:00.000Z",
    createdAt: new Date().toISOString(),
  };
  return [
    { type: "mission_started", missionId, objective },
    { type: "specialist_started", missionId, specialist: "regina", scope: "Policy obligations and market-entry timing" },
    { type: "specialist_started", missionId, specialist: "wincent", scope: "Available public capital and application timing" },
    { type: "specialist_completed", missionId, specialist: "regina", summary: "France presents the lower-friction regulatory route for the illustrative profile." },
    { type: "specialist_completed", missionId, specialist: "wincent", summary: "Germany presents the stronger public-capital route for the illustrative profile." },
    { type: "decision", missionId, decision },
    { type: "action", missionId, action },
    { type: "mission_completed", missionId },
  ];
}
