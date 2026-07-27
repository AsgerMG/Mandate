"""baseline: existing schema as of create_all

Revision ID: b8506603f33d
Revises:
Create Date: 2026-07-27 16:42:14.351221

Intentionally empty. Every database that exists when Alembic was introduced was
built by ``init_db()``'s ``create_all``, so its schema already matches this
point in history — there is nothing to apply. Its only job is to be a revision
those databases can be stamped with, so the next migration has a parent to
build on.

Fresh databases still go through ``init_db()`` (which also creates the pgvector
extension and the HNSW index) and are then stamped here. Alembic owns schema
changes from the next revision onward.
"""

from collections.abc import Sequence

revision: str = "b8506603f33d"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """No-op: see module docstring."""


def downgrade() -> None:
    """No-op: see module docstring."""
