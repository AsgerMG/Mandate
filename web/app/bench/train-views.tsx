"use client";

// Train: interview an expert, grade saved runs, read the playbooks, and see
// each brain's grades over time.
import { useEffect, useMemo, useState } from "react";
import {
  BRAIN_LABEL, BRAINS, groupEvalRuns, type Brain, type ConversationSummary, type EvalRunSummary, type ReviewSet, type RunGrade, type RunSummary,
} from "@/lib/bench/model";
import { api, when } from "./api";
import { LESSON_LABEL } from "./chat-view";
import { Markdown } from "./markdown";

/** Start a conversation on the server and hand back its id as soon as it
 *  exists; the turn runs on, and the chat view re-attaches to it. */
async function startConversation(body: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/bench/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `The app answered ${res.status}.`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const m = buf.match(/"t":"conversation","id":"([a-z0-9-]+)"/);
    if (m) { void reader.cancel(); return m[1]; }
  }
  throw new Error("The conversation did not start.");
}

const guideBrain = (g: string): Brain => (/^wincent|funding/.test(g) ? "wincent" : "regina");

export function InterviewsView({ onOpen, refreshKey }: { onOpen: (id: string) => void; refreshKey: number }) {
  const [guides, setGuides] = useState<string[]>([]);
  const [past, setPast] = useState<ConversationSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  useEffect(() => {
    api<{ conversations: ConversationSummary[]; guides: string[] }>("/api/bench/conversations").then((r) => {
      setGuides(r.guides); setPast(r.conversations.filter((c) => c.agent === "interviewer"));
    }).catch((e) => setErr((e as Error).message));
  }, [refreshKey]);
  async function start(guide: string) {
    setStarting(guide); setErr(null);
    try {
      const brain = guideBrain(guide);
      onOpen(await startConversation({ agent: "interviewer", brain, kind: "interview", guide, title: `Interview for ${BRAIN_LABEL[brain]} (${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`, message: "We are ready. Please open the interview." }));
    } catch (e) { setErr((e as Error).message); setStarting(null); }
  }
  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div>
          <p className="bench-eyebrow">Train · Interviews</p>
          <h1 className="bench-page__title">Interview an expert</h1>
          <p className="bench-page__lede">The interviewer runs a guide one question at a time, probes for real cases and mirrors habits back. The expert speaks (transcribed on this Mac) or types. <b>Finish &amp; distil</b> then proposes playbook edits, eval cases and the habits list for you to accept.</p>
        </div>
      </header>
      {err && <div className="bench-alert"><p>{err}</p></div>}
      <div className="bench-grid">
        {guides.map((g) => (
          <div key={g} className="bench-card bench-card--static">
            <span className="bench-eyebrow">For {BRAIN_LABEL[guideBrain(g)]}</span>
            <span className="bench-card__title">{g.replace(/\.md$/, "").replace(/_/g, " ")}</span>
            <span className="bench-card__brief"><code>mandate/playbooks/interviews/{g}</code></span>
            <button className="bench-btn mt-3 self-start" disabled={!!starting} onClick={() => void start(g)}>{starting === g ? "Opening…" : "Start the interview"}</button>
          </div>
        ))}
        {guides.length === 0 && past && <div className="bench-empty-state"><h2>No interview guides.</h2><p>Add one under <code>mandate/playbooks/interviews/</code>.</p></div>}
      </div>
      <h2 className="bench-section-title">Past interviews and lessons</h2>
      {past?.length === 0 && <p className="bench-panel-empty">None yet.</p>}
      <ul className="divide-y divide-[#e6dfd1]">
        {past?.map((c) => (
          <li key={c.id}><button className="bench-conv-row" onClick={() => onOpen(c.id)}>
            <span className="bench-brain-dot" data-brain="interviewer" />
            <span className="min-w-0 flex-1 truncate">{c.title}</span>
            {c.running && <span className="bench-live">working</span>}
            <span className="bench-muted">{c.kind} · {BRAIN_LABEL[c.brain]} · {c.turns} turns · {when(c.updated_at)}</span>
          </button></li>
        ))}
      </ul>
    </section>
  );
}

const tagLabel = (t: string) => (t === "bench" ? "saved bench run" : t === "retest" ? "re-test" : t.replace(/_/g, " "));
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Train, Review runs: every eval run as a chat, grouped by case and brain,
 *  latest first; pick some to hand to the expert as a review set. */
export function ReviewRunsView({ onOpen }: { onOpen: (id: string) => void }) {
  const [data, setData] = useState<{ runs: EvalRunSummary[]; sets: ReviewSet[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [made, setMade] = useState<ReviewSet | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => { api<{ runs: EvalRunSummary[]; sets: ReviewSet[] }>("/api/bench/eval-runs").then(setData).catch((e) => setErr((e as Error).message)); }, [key]);
  const groups = useMemo(() => groupEvalRuns(data?.runs ?? []), [data]);
  const byId = useMemo(() => new Map((data?.runs ?? []).map((r) => [r.id, r])), [data]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  async function makeSet() {
    setErr(null);
    try {
      const r = await api<{ set: ReviewSet }>("/api/bench/review-sets", { json: { title: title.trim() || `Review of ${picked.length} runs`, conversation_ids: picked } });
      setMade(r.set); setPicked([]); setTitle(""); setKey((k) => k + 1);
    } catch (e) { setErr((e as Error).message); }
  }
  const link = (s: ReviewSet) => `${typeof window === "undefined" ? "" : window.location.origin}/bench/review/${s.id}`;
  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div>
          <p className="bench-eyebrow">Train · Review runs</p>
          <h1 className="bench-page__title">Read every run as a chat</h1>
          <p className="bench-page__lede">Each eval run, the founder&apos;s messages and the brain&apos;s replies, with the board. Open one, comment on each reply (good, off, or a note; typed or spoken) and grade the whole 1 to 5. Every comment lands in the feedback inbox linked to the run, so Distil uses it. Tick runs to hand the expert a review set.</p>
        </div>
      </header>
      {err && <div className="bench-alert"><p>{err}</p></div>}
      {made && (
        <div className="bench-ok mb-5">Review set <b>{made.title}</b> made. Send the expert this link (it opens on this laptop&apos;s bench): <code>{link(made)}</code> <a className="bench-link" href={`/bench/review/${made.id}`} target="_blank" rel="noreferrer">Open it ↗</a></div>
      )}
      {picked.length > 0 && (
        <div className="bench-setbar">
          <span className="bench-setbar__count">{picked.length} picked</span>
          <span className="bench-setbar__order">{picked.map((id, i) => <span key={id}>{i + 1}. {byId.get(id)?.case_id.replace(/_/g, " ")}</span>)}</span>
          <input className="bench-fb__input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Name the set, e.g. Regina, for the expert" />
          <button className="bench-btn bench-btn--small" onClick={() => void makeSet()}>Make the review set</button>
          <button className="bench-link text-[11px]" onClick={() => setPicked([])}>Clear</button>
        </div>
      )}
      {!data && !err && <div className="bench-skel h-48" />}
      {data && data.runs.length === 0 && (
        <div className="bench-empty-state"><h2>No runs as chats yet.</h2><p>Every new <code>loop run</code> and re-test is written here. To bring in the runs already saved: <code>PYTHONPATH=. python3 -m mandate.eval.run_conversation import</code></p></div>
      )}
      <div className="bench-rgroups">
        {groups.map((g) => (
          <section key={`${g.case_id}:${g.brain}`} className="bench-rgroup">
            <header className="bench-rgroup__head">
              <span className="bench-brain-dot" data-brain={g.brain} />
              <h2>{g.case_id.replace(/_/g, " ")}</h2>
              <span className="bench-muted">{BRAIN_LABEL[g.brain]} · {g.runs.length} run{g.runs.length === 1 ? "" : "s"}</span>
            </header>
            <ul>
              {g.runs.map((r) => (
                <li key={r.id} className="bench-rrow" data-picked={picked.includes(r.id) || undefined}>
                  <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label="Add to a review set" />
                  <button className="bench-rrow__main" onClick={() => onOpen(r.id)}>
                    <span className="bench-rrow__tag">{tagLabel(r.tag)}</span>
                    <span className="bench-muted">{day(r.ran_at)}</span>
                    <span className="bench-rrow__grades">
                      <span title="The judge's grade">judge {r.judge_grade ? <span className="bench-grade" data-grade={r.judge_grade}>{r.judge_grade}</span> : <span className="bench-muted">–</span>}</span>
                      <span title={r.review_grade ? `Graded by ${r.review_grade.reviewer}` : "Not graded by a reviewer yet"}>review {r.review_grade ? <span className="bench-grade" data-grade={r.review_grade.grade}>{r.review_grade.grade}</span> : <span className="bench-muted">–</span>}</span>
                    </span>
                    <span className="bench-muted bench-rrow__count">{r.comments ? `${r.comments} comment${r.comments === 1 ? "" : "s"}${r.reviewers.length ? ` · ${r.reviewers.join(", ")}` : ""}` : `${r.replies} repl${r.replies === 1 ? "y" : "ies"}`}</span>
                    <span className="bench-link">Read →</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {data && data.sets.length > 0 && (
        <>
          <h2 className="bench-section-title">Review sets</h2>
          <ul className="divide-y divide-[#e6dfd1]">
            {data.sets.map((s) => (
              <li key={s.id} className="bench-conv-row">
                <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                <span className="bench-muted">{s.conversation_ids.length} runs · {when(s.created_at)}</span>
                <a className="bench-link text-[12px]" href={`/bench/review/${s.id}`} target="_blank" rel="noreferrer">/bench/review/{s.id.slice(0, 12)}… ↗</a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="bench-panel-foot">The transcripts themselves stay in the repo (<code>mandate/eval/runs/</code>); to write a grade into a saved bench transcript, use <a className="bench-link" href="#/train/runs">Grade a transcript</a>.</p>
    </section>
  );
}

export function RunsView({ file, onOpenRun, onOpenConversation }: { file: string | null; onOpenRun: (f: string | null) => void; onOpenConversation: (id: string) => void }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => { api<{ runs: RunSummary[] }>("/api/bench/runs").then((r) => setRuns(r.runs)).catch((e) => setErr((e as Error).message)); }, [key]);
  if (file) return <RunDetail file={file} onBack={() => { onOpenRun(null); setKey((k) => k + 1); }} onOpenConversation={onOpenConversation} />;
  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div>
          <p className="bench-eyebrow">Train · <a className="bench-link" href="#/train/review">Review runs</a> · Grade a transcript</p>
          <h1 className="bench-page__title">Grade a saved transcript</h1>
          <p className="bench-page__lede">Every run saved from a conversation (<code>mandate/eval/runs/bench/</code>). Open one, grade it 1 to 5, say what is off and how you would have said it. The grade is written into the run; turn the critique into a playbook lesson in one click.</p>
        </div>
      </header>
      {err && <div className="bench-alert"><p>{err}</p></div>}
      {!runs && !err && <div className="bench-skel h-48" />}
      {runs?.length === 0 && <div className="bench-empty-state"><h2>No saved runs yet.</h2><p>In a conversation, press <b>Save the run</b>; it appears here to grade.</p></div>}
      {runs && runs.length > 0 && (
        <table className="bench-runs">
          <thead><tr><th>Date</th><th>Case</th><th>Brain</th><th>Grade</th><th /></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.file} onClick={() => onOpenRun(r.file)}>
                <td className="bench-muted">{r.date}</td>
                <td><span className="font-medium">{r.case.replace(/_/g, " ")}</span></td>
                <td><span className="bench-brain-dot" data-brain={r.brain} /> {BRAIN_LABEL[r.brain]}</td>
                <td>{r.grade ? <span className="bench-grade" data-grade={r.grade}>{r.grade}</span> : <span className="bench-muted">ungraded</span>}</td>
                <td className="text-right"><span className="bench-link">{r.grade ? "Review" : "Grade"} →</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const GRADE_WORDS: Record<number, string> = { 5: "send to a client as is", 4: "light edits", 3: "right idea, rework", 2: "misses the point", 1: "wrong" };

function RunDetail({ file, onBack, onOpenConversation }: { file: string; onBack: () => void; onOpenConversation: (id: string) => void }) {
  const [data, setData] = useState<{ run: RunSummary; markdown: string; grade: RunGrade } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [off, setOff] = useState("");
  const [rewrite, setRewrite] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "lesson">("idle");
  useEffect(() => {
    api<{ run: RunSummary; markdown: string; grade: RunGrade }>(`/api/bench/runs?file=${encodeURIComponent(file)}`).then((d) => {
      setData(d); setGrade(d.grade.grade); setOff(d.grade.off); setRewrite(d.grade.rewrite);
    }).catch((e) => setErr((e as Error).message));
  }, [file]);
  async function save() {
    if (!grade) { setErr("Pick a grade from 1 to 5 first."); return; }
    setState("saving"); setErr(null);
    try { const r = await api<{ grade: RunGrade }>("/api/bench/runs", { json: { file, grade, off, rewrite } }); setData((d) => d && { ...d, grade: r.grade }); setState("saved"); }
    catch (e) { setErr((e as Error).message); setState("idle"); }
  }
  async function lesson() {
    if (!data) return;
    if (!off.trim() && !rewrite.trim()) { setErr("Write what is off (or your rewrite) first: that is the lesson."); return; }
    setState("lesson"); setErr(null);
    try {
      const msg = `${LESSON_LABEL}\n\nThe run: mandate/eval/runs/bench/${file} (read it first).\nGrade: ${grade ?? "not given"}/5\n\nWhat is off (the owner):\n${off || "(not given)"}\n\nThe owner's rewrite:\n${rewrite || "(not given)"}\n\nPropose the playbook edit for ${BRAIN_LABEL[data.run.brain]} in the file-block format: the habit that would have prevented this, general rather than about this one case.`;
      onOpenConversation(await startConversation({ agent: "interviewer", brain: data.run.brain, kind: "lesson", title: `Lesson: ${data.run.case.replace(/_/g, " ")}`, message: msg }));
    } catch (e) { setErr((e as Error).message); setState("idle"); }
  }
  return (
    <section className="bench-run">
      <div className="bench-run__doc">
        <button className="bench-link" onClick={onBack}>← All runs</button>
        {err && !data && <div className="bench-alert mt-4"><p>{err}</p></div>}
        {data ? <Markdown text={data.markdown} className="bench-md bench-md--doc" /> : !err && <div className="bench-skel mt-6 h-96" />}
      </div>
      <aside className="bench-run__grade">
        <p className="bench-eyebrow">Your grade</p>
        <h2 className="bench-panel-title">{data?.run.case.replace(/_/g, " ") ?? file}</h2>
        <p className="bench-panel-sub">{data && <>{BRAIN_LABEL[data.run.brain]} · {data.run.date}{data.grade.graded_at && <> · graded {when(data.grade.graded_at)}</>}</>}</p>
        <div className="bench-grade-pick" role="radiogroup" aria-label="Grade">
          {[1, 2, 3, 4, 5].map((g) => (
            <button key={g} role="radio" aria-checked={grade === g} data-on={grade === g || undefined} onClick={() => { setGrade(g); setState("idle"); }} title={GRADE_WORDS[g]}>{g}</button>
          ))}
        </div>
        <p className="bench-muted mt-1 text-[11px]">{grade ? GRADE_WORDS[grade] : "5 send as is · 1 wrong"}</p>
        <label className="bench-form mt-4"><span>What&apos;s off</span>
          <textarea rows={6} value={off} onChange={(e) => { setOff(e.target.value); setState("idle"); }} placeholder="What is wrong, missing, naive or politically off. Name the habit, not just the fact." />
        </label>
        <label className="bench-form mt-3"><span>Your rewrite <em>how you would have said it</em></span>
          <textarea rows={6} value={rewrite} onChange={(e) => { setRewrite(e.target.value); setState("idle"); }} placeholder="The first paragraph the way a senior would put it to the client." />
        </label>
        {err && data && <div className="bench-alert mt-3"><p>{err}</p></div>}
        {state === "saved" && <p className="bench-ok mt-3">Saved into the run&apos;s grading block. Not committed.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="bench-btn" disabled={!data || state === "saving"} onClick={() => void save()}>{state === "saving" ? "Saving…" : "Save the grade"}</button>
          <button className="bench-btn bench-btn--outline" disabled={!data || state === "lesson"} onClick={() => void lesson()} title="The interviewer proposes a playbook edit from your critique; you accept it">{state === "lesson" ? "Opening…" : "Turn into a playbook lesson"}</button>
        </div>
      </aside>
    </section>
  );
}

type Playbook = { file: string; brains: Brain[]; title: string; lines: number; modified: string | null; last_commit: string | null; commits: number; dirty: boolean };

export function PlaybooksView({ file, onOpen }: { file: string | null; onOpen: (f: string | null) => void }) {
  const [list, setList] = useState<Playbook[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ playbooks: Playbook[] }>("/api/bench/playbooks").then((r) => setList(r.playbooks)).catch((e) => setErr((e as Error).message)); }, []);
  return (
    <section className="bench-run">
      <div className="bench-run__doc">
        {file ? (
          <>
            <button className="bench-link" onClick={() => onOpen(null)}>← All playbooks</button>
            <PlaybookDoc key={file} file={file} />
          </>
        ) : (
          <>
            <p className="bench-eyebrow">Train · Playbooks</p>
            <h1 className="bench-page__title">What the brains know</h1>
            <p className="bench-page__lede">The method each brain reads before every case, read-only. Each interview and lesson you accept lands here; the dates show the brain growing.</p>
            {err && <div className="bench-alert mt-4"><p>{err}</p></div>}
            {BRAINS.map((b) => (
              <div key={b} className="mt-8">
                <h2 className="bench-section-title"><span className="bench-brain-dot" data-brain={b} /> {BRAIN_LABEL[b]}</h2>
                <ul className="divide-y divide-[#e6dfd1]">
                  {list?.filter((p) => p.brains.includes(b)).map((p) => (
                    <li key={p.file}><button className="bench-conv-row" onClick={() => onOpen(p.file)}>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.title}</span><code className="bench-muted text-[10.5px]">mandate/playbooks/{p.file}</code></span>
                      {p.dirty && <span className="bench-live">changed, not committed</span>}
                      <span className="bench-muted text-right">{p.lines} lines · {p.commits} {p.commits === 1 ? "revision" : "revisions"}<br />{p.dirty || !p.last_commit ? <>edited {when(p.modified)}</> : <>last revised {when(p.last_commit)}</>}</span>
                    </button></li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function PlaybookDoc({ file }: { file: string }) {
  const [md, setMd] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ markdown: string }>(`/api/bench/playbooks?file=${encodeURIComponent(file)}`).then((r) => setMd(r.markdown)).catch((e) => setErr((e as Error).message));
  }, [file]);
  if (err) return <div className="bench-alert mt-4"><p>{err}</p></div>;
  return md === null ? <div className="bench-skel mt-6 h-96" /> : <Markdown text={md} className="bench-md bench-md--doc" />;
}

export function ProgressView({ onOpenRun }: { onOpenRun: (f: string) => void }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ runs: RunSummary[] }>("/api/bench/runs").then((r) => setRuns(r.runs)).catch((e) => setErr((e as Error).message)); }, []);
  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div>
          <p className="bench-eyebrow">Train · Progress</p>
          <h1 className="bench-page__title">Is each brain getting better?</h1>
          <p className="bench-page__lede">Your grades on saved runs, by the date of the run. One grade per run; ungraded runs are left out, not counted as zero.</p>
        </div>
      </header>
      {err && <div className="bench-alert"><p>{err}</p></div>}
      <div className="bench-grid bench-grid--2">
        {BRAINS.map((b) => <BrainProgress key={b} brain={b} runs={(runs ?? []).filter((r) => r.brain === b)} loading={!runs} onOpenRun={onOpenRun} />)}
      </div>
    </section>
  );
}

function BrainProgress({ brain, runs, loading, onOpenRun }: { brain: Brain; runs: RunSummary[]; loading: boolean; onOpenRun: (f: string) => void }) {
  const graded = useMemo(() => runs.filter((r) => r.grade).sort((a, b) => a.file.localeCompare(b.file)), [runs]);
  const W = 420, H = 170, P = { l: 26, r: 12, t: 14, b: 26 };
  const x = (i: number) => P.l + (graded.length <= 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (graded.length - 1));
  const y = (g: number) => P.t + ((5 - g) * (H - P.t - P.b)) / 4;
  const avg = graded.length ? graded.reduce((s, r) => s + (r.grade ?? 0), 0) / graded.length : null;
  return (
    <div className="bench-panel-card">
      <div className="flex items-baseline justify-between">
        <h2 className="bench-section-title !mt-0"><span className="bench-brain-dot" data-brain={brain} /> {BRAIN_LABEL[brain]}</h2>
        <span className="bench-muted text-[11px]">{graded.length} graded of {runs.length} runs{avg !== null && <> · average <b className="text-[#162544]">{avg.toFixed(1)}</b></>}</span>
      </div>
      {loading ? <div className="bench-skel mt-3 h-40" /> : graded.length === 0 ? (
        <p className="bench-panel-empty mt-3">No graded runs yet. Grade one under Grade runs and it appears here.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`${BRAIN_LABEL[brain]} grades over time`}>
          {[1, 2, 3, 4, 5].map((g) => (
            <g key={g}>
              <line x1={P.l} x2={W - P.r} y1={y(g)} y2={y(g)} stroke="#e6dfd1" strokeDasharray={g === 5 ? undefined : "2 3"} />
              <text x={P.l - 8} y={y(g) + 3} textAnchor="end" fontSize="9" fill="#9a917f">{g}</text>
            </g>
          ))}
          <polyline fill="none" stroke="#b9a77d" strokeWidth="1.5" points={graded.map((r, i) => `${x(i)},${y(r.grade!)}`).join(" ")} />
          {graded.map((r, i) => (
            <g key={r.file} className="cursor-pointer" onClick={() => onOpenRun(r.file)}>
              <title>{`${r.date} · ${r.case.replace(/_/g, " ")}: ${r.grade}/5`}</title>
              <circle cx={x(i)} cy={y(r.grade!)} r="5" fill="#162544" stroke="#fffdfa" strokeWidth="2" />
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="8.5" fill="#9a917f">{r.date.slice(5)}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
