"use client";

export type CompanionName = "regina" | "wincent";
export type CompanionState =
  | "idle"
  | "listening"
  | "planning"
  | "researching"
  | "collaborating"
  | "needs_input"
  | "finding"
  | "complete";

type CompanionProps = {
  name: CompanionName;
  state?: CompanionState;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

const stateLabel: Record<CompanionState, string> = {
  idle: "Ready",
  listening: "Listening",
  planning: "Planning",
  researching: "Researching",
  collaborating: "Working together",
  needs_input: "Needs your input",
  finding: "Found a signal",
  complete: "Complete",
};

function ReginaFigure() {
  return (
    <svg viewBox="0 0 240 300" role="img" aria-label="Regina, Mandate policy companion">
      <defs>
        <linearGradient id="regina-body" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#6e779d" />
          <stop offset=".48" stopColor="#3f496f" />
          <stop offset="1" stopColor="#202945" />
        </linearGradient>
        <linearGradient id="regina-face" x1=".15" x2=".9" y1=".1" y2=".9">
          <stop offset="0" stopColor="#e4d9c5" />
          <stop offset=".5" stopColor="#b8b3ad" />
          <stop offset="1" stopColor="#737b8d" />
        </linearGradient>
        <linearGradient id="regina-page" x1="0" x2="1">
          <stop offset="0" stopColor="#fff9eb" />
          <stop offset="1" stopColor="#cfc7b4" />
        </linearGradient>
        <filter id="regina-shadow" x="-40%" y="-30%" width="180%" height="190%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#070e21" floodOpacity=".35" />
        </filter>
      </defs>

      <ellipse cx="120" cy="271" rx="72" ry="13" fill="#080f24" opacity=".28" />

      <g className="companion-float companion-orbit" opacity=".95">
        <path d="M32 85 72 73l4 55-41 8z" fill="url(#regina-page)" />
        <path d="m38 94 25-7M39 103l28-8M41 113l23-6" stroke="#665d55" strokeWidth="2" opacity=".65" />
        <circle cx="65" cy="122" r="7" fill="#8f3d54" />
      </g>
      <g className="companion-float companion-orbit-delayed" opacity=".9">
        <path d="m171 58 34 11-10 46-34-11z" fill="url(#regina-page)" />
        <path d="m177 72 19 6m-21 3 18 6m-21 3 14 4" stroke="#665d55" strokeWidth="2" opacity=".65" />
      </g>

      <g filter="url(#regina-shadow)">
        <path
          d="M69 142c8-19 24-31 51-31s44 12 52 31l20 105c-23 14-47 21-72 21s-49-7-72-21z"
          fill="url(#regina-body)"
        />
        <path d="M120 118v143c-18 0-37-4-57-11l18-101c5-20 18-30 39-31Z" fill="#56618a" opacity=".6" />
        <path d="m80 151 40 28 40-28-7 84h-66z" fill="#111a35" opacity=".42" />
        <path d="m89 147 31 24 31-24-6-19H95z" fill="#ddd2bd" opacity=".9" />

        <path
          d="m82 65 23-28 41 4 20 31-8 42-35 23-37-20-12-31z"
          fill="url(#regina-face)"
        />
        <path d="m82 65 41 11 43-4-20-31-41-4z" fill="#f2e7d2" opacity=".52" />
        <path d="m123 76 35 38-35 23z" fill="#515b76" opacity=".35" />
        <path d="M94 83c8-5 17-7 27-7 10 0 19 2 28 7l-8 19c-13-6-27-6-39 0z" fill="#131d39" />
        <path d="M103 91h12m13 0h12" stroke="#d5b46a" strokeWidth="3" strokeLinecap="round" />
        <circle cx="121.5" cy="91" r="2.5" fill="#d5b46a" />
      </g>

      <g className="companion-tool">
        <circle cx="177" cy="173" r="25" fill="#182341" stroke="#d4b46e" strokeWidth="2" />
        <circle cx="177" cy="173" r="13" fill="none" stroke="#d4b46e" strokeWidth="3" />
        <path d="m195 192 17 18" stroke="#d4b46e" strokeWidth="6" strokeLinecap="round" />
        <path d="m170 173 5 5 10-12" fill="none" stroke="#f8edcf" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function WincentFigure() {
  return (
    <svg viewBox="0 0 240 300" role="img" aria-label="Wincent, Mandate capital companion">
      <defs>
        <linearGradient id="wincent-body" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#657d70" />
          <stop offset=".48" stopColor="#3d5d52" />
          <stop offset="1" stopColor="#1c3936" />
        </linearGradient>
        <linearGradient id="wincent-face" x1=".15" x2=".9" y1=".1" y2=".9">
          <stop offset="0" stopColor="#ead8b8" />
          <stop offset=".5" stopColor="#c4ad86" />
          <stop offset="1" stopColor="#766f63" />
        </linearGradient>
        <linearGradient id="wincent-coin" x1=".1" x2=".9">
          <stop offset="0" stopColor="#f3d891" />
          <stop offset=".5" stopColor="#b98238" />
          <stop offset="1" stopColor="#70441e" />
        </linearGradient>
        <filter id="wincent-shadow" x="-40%" y="-30%" width="180%" height="190%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#071711" floodOpacity=".35" />
        </filter>
      </defs>

      <ellipse cx="120" cy="271" rx="72" ry="13" fill="#061711" opacity=".28" />

      <g className="companion-orbit" fill="none" stroke="#d4a454" strokeWidth="2.2" opacity=".8">
        <path d="M30 147c24-25 51-38 80-39M143 73c27 10 49 29 65 56" strokeDasharray="4 7" />
        <circle cx="33" cy="145" r="7" fill="url(#wincent-coin)" stroke="none" />
        <circle cx="207" cy="129" r="8" fill="url(#wincent-coin)" stroke="none" />
      </g>

      <g filter="url(#wincent-shadow)">
        <path
          d="M64 145c9-21 27-32 55-32 29 0 48 11 57 32l19 103c-24 13-49 20-76 20-26 0-51-7-75-20z"
          fill="url(#wincent-body)"
        />
        <path d="M119 119v143c-19 0-39-4-60-12l18-98c5-21 19-32 42-33Z" fill="#78917f" opacity=".48" />
        <path d="m81 153 38 23 43-23-9 85H88z" fill="#0e2b2b" opacity=".46" />
        <path d="m89 145 30 23 33-23-8-18H97z" fill="#ddc7a0" opacity=".9" />

        <path
          d="m78 74 25-34 43-1 21 34-9 42-37 22-38-21-12-26z"
          fill="url(#wincent-face)"
        />
        <path d="m78 74 43 4 46-5-21-34-43 1z" fill="#f2dfba" opacity=".5" />
        <path d="m121 78 37 37-37 22z" fill="#655f57" opacity=".28" />
        <path d="M91 82c9-4 18-6 29-6 11 0 21 2 30 6l-7 21c-15-5-29-5-44 0z" fill="#102e2e" />
        <path d="M101 91h13m14 0h13" stroke="#efc970" strokeWidth="3" strokeLinecap="round" />
        <path d="M120 90h8" stroke="#efc970" strokeWidth="2" />
      </g>

      <g className="companion-tool">
        <path d="M172 161v49m-16-31h32m-26-13 10-10 10 10m-20 31 10 10 10-10" stroke="#efc970" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="172" cy="183" r="29" fill="none" stroke="#efc970" strokeWidth="2" opacity=".65" />
        <circle cx="172" cy="183" r="5" fill="#efc970" />
      </g>
    </svg>
  );
}

export function Companion({
  name,
  state = "idle",
  size = "md",
  showLabel = true,
  className = "",
}: CompanionProps) {
  return (
    <div
      className={`mandate-companion mandate-companion--${name} mandate-companion--${state} mandate-companion--${size} ${className}`}
      data-state={state}
    >
      <div className="mandate-companion__figure">
        {name === "regina" ? <ReginaFigure /> : <WincentFigure />}
        <span className="mandate-companion__pulse" aria-hidden />
      </div>
      {showLabel && (
        <div className="mandate-companion__label">
          <span className="mandate-companion__name">{name === "regina" ? "Regina" : "Wincent"}</span>
          <span className="mandate-companion__state">
            <i aria-hidden />
            {stateLabel[state]}
          </span>
        </div>
      )}
    </div>
  );
}

export function CompanionPair({
  reginaState = "idle",
  wincentState = "idle",
  compact = false,
}: {
  reginaState?: CompanionState;
  wincentState?: CompanionState;
  compact?: boolean;
}) {
  return (
    <div className={`mandate-companion-pair ${compact ? "mandate-companion-pair--compact" : ""}`}>
      <div className="mandate-companion-pair__halo" aria-hidden />
      <Companion name="regina" state={reginaState} size={compact ? "sm" : "lg"} />
      <div className="mandate-companion-pair__exchange" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <Companion name="wincent" state={wincentState} size={compact ? "sm" : "lg"} />
    </div>
  );
}
