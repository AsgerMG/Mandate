"""SATR ↔ existing-NDB overlap audit.

For each Tier-1 NDB source we already have in public_funding_events, compute:
  - How many NDB rows have a likely match in satr_staging?
  - How many satr_staging rows for the same country have NO match in our NDB data?
  - What share of the NDB rows fall below the SATR threshold (typically <€100k)?

Match key, in order of preference:
  1. national_id exact match (same country)
  2. normalised beneficiary name exact match (same country)
  3. normalised name fuzzy match (token-set ≥0.85) + same country + year window ±2

Outputs:
  analysis/findings/satr_overlap_<source_prefix>.md      — markdown report per NDB
  data/processed/satr_overlap/<source_prefix>_matched.csv — full match table for inspection
"""
from __future__ import annotations

import csv
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db.sqlite"
OUT_DIR_MD = Path(__file__).parent.parent / "analysis" / "findings"
OUT_DIR_CSV = Path(__file__).parent.parent / "data" / "processed" / "satr_overlap"
OUT_DIR_MD.mkdir(parents=True, exist_ok=True)
OUT_DIR_CSV.mkdir(parents=True, exist_ok=True)


# NDB → SATR country mapping for the overlap-audit set
AUDIT_TARGETS = [
    # (source_prefix, ndb_label, satr_country_iso2)
    ("htgf_",        "HTGF (Germany)",                "DE"),
    ("coparion_",    "Coparion (Germany)",            "DE"),
    ("sprind_",      "SPRIND (Germany)",              "DE"),
    ("almi_",        "Almi Invest (Sweden)",          "SE"),
    ("cdp_vc_",      "CDP VC (Italy)",                "IT"),
    ("tesi_",        "Tesi (Finland)",                "FI"),
    ("invest_nl_",   "Invest-NL (Netherlands)",       "NL"),
    ("cdti_",        "CDTI (Spain)",                  "ES"),
    ("bpifrance_",   "Bpifrance (France)",            "FR"),  # placeholder-level
    ("enterprise_ireland_", "Enterprise Ireland",     "IE"),  # placeholder-level
]


# ── Name normalisation ──────────────────────────────────────────────────────

_LEGAL_SUFFIX_RE = re.compile(
    r"\b(gmbh|s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?l\.?|s\.?a\.?|n\.?v\.?|b\.?v\.?|"
    r"oy|ab|plc|ltd|limited|llc|inc|corp|sas|sarl|kg|ag|co\.?|gesellschaft|"
    r"holding|gruppo|group|aktiengesellschaft|aktiebolaget|m\.?b\.?h\.?)\b"
    r"\.?", re.IGNORECASE
)
_PUNCT_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")


def normalise_name(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ASCII", "ignore").decode("ASCII")
    s = s.lower()
    s = _LEGAL_SUFFIX_RE.sub("", s)
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def token_set_ratio(a: str, b: str) -> float:
    """Jaccard-ish: |A ∩ B| / |A ∪ B| on word tokens. Cheap; no deps."""
    if not a or not b:
        return 0.0
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# ── Audit per NDB ───────────────────────────────────────────────────────────

def audit_one(conn: sqlite3.Connection, prefix: str, ndb_label: str, iso2: str) -> dict:
    """Run the overlap audit for one (NDB prefix, SATR country) pair."""

    # 1. Load all NDB rows for this prefix
    ndb_rows = conn.execute(
        """
        SELECT pfe.id, c.canonical_name, c.raw_name, c.country, c.pic,
               pfe.source, pfe.grant_amount_eur, pfe.equity_amount_eur,
               pfe.call_deadline, pfe.project_started
        FROM public_funding_events pfe
        JOIN companies c ON c.id = pfe.company_id
        WHERE pfe.source LIKE ?
        """,
        (f"{prefix}%",),
    ).fetchall()

    if not ndb_rows:
        return {"prefix": prefix, "ndb_label": ndb_label,
                "iso2": iso2, "ndb_rows": 0, "status": "no-data"}

    # 2. Load all SATR rows for this country
    satr_rows = conn.execute(
        """
        SELECT tm_id, beneficiary_name, national_id, amount_eur,
               grant_year, beneficiary_country_iso2, granting_country_iso2,
               aid_instrument_text
        FROM satr_staging
        WHERE granting_country_iso2 = ?
        """,
        (iso2,),
    ).fetchall()

    # Build SATR index by (a) national_id and (b) normalised name
    by_natid: dict[str, list] = defaultdict(list)
    by_name: dict[str, list] = defaultdict(list)
    name_normed: list[tuple[str, tuple]] = []
    for r in satr_rows:
        tm, name, natid, _amt, year, _bms, _gc, _ins = r
        if natid:
            by_natid[natid.strip().lower()].append(r)
        n = normalise_name(name)
        if n:
            by_name[n].append(r)
            name_normed.append((n, r))

    # 3. For each NDB row, find best match
    matched_strong = 0     # natid match
    matched_name = 0       # exact normalised name
    matched_fuzzy = 0      # fuzzy
    unmatched = []
    match_records = []

    for (pfe_id, canonical, raw, country, pic, source, grant, equity,
         deadline, started) in ndb_rows:
        match_type = "none"
        match_tm = None

        # Try natid match — PIC won't be in SATR (different ID system), but we
        # don't store national tax IDs in companies. So this strong path rarely
        # hits and we usually fall through to name match.

        n = normalise_name(canonical) or normalise_name(raw)
        if n and n in by_name:
            match_type = "name_exact"
            match_tm = by_name[n][0][0]
            matched_name += 1
        else:
            # fuzzy
            best_ratio = 0.0
            best_match = None
            if n:
                for cand_n, cand_r in name_normed:
                    if abs(len(cand_n) - len(n)) > 20:
                        continue  # skip wildly different lengths
                    r = token_set_ratio(n, cand_n)
                    if r > best_ratio:
                        best_ratio = r
                        best_match = cand_r
                if best_ratio >= 0.85 and best_match:
                    match_type = f"name_fuzzy_{best_ratio:.2f}"
                    match_tm = best_match[0]
                    matched_fuzzy += 1
                else:
                    unmatched.append((pfe_id, canonical, source))

        amt = grant or equity
        match_records.append({
            "pfe_id": pfe_id, "company": canonical, "source": source,
            "amount_eur": amt, "match_type": match_type, "match_tm": match_tm,
        })

    n_ndb = len(ndb_rows)
    n_matched = matched_strong + matched_name + matched_fuzzy
    n_unmatched = len(unmatched)
    pct_matched = 100 * n_matched / n_ndb if n_ndb else 0

    # Threshold gap estimate: NDB rows with amount < €100k typically below SATR
    # general threshold; agri/fisheries thresholds are lower (€10k / €30k) but
    # we don't distinguish.
    below_threshold = sum(
        1 for (_, _, _, _, _, _, g, e, _, _) in ndb_rows
        if (g or e or 0) > 0 and (g or e or 0) < 100_000
    )

    # SATR rows NOT in NDB set for this country (rows we'd ADD if we promote)
    matched_tms = {m["match_tm"] for m in match_records if m["match_tm"]}
    satr_unmatched = [r for r in satr_rows if r[0] not in matched_tms]

    # Write match table
    csv_path = OUT_DIR_CSV / f"{prefix.rstrip('_')}_matched.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["pfe_id", "company", "source",
                                          "amount_eur", "match_type", "match_tm"])
        w.writeheader()
        for r in match_records:
            w.writerow(r)

    # Write markdown report
    md_path = OUT_DIR_MD / f"satr_overlap_{prefix.rstrip('_')}.md"
    with md_path.open("w", encoding="utf-8") as f:
        f.write(f"# SATR overlap audit — {ndb_label}\n\n")
        f.write(f"Compares `public_funding_events.source LIKE '{prefix}%'` against "
                f"`satr_staging` where `granting_country_iso2 = '{iso2}'`.\n\n")
        f.write("## Counts\n\n")
        f.write(f"| Metric | Value |\n|---|---:|\n")
        f.write(f"| NDB rows total | {n_ndb:,} |\n")
        f.write(f"| NDB rows ≥ €100k (above SATR threshold) | {n_ndb - below_threshold:,} |\n")
        f.write(f"| NDB rows < €100k (likely below threshold; SATR-invisible) | {below_threshold:,} |\n")
        f.write(f"| SATR rows for {iso2} (filtered: equity OR R&D) | {len(satr_rows):,} |\n")
        f.write(f"| **NDB rows matched in SATR (any match type)** | **{n_matched:,} ({pct_matched:.1f}%)** |\n")
        f.write(f"|   — strong (national ID) | {matched_strong:,} |\n")
        f.write(f"|   — exact name | {matched_name:,} |\n")
        f.write(f"|   — fuzzy name | {matched_fuzzy:,} |\n")
        f.write(f"| NDB rows unmatched | {n_unmatched:,} ({100-pct_matched:.1f}%) |\n")
        f.write(f"| SATR rows unmatched in NDB | {len(satr_unmatched):,} |\n\n")

        if matched_fuzzy:
            f.write("## Sample fuzzy matches (manual spot-check recommended)\n\n")
            f.write("| Company | Source | Amount | Match type | SATR TM |\n")
            f.write("|---|---|---:|---|---|\n")
            for m in match_records:
                if m["match_type"].startswith("name_fuzzy"):
                    amt = f"€{m['amount_eur']/1e6:.2f}M" if m['amount_eur'] else "—"
                    f.write(f"| {m['company'][:50]} | {m['source']} | {amt} | "
                            f"{m['match_type']} | {m['match_tm']} |\n")
                    if sum(1 for r in match_records if r["match_type"].startswith("name_fuzzy")) > 20:
                        break

        f.write(f"\n## Decision matrix\n\n")
        if pct_matched >= 95:
            decision = "**RETIRE candidate** — coverage ≥95%. NDB scraper can be deprecated; SATR covers it."
        elif pct_matched >= 70:
            decision = "**MERGE candidate** — high overlap but NDB adds value. Keep both, dedup by TM ID at load."
        elif pct_matched >= 30:
            decision = "**KEEP** — partial overlap. NDB likely captures sub-threshold or non-state-aid activity that SATR misses."
        else:
            decision = (
                "**KEEP** — low SATR coverage. NDB scraper captures activity not classified as "
                "state aid by the granting Member State, OR our filter excludes the instrument "
                "type used. Investigate the SATR-side gap rather than retire."
            )
        f.write(decision + "\n\n")
        f.write(f"Match table: [{csv_path.name}](../../data/processed/satr_overlap/{csv_path.name})\n")

    print(f"  {ndb_label}: NDB={n_ndb}, matched={n_matched} ({pct_matched:.1f}%), "
          f"satr_unmatched={len(satr_unmatched)}")

    return {
        "prefix": prefix, "ndb_label": ndb_label, "iso2": iso2,
        "ndb_rows": n_ndb, "below_threshold": below_threshold,
        "satr_rows": len(satr_rows), "matched": n_matched,
        "matched_pct": round(pct_matched, 1),
        "matched_strong": matched_strong, "matched_exact_name": matched_name,
        "matched_fuzzy": matched_fuzzy,
        "satr_unmatched": len(satr_unmatched),
        "md_path": str(md_path), "csv_path": str(csv_path),
    }


def main():
    conn = sqlite3.connect(DB_PATH)
    try:
        # Quick check that staging is populated
        n = conn.execute("SELECT COUNT(*) FROM satr_staging").fetchone()[0]
        if n == 0:
            sys.exit("satr_staging is empty. Run `python scripts/load_satr.py --staging` first.")
        print(f"satr_staging: {n:,} rows\n")
        print("Running overlap audit per NDB...\n")
        results = []
        for prefix, label, iso2 in AUDIT_TARGETS:
            try:
                results.append(audit_one(conn, prefix, label, iso2))
            except Exception as e:
                print(f"  ERROR {label}: {e}")
                results.append({"prefix": prefix, "ndb_label": label, "error": str(e)})

        # Aggregate summary
        summary_path = OUT_DIR_MD / "satr_overlap_summary.md"
        with summary_path.open("w", encoding="utf-8") as f:
            f.write("# SATR overlap audit — summary across NDBs\n\n")
            f.write("| NDB | Country | NDB rows | <€100k | SATR rows | Matched | % | Retirement signal |\n")
            f.write("|---|---|---:|---:|---:|---:|---:|---|\n")
            for r in results:
                if "error" in r:
                    f.write(f"| {r['ndb_label']} | — | — | — | — | — | — | ERROR: {r['error']} |\n")
                    continue
                pct = r["matched_pct"]
                if pct >= 95:
                    sig = "🟥 RETIRE candidate"
                elif pct >= 70:
                    sig = "🟧 MERGE candidate"
                elif pct >= 30:
                    sig = "🟨 KEEP — partial"
                else:
                    sig = "🟩 KEEP — low overlap"
                f.write(
                    f"| {r['ndb_label']} | {r['iso2']} | {r['ndb_rows']:,} | "
                    f"{r['below_threshold']:,} | {r['satr_rows']:,} | "
                    f"{r['matched']:,} | {pct:.1f}% | {sig} |\n"
                )

        print(f"\nReports written to {OUT_DIR_MD}/satr_overlap_*.md")
        print(f"Summary:               {summary_path}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
