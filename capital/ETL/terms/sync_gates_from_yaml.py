"""Sync the hand-authored, human-reviewed data/instrument_terms/*.yaml records
into the eligibility_gates table. YAML stays the authoring format for Tier 2
(git-diffable, the actual review surface); this script is the one-way bridge
into the DB-native schema so the frontend export (eligibility_export.py) and
the reverse-engineering aggregation (aggregate_intake_usage.py) can query
gates uniformly regardless of tier.

Only gates verified:true or verified:"llm_2pass" are synced — an
unverified/draft gate stays out of the DB entirely rather than being synced
at some invented lower tier, since it hasn't cleared even the mechanical
verbatim-quote check.

Usage: python3 ETL/terms/sync_gates_from_yaml.py
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

import sqlite3

import yaml  # noqa: E402

TERMS = ROOT / "data" / "instrument_terms"


def verification_level(verified) -> str | None:
    if verified is True:
        return "human_verified"
    if verified in ("llm_2pass", "llm_cited"):
        return verified
    return None  # draft/unverified — not synced


def _upsert_clause(conn, rec_id, clause_type, clause_key, text, quote, source, level, verify_note=None, verify_by=None):
    conn.execute("""
        INSERT INTO eligibility_clauses
          (instrument_id, clause_type, clause_key, text, quote, source_file,
           source_locator, verification_level, verify_note, verify_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (instrument_id, clause_type, clause_key) DO UPDATE SET
          text=excluded.text, quote=excluded.quote, source_file=excluded.source_file,
          source_locator=excluded.source_locator, verification_level=excluded.verification_level,
          verify_note=excluded.verify_note, verify_by=excluded.verify_by, updated_at=CURRENT_TIMESTAMP
    """, (
        rec_id, clause_type, clause_key, text, quote,
        source.get("file") or None, source.get("locator") or None,
        level, verify_note, verify_by,
    ))


def sync_clauses(conn, rec_id: str, rec: dict) -> tuple[int, int]:
    """Syncs obligations[]/cumulation/application (each carries its own
    verified/source, same tiering as gates) plus a templated ticket clause
    derived from funding_instruments' own corpus numbers, not hand-authored."""
    n_synced = n_skipped = 0

    for i, ob in enumerate(rec.get("obligations", []) or []):
        level = verification_level(ob.get("verified"))
        if level is None:
            n_skipped += 1
            continue
        _upsert_clause(
            conn, rec_id, "obligation", f"ob{i}", ob.get("requirement", ""),
            ob.get("quote") or None, ob.get("source") or {}, level,
            ob.get("verify_note"), rec.get("verify_by"),
        )
        n_synced += 1

    for clause_type in ("cumulation", "application"):
        block = rec.get(clause_type)
        if not block or not isinstance(block, dict):
            continue  # old pre-schema-update records store these as plain strings — no verified/source to sync
        level = verification_level(block.get("verified"))
        if level is None:
            n_skipped += 1
            continue
        text = block.get("text") or " ".join(
            str(v) for k, v in block.items()
            if k not in ("verified", "source", "quote") and v
        )
        _upsert_clause(
            conn, rec_id, clause_type, "default", text,
            block.get("quote") or None, block.get("source") or {}, level,
            block.get("verify_note"), rec.get("verify_by"),
        )
        n_synced += 1

    ticket = rec.get("ticket")
    if ticket and (ticket.get("min_eur") or ticket.get("max_eur")):
        lo, hi = ticket.get("min_eur", 0), ticket.get("max_eur", 0)
        _upsert_clause(
            conn, rec_id, "ticket", "default",
            f"Typical ticket size: EUR {lo:,.0f}-{hi:,.0f}.",
            None, {}, "inventory_inferred", None, rec.get("verify_by"),
        )
        n_synced += 1

    return n_synced, n_skipped


def main() -> None:
    conn = sqlite3.connect(DB)
    known_ids = {r[0] for r in conn.execute("SELECT id FROM funding_instruments")}

    n_synced, n_skipped, n_no_instrument = 0, 0, 0
    n_clauses_synced = n_clauses_skipped = 0
    for f in sorted(TERMS.glob("*.yaml")):
        rec = yaml.safe_load(f.read_text())
        rec_id = rec["id"]
        if rec_id not in known_ids:
            print(f"  SKIP {rec_id}: no matching funding_instruments row "
                  f"(run populate_funding_instruments.py first, or add it to "
                  f"FRAMEWORK_INSTRUMENTS if this is a new framework record)")
            n_no_instrument += len(rec.get("gates", []))
            continue

        for g in rec.get("gates", []):
            level = verification_level(g.get("verified"))
            if level is None:
                n_skipped += 1
                continue
            source = g.get("source") or {}
            conn.execute("""
                INSERT INTO eligibility_gates
                  (instrument_id, gate_key, gate_family, requirement, value,
                   intake_field, quote, source_file, source_locator,
                   verification_level, verify_note, verify_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT (instrument_id, gate_key) DO UPDATE SET
                  gate_family=excluded.gate_family, requirement=excluded.requirement,
                  value=excluded.value, intake_field=excluded.intake_field,
                  quote=excluded.quote, source_file=excluded.source_file,
                  source_locator=excluded.source_locator,
                  verification_level=excluded.verification_level,
                  verify_note=excluded.verify_note, verify_by=excluded.verify_by,
                  updated_at=CURRENT_TIMESTAMP
            """, (
                rec_id, g["id"], g["gate_family"], g["requirement"],
                g.get("value") or None, g.get("intake_field") or "none",
                g.get("quote") or None, source.get("file") or None,
                source.get("locator") or None, level, g.get("verify_note"),
                rec.get("verify_by"),
            ))
            n_synced += 1

        c_synced, c_skipped = sync_clauses(conn, rec_id, rec)
        n_clauses_synced += c_synced
        n_clauses_skipped += c_skipped

    conn.commit()
    print(f"synced {n_synced} gates ({n_skipped} draft/unverified gates skipped, "
          f"{n_no_instrument} gates orphaned — no matching instrument row)")
    print(f"synced {n_clauses_synced} clauses ({n_clauses_skipped} draft/unverified skipped)")
    conn.close()


if __name__ == "__main__":
    main()
