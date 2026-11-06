"""Extractor input files, read from the grounding store instead of a laptop.

    from grounded_inputs import materialise
    materialise("ipcei")      # every file the ipcei extractor reads is now under data/raw/ipcei/

    python3 ETL/lib/grounded_inputs.py status            # what each group needs, and where it is
    python3 ETL/lib/grounded_inputs.py build --archive <extracted data/raw>
                                                         # (re)write reference/grounded_inputs.json
                                                         # and the bucket upload manifest
    python3 ETL/lib/grounded_inputs.py adopt <path>      # a new edition dropped into data/raw

THE FAILURE THIS ENDS. Seven cron sources read files under data/raw/ that existed
only on the owner's laptop (and, since 2026-11-05, in one archive). The container
starts with an empty data/raw/, so each one failed or loaded nothing, every week.
The files are not the cron's to re-download: some came from pages that now
rate-limit or have moved, one was parsed by hand, and a re-download is a
different edition anyway.

THE MECHANISM. reference/grounded_inputs.json pins, per extractor group, every
input file by sha256 -- committed, so a run is reproducible and a changed input
is a visible diff. materialise(group) puts each file at its data/raw/ path:

  1. already there with the pinned sha256        -> used as is (a laptop)
  2. otherwise                                   -> read from the grounding
     store (mandate.grounding: the version with that sha256, its bytes from the
     bucket, verified) and written there          (the container)
  3. there but with DIFFERENT bytes              -> refused. A new edition is
     adopted on purpose (`adopt`), which stores it in grounding and re-pins it;
     it is never silently preferred over, or overwritten by, the pinned one.

Reading needs schema grounding (capital_ro may SELECT it) and the bucket
(BUCKET_* on the capital-etl service). Nothing here writes to the database
except `adopt`, which a human runs.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from etl_env import DATA_RAW, ETL, ROOT  # noqa: E402

PINS = ROOT / "reference" / "grounded_inputs.json"

#: What each extractor group reads, relative to data/raw/. The group is the
#: argument extractors pass to materialise(); patterns are globs.
GROUPS: dict[str, dict] = {
    "innovation_fund": {"extractors": ["extract_innovation_fund"],
                        "files": ["innovation_fund/projects_index.json", "innovation_fund/fiches/*.pdf"]},
    "ipcei": {"extractors": ["extract_ipcei"], "files": ["ipcei/*.pdf"]},
    "eib": {"extractors": ["extract_eib"],
            "files": ["eib/eib_projects_signed_20260520.csv", "eib/eib_project_ids.json"]},
    "edf": {"extractors": ["extract_edf"], "files": ["edf/*.pdf"]},
    "cordis": {"extractors": ["extract_cordis", "extract_cordis_pillar_ii"],
               "files": ["cordis/project.csv", "cordis/organization.csv", "cordis/topics.csv"]},
    # Not an extractor's input but the instrument build's: the Commission's case
    # record per SA number (titles, notified durations, successor links), fetched
    # by ETL/terms/fetch_state_aid_cases.py. Without it the weekly rebuild names
    # 452 schemes after their granting body. See populate_funding_instruments.py.
    "state_aid_cases": {"extractors": ["populate_funding_instruments", "encode_article_intensity",
                                       "encode_registered_regions"],
                        "files": ["state_aid_cases/cases.json"]},
}


def _sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pins() -> dict:
    return json.loads(PINS.read_text())


class InputError(RuntimeError):
    pass


def materialise(group: str, *, raw: Path | None = None, con=None, bucket=None) -> list[Path]:
    """Ensure every pinned file of `group` is at its data/raw/ path. Returns them."""
    raw = raw or DATA_RAW
    entries = pins()["groups"][group]["files"]
    need = []
    out = []
    for e in entries:
        p = raw / e["path"]
        out.append(p)
        if p.exists():
            if _sha(p) == e["sha256"]:
                continue
            raise InputError(
                f"{p} is not the pinned edition (sha256 {e['sha256'][:12]}). If it is a new edition, "
                f"adopt it: python3 ETL/lib/grounded_inputs.py adopt {p}")
        need.append((p, e))
    if not need:
        return out
    sys.path.insert(0, str(ROOT.parent))
    from mandate.grounding import read_original, version_by_sha  # noqa: PLC0415
    own = con is None
    if own:
        from store import connect  # noqa: PLC0415
        ctx = connect(readonly=True)
        con = ctx.__enter__()
    try:
        for p, e in need:
            v = version_by_sha(con, e["sha256"])
            data = read_original(v, bucket=bucket)
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_name(p.name + ".part")
            tmp.write_bytes(data)
            tmp.replace(p)
    except LookupError as exc:
        raise InputError(f"{group}: {exc}. The input has not been uploaded to grounding yet "
                         f"(mandate/grounding/migrations/upload_manifest.py).") from exc
    finally:
        if own:
            ctx.__exit__(None, None, None)
    print(f"grounded inputs: {group}: {len(need)} of {len(entries)} file(s) read from grounding")
    return out


# ── where each file came from ────────────────────────────────────────────────
def _url_hints(archive: Path) -> dict[str, str]:
    """data/raw-relative path -> public URL, from what the extractors themselves record."""
    hints: dict[str, str] = {}
    extract = ETL / "events" / "extract"
    src = (extract / "extract_ipcei.py").read_text()
    meta = dict(re.findall(r'"(ipcei_\w+\.pdf)":\s*\("(ipcei_\w+)"', src))
    urls = dict(re.findall(r'"(ipcei_\w+)":\s*"(https://[^"]+)"', src))
    for fname, source in meta.items():
        if source in urls:
            hints[f"ipcei/{fname}"] = urls[source]
    for m in re.finditer(r'EDF_BASE_URL \+ "(/document/download/([0-9a-f\-]{30,}_en)\?[^"]*)"',
                         (extract / "extract_edf.py").read_text()):
        hints[f"edf/{m.group(2)}.pdf"] = "https://defence-industry-space.ec.europa.eu" + m.group(1)
    idx = archive / "innovation_fund" / "projects_index.json"
    if idx.exists():
        for i, p in enumerate(json.loads(idx.read_text())):
            url = p.get("doc_url")
            if not url:
                continue
            safe = f"{i + 1:03d}_" + p["acronym"][:30].replace("/", "_").replace(" ", "_").replace(":", "").strip(".")
            hints[f"innovation_fund/fiches/{safe}.pdf"] = (
                "https://climate.ec.europa.eu" + url if url.startswith("/") else url)
    return hints


def build(archive: Path, manifest_out: Path) -> dict:
    hints = _url_hints(archive)
    out = {"_doc": "Pinned extractor inputs, by sha256. Written by `grounded_inputs.py build`; "
                   "read by materialise(). A change here is a change of input edition.",
           "groups": {}}
    lines = []
    for group, spec in GROUPS.items():
        files = []
        for pattern in spec["files"]:
            matches = sorted(archive.glob(pattern))
            if not matches:
                raise SystemExit(f"{group}: nothing in the archive matches {pattern}")
            for p in matches:
                rel = str(p.relative_to(archive))
                sha = _sha(p)
                url = hints.get(rel) or f"urn:mandate:capital:raw/{rel}"
                files.append({"path": rel, "sha256": sha, "bytes": p.stat().st_size, "url": url})
                lines.append({"sha256": sha, "bucket_key": f"sha256/{sha[:2]}/{sha}",
                              "byte_size": p.stat().st_size, "mime": _mime(p), "canonical_url": url,
                              "fetched_at": dt.datetime.fromtimestamp(p.stat().st_mtime, dt.timezone.utc).isoformat(),
                              "fetched_at_basis": "file mtime in the 2026-11-05 archive",
                              "extractor": None, "kind": f"extractor_input:{group}",
                              "bytes_from": {"archive_file": rel}})
        out["groups"][group] = {"extractors": spec["extractors"], "files": files}
    PINS.write_text(json.dumps(out, indent=1) + "\n")
    with manifest_out.open("w") as f:
        for l in {l["sha256"]: l for l in lines}.values():
            f.write(json.dumps(l) + "\n")
    return out


def _mime(p: Path) -> str:
    return {".pdf": "application/pdf", ".csv": "text/csv", ".json": "application/json",
            ".html": "text/html"}.get(p.suffix.lower(), "application/octet-stream")


def status() -> int:
    data = pins()
    for group, g in data["groups"].items():
        n = len(g["files"])
        size = sum(f["bytes"] for f in g["files"])
        local = sum(1 for f in g["files"] if (DATA_RAW / f["path"]).exists())
        public = sum(1 for f in g["files"] if not f["url"].startswith("urn:"))
        print(f"{group:16} {n:4} files {size / 1e6:8.1f} MB  {public:4} with a public URL  "
              f"{local:4} present locally  <- {', '.join(g['extractors'])}")
    return 0


def adopt(path: Path) -> int:
    """Store a new edition of a pinned input in grounding and re-pin it."""
    sys.path.insert(0, str(ROOT.parent))
    from mandate.grounding import store_original  # noqa: PLC0415
    from store import connect  # noqa: PLC0415
    rel = str(path.resolve().relative_to(DATA_RAW.resolve()))
    data = pins()
    for g in data["groups"].values():
        for f in g["files"]:
            if f["path"] == rel:
                blob = path.read_bytes()
                with connect() as con:
                    v = store_original(con, blob, f["url"], _mime(path), dt.datetime.now(dt.timezone.utc),
                                       kind="extractor_input")
                f["sha256"], f["bytes"] = v.sha256, len(blob)
                PINS.write_text(json.dumps(data, indent=1) + "\n")
                print(f"adopted {rel}: version {v.id}, sha256 {v.sha256[:12]}. Commit {PINS.relative_to(ROOT)}.")
                return 0
    raise SystemExit(f"{rel} is not a pinned input of any group")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    b = sub.add_parser("build")
    b.add_argument("--archive", type=Path, required=True)
    b.add_argument("--manifest", type=Path, default=Path("grounding_manifest_cron_inputs.jsonl"))
    a = sub.add_parser("adopt")
    a.add_argument("path", type=Path)
    args = ap.parse_args()
    if args.cmd == "status":
        return status()
    if args.cmd == "build":
        out = build(args.archive, args.manifest)
        n = sum(len(g["files"]) for g in out["groups"].values())
        print(f"pinned {n} files in {PINS.relative_to(ROOT)}; upload manifest -> {args.manifest}")
        return status()
    return adopt(args.path)


if __name__ == "__main__":
    sys.exit(main())
