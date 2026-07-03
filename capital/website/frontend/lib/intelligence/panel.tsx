"use client";

import { useState, type CSSProperties } from "react";
import {
  CAPITAL_OPTIONS,
  type IntakeQuestion,
  type IntelligenceReport,
  type PipelineStep,
  type ProgressEvent,
} from "@/lib/intelligence/types";

const serif = { fontFamily: "var(--font-playfair), Georgia, serif" };

// The intake form rides the dark "Follow the Euro" stage on /for-companies, so
// it re-themes to match by overriding the CSS variables its controls read from.
// The generated Memo below keeps the site's light theme on purpose: it is a
// printable white memorandum, not part of the dark trip.
const darkVars = {
  "--foreground": "#1d1c18",
  "--muted-foreground": "#6b6b64",
  "--border": "rgba(10,10,10,0.14)",
  "--muted": "rgba(10,10,10,0.06)",
  "--primary": "#0a0a0a",
} as CSSProperties;

// The interface adds this option to every intake question; picking it (or leaving
// a question blank) just omits that clarification from the memo.
const SKIP_ANSWER = "Not sure / skip";

// The four archetypes, as a one-tap picker. The label is sent verbatim as the
// founder's `companyType`; the hint is the funder's-eye definition.
const COMPANY_TYPES: { label: string; hint: string }[] = [
  { label: "Deep-tech breakthrough", hint: "novel science or hardware, real technical risk" },
  { label: "Applied innovation", hint: "a new product built on existing tech" },
  { label: "Application-layer software", hint: "a platform or app on top of existing models" },
  { label: "Services", hint: "consulting, agency or delivery" },
];

// European scope, full English names, for the country picker.
const COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark",
  "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Iceland",
  "Ireland", "Italy", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg",
  "Malta", "Netherlands", "Norway", "Poland", "Portugal", "Romania", "Serbia",
  "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Turkey", "Ukraine",
  "United Kingdom",
];

/** A clean multi-select dropdown for the capital types: a single field that opens
 *  a checklist, with a summary of the picks and a "show me everything" shortcut. */
function CapitalSelect({
  value,
  onToggle,
  onToggleAll,
  all,
}: {
  value: string[];
  onToggle: (v: string) => void;
  onToggleAll: () => void;
  all: boolean;
}) {
  const [open, setOpen] = useState(false);
  const labels = CAPITAL_OPTIONS.filter((o) => value.includes(o.value)).map((o) => o.label);
  const summary = all
    ? "Anything, show me everything"
    : labels.length === 0
      ? "Select capital types"
      : labels.length <= 2
        ? labels.join(", ")
        : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;

  return (
    <div className="relative">
      {open && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 cursor-default"
        />
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-white/70 px-3 py-2 text-left text-[15px] text-[var(--foreground)] outline-none transition-colors focus:border-[#12264f]"
      >
        <span className={"truncate " + (labels.length || all ? "" : "text-[var(--muted-foreground)]")}>
          {summary}
        </span>
        <span className="ml-2 shrink-0 text-[var(--muted-foreground)]">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-black/10 bg-[#ffffff] p-1 shadow-lg"
        >
          {CAPITAL_OPTIONS.map((o) => {
            const on = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onToggle(o.value)}
                className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--muted)]"
              >
                <span
                  className={
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] " +
                    (on ? "border-[#12264f] bg-[#12264f]/20 text-[#141414]" : "border-[var(--border)]")
                  }
                >
                  {on ? "✓" : ""}
                </span>
                <span>
                  <span className="block text-[14px] font-medium">{o.label}</span>
                  <span className="block text-[12px] text-[var(--muted-foreground)]">{o.hint}</span>
                </span>
              </button>
            );
          })}
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            type="button"
            onClick={onToggleAll}
            className="w-full rounded-md px-2.5 py-2 text-left text-[14px] font-semibold text-[#12264f] transition-colors hover:bg-[var(--muted)]"
          >
            {all ? "Clear all" : "Show me everything"}
          </button>
        </div>
      )}
    </div>
  );
}

/** A small always-present ⓘ that reveals guidance on hover or keyboard focus. */
function InfoDot({ children }: { children: React.ReactNode }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label="More information"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-[#12264f] text-[10px] font-bold leading-none text-[#12264f] outline-none transition-colors hover:bg-[#12264f] hover:text-[#f3f2ed] focus-visible:bg-[#12264f] focus-visible:text-[#f3f2ed]"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-black/10 bg-[#ffffff] px-3 py-2 text-xs font-normal leading-relaxed text-[#33322c] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: "discovering", label: "Finding & researching competitors" },
  { key: "querying_db", label: "Querying EU funding database" },
  { key: "generating", label: "Writing your memo" },
];

export function IntelligencePanel() {
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [description, setDescription] = useState("");
  const [capitalSought, setCapitalSought] = useState<string[]>([]);

  const allCapital = capitalSought.length === CAPITAL_OPTIONS.length;
  const toggleCapital = (value: string) =>
    setCapitalSought((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  const toggleAllCapital = () =>
    setCapitalSought(allCapital ? [] : CAPITAL_OPTIONS.map((o) => o.value));

  const [preparing, setPreparing] = useState(false);
  const [questions, setQuestions] = useState<IntakeQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<PipelineStep | null>(null);
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const basePayload = () => ({
    company,
    country,
    companyType,
    description,
    capitalSought,
  });

  // Phase 1: fetch the tailored questions, then show them. If none come back (or
  // the call fails), skip straight to the memo so the founder is never blocked.
  async function startIntake(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim() || preparing || running) return;
    setPreparing(true);
    setError(null);
    setReport(null);
    setQuestions(null);
    setAnswers({});

    try {
      const res = await fetch("/api/intelligence/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(basePayload()),
      });
      const data = (await res.json().catch(() => ({}))) as { questions?: IntakeQuestion[] };
      const qs = Array.isArray(data.questions) ? data.questions : [];
      if (qs.length === 0) {
        await runMemo([]);
        return;
      }
      setQuestions(qs);
    } catch {
      // Intake is best-effort; on any failure go straight to the memo.
      await runMemo([]);
    } finally {
      setPreparing(false);
    }
  }

  // Phase 2: stream the memo, folding in whatever clarifications we have.
  async function runMemo(clarifications: { question: string; answer: string }[]) {
    if (running) return;
    setRunning(true);
    setError(null);
    setReport(null);
    setStep("discovering");

    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...basePayload(), clarifications }),
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

  // Turn the answered questions into clarifications and run the memo.
  function submitAnswers() {
    const qs = questions ?? [];
    const clarifications = qs
      .map((q) => ({ question: q.question, answer: answers[q.id] ?? "" }))
      .filter((c) => c.answer && c.answer !== SKIP_ANSWER);
    setQuestions(null);
    void runMemo(clarifications);
  }

  const busy = preparing || running;

  const activeIndex = step ? STEPS.findIndex((s) => s.key === step) : -1;

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-[0_2px_24px_rgba(20,18,12,0.06)] print:border-0 print:p-0 print:shadow-none">
      <div className="print:hidden text-[var(--foreground)]" style={darkVars}>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Free tool · powered by the funding record
        </p>
        <h2 className="text-xl sm:text-2xl font-bold leading-tight" style={serif}>
          See what your competitors have raised from Europe
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--foreground)]">
          Enter your company. We trace the grants, state aid and public capital
          your closest European peers have drawn, then write you one executive
          memo: your position, the instruments that fit, what each one costs you,
          and the next move. Export it as a PDF.
        </p>

        {!questions && !running && (
        <form onSubmit={startIntake} className="mt-4 space-y-4">
          {/* Company name — the one thing we truly need */}
          <label className="block text-sm">
            <span className="mb-1.5 flex items-center font-semibold">
              Your company
              <InfoDot>
                The legal or common name of your company. We match it against the
                funding record to trace what you and your closest peers have drawn.
                Set the country if the name is common, so we pin the right entity.
              </InfoDot>
            </span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
              placeholder="e.g. Vyoma"
              className="w-full rounded-lg border border-[var(--border)] bg-white/70 px-3 py-2 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none transition-colors focus:border-[#12264f]"
            />
          </label>

          {/* What you do + Country, side by side */}
          <div className="grid gap-5 sm:grid-cols-[1fr_13rem]">
            <label className="block text-sm">
              <span className="mb-1.5 flex items-center font-semibold">
                What you do{" "}
                <span className="ml-1 font-normal text-[var(--muted-foreground)]">(optional)</span>
                <InfoDot>
                  One line on your product, customer and what is genuinely novel.
                  This is the single biggest accuracy lever: it sharpens peer
                  matching and grounds the whole memo.
                </InfoDot>
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. AI collision-avoidance for satellites"
                className="w-full rounded-lg border border-[var(--border)] bg-white/70 px-3 py-2 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none transition-colors focus:border-[#12264f]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 flex items-center font-semibold">
                Country{" "}
                <span className="ml-1 font-normal text-[var(--muted-foreground)]">(optional)</span>
                <InfoDot>
                  Where the company is incorporated. It disambiguates common names
                  and decides which national schemes you can actually access.
                </InfoDot>
              </span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className={
                  "w-full rounded-lg border border-[var(--border)] bg-white/70 px-3 py-2 text-[15px] outline-none transition-colors focus:border-[#12264f] " +
                  (country ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]")
                }
              >
                <option value="" className="bg-[#ffffff] text-[#5d5b52]">Select…</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} className="bg-[#ffffff] text-[#141414]">
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Company type — a one-tap archetype picker */}
          <div className="text-sm">
            <span className="mb-2 flex items-center font-semibold">
              Company type{" "}
              <span className="ml-1 font-normal text-[var(--muted-foreground)]">(optional)</span>
              <InfoDot>
                How a funder would classify you. This is the single biggest fork in
                what you are eligible for: deep tech opens doors (like the EIC) that
                an application layer does not. Pick the closest.
              </InfoDot>
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {COMPANY_TYPES.map((t) => {
                const on = companyType === t.label;
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setCompanyType(on ? "" : t.label)}
                    aria-pressed={on}
                    title={t.hint}
                    className={
                      "rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium leading-snug transition-colors " +
                      (on
                        ? "border-[#12264f] bg-[#12264f]/20 text-[#141414]"
                        : "border-[var(--border)] bg-white/70 text-[var(--foreground)] hover:border-[#12264f]")
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Capital you want — multi-select dropdown */}
          <div className="text-sm">
            <span className="mb-2 flex items-center font-semibold">
              Capital you want{" "}
              <span className="ml-1 font-normal text-[var(--muted-foreground)]">(optional)</span>
              <InfoDot>
                We tailor the shortlist to the kind of money you actually want.
                Asking for non-dilutive capital, for instance, demotes equity and
                blended instruments and flags what they would cost you.
              </InfoDot>
            </span>
            <CapitalSelect
              value={capitalSought}
              onToggle={toggleCapital}
              onToggleAll={toggleAllCapital}
              all={allCapital}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <button
              type="submit"
              disabled={busy || !company.trim()}
              className="rounded-full bg-[#0a0a0a] px-6 py-2.5 font-semibold text-[#f3f2ed] transition-colors hover:bg-[#26251f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preparing ? "Tailoring a few questions…" : "Continue"}
            </button>
            <span className="text-xs text-[var(--muted-foreground)]">
              A few quick questions, then your memo. ~1 minute · 5 memos per hour.
            </span>
          </div>
        </form>
        )}

        {/* Phase 1: tailored intake questions */}
        {questions && !running && (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-white/70 p-5 sm:p-6">
            <p className="mb-1 text-xs uppercase tracking-widest text-[#12264f]">
              A few questions, so the memo fits you
            </p>
            <p className="mb-5 text-sm text-[var(--muted-foreground)]">
              These shift which instruments we recommend and how to position for them.
              Answer what you can; skip anything you are unsure of.
            </p>
            <div className="space-y-5">
              {questions.map((q) => (
                <div key={q.id}>
                  <p className="mb-2 text-sm font-semibold" style={serif}>
                    {q.question}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[...q.options, SKIP_ANSWER].map((opt) => {
                      const on = answers[q.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: prev[q.id] === opt ? "" : opt }))
                          }
                          aria-pressed={on}
                          className={
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                            (on
                              ? "border-[#12264f] bg-[#12264f]/20 text-[#141414]"
                              : opt === SKIP_ANSWER
                                ? "border-dashed border-[var(--muted-foreground)] bg-white/70 text-[var(--muted-foreground)] hover:border-[#12264f]"
                                : "border-[var(--border)] bg-white/70 text-[var(--foreground)] hover:border-[#12264f]")
                          }
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-4">
              <button
                type="button"
                onClick={submitAnswers}
                className="rounded-full bg-[#0a0a0a] px-5 py-2.5 font-semibold text-[#f3f2ed] transition-colors hover:bg-[#26251f]"
              >
                Write my funding memo
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuestions(null);
                  void runMemo([]);
                }}
                className="text-sm font-medium text-[var(--muted-foreground)] underline-offset-2 hover:text-[#12264f] hover:underline"
              >
                Skip and write it now
              </button>
            </div>
          </div>
        )}

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
                        ? "bg-[#2D6A4F] text-[#141414]"
                        : state === "active"
                          ? "bg-[#12264f] text-[#f3f2ed] animate-pulse"
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

/** A quiet editorial section title in the house serif — no number, no colour. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-10 mb-3 text-[17px] font-bold text-[var(--foreground)] print:mt-8" style={serif}>
      {children}
    </h3>
  );
}

/**
 * The whole report rendered as a single advisory letter — flowing serif prose,
 * hairline rules, one restrained comparables table. No cards, boxes, pills or
 * colour blocks. Reads top to bottom and prints to a clean PDF.
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
  const pWord = (p: number) => (p === 1 ? "Now" : p === 2 ? "Next" : "Later");

  // The founder's own footprint, as a single quiet line of prose.
  const selfLine = [self.euCapital, self.channelBreakdown, self.activeYears]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      id="print-report"
      style={serif}
      className="mt-8 border border-[var(--border)] bg-white px-7 py-9 sm:px-12 sm:py-12 text-[15px] leading-relaxed text-[var(--foreground)] print:mt-0 print:border-0 print:px-0 print:py-0"
    >
      {/* Export — screen only */}
      <div className="mb-8 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="border border-[#12264f] px-4 py-1.5 text-sm font-semibold text-[#12264f] transition-colors hover:bg-[#12264f] hover:text-[#f3f2ed]"
        >
          Export PDF
        </button>
      </div>

      {/* ── Letterhead ─────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between border-t-2 border-[#12264f] pt-3">
        <span className="text-sm font-bold tracking-[0.2em] text-[#12264f]">
          EUROINVTRACKER
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          Private funding memorandum
        </span>
      </div>

      {/* ── Salutation block ───────────────────────────────────────── */}
      <dl className="mt-6 grid grid-cols-[4.5rem_1fr] gap-x-4 gap-y-1 text-[14px]">
        <dt className="text-[var(--muted-foreground)]">To</dt>
        <dd>The leadership of {report.company}</dd>
        <dt className="text-[var(--muted-foreground)]">Date</dt>
        <dd>{date}</dd>
        <dt className="text-[var(--muted-foreground)]">Re</dt>
        <dd className="font-semibold">{o.headline}</dd>
      </dl>

      <hr className="mt-6 border-[var(--border)]" />

      {/* ── Opening: the bottom line as the lead paragraph ─────────── */}
      <p className="mt-6 text-[19px] leading-[1.6]">{o.bottomLine}</p>

      {/* ── Where you stand ────────────────────────────────────────── */}
      <SectionTitle>Where you stand</SectionTitle>
      <p>{o.yourPosition}</p>
      {selfLine && (
        <p className="mt-2 text-[13px] italic text-[var(--muted-foreground)]">
          Your traced public funding: {selfLine}.
        </p>
      )}

      {/* ── The comparable field (the one centrepiece table) ───────── */}
      <SectionTitle>Comparable companies</SectionTitle>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-[var(--foreground)] text-left align-bottom">
            <th className="py-2 pr-3 font-semibold">Company</th>
            <th className="py-2 pr-3 font-semibold">Public capital traced</th>
            <th className="py-2 pr-3 font-semibold">Recent round</th>
            <th className="py-2 font-semibold">Positioning</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] align-top">
          {o.competitors.map((c, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-3">
                <span className="font-semibold">{c.name}</span>
                {c.country && (
                  <span className="ml-1 text-[12px] text-[var(--muted-foreground)]">{c.country}</span>
                )}
                {c.source === "corpus" && (
                  <span className="block text-[12px] italic text-[var(--muted-foreground)]">
                    peer in your sub-sector
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3">
                {c.channelBreakdown ? (
                  <>
                    <span className="tabular-nums">{c.euCapital}</span>
                    <span className="block text-[12px] text-[var(--muted-foreground)]">
                      {c.channelBreakdown}
                      {c.activeYears ? ` · ${c.activeYears}` : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-[var(--muted-foreground)]">{c.euCapital}</span>
                )}
              </td>
              <td className="py-2.5 pr-3">{c.stage}</td>
              <td className="py-2.5">{c.positioning}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── The capital on the table ───────────────────────────────── */}
      {report.instrumentTable?.length > 0 && (
        <>
          <SectionTitle>The capital on the table</SectionTitle>
          <p className="mb-3">
            The public instruments that fit your field, side by side. Read the
            trade-off before the ticket: public capital is rarely free of strings.
            Instruments your peers have already drawn on are marked.
          </p>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[var(--foreground)] text-left align-bottom">
                <th className="py-2 pr-3 font-semibold">Instrument</th>
                <th className="py-2 pr-3 font-semibold">Typical ticket</th>
                <th className="py-2 pr-3 font-semibold">Speed to cash</th>
                <th className="py-2 pr-3 font-semibold">What you give up</th>
                <th className="py-2 font-semibold">Best for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] align-top">
              {report.instrumentTable.map((r, i) => (
                <tr key={i}>
                  <td className="py-2.5 pr-3">
                    <span className="font-semibold">{r.instrument}</span>
                    {r.usedInField && (
                      <span className="block text-[12px] italic text-[var(--muted-foreground)]">
                        in your field
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">{r.ticket}</td>
                  <td className="py-2.5 pr-3">{r.speed}</td>
                  <td className="py-2.5 pr-3">{r.giveUp}</td>
                  <td className="py-2.5">{r.bestFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ── Funders to engage (prose, no cards) ────────────────────── */}
      <SectionTitle>Funders to engage</SectionTitle>
      <div className="space-y-5">
        {report.stakeholderMap.map((s, i) => (
          <div key={i}>
            <p>
              <span className="font-semibold">{s.funder}</span>
              {s.nextDeadline && (
                <span className="text-[13px] text-[var(--muted-foreground)]">
                  {" "}· next window {s.nextDeadline}
                </span>
              )}
              {s.competitorsUsing.length > 0 && (
                <span className="text-[13px] italic text-[var(--muted-foreground)]">
                  {" "}· used by {s.competitorsUsing.join(", ")}
                </span>
              )}
            </p>
            <p className="mt-1">
              {s.relevanceToYou}
              {s.tradeoff ? ` The trade-off is ${s.tradeoff.replace(/\.$/, "")}.` : ""}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Move.</span> {s.nextStep}
            </p>
          </div>
        ))}
      </div>

      {/* ── Recommended moves (numbered list, no pills) ────────────── */}
      <SectionTitle>Recommended moves</SectionTitle>
      <ol className="space-y-4">
        {moves.map((t, i) => (
          <li key={i} className="grid grid-cols-[1.4rem_1fr] gap-x-2">
            <span className="font-semibold tabular-nums">{i + 1}.</span>
            <div>
              <p>
                <span className="font-semibold">{t.action}</span>
                <span className="text-[13px] italic text-[var(--muted-foreground)]"> · {pWord(t.priority)}</span>
              </p>
              <p className="mt-0.5">{t.rationale}</p>
              <p className="mt-0.5 text-[13px] text-[var(--muted-foreground)]">{t.timeframe}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="mt-12 border-t border-[var(--border)] pt-4">
        <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">{report.caveats}</p>
        <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          EuroInvTracker · the public funding record of European companies, 2021–2025
        </p>
      </div>
    </div>
  );
}
