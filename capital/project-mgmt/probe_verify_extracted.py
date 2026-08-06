"""Verify extracted eligibility records before any of it reaches a database.

Four checks, in the order that a bad record fails them:

1. **MECHANICAL** -- every quote must appear verbatim in the `pdftotext -layout`
   output of the document the record names. Whitespace is normalised; nothing
   else is. No model can talk its way past this one, which is the whole reason
   it runs first.
2. **SHAPE** -- length bounds, and a hard refusal of any `scheme_end_date`. A
   fetch record's end date is a CALL deadline; written to that column it closes
   the row and unpublishes the instrument. Extraction agents must never supply
   one and this is where that is enforced rather than hoped for.
3. **SEPARATION** -- the point of the exercise. For each regime, every pair of
   drafted texts is scored for the share of sentences it does NOT share with a
   sibling, reusing `own_share()` from `harvest_quoted_eligibility.py` rather
   than restating it. A record that repeats what its sibling says has raised
   coverage and bought nothing.
4. **BOILERPLATE** -- the shared regime document is read too, and any sentence a
   record lifts from it is reported. The nine Pillar II clusters share the
   General Annexes by construction; a "discriminating condition" quoted out of
   the annexes is the same non-discovery in a better disguise.

  python3 project-mgmt/probe_verify_extracted.py data/manual_inbox/wsU_*.json
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

for _anc in Path(__file__).resolve().parents:
    if (_anc / "ETL" / "lib" / "etl_env.py").exists():
        sys.path.insert(0, str(_anc / "ETL" / "lib"))
        sys.path.insert(0, str(_anc / "ETL" / "terms"))
        break
from etl_env import DATA_RAW  # noqa: E402
from harvest_quoted_eligibility import own_share, sentences, norm  # noqa: E402

DOCS = Path(DATA_RAW) / "instrument_docs"
SHARED = "horizon_eu_general_annexes_2026_2027.pdf"
MIN_TEXT, MAX_TEXT = 400, 3500
MIN_OWN_SHARE = 0.50   # stricter than the harvest default: these are authored,
                       # not assembled, so there is no excuse for overlap.

_cache: dict[str, str] = {}


def doc_text(name: str) -> str:
    if name not in _cache:
        p = DOCS / name
        if not p.exists():
            _cache[name] = ""
        elif p.suffix.lower() == ".pdf":
            _cache[name] = subprocess.run(
                ["pdftotext", "-layout", str(p), "-"],
                capture_output=True, text=True).stdout
        else:
            _cache[name] = p.read_text(errors="replace")
    return _cache[name]


def flat(s: str) -> str:
    """Compare-normalise. Whitespace, quote/dash glyphs, and footnote markers.

    The footnote rule is the one that matters. `pdftotext` renders a superscript
    reference glued to the word it hangs off -- "Principal Investigators80 whose"
    -- so a quotation that reads naturally is never byte-equal to its source, and
    a checker without this rule rejects every honest quote from a footnoted PDF
    while catching nothing. Only digits fused to the END of a word are dropped,
    so "EUR 150 000" and "TRL 6-8" survive untouched.
    """
    s = re.sub(r"[“”„]", '"', s or "").replace("’", "'")
    s = re.sub(r"[–—]", "-", s)
    s = re.sub(r"(?<=[A-Za-z])\d{1,3}\b", "", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def quoted_spans(text: str) -> list[str]:
    """The spans a text presents as verbatim quotation.

    Split on the quote glyph and keep the odd pieces. Pairing with a regex looks
    equivalent and is not: `"A" and "B"` lets a greedy or even a lazy pattern
    match the GAP between two quotations, so the checker reports `" and "` as an
    unattested quote and buries the real failures under noise.
    """
    parts = re.split(r"[\"“”]", text or "")
    return [p for i, p in enumerate(parts) if i % 2 == 1 and len(p.strip()) >= 25]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--regime", action="append",
                    help="regime membership as PARENT=id,id,... (repeatable)")
    args = ap.parse_args()

    regime_of: dict[str, str] = {}
    for spec in args.regime or []:
        parent, ids = spec.split("=", 1)
        for i in ids.split(","):
            regime_of[i.strip()] = parent

    records: list[dict] = []
    for f in args.files:
        records.extend(json.loads(Path(f).read_text()))

    ok, bad = [], []
    for r in records:
        iid = r.get("instrument_id", "?")
        problems: list[str] = []

        if not r.get("found", True):
            print(f"{iid:<22} ABSTAINED by the extractor: {r.get('notes','')[:110]}")
            continue

        # 2. SHAPE first -- it is free.
        if "scheme_end_date" in r:
            problems.append("carries scheme_end_date, which would CLOSE the row")
        n = len((r.get("eligibility_text") or "").strip())
        if not (MIN_TEXT <= n <= MAX_TEXT):
            problems.append(f"eligibility_text {n} chars, outside {MIN_TEXT}-{MAX_TEXT}")
        if not (r.get("scheme_url") or "").startswith("http"):
            problems.append("no source URL")

        # 1. MECHANICAL.
        src = r.get("source_file") or ""
        text = flat(doc_text(src))
        if not text:
            problems.append(f"source document unreadable: {src!r}")
        else:
            missing = [q for q in (r.get("quotes") or [])
                       if flat(q.get("quote", "")) not in text]
            if not r.get("quotes"):
                problems.append("no quotes offered, so nothing is verifiable")
            for q in missing:
                problems.append(f"quote NOT in {src}: {flat(q.get('quote',''))[:90]!r}")

        # 1b. MECHANICAL, on the text that actually gets PUBLISHED. Checking the
        # `quotes` array is not enough: it verifies what the extractor claims to
        # have read, not what the column will show a founder. Any span the
        # eligibility_text puts inside double quotes is a claim that the document
        # says exactly that, so it is held to exactly the same bar. This is the
        # check that catches an editing pass -- including the coordinator's own
        # -- silently corrupting a quotation while tidying the prose around it.
        if text:
            for span in quoted_spans(r.get("eligibility_text") or ""):
                if flat(span) not in text:
                    problems.append(
                        f"text quotes something NOT in {src}: {flat(span)[:90]!r}")

        # 4. BOILERPLATE -- did it quote the shared annex at us?
        shared = flat(doc_text(SHARED))
        if shared and regime_of.get(iid) == "horizon_eu_pillar_ii":
            lifted = [s for s in sentences(r.get("eligibility_text") or "")
                      if norm(s) in shared]
            if lifted:
                problems.append(
                    f"{len(lifted)} sentence(s) lifted from the SHARED General "
                    f"Annexes, e.g. {lifted[0][:90]!r}")

        (bad if problems else ok).append((iid, r, problems))
        mark = "FAIL" if problems else "ok  "
        nq = len(r.get("quotes") or [])
        print(f"{mark} {iid:<22} {n:>5} chars  {nq:>2} quotes  "
              f"body={(r.get('administering_body') or '-')[:44]}")
        for p in problems:
            print(f"       !! {p}")

    # 3. SEPARATION, per regime, over everything that passed.
    print("\n── separation within each regime "
          "(share of sentences no sibling states) ──")
    by_regime: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for iid, r, _ in ok:
        by_regime[regime_of.get(iid, "?")].append((iid, r["eligibility_text"]))
    weak = 0
    for parent, members in sorted(by_regime.items()):
        print(f"  {parent}  ({len(members)} drafted here)")
        for iid, t in sorted(members):
            others = [x for j, x in members if j != iid]
            s = own_share(t, others) if others else 1.0
            flag = "  <-- REPEATS A SIBLING" if s < MIN_OWN_SHARE else ""
            weak += s < MIN_OWN_SHARE
            print(f"     {iid:<24} own_share {s:.2f}{flag}")

    print(f"\n{len(ok)} records pass, {len(bad)} fail, {weak} too close to a sibling")
    if bad or weak:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
