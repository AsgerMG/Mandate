"""Extract SPRIND (Bundesagentur für Sprunginnovationen) — Projects portfolio.

**Company-level promotion of the SPRIND placeholder layer.**

Source: https://www.sprind.org/en/actions/projects
  The page is a Nuxt SSR app backed by a Strapi CMS (cms.system.sprind.org).
  The public Strapi REST API is permission-gated (404), but the listing page
  server-renders the FULL project set into its `window.__NUXT__` payload — all
  ~198 projects are present in one fetch (no "Load more" pagination needed).

Each project card (Strapi component, fields suffixed `_en`/`_de`/`_c`) carries:
  name_en, country_en, location_en, sector_en (newline-joined labels),
  sprind_financing_en (instrument), other_financing_en (funding stage),
  website, project_url_en (→ slug), innovator_1..4_c (founders).

Why this is the recoverable company-level layer (vs the Challenges):
  SPRIND *Challenges* list team codenames, not legal entities (the prior scaffold
  stalled there — those 20 `sprind_challenge` placeholder rows are RETAINED in the
  DB and intentionally NOT regenerated or repurposed here). The *Projects*
  portfolio maps to real ventures with names, sectors, countries and websites.

Funding-instrument reality (verified):
  SPRIND is not a classical grant-giver. Its instruments are:
    - "Equity Investment/Convertible Loan"  → instrument_class='equity'
    - "Validation Study" / "R&D Grant" / "Challenge/Funke" → instrument_class='grant'
  SPRIND does NOT publish ticket sizes — there are zero amount figures anywhere in
  the dataset. Per the amount-recovery doctrine (NULL = unrecoverable, no
  fabrication), every event's amount columns are left NULL.

Schema mapping (source='sprind_project'):
  role                = 'direct'
  instrument_class    = 'equity' | 'grant' (primary; equity wins if present)
  grant_amount_basis  = per-instrument basis string
  equity/grant/debt amounts = NULL (none published)
  ndb_distributor     = 'sprind'
  deployment_country  = canonical ISO-2 (europe-scope filtered)
  entity_type         = 'company'

Run modes:
  python extract_sprind.py             → parse + CSV only (Phase A; NO DB writes)
  python extract_sprind.py --refresh   → re-download the listing first
  python extract_sprind.py --load-db   → match + load (Phase B; gated behind the
                                          classification + name-merge pipeline)
"""
from __future__ import annotations

import csv
import json
import re
import sqlite3
import subprocess
import sys
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from europe_scope import canonicalise_country  # noqa: E402
from ndb_helpers import backfill_ipcei_linked  # noqa: E402

BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw" / "sprind"
OUT_DIR = BASE_DIR / "data" / "processed"
RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

LISTING_URL = "https://www.sprind.org/en/actions/projects"
LISTING_HTML = RAW_DIR / "projects_listing_en.html"
CSV_PATH = OUT_DIR / "sprind_projects.csv"
MATCH_CSV_PATH = OUT_DIR / "sprind_match_summary.csv"
DB_PATH = BASE_DIR / "db.sqlite"

# Hint for classify.py source-fallback (kept for vocab consistency).
SPRIND_SOURCE_SECTOR: dict[str, str] = {"sprind_project": "deeptech_hardware"}


# ── Country full-name → ISO-2 (SPRIND emits uppercase English names) ─────────
# Canonicalisation + europe-scope filtering still goes through
# europe_scope.canonicalise_country(); this only resolves names to codes first.
COUNTRY_NAME_TO_ISO2: dict[str, str] = {
    "GERMANY": "DE", "SWITZERLAND": "CH", "UNITED KINGDOM": "GB",
    "NETHERLANDS": "NL", "NORWAY": "NO", "FRANCE": "FR", "ESTONIA": "EE",
    "PORTUGAL": "PT", "DENMARK": "DK", "ITALY": "IT", "FINLAND": "FI",
    "SLOVENIA": "SI", "AUSTRIA": "AT", "SPAIN": "ES", "SWEDEN": "SE",
    "LATVIA": "LV", "SLOVAKIA": "SK", "BELGIUM": "BE", "POLAND": "PL",
    "IRELAND": "IE", "CZECHIA": "CZ", "CZECH REPUBLIC": "CZ", "USA": "US",
    "UNITED STATES": "US",
}


# ── Sector label → v1 bucket (covers all 10 SPRIND labels; first-match primary)
SECTOR_TO_V1: dict[str, str] = {
    "Life Sciences & Biotechnology": "life_sciences",
    "Energy & Sustainability": "cleantech",
    "Agriculture & Food Systems": "cleantech",
    "Mobility & Infrastructure": "cleantech",
    "Software & AI": "digital",
    "Manufacturing & Robotics": "deeptech_hardware",
    "Advanced Materials": "deeptech_hardware",
    "Computing & Semiconductors": "deeptech_hardware",
    "Aviation & Space": "space",
    "Security & Resilience": "defense",
}


# ── Instrument label → (instrument_class, basis); equity beats grant ──────────
# A project can list several; we pick the highest-tier class as primary.
def map_instrument(financing: str) -> tuple[str, str]:
    labels = {ln.strip() for ln in (financing or "").split("\n") if ln.strip()}
    if "Equity Investment/Convertible Loan" in labels:
        return "equity", "sprind_equity_convertible"
    if "R&D Grant" in labels:
        return "grant", "sprind_rd_grant"
    if "Validation Study" in labels:
        return "grant", "sprind_validation_study"
    if "Challenge/Funke" in labels:
        return "grant", "sprind_challenge_funke"
    return "grant", "sprind_other"


def map_sector(sector_en: str) -> tuple[str, str]:
    """Return (primary_v1_bucket, raw_label_list). First listed label wins."""
    labels = [ln.strip() for ln in (sector_en or "").split("\n") if ln.strip()]
    primary = "deeptech_hardware"  # SPRIND is a deeptech agency by mandate
    for lab in labels:
        if lab in SECTOR_TO_V1:
            primary = SECTOR_TO_V1[lab]
            break
    return primary, ", ".join(labels)


# ── Name normaliser (mirrors extract_htgf.py for cross-source dedup) ──────────
_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|GmbH\s*&\s*Co\.?\s*KG|"
    r"BV|NV|SAS|SARL|SE|SA|Oy|AB|AS|ApS|"
    r"Ltd|Limited|PLC|LLC|LLP|Inc|Corp|Holding|Group)\b\.?",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


# ── Fetch + parse the Nuxt payload ───────────────────────────────────────────

def fetch_listing(force: bool) -> str:
    if LISTING_HTML.exists() and not force and LISTING_HTML.stat().st_size > 5000:
        return LISTING_HTML.read_text(encoding="utf-8")
    subprocess.run(
        ["/usr/bin/curl", "-sL", "-A", "Mozilla/5.0", "--max-time", "30",
         "-o", str(LISTING_HTML), LISTING_URL],
        check=False,
    )
    if not LISTING_HTML.exists() or LISTING_HTML.stat().st_size < 5000:
        raise RuntimeError(f"SPRIND fetch failed: {LISTING_HTML}")
    return LISTING_HTML.read_text(encoding="utf-8")


def _nuxt_payload(html: str) -> list:
    m = re.search(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError("SPRIND: no Nuxt JSON payload found in listing HTML")
    return json.loads(m.group(1))


def _str_ref(data: list, v, _depth: int = 0):
    """Resolve a devalue string reference to its string, following int→int
    chains (the payload references some strings indirectly), else None."""
    if isinstance(v, str):
        return v
    if isinstance(v, int) and 0 <= v < len(data) and _depth < 8:
        return _str_ref(data, data[v], _depth + 1)
    return None


def _slug_from_url(url: str | None) -> str:
    if not url:
        return ""
    return url.rstrip("/").rsplit("/", 1)[-1]


_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    """Stable id from a venture name (the unique key — names are distinct).

    Project URLs are NOT unique per venture: challenge-team ventures all share
    their challenge page URL, so the name is the only reliable identifier.
    """
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return _SLUG_STRIP_RE.sub("-", s.lower()).strip("-")


def parse_projects(html: str) -> list[dict]:
    data = _nuxt_payload(html)
    cards = [n for n in data
             if isinstance(n, dict) and "sprind_financing_en" in n and "name_en" in n]

    rows: list[dict] = []
    seen_slugs: set[str] = set()
    for n in cards:
        name = _str_ref(data, n.get("name_en"))
        if not name:
            continue
        # Venture name is the unique key (project URLs are shared across
        # challenge-team ventures). Slugify the name for a stable call_id.
        slug = slugify(name)
        url = _str_ref(data, n.get("project_url_en"))
        if not slug or slug in seen_slugs:
            continue
        seen_slugs.add(slug)

        raw_country = _str_ref(data, n.get("country_en")) or ""
        iso2 = COUNTRY_NAME_TO_ISO2.get(raw_country.strip().upper())
        country = canonicalise_country(iso2)  # None → out of europe scope

        sector_en = _str_ref(data, n.get("sector_en")) or ""
        sector_v1, sector_raw = map_sector(sector_en)
        financing = _str_ref(data, n.get("sprind_financing_en")) or ""
        instrument_class, basis = map_instrument(financing)
        stage = _str_ref(data, n.get("other_financing_en")) or ""

        founders = [
            _str_ref(data, n.get(f"innovator_{i}_c")) for i in range(1, 5)
        ]
        founders = [f for f in founders if f]

        rows.append({
            "slug": slug,
            "raw_name": name,
            "country": country,           # None if out of scope (skipped at load)
            "raw_country": raw_country,
            "city": _str_ref(data, n.get("location_en")) or "",
            "sector_v1": sector_v1,
            "sector_tags_raw": sector_raw,
            "instrument_class": instrument_class,
            "grant_amount_basis": basis,
            "financing_raw": financing.replace("\n", "; "),
            "stage": stage,
            "founders": "; ".join(founders),
            "website": _str_ref(data, n.get("website")) or "",
            "doc_url": url or f"https://www.sprind.org/en/actions/projects/{slug}",
            "source": "sprind_project",
            "call_id": f"sprind_project_{slug}",
        })
    return rows


# ── Matcher + loader (Phase B — only runs with --load-db) ─────────────────────

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country",
    "matched_company_id", "matched_canonical_name",
    "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(rows: list[dict], conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        key = (norm, (cntry or "").upper())
        existing[key] = (row_id, cname)
        existing_list.append((norm, (cntry or "").upper(), row_id, cname))

    enriched, summary = [], []
    for r in rows:
        country = r["country"]
        if country is None:
            continue  # out of europe scope — skip entirely
        norm = normalize_name(r["raw_name"])
        cid: int | None = None
        method, conf, matched_canonical, fuzzy_score = "none", "unmatched", "", None

        if (norm, country) in existing:
            cid, matched_canonical = existing[(norm, country)]
            method, conf = "exact", "high"

        if cid is None and norm:
            best_ratio, best_id, best_name = 0.0, None, ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country:
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
                   (canonical_name, raw_name, country, city, website, entity_type,
                    sector_inferred, match_confidence, match_method)
                   VALUES (?, ?, ?, ?, ?, 'company', ?, 'unmatched', 'none')""",
                (r["raw_name"], r["raw_name"], country, r["city"] or None,
                 r["website"] or None, r["sector_v1"]),
            )
            cid = cur.lastrowid
            matched_canonical = r["raw_name"]
            existing[(norm, country)] = (cid, r["raw_name"])
            existing_list.append((norm, country, cid, r["raw_name"]))

        enriched.append({**r, "company_id": cid})
        summary.append({
            "source": r["source"], "call_id": r["call_id"],
            "published_name": r["raw_name"], "country": country,
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
        # Amounts intentionally NULL — SPRIND publishes no ticket sizes.
        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id, project_title, project_summary,
                sector_tags_raw, raw_source_url, coordinator_only,
                grant_amount_basis, instrument_class, ndb_distributor,
                deployment_country, eif_lp_backed)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, 1, ?, ?, 'sprind', ?, 0)""",
            (r["company_id"], r["source"], r["call_id"], r["raw_name"],
             r["financing_raw"], r["sector_tags_raw"], r["doc_url"],
             r["grant_amount_basis"], r["instrument_class"], r["country"]),
        )
        inserted += 1
    conn.commit()
    if skipped:
        print(f"  Skipped {skipped} duplicate (source, call_id) pairs")
    return inserted


CSV_FIELDNAMES = ["source", "call_id", "slug", "raw_name", "country", "raw_country",
                  "city", "sector_v1", "sector_tags_raw", "instrument_class",
                  "grant_amount_basis", "financing_raw", "stage", "founders",
                  "website", "doc_url"]


def main() -> None:
    args = set(sys.argv[1:])
    load_db = "--load-db" in args
    refresh = "--refresh" in args

    print(f"Fetching {LISTING_URL} ...")
    html = fetch_listing(force=refresh)
    rows = parse_projects(html)
    in_scope = [r for r in rows if r["country"] is not None]
    out_scope = [r for r in rows if r["country"] is None]
    print(f"Parsed {len(rows)} SPRIND projects "
          f"({len(in_scope)} in europe-scope, {len(out_scope)} out-of-scope skipped at load)")

    by_country = defaultdict(int)
    by_instr = defaultdict(int)
    for r in in_scope:
        by_country[r["country"]] += 1
        by_instr[r["instrument_class"]] += 1
    print("By instrument_class:", dict(by_instr))
    print("Top countries:", dict(sorted(by_country.items(), key=lambda x: -x[1])[:8]))

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        w.writeheader()
        w.writerows(rows)
    print(f"CSV → {CSV_PATH}")
    print("NOTE: amounts are NULL by design — SPRIND publishes no ticket sizes "
          "(amount-recovery doctrine).")

    if not load_db:
        print("(CSV only — pass --load-db to match and load. "
              "Phase B is gated behind the classification + name-merge pipeline.)")
        return

    conn = sqlite3.connect(DB_PATH)
    enriched, summary = match_companies(rows, conn)
    with MATCH_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w2 = csv.DictWriter(f, fieldnames=MATCH_FIELDNAMES)
        w2.writeheader()
        w2.writerows(summary)
    method_counts = defaultdict(int)
    for s in summary:
        method_counts[s["match_method"]] += 1
    print("Match results:", dict(method_counts))

    inserted = load_events(enriched, conn)
    flagged = backfill_ipcei_linked(conn=conn, source_prefixes=("sprind_",))
    print(f"Inserted {inserted} events; flagged {flagged} as ipcei_linked")
    conn.close()
    print("next: run python3 scripts/classify.py")


if __name__ == "__main__":
    main()
