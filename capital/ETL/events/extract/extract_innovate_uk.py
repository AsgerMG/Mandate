"""Innovate UK extractor — UKRI Gateway to Research (GtR) API.

Gives the UK a national-funder layer (it has none: post-Brexit the UK is not in
SATR, and Horizon 2021-2023 exclusion left the EU layer thin). Innovate UK is
the UK's innovation agency — the BEIS/DSIT equivalent of an NDB grant arm.

Source: https://gtr.ukri.org/gtr/api/projects (JSON v7), server-side filtered
to leadFunder="Innovate UK" via the fielded search (q="Innovate UK"&f=pro.lf).
Each project record embeds `participantValues.participant[]` with per-org
projectCost + grantOffer, so no per-project follow-up requests are needed.

Scope: fund start >= 2021-01-01 (corpus time window). All participants with a
positive grant offer are loaded (role preserved; coordinator_only=1 for
LEAD_PARTICIPANT) — same org-level convention as the CORDIS loads.
Country is GB for all rows: Innovate UK grant recipients must be UK-registered.

Amounts are GBP grant offers converted at ECB annual-average rates
(grant_amount_basis='iuk_grant_offer_gbp_converted').

SATR-overlap gate: structurally zero — the UK is not in SATR and no other
corpus source carries Innovate UK awards.

Pages are cached under data/raw/innovate_uk/ so re-runs resume without
refetching; event dedup is on (source, call_id).

Usage:
  python3 extract_innovate_uk.py             → fetch + CSV only
  python3 extract_innovate_uk.py --load-db   → fetch + match + load
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

import argparse
import csv
import json
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

pass  # sys.path handled by etl_env bootstrap
from ndb_ssl import fetch_text  # noqa: E402
from europe_scope import canonicalise_country  # noqa: E402

RAW_DIR = _ETL_ROOT / "data" / "raw" / "innovate_uk"
PROCESSED_DIR = _ETL_ROOT / "data" / "processed"
DB_PATH = _ETL_DB

API = ("https://gtr.ukri.org/gtr/api/projects"
       "?q=%22Innovate%20UK%22&f=pro.lf&s=100&p={page}")
HEADERS = {"Accept": "application/vnd.rcuk.gtr.json-v7"}

CUTOFF = "2021-01-01"

# ECB annual average GBP per EUR.
GBP_PER_EUR = {
    2021: 0.8596,
    2022: 0.8528,
    2023: 0.8698,
    2024: 0.8466,
    2025: 0.8400,
}
GBP_PER_EUR_FALLBACK = 0.8500

# Final-fallback sector map for classify.py (Innovate UK is cross-sector;
# the keyword pass on abstractText does the real work, this stops the
# zero-unclassified gate from tripping on keyword-less abstracts).
IUK_SOURCE_SECTOR: dict[str, str] = {
    f"innovate_uk_{y}": "other"
    for y in ["2021", "2022", "2023", "2024", "2025", "2026"]
}


def _fetch_page(page: int) -> dict | None:
    cache = RAW_DIR / f"page_{page:04d}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    url = API.format(page=page)
    for attempt in range(3):
        try:
            import urllib.request
            from ndb_ssl import open_url
            with open_url(url, timeout=60, headers=HEADERS) as resp:
                raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            cache.write_text(raw)
            return data
        except Exception as e:
            print(f"  page {page} attempt {attempt+1} failed: {e}")
            time.sleep(2 * (attempt + 1))
    return None


def _epoch_to_date(ms) -> str | None:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def fetch_rows() -> list[dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    first = _fetch_page(1)
    if not first:
        sys.exit("GtR API unreachable")
    total_pages = first["totalPages"]
    print(f"GtR: {first['totalSize']} Innovate UK projects across {total_pages} pages")

    rows: list[dict] = []
    kept_projects = 0
    skipped_pre_cutoff = 0
    skipped_no_fund_date = 0
    skipped_wrong_funder = 0

    for page in range(1, total_pages + 1):
        data = first if page == 1 else _fetch_page(page)
        if not data:
            print(f"  page {page}: FAILED after retries — rerun to resume from cache")
            continue
        if page % 25 == 0:
            print(f"  page {page}/{total_pages} ... ({len(rows)} rows so far)")

        for proj in data.get("project", []):
            if (proj.get("leadFunder") or "") != "Innovate UK":
                skipped_wrong_funder += 1
                continue
            fund_links = [l for l in proj.get("links", {}).get("link", [])
                          if l.get("rel") == "FUND"]
            start = _epoch_to_date(fund_links[0].get("start")) if fund_links else None
            if not start:
                skipped_no_fund_date += 1
                continue
            if start < CUTOFF:
                skipped_pre_cutoff += 1
                continue
            end = _epoch_to_date(fund_links[0].get("end"))

            participants = ((proj.get("participantValues") or {}).get("participant")
                            or [])
            year = int(start[:4])
            rate = GBP_PER_EUR.get(year, GBP_PER_EUR_FALLBACK)
            source = f"innovate_uk_{year}"
            pid = proj["id"]
            emitted = 0
            for part in participants:
                grant_gbp = part.get("grantOffer") or 0
                if grant_gbp <= 0:
                    continue
                name = (part.get("organisationName") or "").strip()
                if not name:
                    continue
                role = (part.get("role") or "").strip().upper()
                is_lead = role == "LEAD_PARTICIPANT"
                cost_gbp = part.get("projectCost") or None
                rows.append({
                    "source": source,
                    "call_id": f"{source}_{pid}_{part.get('organisationId') or emitted}",
                    "company_name": name,
                    "country": "GB",
                    "role": "coordinator" if is_lead else "participant",
                    "coordinator_only": 1 if is_lead else 0,
                    "project_number": pid,
                    "project_title": (proj.get("title") or "").strip(),
                    "project_summary": (proj.get("abstractText") or "").strip()[:1000],
                    "project_started": start,
                    "project_ended": end,
                    "grant_amount_eur": round(grant_gbp / rate, 2),
                    "total_project_cost_eur": round(cost_gbp / rate, 2) if cost_gbp else None,
                    "sector_tags_raw": (proj.get("grantCategory") or "").strip(),
                    # Innovate UK's own scheme name for the award -- Knowledge
                    # Transfer Partnership, Feasibility Studies, SBRI. It was
                    # already read here and kept only as a free-text tag, so
                    # 17,012 awards sat in one row whose medians differ tenfold
                    # (SBRI EUR 292,668 against Responsive Strategy EUR 29,083).
                    "programme_name": (proj.get("grantCategory") or "").strip() or None,
                    "grant_amount_basis": "iuk_grant_offer_gbp_converted",
                    "raw_source_url": f"https://gtr.ukri.org/projects?ref={pid}",
                })
                emitted += 1
            if emitted:
                kept_projects += 1
        if page % 5 == 0:
            time.sleep(0.1)

    print(f"Kept {kept_projects} projects / {len(rows)} participant rows "
          f"(skipped: pre-{CUTOFF[:4]}={skipped_pre_cutoff}, "
          f"no-fund-date={skipped_no_fund_date}, wrong-funder={skipped_wrong_funder})")
    return rows


def _normalize_name(name: str) -> str:
    n = (name or "").upper()
    for suffix in [" LIMITED", " LTD", " PLC", " LLP", " LLC", " CIC", " C.I.C.",
                   " (UK)", " UK"]:
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    n = re.sub(r"[^A-Z0-9]+", " ", n).strip()
    n = re.sub(r"\s+", " ", n)
    return n


def _match_company(norm: str, exact_gb: dict[str, int],
                   fuzzy_gb: list[tuple[int, str]]) -> tuple[int | None, str]:
    """In-memory matcher. The exact tier is a dict lookup; the fuzzy tier is
    gated by length ratio + quick_ratio so SequenceMatcher.ratio() only runs
    on plausible candidates (the all-pairs version was O(hours) on 17k rows)."""
    if not norm:
        return None, "none"
    if norm in exact_gb:
        return exact_gb[norm], "exact"
    for cid, cname in fuzzy_gb:
        if not cname or len(cname) < 4:
            continue
        if norm.startswith(cname + " "):
            return cid, "prefix"
        if cname.startswith(norm + " "):
            return cid, "reverse_prefix"
    best = (0.0, None)
    nlen = len(norm)
    for cid, cname in fuzzy_gb:
        clen = len(cname)
        if not clen or clen < 0.85 * nlen or nlen < 0.85 * clen:
            continue
        sm = SequenceMatcher(None, norm, cname)
        if sm.quick_ratio() < 0.92:
            continue
        ratio = sm.ratio()
        if ratio > best[0]:
            best = (ratio, cid)
    if best[0] >= 0.92 and best[1] is not None:
        return best[1], "fuzzy"
    return None, "none"


def load_db(rows: list[dict]) -> None:
    assert canonicalise_country("GB") == "GB"
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT id, UPPER(canonical_name) FROM companies WHERE country='GB'")
    fuzzy_gb = [(cid, cname or "") for cid, cname in cur.fetchall()]
    exact_gb = {cname: cid for cid, cname in fuzzy_gb if cname}

    counts = {"exact": 0, "prefix": 0, "reverse_prefix": 0, "fuzzy": 0,
              "new": 0, "skipped_dup": 0, "inserted_events": 0}
    new_by_norm: dict[str, int] = {}

    for i, r in enumerate(rows):
        if i and i % 2500 == 0:
            print(f"  ... {i}/{len(rows)} rows")
        norm = _normalize_name(r["company_name"])
        if norm in new_by_norm:
            cid, method = new_by_norm[norm], "exact"
        else:
            cid, method = _match_company(norm, exact_gb, fuzzy_gb)
        if cid is None:
            cur.execute(
                """INSERT INTO companies (canonical_name, raw_name, country,
                   entity_type, match_method, match_confidence)
                   VALUES (?, ?, 'GB', 'unknown', 'innovate_uk', 'medium')""",
                (norm, r["company_name"]),
            )
            cid = cur.lastrowid
            new_by_norm[norm] = cid
            fuzzy_gb.append((cid, norm))
            exact_gb[norm] = cid
            counts["new"] += 1
        else:
            counts[method] = counts.get(method, 0) + 1

        cur.execute("SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
                    (r["source"], r["call_id"]))
        if cur.fetchone():
            counts["skipped_dup"] += 1
            continue
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, call_id, role, coordinator_only,
                project_number, project_title, project_summary,
                project_started, project_ended,
                grant_amount_eur, total_project_cost_eur,
                sector_tags_raw, grant_amount_basis, raw_source_url,
                programme_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (cid, r["source"], r["call_id"], r["role"], r["coordinator_only"],
             r["project_number"], r["project_title"], r["project_summary"],
             r["project_started"], r["project_ended"],
             r["grant_amount_eur"], r["total_project_cost_eur"],
             r["sector_tags_raw"], r["grant_amount_basis"], r["raw_source_url"],
             r.get("programme_name")),
        )
        counts["inserted_events"] += 1

    con.commit()
    con.close()
    print(f"Match/load: {counts}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--load-db", action="store_true")
    args = parser.parse_args()

    rows = fetch_rows()
    if not rows:
        sys.exit("No rows extracted")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out_csv = PROCESSED_DIR / "innovate_uk_events.csv"
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {out_csv}")

    from collections import Counter
    by_src = Counter(r["source"] for r in rows)
    for src in sorted(by_src):
        total = sum(r["grant_amount_eur"] for r in rows if r["source"] == src) / 1e6
        print(f"  {src:<18} {by_src[src]:>6} rows  €{total:>8.1f}M")

    if args.load_db:
        load_db(rows)
        print("Reminder: run python3 ETL/events/transform/classify_taxonomy.py apply-nace && python3 ETL/events/transform/classify_taxonomy.py run")
    else:
        print("(CSV only — pass --load-db to load into db.sqlite)")


if __name__ == "__main__":
    main()
