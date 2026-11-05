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

── A name this file's own pass cannot reach ───────────────────────────────
`build()` is BDNS-shaped: it needs a `codigoBDNS` to fetch an official record
with, and a funder that publishes its own name in a column of a CC0 CSV has no
such code. But `write` and `reconcile` are register-agnostic -- they are the
only DUAL-STORE name writer in this repo, and the only alternative,
`populate_funding_instruments.py`, rebuilds the entire instruments table to
change eight names.

So `--from-jsonl` takes the decisions from a sourced file instead of from the
pass, and everything downstream is the same code: the same collision refusal,
the same two writes, the same read-back out of Postgres. What the file has to
supply is what `build()` supplies -- and it must supply the PROVENANCE too:
every line names the source FIELD and the URL it is published at, because a
name derived from our own columns is the error Rule Zero names, and a file
format that lets one through would reintroduce it by the back door.

Usage:
  python3 ETL/terms/name_applicable_object.py --verify-source --country ES
  python3 ETL/terms/name_applicable_object.py --country ES --report
  python3 ETL/terms/name_applicable_object.py --country ES --write
  python3 ETL/terms/name_applicable_object.py --from-jsonl <path> --report
  python3 ETL/terms/name_applicable_object.py --from-jsonl <path> --write
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import concurrent.futures as _cf  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
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

KEEP WHAT DISTINGUISHES. A register commonly publishes several calls that share \
one programme name and differ only by a qualifier -- a sub-line, an aid regime, \
an eligible sector, an annex, an ordinal. That qualifier is the only thing \
telling one fund from its neighbour, so carry it into the name whenever the \
current name or the record states one. Shortening is never worth making two \
funds indistinguishable.

HARD CONSTRAINT. You may only REUSE words that appear in the RECORD below. Do \
not translate, expand an acronym, paraphrase, or add any word of your own \
beyond ordinary connectives. Reordering, dropping words, changing letter case \
and cutting a span are allowed. If no span of the record names a recognisable \
object, set applicable_object to the empty string and say so in `note` -- an \
empty answer is correct and useful, an invented one is not.

Answer in the record's own language, in ordinary sentence case: registers \
publish in block capitals and that is typography, not the name. Never return a \
name that is only a body, only a policy area, or only a date."""

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

def sentence_case(s: str) -> str:
    """Upper-case the first letter and nothing else.

    Registers publish in block capitals and mid-sentence lower case alike; both
    are typography, not the fund's name. Only the leading character is touched,
    because any further re-casing would be a claim about which words are proper
    nouns and this file does not get to make claims about the fund.
    """
    s = s.strip()
    return (s[0].upper() + s[1:]) if s else s


def drop_collisions(results: list[dict]) -> None:
    """Refuse a rename that makes two funds indistinguishable.

    Shortening a citation to its programme name is right until two calls under
    one programme differ only in the clause being cut -- then the founder gets
    two identical rows, which is a worse defect than the one being fixed and is
    exactly what the sibling-class measure exists to catch. So the test is
    comparative, not absolute: a proposed name may collide only where the names
    it replaces already collided. Anything else keeps its old name and is
    reported, because a visible unfixed row beats a silently merged pair.
    """
    by_new: dict[str, list[dict]] = {}
    for r in results:
        if r.get("new_name"):
            by_new.setdefault(_fold(r["new_name"]), []).append(r)
    for _, group in by_new.items():
        if len(group) < 2:
            continue
        if len({_fold(r["name"] or "") for r in group}) == 1:
            continue  # already indistinguishable; this rename did not cause it
        for r in group:
            r["outcome"] = "reverted_collision"
            r["note"] = (f"would share a name with {len(group) - 1} other row(s) whose "
                         f"current names differ: {r.pop('new_name')[:80]}")
            r.pop("new_name_source", None)
            r.pop("name_basis", None)


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

def pg_conn(readonly: bool = False):
    """The store (schema `capital`). Commits on clean exit of the `with`."""
    from store import connect  # noqa: PLC0415
    return connect(readonly=readonly)


def candidates(country: str) -> list[dict]:
    """Rows the product can offer in this country that carry a BDNS code.

    Read out of Postgres because Postgres is what the product reads. The BDNS
    code is what makes the official record reachable; a row without one cannot
    be re-sourced and is reported rather than guessed at.
    """
    with pg_conn(readonly=True) as c:
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
            proposed = sentence_case(proposed)
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
    drop_collisions(out)
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
                            "judge_failed", "no_name_available", "reverted_collision"):
            print(f"\n  !! {r['outcome']}  {r['id'][:40]}  {r.get('note','')[:160]}")


# ── A sourced decision file, for a class the pass cannot reach ─────────────

DECISION_FIELDS = ("id", "current_name", "new_name", "new_name_source",
                   "name_basis", "source_field", "source_url")


def from_jsonl(path: _Path) -> list[dict]:
    """Decisions written by hand against a funder's own file, not by the pass.

    Shaped exactly like `build()`'s output so `drop_collisions`, `report`,
    `write` and `reconcile` do not learn a second format -- `name` is the name
    the row holds now, `new_name` the one it should hold.

    Four things are REFUSED rather than defaulted, and each of them is a way a
    name could arrive unsourced:

      a missing field        `source_field` and `source_url` say where the name
                             came from. A decision file without them is a table
                             of strings, which is what this module exists to
                             not be.
      `applied: false`       PREPARED IS NOT AUTHORISED. The same flag
                             `check_corrections_applied.py` reads, refusing the
                             same way `apply_gate_encoding_corrections.py`
                             refuses -- otherwise the marker would mean "not
                             enforced" to one tool and nothing at all to the
                             tool that does the writing.
      a duplicate id         two lines disagreeing about one row is
                             unresolvable, and last-line-wins would make the
                             name depend on file order.
      `new_name` == body     a row named exactly after the body that grants it
                             carries nothing `administering_body` does not
                             already carry. That is `check_body_named_rows`'s
                             property and this is the write that could
                             reintroduce it.
    """
    rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    if not rows:
        raise SystemExit(f"{path}: no decisions")

    missing = [f"{r.get('id', '?')}: missing {k}"
               for r in rows for k in DECISION_FIELDS if not r.get(k)]
    if missing:
        raise SystemExit("REFUSED — decisions are not fully sourced:\n  "
                         + "\n  ".join(missing))

    unapproved = [r["id"] for r in rows if r.get("applied") is False]
    if unapproved:
        raise SystemExit(
            f'REFUSED — {len(unapproved)} line(s) are marked "applied": false, i.e.\n'
            "  prepared and awaiting authorisation:\n  " + "\n  ".join(unapproved)
            + "\n\n  Remove the flag from the evidence line once the write is approved.\n"
              "  Nothing was read from either store.")

    seen: set[str] = set()
    dupes = [r["id"] for r in rows if r["id"] in seen or seen.add(r["id"])]
    if dupes:
        raise SystemExit(f"REFUSED — duplicate ids in {path.name}: {sorted(set(dupes))}")

    return [{"id": r["id"], "name": r["current_name"], "new_name": r["new_name"],
             "new_name_source": r["new_name_source"],
             "name_basis": f"{r['name_basis']}; field={r['source_field']}; "
                           f"source={r['source_url']}",
             "outcome": "sourced_file"} for r in rows]


def held_names(ids: list[str]) -> dict[str, dict[str, str | None]]:
    """What the store holds for these rows TODAY, and the body that grants them."""
    out = {i: {"name": None, "body": None} for i in ids}
    with pg_conn(readonly=True) as c:
        for iid, name, body in c.execute(
                "SELECT id, name, administering_body FROM funding_instruments "
                "WHERE id = ANY(%s)", (ids,)).fetchall():
            out[iid]["name"], out[iid]["body"] = name, body
    return out


def check_preconditions(results: list[dict]) -> bool:
    """Refuse the file if the corpus has moved under any line of it.

    ALREADY IS NOT DRIFT, for the reason `apply_gate_encoding_corrections.py`
    gives: a row that already holds the proposed name has arrived where the
    decision was taking it, by some other route. It is named and skipped.

    A partial write is refused outright rather than applied to the rows that
    still match, because a half-applied set leaves nothing recording which half
    is which.
    """
    ids = [r["id"] for r in results]
    held = held_names(ids)
    drift, already, absent = [], [], []
    for r in results:
        h = held[r["id"]]
        if h["name"] is None:
            absent.append(f"{r['id']}: not in the store")
            continue
        if h["body"] and _fold(r["new_name"]) == _fold(h["body"]):
            drift.append(f"{r['id']}: proposed name is exactly its administering_body "
                         f"({h['body']!r}) — see check_body_named_rows")
            continue
        if _fold(h["name"]) == _fold(r["new_name"]):
            already.append(r["id"])
        elif _fold(h["name"]) != _fold(r["name"]):
            drift.append(f"{r['id']}: now holds {h['name']!r}, the decision "
                         f"was written against {r['name']!r}")
    print(f"\npreconditions: {len(results)} decisions, {len(drift)} drifted, "
          f"{len(already)} already applied, {len(absent)} absent")
    for a in already:
        print(f"  ALREADY  {a}")
    for a in absent:
        print(f"  ABSENT   {a}")
    if drift or absent:
        print("\nREFUSED — nothing written. Re-derive the decisions against\n"
              "  the current corpus rather than applying a partial set.")
        return False
    return True


# ── Writes ─────────────────────────────────────────────────────────────────
# `name_basis` is in the schema (postgres_schema.sql); this file no longer adds
# it on its way past.

def write(results: list[dict]) -> int:
    rows = [r for r in results if r.get("new_name")]
    with pg_conn() as c:
        for r in rows:
            c.execute("UPDATE funding_instruments SET name=%s, name_source=%s, "
                      "name_basis=%s, updated_at=NOW() WHERE id=%s",
                      (r["new_name"], r["new_name_source"], r["name_basis"], r["id"]))
    print(f"store: {len(rows)} names updated")
    return len(rows)


def reconcile(results: list[dict]) -> None:
    """Read every changed name back OUT of the store and compare to the decision.

    A run that reports success without reading back what the product reads is
    the shape of the failure this repo kept paying for while there were two
    stores; the read-back stays.
    """
    rows = [r for r in results if r.get("new_name")]
    if not rows:
        print("nothing to reconcile")
        return
    ids = [r["id"] for r in rows]
    with pg_conn(readonly=True) as c:
        held = dict(c.execute("SELECT id, name FROM funding_instruments WHERE id = ANY(%s)",
                              (ids,)).fetchall())
    bad = [r["id"] for r in rows if held.get(r["id"]) != r["new_name"]]
    if bad:
        raise SystemExit(f"RECONCILE FAILED: {len(bad)} rows do not hold the name "
                         f"just written, e.g. {bad[:5]}")
    print(f"reconciled: {len(ids)}/{len(ids)} names read back as written")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", default="ES")
    ap.add_argument("--from-jsonl", metavar="PATH",
                    help="take the decisions from a sourced JSONL instead of "
                         "running the BDNS pass. One file per workstream, so a "
                         "name keeps the evidence it was derived with.")
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
    if a.from_jsonl:
        path = _Path(a.from_jsonl)
        if not path.is_absolute():
            path = ROOT / path
        results = from_jsonl(path)
        print(f"decisions: {path}")
        drop_collisions(results)
        report(results)
        if not check_preconditions(results):
            raise SystemExit(1)
    else:
        results = build(a.country, a.limit, a.workers)
        report(results)
    if a.out:
        _Path(a.out).write_text(json.dumps(results, ensure_ascii=False, indent=1))
        print(f"\ndecisions -> {a.out}")
    if a.write:
        write(results)
        reconcile(results)
    else:
        print("\n[report only] --write to apply")


if __name__ == "__main__":
    main()
