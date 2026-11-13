"use client";

// Reviewing an eval run as a chat: the comment control under each brain reply
// (good / off and a free-text comment, typed or dictated), the run's panel
// (the case, the judge's verdict, the reviewer's 1-5 grade), and the reviewer's
// name (default the owner; the expert types theirs once, it is remembered on
// this laptop). Every comment and grade is a feedback item linked to the run,
// the case and the reply, so Distil reads it. Leaf module: no chat-view import.
import { useState, useSyncExternalStore } from "react";
import {
  BRAIN_LABEL, DEFAULT_REVIEWER, reviewerName, THEME_LABEL, THEMES,
  type BenchConversation, type BenchMessage, type Review, type Theme,
} from "@/lib/bench/model";
import { api, when } from "./api";
import { Recorder } from "./recorder";

const REVIEWER_KEY = "bench.reviewer";
const REVIEWER_EVENT = "bench:reviewer";
const sub = (cb: () => void) => {
  window.addEventListener(REVIEWER_EVENT, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener(REVIEWER_EVENT, cb); window.removeEventListener("storage", cb); };
};
const read = () => localStorage.getItem(REVIEWER_KEY) ?? "";

/** The reviewer's name as typed (may be empty while typing) and its setter. */
export function useReviewer(): [string, (v: string) => void] {
  const v = useSyncExternalStore(sub, read, () => "");
  const set = (next: string) => { localStorage.setItem(REVIEWER_KEY, next.slice(0, 60)); window.dispatchEvent(new Event(REVIEWER_EVENT)); };
  return [v, set];
}

export function ReviewerField({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useReviewer();
  return (
    <label className="bench-reviewer" data-compact={compact || undefined}>
      <span>Reviewing as</span>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={compact ? "Your name" : DEFAULT_REVIEWER} maxLength={60} aria-label="Your name" />
    </label>
  );
}

const GRADE_WORDS: Record<number, string> = { 5: "send to a client as is", 4: "light edits", 3: "right idea, rework", 2: "misses the point", 1: "wrong" };

type Saved = { conversation: BenchConversation | null };

/** Under one brain reply: what reviewers said, and the control to add a comment. */
export function ReviewComments({ convId, index, reviews, onSaved }: {
  convId: string; index: number; reviews: Review[]; onSaved: (c: BenchConversation) => void;
}) {
  const [name] = useReviewer();
  const [open, setOpen] = useState<null | "good" | "off" | "note">(null);
  const [theme, setTheme] = useState<Theme>("other");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    const rating = open === "good" || open === "off" ? open : null;
    if (!rating && !note.trim()) { setErr("Write the comment first."); return; }
    setSaving(true); setErr(null);
    try {
      const r = await api<Saved>("/api/bench/feedback", { json: { kind: "reply", conversationId: convId, messageIndex: index, rating, theme, note: note.trim(), reviewer: reviewerName(name) } });
      if (r.conversation) onSaved(r.conversation);
      setOpen(null); setNote(""); setTheme("other");
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <div className="bench-rv">
      {reviews.length > 0 && (
        <ul className="bench-rv__list">
          {reviews.map((r) => (
            <li key={r.item_id} className="bench-rv__item" data-rating={r.rating ?? "note"}>
              <span className="bench-rv__mark" aria-hidden>{r.rating === "good" ? "✓" : r.rating === "off" ? "●" : "✎"}</span>
              <span className="min-w-0 flex-1">
                <span className="bench-rv__who">{r.reviewer}{r.rating ? <> · {r.rating === "good" ? "good" : "off"}</> : null} · {when(r.at)}</span>
                {r.note && <span className="bench-rv__note">{r.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        <div className="bench-rv__bar">
          <span className="bench-rv__label">Your read of this reply</span>
          <button className="bench-fb__btn" data-tone="good" onClick={() => setOpen("good")}>Good</button>
          <button className="bench-fb__btn" data-tone="off" onClick={() => setOpen("off")}>Off</button>
          <button className="bench-fb__btn" onClick={() => setOpen("note")}>Comment</button>
        </div>
      ) : (
        <form className="bench-rv__form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="flex flex-wrap items-center gap-1">
            {(["good", "off", "note"] as const).map((k) => (
              <button type="button" key={k} className="bench-fb__chip" data-on={open === k || undefined} onClick={() => setOpen(k)}>{k === "good" ? "Good" : k === "off" ? "Off" : "Comment only"}</button>
            ))}
            {open === "off" && <span className="bench-rv__sep" aria-hidden />}
            {open === "off" && THEMES.map((t) => <button type="button" key={t} className="bench-fb__chip" data-on={theme === t || undefined} onClick={() => setTheme(t)}>{THEME_LABEL[t]}</button>)}
          </div>
          <div className="mt-2 flex items-start gap-2">
            <textarea autoFocus rows={3} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} className="bench-fb__input bench-rv__text"
              placeholder={open === "good" ? "What is right here, so it stays (optional)" : open === "off" ? "What is off, and what a senior would have said instead" : "Your comment on this reply"}
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(null); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } e.stopPropagation(); }} />
            <Recorder value={note} onChange={setNote} compact />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button className="bench-btn bench-btn--small" disabled={saving}>{saving ? "Saving…" : "Save comment"}</button>
            <button type="button" className="bench-link text-[11px]" onClick={() => { setOpen(null); setErr(null); }}>Cancel</button>
            <span className="bench-muted">as <b>{reviewerName(name)}</b> · <kbd>⌘</kbd>+<kbd>Enter</kbd> saves</span>
          </div>
        </form>
      )}
      {err && <span className="bench-fb__err">{err}</span>}
    </div>
  );
}

/** The right panel of a run under review. `expert` hides the judge's and the
 *  owner's grades, so the expert reads the run without an anchor. */
export function RunPanel({ conv, expert, onSaved }: { conv: BenchConversation; expert: boolean; onSaved: (c: BenchConversation) => void }) {
  const run = conv.eval_run;
  const j = run?.judge;
  const replies = conv.messages.filter((m) => m.role === "agent").length;
  const comments = conv.messages.reduce((n, m) => n + (m.reviews?.length ?? 0), 0);
  const [name] = useReviewer();
  return (
    <>
      {expert && !name.trim() && <p className="bench-alert mb-4"><span>Type your name at the top first, so your comments carry it.</span></p>}
      <p className="bench-eyebrow">{expert ? "Your review" : "Eval run"}</p>
      <h2 className="bench-panel-title">{run ? run.case_id.replace(/_/g, " ") : conv.title}</h2>
      <p className="bench-panel-sub">
        {BRAIN_LABEL[conv.brain]}{run && <> · {run.tag === "bench" ? "saved bench run" : run.tag === "retest" ? "re-test" : `run ${run.tag}`} · {new Date(run.ran_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>}
      </p>
      {!expert && <ReviewerField />}
      <ReviewGradeBox conv={conv} onSaved={onSaved} />
      <p className="bench-muted mt-3">{comments} comment{comments === 1 ? "" : "s"} on {replies} repl{replies === 1 ? "y" : "ies"}. Each goes to the feedback inbox, linked to this run, its case and the reply, for Distil.</p>
      {!expert && run && (
        <section className="bench-judge">
          <h3 className="bench-eyebrow">The judge</h3>
          {j ? (
            <>
              <p className="mt-1.5 flex items-center gap-2 text-[12px] text-[#2b3c5e]">
                {j.grade ? <span className="bench-grade" data-grade={j.grade}>{j.grade}</span> : <span className="bench-muted">no grade</span>}
                <span>{j.scale ?? (j.grade ? GRADE_WORDS[j.grade] : "")}{j.must_total ? ` · musts ${j.must_met ?? 0}${j.must_partly ? `+${j.must_partly} partly` : ""} of ${j.must_total}` : ""}{j.must_not_hit ? ` · ${j.must_not_hit} must-not hit` : ""}</span>
              </p>
              {j.overall && <p className="bench-judge__text">{j.overall}</p>}
              {j.strongest && <p className="bench-judge__text"><b>Strongest:</b> {j.strongest}</p>}
              {j.weakest && <p className="bench-judge__text"><b>Weakest:</b> {j.weakest}</p>}
            </>
          ) : <p className="bench-panel-empty">Not judged.</p>}
          {run.owner_grade && <p className="bench-judge__text">Owner&apos;s grade in the transcript: <b>{run.owner_grade}</b></p>}
          {run.run_file && <p className="bench-judge__file"><code>{run.run_file}</code></p>}
        </section>
      )}
    </>
  );
}

function ReviewGradeBox({ conv, onSaved }: { conv: BenchConversation; onSaved: (c: BenchConversation) => void }) {
  const [name] = useReviewer();
  const me = reviewerName(name);
  const mine = [...(conv.review_grades ?? [])].reverse().find((g) => g.reviewer === me);
  const [pick, setPick] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const others = (conv.review_grades ?? []).filter((g) => g.reviewer !== me);
  async function save() {
    if (!pick) return;
    setSaving(true); setErr(null);
    try {
      const r = await api<Saved>("/api/bench/feedback", { json: { kind: "conversation", conversationId: conv.id, grade: pick, note: note.trim(), reviewer: me } });
      if (r.conversation) onSaved(r.conversation);
      setPick(null); setNote("");
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  const shown = pick ?? mine?.grade ?? null;
  return (
    <section className="bench-rv-grade">
      <h3 className="bench-eyebrow">The whole answer, 1 to 5</h3>
      <div className="bench-grade-pick bench-grade-pick--small" role="radiogroup" aria-label="Grade">
        {[1, 2, 3, 4, 5].map((g) => <button key={g} role="radio" aria-checked={shown === g} data-on={shown === g || undefined} title={GRADE_WORDS[g]} onClick={() => setPick(g)}>{g}</button>)}
      </div>
      <p className="bench-muted mt-1 text-[11px]">{shown ? GRADE_WORDS[shown] : "5 send to a client as is · 1 wrong"}</p>
      {pick !== null && (
        <div className="mt-2 space-y-2">
          <div className="flex items-start gap-2">
            <textarea rows={2} className="bench-fb__input bench-rv__text" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder={pick <= 3 ? "What would make it a 5?" : "Optional: what makes it work"} />
            <Recorder value={note} onChange={setNote} compact />
          </div>
          <button className="bench-btn bench-btn--small" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : mine ? "Save the new grade" : "Save the grade"}</button>
        </div>
      )}
      {mine && pick === null && <p className="bench-ok mt-2">Your grade: <b>{mine.grade}</b>{mine.note ? <>, &ldquo;{mine.note}&rdquo;</> : null} <span className="bench-muted">· {when(mine.at)}</span></p>}
      {others.length > 0 && (
        <ul className="mt-2 space-y-1">
          {others.map((g) => <li key={g.item_id} className="text-[11.5px] text-[#2b3c5e]"><span className="bench-grade" data-grade={g.grade}>{g.grade}</span> {g.reviewer}{g.note ? <>: <i>{g.note}</i></> : null}</li>)}
        </ul>
      )}
      {err && <p className="bench-fb__err">{err}</p>}
    </section>
  );
}

/** How many replies of a run this reviewer has commented, and whether they graded it. */
export function reviewProgress(conv: Pick<BenchConversation, "messages" | "review_grades">, reviewer: string) {
  const replies = conv.messages.filter((m: BenchMessage) => m.role === "agent");
  return {
    replies: replies.length,
    commented: replies.filter((m) => m.reviews?.some((r) => r.reviewer === reviewer)).length,
    graded: !!conv.review_grades?.some((g) => g.reviewer === reviewer),
  };
}
