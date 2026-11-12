"use client";

// One conversation: the thread, the composer (type or speak), and the right
// panel (what landed and sources for a brain; proposals for the interviewer).
// The conversation lives on the server: this view loads it, streams a turn,
// re-attaches to a turn still running after a reload, and stops it for real.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseWebSources, type BenchEvent, type Citation } from "@/lib/bench/events";
import {
  BRAIN_DOMAIN, BRAIN_LABEL, groupSources, lineDiff, parseProposals, rollup, THEME_LABEL, THEMES, withoutProposals,
  type Agent, type BenchConversation, type BenchMandate, type BenchMessage, type Brain, type ConversationKind, type Proposal, type Theme,
} from "@/lib/bench/model";
import { api, BenchError, readTurn } from "./api";
import { Markdown } from "./markdown";
import { Recorder, type RecorderHandle, type RecState } from "./recorder";

export type Draft = { agent: Agent; brain: Brain; kind: ConversationKind; mandateId: string | null; guide?: string; title?: string };
export type Activity = { busy: null | { label: string; kind: string }; recording: RecState };

const SAVE_PROMPT = "Please save the run now, in the bench format.";
const DISTIL_PROMPT = "Please finish and distil the interview now: the habits, then the proposed playbook edits and new eval cases as file blocks, then one line per file.";
const LESSON_LABEL = "Turn this critique into a playbook lesson.";

const STARTERS: Record<Brain, { title: string; tag: string; text: string }[]> = {
  wincent: [
    { title: "Fintech guarantees", tag: "DE · FR · IT · EU", text: "We are a fintech lender. We have raised EUR 40M. We want our SME loan portfolio guaranteed by public guarantee schemes in Germany, France and Italy, and at EU level. We do not have a banking licence. What are our routes?" },
    { title: "Italian robot deployment", tag: "IT", text: "We deploy industrial robots in SME factories on a robots-as-a-service model: we buy the robots, place them with the customer and finance them over 3-5 years. We are expanding into Italy. We are thinking of setting up an Italian company and either registering it as a startup innovativa or getting Art. 106 status so we can finance our customers ourselves. Which public money fits, and where in Italy?" },
    { title: "AI tutoring for kids", tag: "Edtech · B2C", text: "We're an AI-native startup building learning tech that engages young children. We already have private investors. How can public money help us?" },
  ],
  regina: [
    { title: "AI learning for young children", tag: "AI Act · GDPR · DSA", text: "We are an AI-native startup building a learning product for young children. We plan to launch in the EU next year. What do we have to get right on regulation, what could stop us, and who should we be talking to?" },
    { title: "Travel vs Google enforcement", tag: "DMA · competition", text: "We are a travel scale-up affected by how Google ranks travel services. The Commission is enforcing the DMA against Google. What do we need to know, follow and do, and how should we position ourselves?" },
    { title: "Europe's safe AI alternative", tag: "Positioning", text: "We are a trust-AI startup (EUR 2M raised) and want to position ourselves as Europe's safe alternative. Which policy hooks make that credible, who should we talk to, and what should we never claim?" },
  ],
};

const KIND_LABEL: Record<ConversationKind, string> = { chat: "Case", interview: "Interview", lesson: "Lesson", distil: "Distil", retest: "Re-test", score: "Scoring" };
const plainLabel =(s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}…`;
const newDraftConv = (d: Draft): BenchConversation => ({
  id: "", mandate_id: d.mandateId, agent: d.agent, brain: d.brain, kind: d.kind, title: d.title ?? "", guide: d.guide,
  session_id: null, messages: [], cites: {}, sources: [], saved: [], created_at: "", updated_at: "",
});

export function ChatView({ convId, draft, mandate, onOpened, onListChanged, onActivity, onOpenMandate, onOpenConversation }: {
  convId: string | null;
  draft: Draft;
  mandate: BenchMandate | null;
  onOpened: (id: string) => void;
  onListChanged: () => void;
  onActivity: (a: Activity) => void;
  onOpenMandate: (id: string) => void;
  onOpenConversation: (id: string) => void;
}) {
  const [conv, setConv] = useState<BenchConversation>(() => newDraftConv(draft));
  const [loading, setLoading] = useState(!!convId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Activity["busy"]>(null);
  const [rec, setRec] = useState<RecState>("idle");
  const [input, setInput] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const stream = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const ownId = useRef<string | null>(null); // the id this view just created: no reload for it
  const live = useRef<{ text: string; saw: boolean; raf: number | null }>({ text: "", saw: false, raf: null });
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const recorder = useRef<RecorderHandle>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { onActivity({ busy, recording: rec }); }, [busy, rec, onActivity]);

  // ── loading and following ────────────────────────────────────────────────
  const reload = useCallback(async (id: string) => {
    const { conversation, running } = await api<{ conversation: BenchConversation; running: boolean }>(`/api/bench/conversations?id=${id}`);
    setConv(conversation);
    return running;
  }, []);

  const flush = useCallback(() => {
    live.current.raf = null;
    const text = live.current.text;
    setConv((c) => {
      const last = c.messages[c.messages.length - 1];
      if (!last || last.role !== "agent") return c;
      return { ...c, messages: [...c.messages.slice(0, -1), { ...last, text }] };
    });
  }, []);

  const apply = useCallback((ev: BenchEvent) => {
    if (ev.t === "text") {
      const L = live.current;
      const d = ev.d === "" ? (L.saw ? "\n\n" : "") : ev.d;
      if (ev.d) L.saw = true;
      if (!d) return;
      L.text = (L.text + d).replace(/^\s+/, "").replace(/\n{3,}/g, "\n\n");
      if (L.raf === null) L.raf = requestAnimationFrame(flush);
    } else if (ev.t === "activity") setBusy({ label: ev.label, kind: ev.kind });
    else if (ev.t === "cites") setConv((c) => ({ ...c, cites: { ...c.cites, ...ev.items } }));
    else if (ev.t === "source") setConv((c) => (c.sources.some((s) => s.url === ev.url) ? c : { ...c, sources: [...c.sources, { url: ev.url, label: ev.label }] }));
    else if (ev.t === "saved") setConv((c) => ({ ...c, saved: [...c.saved, { path: ev.path, ledger: ev.ledger }] }));
  }, [flush]);

  /** Follow a turn's stream until it ends, then take the server's copy. */
  const follow = useCallback(async (res: Response, id: () => string) => {
    const ctrl = stream.current;
    try {
      await readTurn(res, (ev) => {
        if (ev.t === "conversation" && !ownId.current && !id()) { ownId.current = ev.id; setConv((c) => ({ ...c, id: ev.id })); onOpened(ev.id); }
        apply(ev);
      });
    } catch (e) {
      if (ctrl?.signal.aborted) return; // we left this conversation: the turn goes on without us
      setBanner(e instanceof BenchError ? e.message : "The connection to the bench server dropped. The turn may still be running: reopen the conversation to follow it.");
    }
    if (ctrl?.signal.aborted) return;
    if (live.current.raf !== null) { cancelAnimationFrame(live.current.raf); flush(); }
    setBusy(null);
    const cid = id() || ownId.current;
    if (cid) { try { await reload(cid); } catch { /* keep what we have */ } }
    onListChanged();
  }, [apply, flush, onListChanged, onOpened, reload]);

  const attach = useCallback(async (id: string) => {
    stream.current?.abort();
    const ctrl = new AbortController();
    stream.current = ctrl;
    const res = await fetch(`/api/bench/chat?conversationId=${id}`, { signal: ctrl.signal, cache: "no-store" }).catch(() => null);
    if (!res || res.status === 204) { setBusy(null); return; }
    // the replay starts from the turn's first event: rebuild the reply from it
    live.current = { text: "", saw: false, raf: null };
    setBusy({ label: "working", kind: "thinking" });
    await follow(res, () => id);
  }, [follow]);

  // The shell remounts this view (a new key) for every other conversation, so
  // this only loads: a convId that turns up because this view just created it
  // is skipped.
  useEffect(() => {
    if (!convId || convId === ownId.current) return;
    let gone = false;
    reload(convId).then((running) => { if (!gone && running) void attach(convId); })
      .catch((e) => { if (!gone) setLoadError((e as Error).message); })
      .finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [convId, reload, attach]);

  useEffect(() => () => stream.current?.abort(), []);

  // ── sending ──────────────────────────────────────────────────────────────
  async function send(raw: string, opts: { retry?: boolean } = {}) {
    const message = raw.trim();
    if (!message || busy || sending.current) return;
    sending.current = true;
    setBanner(null);
    if (!opts.retry) setInput("");
    live.current = { text: "", saw: false, raf: null };
    const at = new Date().toISOString();
    setConv((c) => {
      let msgs = c.messages;
      if (opts.retry) { const [q, a] = msgs.slice(-2); if (q?.role === "client" && q.text === message && a?.role === "agent") msgs = msgs.slice(0, -2); }
      return { ...c, messages: [...msgs, { role: "client", text: message, at }, { role: "agent", text: "", at }] };
    });
    setBusy({ label: "thinking", kind: "thinking" });
    stick.current = true;
    stream.current?.abort();
    const ctrl = new AbortController();
    stream.current = ctrl;
    const id = conv.id;
    try {
      const res = await fetch("/api/bench/chat", {
        method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify(id
          ? { conversationId: id, message, retry: opts.retry }
          : { message, agent: conv.agent, brain: conv.brain, kind: conv.kind, mandateId: conv.mandate_id, guide: conv.guide, title: draft.title }),
      }).catch(() => { throw new BenchError("Cannot reach the bench server. Is `npm run dev` still running?"); });
      if (!res.ok) throw new BenchError((await res.json().catch(() => null))?.error ?? `The app answered ${res.status}.`);
      await follow(res, () => id);
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setBusy(null);
        const msg = (e as Error).message;
        setConv((c) => { const last = c.messages[c.messages.length - 1]; return last?.role === "agent" && !last.text ? { ...c, messages: [...c.messages.slice(0, -1), { ...last, error: msg }] } : c; });
      }
    } finally {
      sending.current = false;
    }
  }

  async function stop() {
    if (!conv.id) { stream.current?.abort(); setBusy(null); return; }
    setBusy({ label: "stopping", kind: "thinking" });
    try { await api("/api/bench/stop", { json: { conversationId: conv.id } }); } catch (e) { setBanner((e as Error).message); }
  }

  // ── keyboard: Enter sends; Space held in an empty composer (or nowhere) talks ──
  useEffect(() => {
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.key === " " && !e.repeat && !editable(e.target) && !busy) { e.preventDefault(); recorder.current?.holdStart(); }
      if (e.key === "Escape") recorder.current?.cancel();
    };
    const up = (e: KeyboardEvent) => { if (e.key === " " && !editable(e.target)) recorder.current?.holdEnd(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [busy]);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [input]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: busy ? "auto" : "smooth" });
  }, [conv.messages, busy]);

  // ── derived ──────────────────────────────────────────────────────────────
  const isInterviewer = conv.agent === "interviewer";
  const allCites = useMemo(() => {
    const web: Record<string, Citation> = {};
    for (const m of conv.messages) if (m.role === "agent") Object.assign(web, parseWebSources(m.text));
    return { ...web, ...conv.cites };
  }, [conv.messages, conv.cites]);
  const landed = useMemo(() => rollup([{ ...conv, created_at: conv.created_at || "0", updated_at: conv.updated_at || "0" }]), [conv]);
  const sources = useMemo(() => groupSources(allCites, conv.sources), [allCites, conv.sources]);
  const proposals = useMemo(() => {
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const m = conv.messages[i];
      if (m.role === "agent") { const p = parseProposals(m.text); if (p.length) return p; }
    }
    return [] as Proposal[];
  }, [conv.messages]);
  const last = conv.messages[conv.messages.length - 1];
  const lastClient = [...conv.messages].reverse().find((m) => m.role === "client");
  const who = BRAIN_LABEL[conv.agent];
  const empty = conv.messages.length === 0;

  if (loadError) return <div className="bench-main"><div className="bench-empty-state"><h2>This conversation could not be opened.</h2><p>{loadError}</p></div></div>;

  return (
    <>
      <section className="bench-main">
        <header className="bench-thread-head">
          <div className="min-w-0">
            <p className="bench-eyebrow">
              {isInterviewer ? `${KIND_LABEL[conv.kind]} · training ${BRAIN_LABEL[conv.brain]}`
                : conv.kind === "retest" ? `Re-test · ${conv.case ?? ""} · ${BRAIN_LABEL[conv.brain]}` : BRAIN_DOMAIN[conv.brain]}
              {mandate && <> · <button className="bench-link" onClick={() => onOpenMandate(mandate.id)}>{mandate.client}</button></>}
            </p>
            <h1 className="bench-thread-title">{conv.title || (isInterviewer ? "New interview" : `New case for ${who}`)}</h1>
          </div>
        </header>
        <div ref={scroller} className="bench-scroll" onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
          <div className="bench-thread">
            {loading ? <ThreadSkeleton /> : empty ? (
              <EmptyThread conv={conv} mandate={mandate} onStart={(t) => void send(t)} />
            ) : (
              <div className="space-y-6">
                {conv.messages.map((m, i) => m.role === "client" ? (
                  <div key={i} className="flex justify-end">
                    <div className="bench-bubble">{m.text === SAVE_PROMPT ? "Save the run." : m.text === DISTIL_PROMPT ? "Finish and distil." : m.text.startsWith(LESSON_LABEL) ? LESSON_LABEL : m.text}</div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-3">
                    <div className="bench-avatar" data-agent={conv.agent}>{who.charAt(0)}</div>
                    <div className="bench-reply">
                      <p className="bench-reply__who">{who}</p>
                      {m.text ? <Markdown text={isInterviewer ? withoutProposals(m.text) : m.text} cites={allCites} />
                        : busy && i === conv.messages.length - 1 ? <p className="bench-working"><Typing />{plainLabel(busy.label)}</p> : null}
                      {busy && i === conv.messages.length - 1 && m.text && <p className="bench-working bench-working--after"><Typing />{plainLabel(busy.label)}</p>}
                      {!busy && m.error && (
                        <div className="bench-alert" role="alert">
                          <p>{m.error}</p>
                          {i === conv.messages.length - 1 && lastClient && <button className="bench-btn bench-btn--small" onClick={() => void send(lastClient.text, { retry: true })}>Retry</button>}
                        </div>
                      )}
                      {!busy && !m.error && m.interrupted && (
                        <p className="bench-note">Stopped.{i === conv.messages.length - 1 && lastClient && <> <button className="bench-link" onClick={() => void send(lastClient.text, { retry: true })}>Send it again</button></>}</p>
                      )}
                      {!isInterviewer && conv.id && m.text && !(busy && i === conv.messages.length - 1) && (
                        <ReplyFeedback convId={conv.id} index={i} given={m.feedback}
                          onGiven={(fb) => setConv((c) => ({ ...c, messages: c.messages.map((x, j) => (j === i ? { ...x, feedback: fb } : x)) }))} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {banner && <div className="bench-alert mt-6" role="alert"><p>{banner}</p>{conv.id && <button className="bench-btn bench-btn--small" onClick={() => void reload(conv.id).then((r) => { if (r) void attach(conv.id); })}>Reconnect</button>}</div>}
            {conv.saved.length > 0 && !isInterviewer && (
              <div className="bench-ok mt-6">Run saved: {conv.saved.map((s) => <code key={s.path}>{s.path}</code>)} Grade it under Train, Grade runs.</div>
            )}
          </div>
        </div>
        <form className="bench-composer" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <div className="bench-composer__box" data-recording={rec !== "idle" || undefined}>
            <textarea
              ref={textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); }
                else if (e.key === " " && !input && !e.repeat) { e.preventDefault(); recorder.current?.holdStart(); }
                else if (e.key === "Escape") recorder.current?.cancel();
              }}
              onKeyUp={(e) => { if (e.key === " " && !input) recorder.current?.holdEnd(); }}
              rows={1}
              disabled={loading}
              placeholder={rec === "recording" ? "Listening… release to transcribe" : rec === "transcribing" ? "Transcribing on this Mac…"
                : empty ? (isInterviewer ? "Type or speak to begin" : "Describe the company and what it needs") : `Answer ${who}, or ask the next question`}
              className="bench-composer__input"
            />
            <div className="bench-composer__actions">
              <Recorder ref={recorder} value={input} onChange={setInput} disabled={loading} onState={setRec} />
              {busy ? (
                <button type="button" onClick={() => void stop()} className="bench-btn bench-btn--ghost" disabled={busy.label === "stopping"}>
                  <span className="bench-stop" aria-hidden />Stop
                </button>
              ) : (
                <button type="submit" disabled={!input.trim() || loading} className="bench-btn">Send</button>
              )}
            </div>
          </div>
          <p className="bench-composer__hint"><kbd>Enter</kbd> send · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · hold <kbd>Space</kbd> (empty box) or the mic to talk · <kbd>Esc</kbd> cancels a recording</p>
        </form>
      </section>

      <aside className="bench-landed">
        {isInterviewer ? (
          <InterviewPanel conv={conv} proposals={proposals} busy={!!busy} onOpenConversation={onOpenConversation}
            onDistil={() => {
              // an interview joins the feedback queue as a lesson; accepting its proposals resolves it
              if (conv.kind === "interview") void api("/api/bench/feedback", { json: { kind: "interview", conversationId: conv.id } }).catch(() => {});
              void send(DISTIL_PROMPT);
            }} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="bench-panel-title">What landed</h2>
              <button disabled={!conv.id || !!busy || empty} onClick={() => void send(SAVE_PROMPT)} className="bench-btn bench-btn--outline bench-btn--small" title="Ask the brain to save this run for grading (mandate/eval/runs/bench)">Save the run</button>
            </div>
            <p className="bench-panel-sub">Read from {who}&apos;s replies in this conversation.</p>
            {landed.question && last?.role === "agent" && (
              <div className="bench-question"><p className="bench-eyebrow">Open question</p><Markdown text={landed.question} /></div>
            )}
            <LandedList title="Decisions" items={landed.decisions.map((d) => d.text)} />
            <LandedList title="Flags" items={landed.flags.map((d) => d.text)} />
            <LandedList title="Next steps" items={landed.steps.map((d) => d.text)} />
            <LandedList title="Watches" items={landed.watches.map((d) => d.text)} />
            {!landed.decisions.length && !landed.flags.length && !landed.steps.length && !landed.watches.length && (
              <p className="bench-panel-empty">Nothing settled yet. Decisions, flags, next steps and watches appear here as {who} names them.</p>
            )}
            <Sources groups={sources} cites={allCites} who={who} />
            {conv.id && !empty && <ConversationGrade conv={conv} onGraded={(g) => setConv((c) => ({ ...c, grade: g }))} />}
          </>
        )}
        <p className="bench-panel-foot">Local bench. Claude Code on your own plan; production is read only. Conversations are saved on this laptop, outside the repo.</p>
      </aside>
    </>
  );
}

function EmptyThread({ conv, mandate, onStart }: { conv: BenchConversation; mandate: BenchMandate | null; onStart: (t: string) => void }) {
  if (conv.agent === "interviewer") {
    return (
      <div className="bench-hero">
        <p className="bench-eyebrow">Training {BRAIN_LABEL[conv.brain]}</p>
        <h2 className="bench-hero__title">{conv.kind === "lesson" ? "A lesson from a graded run." : "Interview an expert."}</h2>
        <p className="bench-hero__lede">
          The interviewer runs <b>{conv.guide ?? "the guide"}</b>: one question at a time, probing for real cases and mirroring habits back every few answers.
          The expert speaks or types. At the end, <b>Finish &amp; distil</b> proposes playbook edits and eval cases for you to accept.
        </p>
        <button className="bench-btn mt-6" onClick={() => onStart("We are ready. Please open the interview.")}>Begin the interview</button>
      </div>
    );
  }
  const who = BRAIN_LABEL[conv.agent];
  return (
    <div className="bench-hero">
      <p className="bench-eyebrow">{BRAIN_DOMAIN[conv.brain]}</p>
      <h2 className="bench-hero__title">{mandate ? `A new question for ${mandate.client}.` : `Bring ${who} a case.`}</h2>
      <p className="bench-hero__lede">
        {mandate
          ? `${who} reads the client profile of this mandate first, then asks what is decisive and works the case with you, citing every fact.`
          : `Describe the company and what it is trying to do. ${who} asks what is decisive first, then works the case with you, citing every fact.`}
      </p>
      {!mandate && (
        <div className="bench-starters">
          {STARTERS[conv.brain].map((s) => (
            <button key={s.title} onClick={() => onStart(s.text)} className="bench-starter">
              <span className="bench-eyebrow">{s.tag}</span>
              <span className="bench-starter__title">{s.title}</span>
              <span className="bench-starter__text">{s.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadSkeleton() {
  return <div className="space-y-5" aria-busy><div className="bench-skel ml-auto h-10 w-2/5" /><div className="bench-skel h-32 w-4/5" /><div className="bench-skel ml-auto h-8 w-1/3" /></div>;
}

function LandedList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-6">
      <h3 className="bench-eyebrow">{title} <span className="bench-count">{items.length}</span></h3>
      <ul className="mt-2 space-y-2">{items.map((it, i) => <li key={i} className="bench-landed-item"><Markdown text={it} /></li>)}</ul>
    </section>
  );
}

export function Sources({ groups, cites, who }: { groups: ReturnType<typeof groupSources>; cites: Record<string, Citation>; who: string }) {
  return (
    <section className="mt-7">
      <h3 className="bench-eyebrow">Sources {groups.length > 0 && <span className="bench-count">{groups.length}</span>}</h3>
      {groups.length === 0 ? (
        <p className="bench-panel-empty">None yet. Every document {who} cites or web page {who} reads appears here, once.</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {groups.map((g) => (
            <li key={g.url ?? g.label} className="bench-source">
              <span className="bench-source__ids">
                {g.ids.length ? g.ids.map((id) => <span key={id} className="bench-chip bench-chip--static" data-kind={id.startsWith("w") ? "web" : "grounded"} title={cites[id]?.quote}>{id}</span>)
                  : <span className="bench-chip bench-chip--static" data-kind="web">web</span>}
              </span>
              {g.url ? <a href={g.url} target="_blank" rel="noreferrer">{g.label}</a> : <span>{g.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReplyFeedback({ convId, index, given, onGiven }: {
  convId: string; index: number; given?: BenchMessage["feedback"]; onGiven: (fb: NonNullable<BenchMessage["feedback"]>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("other");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function rate(rating: "good" | "off", withNote = "") {
    setSaving(true); setErr(null);
    try {
      const r = await api<{ item: { id: string } }>("/api/bench/feedback", { json: { kind: "reply", conversationId: convId, messageIndex: index, rating, theme, note: withNote } });
      onGiven({ rating, item_id: r.item.id, ...(withNote ? { note: withNote } : {}) });
      setOpen(false);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  if (given) {
    return <p className="bench-fb bench-fb--given" data-rating={given.rating}>{given.rating === "good" ? "Rated good" : "Marked off"}{given.note ? <>: <i>{given.note}</i></> : null} <span className="bench-muted">· in the feedback inbox</span></p>;
  }
  return (
    <div className="bench-fb">
      {!open ? (
        <>
          <button className="bench-fb__btn" disabled={saving} onClick={() => void rate("good")} title="Good reply (signal for the playbooks)">Good</button>
          <button className="bench-fb__btn" disabled={saving} onClick={() => setOpen(true)} title="Something is off: say what, in one line">Off…</button>
        </>
      ) : (
        <form className="bench-fb__form" onSubmit={(e) => { e.preventDefault(); void rate("off", note.trim()); }}>
          <div className="flex flex-wrap gap-1">
            {THEMES.map((t) => <button type="button" key={t} className="bench-fb__chip" data-on={theme === t || undefined} onClick={() => setTheme(t)}>{THEME_LABEL[t]}</button>)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input autoFocus value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} placeholder="What's off, in one line (optional)" className="bench-fb__input"
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); e.stopPropagation(); }} />
            <Recorder value={note} onChange={setNote} compact />
            <button className="bench-btn bench-btn--small" disabled={saving}>Save</button>
            <button type="button" className="bench-link" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {err && <span className="bench-fb__err">{err}</span>}
    </div>
  );
}

function ConversationGrade({ conv, onGraded }: { conv: BenchConversation; onGraded: (g: NonNullable<BenchConversation["grade"]>) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    if (!pick) return;
    try {
      const r = await api<{ item: { id: string } }>("/api/bench/feedback", { json: { kind: "conversation", conversationId: conv.id, grade: pick, note: note.trim() } });
      onGraded({ grade: pick, item_id: r.item.id });
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <section className="mt-7 border-t border-[#e6dfd1] pt-5">
      <h3 className="bench-eyebrow">Grade this conversation</h3>
      {conv.grade ? <p className="mt-2 text-[12px] text-[#2b3c5e]"><span className="bench-grade" data-grade={conv.grade.grade}>{conv.grade.grade}</span> <span className="bench-muted">saved to the feedback inbox</span></p> : (
        <>
          <div className="bench-grade-pick bench-grade-pick--small">
            {[1, 2, 3, 4, 5].map((g) => <button key={g} data-on={pick === g || undefined} onClick={() => setPick(g)}>{g}</button>)}
          </div>
          {pick !== null && (
            <div className="mt-2 flex gap-2">
              <input className="bench-fb__input" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} placeholder={pick <= 3 ? "What would make it a 5?" : "Optional note"} />
              <button className="bench-btn bench-btn--small" onClick={() => void save()}>Save</button>
            </div>
          )}
          {err && <p className="bench-fb__err">{err}</p>}
        </>
      )}
    </section>
  );
}

function InterviewPanel({ conv, proposals, busy, onDistil, onOpenConversation }: {
  conv: BenchConversation; proposals: Proposal[]; busy: boolean; onDistil: () => void; onOpenConversation: (id: string) => void;
}) {
  const answers = conv.messages.filter((m) => m.role === "client").length;
  const [accepted, setAccepted] = useState<string[]>([]);
  const title = conv.kind === "lesson" ? "The lesson" : conv.kind === "distil" ? "The distil" : conv.kind === "score" ? "The score" : "The interview";
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="bench-panel-title">{title}</h2>
        {conv.kind === "interview" && <button disabled={!conv.id || busy || answers < 1} onClick={onDistil} className="bench-btn bench-btn--outline bench-btn--small">Finish &amp; distil</button>}
      </div>
      <p className="bench-panel-sub">
        {conv.guide ? <>Guide: <code>{conv.guide}</code> · </> : null}
        {conv.feedback_ids ? <>{conv.feedback_ids.length} feedback items · </> : null}
        {answers} {answers === 1 ? "turn" : "turns"} · saved on this laptop
      </p>
      {conv.kind !== "score" && (
        <section className="mt-6">
          <h3 className="bench-eyebrow">Proposed changes {proposals.length > 0 && <span className="bench-count">{proposals.length}</span>}</h3>
          {proposals.length === 0 ? (
            <p className="bench-panel-empty">{busy ? "The interviewer is working…" : "When the interviewer proposes playbook edits or eval cases, they appear here as diffs. Accepting writes the file (not committed) and resolves the feedback it addresses."}</p>
          ) : (
            <div className="mt-2 space-y-3">{proposals.map((p) => <ProposalCard key={p.path + p.content.length} p={p} conversationId={conv.id} onAccepted={(path) => setAccepted((a) => [...a, path])} />)}</div>
          )}
        </section>
      )}
      {accepted.length > 0 && <RetestLauncher afterChange={conv.id} suggest={accepted} onOpenConversation={onOpenConversation} />}
    </>
  );
}

/** After a change is accepted: run an eval case again with the new playbooks. */
export function RetestLauncher({ afterChange, suggest = [], onOpenConversation }: { afterChange: string | null; suggest?: string[]; onOpenConversation: (id: string) => void }) {
  const [cases, setCases] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    api<{ cases: string[] }>("/api/bench/retest").then((r) => {
      setCases(r.cases);
      const fromChange = suggest.map((p) => p.match(/scenarios\/([a-z0-9_-]+)\.yaml$/)?.[1]).find((c) => c && r.cases.includes(c));
      setPick(fromChange ?? r.cases[0] ?? "");
    }).catch((e) => setErr((e as Error).message));
  }, [suggest]);
  async function run() {
    setStarting(true); setErr(null);
    try { const r = await api<{ conversationId: string }>("/api/bench/retest", { json: { case: pick, afterChange } }); onOpenConversation(r.conversationId); }
    catch (e) { setErr((e as Error).message); setStarting(false); }
  }
  return (
    <section className="bench-retest-box">
      <h3 className="bench-eyebrow">Re-test</h3>
      <p className="bench-panel-empty">Run an eval case with the playbooks as they are now, then score it; Train, Feedback shows before and after. Uses your plan: one researched turn.</p>
      <div className="mt-2 flex gap-2">
        <select className="bench-select" value={pick} onChange={(e) => setPick(e.target.value)}>{cases.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select>
        <button className="bench-btn bench-btn--small" disabled={!pick || starting} onClick={() => void run()}>{starting ? "Starting…" : "Re-test"}</button>
      </div>
      {err && <p className="bench-fb__err">{err}</p>}
    </section>
  );
}

export function ProposalCard({ p, conversationId, onAccepted }: { p: Proposal; conversationId?: string; onAccepted?: (path: string) => void }) {
  const [resolved, setResolved] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<"review" | "writing" | "written" | "rejected">("review");
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api<{ current: string | null }>(`/api/bench/proposals?path=${encodeURIComponent(p.path)}`).then((r) => setCurrent(r.current)).catch((e) => setErr((e as Error).message));
  }, [p.path]);
  const diff = useMemo(() => (current === undefined ? [] : lineDiff(current ?? "", p.content)), [current, p.content]);
  const added = diff.filter((d) => d.op === "+").length, removed = diff.filter((d) => d.op === "-").length;
  // show changed lines with two lines of context, folding the rest
  const shown = useMemo(() => {
    const keep = diff.map((d, i) => d.op !== " " || diff.slice(Math.max(0, i - 2), i + 3).some((x) => x.op !== " "));
    const out: ({ op: string; text: string } | { fold: number })[] = [];
    let fold = 0;
    diff.forEach((d, i) => { if (keep[i]) { if (fold) out.push({ fold }); fold = 0; out.push(d); } else fold++; });
    if (fold) out.push({ fold });
    return out;
  }, [diff]);

  async function accept() {
    setState("writing"); setErr(null);
    try {
      const r = await api<{ resolved: string[] }>("/api/bench/proposals", { json: { ...p, conversationId } });
      setResolved(r.resolved); setState("written"); onAccepted?.(p.path);
    } catch (e) { setErr((e as Error).message); setState("review"); }
  }
  return (
    <div className="bench-proposal" data-state={state}>
      <div className="bench-proposal__head">
        <code>{p.path}</code>
        <span className="bench-proposal__stat">{current === null ? "new file" : current === undefined ? "…" : <><b className="text-[#2f6a3c]">+{added}</b> <b className="text-[#9a3b2f]">−{removed}</b></>}</span>
      </div>
      {p.addresses.length > 0 && <p className="bench-proposal__addr">Addresses {p.addresses.map((a) => <code key={a}>{a.slice(-6)}</code>)}</p>}
      {state === "written" ? <p className="bench-ok mt-2">Written to <code>{p.path}</code>{resolved.length ? `; ${resolved.length} feedback item${resolved.length === 1 ? "" : "s"} resolved` : ""}. Not committed: review and commit it when you are ready.</p>
        : state === "rejected" ? <p className="bench-note mt-2">Rejected. Nothing written. <button className="bench-link" onClick={() => setState("review")}>Undo</button></p>
        : (
          <>
            <button className="bench-link mt-2 block" onClick={() => setOpen((o) => !o)}>{open ? "Hide the diff" : "Show the diff"}</button>
            {open && (
              <pre className="bench-diff">
                {shown.map((d, i) => "fold" in d
                  ? <span key={i} className="bench-diff__fold">⋯ {d.fold} unchanged lines</span>
                  : <span key={i} data-op={d.op}>{d.op} {d.text}{"\n"}</span>)}
              </pre>
            )}
            {err && <p className="bench-alert mt-2"><span>{err}</span></p>}
            <div className="mt-3 flex gap-2">
              <button className="bench-btn bench-btn--small" disabled={state === "writing" || current === undefined} onClick={() => void accept()}>{state === "writing" ? "Writing…" : current === null ? "Accept and create" : "Accept and write"}</button>
              <button className="bench-btn bench-btn--ghost bench-btn--small" onClick={() => setState("rejected")}>Reject</button>
            </div>
          </>
        )}
    </div>
  );
}

function Typing() {
  return <span className="bench-typing" aria-hidden><i /><i /><i /></span>;
}

export { LESSON_LABEL };
