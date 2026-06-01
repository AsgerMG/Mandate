"""Extract Polish state aid beneficiaries from SUDOP — Sprint 16 follow-up.

SUDOP (System Udostępniania Danych O Pomocy Publicznej) is Poland's central
state aid register, maintained by UOKiK. Open OpenAPI specification at
`https://api-sudop.uokik.gov.pl/swagger/sudop-api.yml`.

Poland is invisible to SATR (SATR covers 24 EC-portal countries; PL uses SUDOP
for its national publishing). This extractor fills that gap.

Async API flow (UOKiK's standard pattern, ~60-90s per query):
  1. GET /api/przypadki-pomocy?<filters> → 303 redirect to /api/kolejka/<id>
  2. Poll the queue URL until it 303-redirects to /api/wynik/<resultId>
  3. GET /api/wynik/<resultId>?csv=true → CSV download

Filter approach: iterate over the curated list of `INNOVATION_MEASURES` below.
Each measure is a state-aid programme number (e.g. SA.57177 = BGK's
"Kredyt na innowacje technologiczne"). Adding new measure codes to the list
extends coverage.

NDB attribution heuristic: the `nazwa-udzielajacego-pomocy` (granting authority
name) field is mapped to one of pfr / ncbr / bgk / parp / other via
substring match.

Schema mapping (per row):
  source             = 'sudop_<measure_short>'
  role               = 'direct'
  grant_amount_eur   = wartosc-brutto-eur (already EUR)
  grant_amount_basis = 'sudop_aid_element'
  deployment_country = 'PL'
  ndb_distributor    = derived from granting authority name

Run modes:
  python extract_sudop.py             → fetch + CSV only
  python extract_sudop.py --load-db   → fetch + match + load
  python extract_sudop.py --refresh   → re-download all measures
  python extract_sudop.py --measures NUM[,NUM…] → run only listed codes

Note on time: each measure query takes 60-90s through SUDOP's async pipeline.
Running all measures sequentially is intended; the default list below is
sized to ~10 measures × 60s = ~10 min. Add more as a follow-up batch.
"""
from __future__ import annotations

import csv
import re
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ndb_helpers import backfill_ipcei_linked

# Certifi CA bundle — needed for SUDOP curl calls on macOS
try:
    import certifi as _certifi
    _CACERT = _certifi.where()
except ImportError:
    _CACERT = None

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "sudop"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

API_BASE = "https://api-sudop.uokik.gov.pl/sudop-api"
OUT_CSV = OUT_DIR / "sudop_aids.csv"
MATCH_CSV_PATH = OUT_DIR / "sudop_match_summary.csv"
DB_PATH = BASE_DIR / "db.sqlite"
DEPLOYMENT_COUNTRY = "PL"


# Curated list of Polish innovation-relevant state aid measures (2020+).
# Format: (SA-number, short-slug, sector_v1, description)
# Extend this list to broaden coverage.
INNOVATION_MEASURES: list[tuple[str, str, str, str]] = [
    ("SA.57177(2020/X)", "bgk_kit_v2",  "deeptech_hardware", "Kredyt na innowacje technologiczne (BGK)"),
    ("SA.60606(2020/X)", "bgk_kit_v3",  "deeptech_hardware", "Kredyt na innowacje technologiczne (BGK)"),
    ("SA.58757(2020/X)", "ncbr_aid",    "deeptech_hardware", "Pomoc publiczna przez NCBR"),
    ("SA.60658(2020/X)", "open_innov",  "deeptech_hardware", "Otwarte innowacje – transfer technologii"),
    ("SA.60660(2020/X)", "rd_centers",  "deeptech_hardware", "Pomoc inwestycyjna typu centra B+R"),
    ("SA.60657(2020/X)", "bgk_guarantee","deeptech_hardware", "Gwarancje BGK"),
    ("SA.56782(2020/X)", "parp_rd",     "deeptech_hardware", "PARP B+R wsparcie"),
    ("SA.59210(2020/X)", "regional_inv","deeptech_hardware", "Regionalna pomoc inwestycyjna"),
    ("SA.59214(2020/X)", "urban_dev",   "deeptech_hardware", "Pomoc regionalna obszary miejskie"),
    ("SA.60656(2020/X)", "rd_invest",   "deeptech_hardware", "Pomoc inwestycyjna B+R przedsiębiorców"),
]

SUDOP_SOURCE_SECTOR: dict[str, str] = {
    f"sudop_{slug}": sector for _, slug, sector, _ in INNOVATION_MEASURES
}


# Granting authority substring → NDB id.
# Polish declines institution names by grammatical case, so match on the
# invariant stem (e.g. "Centrum Badań i Rozwoju" catches both "Narodowe …"
# and "Dyrektor Narodowego …").
NDB_PATTERNS: list[tuple[str, str]] = [
    ("Polski Fundusz Rozwoju", "pfr"),
    ("Funduszu Rozwoju", "pfr"),
    ("Centrum Badań i Rozwoju", "ncbr"),            # NCBR (any declension)
    ("NCBR", "ncbr"),
    ("Bank Gospodarstwa Krajowego", "bgk"),
    ("Banku Gospodarstwa Krajowego", "bgk"),
    ("Agencji Rozwoju Przedsiębiorczości", "parp"),  # PARP (genitive)
    ("Agencja Rozwoju Przedsiębiorczości", "parp"),
    ("PARP", "parp"),
    ("Agencji Badań Medycznych", "abm"),            # Medical Research Agency
    ("Agencja Badań Medycznych", "abm"),
    ("Ośrodek Przetwarzania Informacji", "opi"),    # OPI national research institute
    ("Centrum Nauki", "ncn"),                       # National Science Centre
]


def classify_ndb(authority: str | None) -> str | None:
    if not authority:
        return None
    for pat, ndb in NDB_PATTERNS:
        if pat.lower() in authority.lower():
            return ndb
    return None


# ---------------------------------------------------------------------------
# Async SUDOP API client
# ---------------------------------------------------------------------------

class SudopClient:
    def __init__(self, raw_dir: Path):
        self.raw_dir = raw_dir
        self.user_agent = "Mozilla/5.0"

    def _curl(self, url: str, head_only: bool = False, out: Path | None = None) -> tuple[int, str, str]:
        # Do NOT follow redirects (-L) — SUDOP's async API uses 303 redirects
        # that we need to capture and handle manually (queue polling pattern).
        args = ["/usr/bin/curl", "-s", "-A", self.user_agent, "--max-time", "120",
                "-D", "-"]
        if _CACERT:
            args += ["--cacert", _CACERT]
        if head_only:
            args.append("-I")
        if out:
            args.extend(["-o", str(out)])
        # No trailing "-" — body goes to stdout by default; trailing "-" breaks curl
        args.append(url)
        r = subprocess.run(args, capture_output=True, text=True)
        out_text = r.stdout
        head_end = out_text.find("\r\n\r\n")
        if head_end < 0:
            head_end = out_text.find("\n\n")
        if head_end > 0:
            header = out_text[:head_end]
            body = out_text[head_end + 4:]
        else:
            header = out_text
            body = ""
        m = re.search(r"HTTP/[\d.]+\s+(\d+)", header)
        status = int(m.group(1)) if m else 0
        return status, header, body

    def _async_query(self, initial_url: str, out: Path) -> Path | None:
        """Run the SUDOP async queue pattern: POST initial URL → poll queue → download CSV."""
        status, header, _ = self._curl(initial_url)
        if status not in (303, 200):
            print(f"  initial query failed: HTTP {status}")
            return None
        loc = re.search(r"[Ll]ocation:\s*(\S+)", header)
        if not loc:
            print(f"  no Location header in response")
            return None
        queue_url = f"https://api-sudop.uokik.gov.pl{loc.group(1)}"
        for attempt in range(40):
            time.sleep(8)
            status, header, _ = self._curl(queue_url, head_only=True)
            loc = re.search(r"[Ll]ocation:\s*(\S+)", header)
            if loc and "/wynik/" in loc.group(1):
                result_url = f"https://api-sudop.uokik.gov.pl{loc.group(1)}?csv=true"
                status2, _, _ = self._curl(result_url, out=out)
                if status2 == 200 and out.exists() and out.stat().st_size > 100:
                    return out
                return None
        print(f"  timeout after 40 polls")
        return None

    def fetch_measure(self, measure: str, slug: str, force: bool) -> Path | None:
        """Run async query for one srodek-pomocowy. Returns path to result CSV, or None on failure."""
        out = self.raw_dir / f"{slug}.csv"
        if out.exists() and not force and out.stat().st_size > 1000:
            return out
        from urllib.parse import quote
        url = f"{API_BASE}/api/przypadki-pomocy?srodek-pomocowy-numer={quote(measure, safe='()')}&strona=1"
        return self._async_query(url, out)

    def fetch_by_purpose_codes(self, codes: list[str], slug: str, force: bool,
                                date_from: str = "2021-01-01") -> Path | None:
        """V1 API: query by przeznaczenie-pomocy-kod (purpose codes). One call for all codes.
        Codes: e.g. ['a1.1.1','a1.1.2','a1.1.3','a1.2','a1.4','a1.9']
        """
        out = self.raw_dir / f"{slug}.csv"
        if out.exists() and not force and out.stat().st_size > 1000:
            print(f"  [{slug}] cached ({out.stat().st_size:,} bytes)")
            return out
        from urllib.parse import quote
        params = "&".join(f"przeznaczenie-pomocy-kod={quote(c)}" for c in codes)
        url = (f"{API_BASE}/v1/api/przypadki-pomocy?{params}"
               f"&dzien-udzielenia-pomocy-od={date_from}&strona=1")
        print(f"  [{slug}] querying v1 API with {len(codes)} purpose codes from {date_from} …")
        return self._async_query(url, out)


# ---------------------------------------------------------------------------
# Parse SUDOP CSV
# ---------------------------------------------------------------------------

_NORM_LEGAL_RE = re.compile(
    r"\b(Sp\.\s*z\s*o\.\s*o\.?|Sp\.\s*j\.|Sp\.\s*k\.|Sp\.\s*p\.|"
    r"S\.A\.|Sp\.\s*akc\.|S\.K\.A\.|"
    r"GmbH|AG|BV|NV|Ltd|Limited|Inc|Corp|SE|SpA|Srl)\b\.?",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s or "")
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:60]


def parse_csv(path: Path, slug: str, sector_v1: str) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for r in reader:
            name = (r.get("nazwa-beneficjenta") or "").strip()
            if not name:
                continue
            date = (r.get("dzien-udzielenia-pomocy") or "").strip()
            try:
                year = int(date[:4])
            except ValueError:
                continue
            if year < 2021:
                continue
            nip = (r.get("nip-beneficjenta") or "").strip() or None
            authority = (r.get("nazwa-udzielajacego-pomocy") or "").strip()
            ndb = classify_ndb(authority)
            try:
                amount_eur = float(r.get("wartosc-brutto-eur") or 0)
            except ValueError:
                amount_eur = None
            measure_nm = (r.get("srodek-pomocowy-nazwa") or "").strip()

            call_id = f"sudop_{slug}_{nip or _slug(name)}_{date}"[:120]
            rows.append({
                "source": f"sudop_{slug}",
                "call_id": call_id,
                "raw_name": name,
                "nip": nip,
                "project_title": measure_nm[:240] if measure_nm else None,
                "project_summary": (
                    f"Authority: {authority} | "
                    f"Sector: {(r.get('sektor-dzialalnosci-nazwa') or '')[:80]} | "
                    f"Form: {(r.get('forma-pomocy-nazwa') or '')[:80]}"
                )[:1500],
                "sector_tags_raw": f"SUDOP | {measure_nm[:80]}",
                "sector_v1": sector_v1,
                "grant_amount_eur": amount_eur,
                "call_deadline": date,
                "doc_url": "https://sudop.uokik.gov.pl/",
                "country": "PL",
                "ndb_distributor": ndb,
            })
    return rows


# ---------------------------------------------------------------------------
# Match + load
# ---------------------------------------------------------------------------

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country",
    "matched_company_id", "matched_canonical_name",
    "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(rows: list[dict], conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies WHERE country='PL' OR country IS NULL")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        existing[(norm, (cntry or "").upper())] = (row_id, cname)

    enriched, summary = [], []
    for r in rows:
        raw_name = r["raw_name"]
        country = r["country"]
        norm = normalize_name(raw_name)

        cid: int | None = None
        method, conf = "none", "unmatched"
        matched_canonical = ""

        if (norm, country) in existing:
            cid, matched_canonical = existing[(norm, country)]
            method, conf = "exact", "high"

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

        enriched.append({**r, "company_id": cid})
        summary.append({
            "source": r["source"], "call_id": r["call_id"],
            "published_name": raw_name, "country": country,
            "matched_company_id": cid, "matched_canonical_name": matched_canonical,
            "match_method": method, "match_confidence": conf, "fuzzy_score": None,
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
                grant_amount_eur, sector_tags_raw,
                raw_source_url, coordinator_only, grant_amount_basis,
                call_deadline, deployment_country, eif_lp_backed, ndb_distributor)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, 0, 'sudop_aid_element',
                       ?, ?, 0, ?)""",
            (r["company_id"], r["source"], r["call_id"],
             r["project_title"], r["project_summary"],
             r["grant_amount_eur"], r["sector_tags_raw"], r["doc_url"],
             r["call_deadline"], DEPLOYMENT_COUNTRY, r["ndb_distributor"]),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = ["source", "call_id", "raw_name", "nip", "project_title",
                  "sector_tags_raw", "sector_v1", "grant_amount_eur",
                  "call_deadline", "country", "doc_url", "ndb_distributor"]


def main() -> None:
    args = sys.argv[1:]
    load_db = "--load-db" in args
    refresh = "--refresh" in args
    measures = INNOVATION_MEASURES
    for i, a in enumerate(args):
        if a == "--measures" and i + 1 < len(args):
            keep = set(args[i + 1].split(","))
            measures = [m for m in INNOVATION_MEASURES if m[0] in keep or m[1] in keep]

    # v1 API mode: query by purpose codes (R&D/innovation) — covers all Polish R&D aid
    # in one async call rather than per-measure. Use with --by-purpose flag.
    RND_PURPOSE_CODES = ["a1.1.1", "a1.1.2", "a1.1.3", "a1.2", "a1.4", "a1.9", "a28.8"]
    by_purpose = "--by-purpose" in args

    client = SudopClient(RAW_DIR)
    all_rows: list[dict] = []

    if by_purpose:
        print("Querying SUDOP v1 API by purpose codes (R&D/innovation, 2021+) …")
        path = client.fetch_by_purpose_codes(RND_PURPOSE_CODES, "rnd_purpose", refresh)
        if path:
            rows = parse_csv(path, "rnd_purpose", "deeptech_hardware")
            print(f"  [rnd_purpose] {len(rows)} eligible rows")
            all_rows.extend(rows)
        else:
            print("  [rnd_purpose] no result — falling back to per-measure queries")
            by_purpose = False

    if not by_purpose:
        for measure, slug, sector, desc in measures:
            print(f"Querying SUDOP for {measure} ({desc[:60]}) …")
            path = client.fetch_measure(measure, slug, refresh)
            if not path:
                print(f"  [{slug}] no result")
                continue
            rows = parse_csv(path, slug, sector)
            print(f"  [{slug}] {len(rows)} eligible rows")
            all_rows.extend(rows)

    print(f"\nTotal: {len(all_rows)} rows across {len(measures)} measures")
    grand = sum((r["grant_amount_eur"] or 0) for r in all_rows)
    print(f"Headline grant volume: €{grand/1e6:.1f}M")

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        w.writeheader()
        w.writerows(all_rows)
    print(f"CSV → {OUT_CSV}")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        return

    conn = sqlite3.connect(DB_PATH)
    enriched, summary = match_companies(all_rows, conn)

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
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("sudop_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()


if __name__ == "__main__":
    main()
