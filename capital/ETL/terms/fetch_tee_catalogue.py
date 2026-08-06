"""France's ADEME schemes, from the one catalogue that is not behind Cloudflare.

── The finding this exists to ship ────────────────────────────────────────
France's sibling problem is one regime. Of the 5,811 sibling-pairs a French
founder faces across 128 multi-leaf leaves, `ademe_aid` accounts for 5,776 --
**99.4%**. Its 76 leaves carry identical `administering_body` ("ADEME (France)"),
no `delivery_region` and no `eligibility_text`, so they form one undivided class
of 76. Everything else in France is already close to distinguishable: giving all
26 SATR leaves perfect text moves the French mean class from 45.4 to 44.4.

So this script targets ADEME and nothing else, because nothing else moves.

── Why this source ────────────────────────────────────────────────────────
ADEME's own catalogue cannot be read: `agirpourlatransition.ademe.fr` and
`www.ademe.fr` both return HTTP 403 behind a Cloudflare interstitial, on the
API path, on content paths and on `sitemap.xml`. Per the standing rule that is
where we stop -- the source is skipped and recorded, not impersonated past.

Three further French routes were tried and are dead ends, recorded here so they
are not tried again:

  aides-territoires.beta.gouv.fr/api/aids/  401, JWT from interactive signup
  data.ademe.fr Opendatasoft API            wrong stack; it is Data-Fair
  data.ademe.fr `data_aides_themes`         award-grain, no scheme catalogue
  ademe_aides.csv `conditionsVersement`     two values, "Echelonné"/"Unique"

What does work is a third-party republisher: the French state startup
*Transition Écologique des Entreprises* publishes its full catalogue as open
data on data.gouv.fr, 223 dispositifs of which 107 are ADEME's. It carries the
field we need -- `eligibilite`, free text stating sector, headcount, region and
scheme-specific conditions -- and it discriminates: 95 distinct values across
107 ADEME schemes, 94 distinct within the first 400 characters.

The resource URL is resolved through the data.gouv.fr dataset API rather than
pinned, because the CSV is republished at a new dated path on every update and
a pinned link silently rots into a 404.

── Why the match needs a model ────────────────────────────────────────────
Our leaf names are ADEME's internal `dispositifAide` labels from the award file
("Fonds Économie Circulaire - ORMAT 2024 (Objectif Recyclage MATières)"); the
catalogue uses portal titles ("ORMAT"). A tuned idf/containment scorer gets 39
of 75 at acceptable precision and then stops improving: the residue is not
noisy strings, it is knowledge -- that ORMAT is the Objectif Recyclage MATières
scheme, that "Industrie Zéro Fossile Volet 3 (DECARB FLASH)" and "Decarb Flash
2025-2027" are one scheme, that "Tremplin pour la transition écologique des
PME" is "Tremplin" and NOT "CAP Transition Ecologique". That is a judgement
call, so the scorer is used for recall only -- it proposes a shortlist -- and a
model adjudicates, with NONE always available and preferred over a guess.

A wrong match writes a wrong eligibility text onto a real fund, which is worse
than no text. So the model returns its own confidence, and anything it does not
call a confident match is emitted `found: false` with the reason.

── What is claimed and what is not ────────────────────────────────────────
`eligibility_text` is the catalogue's `eligibilite` verbatim, plus the eligible
geography and the application window as the catalogue states them. Nothing is
inferred or translated.

`eligibility_source_url` points at the catalogue entry (`url_source`), not at
ADEME -- the claim is "TEE's catalogue says this", which is what we can stand
behind. `eligibility_confidence` grades the MATCH, since a perfectly fetched
text on the wrong scheme is the failure mode that matters here.

The catalogue's geography is NOT written to `delivery_region`. That column
means "where the recipients we observed actually are" and carries
`delivery_region_share`; the catalogue states where an applicant may be, which
is a different claim, and it belongs in the text.

── Active only ────────────────────────────────────────────────────────────
`date_cloture` decides. Schemes with a closing date in the past are emitted
`status: closed` and the loader drops them. Many ADEME leaves are one-off
appels à projets from 2021-2023 (AVELO 2, ORPLAST 3, ESPR volet 2) which are
correctly absent from a catalogue of currently-open aid, and are recorded as
unmatched rather than forced onto a live scheme that merely sounds similar.

Usage:
  python3 ETL/terms/fetch_tee_catalogue.py --refresh     # pull the CSV
  python3 ETL/terms/fetch_tee_catalogue.py --shortlist   # scorer only, no model
  python3 ETL/terms/fetch_tee_catalogue.py --run [--limit N]
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
import collections  # noqa: E402
import csv  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import math  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
import unicodedata  # noqa: E402

from ndb_ssl import fetch_bytes, fetch_json  # noqa: E402

RAW = ROOT / "data" / "raw" / "tee_aides"
CSV_PATH = RAW / "aides_tee.csv"
OUT = ROOT / "data" / "raw" / "scheme_enrichment" / "found_FR_tee.json"
DATASET = "catalogue-des-dispositifs-daides-a-la-transition-ecologique-pour-les-entreprises"
DATAGOUV = "https://www.data.gouv.fr/api/1/datasets/" + DATASET + "/"

# The regime this catalogue can speak for. An input to a fetch job, not a
# branch in scoring logic: the catalogue is ADEME's, so the job is ADEME's.
REGIME = "ademe_aid"
MODEL = "claude-sonnet-5"
SHORTLIST_N = 6

STOP = set("""aide aides appel appels projet projets soutien soutenir financement financer financez
etude etudes pour des de la le les en aux au une dans sur par avec vos votre
programme dispositif nationale national france realisez beneficiez volet releve""".split())


def norm_tokens(s: str) -> list[str]:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return [t for t in re.split(r"[^a-z0-9]+", s.lower()) if len(t) > 2 and t not in STOP]


# ── source ────────────────────────────────────────────────────────────────

def refresh() -> None:
    """Resolve today's CSV URL through the dataset API, then download it."""
    RAW.mkdir(parents=True, exist_ok=True)
    # ndb_ssl, not bare urllib: macOS Python ships no system root bundle and
    # data.gouv.fr fails certificate verification without certifi.
    meta = fetch_json(DATAGOUV, timeout=60) or {}
    res = [x for x in meta.get("resources", []) if (x.get("format") or "").lower() == "csv"]
    if not res:
        raise SystemExit("no CSV resource on the data.gouv.fr dataset")
    url = res[0]["url"]
    body = fetch_bytes(url, timeout=180)
    if not body:
        raise SystemExit(f"could not download {url}")
    CSV_PATH.write_bytes(body)
    print(f"{CSV_PATH}  <- {url}\n  dataset last updated {meta.get('last_update')}")


def catalogue() -> list[dict]:
    csv.field_size_limit(10 ** 7)
    with CSV_PATH.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ── shortlist ─────────────────────────────────────────────────────────────

def build_scorer(rows: list[dict]):
    cat = [(set(norm_tokens(r["titre"] + " " + r.get("promesse", ""))),
            set(norm_tokens(r["titre"])), r) for r in rows]
    df: collections.Counter = collections.Counter()
    for _, t, _ in cat:
        for w in t:
            df[w] += 1
    n = len(cat)

    def idf(w: str) -> float:
        return math.log(1 + n / (1 + df.get(w, 0)))

    def mass(s) -> float:
        return sum(idf(w) for w in s)

    def pair(a: set, b: set) -> float:
        inter = a & b
        if not inter:
            return 0.0
        # Containment in BOTH directions, not just from the leaf. A one-word
        # catalogue title ("Tremplin", "ORMAT") is fully contained in a long
        # leaf name and scores near zero on leaf-side containment alone --
        # which is exactly how the tuned scorer lost its clearest matches.
        return (0.5 * mass(inter) / max(mass(a | b), 1e-9)
                + 0.25 * mass(inter) / max(mass(a), 1e-9)
                + 0.25 * mass(inter) / max(mass(b), 1e-9))

    def shortlist(name: str) -> list[tuple[float, dict]]:
        a = set(norm_tokens(name))
        out = []
        for wide, title, r in cat:
            s = max(pair(a, title), 0.9 * pair(a, wide))
            if s > 0:
                out.append((s, r))
        out.sort(key=lambda x: -x[0])
        return out[:SHORTLIST_N]

    return shortlist


# ── adjudication ──────────────────────────────────────────────────────────

SYSTEM = """You match a French public funding scheme, as it is labelled in ADEME's own
grant-award file, to the right entry in a catalogue of currently available French aid schemes.

You are given one scheme label and a numbered shortlist of candidate catalogue entries.
Choose the candidate that is the SAME scheme, or none of them.

Judge on scheme identity, not string similarity:
- An internal label and a portal title often differ entirely. "ORMAT" and "Fonds Economie
  Circulaire - ORMAT 2024 (Objectif Recyclage MATieres)" are the same scheme.
- A year, wave, "volet", "releve" or "phase" suffix does not make a different scheme.
- Schemes that merely share a theme are DIFFERENT. A generic "transition ecologique"
  support programme is not the same scheme as a specific named one.
- One-off appels a projets from past years frequently have no catalogue entry at all,
  because the catalogue lists aid a company can apply for now. That is a normal result.

Return NONE whenever you are not confident. A wrong match puts the wrong eligibility
rules on a real fund, which is worse for a founder than no rules at all.

confidence:
  high    the same scheme beyond reasonable doubt
  medium  very likely the same scheme, minor unresolved ambiguity
  none    no candidate is this scheme, or you cannot tell"""

SCHEMA = {
    "type": "object",
    "properties": {
        "choice": {"type": "integer",
                   "description": "1-based index into the shortlist, or 0 for none"},
        "confidence": {"type": "string", "enum": ["high", "medium", "none"]},
        "reason": {"type": "string", "description": "one short sentence"},
    },
    "required": ["choice", "confidence", "reason"],
    "additionalProperties": False,
}


def user_prompt(name: str, cands: list[tuple[float, dict]]) -> str:
    lines = [f"Scheme label from ADEME's award file: {name}", "", "Shortlist:"]
    for i, (_, r) in enumerate(cands, 1):
        lines.append(f"{i}. {r['titre']} — {r.get('promesse', '')[:140]}")
    lines.append("0. NONE of these is this scheme")
    return "\n".join(lines)


def adjudicate(client, name: str, cands: list[tuple[float, dict]]) -> dict:
    msg = client.messages.create(
        model=MODEL, max_tokens=300, thinking={"type": "disabled"},
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": user_prompt(name, cands)}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    try:
        return json.loads(text)
    except Exception:
        return {"choice": 0, "confidence": "none", "reason": "unparseable model output"}


# ── composition ───────────────────────────────────────────────────────────

def status_of(rec: dict) -> str:
    close = (rec.get("date_cloture") or "").strip()
    if not close:
        return "open"
    try:
        return "open" if dt.date.fromisoformat(close[:10]) >= dt.date.today() else "closed"
    except ValueError:
        return "open"


def compose(rec: dict) -> str:
    parts = [(rec.get("eligibilite") or "").strip()]
    geo = (rec.get("eligibilite_geographique") or "").strip()
    exc = (rec.get("eligibilite_geographique_exclusions") or "").strip()
    if geo:
        parts.append(f"Périmètre géographique (codes catalogue) : {geo}.")
    if exc:
        parts.append(f"Exclusions géographiques : {exc}.")
    o, c = (rec.get("date_ouverture") or "")[:10], (rec.get("date_cloture") or "")[:10]
    if o or c:
        parts.append(f"Fenêtre de candidature : {o or 'n/d'} à {c or 'sans date de clôture'}.")
    return " ".join(p for p in parts if p).strip()


def body_of(rec: dict) -> str | None:
    try:
        p = json.loads(rec.get("porteurs") or "[]")
    except Exception:
        return None
    names = [x.get("nom") for x in p if x.get("nom")]
    return "; ".join(names) or None


# ── driver ────────────────────────────────────────────────────────────────

def leaves(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return list(conn.execute("""
        SELECT id, name, last_year, event_count
          FROM funding_instruments
         WHERE parent_id = ?
           AND COALESCE(LENGTH(TRIM(eligibility_text)), 0) <= 40
         ORDER BY event_count DESC
    """, (REGIME,)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--shortlist", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    if args.refresh:
        refresh()
        return
    if not CSV_PATH.exists():
        raise SystemExit(f"{CSV_PATH} missing -- run --refresh first")

    rows = catalogue()
    shortlist = build_scorer(rows)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    work = leaves(conn)
    if args.limit:
        work = work[:args.limit]
    print(f"catalogue {len(rows)} dispositifs; {len(work)} '{REGIME}' leaves awaiting text")

    if args.shortlist:
        for r in work:
            c = shortlist(r["name"])
            head = f"{c[0][0]:.2f} {c[0][1]['titre'][:46]}" if c else "-- no candidate"
            print(f"  {r['name'][:52]:54} {head}")
        return
    if not args.run:
        print("[report only] --run to adjudicate and write")
        return

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY not set (checked env + .env.local)")
    import anthropic
    client = anthropic.Anthropic()

    out: list[dict] = []
    if OUT.exists():
        try:
            out = json.loads(OUT.read_text())
        except Exception:
            out = []
    done = {r.get("instrument_id") for r in out}

    stats: collections.Counter = collections.Counter()
    for i, r in enumerate(work, 1):
        if r["id"] in done:
            stats["skip"] += 1
            continue
        cands = shortlist(r["name"])
        rec: dict = {"instrument_id": r["id"], "doc_level": "aid_catalogue",
                     "language": "fr", "sa_number": None}
        if not cands:
            rec.update(found=False, status="not_found", confidence=None,
                       note="no catalogue candidate shares any distinctive term")
            stats["nocand"] += 1
        else:
            v = adjudicate(client, r["name"], cands)
            idx, conf = int(v.get("choice") or 0), v.get("confidence")
            if idx < 1 or idx > len(cands) or conf == "none":
                rec.update(found=False, status="not_found", confidence=None,
                           note=f"model declined: {v.get('reason', '')[:180]}")
                stats["declined"] += 1
            else:
                m = cands[idx - 1][1]
                st = status_of(m)
                rec.update(
                    found=True, status=st, confidence=conf,
                    eligibility_text=compose(m),
                    description=(m.get("description") or "").strip() or None,
                    scheme_url=m.get("url_source"), source_url=m.get("url_source"),
                    eligibility_source_url=m.get("url_source"),
                    administering_body=body_of(m),
                    match_basis=f"TEE catalogue '{m['titre']}' (id {m['id']}), "
                                f"scorer {cands[idx - 1][0]:.2f}, model {conf}",
                    note=v.get("reason", "")[:200],
                )
                stats[st] += 1
        out.append(rec)
        OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))  # write as it lands
        print(f"  [{i}/{len(work)}] {rec.get('status'):>10} {str(rec.get('confidence')):>6}  "
              f"{r['name'][:44]:46} {rec.get('match_basis', rec.get('note', ''))[:52]}")

    print(f"\n{OUT}\n  " + "  ".join(f"{k}={v}" for k, v in stats.most_common()))


if __name__ == "__main__":
    main()
