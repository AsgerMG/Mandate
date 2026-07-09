"""Extract Innovationsfonden investments (Denmark) — Sprint 16.

Sprint 16 (2026-05-30): Denmark is invisible to SATR (DK is one of the EC-portal
SATR member states but the granting authorities for Innovationsfonden grants
are largely missing from the published feed). Innovationsfonden's own
`investeringsoversigt` view is the central public source.

The page is Drupal-Views server-rendered (pagination via `?page=N`), with one
table-row per grant. Each row exposes ALL fields in hidden <div>s for screen
readers:
  - data-entity-id (unique)
  - title, period, region, programme (Innobooster / Grand Solutions /
    Erhvervsforsker / Innofounder / Innomission / etc.)
  - investment percentage + value (DKK), total budget (DKK)
  - partner list, project leader entity
  - sector ("Fagområde")

Pagination: 14 rows × ~605 pages = ~8,470 investments back to 2001.
We restrict to projects with period starting 2021+ (sprint scope window).

Schema mapping (per row):
  source             = 'innovationsfonden_<programme_slug>'
  role               = 'direct'
  grant_amount_eur   = investment value DKK → EUR via ndb_helpers
  total_project_cost_eur = budget DKK → EUR
  grant_amount_basis = 'innofond_grant'
  deployment_country = 'DK'
  ndb_distributor    = 'innovationsfonden'
  eif_lp_backed      = 0
  coordinator_only   = 0 (project leader is the grant recipient)

Run modes:
  python extract_innovationsfonden.py             → fetch + CSV only
  python extract_innovationsfonden.py --load-db   → fetch + match + load
  python extract_innovationsfonden.py --refresh   → re-download all pages
  python extract_innovationsfonden.py --max-pages N → cap pages (for testing)
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import csv
import html as html_mod
import re
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked, normalise_ticket

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "innovationsfonden"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

LIST_URL = "https://innovationsfonden.dk/da/investeringer/investeringsoversigt?page={p}"
CSV_PATH = OUT_DIR / "innovationsfonden_grants.csv"
MATCH_CSV_PATH = OUT_DIR / "innovationsfonden_match_summary.csv"
DB_PATH = _ETL_DB
DEPLOYMENT_COUNTRY = "DK"

# Programme → source-slug + sector default
PROGRAMME_RULES: dict[str, tuple[str, str]] = {
    "Innobooster": ("innovationsfonden_innobooster", "deeptech_hardware"),
    "Innofounder": ("innovationsfonden_innofounder", "digital"),
    "Innomissions": ("innovationsfonden_innomission", "cleantech"),
    "Innomission": ("innovationsfonden_innomission", "cleantech"),
    "Innoexplorer": ("innovationsfonden_innoexplorer", "deeptech_hardware"),
    "Grand Solutions": ("innovationsfonden_grand_solutions", "deeptech_hardware"),
    "Erhvervsforsker": ("innovationsfonden_erhvervsforsker", "deeptech_hardware"),
    "International collaborations": ("innovationsfonden_intl_collab", "deeptech_hardware"),
    "Global Research Collaborations": ("innovationsfonden_global_research", "deeptech_hardware"),
    "Industrial Researcher": ("innovationsfonden_industrial_researcher", "deeptech_hardware"),
}

# Sector hint for classify.py source-fallback
INNOFOND_SOURCE_SECTOR: dict[str, str] = {src: sec for src, sec in PROGRAMME_RULES.values()}

# Innovationsfonden's "Fagområde" (sector) → v1 bucket
AREA_SECTOR: dict[str, str] = {
    "Biotek, Medico og Sundhed": "life_sciences",
    "Energi, Klima og Miljø": "cleantech",
    "Bioressourcer, Fødevarer og Livsstil": "cleantech",
    "Produktion, Materialer, Digitalisering og IKT": "deeptech_hardware",
    "Infrastruktur, Transport og Byggeri": "deeptech_hardware",
    "Handel, Service og Samfund": "digital",
    "Andet": "other",
    "Ikke defineret": "",  # fall through to programme default
}

# Heuristic: project leader entity looks like a company (Danish legal forms)
COMPANY_RE = re.compile(
    r"\b(A/S|ApS|I/S|K/S|P/S|IVS|SMBA|FMBA|AMBA|"
    r"GmbH|AG|BV|NV|Ltd|Limited|Inc|Corp|SAS|SARL|SpA|Srl)\.?",
    re.IGNORECASE,
)

# Common research-org name patterns (Danish + international)
RESEARCH_RE = re.compile(
    r"\b(universitet|university|hospital|sygehus|institut|institute|"
    r"DTU|KU\b|AU\b|SDU|AAU|RUC|CBS|ITU|"
    r"Force Technology|Teknologisk Institut|Statens Serum)\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------

def fetch_page(p: int, force: bool) -> Path:
    out = RAW_DIR / f"page_{p:04d}.html"
    if out.exists() and not force and out.stat().st_size > 50_000:
        return out
    subprocess.run(
        ["/usr/bin/curl", "-sL", "-A", "Mozilla/5.0", "--max-time", "30",
         "-o", str(out), LIST_URL.format(p=p)],
        check=False,
    )
    return out


def find_last_page(path: Path) -> int:
    txt = path.read_text(encoding="utf-8")
    nums = [int(x) for x in re.findall(r"page=(\d+)", txt)]
    return max(nums) if nums else 0


def fetch_all(force: bool, max_pages: int | None = None) -> list[Path]:
    p0 = fetch_page(0, force)
    last = find_last_page(p0)
    if max_pages is not None:
        last = min(last, max_pages)
    print(f"Innovationsfonden: fetching pages 0..{last}")
    paths = [p0]
    for p in range(1, last + 1):
        path = fetch_page(p, force)
        paths.append(path)
        if (p + 1) % 50 == 0:
            print(f"  fetched page {p+1}/{last+1}")
        time.sleep(0.05)
    return paths


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

_DKK_RE = re.compile(r"([\d.,]+)\s*(mio\.?|mia\.?)?", re.IGNORECASE)


def _parse_dkk(s: str) -> float | None:
    """Parse strings like '200.000', '1,1 mio.', '3,8 mio.', '12,5 mia.' to DKK float."""
    if not s: return None
    s = s.strip()
    m = _DKK_RE.match(s)
    if not m: return None
    num_str = m.group(1)
    unit = (m.group(2) or "").lower()
    if "mio" in unit or "mia" in unit:
        num_str = num_str.replace(".", "").replace(",", ".")
    else:
        num_str = num_str.replace(".", "").replace(",", ".")
    try:
        val = float(num_str)
    except ValueError:
        return None
    if "mio" in unit: val *= 1_000_000
    elif "mia" in unit: val *= 1_000_000_000
    return val


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def parse_page(path: Path) -> list[dict]:
    txt = path.read_text(encoding="utf-8")
    rows: list[dict] = []
    for m in re.finditer(
        r'<td colspan="4"[^>]*data-entity-id=(\d+)[^>]*>(.*?)</td>',
        txt, re.S,
    ):
        eid = m.group(1)
        block = m.group(2)
        def grab(cls: str) -> str:
            mm = re.search(rf'<div class="{cls}"[^>]*>([^<]*)</div>', block)
            return html_mod.unescape(mm.group(1)).strip() if mm else ""
        rows.append({
            "entity_id": eid,
            "title": grab("title-hidden"),
            "period": grab("period--text-hidden"),
            "region": grab("region--text-hidden"),
            "program": grab("program--text-hidden"),
            "area": grab("area--text-hidden"),
            "investment_pct": grab("investment--percentage-value-hidden"),
            "investment_value": grab("investment--value-hidden"),
            "budget_value": grab("budget--value-hidden"),
            "partners": grab("partner-text-hidden"),
            "leader": grab("people-text-hidden"),
        })
    return rows


def parse_all(paths: list[Path]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for path in paths:
        for r in parse_page(path):
            if r["entity_id"] in seen:
                continue
            seen.add(r["entity_id"])
            out.append(r)
    return out


# ---------------------------------------------------------------------------
# Enrich & filter
# ---------------------------------------------------------------------------

def enrich_row(r: dict) -> dict | None:
    """Return enriched dict, or None to skip (pre-2021 / no company recipient)."""
    period = r["period"]
    pm = re.match(r"(\d{4})", period)
    if not pm:
        return None
    start_year = int(pm.group(1))
    if start_year < 2021:
        return None

    leader = r["leader"]
    candidates = [leader] if leader else []
    for p in (r["partners"] or "").split(","):
        p = p.strip()
        if p and p not in candidates:
            candidates.append(p)

    recipient = None
    for c in candidates:
        if RESEARCH_RE.search(c):
            continue
        if COMPANY_RE.search(c) or (c and not RESEARCH_RE.search(c)):
            recipient = c
            break
    if not recipient:
        return None

    prog = r["program"]
    src_template, sect_default = PROGRAMME_RULES.get(
        prog, ("innovationsfonden_other", "deeptech_hardware"),
    )
    sector_v1 = AREA_SECTOR.get(r["area"], "") or sect_default

    inv_dkk = _parse_dkk(r["investment_value"])
    budget_dkk = _parse_dkk(r["budget_value"])
    try:
        grant_eur = normalise_ticket(inv_dkk, "DKK", start_year)
    except KeyError:
        grant_eur = None
    try:
        cost_eur = normalise_ticket(budget_dkk, "DKK", start_year)
    except KeyError:
        cost_eur = None

    call_id = f"innofond_{r['entity_id']}"
    return {
        "source": src_template,
        "call_id": call_id,
        "entity_id": r["entity_id"],
        "raw_name": recipient,
        "project_title": r["title"][:240] if r["title"] else None,
        "project_summary": (r["partners"] or "")[:1500],
        "sector_tags_raw": f"{prog} | {r['area']}",
        "sector_v1": sector_v1,
        "grant_amount_eur": grant_eur,
        "total_project_cost_eur": cost_eur,
        "period_start": start_year,
        "doc_url": f"https://innovationsfonden.dk/da/node/{r['entity_id']}",
        "country": "DK",
    }


# ---------------------------------------------------------------------------
# Name normaliser + matcher
# ---------------------------------------------------------------------------

_NORM_LEGAL_RE = re.compile(
    r"\b(A/S|ApS|I/S|K/S|P/S|IVS|SMBA|FMBA|AMBA|"
    r"GmbH|AG|BV|NV|Ltd|Limited|Inc|Corp|SAS|SARL|SpA|Srl|SE)\.?",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s or "")
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country",
    "matched_company_id", "matched_canonical_name",
    "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(rows: list[dict], conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies WHERE country='DK' OR country IS NULL")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        existing[(norm, (cntry or "").upper())] = (row_id, cname)
        existing_list.append((norm, (cntry or "").upper(), row_id, cname))

    enriched, summary = [], []
    for r in rows:
        raw_name = r["raw_name"]
        country = r["country"]
        norm = normalize_name(raw_name)

        cid: int | None = None
        method, conf = "none", "unmatched"
        matched_canonical = ""
        fuzzy_score = None

        if (norm, country) in existing:
            cid, matched_canonical = existing[(norm, country)]
            method, conf = "exact", "high"

        if cid is None and norm:
            best_ratio, best_id, best_name = 0.0, None, ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country and ex_country != country:
                    continue
                ratio = SequenceMatcher(None, norm, ex_norm).ratio()
                if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                    best_ratio, best_id, best_name = ratio, ex_id, ex_cname
            if best_id is not None:
                cid, matched_canonical = best_id, best_name
                method, conf, fuzzy_score = "fuzzy", "medium", round(best_ratio, 4)

        if cid is None:
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (?, ?, ?, 'company', ?, 'unmatched', 'none')""",
                (raw_name, raw_name, country, r["sector_v1"]),
            )
            cid = cur.lastrowid
            matched_canonical = raw_name
            existing[(norm, country)] = (cid, raw_name)
            existing_list.append((norm, country, cid, raw_name))

        enriched.append({**r, "company_id": cid})
        summary.append({
            "source": r["source"], "call_id": r["call_id"],
            "published_name": raw_name, "country": country,
            "matched_company_id": cid, "matched_canonical_name": matched_canonical,
            "match_method": method, "match_confidence": conf, "fuzzy_score": fuzzy_score,
        })
    conn.commit()
    return enriched, summary


def load_events(rows: list[dict], conn: sqlite3.Connection) -> int:
    cur = conn.cursor()
    inserted, skipped = 0, 0
    for r in rows:
        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
            (r["source"], r["call_id"]),
        )
        if cur.fetchone():
            skipped += 1
            continue
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id, project_title, project_summary,
                grant_amount_eur, total_project_cost_eur, sector_tags_raw,
                raw_source_url, coordinator_only, grant_amount_basis,
                deployment_country, eif_lp_backed, ndb_distributor)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, ?, 0, 'innofond_grant',
                       ?, 0, 'innovationsfonden')""",
            (r["company_id"], r["source"], r["call_id"],
             r["project_title"], r["project_summary"],
             r["grant_amount_eur"], r["total_project_cost_eur"],
             r["sector_tags_raw"], r["doc_url"],
             DEPLOYMENT_COUNTRY),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = ["source", "call_id", "entity_id", "raw_name", "project_title",
                  "sector_tags_raw", "sector_v1", "grant_amount_eur",
                  "total_project_cost_eur", "period_start", "country", "doc_url"]


def main() -> None:
    args = sys.argv[1:]
    load_db = "--load-db" in args
    refresh = "--refresh" in args
    max_pages = None
    for i, a in enumerate(args):
        if a == "--max-pages" and i + 1 < len(args):
            max_pages = int(args[i + 1])

    print("Fetching Innovationsfonden investments …")
    paths = fetch_all(refresh, max_pages)
    raw_rows = parse_all(paths)
    print(f"Parsed {len(raw_rows)} raw entity rows across {len(paths)} pages")

    enriched_rows: list[dict] = []
    skip_no_company = 0
    skip_pre_2021 = 0
    for r in raw_rows:
        e = enrich_row(r)
        if e is None:
            pm = re.match(r"(\d{4})", r["period"])
            if not pm or int(pm.group(1)) < 2021:
                skip_pre_2021 += 1
            else:
                skip_no_company += 1
            continue
        enriched_rows.append(e)

    print(f"  {skip_pre_2021} skipped (pre-2021)")
    print(f"  {skip_no_company} skipped (no company-style recipient)")
    print(f"  {len(enriched_rows)} eligible company-level rows")

    grand = sum((r["grant_amount_eur"] or 0) for r in enriched_rows)
    print(f"Headline grant volume: €{grand/1e6:.1f}M (EUR after DKK→EUR conversion)")

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        w.writeheader()
        w.writerows(enriched_rows)
    print(f"CSV → {CSV_PATH}")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        return

    conn = sqlite3.connect(DB_PATH)
    enriched, summary = match_companies(enriched_rows, conn)

    with MATCH_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w2 = csv.DictWriter(f, fieldnames=MATCH_FIELDNAMES)
        w2.writeheader()
        w2.writerows(summary)
    method_counts: dict[str, int] = defaultdict(int)
    for s in summary:
        method_counts[s["match_method"]] += 1
    print("Match results:")
    for m, n in sorted(method_counts.items()):
        print(f"  {m:<20}  {n:>5}")

    inserted = load_events(enriched, conn)
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("innovationsfonden_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 classify.py")


if __name__ == "__main__":
    main()
