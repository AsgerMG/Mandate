"""B1 — Cross-source duplicate sweep.

Two modes:
  python3 audit_dedup.py             -> write data/processed/dedup_candidates.csv
  python3 audit_dedup.py --load-db   -> also apply `merge`-recommended pairs

Triage rules:
  - MERGE: same normalized name + same country, OR EL<->GR alias pair
           (Eurostat uses EL for Greece, ISO uses GR; same entity).
  - KEEP_SEPARATE: different countries (subsidiary / sister entity pattern,
           per Sprint 4 NOMAGIC convention). For known-distinctive entity names
           that span multiple non-IPCEI sources, flag NEEDS_HUMAN_REVIEW.
  - Merge direction: lower id wins; events repoint; non-NULL fields
           copied from the dropped row; dropped row deleted.
"""

from __future__ import annotations

import argparse
import csv
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "db.sqlite"
OUT_CSV = ROOT / "data" / "processed" / "dedup_candidates.csv"

# Mirror of extract_chips_ju.normalize_name (shared canonical form).
_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|"
    r"BV|NV|"
    r"SAS|SARL|SASU|SCA|"
    r"SRL|S\.r\.l\.|SpA|S\.p\.A\.|Srls|SCPA|"
    r"SRO|s\.r\.o\.|"
    r"SL|SLU|SLL|SLNE|SAU|"
    r"Ltd|Limited|PLC|LLC|LLP|Inc|Corp|"
    r"AB|ApS|AS|"
    r"Oy|Oyj|hf|ehf|"
    r"DOO|d\.o\.o\.|DD|UAB|OOO|"
    r"Lda|CRL|Scrl|"
    r"EE|IKE|"
    r"Zrt|Kft|Nyrt|"
    r"SE|SA)\b",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_PAREN_RE = re.compile(r"\([^)]*\)")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    if not s:
        return ""
    s = _NORM_PAREN_RE.sub(" ", s)
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


# Eurostat <-> ISO Greek code alias.
GREEK_CODES = {"EL", "GR"}

# Pairs we want a human to inspect post-hoc. Distinctive corporate names that
# appear in non-IPCEI sources across different countries, where the
# subsidiary-vs-duplicate distinction is non-obvious from the row alone.
HUMAN_REVIEW_NAMES = {"bormioli luigi", "holcim"}


def family_of(source: str) -> str:
    if source.startswith("eic_"):
        return "eic"
    if source.startswith("ipcei_"):
        return "ipcei"
    if source.startswith("edf_"):
        return "edf"
    if source.startswith("innovation_fund"):
        return "innovation_fund"
    if source.startswith("eib_") or source == "eib":
        return "eib"
    if source.startswith("eit_"):
        return "eit"
    if source.startswith("chips") or source.startswith("kdt"):
        return "chips_ju"
    return source


def classify_pair(a: dict, b: dict) -> str:
    ca = (a["country"] or "").upper()
    cb = (b["country"] or "").upper()
    norm = a["norm"]
    if ca == cb and ca:
        return "merge"
    if {ca, cb} == GREEK_CODES:
        return "merge"
    if norm in HUMAN_REVIEW_NAMES:
        return "needs_human_review"
    return "keep_separate"


def load_candidates(con: sqlite3.Connection) -> list[dict]:
    rows = con.execute(
        "SELECT id, canonical_name, country, entity_type FROM companies"
    ).fetchall()
    buckets: dict[str, list[dict]] = defaultdict(list)
    for cid, name, country, et in rows:
        norm = normalize_name(name)
        if not norm:
            continue
        n_events = con.execute(
            "SELECT COUNT(*) FROM public_funding_events WHERE company_id=?", (cid,)
        ).fetchone()[0]
        srcs_raw = con.execute(
            "SELECT GROUP_CONCAT(DISTINCT source) FROM public_funding_events WHERE company_id=?",
            (cid,),
        ).fetchone()[0] or ""
        families = sorted({family_of(s) for s in srcs_raw.split(",") if s})
        buckets[norm].append(
            {
                "id": cid,
                "name": name,
                "country": country,
                "entity_type": et,
                "norm": norm,
                "n_events": n_events,
                "source_families": ",".join(families),
            }
        )
    pairs: list[dict] = []
    for norm, members in sorted(buckets.items()):
        if len(members) < 2:
            continue
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                a, b = members[i], members[j]
                pairs.append(
                    {
                        "id_a": a["id"],
                        "id_b": b["id"],
                        "name_a": a["name"],
                        "country_a": a["country"],
                        "name_b": b["name"],
                        "country_b": b["country"],
                        "n_events_a": a["n_events"],
                        "n_events_b": b["n_events"],
                        "source_families_a": a["source_families"],
                        "source_families_b": b["source_families"],
                        "recommendation": classify_pair(a, b),
                    }
                )
    return pairs


def write_csv(pairs: list[dict]) -> None:
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "id_a", "id_b", "name_a", "country_a", "name_b", "country_b",
        "n_events_a", "n_events_b", "source_families_a", "source_families_b",
        "recommendation",
    ]
    with OUT_CSV.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(pairs)


def apply_merges(con: sqlite3.Connection, pairs: list[dict]) -> int:
    """Apply 'merge' pairs. Lower id wins; events repoint; non-NULL fields
    copied from dropped row when target field is NULL/empty; dropped row deleted.
    """
    cur = con.cursor()
    merged = 0
    # Process in order of lower id to handle transitive merges safely.
    merge_pairs = [p for p in pairs if p["recommendation"] == "merge"]
    merge_pairs.sort(key=lambda p: min(p["id_a"], p["id_b"]))
    for p in merge_pairs:
        keep_id = min(p["id_a"], p["id_b"])
        drop_id = max(p["id_a"], p["id_b"])
        # Sanity: rows still exist (could've been merged transitively)
        ka = cur.execute("SELECT * FROM companies WHERE id=?", (keep_id,)).fetchone()
        da = cur.execute("SELECT * FROM companies WHERE id=?", (drop_id,)).fetchone()
        if not ka or not da:
            continue
        cols = [c[0] for c in cur.description]
        keep_row = dict(zip(cols, ka))
        drop_row = dict(zip(cols, da))
        # Copy non-NULL/non-empty fields from drop -> keep where keep is NULL/empty.
        updates = {}
        for col in cols:
            if col in ("id", "created_at"):
                continue
            kv, dv = keep_row.get(col), drop_row.get(col)
            if (kv is None or kv == "") and (dv is not None and dv != ""):
                updates[col] = dv
        # Repoint events FIRST so we can drop the duplicate row before copying
        # over any UNIQUE-constrained columns (e.g. pic).
        cur.execute(
            "UPDATE public_funding_events SET company_id=? WHERE company_id=?",
            (keep_id, drop_id),
        )
        cur.execute("DELETE FROM companies WHERE id=?", (drop_id,))
        if updates:
            assignments = ", ".join(f"{c}=?" for c in updates)
            cur.execute(
                f"UPDATE companies SET {assignments} WHERE id=?",
                (*updates.values(), keep_id),
            )
        merged += 1
    con.commit()
    return merged


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--load-db", action="store_true", help="apply merge-recommended pairs")
    args = ap.parse_args()

    con = sqlite3.connect(DB)
    try:
        pairs = load_candidates(con)
        write_csv(pairs)
        counts: dict[str, int] = defaultdict(int)
        for p in pairs:
            counts[p["recommendation"]] += 1
        print(f"candidate pairs: {len(pairs)}")
        print(f"  merge:              {counts['merge']}")
        print(f"  keep_separate:      {counts['keep_separate']}")
        print(f"  needs_human_review: {counts['needs_human_review']}")
        print(f"csv: {OUT_CSV}")
        if args.load_db:
            n = apply_merges(con, pairs)
            print(f"merges applied: {n}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
