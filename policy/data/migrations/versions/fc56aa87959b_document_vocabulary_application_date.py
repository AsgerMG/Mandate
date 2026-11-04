"""document vocabulary + application date

Revision ID: fc56aa87959b
Revises: b8506603f33d
Create Date: 2026-07-27 16:42:30.847449

Two changes, both required before the corpus can be reclassified or dated.

1. Extend the ``document_type`` enum. ``create_all`` cannot alter an existing
   Postgres enum, so the members added to ``DocumentType`` in Python are
   invisible to the database — storing 'judgment' or 'opinion' fails with
   InvalidTextRepresentation. This, not the classifier, is what actually blocks
   reclassifying the 2,670 documents currently mistyped as OTHER.

2. Add ``documents.date_application``. In EU law *in force* and *applicable* are
   different dates, and the gap between them is where compliance deadlines live:
   the AI Act entered into force 2024-08-01 and applies in stages through 2027.
   A brief that reads entry-into-force as "this binds you now" is wrong about
   the most important instrument in the corpus, so the distinction gets its own
   column instead of being folded into ``date_in_force``.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "fc56aa87959b"
down_revision: str | Sequence[str] | None = "b8506603f33d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Order matches data/models.py's DocumentType so the two read the same way.
NEW_DOCUMENT_TYPES = (
    "judgment",
    "enforcement_decision",
    "standard",
    "opinion",
    "staff_working_doc",
    "newsletter",
    "verbatim_debate",
    "budget",
)


def upgrade() -> None:
    # ADD VALUE IF NOT EXISTS is idempotent, which matters because a database
    # created by create_all *after* the Python enum was extended will already
    # carry some of these. Postgres 12+ permits ADD VALUE inside a transaction
    # provided the new value isn't used in the same transaction; nothing here
    # writes data, so the default transactional migration is safe.
    for value in NEW_DOCUMENT_TYPES:
        op.execute(f"ALTER TYPE document_type ADD VALUE IF NOT EXISTS '{value}'")

    # Nullable with no default: "we haven't fetched this yet" is the honest
    # state, and a backfilled default would be indistinguishable from a real
    # application date — which is the kind of quiet wrongness this column exists
    # to prevent.
    op.add_column("documents", sa.Column("date_application", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "date_application")
    # Postgres cannot drop a value from an enum without recreating the type and
    # rewriting every dependent column. An unused label costs nothing, so the
    # enum half is deliberately not reversed rather than rewriting a
    # 4,781-row table on a downgrade.
