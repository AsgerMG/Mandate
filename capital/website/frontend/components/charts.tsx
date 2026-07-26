"use client";

// Charts for the /investors page. All read investor_insights.json shapes
// passed down from the server page. Direct file import only — never re-export
// through a barrel that also carries server components.

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import { sectorColors, SECTOR_LABELS, familyTick } from "@/lib/palette";
import { fmtEur, fmtInt } from "@/lib/format";

const AXIS = { fontSize: 12, fill: "#656d82" };
const GRID = "rgba(10,10,10,0.08)";

function useMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

/* ── Sector rotation ────────────────────────────────────────────── */

interface Rotation {
  years: number[];
  sectors: { id: string; counts: number[]; shares: number[] }[];
}

export function RotationChart({ rotation }: { rotation: Rotation }) {
  const data = rotation.years.map((year, i) => {
    const row: Record<string, number> = { year };
    for (const s of rotation.sectors) row[s.id] = +(s.shares[i] * 100).toFixed(1);
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          unit="%"
          width={44}
        />
        <Tooltip
          formatter={(v, name) => [`${v}%`, SECTOR_LABELS[name as string] ?? name]}
          labelFormatter={(year) => `Awards in ${year}`}
        />
        <Legend
          formatter={(id) => (
            <span style={{ color: "#0f172a", fontSize: 12 }}>
              {SECTOR_LABELS[id as string] ?? id}
            </span>
          )}
        />
        {rotation.sectors.map((s) => (
          <Line
            key={s.id}
            dataKey={s.id}
            stroke={sectorColors[s.id] ?? "#6B7280"}
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── Money rotation: euros by sector (single basis) ─────────────── */

interface MoneyRotation {
  years: number[];
  sectors: { id: string; eurBn: number[] }[];
}

export function MoneyRotationChart({ rotation }: { rotation: MoneyRotation }) {
  const data = rotation.years.map((year, i) => {
    const row: Record<string, number> = { year };
    for (const s of rotation.sectors) row[s.id] = s.eurBn[i];
    return row;
  });
  // Stack largest sectors at the bottom for readability
  const order = [...rotation.sectors].sort(
    (a, b) => b.eurBn.reduce((x, y) => x + y, 0) - a.eurBn.reduce((x, y) => x + y, 0)
  );
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v) => `€${v}B`}
        />
        <Tooltip
          formatter={(v, name) => [`€${v}B`, SECTOR_LABELS[name as string] ?? name]}
          labelFormatter={(year) => `Aid granted in ${year}`}
        />
        <Legend
          formatter={(id) => (
            <span style={{ color: "#0f172a", fontSize: 12 }}>
              {SECTOR_LABELS[id as string] ?? id}
            </span>
          )}
        />
        {order.map((s) => (
          <Bar key={s.id} dataKey={s.id} stackId="m" fill={sectorColors[s.id] ?? "#6B7280"} maxBarSize={64} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Stacking funnel ────────────────────────────────────────────── */

export function StackFunnel({ stack }: { stack: { families: string; companies: number }[] }) {
  const max = Math.max(...stack.map((s) => s.companies));
  const labels: Record<string, string> = {
    "1": "1 instrument family",
    "2": "2 families",
    "3": "3 families",
    "4+": "4 or more families",
  };
  return (
    <div className="space-y-2">
      {stack.map((s) => {
        const width = Math.max(2.5, (Math.sqrt(s.companies) / Math.sqrt(max)) * 100);
        return (
          <div key={s.families} className="flex items-center gap-2">
            <span className="w-28 sm:w-36 shrink-0 text-right text-xs text-[var(--muted-foreground)]">
              {labels[s.families] ?? s.families}
            </span>
            {/* flex-1 container; inner div fills width% of this container, not the page */}
            <div className="relative flex-1 h-7 rounded-r overflow-hidden bg-black/5">
              <div
                className="absolute inset-y-0 left-0 rounded-r bg-[var(--primary)]"
                style={{ width: `${width}%`, opacity: 0.55 + 0.45 * (width / 100) }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">
              {fmtInt(s.companies)}
            </span>
          </div>
        );
      })}
      <p className="mt-1 pl-[7.5rem] sm:pl-[9.5rem] text-[11px] text-[var(--foreground-soft)]">
        Square-root scaled so the small buckets stay visible.
      </p>
    </div>
  );
}

/* ── Concentration: conviction share + typical ticket ───────────── */

interface ConcentrationRow {
  id: string;
  label: string;
  events: number;
  companies: number;
  totalEur: number;
  top10Share: number;
  medianTicket: number;
  p90Ticket: number;
}

export function ConcentrationChart({ rows }: { rows: ConcentrationRow[] }) {
  const mobile = useMobile();
  const data = [...rows]
    .sort((a, b) => b.top10Share - a.top10Share)
    .map((r) => ({ ...r, top10Pct: +(r.top10Share * 100).toFixed(1) }));
  const yW = mobile ? 100 : 190;
  return (
    <ResponsiveContainer width="100%" height={data.length * 38 + 40}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
        <YAxis
          type="category"
          dataKey="label"
          width={yW}
          tickFormatter={(v) => mobile ? familyTick(rows.find(r => r.label === v)?.id ?? v) : v}
          tick={{ ...AXIS, fill: "#2b3c5e" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(v) => [`${v}% of the instrument's money`, "Top 10 recipients"]}
          labelFormatter={(label, payload) => {
            const r = payload?.[0]?.payload as ConcentrationRow | undefined;
            return r ? `${label} · ${fmtEur(r.totalEur)} across ${fmtInt(r.companies)} recipients` : label;
          }}
        />
        <Bar dataKey="top10Pct" fill="#10203f" radius={[0, 3, 3, 0]} barSize={18}>
          <LabelList dataKey="top10Pct" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: "#2b3c5e" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TicketChart({ rows }: { rows: ConcentrationRow[] }) {
  const mobile = useMobile();
  const data = [...rows].sort((a, b) => b.medianTicket - a.medianTicket);
  const yW = mobile ? 100 : 190;
  return (
    <ResponsiveContainer width="100%" height={data.length * 38 + 40}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 52, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          scale="log"
          domain={[10000, 100000000]}
          ticks={mobile ? [10000, 1000000, 100000000] : [10000, 100000, 1000000, 10000000, 100000000]}
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => fmtEur(v)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={yW}
          tickFormatter={(v) => mobile ? familyTick(rows.find(r => r.label === v)?.id ?? v) : v}
          tick={{ ...AXIS, fill: "#2b3c5e" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(v, _n, item) => {
            const r = item?.payload as ConcentrationRow | undefined;
            return [
              `median ${fmtEur(v as number)}${r ? ` · top decile ${fmtEur(r.p90Ticket)}` : ""}`,
              "Award size",
            ];
          }}
        />
        <Bar dataKey="medianTicket" fill="#4a6cb3" radius={[0, 3, 3, 0]} barSize={18}>
          <LabelList dataKey="medianTicket" position="right" formatter={(v) => fmtEur(Number(v))} style={{ fontSize: 11, fill: "#2b3c5e" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Public equity holders ──────────────────────────────────────── */

interface Holder {
  id: string;
  label: string;
  country: string;
  positions: number;
  nameOnly: number;
  pct: number;
  amount: number;
}

const DISCLOSURE_COLORS = {
  pct: "#10203f",
  amount: "#3f7d5a",
  nameOnly: "#cbd5e1",
};

export function HoldersChart({ holders }: { holders: Holder[] }) {
  const mobile = useMobile();
  const data = holders.map((h) => ({
    ...h,
    name: `${h.country && h.country !== "EU" ? `${h.label} (${h.country})` : h.label} · ${h.positions}`,
  }));
  const yW = mobile ? 130 : 230;
  return (
    <div>
      <ResponsiveContainer width="100%" height={data.length * 30 + 40}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={yW} tick={{ ...AXIS, fill: "#2b3c5e" }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v, name) => [
              fmtInt(v as number),
              { pct: "Percentage disclosed", amount: "Euro amount disclosed", nameOnly: "Name only" }[name as string] ?? name,
            ]}
          />
          <Bar dataKey="pct" stackId="d" fill={DISCLOSURE_COLORS.pct} barSize={14} />
          <Bar dataKey="amount" stackId="d" fill={DISCLOSURE_COLORS.amount} barSize={14} />
          <Bar dataKey="nameOnly" stackId="d" fill={DISCLOSURE_COLORS.nameOnly} barSize={14} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-4 pl-2 text-[11px] text-[var(--foreground-soft)]">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DISCLOSURE_COLORS.pct }} />Ownership percentage disclosed</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DISCLOSURE_COLORS.amount }} />Euro amount disclosed</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DISCLOSURE_COLORS.nameOnly }} />Company name only</span>
      </div>
    </div>
  );
}

/* ── Country funding mix ────────────────────────────────────────── */

interface CountryMixRow {
  iso2: string;
  name: string;
  euDirect: number;
  ndb: number;
  stateAid: number;
  total: number;
}

const LAYER_COLORS = { euDirect: "#4a6cb3", ndb: "#6f9081", stateAid: "#10203f" };
const LAYER_LABELS: Record<string, string> = {
  euDirect: "EU instruments",
  ndb: "National development banks",
  stateAid: "National state aid",
};

export function CountryMixChart({ rows }: { rows: CountryMixRow[] }) {
  const mobile = useMobile();
  const data = rows.map((r) => {
    const euDirect = +((r.euDirect / r.total) * 100).toFixed(1);
    const ndb = +((r.ndb / r.total) * 100).toFixed(1);
    const stateAid = +(100 - euDirect - ndb).toFixed(1);
    return { name: r.name, total: r.total, euDirect, ndb, stateAid };
  });
  const yW = mobile ? 72 : 120;
  const rMargin = mobile ? 52 : 80;
  return (
    <div>
      <ResponsiveContainer width="100%" height={data.length * 32 + 40}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: rMargin, bottom: 4, left: 8 }}>
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
          <YAxis type="category" dataKey="name" width={yW} tick={{ ...AXIS, fill: "#2b3c5e" }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v, name) => [`${v}%`, LAYER_LABELS[name as string] ?? name]} />
          {(["euDirect", "ndb", "stateAid"] as const).map((k, i) => (
            <Bar key={k} dataKey={k} stackId="m" fill={LAYER_COLORS[k]} barSize={16} radius={i === 2 ? [0, 3, 3, 0] : undefined}>
              {i === 2 && (
                <LabelList
                  dataKey="total"
                  position="right"
                  formatter={(v) => mobile ? fmtInt(Number(v)) : `${fmtInt(Number(v))} awards`}
                  style={{ fontSize: 10, fill: "#656d82" }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-4 pl-2 text-[11px] text-[var(--foreground-soft)]">
        {(["euDirect", "ndb", "stateAid"] as const).map((k) => (
          <span key={k}>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LAYER_COLORS[k] }} />
            {LAYER_LABELS[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
