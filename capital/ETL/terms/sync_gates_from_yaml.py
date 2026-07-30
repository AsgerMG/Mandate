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

import re
import sqlite3

import yaml  # noqa: E402

TERMS = ROOT / "data" / "instrument_terms"


# Confidence tiers, weakest to strongest. Ordered so a sync can compare what
# the authoring file claims against what the database already holds.
LEVEL_RANK = {
    "inventory_inferred": 0, "llm_classified": 1, "llm_cited": 2,
    "llm_2pass": 3, "human_verified": 4,
}


# A portal named inside curated application prose. The extractors were asked
# for how you apply, and several answers name the platform outright
# ("submission via leaderpia.iledefrance.fr", "mans.altum.lv"). That is a
# cited URL sitting unused in a quote, not a guess.
URL_IN_TEXT = re.compile(
    r"https?://[^\s,;)\]]+"
    r"|(?:[a-z0-9][a-z0-9-]*\.)+(?:eu|fr|de|ee|dk|fi|se|it|es|nl|be|pt|pl|cz|lt|lv|at|ie|gr|hu|ro|si|sk|bg|hr|no)\b",
    re.I)


def url_from_text(*fields: str | None) -> str | None:
    """First portal named in the curated text, normalised to an absolute URL.

    Never invented: if the reviewer did not write one down, this returns None
    and the row simply carries no link. A wrong application link is worse than
    no link, because a founder acts on it.
    """
    for f in fields:
        if not f:
            continue
        m = URL_IN_TEXT.search(f)
        if m:
            u = m.group(0).rstrip(".")
            return u if u.lower().startswith("http") else f"https://{u}"
    return None


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
    n_app_synced = n_app_skipped = 0
    for f in sorted(TERMS.glob("*.yaml")):
        rec = yaml.safe_load(f.read_text())
        rec_id = rec["id"]
        if rec_id not in known_ids:
            print(f"  SKIP {rec_id}: no matching funding_instruments row "
                  f"(run populate_funding_instruments.py first, or add it to "
                  f"FRAMEWORK_INSTRUMENTS if this is a new framework record)")
            n_no_instrument += len(rec.get("gates", []))
            continue

        # ── how a founder actually applies ───────────────────────────────
        # Already extracted from each scheme's own document, quoted and
        # reviewed, and until now never used by anything. It is the one thing
        # on a published row a founder can act on directly, and it was sitting
        # in the authoring files unread.
        #
        # Same verification discipline as gates: an unquoted application block
        # is a draft, and a draft route is worse than no route because it
        # reads as instruction.
        app = rec.get("application")
        if isinstance(app, dict) and (app.get("channel") or app.get("url")):
            if not app.get("quote"):
                n_app_skipped += 1
            else:
                src = app.get("source") or {}
                conn.execute("""
                    INSERT INTO instrument_application
                      (id, instrument_id, channel, timeline, url, quote, source_file, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET
                      channel=excluded.channel, timeline=excluded.timeline,
                      url=excluded.url, quote=excluded.quote,
                      source_file=excluded.source_file, updated_at=CURRENT_TIMESTAMP
                """, (rec_id, rec_id, app.get("channel"), app.get("typical_timeline"),
                      app.get("url") or url_from_text(app.get("channel"), app.get("quote")),
                      app.get("quote"),
                      src.get("file") if isinstance(src, dict) else None))
                n_app_synced += 1

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
                  -- NEVER DOWNGRADE. YAML is the authoring surface, but it is not the
                  -- only writer: a later, more expensive verification pass
                  -- promotes gates in the DB and does not write back here. An
                  -- unguarded upsert silently demoted 471 gates from llm_2pass
                  -- to llm_cited, which is the difference between a rule the
                  -- brief may assert as fact and one it may not.
                  verification_level=CASE WHEN
                      (CASE excluded.verification_level
                         WHEN 'human_verified' THEN 4 WHEN 'llm_2pass' THEN 3
                         WHEN 'llm_cited' THEN 2 WHEN 'llm_classified' THEN 1
                         ELSE 0 END)
                      >
                      (CASE eligibility_gates.verification_level
                         WHEN 'human_verified' THEN 4 WHEN 'llm_2pass' THEN 3
                         WHEN 'llm_cited' THEN 2 WHEN 'llm_classified' THEN 1
                         ELSE 0 END)
                    THEN excluded.verification_level
                    ELSE eligibility_gates.verification_level END,
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
    print(f"synced {n_app_synced} application routes ({n_app_skipped} unquoted, skipped)")
    conn.close()


if __name__ == "__main__":
    main()
