"use client";

import { useRef, useState } from "react";
import type {
  IntelligenceReport,
  PipelineStep,
  ProgressEvent,
} from "@/lib/intelligence/types";

const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: "discovering", label: "Finding & researching competitors" },
  { key: "querying_db", label: "Querying EU funding database" },
  { key: "generating", label: "Writing your report" },
];

type Tab = "overview" | "stakeholders" | "todos";

export function IntelligencePanel() {
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");

  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<PipelineStep | null>(null);
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const reportRef = useRef<HTMLDivElement>(null);

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
          else if (event.type === "report") {
            setReport(event.data);
            setTab("overview");
          } else if (event.type === "error") setError(event.message);
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
          Enter your company. We find your closest European peers, look up the EU
          grants, state aid and public capital each has accessed in our database,
          and hand you a one-page competitive brief, a stakeholder map of the
          funders that matter, and a prioritised to-do list. Export it as a PDF.
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
              {running ? "Analysing…" : "Run competitive analysis"}
            </button>
            <span className="ml-3 text-xs text-[var(--muted-foreground)]">
              Takes ~1 minute. 5 reports per hour.
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

      {report && <ReportView report={report} tab={tab} setTab={setTab} reportRef={reportRef} />}
    </section>
  );
}

function ReportView({
  report,
  tab,
  setTab,
  reportRef,
}: {
  report: IntelligenceReport;
  tab: Tab;
  setTab: (t: Tab) => void;
  reportRef: React.RefObject<HTMLDivElement | null>;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "stakeholders", label: "Stakeholder map" },
    { key: "todos", label: "To-dos" },
  ];

  return (
    <div ref={reportRef} id="print-report" className="mt-6 print:mt-0">
      {/* Controls — hidden in print */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="inline-flex rounded-lg border border-[var(--border)] bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors " +
                (tab === t.key
                  ? "bg-[#003399] text-white"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-[#003399] px-4 py-2 text-sm font-semibold text-[#003399] transition-colors hover:bg-[#003399] hover:text-white"
        >
          Export PDF
        </button>
      </div>

      {/* Print header (only visible when printing) */}
      <div className="hidden print:block mb-6">
        <p className="text-xs uppercase tracking-widest text-[var(--muted-foreground)]">
          EuroInvTracker · competitive funding brief
        </p>
        <h1 className="text-2xl font-bold" style={serif}>
          {report.company}
        </h1>
        <p className="text-xs text-[var(--muted-foreground)]">
          Generated {new Date(report.generatedAt).toLocaleDateString("en-GB")}
        </p>
      </div>

      {/* All three sections render in print; only the active tab on screen */}
      <div className={tab === "overview" ? "" : "hidden print:block"}>
        <Overview report={report} />
      </div>
      <div className={tab === "stakeholders" ? "" : "hidden print:block"}>
        <Stakeholders report={report} />
      </div>
      <div className={tab === "todos" ? "" : "hidden print:block"}>
        <Todos report={report} />
      </div>

      <p className="mt-6 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {report.caveats}
      </p>
    </div>
  );
}

function Overview({ report }: { report: IntelligenceReport }) {
  const o = report.overview;
  return (
    <div className="print:break-after-page">
      <h3 className="text-lg font-bold" style={serif}>
        Where you stand
      </h3>
      <p className="mt-2 text-lg leading-relaxed">{o.headline}</p>

      <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Competitor</th>
              <th className="px-3 py-2">EU capital</th>
              <th className="px-3 py-2">Channels</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Positioning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] align-top">
            {o.competitors.map((c, i) => (
              <tr key={i}>
                <td className="px-3 py-2 font-semibold">{c.name}</td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{c.euCapital}</td>
                <td className="px-3 py-2 text-xs">{c.channels.join(", ") || "—"}</td>
                <td className="px-3 py-2">{c.stage}</td>
                <td className="px-3 py-2">{c.positioning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 leading-relaxed">{o.yourPosition}</p>
    </div>
  );
}

function Stakeholders({ report }: { report: IntelligenceReport }) {
  return (
    <div className="print:break-after-page">
      <h3 className="text-lg font-bold" style={serif}>
        Stakeholder map
      </h3>
      <div className="mt-4 space-y-4">
        {report.stakeholderMap.map((s, i) => (
          <div key={i} className="rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-[#003399]">{s.funder}</p>
              {s.nextDeadline && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  Next deadline: {s.nextDeadline}
                </span>
              )}
            </div>
            {s.competitorsUsing.length > 0 && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Used by: {s.competitorsUsing.join(", ")}
              </p>
            )}
            <p className="mt-2 text-sm leading-relaxed">{s.relevanceToYou}</p>
            <p className="mt-2 text-sm leading-relaxed">
              <span className="font-semibold">Next step: </span>
              {s.nextStep}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Todos({ report }: { report: IntelligenceReport }) {
  const ordered = [...report.todos].sort((a, b) => a.priority - b.priority);
  const colour = (p: number) =>
    p === 1 ? "bg-[#5C2A2A]" : p === 2 ? "bg-[#D97706]" : "bg-[#6B7280]";
  return (
    <div>
      <h3 className="text-lg font-bold" style={serif}>
        Prioritised to-dos
      </h3>
      <ol className="mt-4 space-y-3">
        {ordered.map((t, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-[var(--border)] bg-white p-4">
            <span
              className={`mt-0.5 h-6 shrink-0 rounded-full px-2 text-xs font-semibold leading-6 text-white ${colour(t.priority)}`}
            >
              P{t.priority}
            </span>
            <div>
              <p className="font-semibold">{t.action}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]">{t.rationale}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Timeframe: {t.timeframe}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
