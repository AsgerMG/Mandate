"use client";

// The case board: the structure of a case drawn, not written. One component per
// board section (lib/bench/board.ts): the answer as a hero card, the route map
// as level lanes of door cards, the funding stack as a segmented bar, the
// roadmap as a swimlane timeline, mechanisms as flow diagrams, the stakeholders
// as an org tree, and the risks. Plain React and SVG, no chart library.
//
// Colour follows the dataviz method, in the bench's palette: door and step
// states always carry an icon and a word (never colour alone); categorical hues
// (funding types, owners) are a fixed order validated for colour-blind
// separation on the bench paper (#fffdfa); text never wears a series colour.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Citation } from "@/lib/bench/events";
import {
  barAmount, DOOR_LABEL, DOOR_STATUS, FUNDING_LABEL, FUNDING_STATUS_LABEL, FUNDING_TYPES, flowLayers, LEVEL_LABEL, LEVELS, money, moneyRange,
  monthsOf, OWNER_LABEL, OWNERS, roadmapOrigin, SIDE_LABEL, SIDES, splitCite, STAGE_LABEL, STAGES, STEP_LABEL,
  type Answer, type Board, type Door, type Folded, type Funding, type Institution, type Level, type Process, type Risk, type Roadmap, type Step,
} from "@/lib/bench/board";
import { Chip } from "./markdown";

// ── palette (validated: scripts/validate_palette.js, light, surface #fffdfa) ──
/** Funding types, fixed order: worst adjacent CVD ΔE 9.3, normal ΔE 19.7. */
const TYPE_COLOR: Record<(typeof FUNDING_TYPES)[number], string> = {
  equity: "#2f5d9e", public_coinvest: "#d08a2c", guarantee_debt: "#2a9a84", loan: "#c4573f", grant: "#8a63b8", customer_side: "#6f9a35",
};
/** Owners take the first three slots (all-pairs safe). */
const OWNER_COLOR: Record<(typeof OWNERS)[number], string> = { client: "#2f5d9e", us: "#d08a2c", institution: "#2a9a84" };
/** Label ink inside a fill: white, except on the light ochre. */
const ON_FILL: Record<string, string> = { "#d08a2c": "#1b1a17", "#6f9a35": "#fff" };
const onFill = (c: string) => ON_FILL[c] ?? "#fff";

type Ctx = { cites: Record<string, Citation>; fresh: Set<string> };

// ── small shared pieces ────────────────────────────────────────────────────

export function Cites({ cite, cites }: { cite?: string[]; cites: Record<string, Citation> }) {
  const { ids, labels } = splitCite(cite);
  if (!ids.length && !labels.length) return null;
  return (
    <span className="mb-cites">
      {ids.map((id) => <Chip key={id} id={id} cite={cites[id]} />)}
      {labels.map((l) => <span key={l} className="mb-label" data-label={l}>{l}</span>)}
    </span>
  );
}

const Fresh = ({ on }: { on: boolean }) => (on ? <span className="mb-fresh" title="Set or changed in the latest reply">New</span> : null);

function StatusIcon({ status }: { status: string }) {
  // one glyph per state, so the state reads without colour
  const p = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true } as const;
  switch (status) {
    case "open": case "done": case "secured": case "engaged":
      return <svg {...p}><circle cx="6" cy="6" r="6" fill="currentColor" /><path d="M3.4 6.2 5.2 8l3.4-3.6" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "probe": case "in_progress": case "active":
      return <svg {...p}><circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M6 .75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" /></svg>;
    case "park": case "parked":
      return <svg {...p}><circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M4.6 3.8v4.4M7.4 3.8v4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "shut": case "blocked":
      return <svg {...p}><circle cx="6" cy="6" r="6" fill="currentColor" /><path d="m4 4 4 4M8 4 4 8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>;
    default:
      return <svg {...p}><circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" /></svg>;
  }
}

function Status({ status, label }: { status: string; label: string }) {
  return <span className="mb-status" data-status={status}><StatusIcon status={status} />{label}</span>;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function Section({ id, eyebrow, title, aside, children }: { id: string; eyebrow: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-section" id={`board-${id}`} aria-labelledby={`board-${id}-h`}>
      <header className="mb-section__head">
        <div>
          <p className="mb-eyebrow">{eyebrow}</p>
          <h2 className="mb-section__title" id={`board-${id}-h`}>{title}</h2>
        </div>
        {aside && <div className="mb-section__aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

// ── the hero answer ────────────────────────────────────────────────────────

function Stages({ stage }: { stage?: Board["stage"] }) {
  const at = stage ? STAGES.indexOf(stage) : -1;
  return (
    <ol className="mb-stages" aria-label="Where the case stands">
      {STAGES.map((s, i) => (
        <li key={s} data-state={i < at ? "done" : i === at ? "now" : "next"} aria-current={i === at ? "step" : undefined}>
          <i aria-hidden />{STAGE_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}

function Confidence({ level }: { level: Answer["confidence"] }) {
  const n = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="mb-conf" data-level={level} role="img" aria-label={`Confidence ${level}`}>
      {[1, 2, 3].map((i) => <i key={i} data-on={i <= n || undefined} />)}
      <b>{level.charAt(0).toUpperCase() + level.slice(1)} confidence</b>
    </span>
  );
}

export function AnswerHero({ board, ctx, brain }: { board: Board; ctx: Ctx; brain?: string }) {
  const a = board.answer;
  return (
    <section className="mb-hero" id="board-answer">
      <div className="mb-hero__top">
        <p className="mb-eyebrow mb-eyebrow--light">{brain ? `${brain} · ` : ""}The answer<Fresh on={ctx.fresh.has("answer")} /></p>
        <Stages stage={board.stage} />
      </div>
      {a ? (
        <>
          <ol className="mb-hero__lines">
            {a.lines.map((l, i) => <li key={i}><span className="mb-hero__n">{i + 1}</span><span>{l}</span></li>)}
          </ol>
          <div className="mb-hero__foot">
            <div className="mb-hero__conf">
              <Confidence level={a.confidence} />
              {a.confidence_why && <p>{a.confidence_why}</p>}
              <Cites cite={a.cite} cites={ctx.cites} />
            </div>
            <div className="mb-hero__q">
              <p className="mb-eyebrow">The decisive open question</p>
              <p className="mb-hero__qtext">{a.open_question}</p>
            </div>
          </div>
        </>
      ) : <p className="mb-hero__pending">The recommendation appears here once the options are on the table.</p>}
    </section>
  );
}

// ── key figures ────────────────────────────────────────────────────────────

export function KeyFigures({ board }: { board: Board }) {
  const doors = board.routes?.levels.flatMap((l) => l.doors) ?? [];
  const count = (s: Door["status"]) => doors.filter((d) => d.status === s).length;
  const f = board.funding_stack;
  const cur = f?.currency ?? "EUR";
  const covered = f ? f.instruments.reduce((s, i) => s + barAmount(i), 0) : 0;
  const breakers = board.risks_flags?.filter((r) => r.kind === "deal_breaker").length ?? 0;
  const milestones = board.roadmap ? nextMilestones(board.roadmap) : [];
  const tiles: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] = [];
  if (doors.length) tiles.push({
    label: "Doors mapped", value: doors.length,
    sub: <span className="mb-tile__doors">{DOOR_STATUS.map((s) => count(s) ? <span key={s} className="mb-status" data-status={s}><StatusIcon status={s} />{count(s)} {DOOR_LABEL[s].toLowerCase()}</span> : null)}</span>,
  });
  if (f?.need) tiles.push({ label: "Capital need", value: money(f.need.amount, cur), sub: `${money(covered, cur)} mapped, ${Math.round((covered / f.need.amount) * 100)}% at midpoints` });
  if (board.risks_flags?.length) tiles.push({ label: "Deal-breakers", value: breakers, sub: `${board.risks_flags.length - breakers} further flags` });
  if (milestones[0]) tiles.push({ label: "Next milestone", value: <span className="mb-tile__ms">{milestones[0].label}</span>, sub: milestones[0].when });
  if (!tiles.length) return null;
  return (
    <div className="mb-tiles" data-n={tiles.length}>
      {tiles.map((t) => (
        <div key={t.label} className="mb-tile">
          <p className="mb-tile__label">{t.label}</p>
          <p className="mb-tile__value">{t.value}</p>
          {t.sub && <div className="mb-tile__sub">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthName(origin: string | undefined, m: number, long = false): string {
  if (!origin) return `Month ${Math.floor(m) + 1}`;
  const [y, mo] = origin.split("-").map(Number);
  const idx = y * 12 + mo - 1 + Math.floor(m);
  const name = MONTH[idx % 12];
  return long ? `${name} ${Math.floor(idx / 12)}` : `${name} ’${String(Math.floor(idx / 12)).slice(2)}`;
}
function nextMilestones(r: Roadmap) {
  const origin = roadmapOrigin(r);
  return r.tracks.flatMap((t) => t.steps).filter((s) => s.milestone && s.status !== "done")
    .map((s) => ({ label: s.label, m: monthsOf(s.start, origin) }))
    .sort((a, b) => a.m - b.m)
    .map((s) => ({ label: s.label, when: origin ? monthName(origin, s.m, true) : `Month ${Math.floor(s.m) + 1}` }));
}

// ── the route map ──────────────────────────────────────────────────────────

export function RouteMap({ levels, ctx }: { levels: Level[]; ctx: Ctx }) {
  const [filter, setFilter] = useState<Door["status"] | null>(null);
  const ordered = [...levels].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  const counts = Object.fromEntries(DOOR_STATUS.map((s) => [s, levels.flatMap((l) => l.doors).filter((d) => d.status === s).length]));
  return (
    <Section id="routes" eyebrow="Route map" title="Where the doors are, level by level"
      aside={
        <div className="mb-filter" role="group" aria-label="Show doors by status">
          <button data-on={filter === null || undefined} onClick={() => setFilter(null)}>All</button>
          {DOOR_STATUS.filter((s) => counts[s]).map((s) => (
            <button key={s} data-on={filter === s || undefined} onClick={() => setFilter(filter === s ? null : s)}>
              <span className="mb-status" data-status={s}><StatusIcon status={s} /></span>{DOOR_LABEL[s]} <b>{counts[s]}</b>
            </button>
          ))}
        </div>
      }>
      <div className="mb-lanes">
        {ordered.map((l) => {
          const doors = filter ? l.doors.filter((d) => d.status === filter) : l.doors;
          return (
            <div key={l.id} className="mb-lane" data-level={l.level} data-empty={!doors.length || undefined}>
              <div className="mb-lane__label">
                {LEVEL_LABEL[l.level] !== l.label && <span className="mb-lane__level">{LEVEL_LABEL[l.level]}</span>}
                <span className="mb-lane__name">{l.label}</span>
                {l.country && l.country !== l.label && <span className="mb-lane__cc">{l.country}</span>}
              </div>
              <div className="mb-lane__doors">
                {doors.map((d) => <DoorCard key={d.id} d={d} ctx={ctx} fresh={ctx.fresh.has(`routes:${l.id}:${d.id}`)} />)}
                {!doors.length && <p className="mb-lane__none">No {filter ? DOOR_LABEL[filter].toLowerCase() : ""} doors at this level.</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function DoorCard({ d, ctx, fresh }: { d: Door; ctx: Ctx; fresh: boolean }) {
  return (
    <article className="mb-door" data-status={d.status}>
      <div className="mb-door__top">
        <Status status={d.status} label={DOOR_LABEL[d.status]} />
        <Fresh on={fresh} />
      </div>
      <h3 className="mb-door__name">{d.name}</h3>
      {(d.institution || d.via) && (
        <p className="mb-door__who">
          {d.institution}
          {d.via && <span className="mb-door__via"><svg width="14" height="8" viewBox="0 0 14 8" aria-hidden><path d="M1 4h11m-3-3 3 3-3 3" stroke="currentColor" fill="none" strokeWidth="1.2" /></svg>via {d.via}</span>}
        </p>
      )}
      <p className="mb-door__why">{d.why}</p>
      {d.conditions?.length ? (
        <ul className="mb-door__cond">{d.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul>
      ) : null}
      <Cites cite={d.cite} cites={ctx.cites} />
    </article>
  );
}

// ── the funding stack ──────────────────────────────────────────────────────

export function FundingStack({ f, ctx }: { f: Funding; ctx: Ctx }) {
  const cur = f.currency ?? "EUR";
  const [hover, setHover] = useState<string | null>(null);
  const sized = f.instruments.filter((i) => barAmount(i) > 0)
    .sort((a, b) => FUNDING_TYPES.indexOf(a.type) - FUNDING_TYPES.indexOf(b.type));
  const total = sized.reduce((s, i) => s + barAmount(i), 0);
  const need = f.need?.amount ?? 0;
  const scale = Math.max(total, need) || 1;
  const gap = need > total ? need - total : 0;
  const [barRef, barW] = useWidth<HTMLDivElement>();
  const types = FUNDING_TYPES.filter((t) => f.instruments.some((i) => i.type === t));
  const ordered = [...f.instruments].sort((a, b) => FUNDING_TYPES.indexOf(a.type) - FUNDING_TYPES.indexOf(b.type));
  return (
    <Section id="funding" eyebrow="Funding stack" title={f.need ? "How the capital need is covered" : "The instruments in play"}
      aside={f.need && <p className="mb-aside-note">{f.need.label}</p>}>
      <div className="mb-stack">
        <div className="mb-stack__scale">
          <span>{money(0, cur).replace(/0$/, "0")}</span>
          {need > 0 && <span className="mb-stack__need" style={{ left: `${(need / scale) * 100}%` }}>Need {money(need, cur)}</span>}
          <span className="mb-stack__total" style={need > 0 && Math.abs(need - scale) / scale < 0.18 ? { visibility: "hidden" } : undefined}>{money(scale, cur)}</span>
        </div>
        <div ref={barRef} className="mb-stack__bar" role="img"
          aria-label={`Funding stack: ${sized.map((i) => `${i.name} ${moneyRange(i, cur)}`).join("; ")}${gap ? `; uncovered ${money(gap, cur)}` : ""}`}>
          {sized.map((i) => {
            const w = (barAmount(i) / scale) * 100;
            const label = moneyRange(i, cur) ?? "";
            const fits = (w / 100) * barW > label.length * 7 + 14;
            const c = TYPE_COLOR[i.type];
            return (
              <div key={i.id} className="mb-stack__seg" tabIndex={0} data-dim={(hover && hover !== i.id) || undefined} data-status={i.status}
                style={{ flexGrow: barAmount(i), background: c, color: onFill(c) }}
                onMouseEnter={() => setHover(i.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i.id)} onBlur={() => setHover(null)}
                aria-label={`${i.name}: ${label}, ${FUNDING_STATUS_LABEL[i.status]}`}>
                {fits && <span>{label}</span>}
              </div>
            );
          })}
          {gap > 0 && <div className="mb-stack__seg mb-stack__seg--gap" style={{ flexGrow: gap }}><span>{(gap / scale) * barW > 110 ? `Uncovered ${money(gap, cur)}` : ""}</span></div>}
          {need > 0 && <i className="mb-stack__needline" style={{ left: `${(need / scale) * 100}%` }} aria-hidden />}
        </div>
        {hover && (() => {
          const i = f.instruments.find((x) => x.id === hover)!;
          return <p className="mb-stack__hover"><span className="mb-swatch" style={{ background: TYPE_COLOR[i.type] }} /><b>{i.name}</b> · {moneyRange(i, cur)} · {i.terms}</p>;
        })()}
        <ul className="mb-legend" aria-label="Instrument types">
          {types.map((t) => <li key={t}><span className="mb-swatch" style={{ background: TYPE_COLOR[t] }} />{FUNDING_LABEL[t]}</li>)}
          {gap > 0 && <li><span className="mb-swatch mb-swatch--gap" />Not yet covered</li>}
        </ul>
      </div>
      <table className="mb-table">
        <thead><tr><th>Instrument</th><th>Type</th><th className="mb-num">Amount</th><th>Cost and terms</th><th>Status</th><th>Basis</th></tr></thead>
        <tbody>
          {ordered.map((i) => (
            <tr key={i.id} data-dim={(hover && hover !== i.id) || undefined} onMouseEnter={() => setHover(i.id)} onMouseLeave={() => setHover(null)}>
              <td><span className="mb-swatch" style={{ background: TYPE_COLOR[i.type] }} /><b>{i.name}</b>{i.via && <span className="mb-sub">via {i.via}</span>}<Fresh on={ctx.fresh.has(`funding:${i.id}`)} /></td>
              <td>{FUNDING_LABEL[i.type]}</td>
              <td className="mb-num">{moneyRange(i, cur) ?? <span className="mb-sub">no cash / open</span>}</td>
              <td>{i.terms}</td>
              <td><Status status={i.status} label={FUNDING_STATUS_LABEL[i.status]} /></td>
              <td><Cites cite={i.cite} cites={ctx.cites} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

// ── the roadmap ────────────────────────────────────────────────────────────

type Placed = { s: Step; track: string; x0: number; x1: number; y: number; m0: number; m1: number };
const HEAD_H = 30, TRACK_H = 30, ROW_H = 26, BAR_H = 14;
/** One step per row, its label in the left column: the bars carry time only,
 *  so a dependency line never runs through text. */
export function RoadmapView({ r, ctx }: { r: Roadmap; ctx: Ctx }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const origin = roadmapOrigin(r);
  const layout = useMemo(() => {
    const all = r.tracks.flatMap((t) => t.steps);
    const ends = all.map((s) => (s.end !== undefined ? monthsOf(s.end, origin) : monthsOf(s.start, origin) + 0.5));
    const horizon = Math.max(r.horizon ?? 0, Math.ceil(Math.max(1, ...ends)));
    const W = Math.max(width, 640);
    const LABEL_W = Math.round(Math.min(300, Math.max(220, W * 0.27)));
    const px = (W - LABEL_W - 20) / horizon;
    const X = (m: number) => LABEL_W + m * px;
    const placed: Placed[] = [];
    const tracks: { id: string; label: string; y: number; h: number }[] = [];
    let y = HEAD_H;
    for (const t of r.tracks) {
      const top = y;
      y += TRACK_H;
      const sorted = [...t.steps].sort((a, b) => monthsOf(a.start, origin) - monthsOf(b.start, origin) || (a.milestone ? 1 : 0) - (b.milestone ? 1 : 0));
      for (const s of sorted) {
        const m0 = monthsOf(s.start, origin);
        const m1 = s.milestone ? m0 : s.end !== undefined ? monthsOf(s.end, origin) : m0 + 0.5;
        placed.push({ s, track: t.id, m0, m1, x0: X(m0), x1: s.milestone ? X(m0) : Math.max(X(m1), X(m0) + 6), y });
        y += ROW_H;
      }
      y += 6;
      tracks.push({ id: t.id, label: t.label, y: top, h: y - top });
    }
    return { placed, tracks, horizon, X, W, H: y + 4, LABEL_W };
  }, [r, origin, width]);
  const { placed, tracks, horizon, X, W, H, LABEL_W } = layout;
  const byId = new Map(placed.map((p) => [p.s.id, p]));
  const today = origin ? (() => { const n = new Date(); const t = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; return monthsOf(t, origin); })() : null;
  const tickEvery = horizon > 18 ? 3 : horizon > 10 ? 2 : 1;
  const hovered = hover ? byId.get(hover) : null;
  const related = new Set<string>(hovered ? [hovered.s.id, ...(hovered.s.depends_on ?? []), ...placed.filter((p) => p.s.depends_on?.includes(hovered.s.id)).map((p) => p.s.id)] : []);
  const maxChars = Math.floor((LABEL_W - 52) / 6.3);
  const fit = (t: string) => (t.length > maxChars ? `${t.slice(0, maxChars - 1).trimEnd()}…` : t);

  return (
    <Section id="roadmap" eyebrow="Roadmap" title="What happens when, and what waits on what"
      aside={
        <ul className="mb-legend mb-legend--inline" aria-label="Who carries each step">
          {OWNERS.map((o) => <li key={o}><span className="mb-swatch" style={{ background: OWNER_COLOR[o] }} />{OWNER_LABEL[o]}</li>)}
          <li><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)" fill="#132342" /></svg>Milestone</li>
          <li><svg width="22" height="10" aria-hidden><path d="M1 5h16" stroke="#9a8d70" /><path d="M15 2l5 3-5 3z" fill="#9a8d70" /></svg>Waits on</li>
        </ul>
      }>
      <div ref={ref} className="mb-roadmap">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: "100%", height: "auto" }} role="img" aria-label="Roadmap: tracks of steps over time with their dependencies" onMouseLeave={() => setHover(null)}>
          <defs>
            <marker id="mb-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" fill="#9a8d70" /></marker>
            <marker id="mb-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" fill="#132342" /></marker>
            <pattern id="mb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f6e3de" /><path d="M0 0v6" stroke="#c46a5a" strokeWidth="2" /></pattern>
          </defs>
          {/* track bands */}
          {tracks.map((t, i) => (
            <g key={t.id}>
              <rect x={0} y={t.y} width={W} height={t.h} fill={i % 2 ? "#fbf8f1" : "#fffdfa"} />
              <line x1={0} x2={W} y1={t.y} y2={t.y} stroke="#e6dfd1" />
              <text x={14} y={t.y + 20} className="mb-rm__lane">{t.label}</text>
            </g>
          ))}
          {/* the hovered row */}
          {hovered && <rect x={0} y={hovered.y} width={W} height={ROW_H} fill="#f4ecda" />}
          <line x1={LABEL_W - 8} x2={LABEL_W - 8} y1={0} y2={H} stroke="#e6dfd1" />
          {/* month grid */}
          {Array.from({ length: horizon + 1 }, (_, m) => (
            <g key={m}>
              <line x1={X(m)} x2={X(m)} y1={HEAD_H - 4} y2={H} stroke={m === 0 ? "#d8cfbc" : "#efe9dc"} />
              {m < horizon && m % tickEvery === 0 && <text x={X(m) + 5} y={HEAD_H - 11} className="mb-rm__tick">{monthName(origin, m)}</text>}
            </g>
          ))}
          {today !== null && today >= 0 && today <= horizon && (
            <g>
              <line x1={X(today)} x2={X(today)} y1={HEAD_H - 4} y2={H} stroke="#a6752e" strokeWidth={1.5} />
              <text x={X(today) + 4} y={HEAD_H - 11} className="mb-rm__today">Today</text>
            </g>
          )}
          {/* dependencies: from the end of what it waits on to its start */}
          {placed.flatMap((p) => (p.s.depends_on ?? []).map((dep) => {
            const a = byId.get(dep);
            if (!a) return null;
            const on = !!hovered && (hovered.s.id === p.s.id || hovered.s.id === dep);
            const ax = a.s.milestone ? a.x0 + 7 : a.x1 + 1, ay = a.y + ROW_H / 2;
            const bx = p.s.milestone ? p.x0 - 8 : p.x0 - 2, by = p.y + ROW_H / 2;
            const down = by > ay ? 1 : -1;
            const turn = Math.max(ax + 6, Math.min(bx - 10, ax + 10));
            const r4 = Math.min(4, Math.abs(by - ay) / 2);
            const d = Math.abs(ay - by) < 1 ? `M${ax} ${ay}H${bx}`
              : `M${ax} ${ay}H${turn - r4}q${r4} 0 ${r4} ${down * r4}V${by - down * r4}q0 ${down * r4} ${bx >= turn ? r4 : -r4} ${down * r4}H${bx}`;
            return <path key={`${dep}>${p.s.id}`} d={d} fill="none" stroke={on ? "#132342" : "#9a8d70"} strokeWidth={on ? 1.5 : 1} markerEnd={`url(#${on ? "mb-arrow-on" : "mb-arrow"})`} opacity={hovered && !on ? 0.25 : 0.85} />;
          }))}
          {/* steps */}
          {placed.map((p) => {
            const c = OWNER_COLOR[p.s.owner];
            const dim = hovered && !related.has(p.s.id);
            const fresh = ctx.fresh.has(`roadmap:${p.s.id}`);
            const cy = p.y + ROW_H / 2;
            const solid = p.s.status === "active" || p.s.status === "done";
            return (
              <g key={p.s.id} className="mb-rm__step" tabIndex={0} style={{ outline: "none", cursor: "default" }}
                onMouseEnter={() => setHover(p.s.id)} onFocus={() => setHover(p.s.id)} onBlur={() => setHover(null)}
                aria-label={`${p.s.label}: ${OWNER_LABEL[p.s.owner]}, ${STEP_LABEL[p.s.status]}`}>
                <rect x={0} y={p.y} width={W} height={ROW_H} fill="transparent" />
                <g opacity={dim ? 0.35 : 1}>
                  {/* the label column: state glyph, label, New */}
                  <g transform={`translate(26 ${cy - 6})`} className="mb-rm__glyph" data-status={p.s.status} color={p.s.status === "done" ? "#2f7d4f" : p.s.status === "active" ? "#a8741b" : p.s.status === "blocked" ? "#b5452f" : "#a39a88"}>
                    <StatusIcon status={p.s.status} />
                  </g>
                  <text x={44} y={cy + 4} className="mb-rm__label" data-ms={p.s.milestone || undefined} data-done={p.s.status === "done" || undefined}>{fit(p.s.label)}</text>
                  {fresh && <circle cx={LABEL_W - 18} cy={cy} r={3.5} fill="#a6752e"><title>Changed in the latest reply</title></circle>}
                  {p.s.milestone ? (
                    <rect x={p.x0 - 6} y={cy - 6} width={12} height={12} transform={`rotate(45 ${p.x0} ${cy})`} fill={p.s.status === "done" ? "#8d98ae" : "#132342"} stroke="#fffdfa" strokeWidth={2} />
                  ) : (
                    <>
                      <rect x={p.x0} y={cy - BAR_H / 2} width={p.x1 - p.x0} height={BAR_H} rx={4}
                        fill={p.s.status === "blocked" ? "url(#mb-hatch)" : solid ? c : `${c}38`} opacity={p.s.status === "done" ? 0.5 : 1} />
                      {!solid && p.s.status !== "blocked" && <rect x={p.x0} y={cy - BAR_H / 2} width={3} height={BAR_H} rx={1.5} fill={c} />}
                      {p.s.status === "active" && <circle cx={p.x1 - 7} cy={cy} r={2.5} fill={onFill(c)} className="mb-rm__pulse" />}
                    </>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="mb-tip" style={{ left: Math.max(LABEL_W, Math.min(hovered.x0, W - 280)), top: hovered.y + ROW_H + 4 }}>
            <p className="mb-tip__title">{hovered.s.label}</p>
            <p><span className="mb-swatch" style={{ background: OWNER_COLOR[hovered.s.owner] }} />{OWNER_LABEL[hovered.s.owner]} · <Status status={hovered.s.status} label={STEP_LABEL[hovered.s.status]} /></p>
            <p className="mb-sub">{hovered.s.milestone ? monthName(origin, hovered.m0, true) : `${monthName(origin, hovered.m0, true)} to ${monthName(origin, Math.max(hovered.m0, hovered.m1 - 0.01), true)}`}
              {hovered.s.depends_on?.length ? ` · after ${hovered.s.depends_on.map((d) => byId.get(d)?.s.label ?? d).join(", ")}` : ""}</p>
            {hovered.s.note && <p>{hovered.s.note}</p>}
          </div>
        )}
      </div>
      <details className="mb-tableview">
        <summary>Roadmap as a table</summary>
        <table className="mb-table">
          <thead><tr><th>Track</th><th>Step</th><th>When</th><th>Owner</th><th>Status</th><th>After</th><th>Basis</th></tr></thead>
          <tbody>{r.tracks.flatMap((t) => t.steps.map((s) => {
            const p = byId.get(s.id)!;
            return (
              <tr key={s.id}><td>{t.label}</td><td>{s.label}{s.milestone ? " (milestone)" : ""}</td>
                <td>{s.milestone ? monthName(origin, p.m0, true) : `${monthName(origin, p.m0, true)} to ${monthName(origin, Math.max(p.m0, p.m1 - 0.01), true)}`}</td>
                <td>{OWNER_LABEL[s.owner]}</td><td><Status status={s.status} label={STEP_LABEL[s.status]} /></td>
                <td>{s.depends_on?.map((d) => byId.get(d)?.s.label ?? d).join(", ")}</td><td><Cites cite={s.cite} cites={ctx.cites} /></td></tr>
            );
          }))}</tbody>
        </table>
      </details>
    </Section>
  );
}

// ── process diagrams ───────────────────────────────────────────────────────

const NODE_W = 170, NODE_H = 58, COL_GAP = 170, ROW_GAP = 64;
const EDGE_STYLE: Record<string, { stroke: string; dash?: string; label: string }> = {
  money: { stroke: "#2f5d9e", label: "Money" },
  risk: { stroke: "#b07a22", dash: "5 4", label: "Risk cover" },
  asset: { stroke: "#2a9a84", label: "Goods or service" },
  info: { stroke: "#9a917f", dash: "2 3", label: "Information" },
};

function edgePoint(cx: number, cy: number, tx: number, ty: number) {
  // where the line from a node's centre toward (tx, ty) leaves its box
  const dx = tx - cx, dy = ty - cy;
  const sx = (NODE_W / 2 + 4) / Math.abs(dx || 1e-6), sy = (NODE_H / 2 + 4) / Math.abs(dy || 1e-6);
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

export function ProcessDiagram({ p, ctx }: { p: Process; ctx: Ctx }) {
  const L = useMemo(() => flowLayers(p.nodes, p.edges), [p]);
  const pinned = p.nodes.some((n) => n.col !== undefined || n.row !== undefined);
  const perCol = Array.from({ length: L.cols }, (_, c) => p.nodes.filter((n) => L.col[n.id] === c).length);
  const W = L.cols * NODE_W + (L.cols - 1) * COL_GAP + 24;
  const H = L.rows * NODE_H + (L.rows - 1) * ROW_GAP + 24;
  const pos = Object.fromEntries(p.nodes.map((n) => {
    const c = L.col[n.id];
    const offset = pinned ? 0 : ((L.rows - perCol[c]) * (NODE_H + ROW_GAP)) / 2;
    return [n.id, { x: 12 + c * (NODE_W + COL_GAP), y: 12 + offset + L.row[n.id] * (NODE_H + ROW_GAP) }];
  }));
  const kinds = [...new Set(p.edges.map((e) => e.kind ?? "money"))];
  return (
    <figure className="mb-flow">
      <figcaption>
        <h3 className="mb-flow__title">{p.title}<Fresh on={ctx.fresh.has(`process:${p.id}`)} /></h3>
        {p.caption && <p className="mb-flow__cap">{p.caption}</p>}
      </figcaption>
      <div className="mb-flow__canvas">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} style={{ maxWidth: "100%", height: "auto" }} role="img" aria-label={`${p.title}: ${p.edges.map((e) => `${p.nodes.find((n) => n.id === e.from)?.label} ${e.label} ${p.nodes.find((n) => n.id === e.to)?.label}`).join("; ")}`}>
          <defs>
            {Object.entries(EDGE_STYLE).map(([k, s]) => (
              <marker key={k} id={`mb-flow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill={s.stroke} /></marker>
            ))}
          </defs>
          {p.edges.map((e, i) => {
            const a = pos[e.from], b = pos[e.to];
            const acx = a.x + NODE_W / 2, acy = a.y + NODE_H / 2, bcx = b.x + NODE_W / 2, bcy = b.y + NODE_H / 2;
            const twin = p.edges.some((o) => o.from === e.to && o.to === e.from);
            const st = EDGE_STYLE[e.kind ?? "money"];
            // a pair of opposite edges bows apart; a lone edge runs straight
            const len = Math.hypot(bcx - acx, bcy - acy) || 1;
            const bow = twin ? 26 : 0;
            const nx = -(bcy - acy) / len, ny = (bcx - acx) / len;
            const mx = (acx + bcx) / 2 + nx * bow, my = (acy + bcy) / 2 + ny * bow;
            const [sx, sy] = edgePoint(acx, acy, mx, my);
            const [tx, ty] = edgePoint(bcx, bcy, mx, my);
            const lx = (sx + 2 * mx + tx) / 4, ly = (sy + 2 * my + ty) / 4;
            const lw = Math.min(e.label.length * 6 + 16, 190);
            return (
              <g key={i}>
                <path d={`M${sx} ${sy}Q${mx} ${my} ${tx} ${ty}`} fill="none" stroke={st.stroke} strokeWidth={1.75} strokeDasharray={st.dash} markerEnd={`url(#mb-flow-${e.kind ?? "money"})`} />
                <rect x={lx - lw / 2} y={ly - 10} width={lw} height={20} rx={10} fill="#fffdfa" stroke="#e6dfd1" />
                <text x={lx} y={ly + 4} textAnchor="middle" className="mb-flow__elabel">{e.label.length > 30 ? `${e.label.slice(0, 29)}…` : e.label}</text>
              </g>
            );
          })}
          {p.nodes.map((n) => {
            const { x, y } = pos[n.id];
            return (
              <g key={n.id} className="mb-flow__node" data-kind={n.kind ?? "other"}>
                <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={10} />
                <text x={x + NODE_W / 2} y={y + (n.sub ? 24 : 32)} textAnchor="middle" className="mb-flow__nlabel">{n.label}</text>
                {n.sub && <text x={x + NODE_W / 2} y={y + 41} textAnchor="middle" className="mb-flow__nsub">{n.sub}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mb-flow__foot">
        <ul className="mb-legend mb-legend--inline">
          {kinds.map((k) => (
            <li key={k}><svg width="22" height="8" aria-hidden><line x1="0" x2="22" y1="4" y2="4" stroke={EDGE_STYLE[k].stroke} strokeWidth="2" strokeDasharray={EDGE_STYLE[k].dash} /></svg>{EDGE_STYLE[k].label}</li>
          ))}
        </ul>
        <Cites cite={p.cite} cites={ctx.cites} />
      </div>
    </figure>
  );
}

export function Processes({ list, ctx }: { list: Process[]; ctx: Ctx }) {
  return (
    <Section id="process" eyebrow="Mechanisms" title={list.length > 1 ? "How the mechanisms work" : "How the mechanism works"}>
      <div className="mb-flows" data-n={list.length}>{list.map((p) => <ProcessDiagram key={p.id} p={p} ctx={ctx} />)}</div>
    </Section>
  );
}

// ── stakeholders ───────────────────────────────────────────────────────────

export function Stakeholders({ list, ctx }: { list: Institution[]; ctx: Ctx }) {
  const sides = SIDES.filter((s) => list.some((i) => i.side === s));
  const roles = list.flatMap((i) => i.units.flatMap((u) => u.roles));
  const p1 = roles.filter((r) => r.priority === "P1").length;
  const engaged = roles.filter((r) => r.status === "engaged").length;
  return (
    <Section id="stakeholders" eyebrow="Stakeholders" title="Who decides, who influences, and how to reach them"
      aside={<p className="mb-aside-note"><b>{p1}</b> P1 deciders · <b>{roles.length - p1}</b> P2 influencers · <b>{engaged}</b> engaged</p>}>
      <div className="mb-org" data-cols={sides.length}>
        {sides.map((side) => (
          <div key={side} className="mb-org__side" data-side={side}>
            <div className="mb-org__sidehead"><span className="mb-lane__level">Side</span><span className="mb-lane__name">{SIDE_LABEL[side]}</span></div>
            <div className="mb-org__insts">
            {list.filter((i) => i.side === side).map((inst) => (
              <div key={inst.id} className="mb-org__inst">
                <div className="mb-org__insthead">
                  <span className="mb-org__instname">{inst.name}</span>
                  {inst.country && <span className="mb-lane__cc">{inst.country}</span>}
                </div>
                <ul className="mb-org__units">
                  {inst.units.map((u) => (
                    <li key={u.id} className="mb-org__unit">
                      <span className="mb-org__unitname">{u.name}</span>
                      <ul className="mb-org__roles">
                        {u.roles.map((r) => (
                          <li key={r.id} className="mb-org__role" data-status={r.status}>
                            <div className="mb-org__rolehead">
                              <span className="mb-prio" data-p={r.priority} title={r.priority === "P1" ? "P1: decides" : "P2: influences"}>{r.priority}</span>
                              <span className="mb-org__rolename">{r.role}</span>
                              <Fresh on={ctx.fresh.has(`stakeholders:${inst.id}:${u.id}:${r.id}`)} />
                            </div>
                            <p className="mb-org__reach"><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden><path d="M2 6h7M6.5 3 9.5 6l-3 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" /></svg>{r.reach}</p>
                            {r.note && <p className="mb-org__note">{r.note}</p>}
                            <div className="mb-org__rolefoot">
                              <Status status={r.status} label={r.status === "engaged" ? "Engaged" : "To approach"} />
                              <Cites cite={r.cite} cites={ctx.cites} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── risks and flags ────────────────────────────────────────────────────────

const SEV_ORDER = { high: 0, medium: 1, low: 2 } as const;
export function Risks({ list, ctx }: { list: Risk[]; ctx: Ctx }) {
  const sorted = [...list].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "deal_breaker" ? -1 : 1) || SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return (
    <Section id="risks" eyebrow="Risks and flags" title="What could stop it, and the fix">
      <ol className="mb-risks">
        {sorted.map((r) => (
          <li key={r.id} className="mb-risk" data-kind={r.kind} data-sev={r.severity}>
            <div className="mb-risk__sev">
              <span className="mb-sev" data-sev={r.severity}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  {r.severity === "high" ? <path d="M6 1 11.5 11h-11z" fill="currentColor" /> : r.severity === "medium" ? <path d="M6 1.2 10.8 6 6 10.8 1.2 6z" fill="currentColor" /> : <circle cx="6" cy="6" r="4.5" fill="currentColor" />}
                </svg>
                {r.severity === "high" ? "High" : r.severity === "medium" ? "Medium" : "Low"}
              </span>
              {r.kind === "deal_breaker" && <span className="mb-risk__kind">Deal-breaker</span>}
            </div>
            <div className="mb-risk__body">
              <h3 className="mb-risk__title">{r.title}<Fresh on={ctx.fresh.has(`risk:${r.id}`)} /></h3>
              {r.detail && <p className="mb-risk__detail">{r.detail}</p>}
              <p className="mb-risk__fix"><b>Fix</b>{r.fix}</p>
            </div>
            <Cites cite={r.cite} cites={ctx.cites} />
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ── the whole board ────────────────────────────────────────────────────────

const NAV: { id: string; label: string; has: (b: Board) => boolean }[] = [
  { id: "routes", label: "Routes", has: (b) => !!b.routes?.levels.length },
  { id: "funding", label: "Funding", has: (b) => !!b.funding_stack?.instruments.length },
  { id: "roadmap", label: "Roadmap", has: (b) => !!b.roadmap?.tracks.length },
  { id: "process", label: "Mechanisms", has: (b) => !!b.process?.length },
  { id: "stakeholders", label: "Stakeholders", has: (b) => !!b.stakeholders?.institutions.length },
  { id: "risks", label: "Risks", has: (b) => !!b.risks_flags?.length },
];

export function BoardSections({ folded, cites, brain, compact = false }: { folded: Folded; cites: Record<string, Citation>; brain?: string; compact?: boolean }) {
  const { board } = folded;
  const ctx: Ctx = { cites, fresh: folded.blocks > 1 ? folded.fresh : new Set() };
  const nav = NAV.filter((n) => n.has(board));
  return (
    <div className="mb" data-compact={compact || undefined}>
      <AnswerHero board={board} ctx={ctx} brain={brain} />
      <KeyFigures board={board} />
      {nav.length > 1 && (
        <nav className="mb-jump" aria-label="Board sections">
          {nav.map((n) => <a key={n.id} href={`#board-${n.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`board-${n.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{n.label}</a>)}
        </nav>
      )}
      {board.routes?.levels.length ? <RouteMap levels={board.routes.levels} ctx={ctx} /> : null}
      {board.funding_stack?.instruments.length ? <FundingStack f={board.funding_stack} ctx={ctx} /> : null}
      {board.roadmap?.tracks.length ? <RoadmapView r={board.roadmap} ctx={ctx} /> : null}
      {board.process?.length ? <Processes list={board.process} ctx={ctx} /> : null}
      {board.stakeholders?.institutions.length ? <Stakeholders list={board.stakeholders.institutions} ctx={ctx} /> : null}
      {board.risks_flags?.length ? <Risks list={board.risks_flags} ctx={ctx} /> : null}
      {folded.warnings.length > 0 && (
        <details className="mb-warnings">
          <summary>{folded.warnings.length} item{folded.warnings.length === 1 ? "" : "s"} in the brain&apos;s board could not be read and {folded.warnings.length === 1 ? "is" : "are"} left out</summary>
          <ul>{folded.warnings.map((w, i) => <li key={i}><code>{w}</code></li>)}</ul>
        </details>
      )}
    </div>
  );
}

/** Before print, open every collapsed table and the reasoning, so the PDF carries them. */
export function usePrintOpen() {
  useEffect(() => {
    const opened: HTMLDetailsElement[] = [];
    const before = () => document.querySelectorAll<HTMLDetailsElement>("details[data-print-open]:not([open])").forEach((d) => { d.open = true; opened.push(d); });
    const after = () => { opened.splice(0).forEach((d) => { d.open = false; }); };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
}
