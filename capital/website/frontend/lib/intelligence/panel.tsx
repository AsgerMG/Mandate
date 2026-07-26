"use client";

import { useEffect, useState } from "react";
import {
  CAPITAL_OPTIONS,
  EXCLUSION_OPTIONS,
  SECTOR_OPTIONS,
  FIELD_ENUM_HINTS,
  TICKET_BANDS,
  type EligibilityAnswers,
  type EligibilityCheck,
  type GroundedRound,
  type InstitutionEntry,
  type InstrumentRow,
  type IntelligenceReport,
  type PartialReport,
  type PipelineStep,
  type ProfileSignal,
  type ProjectAnswer,
  type ProgressEvent,
} from "@/lib/intelligence/types";

const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

// Grounded adaptive round (Phase 3C): ONE panel of up to 8 tailored
// questions, not a drip of several small rounds — the standard screen asks
// the fast universal questions, then this single panel narrows the rest
// before matching. (generateGroundedRound's own openFields.slice(0, 8) in
// pipeline.ts is the other half of this — keep them in sync if either
// changes.)
const MAX_ROUNDS = 1;

// The escape hatch appended to every project question's model-written options
// (brief_funnel_v2 Stage 2b). Picking it reveals a free-text box, so a founder
// is never forced into an option the model invented.
const NONE_OF_THESE = "None of these";

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
        className="flex w-full items-center justify-between rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70 px-3 py-2 text-left text-[15px] text-[var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
      >
        <span className={"truncate " + (labels.length || all ? "" : "text-[var(--muted-foreground)]")}>
          {summary}
        </span>
        <span className="ml-2 shrink-0 text-[var(--muted-foreground)]">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] p-1 shadow-lg"
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
                className="flex w-full items-start gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--muted)]"
              >
                <span
                  className={
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] " +
                    (on ? "border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--foreground)]" : "border-[var(--border)]")
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
            className="w-full rounded-[var(--radius)] px-2.5 py-2 text-left text-[14px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--muted)]"
          >
            {all ? "Clear all" : "Show me everything"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Toggle one exclusion flag. "None of these apply" is mutually exclusive with
 *  every other option in both directions — a founder who ticks insolvency and
 *  then "none" means "none", and vice versa. An EMPTY list means unanswered,
 *  which must never be read as a pass. */
function toggleExclusion(current: string[], v: string): string[] {
  if (v === "none") return current.includes("none") ? [] : ["none"];
  const without = current.filter((x) => x !== "none");
  return without.includes(v) ? without.filter((x) => x !== v) : [...without, v];
}

/** Multi-select chips. Used for the exclusion checklist, where seeing every
 *  option at once matters more than saving space: a founder should be able to
 *  confirm at a glance that none of them apply. */
function MultiChips({
  options, value, onToggle, exclusive,
}: {
  options: readonly { value: string; label: string }[];
  value: string[];
  onToggle: (v: string) => void;
  exclusive?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        const isExclusive = o.value === exclusive;
        return (
          <button key={o.value} type="button" aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
              (on
                ? isExclusive
                  ? "border-[#3d6136] bg-[#3d6136]/15 text-[var(--foreground)]"
                  : "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                : "border-[var(--border)] bg-[var(--paper)]/70 text-[var(--foreground)] hover:border-[var(--primary)]")
            }>
            {o.label}
          </button>
        );
      })}
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
        className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--primary)] text-[10px] font-bold leading-none text-[var(--primary)] outline-none transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)] focus-visible:bg-[var(--primary)] focus-visible:text-[var(--paper)]"
      >
        i
      </button>
      <span
        role="tooltip"
        // Centring a fixed 16rem box on the trigger pushed it past the right
        // edge of a 390px viewport (measured 473px on a 390px screen), and
        // body{overflow-x:clip} silently cut the text off rather than
        // scrolling. Right-anchored on mobile, centred from sm up.
        className="pointer-events-none absolute bottom-full right-0 left-auto z-10 mb-1.5 w-[min(16rem,calc(100vw-2rem))] translate-x-0 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-xs font-normal leading-relaxed text-[var(--foreground)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
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
                ? "border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--foreground)]"
                : "border-[var(--border)] bg-[var(--paper)]/70 text-[var(--foreground)] hover:border-[var(--primary)]")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

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
  // ── Screen machine: intake (form + a live, continuously-updating preview
  // panel side by side) → adaptive[0..n] → running (with the same preview
  // panel now fed by the real pipeline) → report. There is no separate
  // "verdict" screen any more — the instant, code-only read is always
  // visible next to the form as you fill it in, not a post-submit reveal. ──
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  // companyType is no longer asked — inferProfileSignal reads it from the
  // description server-side (see runIntelligence). Kept out of state entirely.
  const [description, setDescription] = useState("");
  const [capitalSought, setCapitalSought] = useState<string[]>([]);
  // borrowerModel defaults to "operating" and is never asked on the first
  // screen — the lender/intermediary routing it unlocks is out of scope for
  // this tool's lean-founder persona.
  const [elig, setElig] = useState<EligibilityAnswers>({ borrowerModel: "operating" });
  // targetMarkets left the first screen (34 instruments, heavy multi-select);
  // founderCountryList falls back to the incorporation country.

  const [screen, setScreen] = useState<"intake" | "adaptive">("intake");
  const [preparing, setPreparing] = useState(false);
  // One grounded round at a time (advisory_pipeline Phase 3C) — the server
  // decides per-call whether another round is worth asking, grounded in the
  // founder's actual candidate-instrument shortlist. roundAnswers is keyed by
  // EligibilityAnswers field name; a multi-select field (FIELD_ENUM_HINTS[f].multi)
  // holds a string[], everything else a plain string.
  const [round, setRound] = useState<GroundedRound | null>(null);
  const [roundAnswers, setRoundAnswers] = useState<Record<string, string | string[]>>({});
  // brief_funnel_v2 Stage 2b: project answers are keyed by ProjectQuestion.id
  // and kept in their OWN store, never merged into `elig` — computeVerdict()
  // must not see a model-written option. They ride to the memo separately.
  const [projectPicks, setProjectPicks] = useState<Record<string, string>>({});
  const [projectFreeText, setProjectFreeText] = useState<Record<string, string>>({});
  const [projectAnswers, setProjectAnswers] = useState<ProjectAnswer[]>([]);
  const [roundCount, setRoundCount] = useState(0);

  // Phase 4: the model's own read of the free-text description, fetched once
  // (see fetchRound's wantProfileSignal) and passed straight through to the
  // memo — never re-derived.
  const [profileSignal, setProfileSignal] = useState<ProfileSignal | null>(null);

  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<PipelineStep | null>(null);
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [chatter, setChatter] = useState(0);
  // Streamed the moment the pipeline's code-computed facts are known — well
  // before the writer model call resolves (see the "partial" ProgressEvent,
  // emitted from synthesize() in pipeline.ts). Lets the running screen show
  // the founder's REAL institutions table filling in live, instead of
  // narrating progress while the real content sits unused server-side.
  const [livePartial, setLivePartial] = useState<PartialReport | null>(null);
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

  // `eligOverride` lets callers get a payload reflecting eligibility answers
  // that haven't made it into `elig` state yet (React state updates aren't
  // synchronous — see advanceRound, which needs the just-merged answers
  // immediately, not next render's stale closure).
  const basePayload = (eligOverride?: EligibilityAnswers) => ({
    company,
    country,
    description,
    capitalSought,
    eligibility: eligOverride ?? elig,
    profileSignal,
    projectAnswers,
  });

  type Verdict = {
    eligibilityScreen: EligibilityCheck[];
    instrumentTable: InstrumentRow[];
    selfMatched: boolean;
    candidateInstrumentIds: string[];
  };

  // The deterministic, code-only eligibility verdict — never shown on its
  // own, only used to ground which real fund gates the adaptive round is
  // allowed to ask about (see handleContinue/advanceRound below).
  async function fetchVerdict(eligOverride?: EligibilityAnswers): Promise<Verdict | null> {
    try {
      const res = await fetch("/api/intelligence/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(basePayload(eligOverride)),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Verdict>;
      return {
        eligibilityScreen: data.eligibilityScreen ?? [],
        instrumentTable: data.instrumentTable ?? [],
        selfMatched: Boolean(data.selfMatched),
        candidateInstrumentIds: data.candidateInstrumentIds ?? [],
      };
    } catch {
      return null;
    }
  }

  // The form's one primary action: silently compute the deterministic
  // verdict (never shown on its own — it only grounds which real fund gates
  // the adaptive round below is allowed to ask about), then go straight into
  // that adaptive round. There is no "skip" from here: the tailored
  // follow-ups are how the right funds get found, not an optional extra.
  async function handleContinue() {
    if (!company.trim() || preparing) return;
    setError(null);
    setPreparing(true);
    const v = await fetchVerdict();
    await fetchRound(elig, v?.candidateInstrumentIds ?? [], true);
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
      // Either half can carry the screen: a founder with no generic gates left
      // still gets the project questions, which is the whole point of 2b.
      const nGeneric = Array.isArray(data.round?.questions) ? data.round.questions.length : 0;
      const nProject = Array.isArray(data.round?.projectQuestions) ? data.round.projectQuestions.length : 0;
      if (!data.round || nGeneric + nProject === 0) {
        await runMemo([]);
        return;
      }
      setRound(data.round);
      setRoundAnswers({});
      setProjectPicks({});
      setProjectFreeText({});
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
    // Project answers are collected in parallel and kept OUT of `merged` by
    // design: they carry their fund + gate citation to the writer instead.
    const picked: ProjectAnswer[] = [];
    for (const q of round?.projectQuestions ?? []) {
      const choice = projectPicks[q.id];
      const free = projectFreeText[q.id]?.trim();
      const answer = choice === NONE_OF_THESE ? (free || NONE_OF_THESE) : (choice || free);
      if (!answer) continue;
      picked.push({
        questionId: q.id,
        question: q.question,
        answer,
        instrumentId: q.instrumentId,
        instrumentName: q.instrumentName,
        gateKey: q.gateKey,
        quote: q.quote,
        locator: q.locator,
      });
    }
    const allProjectAnswers = [...projectAnswers, ...picked];
    setProjectAnswers(allProjectAnswers);
    setProjectPicks({});
    setProjectFreeText({});
    setElig(merged);
    setRound(null);
    const nextCount = roundCount + 1;
    setRoundCount(nextCount);
    if (nextCount >= MAX_ROUNDS) {
      await runMemo([], allProjectAnswers);
      return;
    }
    setPreparing(true);
    try {
      const v = await fetchVerdict(merged);
      await fetchRound(merged, v?.candidateInstrumentIds ?? [], false);
    } finally {
      setPreparing(false);
    }
  }

  // Stream the memo, folding in whatever clarifications we have.
  // `projectOverride` exists because advanceRound() calls this in the same
  // tick as setProjectAnswers(), so the state hasn't flushed yet.
  async function runMemo(
    clarifications: { question: string; answer: string }[],
    projectOverride?: ProjectAnswer[],
  ) {
    if (running) return;
    setRunning(true);
    setError(null);
    setReport(null);
    setLivePartial(null);
    setElapsed(0);
    setChatter(0);
    setStep("discovering");
    setStatusDetail("");

    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...basePayload(),
          clarifications,
          projectAnswers: projectOverride ?? projectAnswers,
        }),
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
          } else if (event.type === "partial") setLivePartial(event.data);
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

  const screenIdx = screen === "adaptive" ? 1 + roundCount : 0;
  const totalScreens = 1 + MAX_ROUNDS;

  const inputCls =
    "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70 px-3 py-2 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none transition-colors focus:border-[var(--primary)]";
  const nextBtn =
    "rounded-[var(--radius)] border border-[var(--primary)] px-6 py-2.5 font-semibold uppercase tracking-[0.06em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50";
  const backBtn =
    "text-sm font-medium text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--primary)] hover:underline";
  const fieldLabel = "mb-1.5 flex items-center font-semibold";

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] p-5 shadow-[0_2px_24px_rgba(20,18,12,0.06)] print:border-0 print:p-0 print:shadow-none">
      <div className="print:hidden text-[var(--foreground)]">
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Free tool · powered by the funding record
        </p>
        <h2 className="text-xl sm:text-2xl font-semibold leading-tight" style={serif}>
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
                  (i === screenIdx ? "w-6 bg-[var(--primary)]" : i < screenIdx ? "w-3 bg-[var(--primary)]/50" : "w-3 bg-[var(--muted)]")
                }
              />
            ))}
            <span className="ml-1">Step {Math.min(screenIdx + 1, totalScreens)} of {totalScreens}</span>
          </div>
        )}

        {/* ── Intake: the form and its live preview panel, side by side ── */}
        {screen === "intake" && !running && (
          <form
            onSubmit={(e) => { e.preventDefault(); void handleContinue(); }}
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
                  <option value="" className="bg-[var(--paper)] text-[var(--foreground-soft)]">Select…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c} className="bg-[var(--paper)] text-[var(--foreground)]">{c}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* ── The eight questions, chosen on evidence, not habit ──────────
                Ranked by how many instruments each field actually gates in the
                triaged corpus (ETL/terms/encode_gates.py + propose_intake_fields.py):
                  sector 72 · developmentStage 53 · consortium 50 · fteBand 46
                  · exclusionFlags 47 (80 rules) · cofinancingBand 36
                plus ticket and capital type, which prune the instrument
                universe hardest even though few gates cite them.
                DROPPED from this screen: companyType (inferred from the
                description by inferProfileSignal, and it gates nothing) and
                targetMarkets (a heavy country multi-select for 34 instruments,
                already optional — the adaptive round asks when it matters).
                Hard ceiling of eight: a longer first screen reads as an
                interrogation and is where founders leave. ── */}

            <div className="text-sm">
              <span className="mb-2 flex items-center font-semibold">
                Your sector
                <InfoDot>
                  Sector carve-outs are everywhere in EU aid law: agriculture,
                  fisheries, finance and defence are excluded outright by many
                  schemes. This one answer settles roughly 99 documented rules
                  across 72 funds.
                </InfoDot>
              </span>
              <Chips options={[...SECTOR_OPTIONS]} value={elig.sector}
                onPick={(v) => setElig((p) => ({ ...p, sector: v }))} />
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

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="text-sm">
                <span className="mb-2 block font-semibold">Team size</span>
                <Chips options={[
                  { value: "1-9", label: "1–9" }, { value: "10-49", label: "10–49" },
                  { value: "50-249", label: "50–249" }, { value: "250+", label: "250+" },
                ]} value={elig.fteBand} onPick={(v) => setElig((p) => ({ ...p, fteBand: v }))} />
              </div>
              <div className="text-sm">
                <span className="mb-2 flex items-center font-semibold">
                  Share of cost you could self-fund
                  <InfoDot>
                    Almost every grant is co-financed: the fund pays a percentage
                    and you carry the rest. Below 25% closes most of them.
                  </InfoDot>
                </span>
                <Chips options={[
                  { value: ">50%", label: "More than half" },
                  { value: "25-50%", label: "25–50%" },
                  { value: "<25%", label: "Under 25%" },
                ]} value={elig.cofinancingBand}
                  onPick={(v) => setElig((p) => ({ ...p, cofinancingBand: v }))} />
              </div>
            </div>

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
                Could you run this with partners?
                <InfoDot>
                  A large share of EU money is only available to consortia of
                  three or more organisations from three or more countries. It
                  gates 50 funds on its own.
                </InfoDot>
              </span>
              <Chips options={[
                { value: "yes", label: "Yes, we could" },
                { value: "no", label: "No, single applicant" },
                { value: "unsure", label: "Not sure" },
              ]} value={elig.consortium}
                onPick={(v) => setElig((p) => ({ ...p, consortium: v as EligibilityAnswers["consortium"] }))} />
            </div>

            <div className="text-sm">
              <span className="mb-2 flex items-center font-semibold">
                Do any of these apply?
                <InfoDot>
                  Standard EU exclusion situations. Any one of them closes most
                  state aid outright, so it is better to know now than after an
                  application. Asked as a checklist because it settles roughly
                  80 rules across 47 funds in a single answer.
                </InfoDot>
              </span>
              <MultiChips options={[...EXCLUSION_OPTIONS]} value={elig.exclusionFlags ?? []}
                exclusive="none"
                onToggle={(v) => setElig((p) => ({ ...p, exclusionFlags: toggleExclusion(p.exclusionFlags ?? [], v) }))} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
              <button type="submit" disabled={!company.trim() || preparing} className={nextBtn}>
                {preparing ? "Finding your tailored questions…" : "Continue"}
              </button>
              <span className="text-xs text-[var(--muted-foreground)]">
                A short, tailored follow-up screen comes next, then your memo.
              </span>
            </div>
          </form>
        )}

        {/* ── Adaptive round: grounded in the founder's real remaining gates ── */}
        {screen === "adaptive" && round && !running && (
          <div className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70 p-5 sm:p-6">
            <StepHeader
              eyebrow={round.theme}
              title="A few tailored questions"
              detail="Each one comes from a real requirement of a fund still on your shortlist: answering these is what finds the right funds. Leave any you genuinely don't know unanswered."
            />
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
                              (on ? "border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--foreground)]"
                                  : "border-[var(--border)] bg-[var(--paper)]/70 text-[var(--foreground)] hover:border-[var(--primary)]")
                            }>
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Project questions: written from one fund's verbatim
                  requirement, with model-written options. Kept visually
                  distinct so it reads as "about your project", not more
                  eligibility admin. */}
              {(round.projectQuestions ?? []).length > 0 && (
                <div className="space-y-5 border-t border-[var(--border)] pt-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
                    About your project
                  </p>
                  {(round.projectQuestions ?? []).map((q) => {
                    const picked = projectPicks[q.id];
                    const opts = [...q.options, NONE_OF_THESE];
                    return (
                      <div key={q.id}>
                        <p className="mb-1 text-sm font-semibold" style={serif}>{q.question}</p>
                        <p className="mb-2 text-xs text-[var(--muted-foreground)]">
                          {q.instrumentName} requires: &ldquo;{q.quote}&rdquo;
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {opts.map((o) => {
                            const on = picked === o;
                            return (
                              <button key={o} type="button" aria-pressed={on}
                                onClick={() => setProjectPicks((prev) => ({
                                  ...prev, [q.id]: prev[q.id] === o ? "" : o,
                                }))}
                                className={
                                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                                  (on ? "border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--foreground)]"
                                      : "border-[var(--border)] bg-[var(--paper)]/70 text-[var(--foreground)] hover:border-[var(--primary)]")
                                }>
                                {o}
                              </button>
                            );
                          })}
                        </div>
                        {picked === NONE_OF_THESE && (
                          <input
                            value={projectFreeText[q.id] ?? ""}
                            onChange={(e) => setProjectFreeText((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            placeholder="Then how would you describe it?"
                            className={inputCls + " mt-2"}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mt-6 flex items-center gap-4">
              <button type="button" disabled={preparing} onClick={() => void advanceRound()} className={nextBtn}>
                {preparing
                  ? "Checking…"
                  : roundCount + 1 >= MAX_ROUNDS ? "Write my funding memo" : "Continue"}
              </button>
              <button type="button" onClick={() => setScreen("intake")} className={backBtn}>
                Back
              </button>
            </div>
          </div>
        )}

        {/* ── Generation: live status + elapsed time ───────────────────── */}
        {running && (
          <div className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70 p-5 sm:p-6">
            <div className="flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-widest text-[var(--accent)]">Writing your memo</p>
              <p className="font-mono text-xs tabular-nums text-[var(--muted-foreground)]">
                {Math.floor(elapsed / 60) > 0 ? `${Math.floor(elapsed / 60)}m ` : ""}{elapsed % 60}s elapsed
              </p>
            </div>
            <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {STEPS.map((s, i) => {
                const state = activeIndex > i ? "done" : activeIndex === i ? "active" : "pending";
                return (
                  <li key={s.key} className="flex items-center gap-2 text-sm">
                    <span className={
                      "flex h-5 w-5 items-center justify-center rounded-full text-[11px] " +
                      (state === "done" ? "bg-[#2D6A4F] text-[var(--foreground)]"
                        : state === "active" ? "bg-[var(--primary)] text-[var(--paper)] animate-pulse"
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
            <p className="mt-3 min-h-[1.25rem] text-sm italic text-[var(--muted-foreground)]">
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

            {/* ── The real institutions table, live: populated the moment the
                pipeline's code-computed facts are known (see the "partial"
                SSE event), well before the prose below it is finished. This
                is the actual memo forming, not narration about it. ── */}
            {livePartial && (
              <div className="mt-6 border-t border-[var(--border)] pt-6">
                <div className="border border-[var(--border)] bg-[var(--paper)] px-5 py-5 sm:px-7 sm:py-6 text-[15px] leading-relaxed text-[var(--foreground)]" style={serif}>
                  <InstitutionsTable institutions={livePartial.institutions} pending />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-[var(--radius)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>

      {report && <Memo key={report.generatedAt} report={report} />}
    </section>
  );
}

/** A quiet editorial section title in the house serif — no number, no colour. */
/** One consistent heading grammar used by every screen of the intake flow
 *  (the live-preview panel, the adaptive round, the running screen) — a
 *  small eyebrow, a plain-English title, and a one-line explainer of what
 *  this screen is and what happens next. Replaces three previously
 *  different ad hoc heading styles per screen. */
function StepHeader({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return (
    <div className="mb-3">
      {eyebrow && (
        <p className="text-xs uppercase tracking-widest text-[var(--accent)]">{eyebrow}</p>
      )}
      <p className="text-sm font-semibold text-[var(--foreground)]" style={serif}>{title}</p>
      {detail && (
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{detail}</p>
      )}
    </div>
  );
}

/** A small shimmering placeholder for a model-written cell that hasn't
 *  arrived yet (see InstitutionsTable's `pending`) — real layout, honest
 *  "still writing this" signal, never a spinner standing in for content. */
function PlaceholderBar({ narrow = false }: { narrow?: boolean }) {
  return (
    <span
      className={"inline-block h-3 animate-pulse rounded bg-[var(--muted)] align-middle " + (narrow ? "w-20" : "w-40")}
    />
  );
}

/**
 * The brief's centrepiece table: institution / type of support / why you
 * qualify / comparable firms. Used identically in two moments — live, while
 * the memo is still generating (whyEligible/nextStep render as
 * PlaceholderBar until the model has written them, `pending`), and final, in
 * the finished Memo. Same component, same layout, so the placeholder cells
 * simply fill in with real text rather than the table re-laying-out.
 */
function InstitutionsTable({ institutions, pending = false }: { institutions: InstitutionEntry[]; pending?: boolean }) {
  if (!institutions || institutions.length === 0) return null;
  return (
    <>
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
          {institutions.map((r, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-3">
                <span className="font-semibold">{r.institution}</span>
                {(r.country || r.legalBasis) && (
                  <span className="block text-[12px] text-[var(--muted-foreground)]">
                    {[r.country, r.legalBasis].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className="block text-[12px] tabular-nums text-[var(--muted-foreground)]">
                  {r.ticket}
                </span>
              </td>
              <td className="py-2.5 pr-3">{r.supportType}</td>
              <td className="py-2.5 pr-3">
                {/* Qualification comes first and is code-computed, so it is
                    already correct while the model's prose streams. Funds a
                    company cannot access were dropped in the pipeline and
                    never reach this table. */}
                {r.verdict === "one_blocker" && r.blocker ? (
                  <span className="mb-1 block">
                    <span className="font-semibold text-[var(--accent)]">One thing in the way:</span>{" "}
                    <span className="text-[var(--foreground-soft)]">{r.blocker}</span>
                  </span>
                ) : r.verdict === "open" && (r.gatesChecked ?? 0) > 0 ? (
                  <span className="mb-1 block font-semibold text-[#3d6136]">
                    Open to you: nothing in its documented rules rules you out
                  </span>
                ) : null}
                {pending && !r.whyEligible ? <PlaceholderBar /> : r.whyEligible}
                {r.whyEasy && (
                  <span className="mt-1 block text-[12px] text-[var(--muted-foreground)]">
                    {r.whyEasy}
                  </span>
                )}
                <span className="block text-[12px] italic text-[var(--muted-foreground)]">
                  Move: {pending && !r.nextStep ? <PlaceholderBar narrow /> : r.nextStep}
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
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-10 mb-3 text-[17px] font-semibold text-[var(--foreground)] print:mt-8" style={serif}>
      {children}
    </h3>
  );
}

/** Deterministic, cited, never model-written — shared by the fast verdict
 *  screen and the final memo so both render identically. */
function EligibilityTable({ rows }: { rows: EligibilityCheck[] }) {
  if (!rows || rows.length === 0) return null;
  // Show what the founder can act on. Once the rules corpus became machine-
  // readable this screen filled with "likely met — verify:" rows that carry no
  // decision: passing a rule you were always going to pass is not information,
  // and 20 such rows sit between the reader and the two that matter. Anything
  // failing, unknown, or asserted (met/not_met on a verified gate) is shown;
  // the merely-likely-met are counted instead.
  const ACTIONABLE = new Set(["not_met", "likely_not_met", "unknown", "met", "info"]);
  const shown = rows.filter((r) => ACTIONABLE.has(r.status));
  const passedQuietly = rows.length - shown.length;
  return (
    <>
      <SectionTitle>Eligibility screen</SectionTitle>
      <p className="mb-3 text-[13px] text-[var(--muted-foreground)]">
        Evaluated in code against the primary texts. Each row cites its legal
        basis; failed gates name the cure.
        {passedQuietly > 0 && (
          <>
            {" "}
            A further {passedQuietly} documented {passedQuietly === 1 ? "rule" : "rules"} on
            these funds {passedQuietly === 1 ? "was" : "were"} checked and raised nothing.
          </>
        )}
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
          {shown.map((r, i) => (
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


/**
 * The whole report rendered as a single advisory letter — flowing serif prose,
 * hairline rules, one restrained comparables table. No cards, boxes, pills or
 * colour blocks. Reads top to bottom and prints to a clean PDF.
 */
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

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

  const readMinutes = Math.max(
    1,
    Math.round(
      (report.bottomLine.reduce((n, b) => n + wordCount(b), 0) +
        wordCount(report.positioning) +
        wordCount(report.stateOfPlay)) /
        200,
    ),
  );

  // Reveal-first-bullet: the single best line lands immediately, everything
  // else fades in a beat later — an opened loop reads better than a wall of
  // text arriving all at once. The parent keys this component by
  // generatedAt, so this state starts fresh (false) for every new report,
  // never stuck "revealed" from a prior run.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 550);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      id="print-report"
      style={serif}
      className="mt-8 border border-[var(--border)] bg-[var(--paper)] px-7 py-9 sm:px-12 sm:py-12 text-[15px] leading-relaxed text-[var(--foreground)] print:mt-0 print:border-0 print:px-0 print:py-0"
    >
      {/* Export — screen only */}
      <div className="mb-8 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-[var(--radius)] border border-[var(--primary)] px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.06em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)]"
        >
          Export PDF
        </button>
      </div>

      {/* ── Letterhead ─────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between border-t-2 border-[var(--primary)] pt-3">
        <span className="text-sm font-bold tracking-[0.2em] text-[var(--primary)]">
          WINCENT
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          Private funding memorandum · ~{readMinutes} min read
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

      {/* ── Bottom line: the single best line lands first, up front ──── */}
      <ul className="mt-6 space-y-3 text-[17px] leading-[1.55]">
        <li className="flex gap-3">
          <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
          <span>{report.bottomLine[0]}</span>
        </li>
      </ul>

      {/* ── Everything else fades in a beat later ────────────────────── */}
      <div
        className={"transition-opacity duration-500 " + (revealed ? "opacity-100" : "opacity-0")}
        aria-hidden={!revealed}
      >
        <ul className="mt-3 space-y-3 text-[17px] leading-[1.55]">
          {report.bottomLine.slice(1).map((b, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
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

        {/* ── Where to target: the brief's centrepiece table ───────────── */}
        <InstitutionsTable institutions={report.institutions} />

        {/* ── Positioning: fitting the current political moment ────────── */}
        <SectionTitle>Positioning</SectionTitle>
        <p>{report.positioning}</p>

        {/* ── State of play: recent news + the closing line ─────────────── */}
        <SectionTitle>State of play</SectionTitle>
        <p>{report.stateOfPlay}</p>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="mt-12 border-t border-[var(--border)] pt-4">
          <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">{report.caveats}</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            Wincent · the state-backed capital record of European companies, 2021–2025
          </p>
        </div>
      </div>
    </div>
  );
}
