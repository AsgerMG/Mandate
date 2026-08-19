"""wsIU — DOES THE FUNDER'S OWN SITE PUBLISH THESE WORDS? Asked of both columns.

The decision between "name the category" and "re-split onto the sub-category"
cannot be taken from our own corpus: corpus-internal inference is evidence,
never a verdict, and that confusion has cost this project a wrongly unpublished
fund. So each candidate name is tested against the FUNDER'S OWN PAGES, the 16
fetched under data/raw/instrument_docs/ — including the funder's own complete
grant catalogue, "Tilskudd til norske bedrifter", published 8 Apr 2026 and last
updated 22 Jun 2026, which lists every grant it takes applications for.

The test is the one wsIF wrote for a pair nobody has seen: NAME THE FIELD the
source publishes, and the URL it is published at. A value that appears in the
open-data file and nowhere on the funder's own site is a value the funder uses
to ACCOUNT for an award, not to OFFER one.

FREE. No model, no network, no store. Reads the cached CC0 CSV and the cached
HTML only.

  python3 ETL/terms/_wsiu_source_check.py
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402

import argparse  # noqa: E402
import csv  # noqa: E402
import html  # noqa: E402
import io  # noqa: E402
import re  # noqa: E402
from collections import Counter, defaultdict  # noqa: E402

# `data/raw` is gitignored and lives only in the primary checkout, so an agent
# worktree has to be pointed at it. Nothing here reads a store, so this is a
# path and not a credential.
DATA_ROOT = ROOT
DATASET = "https://data.norge.no/nb/datasets/d5f090ca-4e43-3303-a5e6-54247ea69d72"
MIN_YEAR = 2021

# Imported rather than copied: one definition of which category maps to which
# leaf, and the typo variant is part of that definition.
_sys.path.insert(0, str(ROOT / "ETL" / "events" / "extract"))
from extract_innovasjon_norge import CATEGORY_MAP  # noqa: E402


def page_text(docs: _Path) -> dict[str, str]:
    out = {}
    for p in sorted(docs.glob("innovasjon_norge_*.html")):
        t = html.unescape(p.read_text(encoding="utf-8", errors="replace"))
        t = re.sub(r"<script.*?</script>", " ", t, flags=re.S | re.I)
        t = re.sub(r"<[^>]+>", " ", t)
        out[p.stem.replace("innovasjon_norge_", "")] = re.sub(r"\s+", " ", t.replace("­", ""))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default=str(DATA_ROOT),
                    help="checkout holding data/raw (gitignored, so a worktree "
                         "must point at the primary one)")
    a = ap.parse_args()
    root = _Path(a.data_root)
    csv_path = root / "data" / "raw" / "innovasjon_norge" / "Tildelinger.csv"
    docs = root / "data" / "raw" / "instrument_docs"
    text = csv_path.read_text(encoding="utf-8", errors="replace")
    rows = list(csv.DictReader(io.StringIO(text), delimiter=";"))
    pages = page_text(docs)
    print(f"funder's open data : {csv_path}  ({len(rows)} rows)")
    print(f"published at       : {DATASET}")
    print(f"funder's own pages : {len(pages)} fetched under {docs}\n")

    per_slug: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        m = re.match(r"(\d{2})\.(\d{2})\.(\d{2})$", (r.get("Innvilget dato") or "").strip())
        if not m or 2000 + int(m.group(3)) < MIN_YEAR:
            continue
        slug = CATEGORY_MAP.get((r.get("Virkemiddelkategori") or "").strip())
        if not slug or not re.sub(r"\D", "", r.get("Org-nr") or ""):
            continue
        try:
            if float((r.get("Innvilget beløp") or "").replace(",", ".").strip()) <= 0:
                continue
        except ValueError:
            continue
        per_slug[slug][(r.get("Underkategori") or "").strip()] += 1

    def on_site(s: str) -> list[str]:
        s = s.replace("­", "").lower()
        return [k for k, t in pages.items() if s and s in t.lower()]

    for column, values in (
        ("Virkemiddelkategori", sorted(set(CATEGORY_MAP))),
        ("Underkategori", sorted({s for c in per_slug.values() for s in c})),
    ):
        hit = 0
        print(f"══ {column} — does the funder's own site publish this string? ══")
        for v in values:
            where = on_site(v)
            hit += bool(where)
            n = sum(c[v] for c in per_slug.values()) if column == "Underkategori" else ""
            print(f"  {'YES' if where else 'no ':>3}  {v!r:<44} {str(n):>6}  {','.join(where[:3])}")
        print(f"  -> {hit}/{len(values)} published by the funder as words a founder reads\n")

    print("══ RESIDUAL BUCKETS in Underkategori — rows a re-split would MANUFACTURE ══")
    resid = 0
    for slug, c in sorted(per_slug.items()):
        for v, n in c.most_common():
            if not v or v.lower().startswith(("andre ", "diverse ")) or v.lower() == "rådgiving":
                resid += n
                print(f"  {slug:<24} {n:>6}  {v!r}")
    print(f"  -> {resid} awards sit under a value that names no offer\n")

    print("══ THE TYPO TRAP ══")
    raw = Counter((r.get("Virkemiddelkategori") or "").strip() for r in rows)
    for v in ("Distriktsutviklingstilskudd", "Distriksutviklingstilskudd"):
        print(f"  {raw[v]:>6}  {v!r} -> {CATEGORY_MAP[v]}")
    print("  Both map to ONE leaf. Writing the raw cell gives that leaf two "
          "programme_name\n  values and trips programme_split; the canonical "
          "label per slug does not.")


if __name__ == "__main__":
    main()
