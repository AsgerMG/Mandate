"""
Horizon Europe Pillar II extractor — multi-cluster CORDIS ingestion.

Reads the CORDIS open-data dump at data/raw/cordis/ (project.csv + organization.csv
+ topics.csv) and emits per-organisation events for the requested cluster:

  CL1 HORIZON-HLTH-     Health             → life_sciences (excl. HORIZON-JU-IHI-*)
  CL3 HORIZON-CL3-      Civil Security     → defense (civil dual-use)
  CL4 HORIZON-CL4-      Digital/Industry/Space → digital
  CL5 HORIZON-CL5-      Climate/Energy/Mobility → cleantech
  CL6 HORIZON-CL6-      Food/Bioeconomy    → other (sector vocab unchanged)

Granularity = (project, organisation) — finer than the coordinator-only Option A
used by other CORDIS / JU loaders, because CORDIS publishes per-participant EU
contribution (`ecContribution`) explicitly. The `role` column distinguishes
coordinator vs participant vs thirdParty vs associatedPartner; `coordinator_only`
is 1 for coordinator else 0 so existing lead-only analytics keep working.

PIC-first matching: CORDIS `organisationID` IS the PIC. Where it matches an
existing `companies.pic`, the join is canonical. Fallback to the 5-tier matcher
shared with extract_cordis.py.

Usage:
  python extract_cordis_pillar_ii.py --cluster CL4              # CSV only
  python extract_cordis_pillar_ii.py --cluster CL4 --load-db
  python extract_cordis_pillar_ii.py --cluster CL1 --exclude-ihi --load-db
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

import argparse
import csv
import re
import sqlite3
import sys
from difflib import SequenceMatcher
from pathlib import Path

# Sprint 17: canonicalise_country enforces the 40-country scope (added Sprint 14).
# Import lazily so the script can be imported without the module on path.
try:
    from europe_scope import canonicalise_country as _canonicalise_country
except ImportError:
    pass  # sys.path handled by etl_env bootstrap
    from europe_scope import canonicalise_country as _canonicalise_country

DATA_DIR = _ETL_ROOT / "data" / "raw" / "cordis"
PROCESSED_DIR = _ETL_ROOT / "data" / "processed"
DB_PATH = _ETL_DB

# Cluster → (topic prefix, default sector, source-id stem)
CLUSTERS = {
    "CL1":  {"prefix": "HORIZON-HLTH-",   "sector": "life_sciences", "stem": "horizon_eu_cl1"},
    "CL3":  {"prefix": "HORIZON-CL3-",    "sector": "defense",       "stem": "horizon_eu_cl3"},
    "CL4":  {"prefix": "HORIZON-CL4-",    "sector": "digital",       "stem": "horizon_eu_cl4"},
    "CL5":  {"prefix": "HORIZON-CL5-",    "sector": "cleantech",     "stem": "horizon_eu_cl5"},
    "CL6":  {"prefix": "HORIZON-CL6-",    "sector": "other",         "stem": "horizon_eu_cl6"},
    # Sprint 17: additional Horizon Europe programme families
    "MISS":    {"prefix": "HORIZON-MISS-",   "sector": "other",         "stem": "horizon_eu_miss"},
    "EIE":     {"prefix": "HORIZON-EIE-",    "sector": "digital",       "stem": "horizon_eu_eie"},
    "CBE":     {"prefix": "HORIZON-JU-CBE-", "sector": "cleantech",     "stem": "horizon_eu_cbe"},
    # ERC Proof of Concept — bridges academic research to commercial application.
    # topic_contains restricts to PoC topics only (avoids loading STG/COG/ADG/SyG).
    "ERC_POC": {"prefix": "ERC-",            "sector": "deeptech_hardware", "stem": "erc_poc",
                "topic_contains": "POC"},
    # JU families re-extracted at org-level (replacing the coordinator-only
    # extract_cordis.py loads). Same source stems and basis labels as before so
    # per-family analytics and classify.py source-sector maps keep working.
    "CHP_JU":     {"prefixes": ("HORIZON-JTI-CLEANH2-", "HORIZON-JU-CLEANH2-"),
                   "sector": "cleantech",         "stem": "chp",          "basis": "chp_grant"},
    "IHI_JU":     {"prefixes": ("HORIZON-JU-IHI-",),
                   "sector": "life_sciences",     "stem": "ihi",          "basis": "ihi_grant"},
    "EUROHPC_JU": {"prefixes": ("HORIZON-EUROHPC-", "HORIZON-JU-EUROHPC"),
                   "sector": "deeptech_hardware", "stem": "eurohpc",      "basis": "eurohpc_grant"},
    "CHIPS_JU":   {"prefixes": ("HORIZON-KDT-", "HORIZON-JU-CHIPS-", "HORIZON-JU-Chips-"),
                   "sector": "deeptech_hardware", "stem": "chips_ju_kdt", "basis": "kdt_grant"},
    # Sprint 18 JU batch (probed 2026-06-11; all in the local CORDIS dump).
    # NOTE: "HORIZON-JU-Chips-" above is the mixed-case Chips-Act-era prefix —
    # topic prefixes are case-sensitive, the uppercase variant alone missed
    # 19 projects / €1,021M.
    "CLEAN_AVIATION": {"prefixes": ("HORIZON-JU-CLEAN-AVIATION",),
                       "sector": "cleantech",      "stem": "clean_aviation", "basis": "clean_aviation_grant"},
    "SNS_JU":         {"prefixes": ("HORIZON-JU-SNS",),
                       "sector": "digital",        "stem": "sns_ju",         "basis": "sns_grant"},
    "SESAR_JU":       {"prefixes": ("HORIZON-SESAR",),
                       "sector": "digital",        "stem": "sesar_ju",       "basis": "sesar_grant"},
    "EUROPES_RAIL":   {"prefixes": ("HORIZON-ER-JU",),
                       "sector": "other",          "stem": "europes_rail",   "basis": "eu_rail_grant"},
    "EUSPA":          {"prefixes": ("HORIZON-EUSPA",),
                       "sector": "space",          "stem": "euspa",          "basis": "euspa_grant"},
    "GH_EDCTP3":      {"prefixes": ("HORIZON-JU-GH-EDCTP3",),
                       "sector": "life_sciences",  "stem": "gh_edctp3",      "basis": "edctp3_grant"},
}

# Source-sector fallback for the Sprint 18 JU stems (single dict, imported by
# classify.py; same pattern as the CL dicts below).
JU_BATCH_SOURCE_SECTOR: dict[str, str] = {
    f"{cfg['stem']}_{y}": cfg["sector"]
    for key, cfg in CLUSTERS.items()
    if key in ("CLEAN_AVIATION", "SNS_JU", "SESAR_JU", "EUROPES_RAIL", "EUSPA", "GH_EDCTP3")
    for y in ["2021", "2022", "2023", "2024", "2025", "2026", "2027", "unknown"]
}


def _cluster_prefixes(cfg: dict) -> tuple[str, ...]:
    return cfg.get("prefixes") or (cfg["prefix"],)

# Mission-topic prefix → finer sector override (applied on top of CLUSTERS["MISS"]["sector"]).
# Only the sub-mission fragments that unambiguously map to a sector are listed here;
# the default "other" is kept for cities / soil / ocean missions.
_MISS_SECTOR: dict[str, str] = {
    "CANCER": "life_sciences",
    "CLIMA":  "cleantech",
}


def _miss_sector(topic: str) -> str:
    """Return sector for a HORIZON-MISS-* topic code, using sub-mission name."""
    upper = topic.upper()
    for frag, sec in _MISS_SECTOR.items():
        if f"-{frag}-" in upper:
            return sec
    return "other"


# JU-derived topic prefixes already ingested via extract_cordis.py / extract_chips_ju.py;
# always exclude to prevent double-counting (regardless of which cluster a project
# happens to also be tagged under).
JU_EXCLUDE_PREFIXES = (
    "HORIZON-JU-IHI-",
    "HORIZON-JU-CHIPS-",
    "HORIZON-JU-Chips-",  # Chips-Act-era mixed-case (Sprint 18)
    "HORIZON-EUROHPC-",
    "HORIZON-JU-EUROHPC",  # new-prefix EuroHPC calls (Sprint 18)
    "HORIZON-KDT-",
    "HORIZON-JTI-CLEANH2-",
    "HORIZON-JU-CLEANH2-",
    "HORIZON-JU-CBE-",   # deduplicated against CBE cluster load
    # Sprint 18 JU batch — keep Pillar II re-runs from double-loading these.
    "HORIZON-JU-CLEAN-AVIATION",
    "HORIZON-JU-SNS",
    "HORIZON-SESAR",
    "HORIZON-ER-JU",
    "HORIZON-EUSPA",
    "HORIZON-JU-GH-EDCTP3",
)

# Roles that don't typically receive direct EU funding — still loaded so the
# graph is complete, but filtered out of aggregate views via coordinator_only.
PARTICIPANT_ROLES = {"coordinator", "participant"}

EUR_ISO = {
    "AT","BE","BG","CH","CY","CZ","DE","DK","EE","EL","ES","FI","FR","GB","GR",
    "HR","HU","IE","IS","IT","LI","LT","LU","LV","MT","NL","NO","PL","PT","RO",
    "SE","SI","SK","TR","UA","IL","UK","RS","XK","BA","MD","ME","AL","MK","GE","AM","AZ",
}


def _normalize_name(name: str) -> str:
    n = (name or "").upper()
    for suffix in [" GMBH"," BV"," NV"," AB"," AG"," SA"," SAS"," SRL"," SPA"," AS",
                   " OY"," APS"," LTD"," PLC"," LLC"," INC"," CORP"," SL"," SLU",
                   " LDA"," KFT"," ZRT"," NYRT"," DOO"," DD"," EE"," IKE"," SARL",
                   " S.A."," S.A"," S.R.L."," S.P.A."," S.L."," S.A.S."," EHF",
                   " HF"," UAB"," OOO"," SRO"," SP. Z O.O.","SPOLKA AKCYJNA",
                   " ASBL"," AISBL"," VZW"," IVZW"," LDA."," GMBH & CO. KG"]:
        if n.endswith(suffix):
            n = n[: -len(suffix)]
    n = re.sub(r"[^A-Z0-9]+", " ", n).strip()
    n = re.sub(r"\s+", " ", n)
    return n


def _topic_year(topic: str) -> str:
    m = re.search(r"-(20\d{2})-", topic)
    return m.group(1) if m else "unknown"


def _project_topic(topics_for_pid: list[str], cluster_prefixes: tuple[str, ...],
                   topic_contains: str | None = None) -> str | None:
    for t in topics_for_pid:
        if any(t.startswith(p) for p in cluster_prefixes):
            if topic_contains is None or topic_contains.upper() in t.upper():
                return t
    return None


def _load_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter=";"))


def discover_cluster_rows(cluster: str, projects_by_id: dict,
                          orgs_by_pid: dict, topics_by_pid: dict,
                          exclude_ihi: bool) -> list[dict]:
    cfg = CLUSTERS[cluster]
    rows: list[dict] = []

    stats = {
        "projects_matched": 0,
        "skipped_pre_2021": 0,
        "skipped_ju_dedup": 0,
        "skipped_empty_orgs": 0,
        "events_emitted": 0,
        "events_coordinator": 0,
        "events_participant": 0,
        "events_other_role": 0,
    }

    prefixes = _cluster_prefixes(cfg)
    for pid, topics in topics_by_pid.items():
        topic = _project_topic(topics, prefixes, cfg.get("topic_contains"))
        if not topic:
            continue

        # Dedup: if any topic on this project belongs to a JU-derived family
        # we already loaded, skip the project entirely. (CL1 IHI projects sometimes
        # carry HORIZON-JU-IHI-* alongside HORIZON-HLTH-*.)
        # Exception: a cluster is never excluded by its own prefixes (CBE and the
        # JU org-level clusters ARE the canonical loads for those families).
        effective_exclude = tuple(
            p for p in JU_EXCLUDE_PREFIXES if p not in prefixes
        )
        if any(any(t.startswith(p) for p in effective_exclude) for t in topics):
            stats["skipped_ju_dedup"] += 1
            continue
        # Belt-and-suspenders: CL1 may be invoked with --exclude-ihi; the JU
        # exclusion above already covers it but keep the flag for documentation.
        if exclude_ihi and any(t.startswith("HORIZON-JU-IHI-") for t in topics):
            stats["skipped_ju_dedup"] += 1
            continue

        proj = projects_by_id.get(pid)
        if not proj:
            continue
        start = (proj.get("startDate") or "").strip()
        if not start or start < "2021-01-01":
            stats["skipped_pre_2021"] += 1
            continue

        orgs = orgs_by_pid.get(pid, [])
        if not orgs:
            stats["skipped_empty_orgs"] += 1
            continue

        stats["projects_matched"] += 1
        year = _topic_year(topic)
        source = f"{cfg['stem']}_{year}"

        proj_title = (proj.get("title") or "").strip()
        proj_objective = (proj.get("objective") or "").strip()[:1000]
        proj_acronym = (proj.get("acronym") or "").strip()
        proj_end = (proj.get("endDate") or "").strip()
        try:
            total_cost = float((proj.get("totalCost") or "").replace(",", "."))
        except ValueError:
            total_cost = None

        for org in orgs:
            role = (org.get("role") or "").strip()
            role_lower = role.lower()

            country = (org.get("country") or "").strip().upper()
            if country == "EL":
                country = "GR"
            if country == "UK":
                country = "GB"

            try:
                grant_eur = float((org.get("ecContribution") or "").replace(",", "."))
            except ValueError:
                grant_eur = None

            org_id = (org.get("organisationID") or "").strip()
            name = (org.get("name") or "").strip()
            if not name:
                continue

            coord_only = 1 if role_lower == "coordinator" else 0
            if role_lower == "coordinator":
                stats["events_coordinator"] += 1
            elif role_lower == "participant":
                stats["events_participant"] += 1
            else:
                stats["events_other_role"] += 1

            # call_id: stable on (source, project_id, org_id) so re-runs don't dupe.
            call_id = f"{source}_{pid}_{org_id or _normalize_name(name)[:30]}"

            # For EU Missions, refine sector from the sub-mission fragment in topic.
            row_sector_raw = (
                _miss_sector(topic) if cluster == "MISS" else cfg["sector"]
            )

            rows.append({
                "source": source,
                "call_id": call_id,
                "company_name": name,
                "country": country if country in EUR_ISO else "",
                "city": (org.get("city") or "").strip(),
                "pic": org_id or "",
                "role": role_lower or "unknown",
                "coordinator_only": coord_only,
                "project_number": pid,
                "project_acronym": proj_acronym,
                "project_title": proj_title,
                "project_summary": proj_objective,
                "project_started": start,
                "project_ended": proj_end or None,
                "call_id_topic": topic,
                "grant_amount_eur": grant_eur,
                "total_project_cost_eur": total_cost,
                "sector_tags_raw": f"{topic}||{row_sector_raw}",
                "grant_amount_basis": cfg.get("basis", "horizon_eu_grant"),
                "raw_source_url": f"https://cordis.europa.eu/project/id/{pid}",
            })
            stats["events_emitted"] += 1

    print(f"  {cluster}: projects={stats['projects_matched']}, "
          f"events={stats['events_emitted']} "
          f"(coord={stats['events_coordinator']}, "
          f"part={stats['events_participant']}, "
          f"other={stats['events_other_role']})")
    print(f"    skipped: pre-2021={stats['skipped_pre_2021']}, "
          f"ju-dedup={stats['skipped_ju_dedup']}, "
          f"empty-orgs={stats['skipped_empty_orgs']}")
    return rows


def _match_company(con: sqlite3.Connection, name: str, country: str,
                   pic: str, fuzzy_index: dict | None = None) -> tuple[int | None, str]:
    """PIC-first, then 5-tier fallback (exact name+country → exact name → forward
    prefix → reverse prefix → fuzzy ≥0.92). `fuzzy_index` is an optional cache of
    {country: [(id, normalized_name)]} to avoid re-querying for every event."""
    cur = con.cursor()

    if pic:
        cur.execute("SELECT id FROM companies WHERE pic=?", (pic,))
        r = cur.fetchone()
        if r:
            return r[0], "pic"

    norm = _normalize_name(name)
    if not norm:
        return None, "none"

    cur.execute(
        "SELECT id FROM companies WHERE UPPER(canonical_name)=? AND country=?",
        (norm, country),
    )
    r = cur.fetchone()
    if r:
        return r[0], "exact"

    cur.execute("SELECT id FROM companies WHERE UPPER(canonical_name)=?", (norm,))
    r = cur.fetchone()
    if r:
        return r[0], "exact_name_only"

    if fuzzy_index is None:
        cur.execute("SELECT id, UPPER(canonical_name), country FROM companies")
        fuzzy_index = {}
        for cid, cname, cctry in cur.fetchall():
            fuzzy_index.setdefault(cctry or "", []).append((cid, cname or ""))

    candidates = fuzzy_index.get(country, [])
    for cid, cname in candidates:
        if not cname or len(cname) < 4:
            continue
        if norm.startswith(cname + " "):
            return cid, "prefix"
        if cname.startswith(norm + " "):
            return cid, "reverse_prefix"

    best = (0.0, None)
    for cid, cname in candidates:
        if not cname:
            continue
        ratio = SequenceMatcher(None, norm, cname).ratio()
        if ratio > best[0]:
            best = (ratio, cid)
    if best[0] >= 0.92 and best[1] is not None:
        return best[1], "fuzzy"

    return None, "none"


def _build_fuzzy_index(con: sqlite3.Connection) -> dict:
    cur = con.cursor()
    cur.execute("SELECT id, UPPER(canonical_name), country FROM companies")
    idx: dict[str, list[tuple[int, str]]] = {}
    for cid, cname, cctry in cur.fetchall():
        idx.setdefault(cctry or "", []).append((cid, cname or ""))
    return idx


def _load_to_db(rows: list[dict], cluster: str) -> dict:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    fuzzy_idx = _build_fuzzy_index(con)

    counts = {"pic": 0, "exact": 0, "exact_name_only": 0, "prefix": 0,
              "reverse_prefix": 0, "fuzzy": 0, "none": 0,
              "skipped_dup": 0, "inserted_events": 0, "updated_pic": 0}

    new_companies_by_pic: dict[str, int] = {}
    new_companies_by_norm: dict[tuple, int] = {}

    for r in rows:
        # Sprint 17: enforce 40-country scope — skip out-of-scope orgs (TR, IL, etc.);
        # null out empty-string countries so they don't violate the scope check.
        raw_country = r.get("country") or None
        canon_country = _canonicalise_country(raw_country or "") if raw_country else None
        if raw_country and canon_country is None:
            # Out-of-scope country (e.g. TR, IL) — skip entirely
            counts["none"] += 1
            continue
        # canon_country is either a valid ISO2 or None (no country info)
        r = dict(r, country=canon_country)

        norm = _normalize_name(r["company_name"])
        pic = r.get("pic") or ""

        # Match: PIC-first (including PICs we inserted this run).
        cid = None
        if pic and pic in new_companies_by_pic:
            cid = new_companies_by_pic[pic]
            method = "pic"
        else:
            cid, method = _match_company(con, r["company_name"], r["country"],
                                          pic, fuzzy_idx)
            if cid is None and (norm, r["country"]) in new_companies_by_norm:
                cid = new_companies_by_norm[(norm, r["country"])]
                method = "exact"

        if cid is None:
            cur.execute(
                """INSERT INTO companies (canonical_name, raw_name, country, city, pic,
                   entity_type, match_method, match_confidence)
                   VALUES (?, ?, ?, ?, ?, 'unknown', ?, ?)""",
                (norm, r["company_name"], r["country"], r.get("city") or None,
                 pic or None, f"cordis_{cluster.lower()}",
                 "high" if pic else "medium"),
            )
            cid = cur.lastrowid
            if pic:
                new_companies_by_pic[pic] = cid
            new_companies_by_norm[(norm, r["country"])] = cid
            fuzzy_idx.setdefault(r["country"], []).append((cid, norm))
            counts["none"] += 1
        else:
            counts[method] += 1
            # Backfill PIC where missing (PIC is the canonical id).
            if pic:
                cur.execute("SELECT pic FROM companies WHERE id=?", (cid,))
                cur_row = cur.fetchone()
                if cur_row and not cur_row[0]:
                    cur.execute("UPDATE companies SET pic=? WHERE id=?", (pic, cid))
                    counts["updated_pic"] += 1

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
                project_number, project_acronym, project_title, project_summary,
                project_started, project_ended,
                grant_amount_eur, total_project_cost_eur,
                sector_tags_raw, grant_amount_basis, raw_source_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (cid, r["source"], r["call_id"], r["role"], r["coordinator_only"],
             r["project_number"], r["project_acronym"], r["project_title"],
             r["project_summary"], r["project_started"], r["project_ended"],
             r["grant_amount_eur"], r["total_project_cost_eur"],
             r["sector_tags_raw"], r["grant_amount_basis"], r["raw_source_url"]),
        )
        counts["inserted_events"] += 1

    con.commit()
    con.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cluster", required=True,
                        choices=list(CLUSTERS.keys()) + ["all"])
    parser.add_argument("--load-db", action="store_true")
    parser.add_argument("--exclude-ihi", action="store_true",
                        help="Belt-and-suspenders for CL1 (JU dedup already covers it).")
    args = parser.parse_args()

    print(f"Loading CORDIS dataset from {DATA_DIR} ...")
    projects = _load_csv(DATA_DIR / "project.csv")
    orgs = _load_csv(DATA_DIR / "organization.csv")
    topics = _load_csv(DATA_DIR / "topics.csv")
    print(f"  projects: {len(projects)}, orgs: {len(orgs)}, topics: {len(topics)}")

    projects_by_id = {p["id"]: p for p in projects}
    orgs_by_pid: dict[str, list[dict]] = {}
    for o in orgs:
        orgs_by_pid.setdefault(o["projectID"], []).append(o)
    topics_by_pid: dict[str, list[str]] = {}
    for t in topics:
        topics_by_pid.setdefault(t["projectID"], []).append(t["topic"])

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    if args.cluster == "all":
        clusters = ["CL4", "CL5", "CL3", "CL1", "CL6", "MISS", "EIE", "CBE", "ERC_POC"]
    else:
        clusters = [args.cluster]

    for cluster in clusters:
        rows = discover_cluster_rows(cluster, projects_by_id, orgs_by_pid,
                                      topics_by_pid, args.exclude_ihi)
        if not rows:
            print(f"  {cluster}: no rows; skipping.")
            continue

        out_csv = PROCESSED_DIR / f"{CLUSTERS[cluster]['stem']}_events.csv"
        with open(out_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            for r in rows:
                w.writerow(r)
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
            print(f"    {src:<28} {n:>5} events  €{g/1e6:>8.1f}M")

        if args.load_db:
            counts = _load_to_db(rows, cluster)
            print(f"  Match: {counts}")

    if not args.load_db:
        print("\n(CSV only — pass --load-db to match and load into db.sqlite)")
        print("Reminder: run python3 classify.py after --load-db")


# Source-sector dicts for classify.py to import.
# Pre-populated for the Pillar II window (2021-2027) — classify.py uses these
# as the final fallback when neither tags nor keyword text fire.
HORIZON_EU_CL1_SOURCE_SECTOR: dict[str, str] = {
    f"horizon_eu_cl1_{y}": "life_sciences" for y in ["2021","2022","2023","2024","2025","2026","2027"]
}
HORIZON_EU_CL3_SOURCE_SECTOR: dict[str, str] = {
    f"horizon_eu_cl3_{y}": "defense" for y in ["2021","2022","2023","2024","2025","2026","2027"]
}
HORIZON_EU_CL4_SOURCE_SECTOR: dict[str, str] = {
    f"horizon_eu_cl4_{y}": "digital" for y in ["2021","2022","2023","2024","2025","2026","2027"]
}
HORIZON_EU_CL5_SOURCE_SECTOR: dict[str, str] = {
    f"horizon_eu_cl5_{y}": "cleantech" for y in ["2021","2022","2023","2024","2025","2026","2027"]
}
HORIZON_EU_CL6_SOURCE_SECTOR: dict[str, str] = {
    f"horizon_eu_cl6_{y}": "other" for y in ["2021","2022","2023","2024","2025","2026","2027"]
}


if __name__ == "__main__":
    main()
