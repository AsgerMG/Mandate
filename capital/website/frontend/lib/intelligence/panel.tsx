"use client";

import { useEffect, useState } from "react";
import {
  CAPITAL_OPTIONS,
  SECTOR_OPTIONS,
  USE_OF_FUNDS_OPTIONS,
  FIELD_ENUM_HINTS,
  MAX_DESCRIPTION_CHARS,
  MIN_MATCHABLE_DESCRIPTION_CHARS,
  TICKET_BANDS,
  USEFUL_DESCRIPTION_CHARS,
  type EligibilityAnswers,
  type EligibilityCheck,
  type GroundedRound,
  type InstrumentRow,
  type IntelligenceReport,
  type PartialReport,
  type PipelineStep,
  type ProfileSignal,
  type ProjectAnswer,
  type ProgressEvent,
} from "@/lib/intelligence/types";

import { CapitalSelect, InfoDot, MultiChips } from "./panelControls";
import { InstitutionsTable, Memo, StepHeader } from "./panelReport";

/** A chip-row single select for band/enum answers. */
/** Who the handover on screen 2 comes from. One string, because "who is
 *  speaking to the founder" is a product decision that should not be hunted
 *  through JSX to change. */
const ANALYST_SIGNOFF = "Wincent";

/** The only moving thing on screen while the shortlist and the tailored
 *  questions are built. A changed button label alone reads as a dead control
 *  on a wait this long. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent align-[-2px]"
    />
  );
}


export function Chips({
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
  // Set when the founder dismisses the "you are about to skip the single most
  // useful answer" prompt. Purely presentational — nothing downstream reads it,
  // and the pipeline degrades to peer precedence and sector share exactly as it
  // did before, so a skipped description is a thinner brief and never a broken
  // one.
  const [descriptionSkipped, setDescriptionSkipped] = useState(false);
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
  // How many routes the deterministic pass already put in play. Held so the
  // handover can say something true rather than something encouraging.
  const [routesInPlay, setRoutesInPlay] = useState(0);
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
    setRoutesInPlay(v?.instrumentTable?.length ?? 0);
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
      setRoutesInPlay(v?.instrumentTable?.length ?? 0);
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
        {/* The pitch belongs on the way in, not in the middle. Past screen 1
            the founder has already bought the premise; repeating the headline
            and the "one short screen, then a memo" explainer above their
            questions is the product selling to someone already in the room. */}
        {screen === "intake" && !running && !report && (
          <>
            <h2 className="text-xl sm:text-2xl font-semibold leading-tight" style={serif}>
              Understand how comparable companies raise public capital
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--foreground)]">
              One short screen, an instant eligibility read, then a few follow-ups
              tailored to your specific case, then one executive memo: what you can
              qualify for, what each option requires, and what to watch. Export it
              as a PDF.
            </p>
          </>
        )}

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
              {/* ── The one question worth more than the other eight ──────────
                  This was a single-line input labelled "What you do (one line)",
                  optional, and the ranker treated anything under
                  MIN_MATCHABLE_DESCRIPTION_CHARS as nothing at all — so a
                  founder could skip it, or type four words, and never learn that
                  the entire thematic half of the ranking had switched itself off.

                  Measured, paired, same companies both ways, leak-checked
                  (scripts/measure_description_lift.ts, n=301 holdout): a real
                  description puts the fund they actually won in the top five
                  8-12pp more often than the canned sector sentence does, and
                  +26.5pp on the population that can be pinned at all. The
                  range is across runs while other work changed the ranker;
                  the direction held in all three, 48 cases to 18 on the
                  discordant pairs.

                  So: a textarea, a question that asks for the project rather
                  than a tagline, and a live prompt when the answer is too thin
                  to separate anything. Still never a hard block — see the skip
                  affordance under the submit, where going on without one is a
                  decision the founder makes rather than an accident of an
                  empty box. */}
              <label className="block text-sm">
                <span className={fieldLabel}>
                  What are you building?
                  <span className="ml-1 font-normal text-[var(--muted-foreground)]">(a sentence or two)</span>
                  <InfoDot>
                    In your own words: what you are building, who it is for, and
                    the specific piece of work the money would go towards.
                    Programmes are matched to it directly — we compare what you
                    write against what each fund has actually paid for. On our
                    own records, companies that describe their project get the
                    fund they went on to win into their top five more than twice
                    as often as companies described only by their sector.
                  </InfoDot>
                </span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  rows={3} maxLength={MAX_DESCRIPTION_CHARS}
                  placeholder={"e.g. We build collision-avoidance software for satellite operators. "
                    + "The project would develop an onboard autonomous manoeuvring system and fly it "
                    + "on a demonstrator."}
                  className={inputCls + " min-h-[5.5rem] resize-y leading-relaxed"} />
                {/* Two thresholds, two different truths, so the nudge never
                    overstates: under MIN_MATCHABLE it is discarded outright,
                    under USEFUL it is embedded but scores everything alike. */}
                {description.trim().length > 0
                  && description.trim().length < USEFUL_DESCRIPTION_CHARS && (
                  <span className="mt-1.5 block text-xs text-[var(--muted-foreground)]">
                    {description.trim().length < MIN_MATCHABLE_DESCRIPTION_CHARS
                      ? "Too short to match on — add what you are building and what the project would do."
                      : "A little more would help: what the project itself would build or prove."}
                  </span>
                )}
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
                What do you build?
                <InfoDot>
                  Programmes are organised around fields of work, and this is
                  also how every company in our record is classified — so
                  answering it lets us compare you against companies that have
                  actually been funded, not just against the rulebook.
                </InfoDot>
              </span>
              <Chips options={[...SECTOR_OPTIONS]} value={elig.sector}
                onPick={(v) => setElig((p) => ({ ...p, sector: v }))} />
            </div>

            {/* The single most decisive question the intake used to omit: 585
                gates across 266 instruments turn on eligible costs, 59 of them
                hard filters. Placed on screen 1 rather than the adaptive round
                because it was already reaching founders as a BLOCKER we had
                the means to clear — three briefs told a founder to "reframe
                the project as applied research" for want of asking. */}
            <div className="text-sm">
              <span className="mb-2 flex items-center font-semibold">
                What would the money pay for?
                <InfoDot>
                  Most public funding is tied to specific cost categories rather
                  than to the company: aid law separates research from
                  development from feasibility work, treats production capacity
                  differently again, and rarely covers general running costs.
                  Pick everything the project would genuinely include.
                </InfoDot>
              </span>
              <MultiChips options={[...USE_OF_FUNDS_OPTIONS]} value={elig.useOfFunds ?? []}
                onToggle={(v) => setElig((p) => ({
                  ...p,
                  useOfFunds: (p.useOfFunds ?? []).includes(v)
                    ? (p.useOfFunds ?? []).filter((x) => x !== v)
                    : [...(p.useOfFunds ?? []), v],
                }))} />
            </div>

            {/* The single most decisive question the intake used to omit: 585
                gates across 266 instruments turn on eligible costs, 59 of them
                hard filters. Placed on screen 1 rather than the adaptive round
                because it was already reaching founders as a BLOCKER we had
                the means to clear — three briefs told a founder to "reframe
                the project as applied research" for want of asking. */}
            

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

            

            

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
              <button type="submit" disabled={!company.trim() || preparing} className={nextBtn}>
                {/* A label change alone reads as a dead button on a wait this
                    long: the screen sits still for several seconds with no
                    sign anything is happening. The spinner is the only moving
                    thing on the page while the shortlist and the questions
                    are being built. */}
                {preparing && <Spinner />}
                {preparing ? "Finding your tailored questions…" : "Continue"}
              </button>
              <span className="text-xs text-[var(--muted-foreground)]">
                A short, tailored follow-up screen comes next, then your memo.
              </span>
            </div>

            {/* ── Skipping the description, made explicit ───────────────────
                The submit is never disabled for a missing description: a form
                that will not move is how a founder leaves. But an empty box
                used to cost them the whole thematic half of the ranking in
                silence, so the cost is stated once, at the moment they are
                about to pay it, and they answer for themselves. Clicking
                through sets descriptionSkipped, which suppresses the prompt for
                the rest of the session — asked once, not nagged. */}
            {!descriptionSkipped && !preparing && Boolean(company.trim())
              && description.trim().length < USEFUL_DESCRIPTION_CHARS && (
              <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
                Without a description we can still screen you on country, sector
                and size — but the shortlist is then built from what companies
                like you have won, not from what you are actually doing, and it
                lands on the right fund about half as often.{" "}
                <button type="button" onClick={() => setDescriptionSkipped(true)}
                  className="underline underline-offset-2 hover:text-[var(--foreground)]">
                  Continue without it
                </button>
              </p>
            )}
          </form>
        )}

        {/* ── Adaptive round: grounded in the founder's real remaining gates ── */}
        {screen === "adaptive" && round && !running && (
          <div className="mt-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]/70 p-5 sm:p-6">
            {/* A handover, not a form header.
                Screen 2 used to open with the same marketing headline and
                product blurb as screen 1, then go straight into questions —
                the product re-pitching itself in the middle of a conversation.
                What a specialist does instead is tell you what your answers
                already bought, what they are doing with them, and what is
                still open. The counts come from the verdict the client is
                already holding at this moment; before this it was fetched,
                used silently to pick questions, and never shown, so we took
                before we gave. */}
            <div className="mb-6 border-l-2 border-[var(--primary)] pl-4">
              <p className="text-[15px] leading-relaxed text-[var(--foreground)]">
                Thanks, that is the scoping done. Those first answers are the
                ones that decide which funds are even relevant, and we have
                run them against the register
                {routesInPlay > 0 ? (
                  <>
                    {" "}— <strong>{routesInPlay} route{routesInPlay === 1 ? "" : "s"}</strong>{" "}
                    are in play for a company like yours
                  </>
                ) : null}
                .
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--foreground)]">
                What follows are the questions we cannot answer for you, and
                each one moves you further down the funnel. Leave anything you
                genuinely do not know unanswered, that is useful too.
              </p>
              <p className="mt-3 text-[13px] text-[var(--muted-foreground)]">
                — {ANALYST_SIGNOFF}
              </p>
            </div>
            <div className="space-y-5">
              {round.questions.map((q) => {
                const hint = FIELD_ENUM_HINTS[q.field];
                if (!hint) return null;
                const current = roundAnswers[q.field];
                return (
                  <div key={q.field}>
                    <p className="mb-1 text-sm font-semibold" style={serif}>{q.question}</p>
                    {q.stake && (
                      <p className="mb-2 text-xs text-[var(--accent)]">{q.stake}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(q.options?.length ? q.options : hint.options).map((o) => {
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
                        {/* Only questions written FROM a fund's requirement
                            carry a citation. The commercial half has no
                            instrument and no quote, and was rendering a bare
                            `requires: ""` under every question. */}
                        {q.stake && (
                          <p className="mb-2 text-xs text-[var(--accent)]">{q.stake}</p>
                        )}
                        {q.quote && q.instrumentName && (
                        <p className="mb-2 text-xs text-[var(--muted-foreground)]">
                          {q.instrumentName} requires: &ldquo;{q.quote}&rdquo;
                        </p>
                        )}
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
                {preparing && <Spinner />}
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
                  <InstitutionsTable institutions={livePartial.institutions} withheld={livePartial.withheld} pending />
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
