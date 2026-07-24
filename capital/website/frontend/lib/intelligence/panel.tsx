"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  CAPITAL_OPTIONS,
  COMPANY_TYPE_OPTIONS,
  FIELD_ENUM_HINTS,
  TICKET_BANDS,
  type EligibilityAnswers,
  type EligibilityCheck,
  type GroundedRound,
  type InstrumentRow,
  type IntelligenceReport,
  type PipelineStep,
  type ProfileSignal,
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

// Grounded adaptive rounds (Phase 3C): capped so worst-case added latency/cost
// stays bounded even when the shortlist never fully collapses.
const MAX_ROUNDS = 2;

// COMPANY_TYPE_OPTIONS (types.ts) is the four archetypes, as a one-tap
// picker — shared with the server-side free-text inference layer (Phase 4)
// so the two can never drift onto different literal strings.

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

/** A compact single-select dropdown, visually matching CapitalSelect — one
 *  line instead of a grid of description-cards, for fields with a small
 *  fixed option set (company type, borrower model). */
function DropdownSelect({
  options, value, onPick, placeholder,
}: {
  options: { value: string; label: string; hint?: string }[];
  value?: string;
  onPick: (v: string | undefined) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const picked = options.find((o) => o.value === value);
  return (
    <div className="relative">
      {open && (
        <button type="button" aria-hidden tabIndex={-1} onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 cursor-default" />
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-white/70 px-3 py-2 text-left text-[15px] text-[var(--foreground)] outline-none transition-colors focus:border-[#12264f]">
        <span className={"truncate " + (picked ? "" : "text-[var(--muted-foreground)]")}>
          {picked?.label ?? placeholder}
        </span>
        <span className="ml-2 shrink-0 text-[var(--muted-foreground)]">▾</span>
      </button>
      {open && (
        <div role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-black/10 bg-[#ffffff] p-1 shadow-lg">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button key={o.value} type="button" role="option" aria-selected={on}
                onClick={() => { onPick(on ? undefined : o.value); setOpen(false); }}
                className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--muted)]">
                <span className={
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] " +
                  (on ? "border-[#12264f] bg-[#12264f]/20 text-[#141414]" : "border-[var(--border)]")
                }>
                  {on ? "●" : ""}
                </span>
                <span>
                  <span className="block text-[14px] font-medium">{o.label}</span>
                  {o.hint && <span className="block text-[12px] text-[var(--muted-foreground)]">{o.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A searchable multi-select dropdown for the 27-country picker — one line
 *  instead of every country exposed as a button at all times. */
function CountrySelect({ value, onToggle }: { value: string[]; onToggle: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = COUNTRIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()));
  const summary = value.length === 0
    ? "Home market + EU-wide"
    : value.length <= 2
      ? value.join(", ")
      : `${value.slice(0, 2).join(", ")} +${value.length - 2}`;
  return (
    <div className="relative">
      {open && (
        <button type="button" aria-hidden tabIndex={-1} onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 cursor-default" />
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-white/70 px-3 py-2 text-left text-[15px] text-[var(--foreground)] outline-none transition-colors focus:border-[#12264f]">
        <span className={"truncate " + (value.length ? "" : "text-[var(--muted-foreground)]")}>{summary}</span>
        <span className="ml-2 shrink-0 text-[var(--muted-foreground)]">▾</span>
      </button>
      {open && (
        <div role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-black/10 bg-[#ffffff] shadow-lg">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search countries…"
            className="w-full border-b border-[var(--border)] px-3 py-2 text-[14px] outline-none" />
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.map((c) => {
              const on = value.includes(c);
              return (
                <button key={c} type="button" role="option" aria-selected={on} onClick={() => onToggle(c)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] transition-colors hover:bg-[var(--muted)]">
                  <span className={
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] " +
                    (on ? "border-[#12264f] bg-[#12264f]/20 text-[#141414]" : "border-[var(--border)]")
                  }>
                    {on ? "✓" : ""}
                  </span>
                  {c}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-2.5 py-2 text-[13px] text-[var(--muted-foreground)]">No match</p>
            )}
          </div>
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

/** A chip-row single select for band/enum answers. */
function Chips({
  options, value, onPick, allowUnset = true,
}: {
  options: { value: string; label: string; hint?: string }[];
  value?: string;
  onPick: (v: string | undefined) => void;
  allowUnset?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.hint}
            aria-pressed={on}
            onClick={() => onPick(on && allowUnset ? undefined : o.value)}
            className={
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
              (on
                ? "border-[#12264f] bg-[#12264f]/20 text-[#141414]"
                : "border-[var(--border)] bg-white/70 text-[var(--foreground)] hover:border-[#12264f]")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const YES_NO_UNSURE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

// Rotating engagement lines per pipeline step — shown with the elapsed timer so
// a three-minute generation never looks stalled.
const STEP_CHATTER: Record<string, string[]> = {
  discovering: [
    "Searching the open web for comparable companies…",
    "Reading recent coverage of your space…",
  ],
  querying_db: [
    "Matching names against 146,911 companies in the funding record…",
    "Tracing grants, state aid and public capital per comparable…",
  ],
  generating: [
    "Assembling the instrument table for your ticket size…",
    "Grounding the road ahead in the intelligence corpus…",
    "Drafting your position against the comparable field…",
    "Writing the funder map with honest trade-offs…",
    "Checking every figure against the database…",
  ],
};

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: "discovering", label: "Finding & researching comparable companies" },
  { key: "querying_db", label: "Querying EU funding database" },
  { key: "generating", label: "Writing your memo" },
];

export function IntelligencePanel() {
  // ── Screen machine: basics → operate → finances → adaptive[0..n] → running ──
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [description, setDescription] = useState("");
  const [capitalSought, setCapitalSought] = useState<string[]>([]);
  // borrowerModel defaults to "operating" and is never asked on the first
  // screen — the lender/intermediary routing it unlocks is out of scope for
  // this tool's lean-founder persona.
  const [elig, setElig] = useState<EligibilityAnswers>({ borrowerModel: "operating" });
  const [targetMarkets, setTargetMarkets] = useState<string[]>([]);

  const [screen, setScreen] = useState<"basics" | "verdict" | "adaptive">("basics");
  const [preparing, setPreparing] = useState(false);
  // One grounded round at a time (advisory_pipeline Phase 3C) — the server
  // decides per-call whether another round is worth asking, grounded in the
  // founder's actual candidate-instrument shortlist. roundAnswers is keyed by
  // EligibilityAnswers field name; a multi-select field (FIELD_ENUM_HINTS[f].multi)
  // holds a string[], everything else a plain string.
  const [round, setRound] = useState<GroundedRound | null>(null);
  const [roundAnswers, setRoundAnswers] = useState<Record<string, string | string[]>>({});
  const [roundCount, setRoundCount] = useState(0);

  // The fast path: a deterministic eligibility verdict, computed with zero
  // model calls, shown right after the finances screen (before the memo's
  // 2-3 minute AI research runs). Self-only/preliminary — the full memo's
  // table can only grow from here (more peers), never contradict it.
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdict, setVerdict] = useState<{
    eligibilityScreen: EligibilityCheck[];
    instrumentTable: InstrumentRow[];
    selfMatched: boolean;
    candidateInstrumentIds: string[];
  } | null>(null);

  // Phase 4: the model's own read of the free-text description, fetched once
  // (see fetchRound's wantProfileSignal) and passed straight through to the
  // memo — never re-derived, never touches the verdict screen.
  const [profileSignal, setProfileSignal] = useState<ProfileSignal | null>(null);

  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<PipelineStep | null>(null);
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [chatter, setChatter] = useState(0);
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Elapsed-seconds ticker + rotating chatter while the memo generates.
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    const rot = setInterval(() => setChatter((c) => c + 1), 7000);
    return () => { clearInterval(tick); clearInterval(rot); };
  }, [running]);

  const allCapital = capitalSought.length === CAPITAL_OPTIONS.length;
  const toggleCapital = (value: string) =>
    setCapitalSought((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  const toggleAllCapital = () =>
    setCapitalSought(allCapital ? [] : CAPITAL_OPTIONS.map((o) => o.value));
  const toggleList = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const basePayload = () => ({
    company,
    country,
    companyType,
    description,
    capitalSought,
    targetMarkets,
    eligibility: elig,
    profileSignal,
  });

  type Verdict = {
    eligibilityScreen: EligibilityCheck[];
    instrumentTable: InstrumentRow[];
    selfMatched: boolean;
    candidateInstrumentIds: string[];
  };

  // Right after the core screen: compute the fast, model-free eligibility
  // verdict and show it immediately. Falls straight through to the adaptive
  // round on any failure — the verdict screen is a bonus, never a gate.
  async function fetchVerdict() {
    setVerdictLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(basePayload()),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Verdict>;
      if (!data.eligibilityScreen && !data.instrumentTable) {
        await fetchRound(elig, [], true);
        return;
      }
      const v: Verdict = {
        eligibilityScreen: data.eligibilityScreen ?? [],
        instrumentTable: data.instrumentTable ?? [],
        selfMatched: Boolean(data.selfMatched),
        candidateInstrumentIds: data.candidateInstrumentIds ?? [],
      };
      setVerdict(v);
      setScreen("verdict");
    } catch {
      await fetchRound(elig, [], true);
    } finally {
      setVerdictLoading(false);
    }
  }

  // Phase 3C: fetch exactly one grounded adaptive round, scoped to the given
  // shortlist. Best-effort — a null/empty round (nothing left worth asking,
  // or any failure) just runs the memo straight away. Phase 4: on the
  // founder's genuine first call (wantProfileSignal), the free-text profile
  // read rides alongside it — same request, same loading state, fetched
  // exactly once per session (round 2 in advanceRound passes false).
  async function fetchRound(
    eligForRequest: EligibilityAnswers,
    candidateInstrumentIds: string[],
    wantProfileSignal: boolean,
  ) {
    setPreparing(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...basePayload(),
          eligibility: eligForRequest,
          candidateInstrumentIds,
          wantProfileSignal,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        round?: GroundedRound | null;
        profileSignal?: ProfileSignal | null;
      };
      if (data.profileSignal) setProfileSignal(data.profileSignal);
      if (!data.round || !Array.isArray(data.round.questions) || data.round.questions.length === 0) {
        await runMemo([]);
        return;
      }
      setRound(data.round);
      setRoundAnswers({});
      setScreen("adaptive");
    } catch {
      await runMemo([]);
    } finally {
      setPreparing(false);
    }
  }

  // Merge this round's answers into elig, then either fetch one more grounded
  // round (recomputing the verdict first, cheap and model-free, so the next
  // round reasons over the founder's now-narrower shortlist) or, past
  // MAX_ROUNDS, go straight to the memo.
  async function advanceRound() {
    const merged: EligibilityAnswers = { ...elig };
    for (const q of round?.questions ?? []) {
      const ans = roundAnswers[q.field];
      if (ans === undefined || ans === "" || (Array.isArray(ans) && ans.length === 0)) continue;
      (merged as Record<string, unknown>)[q.field] = ans;
    }
    setElig(merged);
    setRound(null);
    const nextCount = roundCount + 1;
    setRoundCount(nextCount);
    if (nextCount >= MAX_ROUNDS) {
      await runMemo([]);
      return;
    }
    setPreparing(true);
    try {
      const res = await fetch("/api/intelligence/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...basePayload(), eligibility: merged }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Verdict>;
      const v: Verdict = {
        eligibilityScreen: data.eligibilityScreen ?? [],
        instrumentTable: data.instrumentTable ?? [],
        selfMatched: Boolean(data.selfMatched),
        candidateInstrumentIds: data.candidateInstrumentIds ?? [],
      };
      setVerdict(v);
      await fetchRound(merged, v.candidateInstrumentIds, false);
    } catch {
      await runMemo([]);
    } finally {
      setPreparing(false);
    }
  }

  // Stream the memo, folding in whatever clarifications we have.
  async function runMemo(clarifications: { question: string; answer: string }[]) {
    if (running) return;
    setRunning(true);
    setError(null);
    setReport(null);
    setElapsed(0);
    setChatter(0);
    setStep("discovering");
    setStatusDetail("");

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
          if (event.type === "status") {
            setStep(event.step);
            if (event.detail) setStatusDetail(event.detail);
          } else if (event.type === "report") setReport(event.data);
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

  const FIXED_SCREENS = ["basics", "verdict"] as const;
  const screenIdx =
    screen === "adaptive"
      ? FIXED_SCREENS.length + roundCount
      : FIXED_SCREENS.indexOf(screen as (typeof FIXED_SCREENS)[number]);
  const totalScreens = FIXED_SCREENS.length + MAX_ROUNDS;

  const inputCls =
    "w-full rounded-lg border border-[var(--border)] bg-white/70 px-3 py-2 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none transition-colors focus:border-[#12264f]";
  const nextBtn =
    "rounded-full bg-[#0a0a0a] px-6 py-2.5 font-semibold text-[#f3f2ed] transition-colors hover:bg-[#26251f] disabled:cursor-not-allowed disabled:opacity-50";
  const backBtn =
    "text-sm font-medium text-[var(--muted-foreground)] underline-offset-2 hover:text-[#12264f] hover:underline";
  const fieldLabel = "mb-1.5 flex items-center font-semibold";

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-[0_2px_24px_rgba(20,18,12,0.06)] print:border-0 print:p-0 print:shadow-none">
      <div className="print:hidden text-[var(--foreground)]" style={darkVars}>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Free tool · powered by the funding record
        </p>
        <h2 className="text-xl sm:text-2xl font-bold leading-tight" style={serif}>
          Understand how comparable companies raise public capital
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--foreground)]">
          One short screen, an instant eligibility read, then a few follow-ups
          tailored to your specific case, then one executive memo: what you can
          qualify for, what each option requires, and what to watch. Export it
          as a PDF.
        </p>

        {/* Wizard progress dots */}
        {!running && !report && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            {Array.from({ length: totalScreens }).map((_, i) => (
              <span
                key={i}
                className={
                  "h-1.5 rounded-full transition-all " +
                  (i === screenIdx ? "w-6 bg-[#12264f]" : i < screenIdx ? "w-3 bg-[#12264f]/50" : "w-3 bg-[var(--muted)]")
                }
              />
            ))}
            <span className="ml-1">Step {Math.min(screenIdx + 1, totalScreens)} of {totalScreens}</span>
          </div>
        )}

        {/* ── Screen 1: the basics ─────────────────────────────────────── */}
        {screen === "basics" && !running && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (company.trim()) void fetchVerdict(); }}
            className="mt-4 space-y-4"
          >
            <label className="block text-sm">
              <span className={fieldLabel}>
                Your company
                <InfoDot>
                  The legal or common name. We match it against the funding record
                  to trace what you and your closest peers have drawn.
                </InfoDot>
              </span>
              <input value={company} onChange={(e) => setCompany(e.target.value)} required
                placeholder="e.g. Vyoma" className={inputCls} />
            </label>

            <div className="grid gap-5 sm:grid-cols-[1fr_13rem]">
              <label className="block text-sm">
                <span className={fieldLabel}>
                  What you do <span className="ml-1 font-normal text-[var(--muted-foreground)]">(one line)</span>
                  <InfoDot>
                    Product, customer, and what is genuinely novel. The single
                    biggest accuracy lever for the whole memo.
                  </InfoDot>
                </span>
                <input value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. AI collision-avoidance for satellites" className={inputCls} />
              </label>
              <label className="block text-sm">
                <span className={fieldLabel}>
                  Incorporated in
                  <InfoDot>
                    Where the main entity is incorporated. National schemes gate
                    hard on this; target markets come on the next screen.
                  </InfoDot>
                </span>
                <select value={country} onChange={(e) => setCountry(e.target.value)}
                  className={inputCls + (country ? "" : " text-[var(--muted-foreground)]")}>
                  <option value="" className="bg-[#ffffff] text-[#5d5b52]">Select…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c} className="bg-[#ffffff] text-[#141414]">{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="text-sm">
              <span className="mb-2 flex items-center font-semibold">
                Company type
                <InfoDot>
                  How a funder would classify you. Deep tech opens doors (like the
                  EIC) that an application layer does not.
                </InfoDot>
              </span>
              <DropdownSelect options={[...COMPANY_TYPE_OPTIONS]}
                value={companyType || undefined} onPick={(v) => setCompanyType(v ?? "")}
                placeholder="Select company type" />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="text-sm">
                <span className="mb-2 flex items-center font-semibold">
                  How much are you looking for?
                  <InfoDot>
                    Scale routes everything: a EUR 20M+ build-out lives in a
                    different instrument universe than a EUR 300K grant.
                  </InfoDot>
                </span>
                <Chips options={[...TICKET_BANDS]} value={elig.ticketBand}
                  onPick={(v) => setElig((p) => ({ ...p, ticketBand: v as EligibilityAnswers["ticketBand"] }))} />
              </div>
              <div className="text-sm">
                <span className="mb-2 flex items-center font-semibold">
                  Capital you want
                  <InfoDot>
                    Non-dilutive first? Loans? Equity? We tailor the shortlist and
                    name what each kind costs you.
                  </InfoDot>
                </span>
                <CapitalSelect value={capitalSought} onToggle={toggleCapital}
                  onToggleAll={toggleAllCapital} all={allCapital} />
              </div>
            </div>

            {/* ── Fit signals: the empirically highest-determining-power
                questions (ETL/terms/aggregate_intake_usage.py), real reach
                against the 320-instrument corpus — fteBand 79%, developmentStage
                65%, lossesOverHalfCapital 57%. Everything else is asked
                adaptively once the shortlist is known, never blind upfront. ── */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="text-sm">
                <span className="mb-2 flex items-center font-semibold">
                  Where do you want to raise public capital?
                  <InfoDot>
                    Target markets can differ from where you are incorporated. Many
                    national schemes require a domestic entity; we will flag exactly
                    which ones and what opening one buys you. Leave blank for home
                    market + EU-wide.
                  </InfoDot>
                </span>
                <CountrySelect value={targetMarkets} onToggle={(c) => setTargetMarkets((p) => toggleList(p, c))} />
              </div>
              <div className="text-sm">
                <span className="mb-2 block font-semibold">Team size</span>
                <Chips options={[
                  { value: "1-9", label: "1–9" }, { value: "10-49", label: "10–49" },
                  { value: "50-249", label: "50–249" }, { value: "250+", label: "250+" },
                ]} value={elig.fteBand} onPick={(v) => setElig((p) => ({ ...p, fteBand: v }))} />
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="text-sm">
                <span className="mb-2 flex items-center font-semibold">
                  Where is the product today?
                  <InfoDot>
                    Grant lanes gate on development stage: research programmes fund
                    early work, the EIC wants a working prototype or better, and
                    industrial instruments want deployment-ready.
                  </InfoDot>
                </span>
                <Chips options={[
                  { value: "research", label: "Research / concept" },
                  { value: "prototype", label: "Working prototype" },
                  { value: "pilot_customers", label: "Pilots with customers" },
                  { value: "scaling_revenue", label: "Scaling with revenue" },
                ]} value={elig.developmentStage}
                  onPick={(v) => setElig((p) => ({ ...p, developmentStage: v }))} />
              </div>
              <div className="text-sm">
                <span className="mb-2 flex items-center font-semibold">
                  Currently loss-making beyond half your equity?
                  <InfoDot>
                    If yes, EU rules block most state aid until equity is
                    restored, we will name the fix. Not sure is fine, this is
                    never forced.
                  </InfoDot>
                </span>
                <Chips options={YES_NO_UNSURE} value={elig.lossesOverHalfCapital}
                  onPick={(v) => setElig((p) => ({ ...p, lossesOverHalfCapital: v as EligibilityAnswers["lossesOverHalfCapital"] }))} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
              <button type="submit" disabled={verdictLoading || !company.trim()} className={nextBtn}>
                {verdictLoading ? "Checking…" : "See what you're eligible for"}
              </button>
              <span className="text-xs text-[var(--muted-foreground)]">
                Instant, code-only. Tailored follow-ups and your memo come next.
              </span>
            </div>
          </form>
        )}

        {/* ── Verdict screen: the fast, model-free eligibility answer ──── */}
        {screen === "verdict" && verdict && !running && (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-white/70 p-5 sm:p-6">
            <p className="text-xs uppercase tracking-widest text-[#12264f]">Your eligibility, right now</p>
            <p className="-mt-1 mb-4 text-sm text-[var(--muted-foreground)]">
              Computed instantly, code-only, no model call. The full memo below
              adds comparable companies and a funder-by-funder brief, on top of
              exactly this, never contradicting it.
            </p>
            <div className="border border-[var(--border)] bg-white px-5 py-5 sm:px-7 sm:py-6 text-[15px] leading-relaxed text-[var(--foreground)]" style={serif}>
              <EligibilityTable rows={verdict.eligibilityScreen} />
              <InstrumentTable rows={verdict.instrumentTable} />
              {verdict.eligibilityScreen.length === 0 && verdict.instrumentTable.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Not enough answered yet to compute a verdict — the full memo
                  below will still gather comparables and a funder brief.
                </p>
              )}
            </div>
            <div className="mt-5 flex items-center gap-4">
              <button type="button" disabled={preparing}
                onClick={() => void fetchRound(elig, verdict.candidateInstrumentIds, true)} className={nextBtn}>
                {preparing ? "Checking what's still open…" : "See the full memo"}
              </button>
              <button type="button" onClick={() => setScreen("basics")} className={backBtn}>Back</button>
              <button type="button" onClick={() => void runMemo([])} className={backBtn}>
                Skip straight to the memo
              </button>
            </div>
          </div>
        )}

        {/* ── Adaptive round: grounded in the founder's real remaining gates ── */}
        {screen === "adaptive" && round && !running && (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-white/70 p-5 sm:p-6">
            <p className="mb-1 text-xs uppercase tracking-widest text-[#12264f]">
              {round.theme}
            </p>
            <p className="mb-5 text-sm text-[var(--muted-foreground)]">
              Each question here comes from a real requirement of a fund still on
              your shortlist. Skip anything you are unsure of.
            </p>
            <div className="space-y-5">
              {round.questions.map((q) => {
                const hint = FIELD_ENUM_HINTS[q.field];
                if (!hint) return null;
                const current = roundAnswers[q.field];
                return (
                  <div key={q.field}>
                    <p className="mb-2 text-sm font-semibold" style={serif}>{q.question}</p>
                    <div className="flex flex-wrap gap-2">
                      {hint.options.map((o) => {
                        const on = hint.multi
                          ? Array.isArray(current) && current.includes(o.value)
                          : current === o.value;
                        return (
                          <button key={o.value} type="button" aria-pressed={on}
                            onClick={() => setRoundAnswers((prev) => {
                              if (hint.multi) {
                                const list = Array.isArray(prev[q.field]) ? (prev[q.field] as string[]) : [];
                                const next = list.includes(o.value)
                                  ? list.filter((v) => v !== o.value)
                                  : [...list, o.value];
                                return { ...prev, [q.field]: next };
                              }
                              return { ...prev, [q.field]: prev[q.field] === o.value ? "" : o.value };
                            })}
                            className={
                              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                              (on ? "border-[#12264f] bg-[#12264f]/20 text-[#141414]"
                                  : "border-[var(--border)] bg-white/70 text-[var(--foreground)] hover:border-[#12264f]")
                            }>
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex items-center gap-4">
              <button type="button" disabled={preparing} onClick={() => void advanceRound()} className={nextBtn}>
                {preparing
                  ? "Checking…"
                  : roundCount + 1 >= MAX_ROUNDS ? "Write my funding memo" : "Continue"}
              </button>
              <button type="button" onClick={() => setScreen(verdict ? "verdict" : "basics")} className={backBtn}>
                Back
              </button>
              <button type="button" onClick={() => void runMemo([])} className={backBtn}>
                Skip the rest and write it now
              </button>
            </div>
          </div>
        )}

        {/* ── Generation: live status + elapsed time ───────────────────── */}
        {running && (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-white/70 p-5 sm:p-6">
            <div className="flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-widest text-[#12264f]">Writing your memo</p>
              <p className="font-mono text-xs tabular-nums text-[var(--muted-foreground)]">
                {Math.floor(elapsed / 60) > 0 ? `${Math.floor(elapsed / 60)}m ` : ""}{elapsed % 60}s elapsed
              </p>
            </div>
            <ol className="mt-4 space-y-2">
              {STEPS.map((s, i) => {
                const state = activeIndex > i ? "done" : activeIndex === i ? "active" : "pending";
                return (
                  <li key={s.key} className="flex items-center gap-3 text-sm">
                    <span className={
                      "flex h-5 w-5 items-center justify-center rounded-full text-[11px] " +
                      (state === "done" ? "bg-[#2D6A4F] text-[#141414]"
                        : state === "active" ? "bg-[#12264f] text-[#f3f2ed] animate-pulse"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]")
                    }>
                      {state === "done" ? "✓" : i + 1}
                    </span>
                    <span className={state === "pending" ? "text-[var(--muted-foreground)]" : ""}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 min-h-[1.25rem] text-sm italic text-[var(--muted-foreground)]">
              {(() => {
                const pool = step ? (STEP_CHATTER[step] ?? []) : [];
                const line = pool.length ? pool[chatter % pool.length] : "";
                return statusDetail && chatter % 2 === 0 ? statusDetail : line || statusDetail;
              })()}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Typically 2–3 minutes. Every figure is checked against the funding
              record before it reaches the page.
            </p>
          </div>
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

/** Deterministic, cited, never model-written — shared by the fast verdict
 *  screen and the final memo so both render identically. */
function EligibilityTable({ rows }: { rows: EligibilityCheck[] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <>
      <SectionTitle>Eligibility screen</SectionTitle>
      <p className="mb-3 text-[13px] text-[var(--muted-foreground)]">
        Evaluated in code against the primary texts (framework level). Each
        row cites its legal basis; failed gates name the cure.
      </p>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-[var(--foreground)] text-left align-bottom">
            <th className="py-2 pr-3 font-semibold">Check</th>
            <th className="py-2 pr-3 font-semibold">Status</th>
            <th className="py-2 font-semibold">Finding</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] align-top">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-3 font-semibold">{r.check}</td>
              <td className="py-2.5 pr-3">
                <span
                  className={
                    "rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide " +
                    (r.status === "met"
                      ? "bg-[#2D6A4F]/15 text-[#1f4d3a]"
                      : r.status === "not_met"
                        ? "bg-[#9b2c2c]/10 text-[#9b2c2c]"
                        : r.status === "likely_met"
                          ? "bg-[#2D6A4F]/10 text-[#1f4d3a]/70"
                          : r.status === "likely_not_met"
                            ? "bg-[#9b2c2c]/5 text-[#9b2c2c]/70"
                            : "bg-[var(--muted)] text-[var(--muted-foreground)]")
                  }
                >
                  {r.status === "not_met" ? "not met"
                    : r.status === "likely_met" ? "likely met"
                    : r.status === "likely_not_met" ? "likely not met"
                    : r.status === "info" ? "note" : r.status}
                </span>
              </td>
              <td className="py-2.5">
                {r.verified ? r.finding : `Verify: ${r.finding}`}
                {r.cure && (
                  <span className="block text-[13px]">
                    <span className="font-semibold">Path.</span> {r.cure}
                  </span>
                )}
                <span className="block text-[11px] text-[var(--muted-foreground)]">
                  {r.source.file}
                  {r.source.locator ? ` · ${r.source.locator}` : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The public instruments that fit the founder's field, side by side. Shared
 *  by the fast verdict screen and the final memo so both render identically. */
function InstrumentTable({ rows }: { rows: InstrumentRow[] }) {
  if (!rows || rows.length === 0) return null;
  const hasProfileNotes = rows.some((r) => r.profileNote);
  return (
    <>
      <SectionTitle>The capital on the table</SectionTitle>
      <p className="mb-3">
        The public instruments that fit your field, side by side. Read the
        trade-off before the ticket: public capital is rarely free of strings.
        Instruments your peers have already drawn on are marked.
        {hasProfileNotes && (
          <> Notes marked &ldquo;your own words suggest&rdquo; are the AI&rsquo;s read of
            your free-text description, not a verified fact and not what you
            selected under Company type.</>
        )}
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
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-3">
                <span className="font-semibold">{r.instrument}</span>
                {r.usedInField && (
                  <span className="block text-[12px] italic text-[var(--muted-foreground)]">
                    in your field
                  </span>
                )}
                {r.fitFlag && (
                  <span className="mt-1 flex items-start gap-1.5 text-[12px] text-[var(--muted-foreground)]">
                    <span className="mt-0.5 rounded bg-[var(--muted)] px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]">
                      {r.fit === "consortium_institutional" ? "consortium" : "large-scale"}
                    </span>
                    <span className="italic">{r.fitFlag}</span>
                  </span>
                )}
                {r.profileNote && (
                  <div className="mt-1.5 border-l-2 border-[#6b5b95]/40 pl-2 text-[12px] text-[#6b5b95]">
                    <span className="font-semibold uppercase tracking-wide text-[10px]">Your own words suggest</span>{" "}
                    <span className="italic">{r.profileNote}</span>
                  </div>
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
  );
}

/**
 * The whole report rendered as a single advisory letter — flowing serif prose,
 * hairline rules, one restrained comparables table. No cards, boxes, pills or
 * colour blocks. Reads top to bottom and prints to a clean PDF.
 */
function Memo({ report }: { report: IntelligenceReport }) {
  const self = report.self;
  const date = new Date(report.generatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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
        <dd className="font-semibold">Public capital positioning brief</dd>
      </dl>

      <hr className="mt-6 border-[var(--border)]" />

      {/* ── Bottom line: 4-5 sharp bullets, up front ─────────────────── */}
      <ul className="mt-6 space-y-3 text-[17px] leading-[1.55]">
        {report.bottomLine.map((b, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#12264f]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {selfLine && (
        <p className="mt-3 text-[13px] italic text-[var(--muted-foreground)]">
          Your traced public funding: {selfLine}.
        </p>
      )}

      {/* ── Eligibility screen: deterministic, cited, never model-written ── */}
      <EligibilityTable rows={report.eligibilityScreen} />

      {/* ── Where to target: the brief's centrepiece table ──────────── */}
      <SectionTitle>Where to target</SectionTitle>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-[var(--foreground)] text-left align-bottom">
            <th className="py-2 pr-3 font-semibold">Institution</th>
            <th className="py-2 pr-3 font-semibold">Type of support</th>
            <th className="py-2 pr-3 font-semibold">Why you qualify</th>
            <th className="py-2 font-semibold">Comparable firms funded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] align-top">
          {report.institutions.map((r, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-3">
                <span className="font-semibold">{r.institution}</span>
                <span className="block text-[12px] tabular-nums text-[var(--muted-foreground)]">
                  {r.ticket}
                </span>
              </td>
              <td className="py-2.5 pr-3">{r.supportType}</td>
              <td className="py-2.5 pr-3">
                {r.whyEligible}
                <span className="block text-[12px] italic text-[var(--muted-foreground)]">
                  Move: {r.nextStep}
                </span>
              </td>
              <td className="py-2.5">
                {r.comparableFirms.length > 0 ? (
                  r.comparableFirms.map((f) => `${f.name} (${f.amount})`).join(", ")
                ) : (
                  <span className="text-[var(--muted-foreground)]">None traced yet</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Positioning: fitting the current political moment ───────── */}
      <SectionTitle>Positioning</SectionTitle>
      <p>{report.positioning}</p>

      {/* ── State of play: recent news + the closing line ────────────── */}
      <SectionTitle>State of play</SectionTitle>
      <p>{report.stateOfPlay}</p>

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
