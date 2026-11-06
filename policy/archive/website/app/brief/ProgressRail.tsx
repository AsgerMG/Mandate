// Vertical, end-to-end progress rail for the brief wizard. Every step is
// visible from the moment the run's shape is known — idle until entered,
// current while active, checked once done — not a list that grows as the
// user progresses.
//
// ADAPTIVE, NOT PRESET (revised 2026-07-30). This file used to render a
// fixed 9-step backbone: all five scoping groups always, even the ones this
// company would never be asked. The argument was stability over per-run
// precision. That was the right concern and the wrong conclusion — a step
// the user is shown, never does, and then gets credit for teaches them the
// rail is decorative, which costs us the credibility the ETA and the
// streaming draft both borrow from it.
//
// The fix keeps what the original decision actually cared about: the step
// list is computed ONCE, from real per-run data, at the moment that data
// exists — `scopingGroups` is known before the first question is rendered,
// so nothing is ever removed or reordered under the user. Stability was
// never in conflict with accuracy here; it was in conflict with *late*
// knowledge, and we have it early.
//
// Genuinely unknowable steps stay conditional: a rare AI retry
// (verifying/cross-checking) has no reserved slot and is appended only if it
// actually fires — that is information, not instability.
//
// Every name is a wordplay on the real EU legislative process, deliberately
// non-repeating end to end: the informal intake (your own input) reads as
// preliminary process — filing, review, consultation — and the AI's actual
// writing reads as the formal readings that follow it — first/second
// reading, committee markup. See project-management/brief-ux-plan.md.

import type { ReactNode } from "react";

export type ScopingGroup = { key: string; label: string };

export type TimedSubStage = {
  stage: string;
  label: string;
  at: number;
};

type FlatStatus = "done" | "current" | "upcoming";

type FlatStep = {
  key: string;
  label: string;
  icon: ReactNode;
  status: FlatStatus;
  elapsedSec?: number; // undefined = never show a timer for this step
  /** Stage id, so CSS can give the running step motion that depicts its actual
   *  work (pages flexing while reading, a nib tracing while writing). Only set
   *  for AI stages: during the wizard the user is the slow part, and animating
   *  then would imply we're busy when we're idle. */
  stage?: string;
};

const PROFILE_STEP = { label: "Filing the dossier", icon: <BriefcaseIcon /> };

// Scoping groups are keyed the same way questions.py/page.tsx group them
// (business/users_data/ai/context/more) — see GROUP_ORDER in page.tsx. This
// list fixes the *order* steps appear in; which of them appear at all comes
// from the `scopingGroups` prop, i.e. from this run.
const SCOPING_ORDER = ["business", "users_data", "ai", "context", "more"];
const SCOPING_STEPS: Record<string, { label: string; icon: ReactNode }> = {
  business: { label: "Preliminary review", icon: <ClipboardIcon /> },
  users_data: { label: "Impact assessment", icon: <ScaleIcon /> },
  ai: { label: "Technical consultation", icon: <GearIcon /> },
  context: { label: "Stakeholder consultation", icon: <ChatIcon /> },
  more: { label: "Committee referral", icon: <ForwardIcon /> },
};

// These three are UNCONDITIONAL — every run retrieves, drafts and sharpens —
// so showing them from the start is a fact about the pipeline, not a preset
// guess about this run. That's the line: fixed where the work is fixed,
// per-run where it varies (see the scoping groups above, and the conditional
// retries below). "retrieving" isn't an LLM call (a vector-search DB query)
// so it never carries a timer.
const CANONICAL_AI_ORDER = ["retrieving", "drafting", "sharpening"];
const AI_STAGES: Record<string, { label: string; icon: ReactNode; timed: boolean }> = {
  retrieving: { label: "First reading", icon: <BookIcon />, timed: false },
  drafting: { label: "Committee markup", icon: <PenIcon />, timed: true },
  sharpening: { label: "Second reading", icon: <LoopIcon />, timed: true },
  // Rare, genuinely conditional retries — not part of the guaranteed
  // backbone above, so they don't get a permanent slot; inserted live into
  // the list only if they actually fire (see the render logic below).
  verifying: { label: "Point of order", icon: <FlagIcon />, timed: true },
  "cross-checking": { label: "Plenary vote", icon: <BallotIcon />, timed: true },
};

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

type Props = {
  /** "profile" | "questions" | "report" — which macro phase the wizard is in right now. */
  phase: "profile" | "questions" | "report";
  /** Every scoping group this run will actually show, in order (groups skipped by core_questions() are simply absent). */
  scopingGroups: ScopingGroup[];
  scopingIndex: number;
  generating: boolean;
  /** Set once the report finishes generating, freezing the last AI step's timer. */
  reportEndedAt: number | null;
  subStages: TimedSubStage[];
  now: number;
};

export default function ProgressRail({
  phase,
  scopingGroups,
  scopingIndex,
  generating,
  reportEndedAt,
  subStages,
  now,
}: Props) {
  const steps: FlatStep[] = [];

  // 1. Profile — always visible, idle until entered.
  steps.push({
    key: "profile",
    ...PROFILE_STEP,
    status: phase === "profile" ? "current" : "done",
  });

  // 2. Scoping — only the groups THIS run will actually ask about, in the
  // canonical order. Before the profile is submitted we don't know the list
  // yet, so the full set is shown as a preview of the shape; from the moment
  // `scopingGroups` arrives it is the truth and nothing is added after.
  // A company that doesn't use AI never sees a "Technical consultation" step
  // it will not be asked to complete.
  const knownGroups = scopingGroups.length > 0;
  const groupKeys = knownGroups
    ? SCOPING_ORDER.filter((key) => scopingGroups.some((g) => g.key === key))
    : SCOPING_ORDER;
  groupKeys.forEach((key) => {
    const meta = SCOPING_STEPS[key];
    const realIdx = scopingGroups.findIndex((g) => g.key === key);
    let status: FlatStatus;
    if (phase === "report") status = "done";
    else if (phase === "profile" || realIdx === -1) status = "upcoming";
    else status = realIdx < scopingIndex ? "done" : realIdx === scopingIndex ? "current" : "upcoming";
    steps.push({ key: `scope-${key}`, label: meta.label, icon: meta.icon, status });
  });

  // 3. AI generation calls — the fixed canonical 3 (retrieval, draft,
  // self-critique) are always visible too; a rare conditional retry
  // (verifying/cross-checking) isn't part of that guaranteed backbone, so
  // it only appears — appended after the fixed 3 — if it actually fires.
  function aiStatusAndElapsed(stage: string): { status: FlatStatus; elapsedSec?: number } {
    if (phase !== "report") return { status: "upcoming" };
    const idx = subStages.findIndex((s) => s.stage === stage);
    if (idx === -1) return { status: "upcoming" };
    const meta = AI_STAGES[stage];
    const isLastOverall = idx === subStages.length - 1;
    const current = isLastOverall && generating && !reportEndedAt;
    if (!meta.timed) return { status: current ? "current" : "done" };
    const end = isLastOverall ? reportEndedAt ?? now : subStages[idx + 1].at;
    return { status: current ? "current" : "done", elapsedSec: Math.max(0, Math.round((end - subStages[idx].at) / 1000)) };
  }
  CANONICAL_AI_ORDER.forEach((key) => {
    const meta = AI_STAGES[key];
    const { status, elapsedSec } = aiStatusAndElapsed(key);
    steps.push({ key: `ai-${key}`, label: meta.label, icon: meta.icon, status, elapsedSec, stage: key });
  });
  if (phase === "report") {
    subStages
      .filter((s) => !CANONICAL_AI_ORDER.includes(s.stage))
      .forEach((s) => {
        const meta = AI_STAGES[s.stage] ?? { label: s.label, icon: <DotIcon />, timed: false };
        const { status, elapsedSec } = aiStatusAndElapsed(s.stage);
        steps.push({
          key: `ai-${s.stage}`,
          label: meta.label,
          icon: meta.icon,
          status,
          elapsedSec,
          stage: s.stage,
        });
      });
  }

  return (
    <aside className="rail" aria-label="Progress">
      <ul className="rail-steps">
        {steps.map((s) => (
          <li className={`rail-step ${s.status}${s.stage ? ` stage-${s.stage}` : ""}`} key={s.key}>
            <span className="rail-icon">{s.status === "done" ? <CheckIcon /> : s.icon}</span>
            <span className="rail-step-label">{s.label}</span>
            {s.elapsedSec !== undefined && (
              <span className="rail-elapsed">{formatElapsed(s.elapsedSec)}</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

// --- Icons: hand-drawn line icons, matching the site's thin-line aesthetic
// (see the parliament/hero illustrations) rather than a filled icon-font
// look. All stroke-based, currentColor so they inherit the rail's
// per-status text color. ---

function iconProps() {
  return {
    width: 17,
    height: 17,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function BriefcaseIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="2.5" y="6.5" width="15" height="10" rx="1.5" />
      <path d="M7 6.5V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M2.5 11h15" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="3.5" width="12" height="14" rx="1.5" />
      <path d="M7.5 3.5V3a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 3v.5" />
      <path d="M7 9.5l1.5 1.5L11 8" />
      <path d="M7 14h6" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M10 2.5v15M6 17.5h8" />
      <path d="M3 6h6M11 6h6" />
      <path d="M3 6l-2 4.5a2.2 2.2 0 0 0 4 0z" />
      <path d="M17 6l-2 4.5a2.2 2.2 0 0 0 4 0z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2.5v2.2M10 15.3v2.2M17.5 10h-2.2M4.7 10H2.5" />
      <path d="M15.3 4.7l-1.5 1.5M6.2 13.8l-1.5 1.5M15.3 15.3l-1.5-1.5M6.2 6.2L4.7 4.7" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8l-3 2.5v-2.5H4a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M13.5 6.2h2.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-.5v2l-2.3-2h-3.2" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 10h13" />
      <path d="M11 4.5L16.5 10 11 15.5" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M10 5.2C8.8 4 6.8 3.5 3.5 3.5v11c3.3 0 5.3.5 6.5 1.7" />
      <path d="M10 5.2c1.2-1.2 3.2-1.7 6.5-1.7v11c-3.3 0-5.3.5-6.5 1.7" />
      <path d="M10 5.2v12.2" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M13.5 3.5l3 3-8.7 8.7-3.6.6.6-3.6z" />
      <path d="M12 5l3 3" />
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 10a6 6 0 0 1 10.2-4.3M16 10a6 6 0 0 1-10.2 4.3" />
      <path d="M14.2 2.5v3.2h-3.2" />
      <path d="M5.8 17.5v-3.2H9" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M5 17.5V3" />
      <path d="M5 3.5c1.6-1 3.6-1 5.2 0s3.6 1 5.2 0v7c-1.6 1-3.6 1-5.2 0s-3.6-1-5.2 0" />
    </svg>
  );
}

function BallotIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="3" width="14" height="14" rx="1.5" />
      <path d="M6.5 10.2l2 2 4.5-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.12" />
      <path d="M6 10.2l2.4 2.4L14.5 6.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="3.5" fill="currentColor" />
    </svg>
  );
}
