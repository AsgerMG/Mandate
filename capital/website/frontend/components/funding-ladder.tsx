"use client";

// The founder's-climb anchor of the /for-companies trip — the mirror image of the
// home page's ChannelsGraph. Where the home graph follows one euro *down* into a
// company, this one has the reader climb *up* the public funding stack. It stays
// pinned while the narrative scrolls; the camera (an animated SVG viewBox) pans up
// the ladder, floor by floor, and the focused floor's rungs unfold with their real
// ticket sizes. Signal floor -> the missing middle -> conviction floor -> private
// capital on top. Scrolling down climbs up: the inversion is the point.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtEur } from "@/lib/format";

const GOLD = "#12264f";

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

interface Step {
  key: string;
  cam: keyof typeof CAM;
  tier: Tier;
  content: (r: { signal: Rung[]; conviction: Rung[] }) => ReactNode;
}

const kicker = (t: string) => (
  <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#12264f]">{t}</p>
);
const head = (t: string) => (
  <h3
    className="mb-5 text-3xl font-bold leading-[1.1] text-[#141414] sm:text-4xl"
    style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
  >
    {t}
  </h3>
);
const P = ({ children }: { children: ReactNode }) => (
  <p className="mt-4 max-w-xl leading-relaxed text-[#3f3e37] first:mt-0">{children}</p>
);
const b = (t: string) => <span className="text-[#141414]">{t}</span>;

const STEPS: Step[] = [
  {
    key: "overview",
    cam: "overview",
    tier: null,
    content: () => (
      <div>
        {kicker("The stack")}
        {head("Two floors, and no staircase between them.")}
        <P>
          Europe&apos;s public system is not a ladder you climb one rung at a time. It is two
          separate floors. A {b("signal floor")} of small awards that certify you, and a{" "}
          {b("conviction floor")} of large anchors that finance an industrial buildout.
        </P>
        <P>
          Nothing connects them. You do not climb from one to the other; you are{" "}
          {b("chosen")} onto the top floor. Start at the bottom and work up.
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
          Development-bank programmes and national {b("state aid")} (median around{" "}
          {fmtEur(signal[signal.length - 1].median)}) are volume products: fast-ish, local,
          repeatable. {b("EIC")} and {b("Horizon")} grants are selective, with low odds.
        </P>
        <P>
          The cash is modest. The {b("certification")} is the point: an early public grant
          roughly doubles your odds of venture funding, and roughly triples your odds of private
          equity. Take it to a term sheet.
        </P>
      </div>
    ),
  },
  {
    key: "gap",
    cam: "gap",
    tier: "gap",
    content: () => (
      <div>
        {kicker("The missing middle")}
        {head("There is no escalator up.")}
        <P>
          Only about a {b("third")} of the companies on the top floor climbed there from smaller
          grants. The rest were selected outright, because they sit in a value chain the EU has
          declared strategic: batteries, hydrogen, chips, cloud, defence.
        </P>
        <P>
          So the gap is not crossed by stacking small wins. It is crossed by being{" "}
          {b("strategically relevant")}, and saying so in every application.
        </P>
      </div>
    ),
  },
  {
    key: "conviction",
    cam: "conviction",
    tier: "conviction",
    content: ({ conviction }) => (
      <div>
        {kicker("The conviction floor")}
        {head("Anchors that finance a buildout.")}
        <P>
          The {b("Innovation Fund")} (median {fmtEur(conviction[0].median)}) and{" "}
          {b("IPCEI")} ({fmtEur(conviction[1].median)}) are not applications you fire off. They
          are multi-year positioning projects that involve your member state.
        </P>
        <P>
          When one lands it behaves like a {b("state-underwritten growth round")}. Stegra
          carried EUR 250m from the Innovation Fund into its green-steel buildout; Porsche&apos;s
          Cellforce drew EUR 57m of granted battery aid.
        </P>
      </div>
    ),
  },
  {
    key: "crown",
    cam: "crown",
    tier: "crown",
    content: () => (
      <div>
        {kicker("The hand-off")}
        {head("Then private capital follows.")}
        <P>
          Whichever floor you reach, the public euro is built to go {b("first")}, when you are
          still too risky for private investors to touch. That backing is the anchor: it lowers
          the risk and signals confidence.
        </P>
        <P>
          The rest of this manual is how to {b("earn each floor")}, in order, and convert it into
          a private round. It starts with one question.
        </P>
      </div>
    ),
  },
  {
    key: "door",
    cam: "overview",
    tier: null,
    content: () => (
      <div>
        {kicker("Your move")}
        {head("Which door is even open to you.")}
        <P>
          Which floor you can reach depends first on {b("where you are registered")}: three
          quarters of all awards are national, and every country routes them differently.
        </P>
        <P>Follow the door that fits your address. That is the next chapter.</P>
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
        rx={12}
        fill="url(#rungFill)"
        stroke={accent ? GOLD : "rgba(10,10,10,0.22)"}
        strokeWidth={accent ? 1.5 : 1}
      />
      <text
        x={CX}
        y={sub ? y + 25 : y + 34}
        textAnchor="middle"
        fill="#1d1c18"
        style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontSize: 15, fontWeight: 700 }}
      >
        {title}
      </text>
      {sub && (
        <text x={CX} y={y + 43} textAnchor="middle" fill="#6b6b64" style={{ fontSize: 11 }}>
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
          fill={GOLD}
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
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

  // Dimmed-but-legible on the paper stage; 0.28 vanished against #f3f2ed.
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
          <stop offset="100%" stopColor="#faf9f5" />
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
      <g stroke="rgba(10,10,10,0.14)" strokeWidth="2" fill="none">
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
        fill="#6b6b64"
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
          stroke={GOLD}
          strokeWidth="1.5"
          strokeDasharray="7 9"
          opacity={0.6}
        />
        <text x={CX} y={Y.gapMid - 16} textAnchor="middle" fill="#6b6b64" style={{ fontSize: 11, letterSpacing: 2.5 }}>
          NO STAIRCASE
        </text>
        <text x={CX} y={Y.gapMid + 30} textAnchor="middle" fill="#64748b" style={{ fontSize: 12, fontStyle: "italic" }}>
          you are chosen up, not climbed up
        </text>
      </g>

      {/* Signal floor. */}
      <text
        x={CX}
        y={Y.signalTop - 22}
        textAnchor="middle"
        fill="#6b6b64"
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
      <text x={CX} y={Y.ground + 34} textAnchor="middle" fill="#64748b" style={{ fontSize: 12, fontStyle: "italic" }}>
        the private market will not fund this yet
      </text>
    </>
  );
}

// ── The pinned, camera-driven section ─────────────────────────────────────────
export function FundingLadder({ signal, conviction }: { signal: Rung[]; conviction: Rung[] }) {
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
  const rungs = { signal, conviction };
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
        <div className="sticky top-16 h-[calc(100vh-4rem)]">
          <div className="mx-auto flex h-full max-w-6xl items-center gap-x-12 px-6">
            <div className="relative h-full w-1/2">
              {STEPS.map((s, i) => (
                <div
                  key={s.key}
                  className={
                    "absolute inset-0 flex items-center transition-opacity duration-500 " +
                    (active === i ? "opacity-100" : "opacity-0")
                  }
                  aria-hidden={active !== i}
                >
                  <div className="w-full">{s.content(rungs)}</div>
                </div>
              ))}
            </div>
            <div className="flex h-full w-1/2 items-center">{svg}</div>
          </div>
        </div>
        {STEPS.map((s, i) => (
          <div key={s.key} data-i={i} className="h-[135vh]" />
        ))}
      </div>

      {/* Mobile: ladder pinned as a banner, narrative flows beneath it. */}
      <div className="lg:hidden">
        <div className="sticky top-16 z-20 mb-2 border-b border-black/10 bg-[#f3f2ed]/95 py-2 backdrop-blur">
          <div className="h-[42vh]">{svg}</div>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          {STEPS.map((s, i) => (
            <div key={s.key} data-i={i} className="py-16">
              {s.content(rungs)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
