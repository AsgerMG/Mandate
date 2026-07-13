"""Export the public-capital-intelligence digest the /for-companies brief reads.

Bridges the two tracks at BUILD time (per the hosting direction: local test rig
now, Railway service later): semantic retrieval over data/signals.sqlite runs
here, on the machine that has the corpus + the local embedding model, and the
brief's serverless pipeline only ever reads the exported JSON — same discipline
as every other public/data/*.json artifact.

Two retrieval surfaces per run:
  * topics    — the must-cover files (European Competitiveness Fund, Startup &
                Scaleup Strategy, IPCEI, STEP): top passages per canonical query,
                so the brief can always engage them (or say the corpus is thin).
  * sectors   — one canonical query per sector_top of the two-tier taxonomy:
                current programmes/policy/funder moves relevant to that sector.

Output: website/frontend/public/data/signals_digest.json
Run:    python3 website/build/signals_digest.py     (or `make signals-digest`)
Not registered in build_site_data's freshness check on purpose — its input is
signals.sqlite (news cadence), not db.sqlite (corpus cadence).
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, SITE_DATA  # noqa: E402

sys.path.insert(0, str(ROOT / "ETL" / "lib"))
import etl_env  # noqa: E402,F401  (sys.path side effects for the retriever)
from etl_env import SIGNALS_DB  # noqa: E402
from signals_retrieval import SignalsRetriever  # noqa: E402

OUT = SITE_DATA / "signals_digest.json"

# The A-Z topic universe — canonical query per instrument/theme of the public
# capital landscape. The digest captures ALL of these on every run; the brief
# pipeline tailors which slices a given founder sees (capture-all, tailor-late
# — never narrow at capture time). Keys double as the tailoring vocabulary in
# pipeline.ts.
TOPIC_QUERIES = {
    # Future-budget files
    "competitiveness_fund":
        "European Competitiveness Fund: budget, policy windows, timeline and what "
        "it changes for companies seeking EU funding",
    "startup_scaleup":
        "EU Startup and Scaleup Strategy, Scaleup Europe Fund and 28th regime: "
        "what changes for European startups raising public capital",
    # Scale capital — cheap, abundant financing for industrial-scale operations
    "scale_capital":
        "EIB and EIF venture debt, growth loans and scale-up financing for "
        "European tech companies moving to industrial scale",
    "investeu":
        "InvestEU guarantees, fund-of-funds and the European Tech Champions "
        "Initiative: unlocking institutional capital for scale-ups",
    "innovation_fund":
        "EU Innovation Fund and European Hydrogen Bank: large-scale grants for "
        "first-of-a-kind industrial cleantech plants",
    "industrial_policy":
        "Clean Industrial Deal, Net-Zero Industry Act and Industrial "
        "Decarbonisation Bank: EU support for building industrial capacity",
    # Grant-side pipeline
    "horizon_eic":
        "EIC Accelerator, Pathfinder and Horizon Europe calls: grant and blended "
        "finance opportunities and work-programme changes",
    "national_dev_banks":
        "national development banks and promotional institutions: new funds, "
        "mandates and financing programmes for tech companies",
    "state_aid_reform":
        "EU state aid framework changes: GBER, CISAF and national aid schemes "
        "for innovation and industry",
    # Named vehicles / labels
    "ipcei":
        "IPCEI Important Projects of Common European Interest: new waves, "
        "approvals and national funding decisions",
    "step":
        "Strategic Technologies for Europe Platform STEP: seals, funding and "
        "programme changes",
    # Independently swept channels (2026-07-09) — the lifecycle walk
    "digital_ai":
        "Digital Europe Programme, AI factories and gigafactories, InvestAI and "
        "EuroHPC: compute and digital capacity funding for AI companies",
    "chips":
        "European Chips Act and Chips Joint Undertaking: semiconductor funding, "
        "fab support and the Chips Act 2.0 debate",
    "defence":
        "European Defence Fund, EDIP, SAFE loans, ReArm Europe, NATO Innovation "
        "Fund and DIANA: defence and dual-use funding for companies",
    "space":
        "European Space Agency contracts and programmes, IRIS2 and EU space "
        "funding for space companies",
    "eit_kics":
        "EIT Knowledge and Innovation Communities as investors: InnoEnergy, EIT "
        "Manufacturing, EIT Digital and EIT Health funding and equity",
}

# Canonical query per sector_top (two-tier taxonomy, migration 010).
SECTOR_QUERIES = {
    "software_data_ai": "public funding, programmes and policy for AI, software and data companies in Europe",
    "health_life_sciences": "public funding, programmes and policy for biotech, medtech and life-science companies in Europe",
    "energy_cleantech": "public funding, programmes and policy for energy and cleantech companies in Europe",
    "industrial_manufacturing": "public funding, programmes and policy for industrial and advanced-manufacturing companies in Europe",
    "semiconductors_electronics": "public funding, programmes and policy for semiconductor, chip and electronics companies in Europe",
    "space": "public funding, programmes and policy for space and satellite companies in Europe",
    "defense_security": "public funding, programmes and policy for defence and security companies in Europe",
    "mobility_transport": "public funding, programmes and policy for mobility, transport and automotive companies in Europe",
    "agrifood": "public funding, programmes and policy for agrifood and agtech companies in Europe",
    "materials_chemicals": "public funding, programmes and policy for materials and chemicals companies in Europe",
    "other": "new public funding programmes and policy changes for European tech companies",
}

K_PER_QUERY = 8          # over-fetch, then dedupe by article
KEEP_PER_QUERY = 4
MIN_SIMILARITY = 0.30    # MiniLM cosine floor — below this the hit is noise
EXCERPT_CHARS = 480


def _items(hits: list[dict]) -> list[dict]:
    """Dedupe by article, floor by similarity, shape for the brief."""
    seen: set[int] = set()
    out = []
    for h in hits:
        if h["similarity"] < MIN_SIMILARITY or h["article_id"] in seen:
            continue
        seen.add(h["article_id"])
        out.append({
            "title": h["title"],
            "source": h["source_key"],
            "tier": h["tier"],
            "date": h["published_at"],
            "url": h["resolved_url"] or h["url"],
            "excerpt": " ".join(h["chunk_text"].split())[:EXCERPT_CHARS],
            "similarity": round(h["similarity"], 3),
        })
        if len(out) >= KEEP_PER_QUERY:
            break
    return out


def main() -> None:
    r = SignalsRetriever()

    topics = {name: _items(r.search(q, k=K_PER_QUERY)) for name, q in TOPIC_QUERIES.items()}
    sectors = {name: _items(r.search(q, k=K_PER_QUERY)) for name, q in SECTOR_QUERIES.items()}

    con = sqlite3.connect(SIGNALS_DB)
    n_articles = con.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    n_embedded = con.execute(
        "SELECT COUNT(DISTINCT article_id) FROM article_chunks").fetchone()[0]
    con.close()

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "corpus": {"articles": n_articles, "embeddedArticles": n_embedded},
        "topics": topics,
        "sectors": sectors,
    }
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False))
    n_top = sum(len(v) for v in topics.values())
    n_sec = sum(len(v) for v in sectors.values())
    print(f"signals digest → {OUT}")
    print(f"  {n_top} topic passages, {n_sec} sector passages "
          f"(from {n_embedded:,} embedded articles)")
    for name, items in topics.items():
        flag = "" if items else "   ← EMPTY (brief must say the corpus is thin here)"
        print(f"  topic {name}: {len(items)}{flag}")


if __name__ == "__main__":
    main()
