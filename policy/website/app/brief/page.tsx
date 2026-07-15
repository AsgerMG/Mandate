"use client";

import { useEffect, useState } from "react";
import {
  BriefInput,
  BriefResult,
  Meta,
  ScopingQuestion,
  downloadPdf,
  getMeta,
  postBrief,
  postQuestions,
} from "@/lib/api";
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
    try {
      const r = await postBrief(scopedInput(), (s) =>
        setSubStages((prev) => [...prev, { ...s, at: Date.now() }])
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
          EuroPolTracker turns the official EU, French and German regulatory record into a
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
              <div className="form generating-panel">
                <div className="generating-head">
                  <h2>Generating your report</h2>
                </div>
                <p className="muted generating-note">
                  This typically takes 1–3 minutes. The analyst reads the full text of every applicable
                  law rather than summarizing from memory, then rereads its own draft against our
                  accuracy checklist before handing it back.
                </p>
              </div>
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
