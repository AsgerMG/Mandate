"""Migration (b): capital's eligibility gates and clauses, linked to their sources.

    # what it would do: read the gates (read-only) and the archive, extract text,
    # locate every quote, write the manifest and the links. Nothing uploaded,
    # nothing written to any database.
    python3 -I mandate/grounding/migrations/capital_sources_to_grounding.py \
        --source-url "$CAPITAL_RO_DATABASE_URL" --archive <extracted data/raw> --out <dir>

    # production, after review: store every manifest object (bytes to the bucket,
    # then the grounding row) and insert the links, as capital_app.
    python3 mandate/grounding/migrations/capital_sources_to_grounding.py \
        --apply --database-url "$CAPITAL_DATABASE_URL" --archive <dir> --out <dir>

WHAT A GATE CITES TODAY. `source_file` + `source_locator` + `quote`, where
source_file is one of four things, and each resolves differently:

  a filename      a file on the owner's laptop (data/raw/...), recovered here
                  from the 2026-11-05 archive by basename. Its URL is taken from
                  the fetch manifests that recorded one (agency_catalogues
                  manifest.json, instrument_docs MANIFEST.md); otherwise the
                  document is `urn:mandate:capital:raw/<path>`, honest about
                  having no public address. fetched_at is the file's mtime in
                  the archive, the best evidence there is of when it was saved.
  'eligibility_text'  the gate was read from funding_instruments.eligibility_text,
                  which was fetched from eligibility_source_url at
                  eligibility_fetched_at. The fetched bytes were not kept; the
                  stored text is, so the object is that text (as policy's are),
                  its URL and date the instrument's own.
  a URL           named but never saved. Listed, not fetched: today's page is not
                  the page that was quoted. The cron fetches it through
                  mandate.grounding.fetch() and the link is made only where the
                  quote is found in what it serves.
  NULL            no source named (llm_classified / register_derived / some
                  human_verified rows). Nothing to link; counted.

A LINK IS EVIDENCE, SO IT SAYS HOW STRONG IT IS. method = 'quote_located' when
the gate's quote was found in the source's text (the span is stored, and
mandate.grounding.cite() will reproduce the words); 'file_only' when the file is
the one named but the quote could not be found in its extracted text (a scanned
PDF, a quote paraphrased by the extractor). Nothing in capital is overwritten:
the links go to a new table, capital.eligibility_grounding (migration 034).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import mimetypes
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from mandate.grounding.bucket import key_for  # noqa: E402
from mandate.grounding.store import canonical_url, locate  # noqa: E402

SENTINEL = "eligibility_text"
EXTRACTOR_VERSION = "capital-mig-b.v1"


@dataclass
class FileRec:
    rel: str
    sha256: str
    size: int
    mime: str
    mtime: dt.datetime


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def mime_of(p: Path) -> str:
    ext = p.suffix.lower()
    return {".pdf": "application/pdf", ".html": "text/html", ".htm": "text/html",
            ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json",
            ".csv": "text/csv", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".xml": "application/xml", ".zip": "application/zip"}.get(
        ext, mimetypes.guess_type(p.name)[0] or "application/octet-stream")


def index_archive(root: Path) -> dict[str, list[FileRec]]:
    """basename -> every file of that name under root (they can repeat)."""
    out: dict[str, list[FileRec]] = defaultdict(list)
    for p in sorted(root.rglob("*")):
        if p.is_file() and not p.name.startswith("."):
            st = p.stat()
            out[p.name].append(FileRec(str(p.relative_to(root)), sha256_file(p), st.st_size, mime_of(p),
                                       dt.datetime.fromtimestamp(st.st_mtime, dt.timezone.utc)))
    return out


_URLISH = re.compile(r"^(?:https?://)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:/\S*)?$", re.I)


def url_hints(root: Path) -> dict[str, str]:
    """relative path -> the URL a fetch manifest recorded for it."""
    hints: dict[str, str] = {}
    man = root / "agency_catalogues" / "manifest.json"
    if man.exists():
        for agency, entry in json.loads(man.read_text()).items():
            for page in entry.get("pages", []) if isinstance(entry, dict) else []:
                if page.get("file") and page.get("url"):
                    hints[f"agency_catalogues/{agency}/{page['file']}"] = page["url"]
    md = root / "instrument_docs" / "MANIFEST.md"
    if md.exists():
        for line in md.read_text().splitlines():
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 3 and cells[0].startswith("`"):
                fname = cells[0].strip("`").split("`")[0]
                src = cells[-1].strip("` ")
                if _URLISH.match(src):
                    hints[f"instrument_docs/{fname}"] = src if "://" in src else "https://" + src
    return hints


# ── text extraction, cached by sha256 ───────────────────────────────────────
_TAGS = re.compile(r"<(script|style)\b.*?</\1>|<[^>]+>", re.S | re.I)


def extract(path: Path, mime: str) -> tuple[str | None, str]:
    if mime == "application/pdf":
        try:
            import pdfplumber  # noqa: PLC0415
        except ImportError:
            return None, "none (pdfplumber not installed)"
        try:
            with pdfplumber.open(path) as pdf:
                return "\n".join((pg.extract_text() or "") for pg in pdf.pages), \
                    f"pdfplumber/{pdfplumber.__version__}"
        except Exception as e:  # noqa: BLE001 -- a broken PDF is a counted outcome, not a crash
            return None, f"none (pdfplumber failed: {type(e).__name__})"
    if mime == "text/html":
        raw = path.read_bytes().decode("utf-8", errors="replace")
        text = html.unescape(_TAGS.sub(" ", raw))
        return "\n".join(" ".join(l.split()) for l in text.splitlines() if l.strip()), "html-strip.v1"
    if mime.startswith("text/") or mime == "application/json":
        return path.read_bytes().decode("utf-8", errors="replace"), "utf8"
    return None, "none (binary)"


def cached_text(cache: Path, root: Path, rec: FileRec) -> tuple[str | None, str]:
    c = cache / f"{rec.sha256}.json"
    if c.exists():
        j = json.loads(c.read_text())
        return j["text"], j["extractor"]
    text, ext = extract(root / rec.rel, rec.mime)
    cache.mkdir(parents=True, exist_ok=True)
    c.write_text(json.dumps({"text": text, "extractor": ext}))
    return text, ext


# ── the plan ────────────────────────────────────────────────────────────────
ROWS_SQL = """
  SELECT 'gate', g.instrument_id, g.gate_key, g.source_file, g.source_locator, g.quote, g.verification_level
    FROM eligibility_gates g
  UNION ALL
  SELECT 'clause', c.instrument_id, c.clause_type || '::' || c.clause_key, c.source_file, c.source_locator,
         c.quote, c.verification_level
    FROM eligibility_clauses c
"""


def build(src, root: Path, cache: Path, log=print) -> dict:
    rows = src.execute(ROWS_SQL).fetchall()
    inst = {r[0]: r[1:] for r in src.execute(
        "SELECT id, eligibility_text, eligibility_source_url, eligibility_fetched_at FROM funding_instruments")}
    log(f"read {len(rows):,} gates+clauses")
    idx = index_archive(root)
    hints = url_hints(root)
    log(f"indexed {sum(len(v) for v in idx.values()):,} archive files ({len(idx):,} names), "
        f"{len(hints):,} with a recorded URL")

    objects: dict[str, dict] = {}            # sha256 -> manifest entry
    links: list[dict] = []
    outcome = Counter()
    by_name_outcome: dict[str, str] = {}
    to_fetch: Counter = Counter()
    texts: dict[str, str | None] = {}

    def add_object(entry: dict, text: str | None) -> None:
        objects.setdefault(entry["sha256"], entry)
        texts.setdefault(entry["sha256"], text)

    for stype, iid, skey, sfile, locator, quote, level in rows:
        key = (stype, iid, skey)
        if sfile is None or not str(sfile).strip():
            outcome["no_source_named"] += 1
            continue
        sfile = str(sfile).strip()
        if sfile == SENTINEL:
            etext, eurl, efetched = inst.get(iid, (None, None, None))
            if not etext:
                outcome["eligibility_text_missing"] += 1
                continue
            data = etext.encode("utf-8")
            sha = hashlib.sha256(data).hexdigest()
            try:
                cu = canonical_url(eurl) if eurl else f"urn:mandate:capital:eligibility_text:{iid}"
            except ValueError:
                cu = f"urn:mandate:capital:eligibility_text:{iid}"
            fetched = _parse_ts(efetched)
            add_object({"sha256": sha, "bucket_key": key_for(sha), "byte_size": len(data),
                        "mime": "text/plain; charset=utf-8", "canonical_url": cu,
                        "fetched_at": fetched.isoformat() if fetched else None,
                        "extractor": "capital.eligibility_text (fetched bytes not retained)",
                        "bytes_from": {"funding_instruments.eligibility_text": iid},
                        "kind": "eligibility_text"}, etext)
            _link(links, outcome, key, sha, etext, quote, sfile)
            continue
        if re.match(r"^https?://", sfile, re.I):
            outcome["url_named_not_saved"] += 1
            to_fetch[sfile] += 1
            continue
        name = Path(sfile.split("#")[0]).name
        uniq = list({c.sha256: c for c in idx.get(name, [])}.values())
        if not uniq:
            outcome["file_not_in_archive"] += 1
            by_name_outcome[sfile] = "not_in_archive"
            continue
        resolved = []                      # (rec, text, extractor, span)
        for rec in uniq:
            text, ext = cached_text(cache, root, rec)
            resolved.append((rec, text, ext, locate(text, quote) if (text and quote) else None))
        if len(uniq) > 1:
            # two different files under one name: only a file that holds the quote
            # is evidence; if none does, the name alone cannot say which was meant
            resolved = [r for r in resolved if r[3]]
            if not resolved:
                outcome["file_name_ambiguous_quote_nowhere"] += 1
                by_name_outcome[sfile] = "ambiguous"
                continue
        for rec, text, ext, span in resolved:
            url = hints.get(rec.rel)
            try:
                cu = canonical_url(url) if url else f"urn:mandate:capital:raw/{rec.rel}"
            except ValueError:
                cu = f"urn:mandate:capital:raw/{rec.rel}"
            add_object({"sha256": rec.sha256, "bucket_key": key_for(rec.sha256), "byte_size": rec.size,
                        "mime": rec.mime, "canonical_url": cu, "fetched_at": rec.mtime.isoformat(),
                        "fetched_at_basis": "file mtime in the 2026-11-05 archive",
                        "extractor": ext, "bytes_from": {"archive_file": rec.rel},
                        "kind": "scheme_document"}, text)
            _link(links, outcome, key, rec.sha256, text, quote, sfile, span=span, counted=False)
        outcome["file_quote_located" if any(r[3] for r in resolved) else "file_quote_not_located"] += 1
        by_name_outcome.setdefault(sfile, "found")

    names = Counter(by_name_outcome.values())
    return {"objects": objects, "texts": texts, "links": links, "outcome": outcome,
            "names": names, "to_fetch": to_fetch, "rows": len(rows)}


def _parse_ts(v) -> dt.datetime | None:
    if v is None:
        return None
    if isinstance(v, dt.datetime):
        return v if v.tzinfo else v.replace(tzinfo=dt.timezone.utc)
    t = dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def _link(links, outcome, key, sha, text, quote, sfile, *, span=None, counted=True):
    if span is None and text and quote:
        span = locate(text, quote)
    method = "quote_located" if span else "file_only"
    if counted:
        outcome[f"eligibility_text_{method}"] += 1
    links.append({"key": list(key), "sha256": sha, "span": list(span) if span else None,
                  "method": method, "source_file": sfile})


def write_outputs(out: Path, res: dict) -> None:
    out.mkdir(parents=True, exist_ok=True)
    with (out / "grounding_manifest_capital.jsonl").open("w") as f:
        for e in res["objects"].values():
            f.write(json.dumps(e) + "\n")
    with (out / "eligibility_links.jsonl").open("w") as f:
        for l in res["links"]:
            f.write(json.dumps(l) + "\n")
    with (out / "urls_to_fetch.json").open("w") as f:
        json.dump(dict(res["to_fetch"].most_common()), f, indent=1)


def report(res: dict) -> None:
    objs = res["objects"].values()
    print("DRY RUN: capital eligibility sources -> grounding. Nothing uploaded, nothing written to a database.")
    print(f"  gates + clauses read                 {res['rows']:,}")
    for k, v in sorted(res["outcome"].items()):
        print(f"  {k:38} {v:,}")
    print(f"  distinct source files named          {sum(res['names'].values()):,}  "
          f"({dict(res['names'])})")
    print(f"  distinct URLs named, not saved       {len(res['to_fetch']):,}")
    print(f"  objects to upload                    {len(objs):,}  "
          f"({sum(o['byte_size'] for o in objs):,} bytes)")
    by_kind = Counter(o["kind"] for o in objs)
    print(f"    by kind                            {dict(by_kind)}")
    urn = sum(1 for o in objs if o["canonical_url"].startswith("urn:"))
    print(f"    with a public URL / urn only       {len(objs) - urn:,} / {urn:,}")
    no_text = sum(1 for s, t in res["texts"].items() if not t)
    print(f"    no extractable text                {no_text:,}")
    print(f"  links to write                       {len(res['links']):,}  "
          f"({dict(Counter(l['method'] for l in res['links']))})")


# ── apply (production; the owner runs it) ───────────────────────────────────
def apply(db_url: str, root: Path, out: Path) -> None:
    from mandate.grounding import store_original  # noqa: PLC0415
    manifest = [json.loads(l) for l in (out / "grounding_manifest_capital.jsonl").read_text().splitlines()]
    links = [json.loads(l) for l in (out / "eligibility_links.jsonl").read_text().splitlines()]
    cache = out / "text_cache"
    with psycopg.connect(db_url) as con:
        inst_text = None
        vid: dict[str, int] = {}
        for e in manifest:
            src = e["bytes_from"]
            if "archive_file" in src:
                data = (root / src["archive_file"]).read_bytes()
                text = json.loads((cache / f"{e['sha256']}.json").read_text())["text"]
            else:
                if inst_text is None:
                    inst_text = dict(con.execute(
                        "SELECT id, eligibility_text FROM funding_instruments").fetchall())
                text = inst_text[src["funding_instruments.eligibility_text"]]
                data = text.encode("utf-8")
            if hashlib.sha256(data).hexdigest() != e["sha256"]:
                raise SystemExit(f"bytes for {e['canonical_url']} changed since the dry run: re-run it")
            fetched = _parse_ts(e["fetched_at"]) or dt.datetime.now(dt.timezone.utc)
            v = store_original(con, data, e["canonical_url"], e["mime"], fetched, text=text,
                               extractor=e["extractor"], kind=e["kind"])
            vid[e["sha256"]] = v.id
        for l in links:
            stype, iid, skey = l["key"]
            s, t = l["span"] or (None, None)
            con.execute(
                "INSERT INTO eligibility_grounding (source_type, instrument_id, source_key, "
                "  grounding_version_id, char_start, char_end, method, source_file) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (stype, iid, skey, vid[l["sha256"]], s, t, l["method"], l["source_file"]))
        con.commit()
    print(f"stored {len(vid):,} versions, {len(links):,} links")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-url", help="capital read-only URL (dry run)")
    ap.add_argument("--database-url", help="capital_app URL (--apply)")
    ap.add_argument("--archive", type=Path, required=True, help="extracted data/raw root")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    if a.apply:
        if not a.database_url:
            ap.error("--apply needs --database-url")
        apply(a.database_url, a.archive, a.out)
        return 0
    if not a.source_url:
        ap.error("--source-url is required")
    with psycopg.connect(a.source_url, options="-c default_transaction_read_only=on") as src:
        res = build(src, a.archive, a.out / "text_cache")
    write_outputs(a.out, res)
    report(res)
    return 0


if __name__ == "__main__":
    sys.exit(main())
