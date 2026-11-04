"use client";

// Renders the report's constrained Markdown (headings, one table, bullets,
// bold/italic, [n] footnote markers) without a markdown dependency — the
// format is fixed by the system prompt in etl/intelligence/briefing.py.

import { Citation } from "@/lib/api";
import { Fragment, ReactNode } from "react";

function inline(text: string, key = 0): ReactNode {
  // Order matters: bold before italic, footnote markers anywhere.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[\d+(?:,\s*\d+)*\])/g);
  return (
    <Fragment key={key}>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        // Citation markers are stripped from the displayed text — traceability
        // lives in the Coverage & sources fold-out, where each source lists
        // the exact claims it supports.
        if (/^\[\d+(?:,\s*\d+)*\]$/.test(p)) return null;
        return p;
      })}
    </Fragment>
  );
}

// The appendix (Out of Scope register) is generated for completeness but
// belongs in the fold-out, not the main executive read.
export function splitAppendix(text: string): { main: string; appendix: string | null } {
  const match = text.match(/^##\s+Appendix:.*$/m);
  if (!match || match.index === undefined) return { main: text, appendix: null };
  return {
    main: text.slice(0, match.index).trimEnd(),
    appendix: text.slice(match.index).trim(),
  };
}

export function ReportMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let table: string[][] = [];
  let bullets: string[] = [];
  let k = 0;

  const flush = () => {
    if (table.length) {
      const [head, ...body] = table;
      blocks.push(
        <div className="report-table-wrap" key={k++}>
          <table className="report-table">
            <thead>
              <tr>{head.map((c, i) => <th key={i}>{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((row, i) => (
                <tr key={i}>
                  {row.map((c, j) => (
                    <td key={j}>{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      table = [];
    }
    if (bullets.length) {
      blocks.push(
        <ul key={k++}>
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("|")) {
      const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (!cells.every((c) => /^[-: ]*$/.test(c))) table.push(cells);
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (table.length) flush();
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    if (!line) continue;
    if (line.startsWith("# ")) blocks.push(<h1 key={k++}>{inline(line.slice(2))}</h1>);
    else if (line.startsWith("## ")) blocks.push(<h2 key={k++}>{inline(line.slice(3))}</h2>);
    else if (line.startsWith("### ")) blocks.push(<h3 key={k++}>{inline(line.slice(4))}</h3>);
    else blocks.push(<p key={k++}>{inline(line)}</p>);
  }
  flush();

  return <div className="report">{blocks}</div>;
}

export function ReportCoverage({
  appendix,
  citations,
}: {
  appendix: string | null;
  citations: Citation[];
}) {
  // Group every citation occurrence by source: with inline markers stripped
  // from the report text, each source entry instead lists the exact claims
  // (cited snippets) it supports — traceability by source, not by marker.
  const bySource = new Map<number, { citation: Citation; snippets: string[] }>();
  for (const c of citations) {
    if (!c.n) continue;
    const entry = bySource.get(c.n) ?? { citation: c, snippets: [] };
    if (c.cited_text && !entry.snippets.includes(c.cited_text)) entry.snippets.push(c.cited_text);
    bySource.set(c.n, entry);
  }
  if (!appendix && !bySource.size) return null;
  return (
    <details className="coverage">
      <summary>Coverage &amp; sources</summary>
      {appendix && (
        <div className="report-sheet">
          <ReportMarkdown text={appendix} />
        </div>
      )}
      {bySource.size > 0 && (
        <div className="sources">
          <h2>Sources</h2>
          {[...bySource.entries()]
            .sort(([a], [b]) => a - b)
            .map(([n, { citation: c, snippets }]) => (
              <div className="source-item" key={n}>
                <div className="row">
                  <strong>
                    [{n}] {c.celex || c.title}
                  </strong>
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer">
                      official text ↗
                    </a>
                  )}
                </div>
                {snippets.length > 0 && (
                  <div className="cited">
                    Used for:
                    <ul className="used-for">
                      {snippets.map((s, i) => (
                        <li key={i}>“{s}”</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </details>
  );
}
