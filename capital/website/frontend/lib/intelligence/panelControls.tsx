"use client";

// The form controls the intake screen is built from.
//
// Split out of panel.tsx in the Phase 2 decomposition. These are presentation
// only: they render options and report a choice back, and none of them knows
// what a fund is. Keeping them separate from the panel means a change to how a
// question LOOKS cannot touch the logic deciding which questions get asked.
//
// The option lists always come from FIELD_ENUM_HINTS or the vocabulary in
// types.ts, never from a model — see the note there.
import { useState } from "react";
import { CAPITAL_OPTIONS } from "./types";

/** A clean multi-select dropdown for the capital types: a single field that opens
 *  a checklist, with a summary of the picks and a "show me everything" shortcut. */
export function CapitalSelect({
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

/** Multi-select chips. Used for the exclusion checklist, where seeing every
 *  option at once matters more than saving space: a founder should be able to
 *  confirm at a glance that none of them apply. */
export function MultiChips({
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
              "min-h-10 rounded-[var(--radius)] border px-3 py-2 text-sm font-medium transition-colors " +
              (on
                ? isExclusive
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]"
                  : "border-[var(--primary)] bg-[var(--primary)] text-[var(--paper)]"
                : "border-[var(--border)] bg-transparent text-[var(--foreground)] hover:border-[var(--primary)]")
            }>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A small always-present ⓘ that reveals guidance on hover or keyboard focus. */
export function InfoDot({ children }: { children: React.ReactNode }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label="More information"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--primary)] text-[11px] font-bold leading-none text-[var(--primary)] outline-none transition-colors hover:bg-[var(--primary)] hover:text-[var(--paper)] focus-visible:bg-[var(--primary)] focus-visible:text-[var(--paper)]"
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
