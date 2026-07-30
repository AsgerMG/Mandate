"use client";

import { useEffect, useRef, useState } from "react";
import {
  BriefExpectation,
  BriefInput,
  BriefResult,
  BriefSources,
  Meta,
  ScopingQuestion,
  downloadPdf,
  getBriefExpectation,
  getMeta,
  postBrief,
  postQuestions,
} from "@/lib/api";
import {
  Eta,
  FALLBACK_EXPECTATION,
  computeEta,
  formatExpectation,
  formatRemaining,
} from "@/lib/eta";
import LiveProgress from "./LiveProgress";
import { drawFaviconDone, drawFaviconProgress, restoreFavicon } from "@/lib/favicon";
import { Fragment } from "react";
import ProgressRail, { TimedSubStage } from "./ProgressRail";
import { ReportCoverage, ReportMarkdown, splitAppendix } from "./Report";

type Step = "profile" | "questions" | "report";

// why_it_matters text uses *italic* markdown for defined terms (see
// etl/intelligence/questions.py) — render it rather than showing raw asterisks.
function withEmphasis(text: string) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((p, i) =>
    /^\*[^*]+\*$/.test(p) ? <em key={i}>{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>
  );
}

// Order in which scoping groups appear; a group is skipped entirely when no
// question in it survived core_questions()'s conditional logic (e.g. "AI
// role" for a company that doesn't use AI). LLM-generated extras always land
// in "more" (see questions.py parse_extras_response).
const GROUP_ORDER = ["business", "users_data", "ai", "context", "more"];
const GROUP_LABELS: Record<string, string> = {
  business: "About your business",
  users_data: "Users & data",
  ai: "AI role",
  context: "Market context",
  more: "A few more, specific to you",
};

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export default function BriefPage() {
  const [step, goToStep] = useState<Step>("profile");
  const [meta, setMeta] = useState<Meta | null>(null);

  // Rail timing: a live-ticking clock for the current AI sub-stage's
  // elapsed display, and the moment generation actually finished (freezes
  // the last sub-stage's timer instead of letting it tick after the report
  // is already on screen). Only LLM-call sub-stages show a timer at all —
  // see ProgressRail.tsx's LLM_CALL_STAGES.
  const [reportEndedAt, setReportEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Step 1 — profile
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>(["EU"]);
  const [usesAi, setUsesAi] = useState(false);
  const [personalData, setPersonalData] = useState(false);

  // Step 2 — scoping, paginated by group
  const [questions, setQuestions] = useState<ScopingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [groupIndex, setGroupIndex] = useState(0);
  // For text questions with suggested_answers: which presets are picked and
  // what extra detail was typed, tracked separately from `answers` (which
  // only ever holds the combined string actually sent to the backend) so
  // chip state survives navigating Back/Next between groups.
  const [suggestionSelections, setSuggestionSelections] = useState<Record<string, string[]>>({});
  const [detailText, setDetailText] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BriefResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Report generation — separate from `loading` since it drives a dedicated
  // progress screen (see the "report" step below) rather than a button label.
  const [generating, setGenerating] = useState(false);
  const [subStages, setSubStages] = useState<TimedSubStage[]>([]);

  // --- the wait (see project-management/brief-ux-plan.md) ------------------
  // Streamed report text, what this run is reading, and the measured latency the
  // opening promise is made from. `draftChars` rather than the text length is
  // tracked separately because the ETA needs a monotonic count even across the
  // draft→revision handover, where the text itself restarts.
  const [expectation, setExpectation] = useState<BriefExpectation | null>(null);
  const [liveText, setLiveText] = useState("");
  const [draftChars, setDraftChars] = useState(0);
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [genStartedAt, setGenStartedAt] = useState<number | null>(null);
  const [sources, setSources] = useState<BriefSources | null>(null);
  const [notifyOnDone, setNotifyOnDone] = useState(false);

  useEffect(() => {
    getMeta().then(setMeta).catch(() => setError("The report tool is temporarily unavailable — please try again shortly."));
  }, []);

  // Single shared clock driving every live-ticking elapsed display in
  // ProgressRail (the current macro step and, once report generation
  // starts, the current AI sub-stage) — one interval instead of one per
  // row. Stops once the finished report is on screen (the rail is hidden
  // there — nothing left to tick).
  const finished = Boolean(result) && !generating;
  useEffect(() => {
    if (finished) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [finished]);

  // Measured, not hardcoded: the promise on screen must move when the pipeline
  // does. Falls back to the panel baseline if the API is unreachable.
  useEffect(() => {
    getBriefExpectation().then((e) => e && setExpectation(e));
  }, []);

  // Held in a ref so each estimate can be clamped against the last one shown —
  // an ETA that rises reads as a broken promise (observed live 2026-07-30).
  const lastRemaining = useRef<number | null>(null);
  if (!generating) lastRemaining.current = null;
  const eta: Eta | null = generating
    ? computeEta({
        expectation: expectation ?? FALLBACK_EXPECTATION,
        previousRemaining: lastRemaining.current,
        charsSoFar: draftChars,
        streamingSeconds: streamStartedAt ? (now - streamStartedAt) / 1000 : 0,
        elapsedSeconds: genStartedAt ? (now - genStartedAt) / 1000 : 0,
        correcting: subStages.some(
          (s) => s.stage === "verifying" || s.stage === "cross-checking"
        ),
      })
    : null;
  if (eta?.remainingSeconds != null) lastRemaining.current = eta.remainingSeconds;

  // Ambient tab-away signal. The cheapest one that exists, needs no permission,
  // and is the test of whether the rail has to be watched at all: the tab alone
  // should tell you enough. (brief-ux-plan.md Phase C1)
  useEffect(() => {
    const base = "Regina";
    if (generating) {
      const left = formatRemaining(eta?.remainingSeconds ?? null);
      document.title = `${left ? `(${left}) ` : ""}Drafting your brief · ${base}`;
    } else if (result) {
      document.title = `✓ Your brief is ready · ${base}`;
    } else {
      document.title = base;
    }
    return () => {
      document.title = base;
    };
  }, [generating, result, eta?.remainingSeconds]);

  // The ambient layer: the tab carries progress so the page doesn't have to be
  // watched. Same ring geometry as the rail, drawn at 32px. (Phase C1)
  useEffect(() => {
    if (generating) {
      drawFaviconProgress(eta?.progress ?? null, Math.floor(now / 1000));
    } else if (result) {
      drawFaviconDone();
    } else {
      restoreFavicon();
    }
    return () => {
      if (!generating && !result) restoreFavicon();
    };
  }, [generating, result, eta?.progress, now]);

  // One notification, on completion, only if the user asked for it. Progress
  // milestones deliberately fire none — the interrupt budget is finite and there
  // are no mid-run decisions to make.
  useEffect(() => {
    if (!result || generating || !notifyOnDone) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification("Your brief is ready", {
      body: `${name || "Your company"} — regulatory brief complete.`,
      tag: "regina-brief",
    });
  }, [result, generating, notifyOnDone, name]);

  async function askToNotify() {
    if (typeof Notification === "undefined") return;
    // Requested only on an explicit click, never on page load.
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    setNotifyOnDone(permission === "granted");
  }

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  // Combines picked suggestion chips with free-typed detail into the single
  // string that actually travels to the backend as this question's answer.
  const setTextAnswer = (qid: string, selected: string[], detail: string) =>
    setAnswers({ ...answers, [qid]: [...selected, detail.trim()].filter(Boolean).join(". ") });

  function baseInput(): BriefInput {
    return {
      name,
      description,
      sectors,
      markets,
      uses_ai: usesAi,
      handles_personal_data: personalData,
    };
  }

  function scopedInput(): BriefInput {
    // Core question ids map straight onto profile fields; anything else
    // travels in the free-form answers bag.
    const input = baseInput();
    const extra: Record<string, string> = {};
    for (const q of questions) {
      const a = answers[q.id];
      if (a === undefined || a === "" || (Array.isArray(a) && a.length === 0)) continue;
      if (q.id === "data_categories") input.data_categories = Array.isArray(a) ? a : [a];
      else if (q.id === "company_size") input.company_size = String(a);
      else if (q.id === "ai_role") input.ai_role = String(a);
      else if (q.id === "monthly_eu_users") input.monthly_eu_users = String(a);
      else if (q.id === "customer_type") input.customer_type = String(a);
      else extra[q.id] = Array.isArray(a) ? a.join(", ") : String(a);
    }
    input.answers = extra;
    return input;
  }

  async function startScoping(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await postQuestions(baseInput());
      if (r.questions.length === 0) {
        await generateReport();
        return;
      }
      setQuestions(r.questions);
      setGroupIndex(0);
      goToStep("questions");
    } catch {
      setError("Request failed. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  async function generateReport() {
    goToStep("report");
    setResult(null);
    setGenerating(true);
    setError(null);
    setSubStages([]);
    setReportEndedAt(null);
    setLiveText("");
    setDraftChars(0);
    setStreamStartedAt(null);
    setSources(null);
    setGenStartedAt(Date.now());
    try {
      const r = await postBrief(
        scopedInput(),
        (s) => {
          setSubStages((prev) => [...prev, { ...s, at: Date.now() }]);
          // Each generation call writes a WHOLE new document, so the visible text
          // resets at the start of one while `draftChars` keeps accumulating — the
          // ETA needs a monotonic total, the reader needs one coherent document.
          // This is the First reading → Committee markup handover made literal.
          if (s.stage === "drafting" || s.stage === "sharpening") setLiveText("");
        },
        (text) => {
          setStreamStartedAt((prev) => prev ?? Date.now());
          setDraftChars((prev) => prev + text.length);
          setLiveText((prev) => prev + text);
        },
        (found) => setSources(found)
      );
      setResult(r);
    } catch {
      setError("Report generation failed. Is the API running?");
      // Back to wherever the user came from — their answers are untouched in
      // state, so this doesn't cost them any of the scoping work they did.
      goToStep(questions.length > 0 ? "questions" : "profile");
    } finally {
      setReportEndedAt(Date.now());
      setGenerating(false);
    }
  }

  async function onDownload() {
    if (!result?.briefing) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadPdf(name, result.briefing, result.citations);
    } catch {
      setError("PDF download failed.");
    } finally {
      setDownloading(false);
    }
  }

  const isAnswered = (q: ScopingQuestion) => {
    const a = answers[q.id];
    return a !== undefined && a !== "" && (!Array.isArray(a) || a.length > 0);
  };
  const answered = questions.filter(isAnswered).length;

  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    questions: questions.filter((q) => (q.group ?? "more") === key),
  })).filter((g) => g.questions.length > 0);
  const currentGroup = groups[groupIndex];
  const isLastGroup = groupIndex === groups.length - 1;

  return (
    <>
      <section className="page-head">
        <p className="eyebrow">Regulatory intelligence report</p>
        <h1>Know what applies before it applies to you</h1>
        <p>
          Regina turns the official EU, French and German regulatory record into a
          source-cited intelligence report — not a generic AI summary. Describe your company,
          answer a few scoping questions, and get an analyst-grade report, exportable as PDF.
        </p>
      </section>

      {!(step === "report" && result && !generating) && (
        <div className="brief-layout">
          <div className="brief-main">
            {step === "profile" && (
              <form className="form" onSubmit={startScoping}>
                <div className="field">
                  <label>Company name</label>
                  <input type="text" value={name} required onChange={(e) => setName(e.target.value)} />
                </div>

                <div className="field">
                  <label>
                    What does it do?{" "}
                    <span className="hint">— products, business model, how you use data/AI</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. We provide automated credit-scoring software to consumer lenders across the EU."
                  />
                </div>

                {meta && (
                  <div className="field">
                    <label>Sectors</label>
                    <div className="chips">
                      {meta.sectors.map((s) => (
                        <span
                          key={s.slug}
                          className={`chip ${sectors.includes(s.slug) ? "on" : ""}`}
                          onClick={() => toggle(sectors, s.slug, setSectors)}
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="field">
                  <label>Markets</label>
                  <div className="chips">
                    {(meta?.jurisdictions ?? ["EU"]).map((j) => (
                      <span
                        key={j}
                        className={`chip ${markets.includes(j) ? "on" : ""}`}
                        onClick={() => toggle(markets, j, setMarkets)}
                      >
                        {j}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <div className="checks">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={usesAi}
                        onChange={(e) => setUsesAi(e.target.checked)}
                      />
                      Develops or deploys AI
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={personalData}
                        onChange={(e) => setPersonalData(e.target.checked)}
                      />
                      Handles personal data
                    </label>
                  </div>
                </div>

                <button className="btn" type="submit" disabled={loading || !name}>
                  {loading ? "Preparing questions…" : "Continue"}
                </button>
              </form>
            )}

            {step === "questions" && currentGroup && (
              <div className="form">
                <div className="substepper">
                  <div className="substepper-head">
                    <span className="stepper-label">
                      Scoping · {groupIndex + 1} of {groups.length}
                    </span>
                    <span className="substepper-name">{currentGroup.label}</span>
                  </div>
                  <div className="stepper-track substepper-track">
                    {groups.map((g, i) => (
                      <span key={g.key} className={i < groupIndex ? "done" : i === groupIndex ? "current" : ""} />
                    ))}
                  </div>
                </div>

                <p className="muted" style={{ marginTop: 0 }}>
                  These thresholds decide which instruments actually apply to <strong>{name}</strong>.
                  Skip anything you don&apos;t know — the report will treat it as unconfirmed.
                </p>

                {currentGroup.questions.map((q) => (
                  <div className="field question" key={q.id}>
                    <label>{q.question}</label>
                    <p className="why">{withEmphasis(q.why_it_matters)}</p>
                    {q.kind === "text" ? (
                      q.suggested_answers && q.suggested_answers.length > 0 ? (
                        <div className="text-with-suggestions">
                          <div className="chips suggestions">
                            {q.suggested_answers.map((sugg) => {
                              const selected = suggestionSelections[q.id] ?? [];
                              const on = selected.includes(sugg);
                              return (
                                <span
                                  key={sugg}
                                  className={`chip suggestion ${on ? "on" : ""}`}
                                  onClick={() => {
                                    const next = on
                                      ? selected.filter((x) => x !== sugg)
                                      : [...selected, sugg];
                                    setSuggestionSelections({ ...suggestionSelections, [q.id]: next });
                                    setTextAnswer(q.id, next, detailText[q.id] ?? "");
                                  }}
                                >
                                  {sugg}
                                </span>
                              );
                            })}
                          </div>
                          <textarea
                            className="detail"
                            value={detailText[q.id] ?? ""}
                            placeholder={q.placeholder ?? "Anything to add? (optional)"}
                            onChange={(e) => {
                              const detail = e.target.value;
                              setDetailText({ ...detailText, [q.id]: detail });
                              setTextAnswer(q.id, suggestionSelections[q.id] ?? [], detail);
                            }}
                          />
                        </div>
                      ) : (
                        <textarea
                          value={(answers[q.id] as string) ?? ""}
                          placeholder={q.placeholder}
                          onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        />
                      )
                    ) : (
                      <div className="option-list">
                        {q.options.map((opt) => {
                          const current = answers[q.id];
                          const on =
                            q.kind === "multi"
                              ? Array.isArray(current) && current.includes(opt)
                              : current === opt;
                          return (
                            <label key={opt} className={`option-row ${on ? "on" : ""}`}>
                              <input
                                type={q.kind === "multi" ? "checkbox" : "radio"}
                                name={q.id}
                                checked={on}
                                onChange={() => {
                                  if (q.kind === "multi") {
                                    const cur = Array.isArray(current) ? current : [];
                                    setAnswers({
                                      ...answers,
                                      [q.id]: on ? cur.filter((x) => x !== opt) : [...cur, opt],
                                    });
                                  } else {
                                    setAnswers({ ...answers, [q.id]: opt });
                                  }
                                }}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}

                <div className="wizard-actions">
                  <button
                    className="btn"
                    onClick={() => (isLastGroup ? generateReport() : setGroupIndex(groupIndex + 1))}
                  >
                    {!isLastGroup
                      ? "Next"
                      : answered < questions.length
                        ? `Generate report (${answered}/${questions.length} answered)`
                        : "Generate report"}
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => (groupIndex === 0 ? goToStep("profile") : setGroupIndex(groupIndex - 1))}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {step === "report" && (generating || !result) && (
              <LiveProgress
                eta={eta}
                expectation={expectation}
                sources={sources}
                liveText={liveText}
                stage={subStages.length ? subStages[subStages.length - 1].stage : null}
                correcting={subStages.some(
                  (s) => s.stage === "verifying" || s.stage === "cross-checking"
                )}
                writing={draftChars > 0}
                notifyOnDone={notifyOnDone}
                onAskToNotify={askToNotify}
              />
            )}
          </div>
          <ProgressRail
            phase={step}
            scopingGroups={groups.map((g) => ({ key: g.key, label: g.label }))}
            scopingIndex={groupIndex}
            generating={generating}
            reportEndedAt={reportEndedAt}
            subStages={subStages}
            now={now}
          />
        </div>
      )}

      {error && <div className="notice" style={{ marginTop: 20 }}>{error}</div>}

      {step === "report" && result && !generating && (
        <div className="section">
          {result.dry_run && (
            <div className="notice">
              No <code>ANTHROPIC_API_KEY</code> set, so this shows the{" "}
              <strong>retrieved sources</strong> that would ground the report. Add a key and the
              analyst writes the full report with inline citations.
            </div>
          )}

          {result.briefing ? (
            <>
              {/* Closes the loop on why the wait was worth it, from values the
                  API already returned and the UI previously discarded. Includes
                  the consistency-issue count even when it isn't zero — a summary
                  that only ever reports good news isn't a measurement.
                  (brief-ux-plan.md Phase E) */}
              <p className="muted completion-summary">
                {genStartedAt && reportEndedAt && (
                  <>Done in {formatElapsed(Math.round((reportEndedAt - genStartedAt) / 1000))} · </>
                )}
                {result.retrieval_stats?.documents ?? result.passages.length} instruments read ·{" "}
                {result.citations.length} claims cited ·{" "}
                {(result.canon_notes?.length ?? 0) === 0
                  ? "no consistency issues"
                  : `${result.canon_notes?.length} consistency issue${
                      result.canon_notes?.length === 1 ? "" : "s"
                    } flagged`}
              </p>
              <div className="wizard-actions">
                <button className="btn" onClick={onDownload} disabled={downloading}>
                  {downloading ? "Preparing PDF…" : "Download PDF"}
                </button>
                <button
                  className="btn secondary"
                  onClick={() => {
                    setGroupIndex(0);
                    goToStep("questions");
                  }}
                >
                  Adjust answers
                </button>
              </div>
              <div className="report-sheet">
                <ReportMarkdown text={splitAppendix(result.briefing).main} />
              </div>
              <ReportCoverage
                appendix={splitAppendix(result.briefing).appendix}
                citations={result.citations}
              />
            </>
          ) : (
            <div className="sources">
              <h2>Most relevant sources</h2>
              {result.passages.map((p, i) => (
                <div className="source-item" key={i}>
                  <div className="row">
                    <strong>{p.celex || p.title}</strong>
                    <span className="score">{(p.score * 100).toFixed(0)}% match</span>
                  </div>
                  <div className="cited">
                    {p.text.slice(0, 220)}
                    {p.text.length > 220 ? "…" : ""}
                  </div>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer">
                      official text ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
