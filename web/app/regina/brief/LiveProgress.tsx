// What the user watches for the ~3 minutes a brief takes.
//
// The brief's median wall clock is 184s (measured 2026-07-29 over 10 profiles),
// and the Haiku/Sonnet A/B established that this is a property of the product
// rather than something to optimise away. So this component's job is to make the
// wait legible: an honest estimate, the actual instruments being read, and the
// report appearing as it is written.
//
// The metaphor is load-bearing rather than decorative. The rail already calls the
// stages First reading → Committee markup → Second reading, and the pipeline
// literally does draft → self-critique → final. So the draft is shown as a
// provisional first-reading text that then gets amended, which is exactly what is
// happening. See project-management/brief-ux-plan.md.

import { Eta, formatExpectation, formatRemaining } from "@/lib/regina/eta";
import type { BriefExpectation, BriefSources } from "@/lib/regina/api";

type Props = {
  eta: Eta | null;
  expectation: BriefExpectation | null;
  sources: BriefSources | null;
  liveText: string;
  /** The stage id currently running, e.g. "drafting". */
  stage: string | null;
  correcting: boolean;
  /** True once report text has started arriving. Before that the model is
   *  reading and reasoning, which took ~90s of a 180s run when measured — so the
   *  distinction is most of the wait, not a detail. */
  writing: boolean;
  /** The model's summarised reasoning so far (tail only). */
  thinking: string;
  notifyOnDone: boolean;
  onAskToNotify: () => void;
};

/** Provisional while the model is still writing the final version. Labelled so
 *  nobody acts on text that is about to be amended. */
const PROVISIONAL_STAGES = new Set(["drafting", "verifying"]);

export default function LiveProgress({
  eta,
  expectation,
  sources,
  liveText,
  stage,
  correcting,
  writing,
  thinking,
  notifyOnDone,
  onAskToNotify,
}: Props) {
  const remaining = formatRemaining(eta?.remainingSeconds ?? null);
  const provisional = stage !== null && PROVISIONAL_STAGES.has(stage);

  return (
    <div className="form generating-panel">
      <div className="generating-head">
        <h2>Drafting your brief</h2>
        {remaining && (
          <span className={`eta ${eta?.determinate ? "eta-measured" : ""}`}>{remaining}</span>
        )}
      </div>

      <p className="muted generating-note">
        {expectation ? formatExpectation(expectation) : "usually 2 to 4 minutes"}: it reads the
        full text of every applicable law rather than summarising from memory, then rereads its own
        draft against our accuracy checklist. Feel free to switch tabs; we&apos;ll keep working.
      </p>

      {/* Determinate only while text is actually streaming. During retrieval we
          have no honest progress number (nothing available then predicts a run's
          size — measured), so the bar says so by travelling rather than filling. */}
      <div
        className={`progress-track ${eta?.determinate ? "determinate" : "indeterminate"}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={eta?.progress != null ? Math.round(eta.progress * 100) : undefined}
      >
        <div
          className="progress-fill"
          style={eta?.progress != null ? { width: `${eta.progress * 100}%` } : undefined}
        />
      </div>

      {/* Measured 2026-07-30: on a 180s brief, no text appeared for the first ~90s
          because adaptive thinking runs before generation. Leaving that stretch
          labelled "drafting" with a travelling bar is the one genuinely misleading
          moment in the flow — the model is working, just not writing yet. Naming it
          is the honest fix; more animation would not be. */}
      {!writing && !correcting && (
        <p className="muted stage-hint">
          Reading the retrieved provisions and working out which of them actually bind you.
        </p>
      )}

      {/* The model's OWN summarised reasoning, streamed while it thinks. Thinking
          runs before any answer text and measured ~90-100s of a ~180s brief — the
          stretch where a user decides whether the thing is working at all. Showing
          real reasoning is the honest way to fill it; inventing plausible-sounding
          narration would be the same fabrication the brief prompt forbids
          elsewhere. Yields to the draft the moment writing starts. */}
      {!writing && thinking && (
        <div className="deliberation" aria-live="polite">
          <span className="deliberation-label">In deliberation</span>
          <p className="deliberation-body">{thinking}</p>
        </div>
      )}

      {correcting && (
        <p className="notice notice-inline">
          Found an inconsistency in the compliance table and is running a correction pass, so this one
          takes a little longer.
        </p>
      )}

      {sources && <SourceList sources={sources} />}

      {liveText && (
        <div className={`live-draft ${provisional ? "provisional" : ""}`}>
          {provisional && <span className="live-draft-label">First reading: provisional text</span>}
          <div className="live-draft-body">{liveText}</div>
        </div>
      )}

      {!notifyOnDone && typeof window !== "undefined" && "Notification" in window && (
        <button type="button" className="ghost-button" onClick={onAskToNotify}>
          Notify me when it&apos;s ready
        </button>
      )}
    </div>
  );
}

/** Instruments by act name; news by outlet rather than by headline. A press
 *  headline is long, often in another language, and says nothing about why it was
 *  retrieved — the outlet is the signal. */
function SourceList({ sources }: { sources: BriefSources }) {
  const moreInstruments = sources.instruments_total - sources.instruments.length;
  const moreOutlets = sources.outlets_total - sources.outlets.length;
  return (
    <ul className="reading-list">
      {sources.instruments.map((i) => (
        <li key={i.label + i.detail}>
          <span className="reading-verb">Reading</span> <strong>{i.label}</strong>
          {i.detail && <span className="muted"> · {i.detail}</span>}
        </li>
      ))}
      {moreInstruments > 0 && (
        <li className="muted">…and {moreInstruments} more instruments in scope</li>
      )}
      {sources.outlet_items > 0 && sources.outlets.length > 0 && (
        <li className="muted">
          Plus {sources.outlet_items} recent {sources.outlet_items === 1 ? "item" : "items"} from{" "}
          {sources.outlets.join(", ")}
          {moreOutlets > 0 && ` and ${moreOutlets} more`}
        </li>
      )}
    </ul>
  );
}
