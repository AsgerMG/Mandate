"use client";

import { useEffect, useState } from "react";
import {
  BriefInput,
  BriefResult,
  BriefStage,
  Meta,
  ScopingQuestion,
  downloadPdf,
  getMeta,
  postBrief,
  postQuestions,
} from "@/lib/api";
import { Fragment } from "react";
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

const STEPS: { key: Step; label: string }[] = [
  { key: "profile", label: "Your company" },
  { key: "questions", label: "Scoping" },
  { key: "report", label: "Report" },
];

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
  const [step, setStep] = useState<Step>("profile");
  const [meta, setMeta] = useState<Meta | null>(null);

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

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BriefResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Report generation — separate from `loading` since it drives a dedicated
  // progress screen (see the "report" step below) rather than a button label.
  const [generating, setGenerating] = useState(false);
  const [stages, setStages] = useState<BriefStage[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    getMeta().then(setMeta).catch(() => setError("The report tool is temporarily unavailable — please try again shortly."));
  }, []);

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

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
      setStep("questions");
    } catch {
      setError("Request failed. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  async function generateReport() {
    setStep("report");
    setResult(null);
    setGenerating(true);
    setError(null);
    setStages([]);
    setElapsedSec(0);
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsedSec(Math.round((Date.now() - startedAt) / 1000)),
      1000
    );
    try {
      const r = await postBrief(scopedInput(), (s) => setStages((prev) => [...prev, s]));
      setResult(r);
    } catch {
      setError("Report generation failed. Is the API running?");
      // Back to wherever the user came from — their answers are untouched in
      // state, so this doesn't cost them any of the scoping work they did.
      setStep(questions.length > 0 ? "questions" : "profile");
    } finally {
      window.clearInterval(timer);
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
        <p className="eyebrow">Regulatory exposure report</p>
        <h1>Know what applies before it applies to you</h1>
        <p>
          Tell us about your company, answer a few scoping questions, and receive an
          analyst-grade report — every claim traced to its official source, exportable as PDF.
        </p>
      </section>

      <div className="stepper brief-width">
        <div className="stepper-head">
          <span className="stepper-label">
            Step {STEPS.findIndex((s) => s.key === step) + 1} of {STEPS.length}
          </span>
          <span className="stepper-name">{STEPS.find((s) => s.key === step)?.label}</span>
        </div>
        <div className="stepper-track">
          {STEPS.map((s, i) => {
            const currentIdx = STEPS.findIndex((x) => x.key === step);
            return (
              <span
                key={s.key}
                className={i < currentIdx ? "done" : i === currentIdx ? "current" : ""}
              />
            );
          })}
        </div>
      </div>

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
                <textarea
                  value={(answers[q.id] as string) ?? ""}
                  placeholder={q.placeholder}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                />
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

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
              onClick={() => (groupIndex === 0 ? setStep("profile") : setGroupIndex(groupIndex - 1))}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {error && <div className="notice" style={{ marginTop: 20 }}>{error}</div>}

      {step === "report" && (generating || !result) && (
        <div className="form generating-panel">
          <div className="generating-head">
            <h2>Generating your report</h2>
            <span className="elapsed">{elapsedSec}s elapsed</span>
          </div>
          <ul className="stage-list">
            {stages.length === 0 && (
              <li className="active">
                <span className="stage-dot" />
                Starting…
              </li>
            )}
            {stages.map((s, i) => (
              <li key={i} className={i === stages.length - 1 ? "active" : "done"}>
                <span className="stage-dot" />
                {s.label}
              </li>
            ))}
          </ul>
          <p className="muted generating-note">
            This typically takes 1–3 minutes. The analyst reads the full text of every applicable
            law rather than summarizing from memory, then rereads its own draft against our
            accuracy checklist before handing it back.
          </p>
        </div>
      )}

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
              <div className="report-actions">
                <button className="btn" onClick={onDownload} disabled={downloading}>
                  {downloading ? "Preparing PDF…" : "Download PDF"}
                </button>
                <button
                  className="btn secondary"
                  onClick={() => {
                    setGroupIndex(0);
                    setStep("questions");
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
