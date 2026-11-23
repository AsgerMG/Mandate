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


def _get(client: httpx.Client, url: str, params: dict | None = None) -> httpx.Response:
    for attempt in range(4):
        r = client.get(url, params=params)
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


def fr_entry(rec: dict) -> dict:
    heads = []
    for a in rec.get("affectation_personne") or []:
        p = a.get("personne") or {}
        name = " ".join(x for x in (p.get("prenom"), p.get("nom")) if x).strip()
        if not name:
            continue
        ref = (p.get("texte_reference") or [{}])[0]
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
             "UK": ("uk_govuk_organisations", uk_pages, uk_entry, "GOV.UK organisations (Government Digital Service)")}


def load(db_url: str, *, apply: bool, market: str) -> tuple[dict, list[str]]:
    from mandate.grounding.bucket import bucket_from_env  # noqa: PLC0415
    if market not in REGISTERS:
        raise Drift(f"no register loader for {market} yet (FR, UK)")
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
        n_pages = 0
        with httpx.Client(timeout=90.0, follow_redirects=True, headers={"user-agent": UA, "accept": "application/json"}) as client:
            for url, raw, recs in pages(client):
                v = store_original(con, raw, url, "application/json", dt.datetime.now(dt.timezone.utc),
                                   text=None, title=f"Register page: {register}", kind="register_page",
                                   source_id=src, http_status=200, bucket=bucket)
                n_pages += 1
                for rec in recs:
                    e = entry(rec)
                    if not e["register_id"] or not e["name"]:
                        continue
                    e["citations"] = [{"sha256": v.sha256, "url": url, "located": True, "quote": e["name"],
                                       "register": register}]
                    entries[e["register_id"]] = e
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
