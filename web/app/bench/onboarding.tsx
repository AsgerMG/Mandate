"use client";

// First-run onboarding for the bench: four short steps, shown once, remembered
// in localStorage, re-openable from "How this works" in the rail.
import { useState } from "react";

export const ONBOARDED_KEY = "bench.onboarded";

const STEPS: { tag: string; title: string; body: React.ReactNode }[] = [
  {
    tag: "What this is",
    title: "Your training ground.",
    body: (
      <>
        Bring Wincent or Regina a real case and work it together. It runs on this Mac and on your
        own Claude plan, so nothing here is public and nothing costs API credit.
      </>
    ),
  },
  {
    tag: "Talking",
    title: "Speak or type.",
    body: (
      <>
        Hold the mic button (or Space, while the message box is empty) and talk; let go and it is transcribed here on the
        laptop. Or just type. Pick the brain at the top left, then start a new case.
      </>
    ),
  },
  {
    tag: "Training",
    title: "Tell it what was good, and what was off.",
    body: (
      <>
        Mark any reply good or off, with a word on why. Grade the conversation 1 to 5. When notes
        pile up in the Feedback inbox, Distil turns them into playbook edits you accept, and Re-test
        shows whether the brain got better.
      </>
    ),
  },
  {
    tag: "Experts",
    title: "Interviews capture how a pro thinks.",
    body: (
      <>
        Under Train, Interviews sits an expert down with the interviewer: one question at a time,
        real cases, their habits. At the end it proposes lessons for the brain.
      </>
    ),
  },
];

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <div className="bench-onboard" role="dialog" aria-modal="true" aria-labelledby="bench-onboard-title" onClick={onClose}>
      <div className="bench-onboard__card" onClick={(e) => e.stopPropagation()}>
        <button className="bench-onboard__skip" onClick={onClose}>Skip</button>
        <p className="bench-eyebrow">{step.tag} · {i + 1} of {STEPS.length}</p>
        <h2 id="bench-onboard-title" className="bench-onboard__title">{step.title}</h2>
        <p className="bench-onboard__body">{step.body}</p>
        <div className="bench-onboard__foot">
          <div className="bench-onboard__dots" aria-hidden>
            {STEPS.map((_, n) => <i key={n} data-on={n === i || undefined} />)}
          </div>
          <div className="flex gap-2">
            {i > 0 && <button className="bench-btn bench-btn--ghost bench-btn--small" onClick={() => setI(i - 1)}>Back</button>}
            <button className="bench-btn bench-btn--small" autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? "Start" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
