"""What each scheme is REGISTERED to pay for, derived from its GBER article.

── Why this exists ────────────────────────────────────────────────────────
A founder's candidate set is a median of 50 sibling schemes under one regime.
Every signal we hold scored ~36% on holdout at telling them apart, because the
siblings share a body, a country, a sector and -- since 453 of them inherit one
regime document -- an identical set of eligibility rules.

They do not share an OBJECTIVE. The transparency register records, per SA
number, the GBER article the scheme was notified under: "Industrial research
(Art. 25(2)(b))", "Investment aid to SMEs (Art. 17)", "Feasibility studies (Art.
25(2)(d))". Measured across sibling groups, 351 instruments carry 495 distinct
objectives -- more objectives than instruments, so the field discriminates
WITHIN a group rather than being constant across it.

And we already ask the founder the matching question. `useOfFunds` has been on
screen one all along; it was never matched against anything.

── Why this generalises, and is not a fit to our database ─────────────────
The correspondence below is keyed on the GBER ARTICLE NUMBER, and what each
article permits is EU law (Reg. 651/2014). Article 25(2)(c) is experimental
development for every scheme that has ever cited it, including schemes not in
our corpus and schemes not yet written. Nothing here names a fund, a body, a
country or a programme, so an unseen scheme citing a known article is classified
correctly on first sight -- which is the property we need and the reason this is
not the banned enumeration pattern.

An article we do not map yields NO tags rather than a guess. Silence is the
honest output: it costs a ranking signal, never a wrong one.

Usage:
  python3 ETL/terms/emit_instrument_objectives.py            # report
  python3 ETL/terms/emit_instrument_objectives.py --write
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT as REPO_ROOT  # noqa: E402

import argparse  # noqa: E402
import collections  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

OUT = REPO_ROOT / "website" / "frontend" / "lib" / "intelligence" / "__objectives.json"

# GBER (Reg. 651/2014) article -> the `useOfFunds` options it funds.
#
# Statutory, not empirical. Each entry is what the article itself authorises, so
# it holds for any scheme citing it. Sub-paragraphs matter for Art. 25, whose
# four points are four different stages of R&D and are the single most
# discriminating distinction in the register (941 schemes on 25(2)(b), 832 on
# 25(2)(c)) -- collapsing them to "Art. 25" would throw away the main signal.
ARTICLE_USE = {
    "25(2)(a)": ["industrial_research"],           # fundamental research
    "25(2)(b)": ["industrial_research"],
    "25(2)(c)": ["experimental_development"],
    "25(2)(d)": ["feasibility_study"],
    "26": ["rd_facilities"],                       # research infrastructures
    "27": ["rd_facilities"],                       # innovation clusters
    "28": ["ip_protection", "experimental_development"],   # innovation aid, SMEs
    "29": ["experimental_development"],            # process/organisational innovation
    "17": ["production_capex"],                    # investment aid to SMEs
    "14": ["production_capex"],                    # regional investment aid
    "18": ["market_launch"],                       # SME consultancy
    "19": ["market_launch"],                       # SME trade-fair participation
    "22": ["market_launch", "working_capital"],    # start-up aid
    "21": ["working_capital"],                     # risk finance
    "36": ["production_capex"],                    # environmental protection
    "38": ["production_capex"],                    # energy efficiency
    "41": ["production_capex"],                    # renewable energy
    "46": ["production_capex"],                    # district heating/cooling
    # The rest of the environmental chapter. All are investment aid toward plant
    # and equipment, so they carry the same tag as the other Art. 36-46 entries;
    # Art. 49 is the exception, being aid for the STUDY that precedes it.
    "39": ["production_capex"],                    # energy efficiency, buildings
    "40": ["production_capex"],                    # high-efficiency cogeneration
    "42": ["production_capex"],                    # renewable electricity
    "47": ["production_capex"],                    # resource efficiency, circular
    "49": ["feasibility_study"],                   # environmental studies
}

# "(Art. 25(2)(b))", "(Art. 17)", "Art. 25(2)(b) - Scheme". Captures the number
# and any bracketed sub-points that immediately follow it.
ART = re.compile(r"Art\.?\s*(\d+)((?:\(\d+\))?(?:\([a-z]\))?)", re.I)


def tags_for(text: str) -> tuple[list[str], list[str]]:
    """(useOfFunds tags, article labels) for one objectives_text."""
    uses: list[str] = []
    arts: list[str] = []
    for num, sub in ART.findall(text or ""):
        key = f"{num}{sub}" if f"{num}{sub}" in ARTICLE_USE else num
        arts.append(f"{num}{sub}" if sub else num)
        for u in ARTICLE_USE.get(key, []):
            if u not in uses:
                uses.append(u)
    return uses, arts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    c = sqlite3.connect(DB)
    rows = c.execute("""
        SELECT i.id, GROUP_CONCAT(DISTINCT s.objectives_text)
          FROM funding_instruments i
          JOIN satr_staging s ON s.sa_number = i.scheme_code
         WHERE i.is_framework = 0 AND COALESCE(s.objectives_text,'') <> ''
         GROUP BY i.id""").fetchall()

    out: dict[str, dict] = {}
    unmapped = collections.Counter()
    for iid, text in rows:
        uses, arts = tags_for(text)
        for num, sub in ART.findall(text or ""):
            if f"{num}{sub}" not in ARTICLE_USE and num not in ARTICLE_USE:
                unmapped[f"Art. {num}{sub}"] += 1
        if uses:
            out[iid] = {"useOfFunds": sorted(uses), "articles": sorted(set(arts))}

    total = c.execute(
        "SELECT COUNT(*) FROM funding_instruments WHERE is_framework=0").fetchone()[0]
    print(f"instruments with a registered objective: {len(rows)} of {total}")
    print(f"  classified to a useOfFunds tag:        {len(out)}")
    spread = collections.Counter(u for v in out.values() for u in v["useOfFunds"])
    for k, n in spread.most_common():
        print(f"    {k:26} {n}")
    if unmapped:
        print("\n  articles seen but not mapped (no tags emitted, by design):")
        for k, n in unmapped.most_common(8):
            print(f"    {k:14} {n}")

    if not args.write:
        print("\n[report only] --write to persist")
        return
    OUT.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    print(f"\nwrote {OUT.relative_to(REPO_ROOT)}  ({len(out)} instruments)")


if __name__ == "__main__":
    main()
