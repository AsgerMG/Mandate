"""correct document_type labels to sqlalchemy member names

Revision ID: d2df3a796789
Revises: fc56aa87959b
Create Date: 2026-07-27 16:45:35.997984

fc56aa87959b added the new document_type labels in lower case (the enum's
*values*). SQLAlchemy's ``Enum(PyEnum)`` persists a member's **name**, not its
value, so the pre-existing labels in this database are REGULATION, DIRECTIVE,
GUIDELINE... and the lower-case ones added by that migration can never be
written by the ORM. The symptom was an immediate
``InvalidTextRepresentation: invalid input value for enum document_type:
"STAFF_WORKING_DOC"`` on the very first reclassification run.

This adds the labels under the names the ORM actually uses. The eight lower-case
labels from fc56aa87959b are left in place: Postgres cannot drop an enum label
without recreating the type and rewriting every dependent column, and an unused
label is inert. fc56aa87959b is deliberately not edited — rewriting an already
applied migration would make this database's history a lie for anyone who
replayed it.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d2df3a796789"
down_revision: str | Sequence[str] | None = "fc56aa87959b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The member NAMES from data/models.py's DocumentType — what SQLAlchemy sends.
NEW_DOCUMENT_TYPE_LABELS = (
    "JUDGMENT",
    "ENFORCEMENT_DECISION",
    "STANDARD",
    "OPINION",
    "STAFF_WORKING_DOC",
    "NEWSLETTER",
    "VERBATIM_DEBATE",
    "BUDGET",
)


def upgrade() -> None:
    for label in NEW_DOCUMENT_TYPE_LABELS:
        op.execute(f"ALTER TYPE document_type ADD VALUE IF NOT EXISTS '{label}'")


def downgrade() -> None:
    """Not reversible — see module docstring on dropping enum labels."""
