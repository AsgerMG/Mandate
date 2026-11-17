"use client";
// "Needs you": the one page that says what the owner can do, today, to make
// the brain on screen better, in order of value, each a single action.
import { useCallback, useEffect, useState } from "react";
import { BRAIN_DOMAIN, BRAIN_LABEL, type Brain } from "@/lib/bench/model";
import type { BrainStanding, Need, NeedKind } from "@/lib/bench/needs";
import { api } from "./api";
import { Markdown } from "./markdown";

const GROUP: { kind: NeedKind; title: string; why: string }[] = [
  { kind: "grade", title: "Grade runs", why: "Until the judge has your grades, every score is a guess. Five grades let it learn your standard." },
  { kind: "approve", title: "Approve playbook changes", why: "The loop kept these because they scored better. You have the last word." },
  { kind: "confirm", title: "Confirm the checks on test cases", why: "The judge grades every answer against these. A wrong check teaches the wrong habit." },
  { kind: "feedback", title: "Turn your notes into lessons", why: "Your comments become playbook changes, re-tested before they stay." },
  { kind: "expert", title: "Waiting for the expert", why: "Nothing to do now: these need the policy expert's model answers." },
];

export function NeedsView({ brain, refreshKey, onGo }: { brain: Brain; refreshKey: number; onGo: (href: string) => void }) {
  const [data, setData] = useState<{ standing: BrainStanding; needs: Need[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    api<{ standing: BrainStanding; needs: Need[] }>(`/api/bench/needs?brain=${brain}`).then(setData).catch((e) => setErr((e as Error).message));
  }, [brain, refreshKey, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const actionable = (data?.needs ?? []).filter((n) => n.kind !== "expert");
  const minutes = actionable.reduce((s, n) => s + n.minutes, 0);
  const s = data?.standing;
  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div>
          <p className="bench-eyebrow"><span className="bench-brain-dot" data-brain={brain} /> {BRAIN_LABEL[brain]} · {BRAIN_DOMAIN[brain]}</p>
          <h1 className="bench-page__title">What {BRAIN_LABEL[brain]} needs from you</h1>
          <p className="bench-page__lede">
            Everything you can do today that makes {BRAIN_LABEL[brain]} better, most valuable first. Each is one action.
            {data && (actionable.length ? <> <b>{actionable.length} things, about {minutes} minutes.</b></> : <> <b>Nothing waiting on you.</b></>)}
          </p>
        </div>
      </header>
      {s && (
        <div className="bench-needs__standing">
          <Stat label="Score on unseen cases" value={s.heldout_median === null ? "–" : String(s.heldout_median)} sub={`median of ${s.heldout_cases} held-out case${s.heldout_cases === 1 ? "" : "s"} · the bar is ${s.bar}`} warn={s.heldout_median !== null && s.heldout_median < s.bar} />
          <Stat label="Your grades so far" value={String(s.owner_grades)} sub={s.owner_grades >= 5 ? "enough to check the judge against you" : `${5 - s.owner_grades} more and the judge can be checked against you`} warn={s.owner_grades < 5} />
        </div>
      )}
      {err && <div className="bench-alert"><p>{err}</p></div>}
      {!data && !err && <div className="bench-skel h-48" />}
      {data && GROUP.map((g) => {
        const items = data.needs.filter((n) => n.kind === g.kind);
        if (!items.length) return null;
        return (
          <section key={g.kind} className="bench-needs__group" data-kind={g.kind}>
            <header className="bench-needs__head">
              <h2>{g.title} <span className="bench-count">{items.length}</span></h2>
              <p>{g.why}</p>
            </header>
            <ul>
              {items.map((n) => <NeedRow key={`${n.kind}:${n.ref}`} need={n} onGo={onGo} onDone={reload} />)}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="bench-needs__stat" data-warn={warn || undefined}>
      <span className="bench-needs__stat-label">{label}</span>
      <span className="bench-needs__stat-value">{value}</span>
      <span className="bench-needs__stat-sub">{sub}</span>
    </div>
  );
}

function NeedRow({ need, onGo, onDone }: { need: Need; onGo: (href: string) => void; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const inline = need.kind === "approve" || need.kind === "confirm" || need.kind === "expert";
  async function answer(verdict: "ok" | "change") {
    setState("saving"); setErr(null);
    try { await api("/api/bench/needs", { json: { kind: need.kind, ref: need.ref, verdict, note } }); onDone(); }
    catch (e) { setState("error"); setErr((e as Error).message); }
  }
  return (
    <li className="bench-needs__item" data-open={open || undefined}>
      <div className="bench-needs__row">
        <div className="min-w-0 flex-1">
          <p className="bench-needs__title">{need.title}</p>
          <p className="bench-needs__detail">{need.detail}</p>
        </div>
        {need.minutes > 0 && <span className="bench-muted text-[11px] whitespace-nowrap">~{need.minutes} min</span>}
        {need.href
          ? <button className="bench-btn bench-btn--small" onClick={() => onGo(need.href!)}>{need.kind === "grade" ? "Read and grade" : "Open"} →</button>
          : inline && <button className="bench-btn bench-btn--small bench-btn--ghost" onClick={() => setOpen((o) => !o)}>{open ? "Close" : need.kind === "expert" ? "Look" : "Review"}</button>}
      </div>
      {open && need.body && (
        <div className="bench-needs__body">
          {need.body.markdown && <Markdown text={need.body.markdown} className="bench-md bench-md--doc" />}
          {need.body.asks && <><p className="bench-needs__label">The founder asks</p><blockquote className="bench-needs__ask">{need.body.asks}</blockquote></>}
          {need.body.must && need.body.must.length > 0 && <><p className="bench-needs__label">A senior answer must</p><ol className="bench-needs__checks">{need.body.must.map((m, i) => <li key={i}>{m}</li>)}</ol></>}
          {need.body.must_not && need.body.must_not.length > 0 && <><p className="bench-needs__label">It must not</p><ol className="bench-needs__checks" data-not>{need.body.must_not.map((m, i) => <li key={i}>{m}</li>)}</ol></>}
          {need.kind !== "expert" && (
            <div className="bench-needs__answer">
              <textarea className="bench-fb__input" rows={2} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder={need.kind === "approve" ? "Anything off? (optional if it reads right)" : "What is wrong or missing? Name the check by number. (optional if right)"} />
              <div className="flex gap-2">
                <button className="bench-btn bench-btn--small" disabled={state === "saving"} onClick={() => void answer("ok")}>{need.kind === "approve" ? "Reads right" : "Checks are right"}</button>
                <button className="bench-btn bench-btn--small bench-btn--ghost" disabled={state === "saving" || !note.trim()} title={!note.trim() ? "Write what to change first" : undefined} onClick={() => void answer("change")}>Needs a change</button>
              </div>
              {err && <p className="bench-alert mt-2"><span>{err}</span></p>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
