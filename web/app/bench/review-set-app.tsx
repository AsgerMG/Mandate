"use client";

// The expert's review set (/bench/review/<id>): the runs in order with a clear
// "Case 1 of 4" header, each the same chat and Board tab as on the bench, a
// comment control on every reply and a 1-5 grade of the whole. Nothing else:
// no rail, no Train, no Distil, no judge's grade (the expert reads unanchored).
// The case shown is in the hash (#2), so a reload lands where they were.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BRAIN_LABEL, reviewerName, type EvalRunSummary, type ReviewSet } from "@/lib/bench/model";
import { api } from "./api";
import { ChatView, type Activity, type Draft } from "./chat-view";
import { ReviewerField, useReviewer } from "./review-views";

const DRAFT: Draft = { agent: "regina", brain: "regina", kind: "chat", mandateId: null };
const noop = () => {};
const noActivity = (_: Activity) => {}; // eslint-disable-line @typescript-eslint/no-unused-vars
const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
const readStep = () => Math.max(1, Number.parseInt(window.location.hash.replace(/^#/, ""), 10) || 1);

type SetData = { set: ReviewSet; runs: (EvalRunSummary | null)[]; missing: string[] };

export function ReviewSetApp({ setId }: { setId: string }) {
  const [data, setData] = useState<SetData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const step = useSyncExternalStore(subscribe, readStep, () => 1);
  const [name] = useReviewer();
  const me = reviewerName(name);
  const load = useCallback(() => {
    api<SetData>(`/api/bench/review-sets?id=${encodeURIComponent(setId)}`).then(setData).catch((e) => setErr((e as Error).message));
  }, [setId]);
  useEffect(() => { load(); }, [load, tick]);

  if (err) return <div className="mb-page"><div className="bench-empty-state"><h2>This review set could not be opened.</h2><p>{err}</p></div></div>;
  if (!data) return <div className="mb-page"><div className="bench-skel mx-auto mt-16 h-64 max-w-3xl" /></div>;
  const runs = data.runs.filter((r): r is EvalRunSummary => !!r);
  const n = runs.length;
  const i = Math.min(step, Math.max(n, 1)) - 1;
  const run = runs[i];
  const goTo = (k: number) => { history.pushState(null, "", `#${k + 1}`); window.dispatchEvent(new HashChangeEvent("hashchange")); setTick((t) => t + 1); };

  return (
    <div className="bench-shell bench-shell--set" data-view="review-set">
      <header className="bench-set-head">
        <div className="bench-set-head__id">
          <span className="bench-brand__mark">M</span>
          <span className="min-w-0">
            <span className="bench-eyebrow block">Review · {data.set.title}</span>
            <span className="bench-set-head__step">{n ? <>Case {i + 1} of {n}</> : "No runs"}{run && <span className="bench-set-head__case"> · {run.case_id.replace(/_/g, " ")} · {BRAIN_LABEL[run.brain]}</span>}</span>
          </span>
        </div>
        <nav className="bench-set-steps" aria-label="Cases">
          {runs.map((r, k) => {
            const done = r.reviewers.includes(me);
            return (
              <button key={r.id} aria-current={k === i ? "step" : undefined} data-done={done || undefined} onClick={() => goTo(k)} title={`${r.case_id.replace(/_/g, " ")}${done ? " (you have commented)" : ""}`}>
                {done ? "✓" : k + 1}
              </button>
            );
          })}
        </nav>
        <div className="bench-set-head__tools">
          <ReviewerField compact />
          <button className="bench-btn bench-btn--ghost bench-btn--small" disabled={i <= 0} onClick={() => goTo(i - 1)}>← Previous</button>
          <button className="bench-btn bench-btn--small" disabled={i >= n - 1} onClick={() => goTo(i + 1)}>Next case →</button>
        </div>
        {data.set.note && i === 0 && <p className="bench-set-head__note">{data.set.note}</p>}
      </header>
      {run ? (
        <ChatView
          key={run.id}
          convId={run.id}
          draft={DRAFT}
          mandate={null}
          review={{ expert: true }}
          onOpened={noop}
          onListChanged={load}
          onActivity={noActivity}
          onOpenMandate={noop}
          onOpenConversation={noop}
        />
      ) : <div className="bench-empty-state"><h2>No runs in this set.</h2></div>}
    </div>
  );
}
