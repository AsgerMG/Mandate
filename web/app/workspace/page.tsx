"use client";

import { useEffect, useState } from "react";
import { Companion, type CompanionState } from "@/components/mandate/companions";

type View = "today" | "radar" | "actions" | "company";
type MissionPhase = "idle" | "planning" | "researching" | "synthesizing" | "complete";

const NAV: { id: View; label: string; marker: string }[] = [
  { id: "today", label: "Today", marker: "03" },
  { id: "radar", label: "Radar", marker: "12" },
  { id: "actions", label: "Actions", marker: "04" },
  { id: "company", label: "Company", marker: "·" },
];

const PHASE_COPY: Record<MissionPhase, { title: string; detail: string; progress: number }> = {
  idle: {
    title: "What should Mandate work on?",
    detail: "Give your team an objective. They will decide how to divide the work.",
    progress: 0,
  },
  planning: {
    title: "Building the research plan",
    detail: "Regina and Wincent are splitting the policy, market, and capital questions.",
    progress: 18,
  },
  researching: {
    title: "Working in parallel",
    detail: "Reading 34 policy sources and screening 126 public-capital instruments.",
    progress: 57,
  },
  synthesizing: {
    title: "Exchanging evidence",
    detail: "Comparing regulatory cost, launch timing, and non-dilutive capital.",
    progress: 82,
  },
  complete: {
    title: "Market-entry plan ready",
    detail: "Germany leads on capital fit; France remains the lower-friction regulatory route.",
    progress: 100,
  },
};

const companionState = (phase: MissionPhase): CompanionState => {
  if (phase === "idle") return "idle";
  if (phase === "planning") return "planning";
  if (phase === "researching") return "researching";
  if (phase === "synthesizing") return "collaborating";
  return "complete";
};

function SignalCard({
  label,
  title,
  body,
  owner,
  urgent = false,
}: {
  label: string;
  title: string;
  body: string;
  owner: "Regina" | "Wincent" | "Both";
  urgent?: boolean;
}) {
  return (
    <article className="group rounded-xl border border-[#d8cfbc] bg-[#fffdfa] p-5 transition hover:-translate-y-0.5 hover:border-[#b9a77d] hover:shadow-[0_14px_30px_rgba(30,30,20,.06)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${urgent ? "bg-[#b44f43]" : "bg-[#a77c36]"}`} />
          <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#7c715e]">{label}</p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[.1em] text-[#9b9383]">{owner}</span>
      </div>
      <h3 className="mt-4 font-serif text-2xl font-semibold leading-tight text-[#162544]">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[#5e6574]">{body}</p>
      <div className="mt-5 flex items-center justify-between border-t border-[#ebe4d6] pt-4">
        <span className="text-xs font-medium text-[#725525]">Open intelligence</span>
        <span className="text-[#927d52] transition-transform group-hover:translate-x-1" aria-hidden>→</span>
      </div>
    </article>
  );
}

function TodayView({ onMission }: { onMission: () => void }) {
  return (
    <>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#8d7240]">Friday · 6 November</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-.025em] text-[#142342] sm:text-5xl">
            Good afternoon, Asger.
          </h1>
          <p className="mt-2 text-sm text-[#697080]">Three things changed for Northstar Bio.</p>
        </div>
        <button
          onClick={onMission}
          className="inline-flex items-center justify-center gap-2 self-start rounded-sm bg-[#132342] px-5 py-3 text-xs font-semibold uppercase tracking-[.08em] text-white hover:bg-[#1b315b]"
        >
          <span className="text-[#e4bd69]">✦</span> Give a new mandate
        </button>
      </header>

      <section className="mt-8 grid gap-4 xl:grid-cols-3">
        <SignalCard
          label="Decision · due in 9 days"
          title="Choose the launch market before the funding window closes"
          body="Germany offers the stronger capital route. France reaches market sooner. Your product timeline makes the trade-off unusually close."
          owner="Both"
          urgent
        />
        <SignalCard
          label="Policy movement · 2h ago"
          title="AI Act guidance changes one product assumption"
          body="The new implementation note puts your clinical-assistance feature inside the higher-scrutiny path. The model card needs an owner."
          owner="Regina"
        />
        <SignalCard
          label="Capital opening · 5h ago"
          title="EIC Accelerator window fits your next technical milestone"
          body="The ticket and development stage align. One consortium condition needs resolving before the 28 November expression of interest."
          owner="Wincent"
        />
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <div className="overflow-hidden rounded-xl border border-[#d8cfbc] bg-[#fffdfa]">
          <div className="flex items-center justify-between border-b border-[#e6dfd1] px-5 py-4">
            <div>
              <h2 className="font-serif text-xl font-semibold">Your decision queue</h2>
              <p className="mt-0.5 text-xs text-[#848071]">Ordered by consequence, not recency</p>
            </div>
            <button className="text-xs font-medium text-[#70572e]">View all</button>
          </div>
          {[
            ["01", "Decide first launch market", "9 Nov", "Strategy"],
            ["02", "Assign AI Act model-card owner", "12 Nov", "Product"],
            ["03", "Confirm EIC consortium route", "15 Nov", "Capital"],
            ["04", "Review French health-data host requirement", "18 Nov", "Legal"],
          ].map(([number, title, date, kind]) => (
            <div key={number} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-[#eee7da] px-5 py-4 last:border-0">
              <span className="font-mono text-[9px] text-[#a39a88]">{number}</span>
              <div>
                <p className="text-sm font-medium text-[#23304a]">{title}</p>
                <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[.12em] text-[#9a8b70]">{kind}</p>
              </div>
              <span className="rounded-full border border-[#ddd2bc] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[.08em] text-[#756d5e]">{date}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-[#132342] p-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#d8b96e]">Your team</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold">Still watching</h2>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[.1em] text-white/45">
              <i className="h-1.5 w-1.5 rounded-full bg-[#83b797]" /> live
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2">
            <Companion name="regina" state="researching" size="sm" />
            <Companion name="wincent" state="researching" size="sm" />
          </div>
          <div className="mt-3 space-y-2 border-t border-white/10 pt-4 text-[11px] text-white/60">
            <p><span className="text-white/90">Regina</span> is following 7 policy files</p>
            <p><span className="text-white/90">Wincent</span> is watching 18 instruments</p>
          </div>
        </div>
      </section>
    </>
  );
}

function PlaceholderView({ view }: { view: Exclude<View, "today"> }) {
  const copy = {
    radar: ["Intelligence radar", "Policy, capital, consultations, and deadlines on one company-specific timeline."],
    actions: ["Action board", "Every recommendation has an owner, a date, and the evidence that created it."],
    company: ["Company model", "The facts, assumptions, and watch scope Regina and Wincent share."],
  }[view];
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[.17em] text-[#8d7240]">Northstar Bio</p>
      <h1 className="mt-2 font-serif text-5xl font-semibold tracking-[-.025em] text-[#142342]">{copy[0]}</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#697080]">{copy[1]}</p>
      <div className="mt-10 grid min-h-[28rem] place-items-center rounded-xl border border-dashed border-[#cfc5b1] bg-[#eee8db]/50 p-8 text-center">
        <div>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[#bcae91] text-[#977744]">✦</span>
          <h2 className="mt-4 font-serif text-2xl font-semibold">The full {copy[0].toLowerCase()} comes next</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#79776e]">
            This first live slice establishes the workspace, companion system, and Today experience.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const [view, setView] = useState<View>("today");
  const [phase, setPhase] = useState<MissionPhase>("idle");
  const [missionOpen, setMissionOpen] = useState(false);

  useEffect(() => {
    if (phase === "idle" || phase === "complete") return;
    const next: Record<Exclude<MissionPhase, "idle" | "complete">, MissionPhase> = {
      planning: "researching",
      researching: "synthesizing",
      synthesizing: "complete",
    };
    const timer = window.setTimeout(() => setPhase(next[phase]), phase === "researching" ? 2800 : 1800);
    return () => window.clearTimeout(timer);
  }, [phase]);

  function startMission() {
    setMissionOpen(true);
    setPhase("idle");
  }

  return (
    <div className="min-h-[calc(100svh-4.5rem)] bg-[#f3eee3] text-[#162544]">
      <div className="grid min-h-[calc(100svh-4.5rem)] lg:grid-cols-[14rem_1fr]">
        <aside className="hidden border-r border-[#d8cfbc] bg-[#ece5d7] p-4 lg:flex lg:flex-col">
          <div className="rounded-lg border border-[#d1c5ae] bg-[#f8f3e9] p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-[#1c3156] font-serif text-sm font-semibold text-white">NB</div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">Northstar Bio</p>
                <p className="text-[10px] text-[#858070]">Series A · Denmark</p>
              </div>
            </div>
          </div>
          <nav className="mt-5 space-y-1">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition ${
                  view === item.id ? "bg-[#142342] text-white" : "text-[#566073] hover:bg-[#e2dacb]"
                }`}
              >
                {item.label}
                <span className={`font-mono text-[8px] ${view === item.id ? "text-[#d8ba72]" : "text-[#9c9586]"}`}>{item.marker}</span>
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-lg border border-[#d1c5ae] p-3">
            <p className="font-mono text-[8px] uppercase tracking-[.12em] text-[#8f7750]">Preview workspace</p>
            <p className="mt-1 text-[10px] leading-relaxed text-[#777163]">Sample company data. No actions leave Mandate.</p>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-[#d8cfbc] bg-[#eee8db] px-3 py-2 lg:hidden">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${view === item.id ? "bg-[#142342] text-white" : "text-[#606777]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <main className="mx-auto max-w-[94rem] p-4 sm:p-7 xl:p-10">
            {view === "today" ? <TodayView onMission={startMission} /> : <PlaceholderView view={view} />}
          </main>
        </div>
      </div>

      {missionOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-end bg-[#071023]/50 p-0 backdrop-blur-sm sm:place-items-center sm:p-5">
          <section className="relative max-h-[92svh] w-full max-w-3xl overflow-auto rounded-t-2xl border border-white/10 bg-[#101d39] text-white shadow-2xl sm:rounded-2xl">
            <button
              onClick={() => setMissionOpen(false)}
              className="absolute right-4 top-4 z-20 grid h-8 w-8 place-items-center rounded-full border border-white/15 text-white/60 hover:text-white"
              aria-label="Close mission"
            >
              ×
            </button>
            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_1.1fr] sm:p-8">
              <div className="min-h-[16rem]">
                <div className="grid grid-cols-2">
                  <Companion name="regina" state={companionState(phase)} size="md" />
                  <Companion name="wincent" state={companionState(phase)} size="md" />
                </div>
                <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-[.14em] text-[#d8ba72]">
                  {phase === "idle" ? "Your public-affairs team" : PHASE_COPY[phase].title}
                </p>
              </div>
              <div className="flex flex-col justify-center">
                <p className="font-mono text-[9px] uppercase tracking-[.15em] text-[#d8ba72]">New mandate</p>
                {phase === "idle" ? (
                  <>
                    <h2 className="mt-3 font-serif text-3xl font-semibold !text-white">Brief the team once.</h2>
                    <textarea
                      defaultValue="Should we launch in France or Germany first, considering regulation, available public funding, and our 12-month runway?"
                      className="mt-5 min-h-32 resize-none rounded-lg border border-white/15 bg-white/[.06] p-4 text-sm leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-[#d8ba72]/60"
                    />
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <span className="text-[10px] text-white/40">Uses your company model</span>
                      <button
                        onClick={() => setPhase("planning")}
                        className="rounded-sm bg-[#efd38d] px-5 py-3 text-xs font-semibold uppercase tracking-[.08em] text-[#142342] hover:bg-[#ffe6a5]"
                      >
                        Start mission →
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="mt-3 font-serif text-3xl font-semibold !text-white">{PHASE_COPY[phase].title}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-white/60">{PHASE_COPY[phase].detail}</p>
                    <div className="mt-7 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#7180a6] to-[#efd07d] transition-[width] duration-700" style={{ width: `${PHASE_COPY[phase].progress}%` }} />
                    </div>
                    <div className="mt-3 flex justify-between font-mono text-[8px] uppercase tracking-[.12em] text-white/35">
                      <span>{phase}</span>
                      <span>{PHASE_COPY[phase].progress}%</span>
                    </div>
                    {phase === "complete" && (
                      <button className="mt-6 rounded-sm bg-[#efd38d] px-5 py-3 text-xs font-semibold uppercase tracking-[.08em] text-[#142342]">
                        Open the 90-day plan →
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
