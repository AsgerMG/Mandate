"""
Generic CORDIS extractor for Horizon Europe JU/partnership projects.

Reads the CORDIS open-data dump at data/raw/cordis/ (project.csv + organization.csv + topics.csv,
downloaded from https://cordis.europa.eu/data/cordis-HORIZONprojects-csv.zip).

Per Sprint 11: covers CHP (Clean Hydrogen Partnership), IHI JU (Innovative Health Initiative),
EuroHPC JU, plus a supplement pass for KDT JU (predecessor to Chips JU) — the portal extractor
misses some KDT projects that CORDIS captures.

Option A (coordinator only) — same convention as IF / Chips JU / EDF / EIT.

Each family exports its own *_SOURCE_SECTOR dict for classify.py to import.

Usage:
  python extract_cordis.py                  → CSVs only (no DB writes)
  python extract_cordis.py --load-db        → match + load into db.sqlite
"""


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
import re
import sqlite3
import sys
from difflib import SequenceMatcher
from pathlib import Path

DATA_DIR = _ETL_ROOT / "data" / "raw" / "cordis"
PROCESSED_DIR = _ETL_ROOT / "data" / "processed"
DB_PATH = _ETL_DB

# Topic prefix → (source-family, default sector, basis label, sector_tag_leader)
FAMILIES = {
    "chp": {
        "prefixes": ("HORIZON-JTI-CLEANH2-", "HORIZON-JU-CLEANH2-"),
        "sector": "cleantech",
        "basis": "chp_grant",
        "tag_leader": "Hydrogen",
        "source_prefix": "chp_",
    },
    "ihi": {
        "prefixes": ("HORIZON-JU-IHI-",),
        "sector": "life_sciences",
        "basis": "ihi_grant",
        "tag_leader": "Health Biotechnology",
        "source_prefix": "ihi_",
    },
    "eurohpc": {
        "prefixes": ("HORIZON-EUROHPC-",),
        "sector": "deeptech_hardware",
        "basis": "eurohpc_grant",
        "tag_leader": "HPC",
        "source_prefix": "eurohpc_",
    },
    "kdt_supplement": {
        # KDT JU projects that CORDIS captures but the chips-ju.europa.eu OData missed.
        "prefixes": ("HORIZON-KDT-",),
        "sector": "deeptech_hardware",
        "basis": "kdt_grant",
        "tag_leader": "Semiconductors",
        "source_prefix": "chips_ju_kdt_",
    },
}

EUR_ISO = {
    "AT","BE","BG","CH","CY","CZ","DE","DK","EE","EL","ES","FI","FR","GB","GR",
    "HR","HU","IE","IS","IT","LI","LT","LU","LV","MT","NL","NO","PL","PT","RO",
    "SE","SI","SK","TR","UA","IL","UK","RS","XK","BA","MD","ME","AL","MK","GE","AM","AZ",
}


def _normalize_name(name: str) -> str:
    n = name.upper()
    for suffix in [" GMBH"," BV"," NV"," AB"," AG"," SA"," SAS"," SRL"," SPA"," AS",
                   " OY"," APS"," LTD"," PLC"," LLC"," INC"," CORP"," SL"," SLU",
                   " LDA"," KFT"," ZRT"," NYRT"," DOO"," DD"," EE"," IKE"," SARL",
                   " S.A."," S.A"," S.R.L."," S.P.A."," S.L."," S.A.S."," EHF",
                   " HF"," UAB"," OOO"," SRO"," SP. Z O.O.","SPOLKA AKCYJNA",
                   " ASBL"," AISBL"," VZW"," IVZW"," LDA."," GMBH & CO. KG",
                   " ENERGY"," GROUP"," HOLDING"," HOLDINGS"," AKADEMI"," EUROPE",
                   " EUROPA"," INTERNATIONAL"," (THE)"]:
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    n = re.sub(r"[^A-Z0-9]+", " ", n).strip()
    n = re.sub(r"\s+", " ", n)
    return n


def _topic_year(topic: str) -> str:
    m = re.search(r"-(20\d{2})-", topic)
    return m.group(1) if m else "unknown"


def _load_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter=";"))


def discover_family_rows(family_key: str, projects_by_id: dict, orgs_by_pid: dict,
                        topics_by_pid: dict) -> list[dict]:
    """Yield event rows for one family (e.g. chp)."""
    fam = FAMILIES[family_key]
    rows: list[dict] = []
    skipped_no_coord = 0
    skipped_pre_2021 = 0

    for pid, topics in topics_by_pid.items():
        match_topic = None
        for t in topics:
            if any(t.startswith(p) for p in fam["prefixes"]):
                match_topic = t
                break
        if not match_topic:
            continue

        proj = projects_by_id.get(pid)
        if not proj:
            continue

        start = (proj.get("startDate") or "").strip()
        if not start or start < "2021-01-01":
            skipped_pre_2021 += 1
            continue

        # Find coordinator
        coord = None
        for org in orgs_by_pid.get(pid, []):
            if (org.get("role") or "").lower() == "coordinator":
                coord = org
                break
        if not coord:
            skipped_no_coord += 1
            continue

        country = (coord.get("country") or "").strip().upper()
        if country == "EL":
            country = "GR"
        if country == "UK":
            country = "GB"

        year = _topic_year(match_topic)
        source = f"{fam['source_prefix']}{year}"
        if family_key == "kdt_supplement":
            source = f"chips_ju_kdt_{year}"

        # call_id: kdt_supplement uses acronym to match existing OData convention
        if family_key == "kdt_supplement":
            acronym_slug = re.sub(r"[^a-z0-9]+", "_",
                                  (proj.get("acronym") or pid).lower()).strip("_")
            call_id = f"{source}_{acronym_slug}"
        else:
            call_id = f"{source}_{pid}"

        grant_eur = proj.get("ecMaxContribution") or ""
        try:
            grant_eur = float(grant_eur.replace(",", ".")) if grant_eur else None
        except ValueError:
            grant_eur = None

        rows.append({
            "source": source,
            "call_id": call_id,
            "company_name": coord.get("name", "").strip(),
            "country": country if country in EUR_ISO else "",
            "role": "direct",
            "project_number": pid,
            "project_title": proj.get("title", "").strip(),
            "project_summary": proj.get("objective", "").strip()[:1000],
            "project_started": start,
            "grant_amount_eur": grant_eur,
            "debt_amount_eur": None,
            "equity_amount_eur": None,
            "sector_tags_raw": f"{fam['tag_leader']}, {match_topic}",
            "grant_amount_basis": fam["basis"],
            "raw_source_url": f"https://cordis.europa.eu/project/id/{pid}",
            "_family": family_key,
        })

    print(f"  {family_key}: {len(rows)} kept (skipped {skipped_no_coord} no-coord, "
          f"{skipped_pre_2021} pre-2021)")
    return rows


def _match_company(con, name: str, country: str) -> tuple[int | None, str]:
    """5-tier matcher: exact (name+country) → exact_name_only → forward prefix →
    reverse prefix → fuzzy ≥0.92 → None."""
    cur = con.cursor()
    norm = _normalize_name(name)
    if not norm:
        return None, "none"

    # exact
    cur.execute(
        "SELECT id FROM companies WHERE UPPER(canonical_name)=? AND country=?",
        (norm, country),
    )
    r = cur.fetchone()
    if r:
        return r[0], "exact"

    # exact name only
    cur.execute("SELECT id FROM companies WHERE UPPER(canonical_name)=?", (norm,))
    r = cur.fetchone()
    if r:
        return r[0], "exact_name_only"

    # forward prefix: existing name is whole-word prefix of new (≥4 chars)
    cur.execute("SELECT id, UPPER(canonical_name), country FROM companies "
                "WHERE country=? AND LENGTH(canonical_name)>=4", (country,))
    for cid, cname, _ in cur.fetchall():
        if norm.startswith(cname + " "):
            return cid, "prefix"
        if cname.startswith(norm + " "):
            return cid, "reverse_prefix"

    # fuzzy
    cur.execute("SELECT id, UPPER(canonical_name) FROM companies WHERE country=?",
                (country,))
    best = (0.0, None)
    for cid, cname in cur.fetchall():
        ratio = SequenceMatcher(None, norm, cname).ratio()
        if ratio > best[0]:
            best = (ratio, cid)
    if best[0] >= 0.92 and best[1] is not None:
        return best[1], "fuzzy"

    return None, "none"


def _load_to_db(rows: list[dict], family_key: str) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    counts: dict[str, int] = {"exact": 0, "exact_name_only": 0, "prefix": 0,
                              "reverse_prefix": 0, "fuzzy": 0, "none": 0,
                              "skipped_dup": 0, "inserted_events": 0}

    for r in rows:
        # Match company
        cid, method = _match_company(con, r["company_name"], r["country"])
        if cid is None:
            # Insert new company
            norm = _normalize_name(r["company_name"])
            cur.execute(
                """INSERT INTO companies (canonical_name, country, sector_inferred,
                   entity_type, match_method)
                   VALUES (?, ?, NULL, 'unknown', ?)""",
                (norm, r["country"], f"{family_key}"),
            )
            cid = cur.lastrowid
            counts["none"] += 1
        else:
            counts[method] += 1

        # Insert event (idempotent on (source, call_id))
        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
            (r["source"], r["call_id"]),
        )
        if cur.fetchone():
            counts["skipped_dup"] += 1
            continue

        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, call_id, role, coordinator_only,
                project_number, project_title, project_summary, project_started,
                grant_amount_eur, debt_amount_eur, equity_amount_eur,
                sector_tags_raw, grant_amount_basis, raw_source_url)
               VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (cid, r["source"], r["call_id"], r["role"], r["project_number"],
             r["project_title"], r["project_summary"], r["project_started"],
             r["grant_amount_eur"], r["debt_amount_eur"], r["equity_amount_eur"],
             r["sector_tags_raw"], r["grant_amount_basis"], r["raw_source_url"]),
        )
        counts["inserted_events"] += 1

    con.commit()
    con.close()
    return counts


def main() -> None:
    args = sys.argv[1:]
    load_db = "--load-db" in args

    print(f"Loading CORDIS dataset from {DATA_DIR} ...")
    projects = _load_csv(DATA_DIR / "project.csv")
    orgs = _load_csv(DATA_DIR / "organization.csv")
    topics = _load_csv(DATA_DIR / "topics.csv")
    print(f"  project rows: {len(projects)}")
    print(f"  org rows: {len(orgs)}")
    print(f"  topic rows: {len(topics)}")

    projects_by_id = {p["id"]: p for p in projects}
    orgs_by_pid: dict[str, list[dict]] = {}
    for o in orgs:
        orgs_by_pid.setdefault(o["projectID"], []).append(o)
    topics_by_pid: dict[str, list[str]] = {}
    for t in topics:
        topics_by_pid.setdefault(t["projectID"], []).append(t["topic"])

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    all_counts = {}

    for fam_key in ["chp", "ihi", "eurohpc", "kdt_supplement"]:
        rows = discover_family_rows(fam_key, projects_by_id, orgs_by_pid, topics_by_pid)
        if not rows:
            continue

        # Write per-family CSV
        out_csv = PROCESSED_DIR / f"cordis_{fam_key}_projects.csv"
        with open(out_csv, "w", newline="", encoding="utf-8") as f:
            fieldnames = [k for k in rows[0].keys() if not k.startswith("_")]
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for r in rows:
                w.writerow({k: r[k] for k in fieldnames})
        print(f"  CSV → {out_csv}")

        # Per-source totals
        from collections import Counter
        src_counts = Counter(r["source"] for r in rows)
        src_grants: dict[str, float] = {}
        for r in rows:
            if r["grant_amount_eur"]:
                src_grants[r["source"]] = src_grants.get(r["source"], 0) + r["grant_amount_eur"]
        for src in sorted(src_counts):
            n = src_counts[src]
            g = src_grants.get(src, 0)
            print(f"    {src:<32} {n:<3} events  €{g/1e6:.1f}M")

        if load_db:
            counts = _load_to_db(rows, fam_key)
            all_counts[fam_key] = counts
            print(f"  Match: {counts}")

    if not load_db:
        print("\n(CSV only — pass --load-db to match and load into db.sqlite)")
        print("Reminder: run python3 classify.py after --load-db")


# Per-family sector dicts for classify.py
CHP_SOURCE_SECTOR: dict[str, str] = {}
IHI_SOURCE_SECTOR: dict[str, str] = {}
EUROHPC_SOURCE_SECTOR: dict[str, str] = {}


def _build_source_sector_dicts() -> None:
    """Populate the *_SOURCE_SECTOR dicts by scanning topics.csv for known topic prefixes.
    Called at import time so classify.py picks up the right values."""
    try:
        topics = _load_csv(DATA_DIR / "topics.csv")
    except FileNotFoundError:
        return
    seen_years = {fam: set() for fam in FAMILIES}
    for t in topics:
        topic = t["topic"]
        for fam_key, fam in FAMILIES.items():
            if any(topic.startswith(p) for p in fam["prefixes"]):
                year = _topic_year(topic)
                seen_years[fam_key].add(year)
                break
    for year in seen_years["chp"]:
        CHP_SOURCE_SECTOR[f"chp_{year}"] = "cleantech"
    for year in seen_years["ihi"]:
        IHI_SOURCE_SECTOR[f"ihi_{year}"] = "life_sciences"
    for year in seen_years["eurohpc"]:
        EUROHPC_SOURCE_SECTOR[f"eurohpc_{year}"] = "deeptech_hardware"


_build_source_sector_dicts()


if __name__ == "__main__":
    main()
