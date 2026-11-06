"""policy reads and writes grounding: version_refs, the grounded views, legacy read-only

Revision ID: 5c2f9e1a7b30
Revises: e41c0a7b9d10
Create Date: 2026-11-06

THE CUTOVER. From this revision on, schema `grounding` is policy's source for
source text, versions, fetches, passages and embeddings (data/grounding_bridge.py
explains the split). This revision:

  1. creates `version_refs` (which grounding version each policy document is at,
     its raw format, fetch date and is_current) and fills it with one row per
     migrated policy.document_versions row, KEEPING ITS ID;
  2. creates the views `grounded_versions` / `grounded_passages` the ORM's
     DocumentVersion / Passage are mapped on;
  3. drops document_actor's FOREIGN KEY to policy.passages (the constraint only,
     no data): new passages exist only in grounding, so a new actor link could
     not satisfy it. Stored passage ids keep their meaning (ids were preserved);
  4. makes policy.document_versions and policy.passages READ-ONLY by trigger and
     marks them deprecated. Nothing is dropped and nothing deleted: their
     retirement is a later owner decision.

ORDER IN PRODUCTION: after policy_to_grounding.py --apply (it refuses, naming
that step, while any policy version is unlinked), and before the code that
reads grounding is deployed. Running it early is safe for the old code's READS
(the old tables are untouched) but the old code's WRITES are then refused, so
deploy the new code straight after.

Hand-checked against autogenerate: it proposes the version_refs table and the
FK drop, and (as on every revision) the spurious drop of
ix_passages_embedding_hnsw, removed. The views are not in Base.metadata.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from data import grounding_bridge

revision: str = "5c2f9e1a7b30"
down_revision: str | Sequence[str] | None = "e41c0a7b9d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "version_refs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("grounding_version_id", sa.BigInteger(), nullable=False),
        sa.Column("raw_format", sa.String(length=32), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], name=op.f("fk_version_refs_document_id_documents"),
                                ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_version_refs")),
        sa.UniqueConstraint("document_id", "grounding_version_id", name="uq_version_ref_document_gversion"),
    )
    op.create_index(op.f("ix_version_refs_document_id"), "version_refs", ["document_id"])
    op.create_index(op.f("ix_version_refs_grounding_version_id"), "version_refs", ["grounding_version_id"])
    op.create_index(op.f("ix_version_refs_is_current"), "version_refs", ["is_current"])
    op.drop_constraint(op.f("fk_document_actor_passage_id_passages"), "document_actor", type_="foreignkey")
    bind = op.get_bind()
    grounding_bridge.backfill_version_refs(bind)
    grounding_bridge.install(bind)


def downgrade() -> None:
    bind = op.get_bind()
    for t in grounding_bridge.LEGACY_TABLES:
        bind.exec_driver_sql(f"DROP TRIGGER IF EXISTS deprecated_read_only ON {t}")
    bind.exec_driver_sql("DROP VIEW IF EXISTS grounded_passages")
    bind.exec_driver_sql("DROP VIEW IF EXISTS grounded_versions")
    # The FK is not restored: rows written after the cutover may cite grounding-only
    # passages. version_refs is kept (it is data); drop it by hand if truly wanted.
