"""Export the public-capital-intelligence digest the /for-companies brief reads.

Bridges the two tracks at BUILD time: semantic retrieval over the signals_*
tables of schema `capital` runs here, on a machine that has the local embedding
model, and the brief's serverless pipeline only ever reads the exported JSON --
same discipline as every other public/data/*.json artifact.

Two retrieval surfaces per run:
  * topics    — the must-cover files (European Competitiveness Fund, Startup &
                Scaleup Strategy, IPCEI, STEP): top passages per canonical query,
                so the brief can always engage them (or say the corpus is thin).
  * sectors   — one canonical query per sector_top of the two-tier taxonomy:
                current programmes/policy/funder moves relevant to that sector.

Output: web/public/data/signals_digest.json
Run:    python3 website/build/signals_digest.py     (or `make signals-digest`)
Not registered in build_site_data's freshness check on purpose -- its input is
the signals_* tables (news cadence), not the events corpus (corpus cadence).

ORDERING. Postgres sorts NULL first under DESC and compares text under the
database's en_US collation; SQLite, where this ran until 2026-11-05, sorted NULL
last and compared bytes. Every ORDER BY here says NULLS LAST and COLLATE "C" so
the digest is the same document it was. Ties on date break on (signal type,
signal id, entity id): the order SQLite's plan produced (the signal-type index,
then rowid), now stated rather than inherited.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, SITE_DATA  # noqa: E402

sys.path.insert(0, str(ROOT / "ETL" / "lib"))
import etl_env  # noqa: E402,F401  (sys.path side effects for the retriever)
from store import connect  # noqa: E402
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

# Section 3 of the /for-companies brief (positioning) needs to namedrop who is
# actually shaping the agenda right now. No embedding search here — this is a
# plain recency join, not a similarity search: stakeholder_appointment and
# programme_policy_change signals whose article also names a person.
PEOPLE_SQL = """
    SELECT a.id AS article_id, a.title, a.published_at, a.resolved_url, a.url,
           s.key AS source_key, s.tier, sig.signal_type, sig.summary,
           e.mention_text AS person
    FROM signals_articles a
    JOIN signals_article_signals sig ON sig.article_id = a.id
    JOIN signals_article_entities e ON e.article_id = a.id AND e.entity_type = 'person'
    JOIN signals_sources s ON s.id = a.source_id
    WHERE sig.signal_type IN ('stakeholder_appointment', 'programme_policy_change')
    ORDER BY a.published_at COLLATE "C" DESC NULLS LAST,
             sig.signal_type COLLATE "C", sig.id, e.id
    LIMIT 40
"""
PEOPLE_KEEP = 25


def _people(con) -> list[dict]:
    """Recency-ordered, deduped by article (an article can name >1 person;
    keep the first mention only, so the digest stays one line per article)."""
    seen: set[int] = set()
    out = []
    for r in con.execute(PEOPLE_SQL):
        if r["article_id"] in seen:
            continue
        seen.add(r["article_id"])
        out.append({
            "title": r["title"],
            "source": r["source_key"],
            "tier": r["tier"],
            "date": r["published_at"],
            "url": r["resolved_url"] or r["url"],
            "person": r["person"],
            "signalType": r["signal_type"],
            "excerpt": " ".join((r["summary"] or "").split())[:EXCERPT_CHARS],
        })
        if len(out) >= PEOPLE_KEEP:
            break
    return out


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


# How many signals per fund reach the brief. Three is enough to say "this fund
# is moving and here is how"; more and the writer has to prioritise inside a
# block it did not choose, which is what the topic slices are for.
SIGNALS_PER_INSTRUMENT = 3

# Types that say something about a FUND's direction. stakeholder_appointment
# averages 0.55 confidence and is about people, not money; partnership_
# collaboration is usually about two funders, not about a founder's access.
DIRECTIONAL_TYPES = (
    "programme_policy_change", "funding_pipeline_signal", "regulatory_development")


def _instrument_signals(con) -> dict[str, list[dict]]:
    """Signals attached to a SPECIFIC fund, via article_instrument_links.

    The topic and sector slices above answer "what is moving in this part of the
    landscape". This answers "what is moving about the fund on your table",
    which the digest could not say before because nothing connected a signal to
    an instrument. 12 of 12 archetypes have at least one fund with a signal, and
    those funds carry 72% of publishable euros.

    Dated and sourced per item: a policy claim without a date is unusable, and
    freshness is this corpus's whole value.
    """
    rows = con.execute("""
        SELECT l.instrument_id, s.signal_type, s.summary, s.anticipated_impact,
               s.confidence, a.published_at, a.title,
               COALESCE(NULLIF(a.resolved_url,''), a.url) AS url
        FROM signals_article_instrument_links l
        JOIN signals_article_signals s ON s.article_id = l.article_id
        JOIN signals_articles a ON a.id = l.article_id
        WHERE s.signal_type = ANY(%s)
          AND a.published_at IS NOT NULL
        ORDER BY l.instrument_id COLLATE "C", a.published_at COLLATE "C" DESC,
                 s.signal_type COLLATE "C", s.id
    """, (list(DIRECTIONAL_TYPES),)).fetchall()

    out: dict[str, list[dict]] = {}
    seen: set[tuple[str, str]] = set()
    for r in rows:
        iid, stype, summary, impact, conf, pub, title, url = r.values()
        bucket = out.setdefault(iid, [])
        if len(bucket) >= SIGNALS_PER_INSTRUMENT:
            continue
        # One article can mention a fund several times; the same summary twice
        # in a row reads as two separate developments.
        key = (iid, (summary or "")[:80])
        if key in seen:
            continue
        seen.add(key)
        bucket.append({
            "type": stype,
            "date": (pub or "")[:10],
            "summary": " ".join((summary or "").split()),
            "impact": " ".join((impact or "").split()) or None,
            "confidence": round(float(conf or 0), 2),
            "title": title,
            "url": url,
        })
    return out


def main() -> None:
    r = SignalsRetriever()

    topics = {name: _items(r.search(q, k=K_PER_QUERY)) for name, q in TOPIC_QUERIES.items()}
    sectors = {name: _items(r.search(q, k=K_PER_QUERY)) for name, q in SECTOR_QUERIES.items()}

    with connect(readonly=True, dict_rows=True) as con:
        n_articles = con.execute("SELECT COUNT(*) AS n FROM signals_articles").fetchone()["n"]
        n_embedded = con.execute(
            "SELECT COUNT(DISTINCT article_id) AS n FROM signals_article_chunks").fetchone()["n"]
        people = _people(con)
        instruments = _instrument_signals(con)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "corpus": {"articles": n_articles, "embeddedArticles": n_embedded},
        "topics": topics,
        "sectors": sectors,
        "people": people,
        # Keyed by instrument_id, so pipeline.ts can pick the funds actually on
        # this founder's table rather than tailoring by topic alone.
        "instruments": instruments,
    }
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False))
    n_top = sum(len(v) for v in topics.values())
    n_sec = sum(len(v) for v in sectors.values())
    n_inst = sum(len(v) for v in instruments.values())
    print(f"  per-instrument signals: {n_inst} across {len(instruments)} funds")
    print(f"signals digest → {OUT}")
    print(f"  {n_top} topic passages, {n_sec} sector passages, "
          f"{len(people)} people/agenda items "
          f"(from {n_embedded:,} embedded articles)")
    for name, items in topics.items():
        flag = "" if items else "   ← EMPTY (brief must say the corpus is thin here)"
        print(f"  topic {name}: {len(items)}{flag}")


if __name__ == "__main__":
    main()
