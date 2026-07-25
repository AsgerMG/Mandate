"use client";

// The channels graph is the anchor of the home trip. It stays pinned while the
// narrative scrolls; the camera (an animated SVG viewBox) zooms and pans onto
// each public channel in turn, and the focused channel unfolds into its real
// programmes. Overview -> State aid -> Development banks -> (out) -> European
// funds -> (out) -> converge on the public anchor.

import { useEffect, useRef, useState, type ReactNode } from "react";

const ACCENT = "#7f5820";
type Channel = "aid" | "bank" | "eu" | null;

// ── Camera targets (viewBox: x y w h), base canvas 760 x 620 ──────────────────
const CAM = {
  overview: [30, 4, 700, 600],
  aid: [410, 168, 360, 294],
  bank: [400, 280, 380, 310],
  eu: [0, 210, 400, 326],
} as const;

interface Step {
  key: string;
  cam: keyof typeof CAM;
  channel: Channel;
  content: ReactNode;
}

const kicker = (t: string) => (
  <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#7f5820]">{t}</p>
);
const head = (t: string) => (
  <h3
    className="mb-5 text-3xl font-bold leading-[1.1] text-[#141414] sm:text-4xl"
    style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
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
    channel: null,
    content: (
      <div>
        {kicker("The map of the money")}
        {head("Where does a public euro actually come from?")}
        <P>
          Almost every euro a European company gets from the state starts the same way: as{" "}
          {b("tax")}, sitting in a national treasury. From there it takes one of two roads.
        </P>
        <P>
          A government can send it to Brussels, where it is pooled with everyone else&apos;s into
          large {b("European funds")}. Or it can keep it at home, where the {b("national road")} runs
          on two rails: {b("state aid")} and the {b("development banks")}. Different routes, one
          destination. We follow each in turn.
        </P>
      </div>
    ),
  },
  {
    key: "aid",
    cam: "aid",
    channel: "aid",
    content: (
      <div>
        {kicker("The national road · rail one")}
        {head("State aid: a government writing a cheque.")}
        <P>
          &ldquo;State aid&rdquo; sounds technical, but it just means a national government giving
          money straight to a company. EU rules cap how much a country may give and force it to{" "}
          {b("publish every award")} in a public register, which is exactly how we can see it.
        </P>
        <P>
          It is the single largest channel of the lot. Most of it funds{" "}
          {b("research and innovation")}, {b("clean energy and net-zero")}, and big{" "}
          {b("strategic (IPCEI) projects")}. Germany, Italy and Spain move most of their money this
          way.
        </P>
      </div>
    ),
  },
  {
    key: "bank",
    cam: "bank",
    channel: "bank",
    content: (
      <div>
        {kicker("The national road · rail two")}
        {head("Development banks: the state as a lender.")}
        <P>
          A development bank is a government-owned bank whose job is to back companies the private
          market finds too risky. It lends, gives grants, and sometimes takes a stake, all under a
          national plan.
        </P>
        <P>
          Every large economy runs one: {b("KfW")} (with the startup investor HTGF) in Germany,{" "}
          {b("Bpifrance")} in France, {b("ICO and CDTI")} in Spain, {b("CDP")} in Italy. Which door
          you can knock on depends simply on where your company is registered.
        </P>
      </div>
    ),
  },
  {
    key: "out1",
    cam: "overview",
    channel: null,
    content: (
      <div>
        {kicker("Step back")}
        {head("That is only half of the machine.")}
        <P>
          Roughly three quarters of the awards we traced stay national, on those two rails. But the
          other road, the money pooled at EU level, funds the largest and most strategic bets on the
          whole continent. Follow it to Brussels.
        </P>
      </div>
    ),
  },
  {
    key: "eu",
    cam: "eu",
    channel: "eu",
    content: (
      <div>
        {kicker("The European road")}
        {head("European funds: money pooled in Brussels.")}
        <P>
          These are the pots the EU manages centrally, on behalf of every member state, spent through
          a handful of big instruments:
        </P>
        <P>
          {b("Horizon Europe")}, the research engine, in three pillars. The {b("EIC")}, which writes
          grant-plus-equity cheques to single deep-tech startups. The {b("Innovation Fund")}, which
          bankrolls first-of-a-kind green factories from carbon-market revenue. And {b("IPCEI")},
          where countries jointly back strategic industries like batteries and chips.
        </P>
      </div>
    ),
  },
  {
    key: "converge",
    cam: "overview",
    channel: null,
    content: (
      <div>
        {kicker("The hand-off")}
        {head("Why the state goes first.")}
        <P>
          Whichever road it travels, the public euro is built to do one job: go in{" "}
          {b("first")}, when a company is still too risky for private investors to touch. That early
          public backing is the {b("anchor")}. It lowers the risk and signals confidence.
        </P>
        <P>
          The idea is that {b("private capital")}, venture funds and banks, then follows in behind
          with far bigger cheques. That is the design. The rest of this study asks whether the money
          actually follows it.
        </P>
      </div>
    ),
  },
];

// ── Graph geometry ────────────────────────────────────────────────────────────
function Node({
  x,
  y,
  w,
  title,
  sub,
  dim,
  accent,
}: {
  x: number;
  y: number;
  w: number;
  title: string;
  sub?: string;
  dim: number;
  accent?: boolean;
}) {
  const h = 56;
  return (
    <g style={{ opacity: dim, transition: "opacity 0.5s ease" }} filter={accent ? "url(#nodeGlow)" : undefined}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={12}
        fill="url(#nodeFill)"
        stroke={accent ? ACCENT : "rgba(10,10,10,0.22)"}
        strokeWidth={accent ? 1.5 : 1}
      />
      <text
        x={x + w / 2}
        y={sub ? y + 24 : y + 33}
        textAnchor="middle"
        fill="#10203f"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontSize: 15, fontWeight: 700 }}
      >
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + 42} textAnchor="middle" fill="#656d82" style={{ fontSize: 11 }}>
          {sub}
        </text>
      )}
    </g>
  );
}

function SubNode({ x, y, w, label, show, delay }: { x: number; y: number; w: number; label: string; show: boolean; delay: number }) {
  return (
    <g style={{ opacity: show ? 1 : 0, transform: show ? "none" : "translateX(-8px)", transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms` }}>
      <rect x={x} y={y} width={w} height={42} rx={9} fill="rgba(16,32,63,0.07)" stroke="rgba(16,32,63,0.5)" strokeWidth={1} />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" fill="#10203f" style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontSize: 13, fontWeight: 600 }}>
        {label}
      </text>
    </g>
  );
}

// Animated coin flowing along a trail path (money in motion), overview only.
function Flow({ d, dur, begin }: { d: string; dur: number; begin: number }) {
  return (
    <circle r={3.5} fill={ACCENT}>
      <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={d} />
      <animate attributeName="opacity" values="0;1;1;0" dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />
    </circle>
  );
}

// Trail path segments (shared by the drawn trail and the flowing coins).
const TRAILS = [
  "M380 76 C 380 128, 170 128, 170 224",
  "M380 76 C 380 128, 590 128, 590 186",
  "M170 278 C 170 360, 380 372, 380 444",
  "M590 366 C 590 400, 380 400, 380 444",
  "M380 498 L 380 524",
];

function Graph({ channel }: { channel: Channel }) {
  const on = (c: Channel) => (channel === c ? 1 : channel ? 0 : 1);
  const off = channel ? 0 : 1;
  const trail = channel ? 0 : 0.7;

  const euSubs = [
    ["Horizon Europe", 318],
    ["European Innovation Council", 366],
    ["Innovation Fund", 414],
    ["IPCEI", 462],
  ] as const;
  const aidSubs = [
    ["R&D & innovation", 300],
    ["Net-zero & energy", 348],
    ["IPCEI-linked", 396],
  ] as const;
  const bankSubs = [
    ["KfW & HTGF · Germany", 400],
    ["Bpifrance · France", 448],
    ["ICO & CDTI · Spain", 496],
    ["CDP · Italy", 544],
  ] as const;

  return (
    <>
      <defs>
        <linearGradient id="nodeFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#faf9f5" />
        </linearGradient>
        <filter id="nodeGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.07  0 0 0 0 0.15  0 0 0 0 0.31  0 0 0 0.16 0" result="g" />
          <feMerge>
            <feMergeNode in="g" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* national grouping box */}
      <rect
        x={462}
        y={186}
        width={256}
        height={180}
        rx={16}
        fill="rgba(16,32,63,0.025)"
        stroke="rgba(10,10,10,0.12)"
        style={{ opacity: off, transition: "opacity 0.5s ease" }}
      />
      <text x={590} y={176} textAnchor="middle" fill="#656d82" style={{ fontSize: 10.5, letterSpacing: 2.5, opacity: off }}>
        THE NATIONAL ROAD
      </text>

      {/* money trail + glow underlay */}
      <g fill="none" style={{ opacity: trail, transition: "opacity 0.5s ease" }}>
        <g stroke={ACCENT} strokeWidth="7" strokeLinecap="round" opacity="0.12">
          {TRAILS.map((d, i) => <path key={i} d={d} />)}
          <path d="M590 186 L 590 204" />
          <path d="M590 256 L 590 294" />
        </g>
        <g stroke={ACCENT} strokeWidth="2" strokeLinecap="round">
          {TRAILS.map((d, i) => <path key={i} d={d} />)}
          <path d="M590 186 L 590 204" />
          <path d="M590 256 L 590 294" />
        </g>
        {/* flowing coins */}
        {TRAILS.map((d, i) => <Flow key={i} d={d} dur={2.6} begin={i * 0.5} />)}
      </g>

      {/* junction dots */}
      <g fill={ACCENT} style={{ opacity: channel ? 0 : 0.9, transition: "opacity 0.5s ease" }}>
        <circle cx="380" cy="76" r="4" />
        <circle cx="380" cy="444" r="4" />
      </g>

      {/* short connector from the focused parent down into its unfold */}
      <g stroke={ACCENT} strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M170 278 L 170 316" style={{ opacity: channel === "eu" ? 0.55 : 0, transition: "opacity 0.5s ease" }} />
        <path d="M590 256 L 590 298" style={{ opacity: channel === "aid" ? 0.55 : 0, transition: "opacity 0.5s ease" }} />
        <path d="M590 348 L 590 398" style={{ opacity: channel === "bank" ? 0.55 : 0, transition: "opacity 0.5s ease" }} />
      </g>

      {/* sub-nodes (unfold on focus) */}
      {euSubs.map(([l, y], i) => (
        <SubNode key={l} x={80} y={y} w={200} label={l} show={channel === "eu"} delay={i * 70} />
      ))}
      {aidSubs.map(([l, y], i) => (
        <SubNode key={l} x={492} y={y} w={196} label={l} show={channel === "aid"} delay={i * 70} />
      ))}
      {bankSubs.map(([l, y], i) => (
        <SubNode key={l} x={492} y={y} w={196} label={l} show={channel === "bank"} delay={i * 70} />
      ))}

      {/* base nodes */}
      <Node x={270} y={20} w={220} title="National treasuries" sub="tax revenue" dim={off} accent />
      <Node x={75} y={224} w={190} title="European funds" sub="pooled at EU level" dim={on("eu")} accent={channel === "eu"} />
      <Node x={484} y={204} w={212} title="State aid" sub="grants via the EU register" dim={on("aid")} accent={channel === "aid"} />
      <Node x={484} y={294} w={212} title="Development banks" sub="loans, grants, equity" dim={on("bank")} accent={channel === "bank"} />
      <Node x={260} y={444} w={240} title="Public anchor" sub="de-risks the first bets" dim={off} accent />
      <Node x={285} y={524} w={190} title="Private capital" sub="follows in behind" dim={off} />
    </>
  );
}

// ── The pinned, camera-driven section ─────────────────────────────────────────
export function ChannelsGraph() {
  const [active, setActive] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const [vb, setVb] = useState<number[]>([...CAM.overview]);
  const raf = useRef(0);

  // One observer over every [data-i] marker. On each breakpoint only one set is
  // laid out (the other is display:none and never intersects), so a single
  // `active` drives both the desktop stage and the mobile flow.
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

  const channel = STEPS[active].channel;
  const svg = (
    <svg viewBox={vb.join(" ")} className="h-full w-full" role="img" aria-label="How a public euro flows through Europe">
      <Graph channel={channel} />
    </svg>
  );

  return (
    <section ref={sectionRef} className="relative">
      {/* ── Desktop: one sticky stage (text + graph held together), driven by
          invisible spacers below. Each scene holds for a full spacer of scroll,
          then the text crossfades in place — never drifting or blanking. ── */}
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
                  <div className="w-full">{s.content}</div>
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

      {/* ── Mobile: graph pinned as a banner, narrative flows beneath it. ── */}
      <div className="lg:hidden">
        <div className="sticky top-16 z-20 mb-2 border-b border-[var(--border)] bg-[var(--paper)]/95 py-2 backdrop-blur">
          <div className="h-[40vh]">{svg}</div>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          {STEPS.map((s, i) => (
            <div key={s.key} data-i={i} className="py-16">
              {s.content}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
