"""Build the static company-lookup shards the /companies page reads.

The site is a static export, so search runs fully client-side against
pre-built JSON shards:

  website/frontend/public/data/companies/manifest.json     {"shards": N, "companies": M, "generatedAt": ...}
  website/frontend/public/data/companies/{xx}.json         one shard per 2-character token prefix

Sharding is by NAME TOKEN, not by first letter: a company is written into the
shard of every distinct 2-char prefix of its name tokens ("Robert Bosch GmbH"
lands in ro/, bo/ and gm/), so typing "bosch" finds it. Records are duplicated
across shards; gzip absorbs most of the cost and each shard stays small enough
to fetch on keystroke.

Record shape (kept terse, the client maps it):
  n  canonical name          c  ISO2 country       s  sector_inferred
  q  normalized name (for client-side matching)
  ev [[year, family, title, amount, basis], ...]  newest first, capped at 100
  xe extra event count beyond the cap
  st [[holderLabel, pctOrNull, ticketOrNull, asOf, exited], ...]  equity stakes

Companies enter the file if they have at least one funding event or stake.
"""
from __future__ import annotations

import json
import re
import shutil
import sqlite3
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import DB, SITE_DATA  # noqa: E402

OUT_DIR = SITE_DATA / "companies"

EVENT_CAP = 100

# Single-character semantics flag so the client can label non-grant amounts
# without shipping the full basis string: c = ceiling (EDF), t = total public
# (Chips JU), a = Commission-approved aid (IPCEI), g = granted aid recovered
# from registers, d = debt commitment, "" = actual grant / aid element.
BASIS_FLAG = {
    "edf_eu_ceiling": "c",
    "chips_ju_total_public": "t",
    "ipcei_state_aid": "a",
    "ipcei_satr_granted": "g",
    "eib_debt_commitment": "d",
    "ndb_loan_commitment": "d",
}

HOLDER_LABELS = {
    "uk_future_fund": "Future Fund (BBB)", "pfr_ventures": "PFR Ventures",
    "htgf": "High-Tech Gründerfonds", "almi_invest": "Almi Invest",
    "portugal_ventures": "Portugal Ventures", "eic_fund": "EIC Fund",
    "tesi": "Tesi", "eifo": "EIFO", "investinor": "Investinor",
    "bayern_kapital": "Bayern Kapital", "ibb_ventures": "IBB Ventures",
    "cdp_vc": "CDP Venture Capital", "aws_gruendungsfonds": "aws Gründungsfonds",
    "nysno": "Nysnø", "coparion": "Coparion", "hiventures": "Hiventures",
    "eit_innoenergy": "EIT InnoEnergy", "altum": "ALTUM",
    "eit_urban_mobility": "EIT Urban Mobility", "eit_manufacturing": "EIT Manufacturing",
    "isif": "ISIF", "smartcap": "SmartCap", "bpifrance": "Bpifrance",
    "invest_nl": "Invest-NL",
}


# Legal-form suffixes and connective words: never worth a shard of their own
# ("gmbh" alone would put 17k companies in one file), though they still count
# for client-side matching via the stored normalized name.
STOP_TOKENS = {
    "gmbh", "mbh", "ggmbh", "ag", "kg", "kgaa", "ug", "gbr", "ohg", "ev",
    "gesellschaft", "aktiengesellschaft", "beschrankter", "haftung", "mit",
    "sa", "sas", "sasu", "sarl", "sca", "snc", "sl", "slu", "sll", "sau",
    "srl", "srls", "spa", "scpa", "sro", "sp", "z", "o", "oo", "spolka",
    "ltd", "limited", "plc", "llc", "llp", "inc", "corp", "co", "company",
    "bv", "nv", "vof", "cv", "oy", "oyj", "ab", "as", "aps", "asa", "hf",
    "se", "sia", "uab", "doo", "dd", "zrt", "kft", "nyrt", "sarl",
    "the", "and", "of", "for", "de", "di", "du", "des", "der", "und", "la",
    "le", "el", "los", "las", "van", "von", "den", "et", "ve", "in",
    "group", "holding", "holdings", "international",
}


def normalize(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


def token_prefixes(norm: str) -> set[str]:
    out = set()
    for tok in norm.split():
        if len(tok) >= 2 and tok not in STOP_TOKENS:
            out.add(tok[:2])
        if len(out) >= 3:  # first three distinctive tokens carry the search
            break
    return out


def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    events = defaultdict(list)
    for r in con.execute("""
        SELECT v.company_id, v.event_year, v.source_family, v.project_title,
               v.project_acronym, v.grant_amount_eur, v.debt_amount_eur,
               v.grant_amount_basis
        FROM v_events v
        ORDER BY v.event_year DESC
    """):
        amount = r["grant_amount_eur"]
        if amount is None and r["debt_amount_eur"]:
            amount = r["debt_amount_eur"]
        title = (r["project_title"] or r["project_acronym"] or "")[:120]
        events[r["company_id"]].append([
            int(r["event_year"]) if r["event_year"] else None,
            r["source_family"],
            title,
            round(amount) if amount is not None else None,
            BASIS_FLAG.get(r["grant_amount_basis"] or "", ""),
        ])

    stakes = defaultdict(list)
    for r in con.execute("""
        SELECT company_id, holder, stake_pct_max, ticket_eur, as_of, exited
        FROM public_equity_stakes ORDER BY as_of DESC
    """):
        stakes[r["company_id"]].append([
            HOLDER_LABELS.get(r["holder"], r["holder"]),
            r["stake_pct_max"], r["ticket_eur"], r["as_of"], r["exited"],
        ])

    # Derived certifications. Seal of Excellence is never published as a list,
    # but national schemes that exclusively fund SoE holders reveal it: any
    # company paid under those schemes holds the EIC/Horizon seal (decision
    # D-19). IPCEI participation is itself a label with legal consequences.
    soe_ids = {r[0] for r in con.execute("""
        SELECT DISTINCT company_id FROM public_funding_events
        WHERE UPPER(project_title) LIKE '%SEAL OF EXCELLENCE%'
           OR UPPER(project_title) LIKE '%SELLO DE EXCELENCIA%'
           OR UPPER(project_title) LIKE '%SELLO EXCELENCIA%'
           OR UPPER(project_title) LIKE '%ZNAMKA EXCELENTNOSTI%'
           OR UPPER(project_title) LIKE '%ZNÁMKA EXCELENTNOSTI%'
    """)}
    ipcei_ids = {r[0] for r in con.execute(
        "SELECT DISTINCT company_id FROM public_funding_events WHERE source LIKE 'ipcei_%'")}

    shards: dict[str, list] = defaultdict(list)
    # Facet-browse index: lets a founder discover companies by country and/or
    # sector with no name typed ("who got cleantech money in ES?"). Each record
    # carries its sector, so the client filters sector within a loaded country
    # shard. Ranked by total funding so the head of each facet is the signal.
    # Roll up to parent: one lookup record per parent_group (so "Vyoma GmbH" and
    # "Vyoma GmH" appear once, with their events combined). Index the record under
    # EVERY member name's prefixes so searching any spelling finds the merged entry.
    meta: dict[int, sqlite3.Row] = {}
    members: dict[str, list[int]] = defaultdict(list)
    for r in con.execute(
            "SELECT id, canonical_name, country, sector_top, subsector, "
            "step_flagged, parent_group FROM companies"):
        meta[r["id"]] = r
        members[r["parent_group"] or f"id{r['id']}"].append(r["id"])

    def mfund(cid):
        return sum((e[3] or 0) for e in events.get(cid, []))

    ranked: list[tuple[float, int, dict]] = []  # (funding_total, n_events, rec)
    n_companies = 0
    for gk, ids in members.items():
        ev_all, st_all = [], []
        for cid in ids:
            ev_all += events.get(cid, [])
            st_all += stakes.get(cid, [])
        if not ev_all and not st_all:
            continue
        n_companies += 1
        ev_all.sort(key=lambda e: (e[0] is not None, e[0] or 0), reverse=True)
        rep = meta[max(ids, key=mfund)]              # display = richest member
        norms = sorted({normalize(meta[c]["canonical_name"]) for c in ids})
        rec = {
            "n": rep["canonical_name"],
            "q": " ".join(norms),                    # search matches ANY variant
            "c": rep["country"] or "",
            "s": rep["sector_top"] or "",          # broad Tier-1 (two-tier taxonomy)
            "ss": rep["subsector"] or "",          # granular Tier-2
            "ev": ev_all[:EVENT_CAP],
            "xe": max(0, len(ev_all) - EVENT_CAP),
            "st": st_all,
        }
        if any(meta[c]["step_flagged"] for c in ids):
            rec["p"] = 1
        if any(c in soe_ids for c in ids):
            rec["x"] = 1
        if any(c in ipcei_ids for c in ids):
            rec["i"] = 1
        seen_p: set[str] = set()
        for nm in norms:
            for p in token_prefixes(nm):
                if p not in seen_p:
                    shards[p].append(rec)
                    seen_p.add(p)
        funding_total = sum(e[3] or 0 for e in ev_all)
        ranked.append((funding_total, len(ev_all), rec))
    con.close()

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)
    for prefix, recs in shards.items():
        (OUT_DIR / f"{prefix}.json").write_text(
            json.dumps(recs, ensure_ascii=False, separators=(",", ":")))

    # ── Facet shards ────────────────────────────────────────────────────────
    FACET_CAP = 200          # top companies kept per country / per sector
    FACET_ALL_CAP = 300      # top companies overall (no facet selected)
    facet_dir = OUT_DIR / "facets"
    facet_dir.mkdir()
    ranked.sort(key=lambda t: (t[0], t[1]), reverse=True)  # funding desc, then events

    by_country: dict[str, list[dict]] = defaultdict(list)
    by_sector: dict[str, list[dict]] = defaultdict(list)
    overall: list[dict] = []
    for _total, _n, rec in ranked:
        if len(overall) < FACET_ALL_CAP:
            overall.append(rec)
        cc = rec["c"]
        if cc and len(by_country[cc]) < FACET_CAP:
            by_country[cc].append(rec)
        sec = rec["s"]
        if sec and len(by_sector[sec]) < FACET_CAP:
            by_sector[sec].append(rec)

    for cc, recs in by_country.items():
        (facet_dir / f"{cc}.json").write_text(
            json.dumps(recs, ensure_ascii=False, separators=(",", ":")))
    for sec, recs in by_sector.items():
        (facet_dir / f"_sector_{sec}.json").write_text(
            json.dumps(recs, ensure_ascii=False, separators=(",", ":")))
    (facet_dir / "_all.json").write_text(
        json.dumps(overall, ensure_ascii=False, separators=(",", ":")))

    # Country counts so the client only offers facets that have data.
    country_counts = sorted(
        ({"code": cc, "count": len(recs)} for cc, recs in by_country.items()),
        key=lambda d: d["code"])
    sector_codes = sorted(by_sector.keys())

    (OUT_DIR / "manifest.json").write_text(json.dumps({
        "shards": len(shards), "companies": n_companies,
        "generatedAt": date.today().isoformat(),
        "facetCountries": country_counts,
        "facetSectors": sector_codes,
        "facetCap": FACET_CAP,
    }))
    total_mb = sum(f.stat().st_size for f in OUT_DIR.rglob("*.json")) / 1e6
    biggest = max(shards.items(), key=lambda kv: len(kv[1]))
    print(f"wrote {len(shards)} name shards + {len(by_country)} country + "
          f"{len(by_sector)} sector facet shards, {n_companies} companies, "
          f"{total_mb:.1f} MB total; largest name shard '{biggest[0]}' "
          f"with {len(biggest[1])} records")


if __name__ == "__main__":
    main()
