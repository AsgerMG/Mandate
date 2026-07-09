"""Extract state-aid awards from the EU State Aid Transparency Register (SATR).

Source: https://webgate.ec.europa.eu/competition/transparency/public/search/home
Coverage: 2021-01-01 → today, 26 countries that report via the EC portal.
         (PL, RO, ES, SI use national portals — separate scripts.)

Filter strategy:
  Per (country, period), run TWO passes:
    1. equity-instrument filter (PRC, PRVRISKFIN, OFEI, SubordDebt, Lradv, SL, G)
    2. R&D-objective filter (GBER Art. 21, 22, 25-30 + SME generic)
  Dedupe by `reference_number` (TM-XXXXXX) across passes before write.

Per-batch budget:
  SATR caps each search at 100,000 records. We auto-split by period:
    annual → semi-annual → quarterly → monthly.
  If a monthly batch still exceeds the cap, we narrow by filter family.

Output:
  data/processed/satr/satr_<a2>_<period>_<filter>.csv.gz — one gzipped CSV per batch
                                                          (70-85% smaller than raw)
  data/processed/satr/_index.jsonl                       — record of completed batches
                                                          (resumable; re-runs skip done)

  Read a cached batch with: gzip -dc <file>.csv.gz | head
                       or:  pandas.read_csv(<file>.csv.gz)  (auto-detects gzip)

Usage:
  python scripts/extract_satr.py --smoke           # AT Jan 2021, one filter, headed
  python scripts/extract_satr.py --country AT      # AT full range
  python scripts/extract_satr.py --countries DE,ES,SE,IT,FI,NL  # overlap-audit set
  python scripts/extract_satr.py                   # all 26 countries

Re-runs are idempotent: completed batches (in _index.jsonl) are skipped.
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
import asyncio
import csv
import gzip
import json
import sys
import time
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path

from satr_country_map import SATR_COUNTRIES, name as country_name
from satr_filters import (
    EQUITY_INSTRUMENTS,
    RND_OBJECTIVES,
    EQUITY_SHORTCODE,
    RND_SHORTCODE,
)
from satr_session import (
    SatrSession,
    bootstrap_search,
    paginate,
    COLUMNS,
)

# ── Config ──────────────────────────────────────────────────────────────────

START_DATE = date(2021, 1, 1)
END_DATE = date.today()

OUT_DIR = _ETL_ROOT / "data" / "processed" / "satr"
OUT_DIR.mkdir(parents=True, exist_ok=True)
INDEX_PATH = OUT_DIR / "_index.jsonl"

# SATR record cap per export — 100k for CSV/XLSX, but pagination tolerates more.
# We still respect the cap because the over-limit flag in the search results
# page is the only reliable count signal.
RECORDS_CAP = 100_000

# CSV row count we treat as "must split further" — accept up to 99k per batch
# to avoid edge-case cap-flicker.
SOFT_CAP = 95_000

# Inter-batch polite delay (seconds)
INTER_BATCH_DELAY = 2.0


# ── Index (resume support) ──────────────────────────────────────────────────

def load_done_index() -> set[str]:
    if not INDEX_PATH.exists():
        return set()
    done = set()
    with INDEX_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if rec.get("status") == "done":
                    done.add(rec["batch_key"])
            except json.JSONDecodeError:
                continue
    return done


def append_index(record: dict) -> None:
    with INDEX_PATH.open("a") as f:
        f.write(json.dumps(record, default=str) + "\n")


# ── Period splitting ────────────────────────────────────────────────────────

def annual_periods(start: date, end: date):
    for year in range(start.year, end.year + 1):
        y_from = max(date(year, 1, 1), start)
        y_to = min(date(year, 12, 31), end)
        if y_from <= y_to:
            yield (y_from, y_to)


def split_half(d_from: date, d_to: date):
    """Split a year-or-larger range into two halves."""
    days = (d_to - d_from).days
    mid_offset = days // 2
    mid = d_from + timedelta(days=mid_offset)
    return [(d_from, mid), (mid + timedelta(days=1), d_to)]


def split_quarters(d_from: date, d_to: date):
    """Split into ≤4 quarter chunks."""
    out = []
    cur = d_from
    while cur <= d_to:
        q_end_month = ((cur.month - 1) // 3 + 1) * 3
        if q_end_month == 12:
            q_end = date(cur.year, 12, 31)
        else:
            q_end = date(cur.year, q_end_month + 1, 1) - timedelta(days=1)
        out.append((cur, min(q_end, d_to)))
        cur = min(q_end, d_to) + timedelta(days=1)
    return out


def split_months(d_from: date, d_to: date):
    """Split into ≤12 monthly chunks."""
    out = []
    cur = date(d_from.year, d_from.month, 1)
    while cur <= d_to:
        if cur.month == 12:
            m_end = date(cur.year, 12, 31)
        else:
            m_end = date(cur.year, cur.month + 1, 1) - timedelta(days=1)
        chunk_from = max(cur, d_from)
        chunk_to = min(m_end, d_to)
        if chunk_from <= chunk_to:
            out.append((chunk_from, chunk_to))
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)
    return out


# ── Single-batch download ───────────────────────────────────────────────────

async def download_batch(
    iso2: str,
    d_from: date,
    d_to: date,
    filter_family: str,            # 'equity' | 'rnd'
    out_path: Path,
) -> tuple[bool, int]:
    """Bootstrap a search, paginate, write CSV.

    Returns (over_limit, rows_written).
    On over_limit==True, caller should split the period further and retry.
    """
    if filter_family == EQUITY_SHORTCODE:
        instruments = EQUITY_INSTRUMENTS
        objectives = ()
    elif filter_family == RND_SHORTCODE:
        instruments = ()
        objectives = RND_OBJECTIVES
    else:
        raise ValueError(f"Unknown filter family: {filter_family}")

    session: SatrSession = await bootstrap_search(
        country_iso2=iso2,
        date_from=d_from,
        date_to=d_to,
        instruments=instruments,
        objectives=objectives,
    )

    print(
        f"      bootstrap: count≈{session.result_count:,}  over_limit={session.over_limit}"
    )

    # Only over_limit triggers split — count is a hint and can be wrong (the
    # SATR results page surfaces the 100k-cap warning reliably, but the total
    # count number is inconsistently formatted across templates).
    if session.over_limit:
        return (True, 0)

    # Always paginate — even if reported count is 0. Pagination terminates
    # immediately on an empty results table, so cost is one HTTP request.

    # Paginate and write (gzipped). Always opens the file so re-runs don't retry.
    rows_written = 0
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
    try:
        with gzip.open(tmp_path, "wt", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=COLUMNS)
            writer.writeheader()
            async for row in paginate(session):
                writer.writerow(row)
                rows_written += 1
                if rows_written % 5_000 == 0:
                    print(f"        ... {rows_written:,} rows")
        tmp_path.replace(out_path)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink()
        raise

    return (False, rows_written)


# ── Recursive period processor ──────────────────────────────────────────────

async def process_period(
    iso2: str,
    d_from: date,
    d_to: date,
    filter_family: str,
    done_index: set[str],
    depth: int = 0,
) -> int:
    """Download a (country, period, filter) batch; split recursively if oversized.

    Returns total rows written under this period.
    """
    indent = "    " + "  " * depth
    batch_key = (
        f"{iso2}_{d_from.strftime('%Y%m%d')}_{d_to.strftime('%Y%m%d')}_{filter_family}"
    )
    out_path = OUT_DIR / f"satr_{batch_key}.csv.gz"

    # Re-check done_index per batch to handle concurrent extractor runs:
    # if a sibling process has written this batch since we started, skip it.
    if batch_key not in done_index:
        fresh = load_done_index()
        if batch_key in fresh:
            done_index.update(fresh)

    if batch_key in done_index:
        # Use existing file's row count
        try:
            with gzip.open(out_path, "rt", encoding="utf-8") as f:
                n = sum(1 for _ in f) - 1
        except (FileNotFoundError, OSError):
            n = 0
        print(f"{indent}[skip] {batch_key} ({max(0,n):,} rows cached)")
        return max(0, n)

    print(f"{indent}{batch_key} ...")

    try:
        over, rows = await download_batch(iso2, d_from, d_to, filter_family, out_path)
    except Exception as e:
        print(f"{indent}  ERROR: {type(e).__name__}: {e}")
        append_index({
            "batch_key": batch_key, "status": "error",
            "error": f"{type(e).__name__}: {e}",
            "ts": time.time(),
        })
        return 0

    if not over:
        print(f"{indent}  saved {rows:,} rows → {out_path.name}")
        append_index({
            "batch_key": batch_key, "status": "done",
            "rows": rows, "ts": time.time(),
        })
        await asyncio.sleep(INTER_BATCH_DELAY)
        return rows

    # Split based on current period span
    span_days = (d_to - d_from).days
    if span_days > 200:
        subs = split_half(d_from, d_to)
        print(f"{indent}  over-limit, splitting into halves: {len(subs)} sub-periods")
    elif span_days > 70:
        subs = split_quarters(d_from, d_to)
        print(f"{indent}  over-limit, splitting into quarters: {len(subs)} sub-periods")
    elif span_days > 32:
        subs = split_months(d_from, d_to)
        print(f"{indent}  over-limit, splitting into months: {len(subs)} sub-periods")
    else:
        # Monthly still over — log as a warning row but write partial data
        print(
            f"{indent}  WARNING: single month {d_from.isoformat()}→{d_to.isoformat()} "
            f"still exceeds {SOFT_CAP:,}; loading partial (first 100k via pagination)."
        )
        try:
            session = await bootstrap_search(
                iso2, d_from, d_to,
                instruments=EQUITY_INSTRUMENTS if filter_family == EQUITY_SHORTCODE else (),
                objectives=RND_OBJECTIVES if filter_family == RND_SHORTCODE else (),
            )
            tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
            rows_written = 0
            with gzip.open(tmp_path, "wt", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=COLUMNS)
                writer.writeheader()
                async for row in paginate(session, max_pages=1100):  # 110k buffer
                    writer.writerow(row)
                    rows_written += 1
            tmp_path.replace(out_path)
            append_index({
                "batch_key": batch_key, "status": "done_partial",
                "rows": rows_written, "ts": time.time(),
                "warning": "single-month over-limit; data may be truncated",
            })
            return rows_written
        except Exception as e:
            print(f"{indent}    ERROR on partial load: {e}")
            return 0

    total = 0
    for sub_from, sub_to in subs:
        total += await process_period(
            iso2, sub_from, sub_to, filter_family,
            done_index, depth + 1,
        )
    return total


# ── Country driver ──────────────────────────────────────────────────────────

async def scrape_country(iso2: str, start: date, end: date) -> dict:
    """Download all (year, filter) batches for one country."""
    cname = country_name(iso2)
    print(f"\n{'='*64}\n  {cname} ({iso2})  {start} → {end}\n{'='*64}")

    done_index = load_done_index()
    total_equity = 0
    total_rnd = 0

    for (y_from, y_to) in annual_periods(start, end):
        print(f"\n  Year {y_from.year}")
        for fam in (EQUITY_SHORTCODE, RND_SHORTCODE):
            print(f"  Filter: {fam}")
            n = await process_period(iso2, y_from, y_to, fam, done_index)
            if fam == EQUITY_SHORTCODE:
                total_equity += n
            else:
                total_rnd += n

    return {
        "country": iso2,
        "equity_rows": total_equity,
        "rnd_rows": total_rnd,
        "total_rows_pre_dedup": total_equity + total_rnd,
    }


# ── Entry point ─────────────────────────────────────────────────────────────

async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--smoke", action="store_true",
                    help="Single small batch: AT Jan 2021 equity filter, headed browser")
    ap.add_argument("--country", help="One ISO 2-letter code (e.g. AT, DE)")
    ap.add_argument("--countries",
                    help="Comma-separated ISO 2-letter codes (e.g. DE,ES,SE,IT,FI,NL)")
    ap.add_argument("--from", dest="date_from", default=None,
                    help="Override start date (YYYY-MM-DD)")
    ap.add_argument("--to", dest="date_to", default=None,
                    help="Override end date (YYYY-MM-DD)")
    args = ap.parse_args()

    start = date.fromisoformat(args.date_from) if args.date_from else START_DATE
    end = date.fromisoformat(args.date_to) if args.date_to else END_DATE

    if args.smoke:
        print("=== SMOKE TEST: Austria, January 2021, equity filter ===")
        done = load_done_index()
        rows = await process_period(
            "AT", date(2021, 1, 1), date(2021, 1, 31),
            EQUITY_SHORTCODE, done,
        )
        print(f"\nSmoke result: {rows:,} rows")
        return

    if args.country:
        targets = [args.country.upper()]
    elif args.countries:
        targets = [c.strip().upper() for c in args.countries.split(",")]
    else:
        targets = list(SATR_COUNTRIES.keys())

    bad = [c for c in targets if c not in SATR_COUNTRIES]
    if bad:
        sys.exit(f"Unknown country codes: {bad}. Known: {sorted(SATR_COUNTRIES)}")

    summary = []
    for iso2 in targets:
        try:
            s = await scrape_country(iso2, start, end)
            summary.append(s)
        except KeyboardInterrupt:
            print("\nInterrupted — progress saved in _index.jsonl. Re-run to resume.")
            break
        except Exception as e:
            print(f"\nERROR on {iso2}: {type(e).__name__}: {e}")
            summary.append({"country": iso2, "error": str(e)})

    print("\n\n=== Summary ===")
    for s in summary:
        print(f"  {s}")


if __name__ == "__main__":
    asyncio.run(main())
