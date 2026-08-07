"""Which schema migrations a SQLite store actually has — judged from the store.

── The failure this exists to stop ────────────────────────────────────────
There are two SQLite stores in this project and no channel between their
schemas. `data/db.sqlite` on a developer's machine gets migrated by hand
(`python3 ETL/events/load/migrations/apply.py 019`); the Railway volume's
`/db.sqlite` is written every Sunday by a container that has never run a
migration in its life. The only thing that has ever carried a schema change
across is `push_local.py` uploading the whole 600 MB file.

So the volume's schema was whatever it was on the day of the last push. On
2026-08-07 the weekly census recorded:

    coverage: OperationalError: no such column: tier

`tier` is migration 019. It had been applied locally on some earlier day and
had never reached the volume, so the coverage block — the one that produces the
per-source breakdown — could not run at all, and the census published a corpus
with a hole in exactly the place somebody would have looked.

── Why the answer is not `schema_migrations` ──────────────────────────────
That table records what `apply.py` was *told to do*, on the machine it was told
on. The volume's copy is a copy of the laptop's copy from whenever the file was
last uploaded, so it can claim migrations the file it now describes has lost,
and a store populated by file upload has no honest entry at all. The only
trustworthy answer to "does this store have migration N" is to look for N's
effect in the store's own schema.

That is what each predicate below does, and they are not new: every one is the
idempotency guard that already lived at the top of the corresponding `apply_NNN`
function in apply.py. Moving them here gives them one home with two readers —
the runner, which uses them to decide what to apply, and the corpus census,
which uses them to say what the store it just read is missing. A second copy of
"is 019 applied" is two different answers the first time either is edited.
"""
from __future__ import annotations

import sqlite3


# ── primitives ─────────────────────────────────────────────────────────────
def table_exists(con: sqlite3.Connection, table: str) -> bool:
    return con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def column_exists(con: sqlite3.Connection, table: str, column: str) -> bool:
    if not table_exists(con, table):
        return False
    return column in [r[1] for r in con.execute(f"PRAGMA table_info({table})")]


def index_exists(con: sqlite3.Connection, name: str) -> bool:
    return con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (name,)
    ).fetchone() is not None


def table_sql_contains(con: sqlite3.Connection, table: str, needle: str) -> bool:
    """For migrations that changed a CHECK constraint. SQLite cannot ALTER one,
    so those migrations rebuild the table and the only evidence they ran is the
    new enumeration inside the stored CREATE TABLE text."""
    row = con.execute(
        "SELECT sql FROM sqlite_master WHERE name = ?", (table,)).fetchone()
    return bool(row and row[0] and needle in row[0])


def _all_columns(con: sqlite3.Connection, table: str, columns: tuple[str, ...]) -> bool:
    return all(column_exists(con, table, c) for c in columns)


# ── the registry ───────────────────────────────────────────────────────────
# (id, what it did, "is its effect present in this store"). Ordered: the runner
# applies pending migrations in this order, and several depend on earlier ones.
MIGRATIONS: tuple[tuple[str, str, object], ...] = (
    ("004", "SATR columns on public_funding_events",
     lambda c: _all_columns(c, "public_funding_events",
                            ("satr_tm_id", "aid_instrument", "aid_objective",
                             "granting_authority", "granting_authority_country"))),
    ("005", "NDB implementer columns on public_funding_events",
     lambda c: _all_columns(c, "public_funding_events",
                            ("entrusted_entity", "financial_intermediaries",
                             "ndb_distributor"))),
    ("006", "companies.company_group",
     lambda c: column_exists(c, "companies", "company_group")),
    ("007", "hot-path indexes + WAL",
     lambda c: index_exists(c, "idx_companies_name_upper")
     and index_exists(c, "idx_pfe_source_call")),
    ("008", "public_equity_stakes + instrument_class",
     lambda c: column_exists(c, "public_equity_stakes", "via_fund")
     and column_exists(c, "public_funding_events", "instrument_class")),
    ("009", "is_duplicate / dup_reason + duplicate-free views",
     lambda c: _all_columns(c, "public_funding_events",
                            ("is_duplicate", "dup_reason"))),
    ("010", "two-tier sector taxonomy on companies",
     lambda c: _all_columns(c, "companies",
                            ("sector_top", "subsector", "sector_taxonomy_method",
                             "sector_taxonomy_updated_at"))),
    ("011", "funding_instruments + eligibility_gates",
     lambda c: table_exists(c, "funding_instruments")
     and table_exists(c, "eligibility_gates")),
    ("012", "llm_cited tier + eligibility_clauses",
     lambda c: column_exists(c, "eligibility_gates", "verify_by")),
    ("013", "gate_role + intake_field_resolved + encoding_method",
     lambda c: column_exists(c, "eligibility_gates", "gate_role")),
    ("014", "funding_instruments.administering_body_share",
     lambda c: column_exists(c, "funding_instruments", "administering_body_share")),
    ("015", "award percentiles",
     lambda c: column_exists(c, "funding_instruments", "award_p50")),
    ("016", "programme_ref / programme_name",
     lambda c: column_exists(c, "public_funding_events", "programme_name")),
    ("017", "company_sector_labels",
     lambda c: table_exists(c, "company_sector_labels")),
    ("018", "realised aid intensity",
     lambda c: column_exists(c, "funding_instruments", "intensity_p50")),
    ("019", "instrument hierarchy: tier / root_id / depth",
     lambda c: column_exists(c, "funding_instruments", "tier")),
    ("020", "register_derived evidence tier",
     lambda c: table_sql_contains(c, "eligibility_gates", "register_derived")),
    ("021", "programme_feed name_source",
     lambda c: table_sql_contains(c, "funding_instruments", "programme_feed")),
    ("022", "case_register name_source",
     lambda c: table_sql_contains(c, "funding_instruments", "case_register")),
    ("023", "scheme_end_date / successor",
     lambda c: column_exists(c, "funding_instruments", "scheme_end_date")),
    ("024", "delivery_region",
     lambda c: column_exists(c, "funding_instruments", "delivery_region")),
    ("025", "catchment_region",
     lambda c: column_exists(c, "funding_instruments", "catchment_region")),
    # Filed as a second `025` and therefore unreachable: apply.py defined
    # apply_025 twice and Python kept the later one, so `apply.py 025` ran the
    # catchment migration and 025_scheme_end_date_basis.sql could not be applied
    # by the runner at all. Renumbered to the next free id; the file moved with
    # it. The predicate is idempotent, so stores that got the column another way
    # are simply already done.
    ("026", "scheme_end_date_basis",
     lambda c: column_exists(c, "funding_instruments", "scheme_end_date_basis")),
)

IDS = tuple(m[0] for m in MIGRATIONS)
DESCRIPTIONS = {m[0]: m[1] for m in MIGRATIONS}
_PREDICATE = {m[0]: m[2] for m in MIGRATIONS}


def is_applied(con: sqlite3.Connection, mig_id: str) -> bool:
    """Is migration `mig_id`'s effect present in this store?"""
    return bool(_PREDICATE[mig_id](con))


def pending(con: sqlite3.Connection) -> list[str]:
    """Migrations this store does not have, in application order."""
    return [i for i in IDS if not is_applied(con, i)]


def state(con: sqlite3.Connection) -> dict:
    """A small, JSON-safe description of a store's schema, for the census.

    `pending` is the whole point: a store that is behind says so in the record,
    in the same row as the numbers it produced, so nobody has to deduce a
    missing column from whichever query happened to touch it first.
    """
    missing = pending(con)
    return {
        "known": list(IDS),
        "pending": missing,
        "pendingDetail": {i: DESCRIPTIONS[i] for i in missing},
        "upToDate": not missing,
    }
