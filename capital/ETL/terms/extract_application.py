"""Fill the missing application routes: how you apply, by when, and where.

── The gap ────────────────────────────────────────────────────────────────
"How do I approach this?" is the axis the corpus is weakest on. The extractor
that built the curated eligibility layer captured gates and, for 18 records,
never captured the route beside them — including satr_de_rnd, whose regime
document covers 102 publishable children on its own.

That leverage is the whole reason this is worth a separate pass: routes
inherit. A founder facing a German R&D scheme does not need that scheme's own
portal invented for them, they need the regime's real procedure, and one
document answers it for a hundred rows.

── Same discipline as the gates ───────────────────────────────────────────
A route is an INSTRUCTION. A founder acts on it, so a plausible-sounding
procedure is worse than none at all. Every field must come with a verbatim
quote from the source document, and the quote is checked mechanically against
the document text before anything is written. No LLM can fake that check.

Where the document does not actually say how to apply, we record nothing and
the row keeps saying so. That is the honest state and the product already
handles it.

Usage:
  python3 ETL/terms/extract_application.py status
  python3 ETL/terms/extract_application.py run [--limit N] [--dry-run]
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402

import sqlite3  # noqa: E402

import anthropic  # noqa: E402
import yaml  # noqa: E402

from etl_env import DB  # noqa: E402

from extract_terms import DOCS, TERMS, _norm, load_doc, target_pages  # noqa: E402

MODEL = "claude-sonnet-5"

# Words that appear near a real application procedure, in the languages the
# corpus is written in. A prefilter for which pages to send, never the
# decision: the model reads the pages and decides whether a procedure is
# actually stated.
KEYWORDS = [
    "application", "apply", "submit", "deadline", "call for", "procedure",
    "antrag", "antragstellung", "frist", "einreich",
    "demande", "dossier", "candidature", "depot", "delai",
    "solicitud", "convocatoria", "presentar", "plazo",
    "domanda", "presentazione", "bando", "termine",
    "aanvraag", "indienen", "ansøgning", "ansokan", "hakemus",
    "pieteikum", "iesniedz", "zadost", "podani",
]

SCHEMA = {
    "type": "object",
    "properties": {
        "states_procedure": {"type": "boolean"},
        "channel": {"type": "string"},
        "typical_timeline": {"type": "string"},
        "url": {"type": "string"},
        "quote": {"type": "string"},
        "locator": {"type": "string"},
    },
    "required": ["states_procedure", "channel", "typical_timeline", "url",
                 "quote", "locator"],
    "additionalProperties": False,
}

PROMPT = """You are reading the governing document for a public funding scheme.

Extract HOW AN APPLICANT APPLIES, and nothing else.

  states_procedure  true only if this document actually describes how to apply.
                    Eligibility rules, aid intensities and definitions are NOT
                    a procedure. If it does not say how to apply, return false
                    and leave the other fields empty.
  channel           one or two sentences: what the applicant physically does,
                    and to whom. Write it as an instruction a founder could
                    follow, in plain English, whatever language the source is.
  typical_timeline  deadlines, windows, or how long a decision takes. Empty
                    string if the document does not say.
  url               an application URL, ONLY if one appears in the document.
                    Empty string otherwise. Never construct or guess one.
  quote             a VERBATIM span from the text below that states the
                    procedure. Copy it exactly, in the source language. This is
                    checked character by character against the document; an
                    approximation will be rejected and the whole record
                    discarded.
  locator           the page or chunk label given below where the quote sits.

A founder acts on this, so a plausible-sounding procedure is worse than no
procedure. When in doubt, return states_procedure false."""


def client() -> anthropic.Anthropic:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise SystemExit("ANTHROPIC_API_KEY not set")
    return anthropic.Anthropic(api_key=key)


def shown_to_founders() -> set[str]:
    """Records worth a call: publishable themselves, or a parent of one.

    Routes inherit, so a regime that nobody can apply to directly is still
    worth extracting when children hang off it — satr_de_rnd is not publishable
    and answers the question for 102 rows that are.

    The inverse matters more. The EU reference records (the GBER, the de
    minimis regulation, the IPCEI communication) are not schemes anyone applies
    to, and asking a regulation how to apply gets you its boilerplate condition
    of aid: "the beneficiary must submit a written application to the Member
    State". True, useless, and indistinguishable from a real route once it is
    sitting in the route field. Three records came back with exactly that
    sentence before this guard existed.
    """
    conn = sqlite3.connect(DB)
    rows = conn.execute(
        "SELECT id, parent_id, is_framework FROM funding_instruments").fetchall()
    conn.close()
    parents = {p for _, p, _ in rows if p}
    publishable = {i for i, _, fw in rows if not fw and i not in parents}
    has_pub_child = {p for i, p, _ in rows if p and i in publishable}
    return publishable | has_pub_child


def needs_route() -> list[tuple[str, dict, str]]:
    """(record_id, record, source_file) for records with gates but no route."""
    eligible = shown_to_founders()
    out = []
    for path in sorted(TERMS.glob("*.yaml")):
        rec = yaml.safe_load(path.read_text()) or {}
        app = rec.get("application")
        if isinstance(app, dict) and (app.get("channel") or app.get("url")):
            continue
        files = [(g.get("source") or {}).get("file")
                 for g in (rec.get("gates") or []) if isinstance(g, dict)]
        files = [f for f in files if f and (DOCS / f).exists()]
        if not files or path.stem not in eligible:
            continue
        # The document most of this record's gates were read from.
        best = max(set(files), key=files.count)
        out.append((path.stem, rec, best))
    return out


def cmd_status(_args) -> None:
    todo = needs_route()
    print(f"records with gates but no application route, source doc on disk: {len(todo)}")
    for rid, _, doc in todo:
        print(f"  {rid:32} {doc[:56]}")


def cmd_run(args) -> None:
    todo = needs_route()
    if args.limit:
        todo = todo[: args.limit]
    print(f"extracting application routes for {len(todo)} records ({MODEL})")
    cl = client()
    written = refused = failed = 0

    for rid, rec, doc in todo:
        pages = load_doc(doc)
        picked = target_pages(pages, KEYWORDS, cap_chars=45000)
        if not picked:
            refused += 1
            print(f"  {rid}: no page mentions an application procedure")
            continue
        body = "\n\n".join(f"[{loc}]\n{text}" for loc, text in picked)
        res = cl.messages.create(
            model=MODEL, max_tokens=1500, thinking={"type": "disabled"},
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": f"{PROMPT}\n\n{body}"}])
        out = json.loads("".join(b.text for b in res.content if b.type == "text"))

        if not out.get("states_procedure") or not out.get("channel"):
            refused += 1
            print(f"  {rid}: document does not state a procedure")
            continue

        # MECHANICAL check. The quote must really be in the document.
        quote = (out.get("quote") or "").strip()
        doc_norm = _norm("\n".join(t for _, t in pages))
        if not quote or _norm(quote) not in doc_norm:
            failed += 1
            print(f"  {rid}: quote not found verbatim in the document - discarded")
            continue

        if args.dry_run:
            print(f"  {rid}: {out['channel'][:88]}")
            written += 1
            continue

        path = TERMS / f"{rid}.yaml"
        rec["application"] = {
            "channel": out["channel"].strip(),
            "typical_timeline": (out.get("typical_timeline") or "").strip(),
            "url": (out.get("url") or "").strip(),
            "quote": quote,
            "source": {"file": doc, "locator": (out.get("locator") or "").strip()},
        }
        path.write_text(yaml.safe_dump(rec, allow_unicode=True, sort_keys=False))
        written += 1
        print(f"  {rid}: {out['channel'][:88]}")

    print(f"done: {written} routes written, {refused} documents state none, "
          f"{failed} discarded on the quote check")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    r = sub.add_parser("run")
    r.add_argument("--limit", type=int, default=0)
    r.add_argument("--dry-run", action="store_true")
    r.set_defaults(fn=cmd_run)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
