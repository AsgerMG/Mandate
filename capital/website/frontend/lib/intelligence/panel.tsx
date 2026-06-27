"use client";

import { useState } from "react";
import type {
  IntelligenceReport,
  PipelineStep,
  ProgressEvent,
} from "@/lib/intelligence/types";

const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: "discovering", label: "Finding & researching competitors" },
  { key: "querying_db", label: "Querying EU funding database" },
  { key: "generating", label: "Writing your memo" },
];

export function IntelligencePanel() {
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");

  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<PipelineStep | null>(null);
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim() || running) return;
    setRunning(true);
    setError(null);
    setReport(null);
    setStep("discovering");

    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company, sector, country, description }),
      });

      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error || `Request failed (${res.status})`);
      }

      // Read the newline-delimited JSON stream incrementally.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as ProgressEvent;
          if (event.type === "status") setStep(event.step);
          else if (event.type === "report") setReport(event.data);
          else if (event.type === "error") setError(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRunning(false);
      setStep(null);
    }
  }

  const activeIndex = step ? STEPS.findIndex((s) => s.key === step) : -1;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[#eef2ff] via-white to-[#f0fdf4] p-6 md:p-8 print:border-0 print:bg-white print:p-0">
      <div className="print:hidden">
        <p className="mb-2 text-xs uppercase tracking-widest text-[var(--muted-foreground)]">
          Free tool · powered by the funding record
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold leading-tight" style={serif}>
          See what your competitors have raised from Europe
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-[var(--foreground)]">
          Enter your company. We find your closest European peers, trace the exact
          EU grants, state aid and public capital each has drawn from our database,
          and write you a single executive memo: where you stand, who to engage,
          and the moves to make next. Export it as a PDF.
        </p>

        <form onSubmit={run} className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm">
            <span className="mb-1 block font-semibold">Your company *</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
              placeholder="e.g. Vyoma"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[#003399]"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Sector <span className="font-normal text-[var(--muted-foreground)]">(optional)</span></span>
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="e.g. space situational awareness"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[#003399]"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Country <span className="font-normal text-[var(--muted-foreground)]">(optional)</span></span>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. Germany"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[#003399]"
            />
          </label>
          <label className="sm:col-span-2 text-sm">
            <span className="mb-1 block font-semibold">What you do <span className="font-normal text-[var(--muted-foreground)]">(optional, improves accuracy)</span></span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="One sentence on your product and market."
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[#003399]"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={running || !company.trim()}
              className="rounded-lg bg-[#003399] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[#002277] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? "Writing your memo…" : "Write my funding memo"}
            </button>
            <span className="ml-3 text-xs text-[var(--muted-foreground)]">
              Takes ~1 minute. 5 memos per hour.
            </span>
          </div>
        </form>

        {/* Progress */}
        {running && (
          <ol className="mt-6 space-y-2">
            {STEPS.map((s, i) => {
              const state =
                activeIndex > i ? "done" : activeIndex === i ? "active" : "pending";
              return (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      "flex h-5 w-5 items-center justify-center rounded-full text-[11px] " +
                      (state === "done"
                        ? "bg-[#2D6A4F] text-white"
                        : state === "active"
                          ? "bg-[#003399] text-white animate-pulse"
                          : "bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]")
                    }
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span className={state === "pending" ? "text-[var(--muted-foreground)]" : ""}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>

      {report && <Memo report={report} />}
    </section>
  );
}

/** A numbered, EU-blue section heading in the house serif. */
function MemoHeading({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3
      className="mt-9 mb-3 text-[15px] font-bold uppercase tracking-[0.12em] text-[#003399] print:mt-7"
      style={serif}
    >
      <span className="mr-2 tabular-nums opacity-60">{String(n).padStart(2, "0")}</span>
      {children}
    </h3>
  );
}

/**
 * The whole report rendered as a single, branded executive memorandum — one
 * flowing document, no tabs. Reads top to bottom and prints to a clean PDF.
 */
function Memo({ report }: { report: IntelligenceReport }) {
  const o = report.overview;
  const self = report.self;
  const date = new Date(report.generatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const moves = [...report.todos].sort((a, b) => a.priority - b.priority);
  const pLabel = (p: number) => (p === 1 ? "NOW" : p === 2 ? "NEXT" : "LATER");
  const pColour = (p: number) =>
    p === 1 ? "bg-[#003399]" : p === 2 ? "bg-[#2D6A4F]" : "bg-[#6B7280]";

  return (
    <div
      id="print-report"
      className="mt-8 rounded-xl border border-[var(--border)] bg-white px-6 py-7 sm:px-10 sm:py-9 shadow-sm print:mt-0 print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none"
    >
      {/* Export — screen only */}
      <div className="mb-6 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-[#003399] px-4 py-2 text-sm font-semibold text-[#003399] transition-colors hover:bg-[#003399] hover:text-white"
        >
          Export PDF
        </button>
      </div>

      {/* ── Masthead ───────────────────────────────────────────────── */}
      <div className="border-t-[3px] border-[#003399] pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold tracking-[0.18em] text-[#003399]" style={serif}>
            EUROINVTRACKER
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Confidential funding memorandum
          </span>
        </div>
      </div>

      {/* ── Memo header block ──────────────────────────────────────── */}
      <dl className="mt-5 grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-[var(--muted-foreground)]">To</dt>
        <dd className="font-semibold">The leadership of {report.company}</dd>
        <dt className="text-[var(--muted-foreground)]">From</dt>
        <dd>EuroInvTracker · competitive funding desk</dd>
        <dt className="text-[var(--muted-foreground)]">Date</dt>
        <dd>{date}</dd>
        <dt className="text-[var(--muted-foreground)]">Re</dt>
        <dd className="font-semibold leading-snug" style={serif}>
          {o.headline}
        </dd>
      </dl>

      {/* ── Bottom line up front ───────────────────────────────────── */}
      <div className="mt-7 border-l-[3px] border-[#003399] bg-[#f6f8ff] px-5 py-4 print:bg-transparent">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#003399]">
          Bottom line
        </p>
        <p className="text-lg leading-relaxed" style={serif}>
          {o.bottomLine}
        </p>
      </div>

      {/* ── 1 · Where you stand ────────────────────────────────────── */}
      <MemoHeading n={1}>Where you stand</MemoHeading>
      <p className="mb-3 text-sm">
        <span className="text-[var(--muted-foreground)]">Your traced public funding: </span>
        <span className="font-semibold">{self.euCapital}</span>
        {self.channelBreakdown && (
          <span className="text-[var(--muted-foreground)]"> · {self.channelBreakdown}</span>
        )}
        {self.activeYears && (
          <span className="text-[var(--muted-foreground)]"> · {self.activeYears}</span>
        )}
      </p>
      <p className="leading-relaxed">{o.yourPosition}</p>

      {/* ── 2 · The competitive field ──────────────────────────────── */}
      <MemoHeading n={2}>The competitive field</MemoHeading>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              <th className="py-2 pr-3 font-semibold">Peer</th>
              <th className="py-2 pr-3 font-semibold">Public capital traced</th>
              <th className="py-2 pr-3 font-semibold">Recent private round</th>
              <th className="py-2 font-semibold">Positioning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] align-top">
            {o.competitors.map((c, i) => (
              <tr key={i}>
                <td className="py-3 pr-3">
                  <span className="font-semibold">{c.name}</span>
                  {c.country && (
                    <span className="ml-1 text-xs text-[var(--muted-foreground)]">{c.country}</span>
                  )}
                  {c.source === "corpus" && (
                    <span className="ml-1.5 align-middle rounded bg-[#eef2ff] px-1 py-0.5 text-[10px] font-medium text-[#003399] print:border print:border-[#003399] print:bg-transparent">
                      sub-sector peer
                    </span>
                  )}
                </td>
                <td className="py-3 pr-3">
                  {c.channelBreakdown ? (
                    <>
                      <span className="font-semibold tabular-nums">{c.euCapital}</span>
                      <span className="block text-xs text-[var(--muted-foreground)]">
                        {c.channelBreakdown}
                        {c.activeYears ? ` · ${c.activeYears}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--muted-foreground)]">{c.euCapital}</span>
                  )}
                </td>
                <td className="py-3 pr-3">{c.stage}</td>
                <td className="py-3">{c.positioning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 3 · Funders to engage ──────────────────────────────────── */}
      <MemoHeading n={3}>Funders to engage</MemoHeading>
      <div className="space-y-4">
        {report.stakeholderMap.map((s, i) => (
          <div key={i} className="border-l-2 border-[var(--border)] pl-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-semibold text-[#003399]">{s.funder}</p>
              {s.nextDeadline && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  Next window: {s.nextDeadline}
                </span>
              )}
            </div>
            {s.competitorsUsing.length > 0 && (
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                Used by {s.competitorsUsing.join(", ")}
              </p>
            )}
            <p className="mt-1.5 text-sm leading-relaxed">{s.relevanceToYou}</p>
            <p className="mt-1 text-sm leading-relaxed">
              <span className="font-semibold">Move: </span>
              {s.nextStep}
            </p>
          </div>
        ))}
      </div>

      {/* ── 4 · Recommended moves ──────────────────────────────────── */}
      <MemoHeading n={4}>Recommended moves</MemoHeading>
      <ol className="space-y-4">
        {moves.map((t, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${pColour(t.priority)}`}
            >
              {pLabel(t.priority)}
            </span>
            <div>
              <p className="font-semibold leading-snug">{t.action}</p>
              <p className="mt-0.5 text-sm leading-relaxed">{t.rationale}</p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{t.timeframe}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="mt-9 border-t border-[var(--border)] pt-4">
        <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{report.caveats}</p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          EuroInvTracker · the public funding record of European companies, 2021–2025
        </p>
      </div>
    </div>
  );
}
