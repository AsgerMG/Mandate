"use client";

// Markdown for the bench: GitHub tables (remark-gfm), citation chips for
// [c1] / [w2], links that open outside.
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CITE_RE, type Citation } from "@/lib/bench/events";

/** "[c1, c4]" becomes two chip links the renderer turns into chips. */
const withChips = (text: string) =>
  text.replace(CITE_RE, (_, ids: string) =>
    ids.split(/\s*[,;]\s*/).map((id) => `[${id}](#cite-${id})`).join(""));

export function Chip({ id, cite }: { id: string; cite?: Citation }) {
  const web = id.startsWith("w");
  return (
    <span className="bench-chip" data-kind={web ? "web" : "grounded"} tabIndex={0}>
      {id}
      <span className="bench-chip__card" role="tooltip">
        <span className="bench-chip__kind">{web ? "Web source, fetched this run" : "Grounded citation"}</span>
        {cite?.label && <span className="bench-chip__label">{cite.label}</span>}
        {cite?.quote && <span className="bench-chip__quote">&ldquo;{cite.quote.length > 420 ? `${cite.quote.slice(0, 420)}…` : cite.quote}&rdquo;</span>}
        {cite?.url && <a className="bench-chip__url" href={cite.url} target="_blank" rel="noreferrer">{cite.url}</a>}
        {!cite && <span className="bench-chip__quote">Source details not captured in this view.</span>}
      </span>
    </span>
  );
}

function MarkdownInner({ text, cites = {}, className = "bench-md" }: { text: string; cites?: Record<string, Citation>; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("#cite-")) { const id = href.slice(6); return <Chip id={id} cite={cites[id]} />; }
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
          table: ({ children }) => <div className="bench-table"><table>{children}</table></div>,
        }}
      >
        {withChips(text)}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownInner);
