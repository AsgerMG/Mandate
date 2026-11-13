"use client";

// The local bench app (/bench): drive mandates and train the brains, on the
// owner's Claude Code plan. The shell: the rail (brain, mandates, recent cases,
// Train, the figure), and a hash route so a reload lands where you were.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ExpertPresence } from "@/components/mandate/expert-presence";
import { BRAIN_DOMAIN, BRAIN_LABEL, BRAINS, type BenchMandate, type Brain, type ConversationSummary } from "@/lib/bench/model";
import { api, when } from "./api";
import { ChatView, type Activity, type Draft } from "./chat-view";
import { MandateForm, MandateOverview, MandatesHome } from "./mandate-views";
import { FeedbackView } from "./feedback-view";
import { InterviewsView, PlaybooksView, ProgressView, ReviewRunsView, RunsView } from "./train-views";
import { MANDATES_ENABLED } from "@/lib/bench/flags";
import { Onboarding, ONBOARDED_KEY } from "./onboarding";

type Route =
  | { v: "chat"; id: string | null; brain?: Brain; mandateId?: string | null; board?: boolean }
  | { v: "mandates" } | { v: "mandate-new" } | { v: "mandate"; id: string } | { v: "mandate-edit"; id: string }
  | { v: "interviews" } | { v: "feedback" } | { v: "review"; id: string | null; board?: boolean } | { v: "runs"; file: string | null } | { v: "playbooks"; file: string | null } | { v: "progress" };

function parseRoute(hash: string): Route {
  const [p, q = ""] = hash.replace(/^#\/?/, "").split("?");
  const parts = p.split("/").filter(Boolean).map(decodeURIComponent);
  const qs = new URLSearchParams(q);
  // mandates switched off: their routes fall through to a new case
  if (!MANDATES_ENABLED && (parts[0] === "mandates" || parts[0] === "m")) return { v: "chat", id: null };
  if (!MANDATES_ENABLED) qs.delete("m");
  switch (parts[0]) {
    case "c": return { v: "chat", id: parts[1] ?? null, board: parts[2] === "board" };
    case "new": return { v: "chat", id: null, brain: BRAINS.includes(parts[1] as Brain) ? (parts[1] as Brain) : undefined, mandateId: qs.get("m") };
    case "mandates": return parts[1] === "new" ? { v: "mandate-new" } : { v: "mandates" };
    case "m": return parts[2] === "edit" ? { v: "mandate-edit", id: parts[1] } : { v: "mandate", id: parts[1] };
    case "train":
      if (parts[1] === "review") return { v: "review", id: parts[2] ?? null, board: parts[3] === "board" };
      if (parts[1] === "runs") return { v: "runs", file: parts[2] ?? null };
      if (parts[1] === "playbooks") return { v: "playbooks", file: parts.slice(2).join("/") || null };
      if (parts[1] === "progress") return { v: "progress" };
      if (parts[1] === "feedback") return { v: "feedback" };
      return { v: "interviews" };
    default: return { v: "chat", id: null };
  }
}

// The hash and the chosen brain are external stores (the URL, localStorage):
// read with useSyncExternalStore, so the server render and the first client
// render agree and a reload lands where you were.
const NAV = "bench:nav";
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb); window.addEventListener(NAV, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener("hashchange", cb); window.removeEventListener(NAV, cb); window.removeEventListener("storage", cb); };
};
const readHash = () => window.location.hash;
const readBrain = (): Brain => { const b = localStorage.getItem("bench.brain"); return b === "regina" ? "regina" : "wincent"; };
const readOnboarded = () => localStorage.getItem(ONBOARDED_KEY) === "1";

export function BenchApp() {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const route = useMemo(() => parseRoute(hash), [hash]);
  const brain = useSyncExternalStore(subscribe, readBrain, (): Brain => "wincent");
  const [nonce, setNonce] = useState(0);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const [mandates, setMandates] = useState<BenchMandate[]>([]);
  const [activity, setActivity] = useState<Activity>({ busy: null, recording: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [offline, setOffline] = useState<string | null>(null);
  const [openFeedback, setOpenFeedback] = useState(0);
  // first run: the onboarding shows until dismissed (remembered); "How this works" reopens it
  const onboarded = useSyncExternalStore(subscribe, readOnboarded, () => true);
  const [howOpen, setHowOpen] = useState(false);
  const closeOnboarding = () => { localStorage.setItem(ONBOARDED_KEY, "1"); setHowOpen(false); window.dispatchEvent(new Event(NAV)); };

  const go = useCallback((to: string, replace = false) => {
    if (replace) history.replaceState(null, "", to); else history.pushState(null, "", to);
    if (to.startsWith("#/new") && !replace) setNonce((n) => n + 1); // every "new case" is a fresh view
    window.dispatchEvent(new Event(NAV));
  }, []);

  const loadLists = useCallback(() => {
    api<{ conversations: ConversationSummary[] }>("/api/bench/conversations").then((r) => { setRecent(r.conversations); setOffline(null); }).catch((e) => setOffline((e as Error).message));
    if (MANDATES_ENABLED) api<{ mandates: { mandate: BenchMandate }[] }>("/api/bench/mandates").then((r) => setMandates(r.mandates.map((m) => m.mandate))).catch(() => {});
    api<{ items: { status: string }[] }>("/api/bench/feedback").then((r) => setOpenFeedback(r.items.filter((i) => i.status === "open").length)).catch(() => {});
  }, []);
  const refresh = useCallback(() => { loadLists(); setRefreshKey((k) => k + 1); }, [loadLists]);
  useEffect(() => { loadLists(); }, [loadLists]);
  // a turn left running elsewhere: keep its "working" mark current
  useEffect(() => {
    if (!recent.some((c) => c.running)) return;
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [recent, refresh]);

  const setBrain = (b: Brain) => {
    localStorage.setItem("bench.brain", b);
    window.dispatchEvent(new Event(NAV));
    // in a chat, switching brain opens a new case with that brain (same mandate for a draft)
    if (route.v === "chat") go(`#/new/${b}${!route.id && route.mandateId ? `?m=${route.mandateId}` : ""}`, !route.id);
  };

  const openSummary = (route.v === "chat" || route.v === "review") && route.id ? recent.find((c) => c.id === route.id) : undefined;
  const draft: Draft = useMemo(() => ({
    agent: route.v === "chat" && route.brain ? route.brain : brain,
    brain: route.v === "chat" && route.brain ? route.brain : brain,
    kind: "chat",
    mandateId: route.v === "chat" ? route.mandateId ?? null : null,
  }), [route, brain]);
  // One ChatView per conversation; a draft keeps its view when it becomes a conversation.
  const draftKey = `new:${nonce}:${draft.brain}:${draft.mandateId ?? ""}`;
  const chatKey = route.v === "chat" && route.id ? aliases[route.id] ?? route.id : draftKey;
  const chatMandateId = route.v === "chat" ? (route.id ? openSummary?.mandate_id ?? null : draft.mandateId) : null;
  const chatMandate = mandates.find((m) => m.id === chatMandateId) ?? null;
  const deployed = chatMandate?.brains ?? BRAINS;
  const figureBrain: Brain = openSummary?.brain ?? (route.v === "chat" ? draft.brain : brain);
  const inChat = route.v === "chat";
  const figureState = !inChat ? "idle"
    : activity.recording === "recording" ? "hearing"
    : activity.busy ? (activity.busy.kind === "writing" ? "speaking" : "working")
    : activity.recording === "transcribing" ? "working" : "listening";
  const statusLine = !inChat ? "On the bench"
    : activity.recording === "recording" ? "Listening to you"
    : activity.recording === "transcribing" ? "Transcribing on this Mac"
    : activity.busy ? `${activity.busy.label.charAt(0).toUpperCase()}${activity.busy.label.slice(1)}…`
    : "Your turn";
  const activeBrain: Brain = inChat || openSummary ? figureBrain : brain; // the switcher shows the brain on screen
  const figureName = openSummary?.agent === "interviewer" ? "Interviewer" : BRAIN_LABEL[figureBrain];

  // eval runs are read under Train, Review runs, not among the cases
  const chats = recent.filter((c) => c.agent !== "interviewer" && c.kind !== "eval_run");
  const reviewing = route.v === "review" && !!route.id;
  const navTo = (r: Route["v"]) => (route.v === r ? "page" : undefined);

  return (
    <div className="bench-shell" data-view={reviewing ? "chat" : route.v}>
      <aside className="bench-rail">
        <div className="bench-rail__top">
          <div className="bench-brand">
            <span className="bench-brand__mark">M</span>
            <span><b>Mandate</b> bench</span>
            <span className="bench-brand__local">local</span>
          </div>
          <button className="bench-brand__how" onClick={() => setHowOpen(true)}>How this works</button>
          <div className="bench-switch" role="tablist" aria-label="Brain">
            {BRAINS.map((b) => (
              <button key={b} role="tab" disabled={inChat && !(route.v === "chat" && route.id) && !deployed.includes(b)} title={!deployed.includes(b) ? "Not deployed on this mandate" : undefined} aria-selected={activeBrain === b} data-on={activeBrain === b || undefined} onClick={() => setBrain(b)}>
                <span className="bench-brain-dot" data-brain={b} />
                <span className="bench-switch__name">{BRAIN_LABEL[b]}</span>
                <span className="bench-switch__domain">{BRAIN_DOMAIN[b]}</span>
              </button>
            ))}
          </div>
          <button className="bench-btn bench-btn--block" onClick={() => go(`#/new/${activeBrain}`)}>
            <span className="text-[#e4bd69]">✦</span> New case with {BRAIN_LABEL[activeBrain]}
          </button>
        </div>

        <nav className="bench-rail__nav">
          {offline && <p className="bench-alert bench-alert--rail"><span>{offline}</span></p>}
          {MANDATES_ENABLED && <RailSection title="Mandates" action={<button className="bench-rail__add" onClick={() => go("#/mandates/new")} title="New mandate">+ New</button>}>
            {mandates.slice(0, 6).map((m) => (
              <button key={m.id} className="bench-rail__item" aria-current={(route.v === "mandate" && route.id === m.id) || undefined} onClick={() => go(`#/m/${m.id}`)}>
                <span className="bench-status-dot" data-status={m.status} />
                <span className="truncate">{m.client}</span>
              </button>
            ))}
            <button className="bench-rail__item bench-rail__item--muted" aria-current={navTo("mandates")} onClick={() => go("#/mandates")}>
              {mandates.length ? `All mandates (${mandates.length})` : "Create your first mandate"}
            </button>
          </RailSection>}

          <RailSection title="Train">
            <button className="bench-rail__item" aria-current={navTo("feedback")} onClick={() => go("#/train/feedback")}>
              <span className="flex-1">Feedback inbox</span>{openFeedback > 0 && <span className="bench-count">{openFeedback}</span>}
            </button>
            <button className="bench-rail__item" aria-current={navTo("interviews")} onClick={() => go("#/train/interviews")}>Interviews</button>
            <button className="bench-rail__item" aria-current={navTo("review") ?? navTo("runs")} onClick={() => go("#/train/review")}>Review runs</button>
            <button className="bench-rail__item" aria-current={navTo("playbooks")} onClick={() => go("#/train/playbooks")}>Playbooks</button>
            <button className="bench-rail__item" aria-current={navTo("progress")} onClick={() => go("#/train/progress")}>Brain progress</button>
          </RailSection>

          <RailSection title="Recent cases">
            {chats.length === 0 && <p className="bench-rail__empty">Your conversations are saved here automatically.</p>}
            {chats.slice(0, 14).map((c) => (
              <button key={c.id} className="bench-rail__item bench-rail__item--case" aria-current={(route.v === "chat" && route.id === c.id) || undefined} onClick={() => go(`#/c/${c.id}`)} title={c.title}>
                <span className="bench-brain-dot" data-brain={c.brain} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.title}</span>
                  <span className="bench-rail__meta">{BRAIN_LABEL[c.brain]}{c.mandate_id && mandates.find((m) => m.id === c.mandate_id) ? ` · ${mandates.find((m) => m.id === c.mandate_id)!.client}` : ""} · {when(c.updated_at)}</span>
                </span>
                {c.running && <span className="bench-live-dot" title="working" />}
              </button>
            ))}
          </RailSection>

        </nav>

        <div className="bench-figure" data-state={figureState} data-brain={figureBrain}>
          <ExpertPresence key={figureBrain} name={figureBrain} priority className="bench-figure__presence" />
          <div className="bench-figure__label">
            <span className="font-serif text-lg font-semibold">{figureName}</span>
            <span className="bench-figure__state"><i aria-hidden />{statusLine}</span>
          </div>
        </div>
      </aside>

      {route.v === "chat" && (
        <ChatView
          key={chatKey}
          convId={route.id}
          initialTab={route.board ? "board" : "conversation"}
          draft={draft}
          mandate={chatMandate}
          onOpened={(id) => { setAliases((a) => ({ ...a, [id]: chatKey })); go(`#/c/${id}`, true); loadLists(); }}
          onListChanged={refresh}
          onActivity={setActivity}
          onOpenMandate={(id) => go(`#/m/${id}`)}
          onOpenConversation={(id) => { loadLists(); go(`#/c/${id}`); }}
        />
      )}
      {route.v === "review" && route.id && (
        <ChatView
          key={`review:${route.id}`}
          convId={route.id}
          initialTab={route.board ? "board" : "conversation"}
          draft={draft}
          mandate={null}
          review={{ onBack: () => go("#/train/review"), backLabel: "All runs" }}
          onOpened={() => {}}
          onListChanged={loadLists}
          onActivity={setActivity}
          onOpenMandate={(id) => go(`#/m/${id}`)}
          onOpenConversation={(id) => { loadLists(); go(`#/c/${id}`); }}
        />
      )}
      {route.v !== "chat" && !reviewing && (
        <main className="bench-wide">
          {route.v === "mandates" && <MandatesHome refreshKey={refreshKey} onOpen={(id) => go(`#/m/${id}`)} onNew={() => go("#/mandates/new")} />}
          {route.v === "mandate-new" && <MandateForm onSaved={(m) => { refresh(); go(`#/m/${m.id}`, true); }} onCancel={() => history.back()} />}
          {route.v === "mandate-edit" && (mandates.find((m) => m.id === route.id)
            ? <MandateForm initial={mandates.find((m) => m.id === route.id)} onSaved={(m) => { refresh(); go(`#/m/${m.id}`, true); }} onCancel={() => history.back()} />
            : <section className="bench-page"><div className="bench-skel h-64" /></section>)}
          {route.v === "mandate" && (
            <MandateOverview key={route.id} id={route.id} refreshKey={refreshKey}
              onOpenConversation={(id) => go(`#/c/${id}`)}
              onNewConversation={(b) => go(`#/new/${b}?m=${route.id}`)}
              onEdit={(m) => go(`#/m/${m.id}/edit`)} />
          )}
          {route.v === "feedback" && <FeedbackView refreshKey={refreshKey} onChanged={refresh} onOpenConversation={(id) => { loadLists(); go(`#/c/${id}`); }} onOpenRun={(f) => go(`#/train/runs/${encodeURIComponent(f)}`)} />}
          {route.v === "interviews" && <InterviewsView refreshKey={refreshKey} onOpen={(id) => { refresh(); go(`#/c/${id}`); }} />}
          {route.v === "review" && <ReviewRunsView onOpen={(id) => go(`#/train/review/${id}`)} />}
          {route.v === "runs" && <RunsView file={route.file} onOpenRun={(f) => go(f ? `#/train/runs/${encodeURIComponent(f)}` : "#/train/runs")} onOpenConversation={(id) => { refresh(); go(`#/c/${id}`); }} />}
          {route.v === "playbooks" && <PlaybooksView file={route.file} onOpen={(f) => go(f ? `#/train/playbooks/${f}` : "#/train/playbooks")} />}
          {route.v === "progress" && <ProgressView onOpenRun={(f) => go(`#/train/runs/${encodeURIComponent(f)}`)} />}
        </main>
      )}
      {(!onboarded || howOpen) && <Onboarding onClose={closeOnboarding} />}
    </div>
  );
}

function RailSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bench-rail__section">
      <div className="bench-rail__head"><span>{title}</span>{action}</div>
      <div className="space-y-px">{children}</div>
    </section>
  );
}
