"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CAPITAL_OPTIONS,
  ORGANISATION_TYPE_OPTIONS,
  SECTOR_OPTIONS,
  USE_OF_FUNDS_OPTIONS,
  FIELD_ENUM_HINTS,
  MAX_DESCRIPTION_CHARS,
  MIN_MATCHABLE_DESCRIPTION_CHARS,
  PROJECT_ANSWER_PREFIX,
  TICKET_BANDS,
  USEFUL_DESCRIPTION_CHARS,
  pinnedAnswers,
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

import { CapitalSelect, CompactMultiSelect, InfoDot } from "./panelControls";
import { regionOptions } from "./regions.generated";
import { ORGANISATION_TYPE_ARM, prefillOrganisationType } from "./organisationType";
import { toIso2 } from "./countryCodes";
import { InstitutionsTable, Memo, StepHeader } from "./panelReport";

/** A chip-row single select for band/enum answers. */
/** Who the handover on screen 2 comes from. One string, because "who is
 *  speaking to the founder" is a product decision that should not be hunted
 *  through JSX to change. */

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
              "min-h-10 rounded-[var(--radius)] border px-3 py-2 text-sm font-medium transition-colors " +
              (on
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--paper)]"
                : "border-[var(--border)] bg-transparent text-[var(--foreground)] hover:border-[var(--primary)]")
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
//
// A FUNCTION of the corpus, not a constant. The querying_db line used to read
// "Matching names against 146,911 companies in the funding record…" — a literal
// that was five thousand companies out of date and, worse, contradicted by the
// footer of the very page it renders on, which reads the live census. A founder
// watching a three-minute progress panel could see both numbers at once.
//
// The count arrives as a prop from app/brief/page.tsx (a server component
// calling corpusStats()), because this module is "use client" and cannot read
// the census itself. See lib/data.ts.
const stepChatter = (companies: number): Record<string, string[]> => ({
  discovering: [
    "Searching the open web for comparable companies…",
    "Reading recent coverage of your space…",
  ],
  querying_db: [
    `Matching names against ${companies.toLocaleString()} companies in the funding record…`,
    "Tracing grants, state aid and public capital per comparable…",
  ],
  generating: [
    "Assembling the instrument table for your ticket size…",
    "Grounding the road ahead in the intelligence corpus…",
    "Drafting your position against the comparable field…",
    "Writing the funder map with honest trade-offs…",
    "Checking every figure against the database…",
  ],
});

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

/** What the panel needs from the corpus. One field, and a named interface
 *  rather than a bare number, so the next figure this screen states arrives the
 *  same way instead of as the next literal. */
export interface IntelligencePanelProps {
  /** Companies in the funding record, from `corpusStats()` on the server. */
  corpusCompanies: number;
  /** The years the corpus covers, e.g. "2021 to 2025", from `corpusProse()`.
   *  The memo footer states it, and stated it as a literal until now. */
  corpusWindow: string;
}

export function IntelligencePanel({ corpusCompanies, corpusWindow }: IntelligencePanelProps) {
  // Rebuilt only when the census moves, which is weekly at most.
  const STEP_CHATTER = useMemo(() => stepChatter(corpusCompanies), [corpusCompanies]);
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
  // ── The two flags that turn skipping the description into a DECISION ─────
  // `descriptionAsked` latches the one time a submit is stopped to say what an
  // empty box costs. `descriptionSkipped` latches when the founder answers that
  // by going on anyway. Between them the founder is asked once and never
  // nagged, and no path through this screen is closed.
  //
  // Both are purely presentational: nothing downstream reads either, the
  // pipeline degrades to peer precedence and sector share exactly as it did
  // before, and a skipped description is a thinner brief rather than a broken
  // one.
  //
  // NEITHER IS RECORDED, ANYWHERE, DELIBERATELY. Whether founders actually fill
  // this box in is the one number that would say what this friction was worth,
  // and the owner decided on 2026-08-19 not to collect it: no route writes it,
  // no telemetry carries it, and the effect of this change on real behaviour is
  // unmeasured by design. The change is justified by the measured LIFT alone
  // (see USEFUL_DESCRIPTION_CHARS), not by any observation of the skip rate,
  // which is unknown today and stays unknown.
  const [descriptionAsked, setDescriptionAsked] = useState(false);
  const [descriptionSkipped, setDescriptionSkipped] = useState(false);
  // The submit that gets stopped puts the cursor back in this box. A cost
  // stated at the bottom of a long form is a cost stated where nobody is
  // looking; the founder is returned to the field that fixes it.
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  // Reads the two floors, never moves them. `thin` is "below the length that
  // separates funds"; `unmatchable` is the harder truth underneath it, where
  // both matchers return nothing at all and the ranking is sector-only. The
  // copy below branches on which of the two is true, because saying
  // "sector-only" about a thirty-character answer would be false.
  const descriptionLength = description.trim().length;
  const descriptionThin = descriptionLength < USEFUL_DESCRIPTION_CHARS;
  const descriptionUnmatchable = descriptionLength < MIN_MATCHABLE_DESCRIPTION_CHARS;
  const [capitalSought, setCapitalSought] = useState<string[]>([]);
  // borrowerModel is pinned and never asked — the lender/intermediary routing
  // it unlocks is out of scope for this tool's lean-founder persona. The value
  // is READ from FIELD_REACH rather than written here, because it is not a
  // presentational default: it is the single answer 101 encoded comparators
  // are decided against, and a literal here made that invisible to the guard
  // whose whole job is to say whether a filter can admit anyone.
  const [elig, setElig] = useState<EligibilityAnswers>(pinnedAnswers());
  // ── The region question, and why it is on this screen ─────────────────────
  // It was asked adaptively, which meant most founders were never asked at all
  // — wsAO measured a region supplied for 46% of graded pairs. It is also the
  // single most decisive thing we can ask: 181 encoded, official region filters
  // on 155 leaves, and the ONLY field whose demands differ between siblings
  // across the eight largest fund families. `exclusionFlags` and `activities`,
  // the two most-encoded fields in the whole corpus at 1,289 comparators, are
  // identical across every leaf of the families they cover — asking about them
  // eliminates nobody.
  //
  // `regionTouched` is the whole safety property of the pre-fill. Once the
  // founder has changed the select, nothing may overwrite it: a later company
  // lookup that disagrees is a guess losing to an answer.
  const [regionTouched, setRegionTouched] = useState(false);
  const [regionPrefill, setRegionPrefill] = useState<
    { label: string; matchedName: string } | null>(null);
  // Same safety property, one field over. `orgTypeTouched` latches on the
  // founder's first pick and nothing may write over it afterwards.
  const [orgTypeTouched, setOrgTypeTouched] = useState(false);
  const [orgTypePrefill, setOrgTypePrefill] = useState<string | null>(null);
  // ── `targetMarkets` IS GONE, NOT MERELY UNASKED (wsIK) ──────────────────
  // It left the first screen as a heavy country multi-select, and the request
  // field, the three route reads and `founderCountryList`'s override went with
  // it. Which countries' funds a founder may see is decided by `entityCountries`
  // — asked on this screen, with the incorporation country folded in by
  // `withIncorporationCountry` — and by nothing else.

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
  // The same value as a REF, for the same reason as `eligBeforeRound` below:
  // `fetchRound` writes the signal and, when the round comes back empty, calls
  // `runMemo` in the SAME tick, so the render-time `profileSignal` is still
  // null there. `basePayload()` reads this, so the memo request carries the
  // signal the intake route inferred on every path, not only the happy one.
  const profileSignalRef = useRef<ProfileSignal | null>(null);

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

  // ── Pre-fill the region from the registered address, once there is enough
  // to look one up. Debounced because it fires as the founder types a name.
  //
  // It never fights the founder: it writes only while `regionTouched` is false,
  // and the moment they pick anything themselves it stops writing for good. A
  // stale in-flight response cannot land after an edit either — `cancelled`
  // closes that race, which otherwise reappears exactly when someone corrects a
  // wrong pre-fill quickly, i.e. when being wrong matters most.
  useEffect(() => {
    if (regionTouched) return;
    const name = company.trim();
    if (!name || !country) { setRegionPrefill(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch("/api/intelligence/region", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: name, country }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || regionTouched) return;
          if (d?.region) {
            setElig((p) => ({ ...p, region: d.region }));
            setRegionPrefill({ label: d.label, matchedName: d.matchedName });
          } else {
            setRegionPrefill(null);
          }
        })
        // A failed pre-fill is a question the founder answers themselves, which
        // is exactly where they were before this existed.
        .catch(() => { /* leave the field empty */ });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [company, country, regionTouched]);

  // The organisation-type pre-fill, which needs no network call at all: the
  // legal form is IN the name the founder is typing, because company law
  // requires it to be. Synchronous, so the answer appears as they type rather
  // than a moment later, and it stops writing the instant they pick anything.
  useEffect(() => {
    if (ORGANISATION_TYPE_ARM !== "on" || orgTypeTouched) return;
    const guess = prefillOrganisationType(company);
    setOrgTypePrefill(guess);
    // A name with no designator is the common, legitimate case — a sole trader
    // declares none. Clear rather than keep a stale guess from an older name.
    setElig((p) => (p.organisationType === guess ? p : { ...p, organisationType: guess ?? undefined }));
  }, [company, orgTypeTouched]);

  // The founder's own country decides which regions exist. `toIso2` is what
  // bridges the country select's full English names to the NUTS table's ISO2
  // keys; without it this list is empty and the question renders as a select
  // with nothing in it.
  const regionChoices = useMemo(
    () => regionOptions([toIso2(country)].filter(Boolean)), [country]);

  const allCapital = capitalSought.length === CAPITAL_OPTIONS.length;
  const toggleCapital = (value: string) =>
    setCapitalSought((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  const toggleAllCapital = () =>
    setCapitalSought(allCapital ? [] : CAPITAL_OPTIONS.map((o) => o.value));

  // ── WHAT THE FOUNDER HAD ANSWERED BEFORE THE FOLLOW-UP SCREEN ───────────
  //
  // The memo request carries two answer objects and the SERVER takes the
  // difference; nothing here decides which fields were late, and nothing here
  // could be trusted to. See lib/intelligence/answerProvenance.ts.
  //
  // A REF, not state, and for the reason this file has already been burned by
  // twice: `handleContinue` -> `fetchRound` -> `runMemo` all run in one tick,
  // so a `setState` written at the top of that chain is not what the closure at
  // the bottom reads. `projectOverride` and `eligOverride` below are the same
  // hazard threaded by hand; a ref is the version that cannot be forgotten at a
  // fourth call site.
  //
  // Written ONCE, when the first screen is submitted. A second round must not
  // move it: the property is "first answered on a follow-up screen", not "since
  // the last one".
  const eligBeforeRound = useRef<EligibilityAnswers | null>(null);

  // `eligOverride` lets callers get a payload reflecting eligibility answers
  // that haven't made it into `elig` state yet (React state updates aren't
  // synchronous — see advanceRound, which needs the just-merged answers
  // immediately, not next render's stale closure).
  // `descriptionOverride` is `eligOverride` one field over, and it exists for
  // the identical reason (wsDL): `advanceRound` may extend the description with
  // the founder's Pool P answer and then call the memo in the SAME TICK, so a
  // closure reading `description` state would send the box as it stood before
  // the round -- i.e. would drop the answer this whole feature exists to
  // collect, silently, on exactly the founders who have nothing else.
  const basePayload = (eligOverride?: EligibilityAnswers, descriptionOverride?: string) => ({
    company,
    country,
    description: descriptionOverride ?? description,
    capitalSought,
    eligibility: eligOverride ?? elig,
    profileSignal: profileSignalRef.current ?? profileSignal,
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
  async function fetchVerdict(
    eligOverride?: EligibilityAnswers, descriptionOverride?: string,
  ): Promise<Verdict | null> {
    try {
      const res = await fetch("/api/intelligence/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(basePayload(eligOverride, descriptionOverride)),
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
    // ── The description is asked for ONCE, at the moment it is about to be
    // lost ────────────────────────────────────────────────────────────────
    // The box has been optional since it existed, and the notice about what
    // skipping costs sat UNDER the submit — below the fold on a phone, and on
    // a path the founder never had to touch, because the frictionless way past
    // it was the primary button itself. Its "Continue without it" link did not
    // continue anything: it dismissed the warning and left the founder to
    // press Continue anyway. So the single most valuable answer on the screen
    // could be skipped without ever reading why not to.
    //
    // Now the first submit that would throw it away stops, puts the cursor
    // back in the box, and states the cost there. THE BUTTON IS NEVER
    // DISABLED and the stop happens at most once per session: press Continue
    // again, or take the explicit way out beside the box, and the form goes.
    // A form that will not submit is worse than a thin brief.
    if (descriptionThin && !descriptionAsked && !descriptionSkipped) {
      setDescriptionAsked(true);
      descriptionRef.current?.focus();
      descriptionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setError(null);
    setPreparing(true);
    // The screen-one answers, frozen before a single follow-up question is
    // asked. Everything the founder adds from here is, by construction, an
    // answer that arrived late.
    eligBeforeRound.current = { ...elig };
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
    descriptionOverride?: string,
  ) {
    setPreparing(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...basePayload(undefined, descriptionOverride),
          eligibility: eligForRequest,
          candidateInstrumentIds,
          wantProfileSignal,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        round?: GroundedRound | null;
        profileSignal?: ProfileSignal | null;
      };
      if (data.profileSignal) {
        profileSignalRef.current = data.profileSignal;
        setProfileSignal(data.profileSignal);
      }
      // Either half can carry the screen: a founder with no generic gates left
      // still gets the project questions, which is the whole point of 2b.
      const nGeneric = Array.isArray(data.round?.questions) ? data.round.questions.length : 0;
      const nProject = Array.isArray(data.round?.projectQuestions) ? data.round.projectQuestions.length : 0;
      if (!data.round || nGeneric + nProject === 0) {
        // wsDL: the same store, the same hazard. `eligForRequest` is what this
        // round was fetched for, and it is the caller's just-merged object
        // rather than the render-time `elig` this closure would otherwise read.
        await runMemo(undefined, eligForRequest, descriptionOverride);
        return;
      }
      setRound(data.round);
      setRoundAnswers({});
      setProjectPicks({});
      setProjectFreeText({});
      setScreen("adaptive");
    } catch {
      await runMemo(undefined, eligForRequest, descriptionOverride);
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
    // ── AND ONE OF THEM IS NOT A PROJECT ANSWER AT ALL (wsIV) ─────────────
    // Pool P asks the founder to describe their own project, and its answer is
    // the only thing on this screen that is not evidence about a fund. Routed
    // into `description` rather than `projectAnswers` DELIBERATELY, because
    // that is the difference between reaching the writer and reaching the
    // ranking: `semanticFundMatch(req.description)` and `themeRelevance(
    // description, ...)` are taken against this string and against nothing
    // else, and it is 0.6 of the leaf score (THEME_WEIGHT). A ProjectAnswer's
    // own docstring says it is "writer context and ease-scoring input only",
    // which is exactly the reach this answer must not be limited to.
    const describedProject: string[] = [];
    for (const q of round?.projectQuestions ?? []) {
      const choice = projectPicks[q.id];
      const free = projectFreeText[q.id]?.trim();
      // An open question has no options, so its answer is only ever the prose
      // box. Reading `choice` for one would produce an empty answer and drop
      // it silently, which is the whole class of defect wsBL catalogued.
      const answer = q.openText
        ? free
        : choice === NONE_OF_THESE ? (free || NONE_OF_THESE) : (choice || free);
      if (!answer) continue;
      if (q.id.startsWith(PROJECT_ANSWER_PREFIX)) { describedProject.push(answer); continue; }
      picked.push({
        questionId: q.id,
        question: q.question,
        answer,
        instrumentId: q.instrumentId,
        instrumentName: q.instrumentName,
        gateKey: q.gateKey,
        quote: q.quote,
        locator: q.locator,
        openKey: q.openKey,
      });
    }
    const allProjectAnswers = [...projectAnswers, ...picked];
    // Appended, never replaced: a founder who wrote three words and then
    // answered Pool P said both things, and the box they typed into is the one
    // the intake warned them about. Capped by the same constant the form caps
    // at, so a long answer cannot make the request larger than one a founder
    // could have typed in the first place.
    const nextDescription = [description.trim(), ...describedProject]
      .filter(Boolean).join("\n\n").slice(0, MAX_DESCRIPTION_CHARS);
    setProjectAnswers(allProjectAnswers);
    setProjectPicks({});
    setProjectFreeText({});
    setElig(merged);
    setDescription(nextDescription);
    setRound(null);
    const nextCount = roundCount + 1;
    setRoundCount(nextCount);
    if (nextCount >= MAX_ROUNDS) {
      await runMemo(allProjectAnswers, merged, nextDescription);
      return;
    }
    setPreparing(true);
    try {
      const v = await fetchVerdict(merged, nextDescription);
      setRoutesInPlay(v?.instrumentTable?.length ?? 0);
      await fetchRound(merged, v?.candidateInstrumentIds ?? [], false, nextDescription);
    } finally {
      setPreparing(false);
    }
  }

  // Stream the memo.
  //
  // It used to take a `clarifications` array as its first parameter and all
  // three call sites passed `[]`. Removed with the field itself (wsFT): the
  // follow-up round reaches the memo through `eligOverride` and
  // `projectOverride`, which are the two threaded here for exactly that reason.
  //
  // `projectOverride` exists because advanceRound() calls this in the same
  // tick as setProjectAnswers(), so the state hasn't flushed yet.
  // ── wsDL: `eligOverride` is the SAME defect as `projectOverride`, one store
  // over, and it was live on every single brief.
  //
  // `advanceRound` merges the adaptive round's answers, calls `setElig(merged)`
  // and then calls this in the same tick. React state is not what a closure
  // reads: `basePayload()` re-read the render-time `elig`, i.e. the answers as
  // they stood BEFORE the round. MAX_ROUNDS is 1, so `nextCount >= MAX_ROUNDS`
  // is taken every time and the memo was written from the first screen alone —
  // the entire adaptive round, the thing the funnel exists for, reached
  // `/api/intelligence/intake` and never reached `/api/intelligence`.
  //
  // The comment above `projectOverride` states this hazard exactly and was
  // acted on for project answers only. The eligibility half kept the bug.
  //
  // Fixed by threading, not by an effect: an effect would make the request's
  // contents depend on render timing, which is the same class of defect with a
  // longer fuse.
  async function runMemo(
    projectOverride?: ProjectAnswer[],
    eligOverride?: EligibilityAnswers,
    descriptionOverride?: string,
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
          ...basePayload(eligOverride, descriptionOverride),
          projectAnswers: projectOverride ?? projectAnswers,
          // The second answer object. Omitted entirely when the founder never
          // reached a follow-up screen, because absent means "nothing is late"
          // and an empty object would say the same thing less clearly.
          eligibilityBeforeRound: eligBeforeRound.current ?? undefined,
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

  const inputCls =
    "w-full min-h-11 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] px-4 py-2.5 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none transition-colors focus:border-[var(--primary)]";
  const nextBtn =
    "rounded-[var(--radius)] border border-[var(--primary)] px-6 py-2.5 font-semibold uppercase tracking-[0.06em] text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50";
  const backBtn =
    "text-sm font-medium text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--primary)] hover:underline";
  const fieldLabel = "mb-1.5 flex items-center font-semibold";

  return (
    <section className="mx-auto max-w-3xl print:max-w-none print:p-0">
      <div className="print:hidden text-[var(--foreground)]">
        {/* The pitch belongs on the way in, not in the middle. Past screen 1
            the founder has already bought the premise; repeating the headline
            and the "one short screen, then a memo" explainer above their
            questions is the product selling to someone already in the room. */}
        {screen === "intake" && !running && !report && (
          <>
            <h2 className="text-2xl font-semibold leading-tight sm:text-3xl" style={serif}>
              Map your raise to the public capital that fits
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--foreground)]">
              Two minutes of questions. One memo with comparables, screened institutions,
              positioning and next moves.
            </p>
          </>
        )}

        {/* ── Intake: the form and its live preview panel, side by side ── */}
        {screen === "intake" && !running && (
          <form
            onSubmit={(e) => { e.preventDefault(); void handleContinue(); }}
            className="mt-6 space-y-5 rounded-[var(--radius)] border border-[var(--border)] border-t-2 border-t-[var(--primary)] bg-[var(--paper)]/80 p-5 shadow-[0_12px_36px_rgba(16,32,63,0.06)] sm:p-7"
          >
            <label className="block text-sm">
              <span className={fieldLabel}>
                Your company
              </span>
              <input value={company} onChange={(e) => setCompany(e.target.value)} required
                placeholder="e.g. Vyoma" className={inputCls} />
            </label>

            <div className="space-y-5">
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
                {/* `flex-wrap` on THIS label only. `fieldLabel` is a
                    non-wrapping flex row, which is right for the short captions
                    that share it and wrong for the longest one on the screen: at
                    390px the question and its qualifier were squeezed into two
                    ragged columns with the info dot shoved to the far edge. */}
                <span className={fieldLabel + " flex-wrap gap-x-1"}>
                  What are you building?
                  <span className="font-normal text-[var(--muted-foreground)]">(a sentence or two)</span>
                  <InfoDot>
                    Describe the project the money would fund, not the company tagline.
                  </InfoDot>
                </span>
                <textarea ref={descriptionRef}
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  rows={5} maxLength={MAX_DESCRIPTION_CHARS}
                  placeholder={"e.g. We build collision-avoidance software for satellite operators. "
                    + "The project would develop an onboard autonomous manoeuvring system and fly it "
                    + "on a demonstrator."}
                  /* Five rows, not three. The example IS the instruction on
                     this field, and at 390px three rows cut it off mid-sentence:
                     the founder saw half a sample answer and no full stop. Sized
                     so the whole of it fits on the narrowest screen we render
                     for. The box being visibly bigger than a line is also the
                     cheapest honest signal that a paragraph is what helps, which
                     is the entire finding this screen is built around. */
                  className={inputCls + " min-h-[8.5rem] resize-y leading-relaxed"} />
                {/* Two thresholds, two different truths, so neither line ever
                    overstates: under MIN_MATCHABLE the description is discarded
                    outright and the ranking really is sector-only, under USEFUL
                    it is embedded but scores nearly everything alike.

                    Written as GUIDANCE, not as a warning. "Too short" tells a
                    founder they are wrong and leaves them there. The three
                    things named instead are the three that actually separate
                    one fund from another in the demand text we match against,
                    so a founder who reads the line can act on it. */}
                {descriptionLength > 0 && descriptionThin && (
                  <span className="mt-1.5 block text-xs leading-relaxed text-[var(--muted-foreground)]">
                    {descriptionUnmatchable
                      ? "Too short to match on yet. What problem, for whom, and what the project itself would build or prove."
                      : "Keep going: what problem, for whom, and what the project itself would build or prove."}
                  </span>
                )}
              </label>

              {/* ── What an empty box costs, said where it can still be fixed ─
                  This used to sit under the submit, at the bottom of a long
                  form, on a path no founder had to touch: the frictionless way
                  past it was the primary button itself, and its "Continue
                  without it" link continued nothing — it dismissed the warning
                  and left the founder to press Continue anyway. A cost stated
                  where nobody is looking is not a cost anybody pays attention
                  to.

                  It now appears only after a submit has been stopped once
                  (`descriptionAsked`), directly under the box the founder has
                  just been returned to, with the way out on the same line of
                  sight as the way forward. OUTSIDE the <label> deliberately: a
                  button inside it would also focus the textarea on click.

                  The skip really skips. `setDescriptionSkipped` then
                  `handleContinue` in one tick is the same-tick state hazard
                  this file has been burned by three times, and it is safe here
                  for a reason worth stating rather than assuming: the gate in
                  `handleContinue` cannot fire because `descriptionAsked` is
                  already committed, so the closure never needs to see the
                  `descriptionSkipped` it cannot see. */}
              {descriptionAsked && descriptionThin && !descriptionSkipped && !preparing && (
                <div className="rounded-[var(--radius)] border border-[var(--border)] border-l-2 border-l-[var(--primary)] bg-[var(--muted)]/40 px-4 py-3">
                  {/* contract: the two figures are a MEASUREMENT and not a manner
                      of speaking, so they are replaced when a better measurement
                      of the same quantity exists — and one now does.

                      WHAT WAS HERE, AND WHY IT WENT (wsIT, 2026-08-19). This
                      said 48.9% against 21.3%, from
                      `scripts/measure_description_lift.ts`. That harness is
                      paired and leak-checked and its DESIGN was never the
                      problem; two things underneath it were. It runs on
                      `__recallSetEnriched.json`, which this repo's own
                      RETIRED_RECALL_SETS lists as retired, and it ranks through
                      `computeVerdict`, which returns
                      `instrumentTable.slice(0, DISPLAY_CAP)` and never calls
                      `orderMemoCandidates` — so it measured the instrument
                      table, not the rows a founder is shown, and left out the
                      precedence stack `rank_shape_wsGY` prices at +7.2 points.
                      A 27.6-point claim was on this screen for a path no
                      founder reads.

                      The figures below are the same question asked on the
                      shipped path, on the active answer key, over the same 897
                      founders with the same intake answers, ranked twice:
                      `project-mgmt/findings/descriptions_wsIT/`, arms `full`
                      and `none`, paired delta -4.76 EXACT@6 [-7.33, -2.20],
                      McNemar z=3.61, clears its sign-flip null, sign holds in
                      96 of 96 leave-one-regime-out folds. The second pair is
                      the founders whose description was about the project the
                      money was for: -9.55 [-13.18, -6.14], z=5.09, 29 of 29
                      folds. Both are in USEFUL_DESCRIPTION_CHARS in types.ts,
                      which is where they come from and where they must be
                      changed. A product measurement, not a corpus one: it moves
                      when the ranker moves, not when the ETL runs. */}
                  <p className="text-[13px] leading-relaxed text-[var(--foreground)]">
                    {descriptionUnmatchable
                      ? "Without a description the thematic half of the ranking switches off, and we find the right fund several points less often."
                      : "A line this short is close to the point where the thematic half stops separating one fund from another."}
                    {" "}
                    <span className="text-[var(--muted-foreground)]">
                      Ranked both ways on 897 companies whose funding is on record — the same
                      companies, the same answers — a description of the project put the fund they
                      actually won in these rows 38.9% of the time, against 34.6% with the box left
                      empty. For the founders whose description was about the project the money was
                      for, 52% against 42%.
                    </span>
                  </p>
                  <button type="button"
                    onClick={() => { setDescriptionSkipped(true); void handleContinue(); }}
                    className="mt-2 text-[13px] font-medium text-[var(--muted-foreground)] underline underline-offset-2 hover:text-[var(--foreground)]">
                    Continue anyway
                  </button>
                </div>
              )}
              {/* Country and region share a column and read as one "where are
                  you" block. They stay SEPARATE labels: two selects inside one
                  label leaves the caption ambiguous, so clicking "Incorporated
                  in" can focus the region control and a screen reader announces
                  the wrong question. */}
              <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm">
                <span className={fieldLabel}>
                  Incorporated in
                </span>
                <select value={country} onChange={(e) => setCountry(e.target.value)}
                  className={inputCls + (country ? "" : " text-[var(--muted-foreground)]")}>
                  <option value="" className="bg-[var(--paper)] text-[var(--foreground-soft)]">Select…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c} className="bg-[var(--paper)] text-[var(--foreground)]">{c}</option>
                  ))}
                </select>
              </label>
                {/* Hidden entirely for countries the NUTS table does not cover
                    (GB, MD and the non-EU entries in COUNTRIES) — an empty
                    select is worse than no question. */}
                {regionChoices.length > 0 && (
                  <label className="block text-sm">
                    <span className={fieldLabel}>
                      Region
                      <InfoDot>
                        Many schemes fund only activity in their region.
                      </InfoDot>
                    </span>
                    <select
                      value={elig.region ?? ""}
                      onChange={(e) => {
                        // The founder has taken ownership of this field. Nothing
                        // derived may write it again for the rest of the session.
                        setRegionTouched(true);
                        setRegionPrefill(null);
                        setElig((p) => ({ ...p, region: e.target.value || undefined }));
                      }}
                      className={inputCls + (elig.region ? "" : " text-[var(--muted-foreground)]")}>
                      <option value="" className="bg-[var(--paper)] text-[var(--foreground-soft)]">
                        Select…
                      </option>
                      {regionChoices.map((r) => (
                        <option key={r.value} value={r.value}
                          className="bg-[var(--paper)] text-[var(--foreground)]">{r.label}</option>
                      ))}
                    </select>
                    {/* Where the answer came from, stated plainly. A default
                        whose origin is invisible reads as something the founder
                        typed, and a registered address is often not where the
                        work will happen — so correcting it has to be the
                        obvious move, not something they would only do if they
                        distrusted us. */}
                    {regionPrefill && !regionTouched && (
                      <span className="mt-1 block text-xs leading-snug text-[var(--muted-foreground)]">
                        From {regionPrefill.matchedName}&rsquo;s registered
                        address. Change it if the work happens elsewhere.
                      </span>
                    )}
                  </label>
                )}

              </div>
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
                targetMarkets (a heavy country multi-select for 34 instruments).
                "the adaptive round asks when it matters" was here and was
                FALSE (wsIK): the round asks fields of EligibilityAnswers and
                targetMarkets was never one, so nothing in the product could
                ever ask it. It is now deleted rather than unasked — see
                founderCountryList for the measurement and for why a future
                "where do you want to raise" must union rather than override.
                Hard ceiling of eight: a longer first screen reads as an
                interrogation and is where founders leave. ── */}

            <div className="text-sm">
              <label>
                <span className="mb-1.5 block font-semibold">Sector</span>
                <select
                  value={elig.sector ?? ""}
                  onChange={(e) => setElig((p) => ({ ...p, sector: e.target.value || undefined }))}
                  className={inputCls + (elig.sector ? "" : " text-[var(--muted-foreground)]")}
                >
                  <option value="">Select the closest sector…</option>
                  {SECTOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
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
              </span>
              <CompactMultiSelect
                options={USE_OF_FUNDS_OPTIONS}
                value={elig.useOfFunds ?? []}
                placeholder="Select all relevant uses…"
                onToggle={(v) => setElig((p) => ({
                  ...p,
                  useOfFunds: (p.useOfFunds ?? []).includes(v)
                    ? (p.useOfFunds ?? []).filter((x) => x !== v)
                    : [...(p.useOfFunds ?? []), v],
                }))}
              />
            </div>

            {/* The single most decisive question the intake used to omit: 585
                gates across 266 instruments turn on eligible costs, 59 of them
                hard filters. Placed on screen 1 rather than the adaptive round
                because it was already reaching founders as a BLOCKER we had
                the means to clear — three briefs told a founder to "reframe
                the project as applied research" for want of asking. */}
            

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="text-sm">
                <label>
                  <span className="mb-1.5 block font-semibold">
                    How much are you looking for?
                  {/* contract: the two figures are band edges from TICKET_BANDS
                      (lib/intelligence/types.ts — b15m_50m and b100k_500k), the
                      vocabulary contract this control is built from, not claims
                      about the corpus. They move when a band moves. */}
                  </span>
                  <select
                    value={elig.ticketBand ?? ""}
                    onChange={(e) => setElig((p) => ({
                      ...p,
                      ticketBand: (e.target.value || undefined) as EligibilityAnswers["ticketBand"],
                    }))}
                    className={inputCls + (elig.ticketBand ? "" : " text-[var(--muted-foreground)]")}
                  >
                    <option value="">Select an amount…</option>
                    {TICKET_BANDS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="text-sm">
                <span className="mb-2 flex items-center font-semibold">
                  Capital you want
                </span>
                <CapitalSelect value={capitalSought} onToggle={toggleCapital}
                  onToggleAll={toggleAllCapital} all={allCapital} />
              </div>
            </div>

            <details className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                Organisation details <span className="font-normal text-[var(--muted-foreground)]">(optional)</span>
              </summary>
              <div className="grid gap-5 border-t border-[var(--border)] px-4 py-4 sm:grid-cols-2">
              <div className="text-sm">
                <span className="mb-2 block font-semibold">Team size</span>
                <Chips options={[
                  { value: "1-9", label: "1–9" }, { value: "10-49", label: "10–49" },
                  { value: "50-249", label: "50–249" }, { value: "250+", label: "250+" },
                ]} value={elig.fteBand} onPick={(v) => setElig((p) => ({ ...p, fteBand: v }))} />
              </div>
              {/* ── What kind of organisation are you ────────────────────
                  The largest demand in the corpus the intake never asked:
                  484 filter gates on 370 publishable instruments, and 28 of
                  the 36 multi-leaf regimes hold siblings demanding DIFFERENT
                  kinds. Not a size question — see organisationType.ts for
                  the property and why `fteBand` is a different one.

                  It sits BESIDE TEAM SIZE, which is deliberate on a screen
                  where the two are the questions most easily confused: seeing
                  them as two controls is the clearest possible statement that
                  they are two questions. It went in the narrow country column
                  first and the five labels wrapped to two lines each; a
                  question a founder has to read twice has already failed.

                  Like region, it ARRIVES ANSWERED —
                  read straight off the name in the first field, because
                  company law requires the legal form to be in it. That is
                  what pays for the question. The origin is stated on screen
                  and the founder's edit wins outright. ── */}
              {ORGANISATION_TYPE_ARM === "on" && (
                <div className="text-sm">
                  <span className={fieldLabel}>
                    What kind of organisation
                    <InfoDot>
                      Legal form, not team size.
                    </InfoDot>
                  </span>
                  <Chips options={[...ORGANISATION_TYPE_OPTIONS]}
                    value={elig.organisationType}
                    onPick={(v) => { setOrgTypeTouched(true);
                      setElig((p) => ({ ...p, organisationType: v })); }} />
                  {orgTypePrefill && !orgTypeTouched
                    && elig.organisationType === orgTypePrefill && (
                    <span className="mt-1 block text-xs leading-snug text-[var(--muted-foreground)]">
                      From the legal form in your company name. Change it if
                      that is not what you are.
                    </span>
                  )}
                </div>
              )}
              </div>
            </details>

            <div className="text-sm">
              <label>
                <span className="mb-1.5 block font-semibold">Where is the product today?</span>
                <select
                  value={elig.developmentStage ?? ""}
                  onChange={(e) => setElig((p) => ({
                    ...p,
                    developmentStage: e.target.value || undefined,
                  }))}
                  className={inputCls + (elig.developmentStage ? "" : " text-[var(--muted-foreground)]")}
                >
                  <option value="">Select the current stage…</option>
                  <option value="research">Research / concept</option>
                  <option value="prototype">Working prototype</option>
                  <option value="pilot_customers">Pilots with customers</option>
                  <option value="scaling_revenue">Scaling with revenue</option>
                </select>
              </label>
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
            </div>

            {/* ── Why the button just did nothing ──────────────────────────
                A stopped submit that says nothing at the button is a dead
                button, and a dead button is how a founder leaves. So the one
                time the description gate fires, the reason and the way through
                are both stated right here, where the click happened, while the
                cost itself is stated up at the box that fixes it.

                THE BUTTON IS NEVER DISABLED FOR A MISSING DESCRIPTION and the
                stop happens at most once: `descriptionAsked` is latched by the
                time this renders, so pressing Continue again submits. */}
            {descriptionAsked && descriptionThin && !descriptionSkipped && !preparing && (
              <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                We stopped once to ask about what you are building, at the top of the form.
                Press Continue again to go on without it.
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
                Scoping done. We ran your answers against the register
                {routesInPlay > 0 ? (
                  <>
                    : <strong>{routesInPlay} route{routesInPlay === 1 ? "" : "s"}</strong>{" "}
                    in play
                  </>
                ) : null}
                .
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
                      {/* `optionsFor` before `options`, as FIELD_ENUM_HINTS says
                          consumers must. This read hint.options only, and for
                          `region` that list is EMPTY BY DESIGN — a fixed list of
                          449 European regions is not a question anyone answers,
                          so the options are derived from the founder's country.
                          The server supplies model-written labels only when it
                          could label EVERY derived option (adaptiveRound's
                          `coversAll`), which for a country with dozens of NUTS
                          regions essentially never holds. So a region question
                          rendered as a stem with no buttons: asked, unanswerable,
                          and silent about it. */}
                      {(q.options?.length
                        ? q.options
                        : hint.optionsFor?.(elig) ?? hint.options).map((o) => {
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
                        {q.openText ? (
                          // No options by construction: this requirement has
                          // no fixed answer set and never will, because the
                          // answer is a description of the project. Two or
                          // three sentences, judged against the quote above.
                          <textarea
                            value={projectFreeText[q.id] ?? ""}
                            onChange={(e) => setProjectFreeText((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            rows={3}
                            placeholder="Two or three sentences, in your own words."
                            className={inputCls + " mt-1 resize-y"}
                          />
                        ) : (
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
                        )}
                        {!q.openText && picked === NONE_OF_THESE && (
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

      {report && <Memo key={report.generatedAt} report={report} corpusWindow={corpusWindow} />}
    </section>
  );
}
