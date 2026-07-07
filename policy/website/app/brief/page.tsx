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
import { ReportMarkdown, ReportSources } from "./Report";

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

  // Step 2 — scoping
  const [questions, setQuestions] = useState<ScopingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BriefResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    getMeta().then(setMeta).catch(() => setError("Can't reach the API (`uv run ept serve`)."));
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
      setStep("questions");
    } catch {
      setError("Request failed. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  async function generateReport() {
    setLoading(true);
    setError(null);
    try {
      const r = await postBrief(scopedInput());
      setResult(r);
      setStep("report");
    } catch {
      setError("Report generation failed. Is the API running?");
    } finally {
      setLoading(false);
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

  const answered = questions.filter((q) => {
    const a = answers[q.id];
    return a !== undefined && a !== "" && (!Array.isArray(a) || a.length > 0);
  }).length;

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Regulatory exposure report</p>
        <h1>Know what applies before it applies to you</h1>
        <p>
          Tell us about your company, answer a few scoping questions, and receive an
          analyst-grade report — every claim traced to its official source, exportable as PDF.
        </p>
      </section>

      <div className="stepper">
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

      {step === "questions" && (
        <div className="form">
          <p className="muted" style={{ marginTop: 0 }}>
            These thresholds decide which instruments actually apply to <strong>{name}</strong>.
            Skip anything you don&apos;t know — the report will treat it as unconfirmed.
          </p>

          {questions.map((q) => (
            <div className="field question" key={q.id}>
              <label>{q.question}</label>
              <p className="why">{withEmphasis(q.why_it_matters)}</p>
              {q.kind === "text" ? (
                <input
                  type="text"
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                />
              ) : (
                <div className="chips">
                  {q.options.map((opt) => {
                    const current = answers[q.id];
                    const on =
                      q.kind === "multi"
                        ? Array.isArray(current) && current.includes(opt)
                        : current === opt;
                    return (
                      <span
                        key={opt}
                        className={`chip ${on ? "on" : ""}`}
                        onClick={() => {
                          if (q.kind === "multi") {
                            const cur = Array.isArray(current) ? current : [];
                            setAnswers({
                              ...answers,
                              [q.id]: on ? cur.filter((x) => x !== opt) : [...cur, opt],
                            });
                          } else {
                            setAnswers({ ...answers, [q.id]: on ? "" : opt });
                          }
                        }}
                      >
                        {opt}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn" onClick={generateReport} disabled={loading}>
              {loading
                ? "Analyzing…"
                : answered < questions.length
                  ? `Generate report (${answered}/${questions.length} answered)`
                  : "Generate report"}
            </button>
            <button className="btn secondary" onClick={() => setStep("profile")} disabled={loading}>
              Back
            </button>
          </div>
        </div>
      )}

      {error && <div className="notice" style={{ marginTop: 20 }}>{error}</div>}

      {step === "report" && result && (
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
                <button className="btn secondary" onClick={() => setStep("questions")}>
                  Adjust answers
                </button>
              </div>
              <div className="report-sheet">
                <ReportMarkdown text={result.briefing} />
              </div>
              <ReportSources citations={result.citations} />
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
