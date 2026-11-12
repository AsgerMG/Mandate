"use client";

// Mandates: the client level above conversations (pa_os.md §2). The overview
// cards, one mandate's page (its brief, profile, conversations and what landed
// across them), and the create / edit form.
import { useCallback, useEffect, useState } from "react";
import {
  BRAIN_LABEL, BRAINS, MANDATE_STATUS,
  type BenchMandate, type Brain, type ConversationSummary, type LandedItem, type MandateStatus, type Rollup,
} from "@/lib/bench/model";
import { api, when } from "./api";
import { Markdown } from "./markdown";
import { Sources } from "./chat-view";

type Card = { mandate: BenchMandate; conversations: number; decisions: string[]; steps: string[]; counts: { decisions: number; steps: number; flags: number; watches: number }; last_activity: string };

export function StatusPill({ status }: { status: MandateStatus }) {
  return <span className="bench-status" data-status={status}>{status}</span>;
}

export function MandatesHome({ onOpen, onNew, refreshKey }: { onOpen: (id: string) => void; onNew: () => void; refreshKey: number }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ mandates: Card[] }>("/api/bench/mandates").then((r) => setCards(r.mandates)).catch((e) => setErr((e as Error).message));
  }, [refreshKey]);
  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div>
          <p className="bench-eyebrow">Portfolio</p>
          <h1 className="bench-page__title">Mandates</h1>
          <p className="bench-page__lede">Each client you work for. A mandate holds its conversations with any brain, the client profile the brains read first, and what has landed across them.</p>
        </div>
        <button className="bench-btn" onClick={onNew}>New mandate</button>
      </header>
      {err && <div className="bench-alert"><p>{err}</p></div>}
      {!cards && !err && <div className="bench-grid">{[0, 1, 2].map((i) => <div key={i} className="bench-skel h-44" />)}</div>}
      {cards?.length === 0 && (
        <div className="bench-empty-state">
          <h2>No mandates yet.</h2>
          <p>Create one for a client: a name, a one-paragraph brief, the markets, and a short profile. Every conversation you start inside it begins from that profile.</p>
          <button className="bench-btn mt-4" onClick={onNew}>Create the first mandate</button>
        </div>
      )}
      {cards && cards.length > 0 && (
        <div className="bench-grid">
          {cards.map(({ mandate: m, ...c }) => (
            <button key={m.id} className="bench-card" onClick={() => onOpen(m.id)}>
              <div className="flex items-start justify-between gap-2">
                <span className="bench-card__title">{m.client}</span>
                <StatusPill status={m.status} />
              </div>
              {m.markets.length > 0 && <span className="bench-card__markets">{m.markets.join(" · ")}</span>}
              <span className="bench-card__brief">{m.brief || "No brief yet."}</span>
              <span className="bench-card__stats">
                <span><b>{c.counts.decisions}</b> decisions</span>
                <span><b>{c.counts.steps}</b> next steps</span>
                <span><b>{c.counts.flags}</b> flags</span>
                <span><b>{c.conversations}</b> conversations</span>
              </span>
              {c.steps.length > 0 && <span className="bench-card__next"><span className="bench-eyebrow">Latest next step</span>{c.steps[c.steps.length - 1]}</span>}
              <span className="bench-card__when">Last activity {when(c.last_activity)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function MandateForm({ initial, onSaved, onCancel }: { initial?: BenchMandate; onSaved: (m: BenchMandate) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    client: initial?.client ?? "", brief: initial?.brief ?? "", markets: initial?.markets.join(", ") ?? "",
    status: initial?.status ?? "active" as MandateStatus, profile: initial?.profile ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.client.trim()) { setErr("Give the client a name."); return; }
    setSaving(true); setErr(null);
    try {
      const r = await api<{ mandate: BenchMandate }>("/api/bench/mandates", { method: initial ? "PATCH" : "POST", json: { ...(initial ? { id: initial.id } : {}), ...f } });
      onSaved(r.mandate);
    } catch (e) { setErr((e as Error).message); setSaving(false); }
  }
  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div>
          <p className="bench-eyebrow">{initial ? "Edit mandate" : "New mandate"}</p>
          <h1 className="bench-page__title">{initial ? initial.client : "A new client"}</h1>
        </div>
      </header>
      <form className="bench-form" onSubmit={save}>
        <label><span>Client</span><input autoFocus value={f.client} maxLength={200} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="e.g. Acme Lending GmbH" /></label>
        <label><span>Brief <em>one paragraph: what the client wants from us</em></span><textarea rows={3} maxLength={4000} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} placeholder="Secure public guarantees for the SME loan book in DE, FR and IT, and follow the KfW reform." /></label>
        <div className="grid grid-cols-[1fr_12rem] gap-4">
          <label><span>Markets <em>comma separated</em></span><input value={f.markets} onChange={(e) => setF({ ...f, markets: e.target.value })} placeholder="EU, DE, FR, IT" /></label>
          <label><span>Status</span>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as MandateStatus })}>{MANDATE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
        </div>
        <label><span>Client profile <em>the brains read this before the first message of every conversation</em></span>
          <textarea rows={7} maxLength={8000} value={f.profile} onChange={(e) => setF({ ...f, profile: e.target.value })} placeholder={"Legal form and seat, group size (staff, turnover), what the product does and for whom, licences held, funding raised, where the customers are."} />
        </label>
        {err && <div className="bench-alert"><p>{err}</p></div>}
        <div className="flex gap-2">
          <button className="bench-btn" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create mandate"}</button>
          <button type="button" className="bench-btn bench-btn--ghost" onClick={onCancel}>Cancel</button>
        </div>
        <p className="bench-panel-foot">Stored on this laptop only (~/Mandate-backups/bench), never in the repo.</p>
      </form>
    </section>
  );
}

export function MandateOverview({ id, onOpenConversation, onNewConversation, onEdit, refreshKey }: {
  id: string; onOpenConversation: (id: string) => void; onNewConversation: (brain: Brain) => void; onEdit: (m: BenchMandate) => void; refreshKey: number;
}) {
  const [data, setData] = useState<{ mandate: BenchMandate; rollup: Rollup; conversations: ConversationSummary[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ mandate: BenchMandate; rollup: Rollup; conversations: ConversationSummary[] }>(`/api/bench/mandates?id=${id}`).then(setData).catch((e) => setErr((e as Error).message));
  }, [id]);
  useEffect(() => { load(); }, [load, refreshKey]);
  if (err) return <section className="bench-page"><div className="bench-alert"><p>{err}</p></div></section>;
  if (!data) return <section className="bench-page"><div className="bench-skel h-24" /><div className="bench-skel mt-6 h-64" /></section>;
  const { mandate: m, rollup: r, conversations } = data;
  const convTitle = (cid: string) => conversations.find((c) => c.id === cid)?.title ?? "";
  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div className="min-w-0">
          <p className="bench-eyebrow">Mandate {m.markets.length > 0 && <>· {m.markets.join(" · ")}</>}</p>
          <h1 className="bench-page__title flex items-center gap-3">{m.client} <StatusPill status={m.status} /></h1>
          <p className="bench-page__lede">{m.brief || "No brief yet."}</p>
        </div>
        <div className="flex flex-none gap-2">
          <button className="bench-btn bench-btn--ghost" onClick={() => onEdit(m)}>Edit</button>
          {BRAINS.map((b) => <button key={b} className="bench-btn" onClick={() => onNewConversation(b)}>Ask {BRAIN_LABEL[b]}</button>)}
        </div>
      </header>

      <div className="bench-mandate-grid">
        <div className="min-w-0 space-y-6">
          <div className="bench-panel-card">
            <h3 className="bench-eyebrow">Client profile <span className="bench-muted">read by the brains first</span></h3>
            {m.profile ? <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[#23304a]">{m.profile}</p>
              : <p className="bench-panel-empty">No profile yet. <button className="bench-link" onClick={() => onEdit(m)}>Add one</button>: the brains then skip the questions it answers.</p>}
          </div>
          <div className="bench-panel-card">
            <h3 className="bench-eyebrow">Conversations <span className="bench-count">{conversations.length}</span></h3>
            {conversations.length === 0 ? <p className="bench-panel-empty">None yet. Ask Wincent about money or Regina about rules; both start from the profile.</p> : (
              <ul className="mt-2 divide-y divide-[#e6dfd1]">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button className="bench-conv-row" onClick={() => onOpenConversation(c.id)}>
                      <span className="bench-brain-dot" data-brain={c.agent === "interviewer" ? "interviewer" : c.brain} />
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      {c.running && <span className="bench-live">working</span>}
                      <span className="bench-muted">{BRAIN_LABEL[c.agent]} · {c.turns} {c.turns === 1 ? "turn" : "turns"} · {when(c.updated_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {r.question && <div className="bench-question"><p className="bench-eyebrow">Latest open question</p><Markdown text={r.question} /></div>}
        </div>
        <div className="min-w-0 space-y-6">
          <RollupList title="Decisions" items={r.decisions} convTitle={convTitle} onOpen={onOpenConversation} empty="No decisions yet." />
          <RollupList title="Next steps" items={r.steps} convTitle={convTitle} onOpen={onOpenConversation} empty="No next steps yet." />
          <RollupList title="Flags" items={r.flags} convTitle={convTitle} onOpen={onOpenConversation} />
          <RollupList title="Watches" items={r.watches} convTitle={convTitle} onOpen={onOpenConversation} />
          <div className="bench-panel-card"><Sources groups={r.sources} cites={{}} who="a brain" /></div>
        </div>
      </div>
    </section>
  );
}

function RollupList({ title, items, empty, convTitle, onOpen }: { title: string; items: LandedItem[]; empty?: string; convTitle: (id: string) => string; onOpen: (id: string) => void }) {
  if (!items.length && !empty) return null;
  return (
    <div className="bench-panel-card">
      <h3 className="bench-eyebrow">{title} <span className="bench-count">{items.length}</span></h3>
      {items.length === 0 ? <p className="bench-panel-empty">{empty}</p> : (
        <ul className="mt-2 space-y-2.5">
          {[...items].reverse().map((it, i) => (
            <li key={i} className="bench-landed-item">
              <Markdown text={it.text} />
              <button className="bench-from" onClick={() => onOpen(it.conversation)}>{convTitle(it.conversation)} · {when(it.at)}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
