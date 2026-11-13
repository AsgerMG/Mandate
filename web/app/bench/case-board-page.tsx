"use client";

// The full case board page (/bench/board): hero answer, the visuals, then the
// reasoning and the sources, collapsible. Prints to a PDF via the print styles
// (board.css): no nav, no controls, the sources opened.
import { useEffect, useMemo, useState } from "react";
import { foldBoard, withoutBoard } from "@/lib/bench/board";
import { BOARD_FIXTURES } from "@/lib/bench/board-fixtures";
import { parseWebSources, type Citation } from "@/lib/bench/events";
import { BRAIN_DOMAIN, BRAIN_LABEL, groupSources, type BenchConversation } from "@/lib/bench/model";
import { api } from "./api";
import { BoardSections, usePrintOpen } from "./board-view";
import { Markdown } from "./markdown";

export function CaseBoardPage({ conversationId, fixture }: { conversationId: string | null; fixture: string | null }) {
  const fixed = fixture ? BOARD_FIXTURES[fixture] ?? null : null;
  const [conv, setConv] = useState<BenchConversation | null>(fixed);
  const [error, setError] = useState<string | null>(fixture && !fixed ? `No fixture called "${fixture}" (try forklift or fintech).` : null);
  usePrintOpen();
  useEffect(() => {
    if (fixed || !conversationId) return;
    api<{ conversation: BenchConversation }>(`/api/bench/conversations?id=${encodeURIComponent(conversationId)}`)
      .then((r) => setConv(r.conversation)).catch((e) => setError((e as Error).message));
  }, [conversationId, fixed]);

  const cites = useMemo(() => {
    if (!conv) return {} as Record<string, Citation>;
    const web: Record<string, Citation> = {};
    for (const m of conv.messages) if (m.role === "agent") Object.assign(web, parseWebSources(m.text));
    return { ...web, ...conv.cites };
  }, [conv]);
  const folded = useMemo(() => foldBoard(conv?.messages ?? []), [conv]);
  const sources = useMemo(() => groupSources(cites, conv?.sources ?? []), [cites, conv]);

  if (!conversationId && !fixture) return <Shell><Empty title="Which case?" text="Open a board from a conversation's Board tab, or a fixture: /bench/board?fixture=forklift" /></Shell>;
  if (error) return <Shell><Empty title="This board could not be opened." text={error} /></Shell>;
  if (!conv) return <Shell><div className="bench-skel h-64" /></Shell>;

  const who = BRAIN_LABEL[conv.agent];
  const updated = !conv.updated_at ? "" : new Date(conv.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const replies = conv.messages.filter((m) => m.text.trim());
  return (
    <Shell>
      {fixed && <p className="mb-page__fixture">Fixture: {fixture === "forklift" ? "illustrative content to check the layout; the conditions are not verified and the links point to the institutions' home pages." : "the board for the bench run of 10 November (fintech guarantees, round 3); the citations are that run's."}</p>}
      <header className="mb-page__head">
        <div>
          <p className="mb-page__brand"><span className="bench-brand__mark">M</span><span><b>Mandate</b> · Case board</span></p>
          <h1 className="mb-page__title">{folded.board.title ?? conv.title}</h1>
          <p className="mb-page__meta">
            <span>{who}, {BRAIN_DOMAIN[conv.brain].toLowerCase()}</span>
            {updated && <span>Updated {updated}</span>}
            <span>{folded.blocks} board update{folded.blocks === 1 ? "" : "s"} across {replies.filter((m) => m.role === "agent").length} replies</span>
            <span>{sources.length} sources</span>
          </p>
        </div>
        <div className="mb-page__actions">
          {!fixed && <a className="bench-btn bench-btn--ghost bench-btn--small" href={`/bench#/c/${conv.id}`}>Back to the conversation</a>}
          <button className="bench-btn bench-btn--small" onClick={() => window.print()}>Export PDF</button>
        </div>
      </header>

      {folded.blocks === 0 ? (
        <Empty title="No board yet." text={`${who} draws the board from the options stage onward. Until then, the conversation is the case.`} />
      ) : <BoardSections folded={folded} cites={cites} brain={who} />}

      <details className="mb-more" data-print-open>
        <summary><span className="mb-more__title">Sources <span className="bench-count">{sources.length}</span></span></summary>
        <div className="mb-more__body">
          <ol className="mb-sources">
            {sources.map((g) => (
              <li key={g.url ?? g.label}>
                <span className="mb-cites">{g.ids.map((id) => <span key={id} className="bench-chip bench-chip--static" data-kind={id.startsWith("w") ? "web" : "grounded"}>{id}</span>)}</span>{" "}
                {g.url ? <a href={g.url} target="_blank" rel="noreferrer">{g.label}</a> : <span>{g.label}</span>}
                {g.ids.map((id) => cites[id]?.quote).filter(Boolean).slice(0, 2).map((q, i) => <span key={i} className="mb-sources__quote">&ldquo;{q}&rdquo;</span>)}
              </li>
            ))}
          </ol>
        </div>
      </details>

      <details className="mb-more">
        <summary><span className="mb-more__title">The reasoning: the conversation, {replies.length} turns</span></summary>
        <div className="mb-more__body">
          {replies.map((m, i) => (
            <div key={i} className={`mb-reply${m.role === "client" ? " mb-reply--client" : ""}`}>
              <p className="mb-reply__who">{m.role === "client" ? "Client" : who}</p>
              <Markdown text={m.role === "agent" ? withoutBoard(m.text, "*(board updated)*") : m.text} cites={cites} />
            </div>
          ))}
        </div>
      </details>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mb-page"><div className="mb-page__inner">{children}</div></div>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="bench-board__empty"><h2>{title}</h2><p>{text}</p></div>;
}
