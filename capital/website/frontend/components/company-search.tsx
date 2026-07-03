"use client";

// Client-side company lookup against the static token-prefix shards built by
// scripts/build_company_search.py. No backend: typing fetches at most one
// ~0.1-3 MB shard (cached), filtering happens in the browser.

import { useEffect, useMemo, useRef, useState } from "react";
import { FAMILY_LABELS, FAMILY_SHORT, sectorLabel } from "@/lib/palette";
import { fmtEur, fmtInt } from "@/lib/format";
import manifest from "@/public/data/companies/manifest.json";

const COUNTRY_NAME: Record<string, string> = {
  AL: "Albania", AT: "Austria", BA: "Bosnia and Herzegovina", BE: "Belgium",
  BG: "Bulgaria", CH: "Switzerland", CY: "Cyprus", CZ: "Czechia",
  DE: "Germany", DK: "Denmark", EE: "Estonia", ES: "Spain", FI: "Finland",
  FR: "France", GB: "United Kingdom", GR: "Greece", HR: "Croatia",
  HU: "Hungary", IE: "Ireland", IS: "Iceland", IT: "Italy",
  LI: "Liechtenstein", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia",
  MD: "Moldova", ME: "Montenegro", MK: "North Macedonia", MT: "Malta",
  NL: "Netherlands", NO: "Norway", PL: "Poland", PT: "Portugal",
  RO: "Romania", RS: "Serbia", SE: "Sweden", SI: "Slovenia", SK: "Slovakia",
  UA: "Ukraine", XK: "Kosovo",
};

interface FacetCountry { code: string; count: number }
const FACET_COUNTRIES: FacetCountry[] = (manifest.facetCountries ?? []) as FacetCountry[];
const FACET_SECTORS: string[] = (manifest.facetSectors ?? []) as string[];

type EventRow = [number | null, string, string, number | null, string];
type StakeRow = [string, number | null, number | null, string, number];
interface Rec {
  n: string;
  q: string;
  c: string;
  s: string;
  ev: EventRow[];
  xe: number;
  st: StakeRow[];
  p?: number; // 1 = STEP seal
  x?: number; // 1 = EIC/Horizon Seal of Excellence (derived)
  i?: number; // 1 = IPCEI participant
}

const SEALS: { key: "p" | "x" | "i"; label: string; title: string }[] = [
  {
    key: "p",
    label: "STEP seal",
    title:
      "Holds the EU Strategic Technologies for Europe Platform (STEP) seal: a quality label for strategic-technology projects that carries priority access across EU instruments",
  },
  {
    key: "x",
    label: "Seal of Excellence",
    title:
      "Holds an EIC/Horizon Seal of Excellence, derived from funding received under a national scheme that exclusively pays Seal of Excellence holders",
  },
  {
    key: "i",
    label: "IPCEI",
    title:
      "Direct participant in an Important Project of Common European Interest: Commission-vetted strategic status, with state-aid obligations that follow the company into M&A",
  },
];

const STOP = new Set([
  "gmbh", "ag", "kg", "sa", "sas", "sarl", "srl", "spa", "sro", "sp", "z", "o",
  "ltd", "limited", "plc", "llc", "inc", "co", "company", "bv", "nv", "oy", "ab",
  "as", "aps", "se", "the", "and", "of", "de", "group", "holding",
]);

const BASIS_NOTE: Record<string, string> = {
  c: "ceiling",
  t: "total public funding",
  a: "approved aid",
  g: "granted aid",
  d: "debt commitment",
};

// Sector labels come from the live taxonomy (taxonomy.json via palette), so the
// dropdown and per-company labels follow the classification automatically.
const SECTOR_LABEL = (s: string): string => (s ? sectorLabel(s) : "");

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim();
}

function matches(rec: Rec, tokens: string[]): boolean {
  const recTokens = rec.q.split(" ");
  return tokens.every((t) => recTokens.some((rt) => rt.startsWith(t)));
}

export function CompanySearch() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [sector, setSector] = useState("");
  const [results, setResults] = useState<Rec[]>([]);
  const [open, setOpen] = useState<Rec | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [browsing, setBrowsing] = useState(false); // results came from a facet, not a name search
  const cache = useRef<Map<string, Rec[]>>(new Map());
  const seq = useRef(0);

  const tokens = useMemo(
    () => normalize(query).split(" ").filter((t) => t.length >= 2),
    [query]
  );

  useEffect(() => {
    const distinctive = tokens.find((t) => !STOP.has(t)) ?? tokens[0];
    const id = ++seq.current;

    // No name typed and no facet picked: nothing to show.
    if (!distinctive && !country && !sector) {
      setResults([]);
      setStatus("idle");
      setBrowsing(false);
      return;
    }

    // A name search fetches the name-prefix shard (most specific). With no name,
    // we browse a facet shard: the country shard if a country is set (it carries
    // every sector, filtered client-side), else the sector-across-countries shard.
    const isNameSearch = !!distinctive;
    const shardPath = isNameSearch
      ? `/data/companies/${distinctive.slice(0, 2)}.json`
      : country
        ? `/data/companies/facets/${country}.json`
        : `/data/companies/facets/_sector_${sector}.json`;

    const timer = setTimeout(async () => {
      try {
        let shard = cache.current.get(shardPath);
        if (!shard) {
          setStatus("loading");
          const res = await fetch(shardPath);
          shard = res.ok ? ((await res.json()) as Rec[]) : [];
          cache.current.set(shardPath, shard);
        }
        if (seq.current !== id) return;
        let hits = shard.filter(
          (r) =>
            (!isNameSearch || matches(r, tokens)) &&
            (!country || r.c === country) &&
            (!sector || r.s === sector)
        );
        // Name results rank by award count; facet results keep funding rank.
        if (isNameSearch) hits = [...hits].sort((a, b) => b.ev.length - a.ev.length);
        setResults(hits.slice(0, 50));
        setBrowsing(!isNameSearch);
        setStatus("done");
      } catch {
        if (seq.current === id) setStatus("error");
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [tokens, country, sector]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(null);
        }}
        placeholder="Type a company name, e.g. Northvolt, Doctolib, Bosch…"
        className="w-full rounded-lg border border-[var(--border)] bg-white/70 px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] shadow-sm outline-none focus:border-[#12264f]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          or browse
        </span>
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setOpen(null);
          }}
          className="rounded-lg border border-[var(--border)] bg-white/70 px-3 py-2 text-[var(--foreground)] outline-none focus:border-[#12264f]"
        >
          <option value="" className="bg-[#ffffff] text-[#141414]">All countries</option>
          {FACET_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} className="bg-[#ffffff] text-[#141414]">
              {COUNTRY_NAME[c.code] ?? c.code}
            </option>
          ))}
        </select>
        <select
          value={sector}
          onChange={(e) => {
            setSector(e.target.value);
            setOpen(null);
          }}
          className="rounded-lg border border-[var(--border)] bg-white/70 px-3 py-2 text-[var(--foreground)] outline-none focus:border-[#12264f]"
        >
          <option value="" className="bg-[#ffffff] text-[#141414]">All sectors</option>
          {FACET_SECTORS.filter((s) => SECTOR_LABEL(s)).map((s) => (
            <option key={s} value={s} className="bg-[#ffffff] text-[#141414]">
              {SECTOR_LABEL(s)}
            </option>
          ))}
        </select>
        {(country || sector) && (
          <button
            type="button"
            onClick={() => {
              setCountry("");
              setSector("");
            }}
            className="text-xs text-[#12264f] underline"
          >
            clear
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        {status === "loading" && "Loading…"}
        {status === "done" &&
          (browsing
            ? `Top ${results.length} by total funding${results.length === 50 ? " (more exist; narrow with a name or another facet)" : ""}`
            : `${results.length === 50 ? "50+" : results.length} match${results.length === 1 ? "" : "es"}`)}
        {status === "error" && "Could not load the index; try again."}
        {status === "idle" && "Search by name, or browse by country and sector. Runs entirely in your browser."}
      </p>

      <div className="mt-4 space-y-2">
        {results.map((r) => (
          <div key={`${r.n}|${r.c}`} className="rounded-lg border border-[var(--border)] bg-white/70">
            <button
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--muted)]"
              onClick={() => setOpen(open === r ? null : r)}
            >
              <span className="min-w-0">
                <span className="font-medium">{r.n}</span>
                <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                  {r.c}
                  {SECTOR_LABEL(r.s) ? ` · ${SECTOR_LABEL(r.s)}` : ""}
                </span>
                {SEALS.filter((seal) => r[seal.key] === 1).map((seal) => (
                  <span
                    key={seal.key}
                    className="ml-2 rounded bg-[#12264f]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#12264f]"
                    title={seal.title}
                  >
                    {seal.label}
                  </span>
                ))}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">
                {r.ev.length + r.xe > 0 && `${fmtInt(r.ev.length + r.xe)} award${r.ev.length + r.xe === 1 ? "" : "s"}`}
                {r.st.length > 0 && ` · ${r.st.length} public stake${r.st.length === 1 ? "" : "s"}`}
              </span>
            </button>

            {open === r && (
              <div className="border-t border-[var(--border)] px-4 py-3">
                {(() => {
                  // Honest summary: never sum amounts (bases differ across channels).
                  // Surface span of activity and the distinct instruments instead.
                  const years = r.ev.map((e) => e[0]).filter((y): y is number => y != null);
                  const minY = years.length ? Math.min(...years) : null;
                  const maxY = years.length ? Math.max(...years) : null;
                  const channels = Array.from(new Set(r.ev.map((e) => e[1])));
                  const items: string[] = [];
                  if (minY != null)
                    items.push(minY === maxY ? `Active ${minY}` : `Active ${minY}–${maxY}`);
                  if (channels.length)
                    items.push(`${channels.length} instrument${channels.length === 1 ? "" : "s"}`);
                  if (r.ev.length || r.xe)
                    items.push(`${fmtInt(r.ev.length + r.xe)} award${r.ev.length + r.xe === 1 ? "" : "s"}`);
                  if (r.st.length)
                    items.push(`${r.st.length} public stake${r.st.length === 1 ? "" : "s"}`);
                  return (
                    <div className="mb-3">
                      <p className="text-sm text-[var(--foreground)]">
                        {items.join(" · ")}
                      </p>
                      {channels.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1.5">
                          {channels.map((f) => (
                            <span
                              key={f}
                              className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] text-[var(--muted-foreground)]"
                            >
                              {FAMILY_LABELS[f] ?? FAMILY_SHORT[f] ?? f}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  );
                })()}
                {r.st.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                      Public equity positions
                    </p>
                    <ul className="space-y-0.5 text-sm">
                      {r.st.map((s, i) => (
                        <li key={i}>
                          {s[0]}
                          {s[1] != null && <span className="font-semibold text-[#12264f]"> · {s[1]}%</span>}
                          {s[2] != null && ` · ${fmtEur(s[2])}`}
                          <span className="text-xs text-[var(--muted-foreground)]"> as of {s[3]}{s[4] ? " · exited" : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.ev.length > 0 && (
                  <div className="overflow-x-auto -mx-1">
                    <table className="min-w-full text-sm" style={{ minWidth: 420 }}>
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                          <th className="py-1 pr-3 whitespace-nowrap">Year</th>
                          <th className="py-1 pr-3 whitespace-nowrap">Channel</th>
                          <th className="py-1 pr-3">Project</th>
                          <th className="py-1 text-right whitespace-nowrap">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.ev.map((e, i) => (
                          <tr key={i} className="border-t border-[var(--border)]/60 align-top">
                            <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-[var(--muted-foreground)]">{e[0] ?? ""}</td>
                            <td className="py-1.5 pr-3 whitespace-nowrap text-xs">{FAMILY_SHORT[e[1]] ?? FAMILY_LABELS[e[1]] ?? e[1]}</td>
                            <td className="py-1.5 pr-3 text-[var(--muted-foreground)] max-w-[280px]">{e[2]}</td>
                            <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                              {e[3] != null ? fmtEur(e[3]) : "n/a"}
                              {e[4] && <span className="ml-1 text-[10px] text-[var(--muted-foreground)]">({BASIS_NOTE[e[4]]})</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {r.xe > 0 && (
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    …and {fmtInt(r.xe)} earlier awards not shown.
                  </p>
                )}
                <p className="mt-3 border-t border-dashed border-[var(--border)] pt-2 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                  Amounts are as reported by each source and are not comparable across channels
                  (grants, aid elements, ceilings and debt commitments differ); n/a means the
                  source publishes no amount. Same-name entities may be merged or split
                  imperfectly.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
