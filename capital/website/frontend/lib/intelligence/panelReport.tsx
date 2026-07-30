"use client";

// Everything that renders a finished brief.
//
// Split out of panel.tsx in the Phase 2 decomposition. The division is between
// COLLECTING answers and PRESENTING a result: this half never sets state on
// the intake, and the intake half never formats a verdict.
//
// The rules these components display are code-computed before they arrive —
// verdicts, blockers and citations are not model-written, and the tables must
// never imply otherwise. Where no machine-readable rule exists the row says so
// rather than rendering blank, which was a real defect: an unassessed fund
// looked identical to a cleared one except for a missing green line.
import { useEffect, useState } from "react";

/** Shared with panel.tsx: the serif face the brief is set in. */
const serif = { fontFamily: "var(--font-newsreader), Georgia, serif" };

import { STATE_OF_PLAY_OFFER } from "./types";
import type { EligibilityCheck, InstitutionEntry, IntelligenceReport } from "./types";

/** A quiet editorial section title in the house serif — no number, no colour. */
/** One consistent heading grammar used by every screen of the intake flow
 *  (the live-preview panel, the adaptive round, the running screen) — a
 *  small eyebrow, a plain-English title, and a one-line explainer of what
 *  this screen is and what happens next. Replaces three previously
 *  different ad hoc heading styles per screen. */
export function StepHeader({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
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
export function PlaceholderBar({ narrow = false }: { narrow?: boolean }) {
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
export function InstitutionsTable({ institutions, pending = false }: { institutions: InstitutionEntry[]; pending?: boolean }) {
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
                {/* Dormancy, stated rather than hidden. A brief that sends a
                    founder at a scheme which stopped awarding in 2019 is not
                    thin, it is wrong with authority — so the date they would
                    need in order to disbelieve us is on the row itself. */}
                {r.stale && r.lastAwardYear && (
                  <span className="mt-1 block text-[12px] text-[var(--accent)]">
                    No award recorded since {r.lastAwardYear} — confirm it is still running
                  </span>
                )}
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
                  // Nothing rendered. A published row already MEANS the door is
                  // open; announcing it in every row spent a line on the
                  // product's own reasoning rather than on the fund, and the
                  // phrasing read as a shrug (contract rule BRIEF-4).
                  null
                ) : (
                  // Say so when we checked NOTHING. 177 instruments carry no
                  // machine-readable rule yet, and an unassessed row used to
                  // render blank here — indistinguishable from one we had
                  // actually cleared, except for a missing green line nobody
                  // would notice was absent. Dropping these rows instead was
                  // considered and rejected: they include the Dutch, Swedish,
                  // Spanish and Czech national routes, so excluding them would
                  // leave founders in those countries with no domestic option
                  // at all. Ranking already sorts them below assessed rows
                  // (VERDICT_RANK), so they surface only when nothing better
                  // exists — which is exactly when a founder should see one,
                  // clearly labelled.
                  <span className="mb-1 block font-semibold text-[var(--muted-foreground)]">
                    Not yet verified: we hold no machine-readable rules for this
                    one, so check its criteria yourself before committing time
                  </span>
                )}
                {pending && !r.whyEligible ? <PlaceholderBar /> : r.whyEligible}
                {/* `whyEasy` used to render here: "your answers speak to N of
                    its M documented eligibility rules". That is a ranking
                    confidence metric about our own gate coverage, not an
                    observation about the founder's company (contract rule
                    BRIEF-4). It still computes and still drives ranking; it is
                    no longer printed. */}
                <span className="block text-[12px] italic text-[var(--muted-foreground)]">
                  Move: {pending && !r.nextStep ? <PlaceholderBar narrow /> : r.nextStep}
                </span>
                {/* Curated from the scheme's own document, never model-written.
                    It is the only line on the row that is an instruction rather
                    than an assessment, so it renders even when the writer's
                    prose is still streaming. */}
                {r.applicationChannel && (
                  <span className="mt-1 block text-[12px] text-[var(--muted-foreground)]">
                    How to apply: {r.applicationChannel}
                    {r.applicationUrl && (
                      <>
                        {" "}
                        <a
                          href={r.applicationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-[var(--primary)]"
                        >
                          Apply
                        </a>
                      </>
                    )}
                  </span>
                )}
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

/**
 * Export the brief as a PDF.
 *
 * Two things the bare `window.print()` got wrong. The browser names the file
 * from `document.title`, so every export was called after the marketing page
 * ("Get your state-backed capital brief | Wincent") rather than after the
 * company. And the print stylesheet hid the page with `visibility: hidden`,
 * which blanks pixels but keeps layout — so the nav, hero and footer still
 * occupied their full height around the report.
 *
 * Both are fixed here rather than in CSS alone: the title has to be swapped
 * around the print call and restored after, and the `printing` class lets the
 * stylesheet use `display: none`, which removes the boxes entirely.
 */
function printReport(company: string): void {
  const slug = (company || "brief").normalize("NFKD")
    .replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  const previous = document.title;
  document.title = `Wincent-brief-${slug}-${stamp}`;
  document.documentElement.classList.add("printing");
  const restore = () => {
    document.title = previous;
    document.documentElement.classList.remove("printing");
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
  // Safari never fires afterprint in some versions; the timer is the backstop
  // so the tab is not left renamed and unstyled.
  setTimeout(restore, 1000);
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-10 mb-3 text-[17px] font-semibold text-[var(--foreground)] print:mt-8" style={serif}>
      {children}
    </h3>
  );
}

/** Deterministic, cited, never model-written — shared by the fast verdict
 *  screen and the final memo so both render identically. */
export function EligibilityTable({ rows }: { rows: EligibilityCheck[] }) {
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

/**
 * The trace panel: where every part of this brief came from, and what was
 * removed on the way here.
 *
 * Shown only when the URL carries ?trace=1. Never part of the founder's brief,
 * and deliberately rendered INSIDE the report component rather than as a
 * separate debug page, so what it describes is the brief actually on screen
 * rather than a re-run that might differ.
 *
 * The exclusion counts are the half that cannot be answered any other way: a
 * published fund carries its whole justification, while a fund that never
 * appeared leaves no trace in the output at all.
 */
function TracePanel({ report }: { report: IntelligenceReport }) {
  const p = report.provenance;
  if (!p) return null;
  const badge = (o: string) =>
    o === "code" ? "bg-[#e8efe6] text-[#3d6136]"
      : o === "fixed" ? "bg-[#f0ece2] text-[#6b5f45]"
      : "bg-[#e6ecf4] text-[#2f4d73]";
  const exclusions = Object.entries(p.exclusions).sort((a, b) => b[1] - a[1]);
  return (
    <div className="mt-12 border-t-2 border-dashed border-[var(--border)] pt-6 print:hidden">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Trace · not part of the brief
      </p>
      <table className="mb-6 w-full border-collapse text-[12px]">
        <tbody className="divide-y divide-[var(--border)] align-top">
          {Object.entries(p.fields).map(([field, meta]) => (
            <tr key={field}>
              <td className="py-1.5 pr-3 font-mono">{field}</td>
              <td className="py-1.5 pr-3">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${badge(meta.origin)}`}>
                  {meta.origin}
                </span>
                {meta.contract && (
                  <span className="ml-2 text-[var(--muted-foreground)]">{meta.contract}</span>
                )}
              </td>
              <td className="py-1.5 text-[var(--muted-foreground)]">{(meta.evidence ?? []).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Funds removed on the way here
      </p>
      {exclusions.length === 0 ? (
        <p className="text-[12px] text-[var(--muted-foreground)]">nothing recorded</p>
      ) : (
        <ul className="text-[12px] text-[var(--muted-foreground)]">
          {exclusions.map(([rule, n]) => (
            <li key={rule} className="font-mono">{rule}: {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Memo({ report }: { report: IntelligenceReport }) {
  const self = report.self;
  // Debug view, opt-in per request. Read from the URL rather than held in
  // state: it must survive a reload and never leak into a normal session.
  const trace =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("trace") === "1";
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
          onClick={() => printReport(report.company)}
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

        {/* The brief is exactly four sections (contract BRIEF): bottom line,
            funds, positioning, state of play. The eligibility screen used to
            render here as a fifth block — every documented rule behind every
            candidate, with its source document and page. It is an internal
            artifact, it sat between the reader and what they came for, and
            the funds table below already IS the eligibility statement: a row
            appears because the founder can go after it. The screen still
            computes, and still decides the shortlist; it is no longer
            printed. */}

        {/* ── 2. Where to target ───────────────────────────────────────── */}
        <InstitutionsTable institutions={report.institutions} />

        {/* ── 3. Positioning: fitting the current political moment ─────── */}
        <SectionTitle>Positioning</SectionTitle>
        <p>{report.positioning}</p>

        {/* ── 4. State of play, then the standing offer as its own block ── */}
        <SectionTitle>State of play</SectionTitle>
        <p>{report.stateOfPlay}</p>
        {/* Rendered separately, never concatenated into the paragraph above:
            welded on, the analysis ended mid-thought in a sales line
            (contract rule SOP-2). */}
        <p className="mt-4 border-l-2 border-[var(--primary)] pl-4 text-[var(--foreground-soft)]">
          {STATE_OF_PLAY_OFFER}
        </p>

        {trace && <TracePanel report={report} />}

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
