"use client";

// Train, Feedback: the improvement loop in one place. The inbox (open feedback
// by brain and theme) -> Distil (the interviewer proposes playbook edits that
// name the items they answer) -> accept (items resolve with the change they
// produced) -> Re-test (run an eval case again; the judge grades it; keep or revert the change).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
                    {i.kind === "run" && i.run_file ? <button className="bench-from inline" onClick={() => onOpenRun(i.run_file!)}>{i.run_file}</button>
                      : i.conversation_id ? <button className="bench-from inline" onClick={() => onOpenConversation(i.conversation_id!)}>{titles[i.conversation_id] ?? (i.case ? `run of ${i.case}` : "the conversation")}{i.message_index !== null ? `, reply ${i.message_index}` : ""}</button> : null}
                    {i.reviewer ? ` · by ${i.reviewer}` : ""}
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
  async function act(action: "score" | "keep" | "revert", id: string) {
    setErr(null);
    try { await api("/api/bench/retest", { json: { action, id } }); onScored(); } catch (e) { setErr((e as Error).message); }
  }
  if (!rows.length) return <div className="bench-panel-card"><p className="bench-panel-empty">No re-tests yet. Pick a case and run it; the judge grades it and, from the second run of a case, the loop&apos;s rule says keep or revert.</p></div>;
  const musts = (r: Retest) => r.judgement ? `${r.judgement.must_met}${r.judgement.must_partly ? `+${r.judgement.must_partly}p` : ""}/${r.judgement.must_total}` : r.score ? `${r.score.must_met}/${r.score.must_total}` : "—";
  return (
    <div className="bench-panel-card overflow-x-auto">
      {err && <p className="bench-fb__err">{err}</p>}
      <table className="bench-runs bench-retests">
        <thead><tr><th>Case</th><th>When</th><th>Playbooks</th><th>Musts met</th><th>Must-nots hit</th><th>Grade</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const d = r.decision;
            const dg = d ? d.after.grade - d.before.grade : null;
            const judging = r.running && !!r.score_conversation;
            return (
              <Fragment key={r.id}>
                <tr className="cursor-default">
                  <td><span className="bench-brain-dot" data-brain={r.brain} /> {r.case.replace(/_/g, " ")}{r.after_change && <span className="bench-muted"> · after a change</span>}</td>
                  <td className="bench-muted">{when(r.created_at)}</td>
                  <td><code className="text-[10.5px]">{r.playbooks_sha?.slice(0, 7) ?? "?"}{r.playbooks_dirty ? "+" : ""}</code></td>
                  <td>{musts(r)}</td>
                  <td>{r.judgement ? `${r.judgement.must_not_hit}/${r.judgement.must_not_total}${r.judgement.must_not_borderline ? ` (${r.judgement.must_not_borderline} borderline)` : ""}` : r.score ? `${r.score.must_not_hit}/${r.score.must_not_total}` : "—"}</td>
                  <td>{r.score?.grade
                    ? <><span className="bench-grade" data-grade={r.score.grade}>{r.score.grade}</span>{r.judgement?.holistic_grade && <span className="bench-muted" title="the judge's own holistic grade"> h{r.judgement.holistic_grade}</span>} {dg !== null && dg !== 0 && <Delta v={dg} />}</>
                    : "—"}</td>
                  <td className="whitespace-nowrap text-right">
                    {r.running ? <span className="bench-live">{judging ? "judging" : "running"}</span>
                      : !r.score ? <button className="bench-link text-[11px]" onClick={() => void act("score", r.id)}>{r.score_conversation ? "Judge again" : "Judge"}</button> : null}
                    {" "}<button className="bench-link text-[11px]" onClick={() => onOpenConversation(r.run_conversation)}>answer</button>
                    {r.score_conversation && <> · <button className="bench-link text-[11px]" onClick={() => onOpenConversation(r.score_conversation!)}>judgement</button></>}
                  </td>
                </tr>
                {(r.judge_error || d) && (
                  <tr className="bench-retests__decision cursor-default">
                    <td colSpan={7}>
                      {r.judge_error && !r.running && <p className="bench-fb__err">The judge could not finish: {r.judge_error}</p>}
                      {d && (
                        <div className="bench-decision" data-verdict={d.verdict}>
                          <span className="bench-decision__verdict">{d.verdict === "keep" ? "Keep" : "Revert"}</span>
                          <span className="bench-decision__sides">
                            Before ({when(d.before.created_at)}): grade {d.before.grade}, musts {d.before.must}, must-nots hit {d.before.must_not_hit}
                            {" → "}After: grade {d.after.grade}, musts {d.after.must}, must-nots hit {d.after.must_not_hit}.
                          </span>
                          <span className="bench-muted"> {d.reason}.</span>
                          {d.change && d.change.paths.length > 0 && (
                            d.applied
                              ? <span className="bench-muted"> {d.applied.action === "reverted" ? `Reverted ${d.applied.paths.join(", ")}` : "Kept"} {when(d.applied.at)}.</span>
                              : <span className="bench-decision__actions">
                                  <span className="bench-muted">The change: {d.change.paths.join(", ")}. </span>
                                  <button className={`bench-btn bench-btn--small${d.verdict === "keep" ? "" : " bench-btn--outline"}`} onClick={() => void act("keep", r.id)}>Keep it</button>
                                  <button className={`bench-btn bench-btn--small${d.verdict === "revert" ? "" : " bench-btn--outline"}`} onClick={() => void act("revert", r.id)}>Revert the change</button>
                                </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
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
