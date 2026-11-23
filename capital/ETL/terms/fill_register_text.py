"""Give the stored register pages their TEXT, so the tools can resolve a register citation (the
quote is a body's or a person's name inside the page). The pages were stored as bytes without
text (23 Nov), so 20,000 register-sourced people reached Wincent as uncited quotes. Uses the one
update grounding allows (fill_text: NULL text becomes text, never an overwrite); the bytes come from
the bucket, nothing is re-fetched. Dry run unless --apply.

    python3 capital/ETL/terms/fill_register_text.py --database-url URL [--apply]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
import psycopg  # noqa: E402

from mandate.grounding.bucket import bucket_from_env  # noqa: E402
from mandate.grounding.store import fill_text, read_original, version  # noqa: E402


def as_text(raw: bytes) -> str:
    """The page as readable JSON text: unicode unescaped, so a printed name is found as printed."""
    try:
        return json.dumps(json.loads(raw.decode("utf-8-sig")), ensure_ascii=False, indent=0)
    except Exception:  # noqa: BLE001
        return raw.decode("utf-8", errors="replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    bucket = bucket_from_env()
    with psycopg.connect(a.database_url) as con:
        ids = [r[0] for r in con.execute("""
            SELECT v.id FROM grounding.document_versions v JOIN grounding.documents d ON d.id = v.document_id
              JOIN grounding.sources s ON s.id = d.source_id
             WHERE s.key LIKE 'capital.register.%' AND v.text IS NULL""")]
        total = 0
        for vid in ids:
            v = version(con, vid)
            text = as_text(read_original(v, bucket=bucket))
            total += len(text)
            fill_text(con, vid, text, "register-json-v1")
        print(f"register pages without text: {len(ids)}; text to fill: {total / 1e6:.1f} MB")
        if not a.apply:
            con.rollback()
            print("DRY RUN: rolled back. Add --apply to write.")
        else:
            print("APPLIED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
