import { describe, expect, it } from "vitest";
import {
  assertMissionRequest,
  DEMO_WORKSPACE,
  demoMissionEvents,
} from "./workspace";
import { validateProfile } from "./profile";

describe("Mandate workspace contract", () => {
  it("keeps the demo profile on the shared company-profile contract", () => {
    expect(validateProfile(DEMO_WORKSPACE.profile.payload)).toEqual(DEMO_WORKSPACE.profile.payload);
  });

  it("rejects missions without a pinned profile version", () => {
    expect(() =>
      assertMissionRequest({
        workspaceId: "workspace",
        profileId: "profile",
        profileVersion: 0,
        objective: "Choose a market",
      }),
    ).toThrow("profileVersion");
  });

  it("emits a complete, attributable mission lifecycle", () => {
    const events = demoMissionEvents("Choose France or Germany");
    expect(events[0].type).toBe("mission_started");
    expect(events.filter((event) => event.type === "specialist_completed")).toHaveLength(2);
    const decision = events.find((event) => event.type === "decision");
    expect(decision?.type === "decision" && decision.decision.evidence.length).toBeGreaterThan(0);
    expect(events.at(-1)?.type).toBe("mission_completed");
  });
});
