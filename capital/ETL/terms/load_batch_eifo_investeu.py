"""Batch eifo_investeu: ground the deciding texts, load EIFO's products with cited gates, the
status rules and the INTERMEDIARIES table. Dry run unless --apply.

    python3 capital/ETL/terms/load_batch_eifo_investeu.py --database-url URL            # dry run
    python3 capital/ETL/terms/load_batch_eifo_investeu.py --database-url URL --apply    # write
    (the owner runs it through mandate/ops/load_batch_eifo_investeu.sh)

Same pattern as load_batch_italy.py, whose helpers it imports (one implementation of the pin
check, the grounding store, the passages, the vectors and the insert-only check).

WHAT IT WRITES, in ONE transaction (bucket objects first, as store_original requires):
  grounding   the 13 pinned documents of capital/reference/batch_eifo_investeu/sources.json,
              their passages (chunker capital.batch_eifo_investeu.v1) and, with --apply, the
              passages' voyage-4-large vectors (about a cent).
  capital     migration 041 if it is the only one pending; then, from the YAML beside
              sources.json:
                status_keys / status_rules        (039's tables; DK and EU rules)
                funding_instruments               6 new EIFO products (eifo_coinvest is held)
                funding_instrument_sources        'batch_eifo_investeu' for each
                eligibility_gates                 hand-encoded, verbatim-quoted, human_verified
                eligibility_grounding             each gate's span, method quote_located, so
                                                  assess_instrument cites it
                intermediaries                    (041) 60 rows, each cited to the EIF / KfW
                                                  Capital list line that says so
              Insert-only: a row that exists with DIFFERENT content refuses the run.

WHAT IT REFUSES (exit 3, nothing written), "drift": as load_batch_italy.py (bytes, extractor,
quote, an existing row that differs), plus: a forward migration other than 041 pending, 039
not applied, an `existing` instrument the store does not hold.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg  # noqa: E402
import yaml  # noqa: E402

from load_batch_italy import (  # noqa: E402
    Drift, DryBucket, embed_passages, ground_documents, insert_checked, original_bytes)
from mandate.api.extract import extractor  # noqa: E402
from mandate.grounding.store import ensure_source, locate  # noqa: E402

DATA = REPO / "capital" / "reference" / "batch_eifo_investeu"
MIGRATIONS = REPO / "capital" / "ETL" / "schema" / "migrations"
MIGRATION_ID = "041"
BATCH = "batch_eifo_investeu_2026_11"
CHUNKER = "capital.batch_eifo_investeu.v1"
SOURCE_KEY = "capital.batch_eifo_investeu"
FI_SOURCE = "batch_eifo_investeu"
ORIGINALS = Path(os.environ.get("BATCH_EIFO_INVESTEU_ORIGINALS")
                 or Path.home() / "Mandate-backups" / "batch_eifo_investeu" / "originals")


def squash(s: str | None) -> str | None:
    return " ".join(s.split()) if s else s


# ── inputs ─────────────────────────────────────────────────────────────────
def load_inputs() -> dict:
    return {"sources": json.loads((DATA / "sources.json").read_text()),
            **{n: yaml.safe_load((DATA / f"{n}.yaml").read_text())
               for n in ("status_rules", "instruments", "intermediaries")}}


class Prepared:
    docs: dict[str, dict]
    keys: list[dict]
    rules: list[dict]
    instruments: list[dict]
    gates: list[dict]
    intermediaries: list[dict]


def prepare(inp: dict) -> Prepared:
    """Everything that can fail without a database: bytes, text, every quote's span."""
    prep = Prepared()
    prep.docs = {}
    for d in inp["sources"]["documents"]:
        data, how = original_bytes(d, ORIGINALS, "en-GB,en;q=0.9")
        text, ext = extractor(data, d["mime"])
        if not text:
            raise Drift(f"{d['key']}: no text extracted")
        if len(text) != d["chars"] or ext != d["extractor"]:
            raise Drift(f"{d['key']}: extractor gives {len(text)} chars ({ext}), pinned "
                        f"{d['chars']} ({d['extractor']}). The extractor changed: re-check quotes.")
        prep.docs[d["key"]] = {**d, "data": data, "text": text, "from": how}

    def cite(c: dict, where: str) -> dict:
        doc = prep.docs.get(c["doc"])
        if doc is None:
            raise Drift(f"{where}: unknown document {c['doc']!r}")
        span = locate(doc["text"], c["quote"])
        if span is None:
            raise Drift(f"{where}: quote not in {c['doc']}: {c['quote'][:90]!r}")
        return {"sha256": doc["sha256"], "url": doc["url"], "quote": c["quote"],
                "char_start": span[0], "char_end": span[1], "located": True}

    sr = inp["status_rules"]
    prep.keys = [{**k, "citations": [cite(c, f"status_key {k['key']}") for c in k["citations"]]}
                 for k in sr["status_keys"]]
    known = {k["key"] for k in sr["status_keys"]}
    prep.rules = []
    for r in sr["status_rules"]:
        if r["status_key"] not in known:
            raise Drift(f"rule {r['key']}: unknown status_key {r['status_key']}")
        prep.rules.append({**r, "citations": [cite(c, f"rule {r['key']}") for c in r["citations"]]})

    ins = inp["instruments"]
    prep.instruments, prep.gates = [], []
    new_ids = {i["id"] for i in ins["instruments"]}
    for i in ins["instruments"] + ins.get("existing", []):
        is_new = i["id"] in new_ids
        doc = prep.docs[i["doc"]]
        if is_new:
            parent = i.get("parent")
            if parent and parent not in new_ids:
                raise Drift(f"instrument {i['id']}: parent {parent} is not in this batch")
            prep.instruments.append({
                "id": i["id"], "parent_id": parent, "name": i["name"], "name_source": "curated",
                "name_basis": f"the institution's own product sheet: {doc['title']}",
                "country": "DK", "administering_body": ins["administering_body"],
                "capital_type": i["capital_type"],
                "capital_type_basis": f"{FI_SOURCE}: hand-read from {doc['url']}",
                "description": squash(i["description"]), "application_url": doc["url"],
                "eligibility_source_url": doc["url"], "eligibility_confidence": "high",
                "tier": "programme", "root_id": parent or i["id"], "depth": 1 if parent else 0,
                "path": f"{parent}/{i['id']}" if parent else i["id"]})
        for g in i["gates"]:
            c = cite({"doc": i["doc"], "quote": g["quote"]}, f"gate {i['id']}.{g['key']}")
            spec = g.get("value_spec")
            prep.gates.append({
                "instrument_id": i["id"], "gate_key": g["key"], "gate_family": g["family"],
                "requirement": g["requirement"], "value": g.get("value"),
                "value_spec": json.dumps(spec, separators=(", ", ": ")) if spec else None,
                "intake_field": g.get("intake_field", "none"), "quote": g["quote"],
                "source_file": doc["url"], "source_locator": f"sha256:{doc['sha256']}#{c['char_start']}-{c['char_end']}",
                "verification_level": "human_verified", "gate_role": g["role"],
                "encoding_method": "hand_cited",
                "verify_note": f"{FI_SOURCE}: quote located verbatim in the pinned document",
                "_span": (c["char_start"], c["char_end"]), "_sha": doc["sha256"], "_new": is_new})
    prep.existing = sorted({i["id"] for i in ins.get("existing", [])})

    prep.intermediaries = []
    seen = set()
    for r in inp["intermediaries"]["intermediaries"]:
        if r["key"] in seen:
            raise Drift(f"intermediary {r['key']}: duplicate key")
        seen.add(r["key"])
        prep.intermediaries.append({
            "key": r["key"], "market": r["market"], "name": r["name"], "kind": r["kind"],
            "product_types": sorted(r["product_types"]), "backing": r["backing"],
            "backing_detail": r.get("backing_detail") or [],
            "as_of": dt.date.fromisoformat(r["as_of"]) if r.get("as_of") else None,
            "website": r.get("website"), "note": squash(r.get("note")),
            "citations": [cite(c, f"intermediary {r['key']}") for c in r["citations"]], "batch": BATCH})
    return prep


# ── database ───────────────────────────────────────────────────────────────
def migrate(con, apply: bool) -> str:
    have = {r[0] for r in con.execute("SELECT id FROM schema_migrations").fetchall()}
    if "039" not in have:
        raise Drift("migration 039 (the status layer) is not applied: run batch Italy's load first")
    fwd = sorted(p.name[:3] for p in MIGRATIONS.glob("*.sql"))
    pending = [m for m in fwd if m not in have]
    if not pending:
        return "041 already applied"
    if pending != [MIGRATION_ID]:
        raise Drift(f"forward migrations pending besides 041: {pending}. Bring the store up to "
                    f"date first (python3 capital/ETL/events/load/migrations/apply.py all).")
    con.execute("SELECT pg_advisory_xact_lock(hashtext('capital.schema_migrations'))")
    con.execute(next(MIGRATIONS.glob("041_*.sql")).read_text())
    con.execute("INSERT INTO schema_migrations (id) VALUES (%s)", (MIGRATION_ID,))
    return "041 applied" if apply else "041 would be applied"


GATE_COLS = ("gate_family", "requirement", "value", "value_spec", "intake_field", "quote", "source_file",
             "source_locator", "verification_level", "gate_role", "encoding_method", "verify_note")


def insert_gate(con, g: dict) -> str:
    """eligibility_gates has no id default: the next id is taken under a lock. Insert-only."""
    have = con.execute(f"SELECT {', '.join(GATE_COLS)} FROM eligibility_gates WHERE instrument_id = %s "
                       f"AND gate_key = %s", (g["instrument_id"], g["gate_key"])).fetchone()
    if have:
        for c, h in zip(GATE_COLS, have):
            if h != g[c]:
                raise Drift(f"eligibility_gates {g['instrument_id']}.{g['gate_key']}: column {c} differs "
                            f"from the committed file. Insert-only: give the change a new gate_key.")
        return "same"
    con.execute("SELECT pg_advisory_xact_lock(hashtext('capital.eligibility_gates.id'))")
    con.execute(f"INSERT INTO eligibility_gates (id, instrument_id, gate_key, {', '.join(GATE_COLS)}) "
                f"SELECT coalesce(max(id), 0) + 1, %s, %s, {', '.join(['%s'] * len(GATE_COLS))} "
                f"FROM eligibility_gates", (g["instrument_id"], g["gate_key"], *[g[c] for c in GATE_COLS]))
    return "new"


def load(db_url: str, prep: Prepared, *, apply: bool, embed: bool) -> dict:
    from mandate.grounding.bucket import bucket_from_env  # noqa: PLC0415
    bucket = bucket_from_env() if apply else DryBucket()
    counts: dict[str, int | str] = {}
    with psycopg.connect(db_url) as con:
        con.execute("SET search_path = capital, public")
        counts["migration"] = migrate(con, apply)
        src = ensure_source(con, SOURCE_KEY, "Wincent batch: EIFO and InvestEU deciding texts",
                            publisher="various (pinned in capital/reference/batch_eifo_investeu/sources.json)")
        passage_ids = ground_documents(con, prep.docs, src, CHUNKER, bucket, counts)
        version_of = {sha: vid for sha, vid in con.execute(
            "SELECT sha256, id FROM grounding.document_versions WHERE sha256 = ANY(%s)",
            ([d["sha256"] for d in prep.docs.values()],)).fetchall()}

        held = {r[0] for r in con.execute("SELECT id FROM funding_instruments WHERE id = ANY(%s)",
                                          (prep.existing,))}
        if set(prep.existing) - held:
            raise Drift(f"instruments.yaml `existing` names ids the store does not hold: "
                        f"{sorted(set(prep.existing) - held)}")

        tally = {t: [0, 0] for t in ("status_keys", "status_rules", "funding_instruments",
                                     "funding_instrument_sources", "eligibility_gates",
                                     "eligibility_grounding", "intermediaries")}

        def note(t, outcome):
            tally[t][0 if outcome == "new" else 1] += 1
        for k in prep.keys:
            note("status_keys", insert_checked(con, "status_keys", ("key",), {
                "key": k["key"], "label": k["label"], "kind": k["kind"], "country": k.get("country"),
                "how_obtained": squash(k["how_obtained"]), "citations": k["citations"], "batch": BATCH}))
        for r in prep.rules:
            note("status_rules", insert_checked(con, "status_rules", ("rule_key",), {
                "rule_key": r["key"], "supersedes": r.get("supersedes"), "country": r["country"],
                "level": r["level"], "nuts": r.get("nuts"), "product_family": r["product_family"],
                "instrument_ids": r.get("instrument_ids") or [], "role": r["role"],
                "status_key": r["status_key"], "effect": r["effect"], "any_of": r.get("any_of"),
                "activity_tags": r["activity_tags"], "statement": squash(r["statement"]),
                "verify_note": squash(r.get("verify_note")), "citations": r["citations"], "batch": BATCH}))
        for i in prep.instruments:
            note("funding_instruments", insert_checked(con, "funding_instruments", ("id",), i, jsonb=()))
            note("funding_instrument_sources", insert_checked(
                con, "funding_instrument_sources", ("instrument_id", "source"),
                {"instrument_id": i["id"], "source": FI_SOURCE}, jsonb=()))
        for g in prep.gates:
            note("eligibility_gates", insert_gate(con, g))
            note("eligibility_grounding", insert_checked(
                con, "eligibility_grounding", ("source_type", "instrument_id", "source_key", "grounding_version_id"), {
                    "source_type": "gate", "instrument_id": g["instrument_id"], "source_key": g["gate_key"],
                    "grounding_version_id": version_of[g["_sha"]], "char_start": g["_span"][0],
                    "char_end": g["_span"][1], "method": "quote_located", "source_file": g["source_file"]},
                jsonb=()))
        # every rule's instrument id is now held (this batch's or production's)
        named = sorted({i for r in prep.rules for i in r.get("instrument_ids") or []})
        held = {r[0] for r in con.execute("SELECT id FROM funding_instruments WHERE id = ANY(%s)", (named,))}
        if set(named) - held:
            raise Drift(f"rules name instruments the store does not hold: {sorted(set(named) - held)}")
        for r in prep.intermediaries:
            note("intermediaries", insert_checked(con, "intermediaries", ("key",), r,
                                                  jsonb=("citations", "backing_detail")))
        for t, (n, same) in tally.items():
            counts[t] = f"{n} new, {same} already loaded"

        embed_passages(con, passage_ids, counts, apply=apply, embed=embed)
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
        prep = prepare(load_inputs())
        print(f"prepared: {len(prep.docs)} documents "
              f"({sum(1 for d in prep.docs.values() if d['from'] == 'local')} from the local pin store), "
              f"{len(prep.keys)} status keys, {len(prep.rules)} rules, {len(prep.instruments)} new instruments, "
              f"{len(prep.gates)} gates, {len(prep.intermediaries)} intermediaries; every quote located")
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
