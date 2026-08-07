"""Name a row after the thing a founder applies to, not the act that opens it.

── The defect ─────────────────────────────────────────────────────────────
A Spanish founder's brief row reads

    "RESOLUCIÓNpor la que se abre la convocatoria para la concesión de
     subvenciones en el ámbito del comercio y de los servicios para el año 2026"

The ranking is sound -- `eligibility_text` carries the facts -- but no founder
recognises that as a fund, and a row they cannot recognise fails the product's
whole claim however well it ranks. The same defect sat on the 87 pre-existing
Spanish leaves long before the open-call harvest; the harvest multiplied it by
six and made it impossible to ignore.

── The property, stated once, and general ─────────────────────────────────
    A row's name must name the OBJECT a founder applies to,
    not the legal instrument that creates, opens or approves it.

This is Rule Zero in `project-mgmt/CONTINUE_HERE.md` applied to the name field:
*separate the register artefact from the thing a founder applies to*. A
Commission decision, a GtR `grantCategory` label and a legal citation are all
artefacts. So is `Resolución TER//2026, de 29 de abril`. The applicable object
is one level in, and -- this is the finding -- it is usually **inside the
citation's own object clause**, after the enacting formula:

    Resolución del 7 de mayo de 2026, de la Presidencia del ICECYL,
    por la que se aprueba la convocatoria para la concesión de incentivos a
    proyectos incluidos en el  ⇢ Programa de Incubación Aeroespacial de
                                 Castilla y León ESA BIC CyL ⇠

The harvesting agent's claim was "nothing better exists in the payload". That
is wrong in the way Rule Zero predicts: nothing better exists in a *different*
field, and something better exists inside the field we already hold. Verified
against the official source rather than against our own columns -- see
`--verify-source`, which re-fetches the BDNS detail payload live and reports
every title-bearing field it publishes.

── Why a model and not a regexp ───────────────────────────────────────────
The enacting formula is a grammatical construction, not a vocabulary. It varies
across Spanish, Catalan, Galician and Basque, across `Resolución` / `Orden` /
`Extracto` / `Acuerdo` / `Bases reguladoras`, and across bodies that abbreviate
it to nothing at all. A banned-word list is exactly the failure mode the
standing rule forbids: it fails silently on the first act type nobody listed.

So the decision is a judgement, and the judgement is CONSTRAINED rather than
trusted -- see `is_grounded`. The model may only return a span the register
itself publishes. Every content word of a proposed name must already appear in
the official record; a name containing one invented, translated or paraphrased
word is rejected and the row falls back to composition. The model can therefore
choose WHICH of the register's words name the fund, and cannot introduce any.

── What each outcome records ──────────────────────────────────────────────
  name_source = programme_feed   the register's own words for the object, cut
                                 out of the text the feed publishes. The feed
                                 carries this name; we only stopped reading the
                                 legal wrapper around it.
  name_source = deterministic    composed BY US from register fields, because
                                 the record names no object. `name_basis` gives
                                 the recipe and the fields it drew on.
  (unchanged)                    the name already named the object.

`name_basis` states the method and the source fields on every row this touches,
so a name is never merely asserted. Nothing is written to `intake_field`.

── Stores ─────────────────────────────────────────────────────────────────
Writes SQLite (the authoring store `migrate_to_postgres.py` reloads from) and
then publishes the same rows to Postgres through the scoped publisher, then
reads every number back out of Postgres. A name that lives in only one of the
two stores is a name the founder may or may not see, which is not a state this
workstream is allowed to leave behind.

Usage:
  python3 ETL/terms/name_applicable_object.py --verify-source --country ES
  python3 ETL/terms/name_applicable_object.py --country ES --report
  python3 ETL/terms/name_applicable_object.py --country ES --write
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import concurrent.futures as _cf  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
import unicodedata  # noqa: E402

from ndb_ssl import fetch_json  # noqa: E402

API_BASE = "https://www.infosubvenciones.es/bdnstrans/api"
CACHE = ROOT / "data" / "raw" / "bdns_open" / "official_records"
MODEL = "claude-opus-5"
ID_PREFIX = "bdns_conv_"


# ── The official record ────────────────────────────────────────────────────

def official_record(codigo: str, refresh: bool = False) -> dict | None:
    """The convocatoria as the register publishes it, fetched from the register.

    Cached on disk by codigoBDNS because a name derived from a payload we
    already hold is a name derived from our own columns, which is the error
    Rule Zero names. The cache is the register's response, not our reading of
    it, so it can be re-audited.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / f"{codigo}.json"
    if p.exists() and not refresh:
        try:
            return json.loads(p.read_text())
        except json.JSONDecodeError:
            pass
    d = fetch_json(f"{API_BASE}/convocatorias?numConv={codigo}", timeout=60)
    if d is None:
        return None
    d.pop("advertencia", None)
    p.write_text(json.dumps(d, ensure_ascii=False))
    return d


def _descs(d: dict, key: str) -> list[str]:
    return [(x.get("descripcion") or "").strip() for x in (d.get(key) or [])
            if (x.get("descripcion") or "").strip()]


TITLE_FIELDS = ("descripcion", "descripcionLeng", "descripcionBasesReguladoras")


def sourced_strings(d: dict) -> dict[str, str]:
    """Every string the register publishes that could legitimately supply a
    name, labelled with the field it came from. Nothing else may appear in a
    name -- this dict IS the vocabulary the model is allowed to draw on."""
    out: dict[str, str] = {}
    for f in TITLE_FIELDS:
        v = (d.get(f) or "").strip()
        if v:
            out[f] = v
    organo = d.get("organo") or {}
    for lvl in ("nivel1", "nivel2", "nivel3"):
        if (organo.get(lvl) or "").strip():
            out[f"organo.{lvl}"] = organo[lvl].strip()
    for f in ("descripcionFinalidad", "tipoConvocatoria", "sedeElectronica"):
        if (d.get(f) or "").strip():
            out[f] = d[f].strip()
    for key in ("sectores", "regiones", "fondos", "instrumentos", "objetivos"):
        if _descs(d, key):
            out[key] = "; ".join(_descs(d, key))
    reg = (d.get("reglamento") or {}).get("descripcion")
    if reg:
        out["reglamento"] = reg.strip()
    # The official convocatoria documents. Their filenames are published by the
    # register and frequently name the programme where the title does not
    # ("Orden 31-07-26 convocatoria certamenes feriales 2026.pdf").
    docs = [f"{(x.get('descripcion') or '').strip()} :: {(x.get('nombreFic') or '').strip()}"
            for x in (d.get("documentos") or [])]
    if docs:
        out["documentos"] = " | ".join(docs)
    anun = [(x.get("titulo") or "").strip() for x in (d.get("anuncios") or [])
            if (x.get("titulo") or "").strip()]
    if anun:
        out["anuncios"] = "; ".join(anun)
    for f in ("fechaFinSolicitud", "fechaInicioSolicitud", "fechaRecepcion"):
        if (d.get(f) or ""):
            out[f] = str(d[f])[:10]
    return out


# ── Grounding: the model may choose words, never introduce them ────────────

def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


_TOKEN = re.compile(r"[0-9a-z]+")

# Words too short to carry meaning, plus the connectives a legible name needs
# and no register text is obliged to contain. NOT a semantic list: these are
# function words, and admitting them cannot smuggle in a claim about a fund.
FREE_TOKENS = frozenset({"de", "del", "la", "el", "los", "las", "y", "e", "en",
                         "para", "a", "al", "por", "con", "un", "una", "i",
                         "da", "do", "das", "dos", "o", "os", "ao", "aos"})


def tokens(s: str) -> set[str]:
    return {t for t in _TOKEN.findall(_fold(s)) if t not in FREE_TOKENS}


def is_grounded(name: str, sourced: dict[str, str]) -> tuple[bool, set[str]]:
    """Every content word of the name appears in the register's own text.

    This is what makes a model judgement safe to ship: it decides which of the
    register's words name the fund and cannot add one of its own. A translated
    name, a paraphrase, an expanded acronym and an invented programme title all
    fail here, and all of them are the failure a citation-fixing pass would
    otherwise be free to commit.
    """
    have: set[str] = set()
    for v in sourced.values():
        have |= tokens(v)
    missing = tokens(name) - have
    return (not missing), missing


# ── The judgement ──────────────────────────────────────────────────────────

SYSTEM = """\
You separate a public funding register's LEGAL ARTEFACT from the FUNDING \
OBJECT a company applies to.

A register row is often titled with the legal act that opens the call: an \
instrument designation, a serial, a date, an issuing body, and an enacting \
formula ("by which the call for the award of ... is opened/approved/convoked"). \
That title names the ACT. The OBJECT a founder applies to -- the programme, the \
aid line, the scheme -- is usually named inside that same title, after the \
enacting formula, and sometimes only in a related field.

Decide two things.

1. names_the_legal_act: does the CURRENT NAME lead with the legal instrument \
rather than the funding object? Judge the construction, not any word list; act \
designations and enacting formulae differ by language, region and body. If the \
current name already leads with the object, answer false.

2. applicable_object: the shortest string that a company could recognise as the \
fund and search for. Prefer a named programme or line if the record states one. \
Otherwise use the substantive purpose clause. Keep the year when the record \
carries one and the call is annual. Keep the territory when it distinguishes \
the fund.

HARD CONSTRAINT. You may only REUSE words that appear in the RECORD below. Do \
not translate, expand an acronym, paraphrase, or add any word of your own \
beyond ordinary connectives. Reordering, dropping words and cutting a span are \
allowed. If no span of the record names a recognisable object, set \
applicable_object to the empty string and say so in `note` -- an empty answer \
is correct and useful, an invented one is not.

Answer in the record's own language. Never return a name that is only a body, \
only a policy area, or only a date."""

SCHEMA = {
    "type": "object",
    "properties": {
        "names_the_legal_act": {"type": "boolean"},
        "applicable_object": {"type": "string"},
        "source_fields": {"type": "string",
                          "description": "comma-separated record field names the answer was cut from"},
        "note": {"type": "string"},
    },
    "required": ["names_the_legal_act", "applicable_object", "source_fields", "note"],
    "additionalProperties": False,
}


def _client():
    import anthropic
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (repo-root .env.local)")
    return anthropic.Anthropic()


def judge(client, current_name: str, sourced: dict[str, str]) -> dict:
    record = "\n".join(f"{k}: {v}" for k, v in sourced.items())
    msg = (f"CURRENT NAME:\n{current_name}\n\nRECORD (the register's own fields):\n{record}")
    r = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM,
        output_config={"effort": "low",
                       "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": msg}],
    )
    if r.stop_reason == "refusal":
        return {"names_the_legal_act": False, "applicable_object": "",
                "source_fields": "", "note": "model declined"}
    text = next(b.text for b in r.content if b.type == "text")
    return json.loads(text)


# ── The fallback: composed by us, and said so ──────────────────────────────

def compose(sourced: dict[str, str]) -> tuple[str, str]:
    """A name built from register facts when the record names no object.

    Purpose + body + year, in that order, because that is the order a founder
    reads: what the money is for, who gives it, which round. Every part is a
    verbatim register field and the basis names each one, so the row states a
    composition rather than passing one off as a title.
    """
    purpose = sourced.get("descripcionFinalidad", "")
    body = sourced.get("organo.nivel3") or sourced.get("organo.nivel2") or ""
    year = (sourced.get("fechaFinSolicitud") or sourced.get("fechaRecepcion") or "")[:4]
    parts = [p for p in (purpose, body) if p]
    if not parts:
        return "", ""
    name = " - ".join(parts) + (f" ({year})" if year else "")
    used = [k for k in ("descripcionFinalidad", "organo.nivel3", "organo.nivel2",
                        "fechaFinSolicitud", "fechaRecepcion") if k in sourced]
    return name, "composed=purpose+body+year; fields=" + ",".join(used)


# ── Selection ──────────────────────────────────────────────────────────────

def pg_conn():
    import psycopg
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set (repo-root .env.local)")
    return psycopg.connect(url)


def candidates(country: str) -> list[dict]:
    """Rows the product can offer in this country that carry a BDNS code.

    Read out of Postgres because Postgres is what the product reads. The BDNS
    code is what makes the official record reachable; a row without one cannot
    be re-sourced and is reported rather than guessed at.
    """
    with pg_conn() as c:
        rows = c.execute(
            "SELECT id, name, name_source, scheme_end_date, scheme_end_date_basis, "
            "       successor_scheme "
            "FROM funding_instruments WHERE country = %s ORDER BY id", (country,)).fetchall()
    out = []
    for iid, name, nsrc, end, basis, succ in rows:
        cod = iid[len(ID_PREFIX):] if iid.startswith(ID_PREFIX) else (succ or "")
        out.append({"id": iid, "name": name, "name_source": nsrc,
                    "codigo": cod, "scheme_end_date": end,
                    "scheme_end_date_basis": basis})
    return out


# ── Verification of the harvesting agent's claim ───────────────────────────

def verify_source(country: str, limit: int) -> None:
    """Re-fetch the OFFICIAL record and report what it actually publishes.

    The claim under test is "nothing better than the citation exists in the
    payload". This prints, per row, every title-bearing field the register
    returns live, so the claim is settled against the source rather than
    against the columns we happen to hold.
    """
    rows = [r for r in candidates(country) if r["codigo"]][:limit]
    print(f"{len(rows)} rows with a BDNS code; re-fetching the official record\n")
    stats = {"fetched": 0, "failed": 0, "has_leng": 0, "has_bases": 0,
             "has_docs": 0, "has_anuncios": 0, "has_sede": 0, "has_objetivos": 0}
    for r in rows:
        d = official_record(r["codigo"])
        if d is None:
            stats["failed"] += 1
            print(f"  {r['codigo']}  FETCH FAILED (recorded, not guessed at)")
            continue
        stats["fetched"] += 1
        s = sourced_strings(d)
        stats["has_leng"] += "descripcionLeng" in s
        stats["has_bases"] += "descripcionBasesReguladoras" in s
        stats["has_docs"] += "documentos" in s
        stats["has_anuncios"] += "anuncios" in s
        stats["has_sede"] += "sedeElectronica" in s
        stats["has_objetivos"] += "objetivos" in s
    print("\nfields the register publishes, over the rows fetched")
    for k, v in stats.items():
        print(f"  {k:16} {v}")
    print("\nA field present here is a field the harvest did not read. The claim"
          "\n'nothing better exists in the payload' is answered by whether any of"
          "\nthem names an object -- see --report, which tests exactly that.")


# ── The pass ───────────────────────────────────────────────────────────────

def build(country: str, limit: int | None, workers: int) -> list[dict]:
    rows = [r for r in candidates(country) if r["codigo"]]
    if limit:
        rows = rows[:limit]
    client = _client()

    def one(r: dict) -> dict:
        d = official_record(r["codigo"])
        if d is None:
            return {**r, "outcome": "source_unreachable"}
        s = sourced_strings(d)
        try:
            v = judge(client, r["name"] or "", s)
        except Exception as e:  # noqa: BLE001 - recorded, never silently dropped
            return {**r, "outcome": "judge_failed", "note": str(e)[:200]}
        if not v.get("names_the_legal_act"):
            return {**r, "outcome": "already_names_object", "note": v.get("note", "")}
        proposed = " ".join((v.get("applicable_object") or "").split()).strip(" .,;:-")
        if proposed:
            ok, missing = is_grounded(proposed, s)
            if not ok:
                return {**r, "outcome": "rejected_ungrounded",
                        "proposed": proposed, "note": "not in record: " + ", ".join(sorted(missing))}
            return {**r, "outcome": "extracted", "new_name": proposed[:400],
                    "new_name_source": "programme_feed",
                    "name_basis": "register_object_clause; fields=" + (v.get("source_fields") or "descripcion"),
                    "note": v.get("note", "")}
        name, basis = compose(s)
        if not name:
            return {**r, "outcome": "no_name_available", "note": v.get("note", "")}
        return {**r, "outcome": "composed", "new_name": name[:400],
                "new_name_source": "deterministic", "name_basis": basis,
                "note": v.get("note", "")}

    out: list[dict] = []
    with _cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for i, res in enumerate(ex.map(one, rows), 1):
            out.append(res)
            if i % 20 == 0:
                print(f"  [{i}/{len(rows)}]", flush=True)
    return out


def report(results: list[dict]) -> None:
    from collections import Counter
    c = Counter(r["outcome"] for r in results)
    print(f"\n{len(results)} rows\n")
    for k, v in c.most_common():
        print(f"  {k:22} {v}")
    changed = [r for r in results if r.get("new_name")]
    print(f"\n{len(changed)} names would change\n")
    for r in changed[:200]:
        print(f"  {r['id'][:30]:30}")
        print(f"    was: {(r['name'] or '')[:110]}")
        print(f"    now: {r['new_name'][:110]}   [{r['new_name_source']}]")
    for r in results:
        if r["outcome"] in ("rejected_ungrounded", "source_unreachable",
                            "judge_failed", "no_name_available"):
            print(f"\n  !! {r['outcome']}  {r['id'][:40]}  {r.get('note','')[:160]}")


# ── Writes ─────────────────────────────────────────────────────────────────

def ensure_columns() -> None:
    """`name_basis` in both stores. A plain ADD COLUMN in each -- deliberately
    NOT a `name_source` vocabulary change, which SQLite can only do by
    rebuilding the table, and rebuilding a table several agents are writing is
    a bigger risk than this column solves. The two existing values already say
    the true thing: `programme_feed` is what the feed carries, `deterministic`
    is composed by us. `name_basis` says which fields and by what method."""
    conn = sqlite3.connect(DB)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(funding_instruments)")}
    if "name_basis" not in cols:
        conn.execute("ALTER TABLE funding_instruments ADD COLUMN name_basis TEXT")
        conn.commit()
        print("SQLite: added funding_instruments.name_basis")
    conn.close()
    with pg_conn() as c:
        c.execute("ALTER TABLE funding_instruments ADD COLUMN IF NOT EXISTS name_basis TEXT")
        c.commit()
    print("Postgres: name_basis present")


def write(results: list[dict]) -> int:
    rows = [r for r in results if r.get("new_name")]
    conn = sqlite3.connect(DB)
    for r in rows:
        conn.execute(
            "UPDATE funding_instruments SET name=?, name_source=?, name_basis=?, "
            "updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (r["new_name"], r["new_name_source"], r["name_basis"], r["id"]))
    conn.commit()
    conn.close()
    print(f"SQLite: {len(rows)} names updated")

    with pg_conn() as c:
        for r in rows:
            c.execute("UPDATE funding_instruments SET name=%s, name_source=%s, "
                      "name_basis=%s, updated_at=NOW() WHERE id=%s",
                      (r["new_name"], r["new_name_source"], r["name_basis"], r["id"]))
        c.commit()
    print(f"Postgres: {len(rows)} names updated")
    return len(rows)


def reconcile(results: list[dict]) -> None:
    """Read every changed name back OUT of Postgres and compare to SQLite.

    The SQLite/Postgres split has half-destroyed three pieces of work this week;
    a run that reports success without checking the store the product reads is
    the exact shape of that failure.
    """
    rows = [r for r in results if r.get("new_name")]
    if not rows:
        print("nothing to reconcile")
        return
    ids = [r["id"] for r in rows]
    with pg_conn() as c:
        pg = dict(c.execute("SELECT id, name FROM funding_instruments WHERE id = ANY(%s)",
                            (ids,)).fetchall())
    conn = sqlite3.connect(DB)
    q = ",".join("?" * len(ids))
    lite = dict(conn.execute(f"SELECT id, name FROM funding_instruments WHERE id IN ({q})", ids))
    conn.close()
    bad = [i for i in ids if pg.get(i) != lite.get(i) or pg.get(i) is None]
    if bad:
        raise SystemExit(f"RECONCILE FAILED: {len(bad)} rows differ between stores, e.g. {bad[:5]}")
    print(f"reconciled: {len(ids)}/{len(ids)} names identical in SQLite and Postgres")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", default="ES")
    ap.add_argument("--verify-source", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--out", help="write the per-row decisions to this JSON path")
    a = ap.parse_args()

    if a.verify_source:
        verify_source(a.country, a.limit or 10_000)
        return
    results = build(a.country, a.limit, a.workers)
    report(results)
    if a.out:
        _Path(a.out).write_text(json.dumps(results, ensure_ascii=False, indent=1))
        print(f"\ndecisions -> {a.out}")
    if a.write:
        ensure_columns()
        write(results)
        reconcile(results)
    else:
        print("\n[report only] --write to apply")


if __name__ == "__main__":
    main()
