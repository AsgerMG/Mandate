"""THE CENSUS, step 1: load an official register of public bodies (migration 046). Dry run unless --apply.

    python3 capital/ETL/terms/load_register.py --database-url URL --market FR            # dry run
    python3 capital/ETL/terms/load_register.py --database-url URL --market UK --apply    # write

Registers (official, open, no key):
  FR  Annuaire de l'administration (DILA), api-lannuaire.service-public.fr, dataset
      api-lannuaire-administration: the national level (central administrations, public
      establishments, national services, independent authorities, public-interest groupings,
      ministerial cabinets, institutions) plus the local and regional authorities; the named
      head of each service with the Journal officiel text that appointed them.
  UK  GOV.UK organisations API, www.gov.uk/api/organisations: every body with its parents,
      children, status (live / closed) and successor. No names: people come from org charts.

Every page the register returns is stored in grounding first (bucket bytes, then the version);
a body's citation is that page. A body gets a NEW row only when its content changed
(content_sha256), so a monthly re-load records only what moved. No model, no API credits.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx  # noqa: E402
import psycopg  # noqa: E402

from load_batch_italy import Drift, DryBucket  # noqa: E402
from mandate.grounding.store import ensure_source, store_original  # noqa: E402

MIGRATIONS = REPO / "capital" / "ETL" / "schema" / "migrations"
UA = "Mozilla/5.0 (compatible; Mandate census; public-register reader)"

FR_API = "https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records"
FR_TYPES = ("Administration centrale (ou Ministère)", "Établissement public", "Service à compétence nationale",
            "Autorité administrative indépendante", "Autorité publique indépendante", "Groupement d'intérêt public",
            "Cabinet ministériel", "Institution", "Secrétaire d'État", "Collectivité locale", "Service déconcentré",
            "Institution européenne")
FR_FIELDS = "id,nom,sigle,type_organisme,hierarchie,affectation_personne,site_internet,organigramme,texte_reference,date_modification"
UK_API = "https://www.gov.uk/api/organisations"
IT_API = "https://indicepa.gov.it/ipa-dati/api/3/action/datastore_search"
IT_ENTI = "d09adf99-dc10-4349-8c53-27b1e5aa97b6"            # enti (the administrations)
IT_UO = "b0aa1f6c-f135-4c8a-b416-396fed4e1a5d"              # unita-organizzative (their units)
# the categories in scope for public business finance: ministries and the PCM, non-economic public
# bodies, independent authorities, research bodies, fiscal agencies, constitutional organs, regions,
# regional agencies (training/research, agriculture), chambers of commerce, industrial-development
# consortia, autonomous state companies, state-owned companies in the consolidated account
IT_CATEGORIES = ("C1", "C2", "C3", "C5", "C8", "C10", "L4", "L2", "L13", "L21", "L35", "L42", "L46", "S01")


def migrate(con) -> str:
    have = {r[0] for r in con.execute("SELECT id FROM schema_migrations").fetchall()}
    if "046" in have:
        return "046 already applied"
    if "045" not in have:
        raise Drift("migration 045 is not applied: bring the graph core up to date first")
    con.execute("SELECT pg_advisory_xact_lock(hashtext('capital.schema_migrations'))")
    con.execute(next(MIGRATIONS.glob("046_*.sql")).read_text())
    con.execute("INSERT INTO schema_migrations (id) VALUES ('046')")
    return "046 applied (or would be, in a dry run)"


def _get(client: httpx.Client, url: str, params: dict | None = None, headers: dict | None = None) -> httpx.Response:
    for attempt in range(4):
        r = client.get(url, params=params, headers=headers)
        if r.status_code in (429, 503):
            time.sleep(10 * (attempt + 1))
            continue
        r.raise_for_status()
        return r
    r.raise_for_status()
    return r


def fr_pages(client: httpx.Client):
    """(url, bytes, records) per page; one page per type so no query passes the API's 10,000 offset."""
    for t in FR_TYPES:
        offset = 0
        while True:
            params = {"select": FR_FIELDS, "where": f'type_organisme="{t}"', "limit": 100, "offset": offset,
                      "order_by": "id"}
            r = _get(client, FR_API, params)
            recs = r.json().get("results") or []
            if not recs:
                break
            yield str(r.url), r.content, recs
            offset += 100
            if offset >= 10000:
                raise Drift(f"FR type {t!r} has more than 10,000 services: split the query")
            time.sleep(0.3)


def _list(v) -> list:
    """The Annuaire returns its nested fields as JSON text, not lists."""
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except json.JSONDecodeError:
            return []
    return v if isinstance(v, list) else []


def fr_entry(rec: dict) -> dict:
    rec = {**rec, **{k: _list(rec.get(k)) for k in ("affectation_personne", "site_internet", "organigramme",
                                                     "texte_reference", "hierarchie")}}
    heads = []
    for a in rec.get("affectation_personne") or []:
        p = a.get("personne") or {}
        name = " ".join(x for x in (p.get("prenom"), p.get("nom")) if x).strip()
        if not name:
            continue
        ref = (_list(p.get("texte_reference")) or [{}])[0]
        heads.append({"role": a.get("fonction") or "", "name": name,
                      "appointment": {"text": ref.get("libelle"), "url": ref.get("valeur")} if ref.get("valeur") else None})
    links = {"website": [x.get("valeur") for x in rec.get("site_internet") or [] if x.get("valeur")],
             "org_chart": [x.get("valeur") for x in rec.get("organigramme") or [] if x.get("valeur")],
             "organising_texts": [{"text": x.get("libelle"), "url": x.get("valeur")} for x in rec.get("texte_reference") or []
                                  if x.get("valeur")],
             "register_page": f"https://lannuaire.service-public.gouv.fr/gouvernement/{rec['id']}"}
    name = rec.get("nom") or ""
    return {"register_id": rec["id"], "name": name, "kind": rec.get("type_organisme"), "status": "open",
            "parent_ids": [], "child_ids": [h["service"] for h in rec.get("hierarchie") or [] if h.get("service")],
            "successor_ids": [], "heads": heads, "links": links}


def uk_pages(client: httpx.Client):
    page = 1
    while True:
        r = _get(client, UK_API, {"page": page})
        d = r.json()
        yield str(r.url), r.content, d.get("results") or []
        if page >= int(d.get("pages") or 1):
            break
        page += 1
        time.sleep(0.5)


def it_pages(client: httpx.Client):
    """The administrations in scope, then their organisational units (CKAN datastore, 1,000 a page)."""
    codes: list[str] = []
    for cat in IT_CATEGORIES:
        offset = 0
        while True:
            r = _get(client, IT_API, {"resource_id": IT_ENTI, "filters": json.dumps({"Codice_Categoria": cat}),
                                      "limit": 1000, "offset": offset})
            recs = r.json()["result"]["records"]
            if not recs:
                break
            codes += [x["Codice_IPA"] for x in recs]
            yield str(r.url), r.content, [{"_kind": "ente", **x} for x in recs]
            offset += 1000
    for i in range(0, len(codes), 50):
        chunk = codes[i:i + 50]
        offset = 0
        while True:
            r = _get(client, IT_API, {"resource_id": IT_UO, "filters": json.dumps({"Codice_IPA": chunk}),
                                      "limit": 1000, "offset": offset})
            recs = r.json()["result"]["records"]
            if not recs:
                break
            yield str(r.url), r.content, [{"_kind": "uo", **x} for x in recs]
            offset += 1000
        time.sleep(0.2)


def it_entry(rec: dict) -> dict:
    """Names only (public professional role); no mail, no phone."""
    name = " ".join(x for x in (rec.get("Nome_responsabile"), rec.get("Cognome_responsabile")) if x).strip()
    if rec["_kind"] == "ente":
        heads = [{"role": rec.get("Titolo_responsabile") or "responsabile", "name": name, "appointment": None}] if name else []
        return {"register_id": rec["Codice_IPA"], "name": rec.get("Denominazione_ente") or "",
                "kind": f"ente:{rec.get('Codice_Categoria')}", "status": "closed" if rec.get("Ente_in_liquidazione") == "S" else "open",
                "parent_ids": [], "child_ids": [], "successor_ids": [], "heads": heads,
                "links": {"website": [rec.get("Sito_istituzionale")] if rec.get("Sito_istituzionale") else [],
                          "acronym": rec.get("Acronimo"), "updated": rec.get("Data_aggiornamento")}}
    parent = rec.get("Codice_uni_uo_padre") or rec.get("Codice_IPA")
    heads = [{"role": "responsabile dell'unità", "name": name, "appointment": None}] if name else []
    return {"register_id": rec["Codice_uni_uo"], "name": rec.get("Descrizione_uo") or "", "kind": "unità organizzativa",
            "status": "open", "parent_ids": [parent] if parent else [], "child_ids": [], "successor_ids": [],
            "heads": heads, "links": {"ente": rec.get("Codice_IPA"), "established": rec.get("Data_istituzione")}}


EU_SPARQL = "https://publications.europa.eu/webapi/rdf/sparql"
_EU_PREFIX = """PREFIX org:<http://www.w3.org/ns/org#> PREFIX skos:<http://www.w3.org/2004/02/skos/core#>
PREFIX foaf:<http://xmlns.com/foaf/0.1/> PREFIX euvoc:<http://publications.europa.eu/ontology/euvoc#>
"""
_EU_ROOT = "<http://publications.europa.eu/resource/authority/corporate-body/EURUN>"
EU_ORGS = _EU_PREFIX + """SELECT DISTINCT ?org ?label ?parent WHERE {
  ?org org:subOrganizationOf* %s . ?org org:subOrganizationOf ?parent .
  ?org skos:prefLabel ?label . FILTER(LANGMATCHES(LANG(?label), "en")) } LIMIT 10000"""
EU_PEOPLE = _EU_PREFIX + """SELECT DISTINCT ?org ?given ?family ?position WHERE {
  ?org org:subOrganizationOf* %s . ?ms org:organization ?org . ?person org:hasMembership ?ms .
  ?person foaf:givenName ?given ; foaf:familyName ?family .
  OPTIONAL { ?ms euvoc:positionComplement ?position . FILTER(LANGMATCHES(LANG(?position), "en")) } } LIMIT 10000"""
EU_CHILDREN = _EU_PREFIX + """SELECT DISTINCT ?org WHERE { ?org org:subOrganizationOf %s } LIMIT 10000"""


def _eu_query(client: httpx.Client, q: str) -> tuple[str, bytes, list[dict]]:
    r = _get(client, EU_SPARQL, {"query": q, "format": "application/sparql-results+json"},
             headers={"accept": "application/sparql-results+json"})
    rows = [{k: v["value"] for k, v in x.items()} for x in r.json()["results"]["bindings"]]
    return str(r.url)[:2000], r.content, rows


def eu_pages(client: httpx.Client):
    """EU Whoiswho through the Publications Office SPARQL endpoint (10,000 rows a query, no paging):
    each query is one subtree; a subtree at the cap is split into its children (and itself, alone)."""
    def walk(kind: str, tmpl: str, root: str):
        url, raw, rows = _eu_query(client, tmpl % root)
        if len(rows) < 10000:
            yield url, raw, [{"_kind": kind, **x} for x in rows]
            return
        _, _, kids = _eu_query(client, EU_CHILDREN % root)
        own = tmpl.replace("org:subOrganizationOf* %s", "FILTER(?org = %s)") % root
        url, raw, rows = _eu_query(client, own)
        yield url, raw, [{"_kind": kind, **x} for x in rows]
        for k in kids:
            yield from walk(kind, tmpl, f"<{k['org']}>")
            time.sleep(0.2)
    _, _, tops = _eu_query(client, EU_CHILDREN % _EU_ROOT)
    for kind, tmpl in (("org", EU_ORGS), ("person", EU_PEOPLE)):
        for t in tops:
            yield from walk(kind, tmpl, f"<{t['org']}>")


def _eu_id(uri: str) -> str:
    return uri.rstrip("/").rsplit("/", 1)[-1]


def eu_entries(recs: list[dict]) -> dict:
    """Bodies with parents; people attached as heads of the body they sit in (position as role)."""
    out: dict[str, dict] = {}
    for r in recs:
        if r["_kind"] != "org":
            continue
        rid = _eu_id(r["org"])
        e = out.setdefault(rid, {"register_id": rid, "name": r["label"], "kind": "eu body", "status": "open",
                                 "parent_ids": [], "child_ids": [], "successor_ids": [], "heads": [],
                                 "links": {"whoiswho": r["org"]}})
        pid = _eu_id(r["parent"])
        if pid not in e["parent_ids"]:
            e["parent_ids"].append(pid)
    for r in recs:
        if r["_kind"] == "person" and _eu_id(r["org"]) in out:
            out[_eu_id(r["org"])]["heads"].append({"role": r.get("position") or "member", "name": f"{r['given']} {r['family']}",
                                                   "appointment": None})
    return out


def _slug(api_id: str) -> str:
    return api_id.rstrip("/").rsplit("/", 1)[-1]


def uk_entry(rec: dict) -> dict:
    det = rec.get("details") or {}
    closed = det.get("govuk_status") == "closed"
    return {"register_id": det.get("slug") or _slug(rec["id"]), "name": rec.get("title") or "", "kind": rec.get("format"),
            "status": "closed" if closed else "open",
            "parent_ids": [_slug(x["id"]) for x in rec.get("parent_organisations") or []],
            "child_ids": [_slug(x["id"]) for x in rec.get("child_organisations") or []],
            "successor_ids": [_slug(x["id"]) for x in rec.get("superseding_organisations") or []],
            "heads": [], "links": {"website": [rec.get("web_url")], "closed_status": det.get("govuk_closed_status"),
                                    "abbreviation": det.get("abbreviation")}}


REGISTERS = {"FR": ("fr_annuaire", fr_pages, fr_entry, "Annuaire de l'administration (DILA, Premier ministre)"),
             "UK": ("uk_govuk_organisations", uk_pages, uk_entry, "GOV.UK organisations (Government Digital Service)"),
             "IT": ("it_indicepa", it_pages, it_entry, "IndicePA, Indice dei domicili digitali della PA (AgID)"),
             "EU": ("eu_whoiswho", eu_pages, None, "EU Whoiswho (Publications Office of the European Union)")}


def load(db_url: str, *, apply: bool, market: str) -> tuple[dict, list[str]]:
    from mandate.grounding.bucket import bucket_from_env  # noqa: PLC0415
    if market not in REGISTERS:
        raise Drift(f"no register loader for {market} yet (FR, UK, IT, EU)")
    register, pages, entry, publisher = REGISTERS[market]
    bucket = bucket_from_env() if apply else DryBucket()
    batch = f"register_{market.lower()}_" + dt.date.today().strftime("%Y_%m_%d")
    report: list[str] = []
    counts: dict = {}
    with psycopg.connect(db_url) as con:
        con.execute("SET search_path = capital, public")
        counts["migration"] = migrate(con)
        src = ensure_source(con, f"capital.register.{register}", f"Official register: {publisher}", publisher=publisher)
        entries: dict[str, dict] = {}
        eu_rows: list[dict] = []
        n_pages = 0
        with httpx.Client(timeout=90.0, follow_redirects=True, headers={"user-agent": UA, "accept": "application/json"}) as client:
            for url, raw, recs in pages(client):
                v = store_original(con, raw, url, "application/json", dt.datetime.now(dt.timezone.utc),
                                   text=None, title=f"Register page: {register}", kind="register_page",
                                   source_id=src, http_status=200, bucket=bucket)
                n_pages += 1
                if entry is None:   # EU: bodies and people come in separate queries; assembled after
                    for rec in recs:
                        rec["_cite"] = {"sha256": v.sha256, "url": url}
                    eu_rows.extend(recs)
                    continue
                for rec in recs:
                    e = entry(rec)
                    if not e["register_id"] or not e["name"]:
                        continue
                    e["citations"] = [{"sha256": v.sha256, "url": url, "located": True, "quote": e["name"],
                                       "register": register}]
                    entries[e["register_id"]] = e
        if eu_rows:
            entries = eu_entries(eu_rows)
            cite = {(_eu_id(r["org"])): r["_cite"] for r in eu_rows if r["_kind"] == "org"}
            for rid, e in entries.items():
                c = cite[rid]
                e["citations"] = [{"sha256": c["sha256"], "url": c["url"], "located": True, "quote": e["name"], "register": register}]
        # parents from children (FR lists only children): a body's parents are the bodies that list it
        if market == "FR":
            for pid, e in entries.items():
                for cid in e["child_ids"]:
                    if cid in entries and pid not in entries[cid]["parent_ids"]:
                        entries[cid]["parent_ids"].append(pid)
        counts["register pages stored"] = f"{n_pages} ({'bucket puts skipped, dry run' if not apply else 'in grounding'})"
        held = {r[0]: r[1] for r in con.execute(
            "SELECT DISTINCT ON (register_id) register_id, content_sha256 FROM register_entries "
            "WHERE register = %s ORDER BY register_id, recorded_at DESC", (register,))}
        new = changed = same = 0
        for rid, e in entries.items():
            body = {k: e[k] for k in ("name", "kind", "status", "parent_ids", "child_ids", "successor_ids", "heads", "links")}
            body["parent_ids"] = sorted(body["parent_ids"]); body["child_ids"] = sorted(body["child_ids"])
            sha = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            if held.get(rid) == sha:
                same += 1
                continue
            con.execute(
                "INSERT INTO register_entries (market, register, register_id, name, kind, status, parent_ids, child_ids, "
                "successor_ids, heads, links, citations, content_sha256, batch) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s,%s) ON CONFLICT DO NOTHING",
                (market, register, rid, e["name"], e["kind"], e["status"], body["parent_ids"], body["child_ids"],
                 e["successor_ids"], json.dumps(e["heads"], ensure_ascii=False), json.dumps(e["links"], ensure_ascii=False),
                 json.dumps(e["citations"], ensure_ascii=False), sha, batch))
            if rid in held:
                changed += 1
            else:
                new += 1
        gone = [rid for rid in held if rid not in entries]
        counts["bodies"] = f"{len(entries)} in the register: {new} new, {changed} changed, {same} unchanged"
        counts["heads named"] = sum(len(e["heads"]) for e in entries.values())
        counts["closed"] = sum(e["status"] == "closed" for e in entries.values())
        if gone:
            counts["no longer in the register"] = len(gone)
            report += [f"  gone from the register: {g}" for g in gone[:20]]
        kinds: dict = {}
        for e in entries.values():
            kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
        report += [f"  {n:6}  {k}" for k, n in sorted(kinds.items(), key=lambda x: -x[1])[:14]]
        if not apply:
            con.rollback()
    return counts, report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--market", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    try:
        counts, report = load(a.database_url, apply=a.apply, market=a.market.upper())
    except Drift as e:
        print(f"REFUSED (drift): {e}", file=sys.stderr)
        return 3
    print("\n".join(report))
    for k, v in counts.items():
        print(f"  {k:26} {v}")
    print("APPLIED." if a.apply else "DRY RUN: rolled back, nothing written. Add --apply to write (owner-approved).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
