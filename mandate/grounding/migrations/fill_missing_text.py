"""Fill the text of grounding versions that were stored without it. Dry run unless --apply.

    python3 mandate/grounding/migrations/fill_missing_text.py --database-url URL [--apply] [--limit N]
    (the owner runs it through mandate/ops/fill_missing_text.sh)

WHY. On 2026-11-05 the laptop archive was registered into grounding by register_manifest.py
on a machine without pdfplumber, so 598 PDF versions carry text NULL ('none (pdfplumber not
installed)'). A version without text cannot be cited or cut into passages, and because a
version is keyed by sha256, every later store of the same bytes returns that textless
version (the batch-Italy load hit it on the 2023 Fondo di Garanzia Disposizioni operative).

WHAT. For each version with text NULL and a PDF or HTML mime: read the original from the
bucket (verified against its sha256), extract it with THE extractor (mandate.api.extract:
pypdf for PDF, pinned here to 7.0.1 so every filled text is the same function of its bytes;
the HTML parser for HTML), and fill it through mandate.grounding.store.fill_text, the one
UPDATE grounding allows (NULL text -> text; mandate/db/grounding.sql). One commit per
version: a failure leaves the others filled. A PDF with no extractable text (a scan) is
skipped and listed; nothing is ever overwritten.
"""
from __future__ import annotations

import argparse
import collections
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import psycopg  # noqa: E402

from mandate.api.extract import extractor  # noqa: E402
from mandate.grounding.bucket import bucket_from_env  # noqa: E402
from mandate.grounding.store import fill_text, read_original, version  # noqa: E402

PYPDF = "7.0.1"
MIMES = ("application/pdf", "text/html", "application/xhtml+xml")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", required=True, help="a brain role (capital_app); never the admin")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    import pypdf  # noqa: PLC0415
    if pypdf.__version__ != PYPDF:
        print(f"pypdf {pypdf.__version__} is not the pinned {PYPDF}: refused (another version "
              f"extracts other text)", file=sys.stderr)
        return 2
    bucket = bucket_from_env()
    tally: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    failures: list[str] = []
    with psycopg.connect(a.database_url) as con:
        rows = con.execute(
            "SELECT id, mime FROM grounding.document_versions WHERE text IS NULL AND mime = ANY(%s) "
            "ORDER BY id" + (f" LIMIT {int(a.limit)}" if a.limit else ""), (list(MIMES),)).fetchall()
        con.commit()
        print(f"{len(rows)} version(s) without text, of mime {', '.join(MIMES)}"
              + (" (limited)" if a.limit else ""))
        for vid, mime in rows:
            try:
                v = version(con, vid)
                data = read_original(v, bucket=bucket)          # verified against sha256
                text, ext = extractor(data, mime)
                if not text:
                    tally[mime]["no_text_extractable"] += 1
                    failures.append(f"{vid} {v.canonical_url}: no extractable text (scanned?)")
                    con.rollback()
                    continue
                if a.apply:
                    fill_text(con, vid, text, ext)
                    con.commit()
                tally[mime]["filled" if a.apply else "would_fill"] += 1
            except Exception as e:  # noqa: BLE001 - listed, never swallowed silently
                con.rollback()
                tally[mime]["failed"] += 1
                failures.append(f"{vid}: {type(e).__name__}: {str(e)[:160]}")
        con.commit()
    for mime, c in sorted(tally.items()):
        print(f"  {mime:28} " + ", ".join(f"{k} {n}" for k, n in sorted(c.items())))
    if failures:
        print(f"skipped ({len(failures)}):")
        for f in failures[:60]:
            print(f"  {f}")
        if len(failures) > 60:
            print(f"  ... and {len(failures) - 60} more")
    print("APPLIED." if a.apply else "DRY RUN: nothing written. Add --apply to fill.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
