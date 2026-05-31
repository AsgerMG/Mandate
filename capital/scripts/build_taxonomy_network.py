"""Build the taxonomy / co-funding network JSON for the home page viz.

Nodes:
  - EU-level instruments (eic, eit, edf, eib, ipcei, innovation_fund, chips_ju,
    horizon_eu_pillar_ii, horizon_eu_partnership)
  - National development bank / agency funds (htgf, cdti, almi, cdp_vc, tesi,
    coparion, invest_nl, bpifrance, sprind, enterprise_ireland)

Edges:
  - Hierarchical (EU <-> NDB): weight = shared portfolio companies
  - Sector overlap: weight = shared dominant sector (top sector by company count)
"""

import json
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "db.sqlite"
OUT = ROOT / "site" / "public" / "data" / "taxonomy_network.json"

STATE_AID_NODE = (
    "state_aid_satr",
    "EU State Aid Transparency Register",
    "state_aid",
    None,
    "Cross-border register where 24 national authorities publish every state-aid award above the GBER thresholds. Not a fund itself — it is the backbone through which Member-State innovation, IPCEI, Net-Zero and AR79xxx-notified aid is disclosed. Most NDB awards above the de-minimis bar appear here too, which is why NDB and SATR portfolios overlap heavily.",
)

PRIVATE_PLACEHOLDERS = [
    ("private_vc", "Private venture capital", "private", None,
     "Independent VCs (Lakestar, Atomico, Northzone, Speedinvest, etc.). Not tracked in this study; shown as a placeholder because EU and NDB instruments are designed to crowd in private equity. The dashed links flag the channels (EIC Fund follow-ons, EIB venture co-invest, NDB pari-passu) where public money should hand off."),
    ("corporate_equity", "Corporate / strategic equity", "private", None,
     "Industrial primes and corporate VC arms (Airbus Ventures, Siemens, BMW i Ventures, Bosch Ventures, ENGIE NV, etc.). Out of scope in the corpus. Most relevant for IPCEI, EDF, Chips JU, and the cleantech end of the Innovation Fund."),
    ("private_debt", "Commercial banks & private debt", "private", None,
     "Commercial bank lending, growth debt funds, and project finance. Out of scope here. The natural follow-on for Innovation Fund grants, EIB-backed scale-ups, and NDB equity exits."),
]

NODES = [
    # id, label, group, country, blurb
    ("horizon_eu_pillar_ii", "Horizon Europe Pillar II", "eu", None,
     "Clusters 1-6 of Horizon Europe (2021-2027), the EU's flagship R&I framework. Funds collaborative research across health, culture, civil security, digital/industry/space, climate/energy/mobility, and food/bioeconomy."),
    ("horizon_eu_partnership", "Horizon Partnerships (CHP, IHI, EuroHPC)", "eu", None,
     "Joint undertakings co-funded by Horizon and private/public partners: Clean Hydrogen Partnership, Innovative Health Initiative, and the EuroHPC supercomputing JU."),
    ("eic", "European Innovation Council", "eu", None,
     "Direct grant + equity for deep-tech startups and SMEs. Accelerator (€2.5M grant + up to €15M equity), Pathfinder (frontier research), Transition (validate + scale)."),
    ("eit", "European Institute of Innovation and Technology", "eu", None,
     "Eight Knowledge & Innovation Communities (KICs) covering climate, digital, health, food, manufacturing, raw materials, urban mobility, energy. Mix of grants, prizes, and equity via KIC investment vehicles."),
    ("ipcei", "Important Projects of Common European Interest", "eu", None,
     "State-aid framework that lets member states co-fund strategic cross-border industrial projects: batteries, hydrogen, microelectronics, cloud, health. Largest single-ticket EU instrument by EUR per company."),
    ("innovation_fund", "Innovation Fund", "eu", None,
     "ETS-funded grants for breakthrough low-carbon technologies. Large-scale + small-scale projects, plus Hydrogen Bank auctions. Run by CINEA."),
    ("edf", "European Defence Fund", "eu", None,
     "Co-funds defence R&D (research actions) and development actions across member states. Concentrated in French, Italian, Spanish, and German primes plus SMEs."),
    ("eib", "European Investment Bank - Venture Debt", "eu", None,
     "EIB's venture debt / quasi-equity instrument for scale-ups. Tickets €7.5-50M, repayable but back-loaded. Often co-invests with national VCs and EIC Fund."),
    ("chips_ju", "Chips Joint Undertaking", "eu", None,
     "Successor to KDT JU. Co-funds semiconductor R&D and pilot lines under the EU Chips Act. Member states match EU contribution."),
    # National development banks / agencies
    ("htgf", "High-Tech Gruenderfonds (HTGF)", "ndb", "DE",
     "Germany's federal seed VC. Public-private fund-of-funds backed by BMWK, KfW, and ~30 industrial LPs. Tickets up to €4M follow-on across 800+ portfolio companies."),
    ("cdti", "CDTI (Centro para el Desarrollo Tecnologico)", "ndb", "ES",
     "Spain's national R&D agency. Soft loans + grants under Neotec (startups), I+D, Misiones, Cervera (tech centres), PERTE Aeroespacial. Largest single NDB by company count."),
    ("almi", "Almi Invest", "ndb", "SE",
     "Swedish state regional VC. Eight regional funds investing pre-seed/seed alongside private co-investors. Mandate is geographic coverage, not return maximisation."),
    ("cdp_vc", "CDP Venture Capital", "ndb", "IT",
     "Italian state VC (Cassa Depositi e Prestiti subsidiary). Direct equity + fund-of-funds across deep tech, climate, and southern-Italy missions."),
    ("tesi", "Tesi (Suomen Teollisuussijoitus)", "ndb", "FI",
     "Finland's state investment company. Direct equity into Finnish growth + indirect via VC funds. Co-invests with private LPs; mandate covers cleantech, deep tech, life sciences."),
    ("coparion", "Coparion", "ndb", "DE",
     "German federal co-investment fund (KfW + ERP). Always matches a lead private VC pari-passu in Series A/B. Tickets up to €15M cumulative."),
    ("invest_nl", "Invest-NL", "ndb", "NL",
     "Dutch state development bank for energy transition + scale-ups. Direct equity + fund-of-funds (Invest-NL Capital). Conservative ticket sizes vs European peers."),
    ("bpifrance", "Bpifrance", "ndb", "FR",
     "France's national investment bank. Massive multi-instrument book (debt, equity, guarantees, fund-of-funds). Only 'fonds' (direct + indirect funds) are in the corpus."),
    ("sprind", "SPRIND (Bundesagentur fuer Sprunginnovationen)", "ndb", "DE",
     "Germany's federal breakthrough-innovation agency. Runs SPRIND Challenges (multi-year stage-gated grants up to €15M) on civilisation-scale problems."),
    ("enterprise_ireland", "Enterprise Ireland", "ndb", "IE",
     "Irish state agency. Soft loans + equity across HPSU (high-potential startups), R&D, IP commercialisation, Disruptive Tech Innovation Fund, Seed & Venture."),
]

# Each NDB id -> list of source LIKE patterns it owns
NDB_SOURCE_PATTERNS = {
    "htgf": ["htgf_%"],
    "cdti": ["cdti_%"],
    "almi": ["almi_%"],
    "cdp_vc": ["cdp_%"],
    "tesi": ["tesi_%"],
    "coparion": ["coparion_%"],
    "invest_nl": ["invest_nl_%"],
    "bpifrance": ["bpifrance_%"],
    "sprind": ["sprind_%"],
    "enterprise_ireland": ["enterprise_ireland_%"],
}

# EU group id -> source_family value in v_events
EU_FAMILIES = {
    "horizon_eu_pillar_ii": "horizon_eu_pillar_ii",
    "horizon_eu_partnership": "horizon_eu_partnership",
    "eic": "eic",
    "eit": "eit",
    "ipcei": "ipcei",
    "innovation_fund": "innovation_fund",
    "edf": "edf",
    "eib": "eib",
    "chips_ju": "chips_ju",
}


def company_set(conn, where_clause: str, params: tuple) -> set[int]:
    sql = f"SELECT DISTINCT company_id FROM v_events WHERE {where_clause} AND company_id IS NOT NULL"
    return {row[0] for row in conn.execute(sql, params)}


def metrics_for_node(conn, ids: set[int], event_where: str, event_params: tuple) -> dict:
    if not ids:
        return {"companies": 0, "totalEur": 0.0, "topSectors": [], "topCountries": []}
    eur_sql = (
        f"SELECT COALESCE(SUM(COALESCE(grant_amount_eur, 0) "
        f"+ COALESCE(equity_amount_eur, 0) + COALESCE(debt_amount_eur, 0)), 0) "
        f"FROM v_events WHERE {event_where}"
    )
    total_eur = conn.execute(eur_sql, event_params).fetchone()[0]
    sec_sql = (
        f"SELECT COALESCE(c.sector_inferred, 'unclassified') AS s, COUNT(DISTINCT c.id) "
        f"FROM v_events v JOIN companies c ON c.id = v.company_id "
        f"WHERE {event_where} GROUP BY s ORDER BY 2 DESC LIMIT 4"
    )
    sectors = [
        {"sector": s, "companies": n}
        for s, n in conn.execute(sec_sql, event_params).fetchall()
        if s != "unclassified"
    ]
    cty_sql = (
        f"SELECT COALESCE(c.country, 'XX') AS cc, COUNT(DISTINCT c.id) "
        f"FROM v_events v JOIN companies c ON c.id = v.company_id "
        f"WHERE {event_where} GROUP BY cc ORDER BY 2 DESC LIMIT 5"
    )
    countries = [{"country": c, "companies": n} for c, n in conn.execute(cty_sql, event_params).fetchall()]
    return {
        "companies": len(ids),
        "totalEur": float(total_eur or 0.0),
        "topSectors": sectors,
        "topCountries": countries,
    }


def main() -> None:
    conn = sqlite3.connect(DB)
    node_companies: dict[str, set[int]] = {}

    node_event_filter: dict[str, tuple[str, tuple]] = {}
    all_nodes = [*NODES, STATE_AID_NODE]
    for node in all_nodes:
        nid, _, group, _, _ = node
        if group == "eu":
            family = EU_FAMILIES[nid]
            where = "source_family = ?"
            params: tuple = (family,)
        elif group == "state_aid":
            where = "source_family = ?"
            params = ("state_aid_satr",)
        else:
            patterns = NDB_SOURCE_PATTERNS[nid]
            where = " OR ".join("source LIKE ?" for _ in patterns)
            params = tuple(patterns)
        node_companies[nid] = company_set(conn, where, params)
        node_event_filter[nid] = (where, params)

    nodes_out = []
    for nid, label, group, country, blurb in all_nodes:
        ids = node_companies[nid]
        ew, ep = node_event_filter[nid]
        m = metrics_for_node(conn, ids, ew, ep)
        nodes_out.append({
            "id": nid,
            "label": label,
            "group": group,
            "country": country,
            "blurb": blurb,
            **m,
        })

    # Edges
    edges = []
    seen = set()
    # Hierarchical: every NDB vs every EU instrument with >=3 shared companies
    eu_ids = [n[0] for n in NODES if n[2] == "eu"]
    ndb_ids = [n[0] for n in NODES if n[2] == "ndb"]
    for ndb in ndb_ids:
        for eu in eu_ids:
            shared = node_companies[ndb] & node_companies[eu]
            if len(shared) >= 1:
                edges.append({
                    "source": ndb,
                    "target": eu,
                    "weight": len(shared),
                    "kind": "hierarchical",
                })
                seen.add(frozenset((ndb, eu)))

    # SATR backbone — link to every NDB and to the notified-aid EU instruments
    satr_id = STATE_AID_NODE[0]
    satr_targets = ndb_ids + ["ipcei", "innovation_fund", "edf"]
    for tgt in satr_targets:
        shared = node_companies[satr_id] & node_companies.get(tgt, set())
        edges.append({
            "source": satr_id,
            "target": tgt,
            "weight": max(1, len(shared)),
            "kind": "hierarchical",
        })
        seen.add(frozenset((satr_id, tgt)))

    # Sector overlap: connect nodes that share their dominant sector (and not already linked)
    dominant = {}
    for n in nodes_out:
        if n["topSectors"]:
            dominant[n["id"]] = n["topSectors"][0]["sector"]
    by_sector: dict[str, list[str]] = defaultdict(list)
    for nid, sec in dominant.items():
        by_sector[sec].append(nid)
    for sec, members in by_sector.items():
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                a, b = members[i], members[j]
                key = frozenset((a, b))
                if key in seen:
                    continue
                edges.append({
                    "source": a,
                    "target": b,
                    "weight": 1,
                    "kind": "sector",
                    "sector": sec,
                })
                seen.add(key)

    # Private placeholders carry no metrics; render as illustrative nodes
    for pid, label, group, country, blurb in PRIVATE_PLACEHOLDERS:
        nodes_out.append({
            "id": pid,
            "label": label,
            "group": group,
            "country": country,
            "blurb": blurb,
            "companies": 0,
            "totalEur": 0.0,
            "topSectors": [],
            "topCountries": [],
        })

    # Placeholder edges from EU + NDB to private capital, showing where
    # public money is expected to hand off. Faint by design.
    placeholder_edges = [
        # EU follow-on channels
        ("eic", "private_vc"),
        ("eib", "private_vc"),
        ("eit", "private_vc"),
        ("innovation_fund", "private_debt"),
        ("ipcei", "corporate_equity"),
        ("edf", "corporate_equity"),
        ("chips_ju", "corporate_equity"),
        # NDB co-investment channels
        ("htgf", "private_vc"),
        ("almi", "private_vc"),
        ("cdp_vc", "private_vc"),
        ("tesi", "private_vc"),
        ("coparion", "private_vc"),
        ("invest_nl", "private_vc"),
        ("bpifrance", "private_debt"),
        ("cdti", "private_debt"),
        ("sprind", "corporate_equity"),
        ("enterprise_ireland", "private_vc"),
    ]
    for a, b in placeholder_edges:
        edges.append({"source": a, "target": b, "weight": 1, "kind": "placeholder"})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"nodes": nodes_out, "edges": edges}, indent=2))
    print(f"wrote {OUT} -- {len(nodes_out)} nodes, {len(edges)} edges")


if __name__ == "__main__":
    main()
