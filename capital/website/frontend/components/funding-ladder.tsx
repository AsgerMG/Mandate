"use client";

// The founder's-climb anchor of the /about-public-capital trip — the mirror image of the
// home page's ChannelsGraph. Where the home graph follows one euro *down* into a
// company, this one has the reader climb *up* the public funding stack. It stays
// pinned while the narrative scrolls; the camera (an animated SVG viewBox) pans up
// the ladder, floor by floor, and the focused floor's rungs unfold with their real
// ticket sizes. Signal floor -> the missing middle -> conviction floor -> private
// capital on top. Scrolling down climbs up: the inversion is the point.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtEur } from "@/lib/format";

const ACCENT = "#7f5820";

export interface Rung {
  label: string;
  sub: string;
  median: number;
  p90: number;
}

type Tier = "signal" | "gap" | "conviction" | "crown" | null;

// ── Canvas 640 x 1040, laid out top (private capital) to bottom (the ground). ──
const CANVAS = { w: 640, h: 1040 };
const CX = 320;

// Fixed vertical anchors for each band, top to bottom.
const Y = {
  crown: 60,
  convictionTop: 190,
  convictionStep: 92,
  gapMid: 470,
  signalTop: 646,
  signalStep: 84,
  ground: 968,
} as const;

// Camera targets (viewBox: x y w h).
const CAM = {
  overview: [0, 0, CANVAS.w, CANVAS.h],
  crown: [90, 0, 460, 250],
  conviction: [55, 150, 530, 280],
  gap: [55, 350, 530, 260],
  signal: [35, 600, 570, 400],
} as const;

/** Everything the narrative states, handed in rather than typed into it.
 *
 *  The rung ticket sizes already arrived this way. The two shares did not:
 *  "Only about a third of the companies on the top floor climbed there" and
 *  "three quarters of all awards are national" were literals in prose, and the
 *  first of them restates `stats.conviction.pct`, which /about-public-capital
 *  renders live in a Stat tile two sections further down. Two statements of one
 *  quantity, one of which followed the corpus and one of which did not. */
export interface LadderFigures {
  signal: Rung[];
  conviction: Rung[];
  /** Share of conviction-tier companies that climbed from smaller grants. */
  convictionClimbPct: number;
  /** Share of traced awards that stay on the national road, whole percent. */
  nationalAwardPct: number;
}

interface Step {
  key: string;
  cam: keyof typeof CAM;
  tier: Tier;
  content: (r: LadderFigures) => ReactNode;
}

const kicker = (t: string) => (
  <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">{t}</p>
);
const head = (t: string) => (
  <h3
    className="mb-5 text-3xl font-semibold leading-[1.1] text-[var(--foreground)] sm:text-4xl"
    style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
  >
    {t}
  </h3>
);
const P = ({ children }: { children: ReactNode }) => (
  <p className="mt-4 max-w-xl leading-relaxed text-[var(--foreground-soft)] first:mt-0">{children}</p>
);
const b = (t: string) => <span className="text-[var(--foreground)]">{t}</span>;

const STEPS: Step[] = [
  {
    key: "stack",
    cam: "overview",
    tier: null,
    content: () => (
      <div>
        {kicker("The stack")}
        {head("Two floors. No staircase.")}
        <P>
          A {b("signal floor")} of smaller awards proves you can execute. A{" "}
          {b("conviction floor")} finances strategic industrial buildout.
        </P>
        <P>
          You are {b("chosen")} onto the top floor, not promoted there one grant at a time.
        </P>
      </div>
    ),
  },
  {
    key: "signal",
    cam: "signal",
    tier: "signal",
    content: ({ signal }) => (
      <div>
        {kicker("The signal floor")}
        {head("Small cheques that certify you.")}
        <P>
          National programmes start around {fmtEur(signal[signal.length - 1].median)}.{" "}
          {b("EIC")} and {b("Horizon")} are harder to win, but carry stronger signalling value.
        </P>
        <P>
          The cash helps. The {b("certification")} is what you take to a term sheet.
        </P>
      </div>
    ),
  },
  {
    key: "top",
    cam: "gap",
    tier: null,
    content: ({ convictionClimbPct, conviction }) => (
      <div>
        {kicker("The top floor")}
        {head("Chosen for strategic relevance.")}
        <P>
          Only {b(`${convictionClimbPct}%`)} of conviction-tier companies arrived through smaller
          grants. The rest sit in value chains Europe has declared strategic: batteries, hydrogen,
          chips, cloud or defence.
        </P>
        <P>
          The {b("Innovation Fund")} (median {fmtEur(conviction[0].median)}) and{" "}
          {b("IPCEI")} ({fmtEur(conviction[1].median)}) are multi-year positioning campaigns, not
          forms you fire off.
        </P>
      </div>
    ),
  },
  {
    key: "handoff",
    cam: "crown",
    tier: "crown",
    content: ({ nationalAwardPct }) => (
      <div>
        {kicker("The hand-off")}
        {head("Public first. Private follows.")}
        <P>
          Public backing absorbs early risk and gives private investors evidence to underwrite.
        </P>
        <P>
          Start with your address: {nationalAwardPct}% of awards are national. Then sequence the
          right door around your private raise.
        </P>
      </div>
    ),
  },
];

// ── One rung of the ladder ────────────────────────────────────────────────────
function RungBox({
  y,
  w,
  title,
  sub,
  ticket,
  dim,
  accent,
}: {
  y: number;
  w: number;
  title: string;
  sub?: string;
  ticket?: string;
  dim: number;
  accent?: boolean;
}) {
  const h = 58;
  const x = CX - w / 2;
  return (
    <g style={{ opacity: dim, transition: "opacity 0.5s ease" }} filter={accent ? "url(#rungGlow)" : undefined}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        fill="url(#rungFill)"
        stroke={accent ? ACCENT : "rgba(16,32,63,0.34)"}
        strokeWidth={accent ? 1.75 : 1.25}
      />
      <text
        x={CX}
        y={sub ? y + 25 : y + 34}
        textAnchor="middle"
        fill="#10203f"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontSize: 15, fontWeight: 700 }}
      >
        {title}
      </text>
      {sub && (
        <text x={CX} y={y + 43} textAnchor="middle" fill="#656d82" style={{ fontSize: 11 }}>
          {sub}
        </text>
      )}
      {/* Ticket size unfolds centered under the rung when its floor is in focus,
          so it never overflows the camera frame regardless of rung width. */}
      {ticket && (
        <text
          x={CX}
          y={y + h + 16}
          textAnchor="middle"
          fill={ACCENT}
          style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontSize: 12.5,
            fontWeight: 700,
            opacity: accent ? 1 : 0,
            transition: "opacity 0.5s ease",
          }}
        >
          {ticket}
        </text>
      )}
    </g>
  );
}

function Ladder({ tier, signal, conviction }: { tier: Tier; signal: Rung[]; conviction: Rung[] }) {
  // Rung width scales with the log of the median ticket, so the jump between the
  // two floors is visible at a glance: signal rungs are narrow, anchors are wide.
  const medians = [...signal, ...conviction].map((r) => r.median).filter((m) => m > 0);
  const lo = Math.log(Math.min(...medians));
  const hi = Math.log(Math.max(...medians));
  const width = (m: number) => 150 + (hi > lo ? (Math.log(m) - lo) / (hi - lo) : 0.5) * 290;

  // Dimmed-but-legible on the paper stage; 0.28 vanished against #f6f1e6.
  const dimFor = (t: Tier) => (tier === t ? 1 : tier ? 0.45 : 1);

  // Conviction: index 0 lower (Innovation Fund), index 1 higher (IPCEI, biggest).
  const convY = (i: number) => Y.convictionTop + (conviction.length - 1 - i) * Y.convictionStep;
  // Signal: index 0 highest (biggest signal ticket), last lowest (state aid).
  const sigY = (i: number) => Y.signalTop + i * Y.signalStep;

  return (
    <>
      <defs>
        <linearGradient id="rungFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#fffdf9" />
        </linearGradient>
        <filter id="rungGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="bl" />
          <feColorMatrix in="bl" type="matrix" values="0 0 0 0 0.07  0 0 0 0 0.15  0 0 0 0 0.31  0 0 0 0.16 0" result="g" />
          <feMerge>
            <feMergeNode in="g" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* The two side rails, broken across the missing middle. */}
      <g stroke="rgba(16,32,63,0.22)" strokeWidth="2" fill="none">
        <line x1={CX - 250} y1={Y.crown + 30} x2={CX - 250} y2={Y.gapMid - 70} />
        <line x1={CX + 250} y1={Y.crown + 30} x2={CX + 250} y2={Y.gapMid - 70} />
        <line x1={CX - 250} y1={Y.gapMid + 70} x2={CX - 250} y2={Y.ground} />
        <line x1={CX + 250} y1={Y.gapMid + 70} x2={CX + 250} y2={Y.ground} />
      </g>

      {/* Crown: private capital, always lit — the widest cheque, the destination. */}
      <RungBox y={Y.crown} w={460} title="Private capital" sub="follows in behind, far bigger cheques" dim={dimFor("crown")} accent={tier === "crown" || tier === null} />

      {/* Conviction floor. */}
      <text
        x={CX}
        y={Y.convictionTop - 22}
        textAnchor="middle"
        fill="#656d82"
        style={{ fontSize: 11, letterSpacing: 2.5, opacity: dimFor("conviction") }}
      >
        THE CONVICTION FLOOR
      </text>
      {conviction.map((r, i) => (
        <RungBox
          key={r.label}
          y={convY(i)}
          w={width(r.median)}
          title={r.label}
          sub={r.sub}
          ticket={`${fmtEur(r.median)} · top ${fmtEur(r.p90)}`}
          dim={dimFor("conviction")}
          accent={tier === "conviction"}
        />
      ))}

      {/* The missing middle. */}
      <g style={{ opacity: dimFor("gap"), transition: "opacity 0.5s ease" }}>
        <line
          x1={CX - 190}
          y1={Y.gapMid}
          x2={CX + 190}
          y2={Y.gapMid}
          stroke={ACCENT}
          strokeWidth="1.5"
          strokeDasharray="7 9"
          opacity={0.6}
        />
        <text x={CX} y={Y.gapMid - 16} textAnchor="middle" fill="#656d82" style={{ fontSize: 11, letterSpacing: 2.5 }}>
          NO STAIRCASE
        </text>
        <text x={CX} y={Y.gapMid + 30} textAnchor="middle" fill="var(--muted-foreground)" style={{ fontSize: 12, fontStyle: "italic" }}>
          you are chosen up, not climbed up
        </text>
      </g>

      {/* Signal floor. */}
      <text
        x={CX}
        y={Y.signalTop - 22}
        textAnchor="middle"
        fill="#656d82"
        style={{ fontSize: 11, letterSpacing: 2.5, opacity: dimFor("signal") }}
      >
        THE SIGNAL FLOOR
      </text>
      {signal.map((r, i) => (
        <RungBox
          key={r.label}
          y={sigY(i)}
          w={width(r.median)}
          title={r.label}
          sub={r.sub}
          ticket={`${fmtEur(r.median)} · top ${fmtEur(r.p90)}`}
          dim={dimFor("signal")}
          accent={tier === "signal"}
        />
      ))}

      {/* The ground. */}
      <text x={CX} y={Y.ground + 34} textAnchor="middle" fill="var(--muted-foreground)" style={{ fontSize: 12, fontStyle: "italic" }}>
        the private market will not fund this yet
      </text>
    </>
  );
}

// ── The pinned, camera-driven section ─────────────────────────────────────────
export function FundingLadder(figures: LadderFigures) {
  const { signal, conviction } = figures;
  const [active, setActive] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const [vb, setVb] = useState<number[]>([...CAM.overview]);
  const raf = useRef(0);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    sectionRef.current?.querySelectorAll("[data-i]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const target = CAM[STEPS[active].cam];
    const from = vb;
    const t0 = performance.now();
    const dur = 750;
    cancelAnimationFrame(raf.current);
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setVb(from.map((f, i) => f + (target[i] - f) * e));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const tier = STEPS[active].tier;
  const svg = (
    <svg viewBox={vb.join(" ")} className="h-full w-full" role="img" aria-label="Climbing Europe's public funding stack, floor by floor">
      <Ladder tier={tier} signal={signal} conviction={conviction} />
    </svg>
  );

  return (
    <section ref={sectionRef} className="relative">
      {/* Desktop: one sticky stage (text + ladder held together), driven by
          invisible spacers below. */}
      <div className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <div className="wrap grid h-full grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-center gap-x-12 xl:gap-x-16">
            <div className="relative h-full">
              {STEPS.map((s, i) => (
                <div
                  key={s.key}
                  className={
                    "absolute inset-0 flex items-center transition-opacity duration-500 " +
                    (active === i ? "opacity-100" : "opacity-0")
                  }
                  aria-hidden={active !== i}
                >
                  <div className="w-full">{s.content(figures)}</div>
                </div>
              ))}
            </div>
            <div className="flex h-[86vh] items-center">{svg}</div>
          </div>
        </div>
        {STEPS.map((s, i) => (
          <div key={s.key} data-i={i} className="h-[105vh]" />
        ))}
      </div>

      {/* Mobile: ladder pinned as a banner, narrative flows beneath it. */}
      <div className="lg:hidden">
        <div className="sticky top-0 z-20 mb-2 bg-[var(--background)]/95 py-2 shadow-[0_1px_0_var(--border)] backdrop-blur">
          <div className="h-[30vh] min-h-[13rem] max-h-[18rem]">{svg}</div>
        </div>
        <div className="wrap">
          {STEPS.map((s, i) => (
            <div key={s.key} data-i={i} className="py-12">
              {s.content(figures)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
