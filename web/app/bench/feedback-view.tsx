"use client";

// Train, Feedback: the improvement loop in one place. The inbox (open feedback
// by brain and theme) -> Distil (the interviewer proposes playbook edits that
// name the items they answer) -> accept (items resolve with the change they
// produced) -> Re-test (run an eval case again, score it, before / after).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BRAIN_LABEL, BRAINS, THEME_LABEL, THEMES,
  type Brain, type ConversationSummary, type FeedbackItem, type Retest, type Theme,
} from "@/lib/bench/model";
import { api, when } from "./api";
import { RetestLauncher } from "./chat-view";

type RetestRow = Retest & { running: boolean };

export function FeedbackView({ refreshKey, onChanged, onOpenConversation, onOpenRun }: {
  refreshKey: number; onChanged: () => void; onOpenConversation: (id: string) => void; onOpenRun: (f: string) => void;
}) {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [retests, setRetests] = useState<RetestRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => {
    api<{ items: FeedbackItem[] }>("/api/bench/feedback").then((r) => setItems(r.items)).catch((e) => setErr((e as Error).message));
    api<{ conversations: ConversationSummary[] }>("/api/bench/conversations").then((r) => setTitles(Object.fromEntries(r.conversations.map((c) => [c.id, c.title])))).catch(() => {});
    api<{ retests: RetestRow[] }>("/api/bench/retest").then((r) => setRetests(r.retests)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load, refreshKey, tick]);
  useEffect(() => {
    if (!retests.some((r) => r.running)) return;
    const t = setTimeout(() => setTick((n) => n + 1), 5000);
    return () => clearTimeout(t);
  }, [retests]);

  const open = (items ?? []).filter((i) => i.status === "open");
  const resolved = (items ?? []).filter((i) => i.status === "resolved").slice(0, 12);
  const noted = (items ?? []).filter((i) => i.status === "noted").length;

  return (
    <section className="bench-page">
      <header className="bench-page__head">
        <div>
          <p className="bench-eyebrow">Train · Feedback</p>
          <h1 className="bench-page__title">Feedback inbox</h1>
          <p className="bench-page__lede">Every reply you mark off, every grade at 3 or below, every interview. Distil a batch: the interviewer proposes playbook edits that name the feedback they answer. Accept them and the items resolve; then re-test a case to see whether the brain got better.</p>
        </div>
        <div className="bench-stat-row">
          <span><b>{open.length}</b> open</span><span><b>{resolved.length}</b> resolved</span><span><b>{noted}</b> good signals</span>
        </div>
      </header>
      {err && <div className="bench-alert"><p>{err}</p></div>}
      {!items && !err && <div className="bench-skel h-56" />}
      {items && (
        <div className="bench-grid bench-grid--2">
          {BRAINS.map((b) => <BrainInbox key={b} brain={b} items={open.filter((i) => i.brain === b)} titles={titles}
            onOpenConversation={onOpenConversation} onOpenRun={onOpenRun} onChanged={() => { load(); onChanged(); }} />)}
        </div>
      )}

      <h2 className="bench-section-title">Re-tests</h2>
      <div className="bench-grid bench-grid--retest">
        <RetestTable rows={retests} onOpenConversation={onOpenConversation} onScored={load} />
        <RetestLauncher afterChange={null} onOpenConversation={onOpenConversation} />
      </div>

      <h2 className="bench-section-title">Resolved</h2>
      {resolved.length === 0 ? <p className="bench-panel-empty">Nothing resolved yet. Accepting a proposed change resolves the feedback it addresses.</p> : (
        <ul className="divide-y divide-[#e6dfd1]">
          {resolved.map((i) => (
            <li key={i.id} className="bench-fb-row">
              <span className="bench-brain-dot" data-brain={i.brain} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{i.note || i.excerpt}</span>
                <span className="bench-muted">{THEME_LABEL[i.theme]} · fixed by {(i.resolution?.paths ?? []).map((p) => <code key={p} className="mx-1">{p.replace("mandate/", "")}</code>)} {when(i.resolution?.at)}</span>
              </span>
              {i.resolution?.conversation_id && <button className="bench-link text-[11px]" onClick={() => onOpenConversation(i.resolution!.conversation_id!)}>the change</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BrainInbox({ brain, items, titles, onOpenConversation, onOpenRun, onChanged }: {
  brain: Brain; items: FeedbackItem[]; titles: Record<string, string>;
  onOpenConversation: (id: string) => void; onOpenRun: (f: string) => void; onChanged: () => void;
}) {
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const byTheme = useMemo(() => THEMES.map((t) => [t, items.filter((i) => i.theme === t)] as [Theme, FeedbackItem[]]).filter(([, l]) => l.length), [items]);
  const chosen = items.filter((i) => !skip.has(i.id));
  async function distil() {
    setBusy(true); setErr(null);
    try { const r = await api<{ conversationId: string }>("/api/bench/distil", { json: { brain, ids: chosen.map((i) => i.id) } }); onOpenConversation(r.conversationId); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function dismiss(id: string) {
    try { await api("/api/bench/feedback", { method: "PATCH", json: { id, status: "dismissed" } }); onChanged(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="bench-panel-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="bench-section-title !my-0"><span className="bench-brain-dot" data-brain={brain} /> {BRAIN_LABEL[brain]} <span className="bench-count">{items.length}</span></h3>
        <button className="bench-btn bench-btn--small" disabled={!chosen.length || busy} onClick={() => void distil()}>
          {busy ? "Starting…" : `Distil ${chosen.length || ""}`.trim()}
        </button>
      </div>
      {err && <p className="bench-fb__err">{err}</p>}
      {items.length === 0 ? <p className="bench-panel-empty mt-3">Nothing open. Mark a reply off, or grade a conversation, and it lands here.</p> : byTheme.map(([t, list]) => (
        <div key={t} className="mt-4">
          <p className="bench-eyebrow">{THEME_LABEL[t]} <span className="bench-count">{list.length}</span></p>
          <ul className="mt-1.5 space-y-1">
            {list.map((i) => (
              <li key={i.id} className="bench-fb-item">
                <input type="checkbox" checked={!skip.has(i.id)} aria-label="Include in the distil"
                  onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(i.id); else n.add(i.id); return n; })} />
                <span className="min-w-0 flex-1">
                  <span className="bench-fb-item__what">{i.kind === "interview" ? "Interview" : i.kind === "run" ? `Run graded ${i.grade}` : i.rating === "off" ? "Off" : i.grade ? `Graded ${i.grade}` : "Note"}</span>
                  {" "}{i.note ? <span className="text-[#23304a]">{i.note}</span> : <span className="bench-muted italic">{i.excerpt.replace(/[#*_`>|]/g, "").slice(0, 140)}</span>}
                  <span className="block bench-muted">
                    {i.run_file ? <button className="bench-from inline" onClick={() => onOpenRun(i.run_file!)}>{i.run_file}</button>
                      : i.conversation_id ? <button className="bench-from inline" onClick={() => onOpenConversation(i.conversation_id!)}>{titles[i.conversation_id] ?? "the conversation"}</button> : null}
                    {" · "}{when(i.created_at)}{i.playbooks.sha ? ` · playbooks ${i.playbooks.sha.slice(0, 7)}${i.playbooks.dirty ? "+" : ""}` : ""}
                  </span>
                </span>
                <button className="bench-fb-item__x" title="Dismiss (kept in the log)" onClick={() => void dismiss(i.id)}>×</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RetestTable({ rows, onOpenConversation, onScored }: { rows: RetestRow[]; onOpenConversation: (id: string) => void; onScored: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  // oldest first per case, so each row can show the change against the one before
  const prevOf = useMemo(() => {
    const m = new Map<string, RetestRow | undefined>();
    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = new Map<string, RetestRow>();
    for (const r of sorted) { m.set(r.id, last.get(r.case)); if (r.score) last.set(r.case, r); }
    return m;
  }, [rows]);
  async function score(id: string) {
    setErr(null);
    try { await api("/api/bench/retest", { json: { action: "score", id } }); onScored(); } catch (e) { setErr((e as Error).message); }
  }
  if (!rows.length) return <div className="bench-panel-card"><p className="bench-panel-empty">No re-tests yet. Pick a case and run it; after a playbook change, run it again to compare.</p></div>;
  const delta = (a: number, b: number | undefined) => (b === undefined ? null : a - b);
  return (
    <div className="bench-panel-card overflow-x-auto">
      {err && <p className="bench-fb__err">{err}</p>}
      <table className="bench-runs">
        <thead><tr><th>Case</th><th>When</th><th>Playbooks</th><th>Musts met</th><th>Must-nots hit</th><th>Grade</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const p = prevOf.get(r.id)?.score ?? undefined;
            const dm = r.score && p ? delta(r.score.must_met / Math.max(1, r.score.must_total), p.must_met / Math.max(1, p.must_total)) : null;
            const dg = r.score?.grade && p?.grade ? r.score.grade - p.grade : null;
            return (
              <tr key={r.id} className="cursor-default">
                <td><span className="bench-brain-dot" data-brain={r.brain} /> {r.case.replace(/_/g, " ")}</td>
                <td className="bench-muted">{when(r.created_at)}</td>
                <td><code className="text-[10.5px]">{r.playbooks_sha?.slice(0, 7) ?? "?"}{r.playbooks_dirty ? "+" : ""}</code></td>
                <td>{r.score ? <>{r.score.must_met}/{r.score.must_total} {dm !== null && dm !== 0 && <Delta v={dm > 0 ? 1 : -1} />}</> : "—"}</td>
                <td>{r.score ? `${r.score.must_not_hit}/${r.score.must_not_total}` : "—"}</td>
                <td>{r.score?.grade ? <><span className="bench-grade" data-grade={r.score.grade}>{r.score.grade}</span> {dg !== null && dg !== 0 && <Delta v={dg} />}</> : "—"}</td>
                <td className="whitespace-nowrap text-right">
                  {r.running ? <span className="bench-live">running</span>
                    : !r.score && !r.score_conversation ? <button className="bench-btn bench-btn--small" onClick={() => void score(r.id)}>Score</button>
                    : !r.score ? <button className="bench-link text-[11px]" onClick={() => void score(r.id)}>Score again</button> : null}
                  {" "}<button className="bench-link text-[11px]" onClick={() => onOpenConversation(r.run_conversation)}>answer</button>
                  {r.score_conversation && <> · <button className="bench-link text-[11px]" onClick={() => onOpenConversation(r.score_conversation!)}>scoring</button></>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Delta({ v }: { v: number }) {
  return <span className="bench-delta" data-up={v > 0 || undefined}>{v > 0 ? "▲" : "▼"}{Math.abs(v) >= 1 ? Math.abs(v) : ""}</span>;
}
