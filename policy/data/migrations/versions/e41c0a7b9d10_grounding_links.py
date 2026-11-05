"""grounding links: which grounding row now holds each policy row

Revision ID: e41c0a7b9d10
Revises: adeb138e8084
Create Date: 2026-11-06

The bridge tables for the move of documents/versions/passages into the shared
schema `grounding` (see the comment above GroundingDocumentLink in
data/models.py). Empty when created; filled once by
mandate/grounding/migrations/policy_to_grounding.py --apply.

Hand-checked against autogenerate: it proposes only these three tables (and, as
on every revision, the spurious drop of ix_passages_embedding_hnsw, removed).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e41c0a7b9d10"
down_revision: str | Sequence[str] | None = "adeb138e8084"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = (
    ("grounding_document_link", "policy_document_id", sa.Integer(), "grounding_document_id"),
    ("grounding_version_link", "policy_version_id", sa.Integer(), "grounding_version_id"),
    ("grounding_passage_link", "policy_passage_id", sa.BigInteger(), "grounding_passage_id"),
)


def upgrade() -> None:
    for table, pk, pk_type, ref in _TABLES:
        op.create_table(
            table,
            sa.Column(pk, pk_type, nullable=False),
            sa.Column(ref, sa.BigInteger(), nullable=False),
            sa.PrimaryKeyConstraint(pk, name=f"pk_{table}"),
        )
        op.create_index(f"ix_{table}_{ref}", table, [ref], unique=False)


def downgrade() -> None:
    for table, _pk, _t, ref in reversed(_TABLES):
        op.drop_index(f"ix_{table}_{ref}", table_name=table)
        op.drop_table(table)
