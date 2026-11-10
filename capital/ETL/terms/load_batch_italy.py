"""Batch 1, Italy: ground the deciding texts and load the status layer. Dry run unless --apply.

    python3 capital/ETL/terms/load_batch_italy.py --database-url URL            # dry run
    python3 capital/ETL/terms/load_batch_italy.py --database-url URL --apply    # write
    (the owner runs it through mandate/ops/load_batch_italy.sh)

WHAT IT WRITES, in ONE transaction (bucket objects first, as store_original requires):
  grounding   the 16 pinned documents of capital/reference/batch_italy/sources.json
              (document, version by sha256 with the mandate-api extractor's text, fetch),
              their passages (chunker capital.batch_italy.v1) and, with --apply, the
              passages' voyage-4-large vectors (mandate.embedding; about a cent).
  capital     migration 039 if it is the only one pending; then status_keys,
              status_rules, region_priorities, source_supersessions from the YAML
              beside sources.json. Insert-only: ON CONFLICT DO NOTHING, and a row that
              exists with DIFFERENT content refuses the run (a correction is a new key).

WHAT IT REFUSES (exit 3, nothing written), "drift":
  * a pinned file whose bytes are not its sha256, or that is missing locally and the URL
    now serves other bytes (the source changed since its quotes were located: re-pin);
  * extracted text whose length is not the pinned one (the extractor changed);
  * any quote not found verbatim (whitespace-insensitive) in its document's text;
  * a forward migration other than 039 pending (bring the store up to date first);
  * an instrument id a rule names that funding_instruments does not hold;
  * an existing row with the same key and different content.

WHY SO FEW DOCUMENTS. The owner's re-scope (2026-11-10): the product is the method plus a
small grounded core; the long tail is researched live and cached by grounding as Wincent
reads it. This file loads only the texts that DECIDE a route.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))

import httpx  # noqa: E402
import psycopg  # noqa: E402
import yaml  # noqa: E402

from mandate.api.extract import extractor  # noqa: E402
from mandate.grounding.store import add_passages, ensure_source, locate, store_original  # noqa: E402

DATA = REPO / "capital" / "reference" / "batch_italy"
MIGRATION = REPO / "capital" / "ETL" / "schema" / "migrations" / "039_status_rules.sql"
MIGRATION_ID = "039"
BATCH = "batch_italy_2026_11"
CHUNKER = "capital.batch_italy.v1"
SOURCE_KEY = "capital.batch_italy"
ORIGINALS = Path(os.environ.get("BATCH_ITALY_ORIGINALS")
                 or Path.home() / "Mandate-backups" / "batch_italy" / "originals")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126 Safari/537.36")
TAG_BASIS = ("activity_tags mapped by batch_italy from the region's own priority name; the "
             "priority itself is quoted verbatim")


class Drift(Exception):
    """The inputs are not what the committed files say they are. Nothing is written."""


# ── inputs ─────────────────────────────────────────────────────────────────
def load_inputs() -> tuple[dict, dict, dict]:
    sources = json.loads((DATA / "sources.json").read_text())
    rules = yaml.safe_load((DATA / "status_rules.yaml").read_text())
    regions = yaml.safe_load((DATA / "region_priorities.yaml").read_text())
    return sources, rules, regions


def original_bytes(doc: dict) -> tuple[bytes, str]:
    """The pinned bytes, verified. Local copy first; else the URL, refused on any change."""
    p = ORIGINALS / doc["sha256"]
    if p.exists():
        data = p.read_bytes()
        if hashlib.sha256(data).hexdigest() != doc["sha256"]:
            raise Drift(f"{doc['key']}: {p} is not its pinned sha256 (corrupt local copy)")
        return data, "local"
    r = httpx.get(doc["url"], headers={"user-agent": UA, "accept-language": "it-IT,it;q=0.9"},
                  timeout=60, follow_redirects=True)
    r.raise_for_status()
    sha = hashlib.sha256(r.content).hexdigest()
    if sha != doc["sha256"]:
        raise Drift(f"{doc['key']}: {doc['url']} now serves sha256 {sha[:12]}, pinned "
                    f"{doc['sha256'][:12]}. The source changed since its quotes were located: "
                    f"re-fetch, re-check the quotes and re-pin sources.json.")
    return r.content, "refetched"


def chunks(text: str, target: int = 1500) -> list[tuple[int, int, str | None]]:
    """Paragraph windows of about `target` chars, as spans into `text`. Deterministic."""
    spans, start, pos = [], 0, 0
    for line in text.splitlines(keepends=True):
        pos += len(line)
        if pos - start >= target:
            spans.append((start, pos, None))
            start = pos
    if pos > start:
        spans.append((start, pos, None))
    # trim each span to non-blank bounds so a passage never starts or ends on a newline
    out = []
    for s, e, h in spans:
        while s < e and text[s].isspace():
            s += 1
        while e > s and text[e - 1].isspace():
            e -= 1
        if e > s:
            out.append((s, e, h))
    return out


class Prepared:
    def __init__(self) -> None:
        self.docs: dict[str, dict] = {}            # key -> doc + data + text


def prepare(sources: dict, rules: dict, regions: dict) -> Prepared:
    """Everything that can fail without a database: bytes, text, every quote's span."""
    prep = Prepared()
    for d in sources["documents"]:
        data, how = original_bytes(d)
        text, ext = extractor(data, d["mime"])
        if not text:
            raise Drift(f"{d['key']}: no text extracted")
        if len(text) != d["chars"] or ext != d["extractor"]:
            raise Drift(f"{d['key']}: extractor gives {len(text)} chars ({ext}), pinned "
                        f"{d['chars']} ({d['extractor']}). The extractor changed: re-check quotes.")
        prep.docs[d["key"]] = {**d, "data": data, "text": text, "from": how}

    def cite(c: dict, where: str) -> dict:
        if c.get("located") is False:          # declared uncitable (no text stored)
            return {"sha256": c["sha256"], "url": c["url"], "quote": c["quote"], "located": False}
        doc = prep.docs.get(c["doc"])
        if doc is None:
            raise Drift(f"{where}: unknown document {c['doc']!r}")
        span = locate(doc["text"], c["quote"])
        if span is None:
            raise Drift(f"{where}: quote not in {c['doc']}: {c['quote'][:90]!r}")
        return {"sha256": doc["sha256"], "url": doc["url"], "quote": c["quote"],
                "char_start": span[0], "char_end": span[1], "located": True}

    prep.keys = [{**k, "citations": [cite(c, f"status_key {k['key']}") for c in k["citations"]]}
                 for k in rules["status_keys"]]
    known = {k["key"] for k in rules["status_keys"]}
    prep.rules = []
    for r in rules["status_rules"]:
        if r["status_key"] not in known:
            raise Drift(f"rule {r['key']}: unknown status_key {r['status_key']}")
        prep.rules.append({**r, "citations": [cite(c, f"rule {r['key']}") for c in r["citations"]]})

    prep.regions = []
    for reg in regions["regions"]:
        for p in regions["priorities"][reg["nuts"]]:
            c = {"doc": reg["doc"], "quote": p.get("quote") or reg["quote"]}
            cit = cite(c, f"region {reg['nuts']} {p['priority']}")
            if p["priority"].lower().replace("’", "'") not in " ".join(c["quote"].split()).lower().replace("’", "'"):
                raise Drift(f"region {reg['nuts']}: priority {p['priority']!r} is not in its own quote")
            prep.regions.append({"nuts": reg["nuts"], "region": reg["region"], "strategy": reg["strategy"],
                                 "priority": p["priority"], "tags": p["tags"], "citations": [cit]})

    prep.supersessions = []
    for s in sources.get("superseded", []):
        new = prep.docs[s["new_key"]]
        basis = cite({"doc": s["basis_key"], "quote": s["basis_quote"]}, "supersession")
        prep.supersessions.append({"old_sha256": s["old_sha256"], "old_url": s["old_url"],
                                   "new_sha256": new["sha256"], "new_url": new["url"],
                                   "citations": [basis]})
    return prep


# ── database ───────────────────────────────────────────────────────────────
class DryBucket:
    """Dry runs touch no bucket: the object is assumed written, and counted."""
    def __init__(self) -> None:
        self.puts = 0

    def put_if_absent(self, key, data, mime):
        self.puts += 1
        return True

    def exists(self, key):
        return False

    def get(self, key):
        raise RuntimeError("dry run has no bucket")


def migrate(con, apply: bool) -> str:
    have = {r[0] for r in con.execute("SELECT id FROM schema_migrations").fetchall()}
    fwd = sorted(p.name[:3] for p in MIGRATION.parent.glob("*.sql"))
    pending = [m for m in fwd if m not in have]
    if not pending:
        return "039 already applied"
    if pending != [MIGRATION_ID]:
        raise Drift(f"forward migrations pending besides 039: {pending}. Bring the store up to "
                    f"date first (python3 capital/ETL/events/load/migrations/apply.py all).")
    con.execute("SELECT pg_advisory_xact_lock(hashtext('capital.schema_migrations'))")
    con.execute(MIGRATION.read_text())
    con.execute("INSERT INTO schema_migrations (id) VALUES (%s)", (MIGRATION_ID,))
    return "039 applied" if apply else "039 would be applied"


def insert_checked(con, table: str, key_cols: tuple[str, ...], row: dict) -> str:
    """INSERT ... ON CONFLICT DO NOTHING; if the row exists, its content must match."""
    cols = list(row)
    vals = [json.dumps(v, ensure_ascii=False) if c == "citations" else v for c, v in row.items()]
    ph = ", ".join("%s::jsonb" if c == "citations" else "%s" for c in cols)
    cur = con.execute(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({ph}) "
                      f"ON CONFLICT ({', '.join(key_cols)}) DO NOTHING RETURNING 1", vals)
    if cur.fetchone():
        return "new"
    where = " AND ".join(f"{k} = %s" for k in key_cols)
    have = con.execute(f"SELECT {', '.join(cols)} FROM {table} WHERE {where}",
                       [row[k] for k in key_cols]).fetchone()
    for c, h in zip(cols, have):
        want = row[c]
        if c == "citations":
            h = json.loads(json.dumps(h))
        if (list(h) if isinstance(h, (list, tuple)) else h) != want:
            raise Drift(f"{table} {[row[k] for k in key_cols]}: column {c} differs from the "
                        f"committed file. Insert-only: give the change a new key.")
    return "same"


def load(db_url: str, prep: Prepared, *, apply: bool, embed: bool) -> dict:
    from mandate.grounding.bucket import bucket_from_env  # noqa: PLC0415
    bucket = bucket_from_env() if apply else DryBucket()
    counts: dict[str, int | str] = {}
    with psycopg.connect(db_url) as con:
        con.execute("SET search_path = capital, public")
        counts["migration"] = migrate(con, apply)
        src = ensure_source(con, SOURCE_KEY, "Wincent batch 1: Italy deciding texts",
                            publisher="various (pinned in capital/reference/batch_italy/sources.json)")
        new_versions = new_passages = 0
        passage_ids: list[int] = []
        for d in prep.docs.values():
            v = store_original(con, d["data"], d["url"], d["mime"],
                               dt.datetime.fromisoformat(d["fetched_at"]), text=d["text"],
                               extractor=d["extractor"], title=d["title"], publisher=d["publisher"],
                               kind=d["kind"], source_id=src, http_status=d["http_status"], bucket=bucket)
            if v.sha256 != d["sha256"]:
                raise Drift(f"{d['key']}: stored sha256 differs")
            new_versions += v.created
            before = con.execute("SELECT count(*) FROM grounding.passages WHERE version_id = %s "
                                 "AND chunker = %s", (v.id, CHUNKER)).fetchone()[0]
            ids = add_passages(con, v.id, CHUNKER, chunks(d["text"]))
            new_passages += len(ids) - before
            passage_ids += ids
        counts["documents"] = len(prep.docs)
        counts["versions_new"] = new_versions
        counts["passages"] = len(passage_ids)
        counts["passages_new"] = new_passages

        # instrument ids a rule names must exist (drift otherwise)
        named = sorted({i for r in prep.rules for i in r["instrument_ids"]})
        held = {r[0] for r in con.execute("SELECT id FROM funding_instruments WHERE id = ANY(%s)", (named,))}
        if set(named) - held:
            raise Drift(f"rules name instruments the store does not hold: {sorted(set(named) - held)}")

        tally = {"status_keys": [0, 0], "status_rules": [0, 0], "region_priorities": [0, 0],
                 "source_supersessions": [0, 0]}

        def note(t, outcome):
            tally[t][0 if outcome == "new" else 1] += 1
        for k in prep.keys:
            note("status_keys", insert_checked(con, "status_keys", ("key",), {
                "key": k["key"], "label": k["label"], "kind": k["kind"], "country": "IT"
                if k["key"].split(".")[1] == "it" else None, "how_obtained": " ".join(k["how_obtained"].split()),
                "citations": k["citations"], "batch": BATCH}))
        for r in prep.rules:
            note("status_rules", insert_checked(con, "status_rules", ("rule_key",), {
                "rule_key": r["key"], "supersedes": r.get("supersedes"), "country": "IT",
                "level": r["level"], "nuts": r.get("nuts"), "product_family": r["product_family"],
                "instrument_ids": r["instrument_ids"], "role": r["role"], "status_key": r["status_key"],
                "effect": r["effect"], "any_of": r.get("any_of"), "activity_tags": r["activity_tags"],
                "statement": " ".join(r["statement"].split()),
                "verify_note": " ".join(r["verify_note"].split()) if r.get("verify_note") else None,
                "citations": r["citations"], "batch": BATCH}))
        for p in prep.regions:
            note("region_priorities", insert_checked(con, "region_priorities", ("nuts", "priority"), {
                "nuts": p["nuts"], "country": "IT", "region": p["region"], "strategy": p["strategy"],
                "priority": p["priority"], "activity_tags": p["tags"], "tag_basis": TAG_BASIS,
                "citations": p["citations"], "batch": BATCH}))
        for s in prep.supersessions:
            note("source_supersessions", insert_checked(con, "source_supersessions",
                                                        ("old_sha256", "new_sha256"), {**s, "batch": BATCH}))
            counts["superseded_old_version_held"] = bool(con.execute(
                "SELECT 1 FROM grounding.document_versions WHERE sha256 = %s", (s["old_sha256"],)).fetchone())
        for t, (n, same) in tally.items():
            counts[t] = f"{n} new, {same} already loaded"

        # vectors for passages that have none in the one model
        from mandate.embedding import MODEL, Embedder, vector_literal  # noqa: PLC0415
        todo = con.execute(
            "SELECT p.id, p.text FROM grounding.passages p WHERE p.id = ANY(%s) AND NOT EXISTS "
            "(SELECT 1 FROM grounding.passage_embeddings e WHERE e.passage_id = p.id AND e.model = %s) "
            "ORDER BY p.id", (passage_ids, MODEL)).fetchall()
        counts["passages_to_embed"] = len(todo)
        if todo and apply and embed:
            e = Embedder()
            for i in range(0, len(todo), 64):
                batch = todo[i:i + 64]
                vecs = e.embed_documents([t for _, t in batch])
                with con.cursor() as cur:
                    cur.executemany(
                        "INSERT INTO grounding.passage_embeddings (passage_id, model, embedding) "
                        "VALUES (%s, %s, %s::halfvec) ON CONFLICT DO NOTHING",
                        [(pid, MODEL, vector_literal(v)) for (pid, _), v in zip(batch, vecs)])
            counts["embedded"] = len(todo)
            counts["embedding"] = e.usage.line()
        if not apply:
            con.rollback()
            counts["bucket_puts_skipped"] = bucket.puts
    return counts


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--no-embed", action="store_true", help="skip the Voyage call (vectors later)")
    a = ap.parse_args()
    try:
        prep = prepare(*load_inputs())
        print(f"prepared: {len(prep.docs)} documents "
              f"({sum(1 for d in prep.docs.values() if d['from'] == 'local')} from the local pin store), "
              f"{len(prep.keys)} status keys, {len(prep.rules)} rules, {len(prep.regions)} region "
              f"priorities; every quote located")
        counts = load(a.database_url, prep, apply=a.apply, embed=not a.no_embed)
    except Drift as e:
        print(f"REFUSED (drift): {e}", file=sys.stderr)
        return 3
    for k, v in counts.items():
        print(f"  {k:28} {v}")
    print("APPLIED." if a.apply else "DRY RUN: rolled back, nothing written. Add --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
