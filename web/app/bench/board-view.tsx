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
  barAmount, DOOR_LABEL, DOOR_STATUS, FUNDING_LABEL, FUNDING_STATUS_LABEL, FUNDING_TYPES, flowLayers, LEVEL_LABEL, LEVELS, LEVER_KINDS, LEVER_LABEL,
  MAP_KIND_LABEL, MAP_STEP_KINDS, MAP_STEP_LABEL, mapLayout, money, moneyRange,
  monthsOf, OWNER_LABEL, OWNERS, roadmapOrigin, SIDE_LABEL, SIDES, splitCite, STAGE_LABEL, STAGES, STEP_LABEL,
  type Answer, type Board, type Door, type Folded, type Funding, type Institution, type Lever, type Level, type MapStep, type Process, type ProcessMap,
  type Risk, type Roadmap, type Step,
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
          if (filter && !doors.length) return null;
          const span = Math.max(1, Math.min(doors.length, 4));
          return (
            <div key={l.id} className="mb-lane" data-level={l.level} data-span={span} style={{ "--span": span, "--span2": Math.min(span, 2) } as React.CSSProperties}>
              <div className="mb-lane__label">
                <span className="mb-lane__level" aria-hidden={LEVEL_LABEL[l.level] === l.label || undefined}>{LEVEL_LABEL[l.level] === l.label ? "\u00a0" : LEVEL_LABEL[l.level]}</span>
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
          {need > 0 && <span className="mb-stack__need" style={{ left: `${(need / scale) * 100}%`, translate: need / scale > 0.9 ? "-100% 0" : undefined }}>Need {money(need, cur)}</span>}
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
              <rect x={X(today) - 22} y={H - 17} width={44} height={14} rx={7} fill="#a6752e" />
              <text x={X(today)} y={H - 7} textAnchor="middle" className="mb-rm__today">Today</text>
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

// ── process and leverage maps ──────────────────────────────────────────────
//
// The junior's map of how a decision is made (steps in lanes by actor, left to
// right by the flow) with the senior's overlay drawn on it: where to push,
// what opens the door, what blocks, when, and the precedent to cite. Each
// lever kind has a fixed hue AND a glyph AND a word (validated with the
// dataviz validator, all pairs: worst CVD ΔE 11.6, normal ΔE 19.8; the ochre
// is below 3:1 on white, so every marker carries a glyph and the list below
// names it in words).

const LEVER_COLOR: Record<(typeof LEVER_KINDS)[number], string> = {
  pressure_point: "#24508f", door_opener: "#2a9a84", blocker: "#c0392b", timing_window: "#c99a1c", precedent: "#9b6bcc",
};
const LEVER_INK: Record<string, string> = { timing_window: "#1b1a17" };
const SIDE_COLOR: Record<(typeof SIDES)[number], string> = { political: "#8a63b8", "public-capital": "#2f5d9e", market: "#6f9a35" };

/** A lever's glyph, drawn about (0, 0) inside a 9.5px disc. */
function LeverGlyph({ kind }: { kind: Lever["kind"] }) {
  const ink = LEVER_INK[kind] ?? "#fff";
  const s = { stroke: ink, strokeWidth: 1.5, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "pressure_point": return <g><path d="M-3 5V-5" {...s} /><path d="M-3 -4.8h6l-1.6 2.4 1.6 2.4h-6z" fill={ink} stroke={ink} strokeWidth={1} strokeLinejoin="round" /></g>;
    case "door_opener": return <g><path d="M-4 5V-5h6.5V5" {...s} /><path d="M-4 -5 0.5 -3V6.2L-4 5z" fill={ink} /></g>;
    case "blocker": return <path d="M-3.5 -3.5 3.5 3.5M3.5 -3.5-3.5 3.5" {...s} strokeWidth={2} />;
    case "timing_window": return <g><circle r={4.6} {...s} /><path d="M0 -2.6V0h2.3" {...s} strokeWidth={1.3} /></g>;
    case "precedent": return <g><path d="M3.9 -0.8A4 4 0 1 1 1.8 -3.6" {...s} /><path d="M1 -6.2 2.6 -3.4-.4 -2.6" {...s} strokeWidth={1.3} /></g>;
  }
}
export function LeverMarker({ kind, size = 19 }: { kind: Lever["kind"]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" aria-hidden className="mb-lever__icon">
      <circle r={9.5} fill={LEVER_COLOR[kind]} /><LeverGlyph kind={kind} />
    </svg>
  );
}

function StepKindGlyph({ kind }: { kind: MapStep["kind"] }) {
  const s = { stroke: "currentColor", strokeWidth: 1.2, fill: "none" };
  switch (kind) {
    case "decision": return <path d="M4 0.5 7.5 4 4 7.5 0.5 4z" {...s} fill="currentColor" />;
    case "document": return <path d="M1 .5h4l2 2v5H1z" {...s} />;
    case "deadline": return <g><circle cx={4} cy={4} r={3.4} {...s} /><path d="M4 2.2V4h1.6" {...s} /></g>;
    default: return <rect x={1} y={1.5} width={6} height={5} rx={1.5} {...s} />;
  }
}

/** Words into lines of at most `max` characters; the last line ends in … when cut. */
function wrap(t: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of t.split(/\s+/)) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = `${kept[lines - 1].slice(0, max - 1).trimEnd()}…`;
    return kept;
  }
  return out.map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l));
}

const LANE_W = 176, MAP_GAP = 44, MARK_R = 9.5, MARK_STEP = 22;
type Picked = { type: "lever"; id: string } | { type: "step"; id: string } | null;

function ProcessMapView({ m, ctx, overlay }: { m: ProcessMap; ctx: Ctx; overlay: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [picked, setPicked] = useState<Picked>(null);
  const [hover, setHover] = useState<string | null>(null);
  const L = useMemo(() => mapLayout(m), [m]);
  const steps = new Map(m.steps.map((s) => [s.id, s]));
  const avail = Math.max(width, 900) - LANE_W - 28;
  const nodeW = Math.round(Math.max(132, Math.min(206, (avail - (L.cols - 1) * MAP_GAP) / L.cols)));
  const chars = Math.floor((nodeW - 22) / 6.6);
  const text = Object.fromEntries(m.steps.map((s) => [s.id, wrap(s.label, chars, 3)]));
  const nodeH = (s: MapStep) => 30 + text[s.id].length * 15 + (s.timing ? 16 : 0);
  const rowH = Math.max(...m.steps.map(nodeH)) + 40;
  const laneTop: number[] = [];
  let y = 0;
  L.lanes.forEach((_, i) => { laneTop.push(y); y += L.subs[i] * rowH; });
  const H = y;
  const W = LANE_W + 14 + L.cols * nodeW + (L.cols - 1) * MAP_GAP + 14;
  const pos = Object.fromEntries(m.steps.map((s) => {
    const x = LANE_W + 14 + L.col[s.id] * (nodeW + MAP_GAP);
    const top = laneTop[L.lane[s.id]] + L.sub[s.id] * rowH + 22;
    return [s.id, { x, y: top, h: nodeH(s) }];
  }));
  const laneIdx = new Map(L.lanes.map((l, i) => [l.id, i]));
  const onStep = (id: string) => m.leverage.filter((l) => l.at === id);
  const onLane = (id: string) => m.leverage.filter((l) => l.at === id && !steps.has(id));
  const laneName = L.lanes.map((l) => wrap(l.name, 22, 3));
  // a lever's anchor point (for the card)
  const anchor = (l: Lever): [number, number] => {
    if (steps.has(l.at)) { const p = pos[l.at]; const i = onStep(l.at).indexOf(l); return [p.x + nodeW - 14 - i * MARK_STEP, p.y]; }
    const li = laneIdx.get(l.at)!; const i = onLane(l.at).indexOf(l);
    return [24 + i * MARK_STEP, laneTop[li] + 34 + laneName[li].length * 15];
  };
  const pickedLever = picked?.type === "lever" ? m.leverage.find((l) => l.id === picked.id) : undefined;
  const pickedStep = picked?.type === "step" ? steps.get(picked.id) : undefined;
  const focusStep = pickedLever && steps.has(pickedLever.at) ? pickedLever.at : pickedStep?.id;
  const laneOfStep = (s: MapStep) => L.lanes[L.lane[s.id]];
  const ordered = [...m.leverage].sort((a, b) => {
    const k = (l: Lever) => (steps.has(l.at) ? L.col[l.at] * 100 + L.lane[l.at] : -1);
    return k(a) - k(b);
  });
  const toggle = (p: Picked) => setPicked((cur) => (cur && p && cur.type === p.type && cur.id === p.id ? null : p));
  const kinds = LEVER_KINDS.filter((k) => m.leverage.some((l) => l.kind === k));

  let card: React.ReactNode = null;
  if (pickedLever && overlay) {
    const [ax, ay] = anchor(pickedLever);
    const at = steps.get(pickedLever.at)?.label ?? L.lanes.find((l) => l.id === pickedLever.at)?.name;
    card = (
      <div className="mb-pm__card" role="dialog" aria-label={pickedLever.label} style={{ left: Math.max(8, Math.min(ax - 20, W - 340)), top: ay + 16 }}>
        <div className="mb-pm__cardhead">
          <span className="mb-lever__kind"><LeverMarker kind={pickedLever.kind} size={16} />{LEVER_LABEL[pickedLever.kind]}</span>
          <span className="mb-pm__side" style={{ "--side": SIDE_COLOR[pickedLever.side] } as React.CSSProperties}>{SIDE_LABEL[pickedLever.side]}</span>
          <button className="mb-pm__close" onClick={() => setPicked(null)} aria-label="Close">×</button>
        </div>
        <p className="mb-pm__cardtitle">{pickedLever.label}</p>
        <p className="mb-pm__at">At: {at}</p>
        <p className="mb-pm__row"><b>Why</b>{pickedLever.why}</p>
        <p className="mb-pm__row"><b>How</b>{pickedLever.how}</p>
        <Cites cite={pickedLever.cite} cites={ctx.cites} />
      </div>
    );
  } else if (pickedStep) {
    const p = pos[pickedStep.id];
    card = (
      <div className="mb-pm__card" role="dialog" aria-label={pickedStep.label} style={{ left: Math.max(8, Math.min(p.x, W - 340)), top: p.y + p.h + 8 }}>
        <div className="mb-pm__cardhead">
          <span className="mb-pm__kindtag" data-kind={pickedStep.kind}><svg width="9" height="9" viewBox="0 0 8 8" aria-hidden><StepKindGlyph kind={pickedStep.kind} /></svg>{MAP_STEP_LABEL[pickedStep.kind]}</span>
          <button className="mb-pm__close" onClick={() => setPicked(null)} aria-label="Close">×</button>
        </div>
        <p className="mb-pm__cardtitle">{pickedStep.label}</p>
        <p className="mb-pm__at">{laneOfStep(pickedStep).name}{pickedStep.timing ? ` · ${pickedStep.timing}` : ""}</p>
        {pickedStep.detail && <p className="mb-pm__row">{pickedStep.detail}</p>}
        <Cites cite={pickedStep.cite} cites={ctx.cites} />
      </div>
    );
  }

  return (
    <figure className="mb-pm" data-overlay={overlay || undefined}>
      <figcaption className="mb-pm__cap">
        <div>
          <p className="mb-eyebrow">{MAP_KIND_LABEL[m.kind ?? "other"]}{m.illustrative && <span className="mb-pm__illus">Illustrative</span>}<Fresh on={ctx.fresh.has(`pmap:${m.id}`)} /></p>
          <h3 className="mb-flow__title">{m.title}</h3>
          <p className="mb-flow__cap">{m.explains}</p>
        </div>
        <div className="mb-pm__count">
          <span><b>{m.steps.length}</b> steps</span><span><b>{L.lanes.length}</b> actors</span>
          {overlay && <span><b>{m.leverage.length}</b> levers</span>}
          <Cites cite={m.cite} cites={ctx.cites} />
        </div>
      </figcaption>
      <div ref={ref} className="mb-pm__canvas" onKeyDown={(e) => { if (e.key === "Escape") setPicked(null); }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${m.title}: ${m.steps.map((s) => `${s.label} (${laneOfStep(s).name})`).join(", then ")}`}>
          <defs>
            <marker id={`mb-pm-arrow-${m.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#8f8670" /></marker>
            <marker id={`mb-pm-arrow-on-${m.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#132342" /></marker>
          </defs>
          {/* swimlanes */}
          {L.lanes.map((l, i) => {
            const top = laneTop[i], h = L.subs[i] * rowH;
            return (
              <g key={l.id}>
                <rect x={0} y={top} width={W} height={h} fill={i % 2 ? "#fbf8f1" : "#fffdfa"} />
                <line x1={0} x2={W} y1={top} y2={top} stroke="#e6dfd1" />
                <rect x={0} y={top + 10} width={3} height={h - 20} rx={1.5} fill={l.side ? SIDE_COLOR[l.side] : "#cdbf9f"} />
                {l.side && <text x={14} y={top + 22} className="mb-pm__laneside">{SIDE_LABEL[l.side]}</text>}
                {laneName[i].map((t, k) => <text key={k} x={14} y={top + 40 + k * 15} className="mb-pm__lanename">{t}</text>)}
              </g>
            );
          })}
          <line x1={LANE_W} x2={LANE_W} y1={0} y2={H} stroke="#e6dfd1" />
          {/* flow */}
          {m.flow.map((e, i) => {
            const a = pos[e.from], b = pos[e.to];
            const on = !!focusStep && (e.from === focusStep || e.to === focusStep);
            const ay = a.y + a.h / 2, by = b.y + b.h / 2;
            let d: string, lx: number, ly: number;
            if (L.back.has(i)) {
              // a loop back: over the top of both steps
              const ax = a.x + nodeW / 2, bx = b.x + nodeW / 2, top = Math.min(a.y, b.y) - 16;
              d = `M${ax} ${a.y}C${ax} ${top - 10} ${bx} ${top - 10} ${bx} ${b.y - 2}`;
              lx = (ax + bx) / 2; ly = top - 6;
            } else if (L.col[e.to] === L.col[e.from]) {
              const x = a.x + nodeW / 2, down = b.y > a.y;
              const y0 = down ? a.y + a.h : a.y, y1 = down ? b.y - 2 : b.y + b.h + 2;
              d = `M${x} ${y0}V${y1}`; lx = x; ly = (y0 + y1) / 2;
            } else {
              const ax = a.x + nodeW, bx = b.x - 2, mid = (ax + bx) / 2;
              d = `M${ax} ${ay}C${mid} ${ay} ${mid} ${by} ${bx} ${by}`;
              lx = mid; ly = (ay + by) / 2;
            }
            const lw = e.label ? Math.min(e.label.length * 5.9 + 14, MAP_GAP + nodeW - 20) : 0;
            return (
              <g key={i} opacity={focusStep && !on ? 0.4 : 1}>
                <path d={d} fill="none" stroke={on ? "#132342" : "#8f8670"} strokeWidth={on ? 1.75 : 1.3} strokeDasharray={L.back.has(i) ? "4 3" : undefined} markerEnd={`url(#mb-pm-arrow${on ? "-on" : ""}-${m.id})`} />
                {e.label && (
                  <g>
                    <rect x={lx - lw / 2} y={ly - 9} width={lw} height={18} rx={9} fill="#fffdfa" stroke="#e6dfd1" />
                    <text x={lx} y={ly + 3.5} textAnchor="middle" className="mb-pm__elabel">{e.label.length > 34 ? `${e.label.slice(0, 33)}…` : e.label}</text>
                  </g>
                )}
              </g>
            );
          })}
          {/* steps */}
          {m.steps.map((s) => {
            const { x, y: ty, h } = pos[s.id];
            const sel = focusStep === s.id;
            const lever = pickedLever && pickedLever.at === s.id ? LEVER_COLOR[pickedLever.kind] : null;
            const fold = 11;
            return (
              <g key={s.id} className="mb-pm__step" data-kind={s.kind} data-sel={sel || undefined} tabIndex={0} role="button"
                aria-label={`${MAP_STEP_LABEL[s.kind]}: ${s.label}, ${laneOfStep(s).name}${s.timing ? `, ${s.timing}` : ""}`}
                onClick={() => toggle({ type: "step", id: s.id })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle({ type: "step", id: s.id }); } }}>
                {s.kind === "document"
                  ? <path d={`M${x + 8} ${ty}H${x + nodeW - fold}L${x + nodeW} ${ty + fold}V${ty + h - 8}q0 8-8 8H${x + 8}q-8 0-8-8V${ty + 8}q0-8 8-8z`} className="mb-pm__box" />
                  : <rect x={x} y={ty} width={nodeW} height={h} rx={s.kind === "deadline" ? 4 : 9} className="mb-pm__box" />}
                {s.kind === "document" && <path d={`M${x + nodeW - fold} ${ty}V${ty + fold}H${x + nodeW}`} fill="none" className="mb-pm__fold" />}
                {(sel || lever) && <rect x={x - 3.5} y={ty - 3.5} width={nodeW + 7} height={h + 7} rx={12} fill="none" stroke={lever ?? "#132342"} strokeWidth={2} />}
                <g transform={`translate(${x + 11} ${ty + 10})`} className="mb-pm__glyph"><StepKindGlyph kind={s.kind} /></g>
                <text x={x + 24} y={ty + 17.5} className="mb-pm__kind">{MAP_STEP_LABEL[s.kind]}</text>
                {text[s.id].map((t, k) => <text key={k} x={x + 11} y={ty + 36 + k * 15} className="mb-pm__label">{t}</text>)}
                {s.timing && <text x={x + 11} y={ty + 36 + text[s.id].length * 15 + 2} className="mb-pm__timing">{s.timing}</text>}
              </g>
            );
          })}
          {/* the overlay */}
          {overlay && m.leverage.map((l) => {
            const [cx, cy] = anchor(l);
            const sel = pickedLever?.id === l.id;
            const dim = (pickedLever && !sel) || (hover && hover !== l.id && !pickedLever);
            return (
              <g key={l.id} className="mb-pm__mark" transform={`translate(${cx} ${cy})`} tabIndex={0} role="button" opacity={dim ? 0.55 : 1}
                aria-label={`${LEVER_LABEL[l.kind]}: ${l.label}`} aria-pressed={sel}
                onClick={() => toggle({ type: "lever", id: l.id })} onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle({ type: "lever", id: l.id }); } }}>
                <circle r={16} fill="transparent" />
                <circle r={MARK_R + 2.5} fill="#fffdfa" />
                {sel && <circle r={MARK_R + 4} fill="none" stroke="#132342" strokeWidth={1.75} />}
                <circle r={MARK_R} fill={LEVER_COLOR[l.kind]} />
                <LeverGlyph kind={l.kind} />
                <title>{`${LEVER_LABEL[l.kind]}: ${l.label}`}</title>
              </g>
            );
          })}
        </svg>
        {card}
      </div>
      <div className="mb-pm__foot">
        <ul className="mb-legend mb-legend--inline" aria-label="Step kinds">
          {MAP_STEP_KINDS.filter((k) => m.steps.some((s) => s.kind === k)).map((k) => (
            <li key={k}><span className="mb-pm__kindtag" data-kind={k}><svg width="9" height="9" viewBox="0 0 8 8" aria-hidden><StepKindGlyph kind={k} /></svg>{MAP_STEP_LABEL[k]}</span></li>
          ))}
        </ul>
        {overlay && kinds.length > 0 && (
          <ul className="mb-legend mb-legend--inline" aria-label="Leverage">
            {kinds.map((k) => <li key={k}><LeverMarker kind={k} size={15} />{LEVER_LABEL[k]}</li>)}
          </ul>
        )}
        <p className="mb-pm__hint">{overlay ? "Click a marker for why, how and the source; click a step for its detail." : "Click a step for its detail and source."}</p>
      </div>
      {overlay && ordered.length > 0 && (
        <ol className="mb-levers" aria-label="Where to push">
          {ordered.map((l) => {
            const at = steps.get(l.at);
            return (
              <li key={l.id} className="mb-lever" data-kind={l.kind} data-sel={pickedLever?.id === l.id || undefined}>
                <button className="mb-lever__head" onClick={() => toggle({ type: "lever", id: l.id })} aria-pressed={pickedLever?.id === l.id}>
                  <LeverMarker kind={l.kind} size={17} />
                  <span className="mb-lever__kindword">{LEVER_LABEL[l.kind]}</span>
                  <span className="mb-pm__side" style={{ "--side": SIDE_COLOR[l.side] } as React.CSSProperties}>{SIDE_LABEL[l.side]}</span>
                </button>
                <p className="mb-lever__label">{l.label}</p>
                <p className="mb-pm__at">At: {at ? at.label : L.lanes.find((x) => x.id === l.at)?.name}{at ? ` · ${laneOfStep(at).name}` : ""}</p>
                <p className="mb-pm__row"><b>Why</b>{l.why}</p>
                <p className="mb-pm__row"><b>How</b>{l.how}</p>
                <Cites cite={l.cite} cites={ctx.cites} />
              </li>
            );
          })}
        </ol>
      )}
      <details className="mb-tableview" data-print-open>
        <summary>The process as a table</summary>
        <table className="mb-table">
          <thead><tr><th>#</th><th>Step</th><th>Kind</th><th>Actor</th><th>Timing</th><th>Next</th><th>Source</th></tr></thead>
          <tbody>{[...m.steps].sort((a, b) => L.col[a.id] - L.col[b.id] || L.lane[a.id] - L.lane[b.id]).map((s, i) => (
            <tr key={s.id}>
              <td className="mb-num">{i + 1}</td>
              <td><b>{s.label}</b>{s.detail && <span className="mb-sub">{s.detail}</span>}</td>
              <td>{MAP_STEP_LABEL[s.kind]}</td><td>{laneOfStep(s).name}</td><td>{s.timing}</td>
              <td>{m.flow.filter((e) => e.from === s.id).map((e) => `${steps.get(e.to)?.label}${e.label ? ` (${e.label})` : ""}`).join("; ")}</td>
              <td><Cites cite={s.cite} cites={ctx.cites} /></td>
            </tr>
          ))}</tbody>
        </table>
      </details>
    </figure>
  );
}

export function ProcessMaps({ list, ctx }: { list: ProcessMap[]; ctx: Ctx }) {
  const [overlay, setOverlay] = useState(true);
  return (
    <Section id="maps" eyebrow="Process and leverage" title={overlay ? "How it is decided, and where to push" : "How it is decided"}
      aside={
        <div className="mb-filter" role="group" aria-label="Show the leverage overlay">
          <button data-on={!overlay || undefined} aria-pressed={!overlay} onClick={() => setOverlay(false)}>How it works</button>
          <button data-on={overlay || undefined} aria-pressed={overlay} onClick={() => setOverlay(true)}><LeverMarker kind="pressure_point" size={13} />Where to push</button>
        </div>
      }>
      <div className="mb-flows">{list.map((m) => <ProcessMapView key={m.id} m={m} ctx={ctx} overlay={overlay} />)}</div>
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
  { id: "maps", label: "Where to push", has: (b) => !!b.process_maps?.length },
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
      {board.process_maps?.length ? <ProcessMaps list={board.process_maps} ctx={ctx} /> : null}
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
