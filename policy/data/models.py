"""Canonical schema for the tech-policy corpus.

Design goals
------------
* **Citation-grounded RAG from day one** — text is chunked into ``passages``
  that carry embeddings and char offsets, so every generated claim can point
  back to an exact location in an exact version of an official document.
* **Change tracking** — documents are versioned by content hash, so we can
  detect and surface "this guideline was updated".
* **Profile filtering** — controlled vocabularies (``policy_areas``,
  ``sectors``) let the company-facing layer rank relevance later.
"""

from __future__ import annotations

import datetime as dt
import enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin
from .config import EMBEDDING_DIM


class Jurisdiction(enum.StrEnum):
    EU = "EU"
    FR = "FR"
    DE = "DE"


class DocumentType(enum.StrEnum):
    REGULATION = "regulation"
    DIRECTIVE = "directive"
    DECISION = "decision"
    PROPOSAL = "proposal"
    CONSULTATION = "consultation"
    COMMUNICATION = "communication"
    PRESS = "press"
    GUIDELINE = "guideline"
    OTHER = "other"


class LifecycleStage(enum.StrEnum):
    """Where a file sits in the legislative/regulatory lifecycle."""

    PLANNED = "planned"  # roadmap / call for evidence
    CONSULTATION = "consultation"  # open for feedback
    PROPOSED = "proposed"  # tabled proposal, in procedure
    ADOPTED = "adopted"  # adopted but not yet applicable
    IN_FORCE = "in_force"  # applicable law
    AMENDED = "amended"
    REPEALED = "repealed"
    UNKNOWN = "unknown"


# --- Controlled-vocabulary association tables -------------------------------

document_policy_area = Table(
    "document_policy_area",
    Base.metadata,
    Column("document_id", ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True),
    Column("policy_area_id", ForeignKey("policy_areas.id", ondelete="CASCADE"), primary_key=True),
)

document_sector = Table(
    "document_sector",
    Base.metadata,
    Column("document_id", ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True),
    Column("sector_id", ForeignKey("sectors.id", ondelete="CASCADE"), primary_key=True),
)


class Source(Base, TimestampMixin):
    """Registry of ingestion adapters and their run state."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # e.g. "eurlex"
    name: Mapped[str] = mapped_column(String(255))
    jurisdiction: Mapped[Jurisdiction] = mapped_column(Enum(Jurisdiction, name="jurisdiction"))
    base_url: Mapped[str | None] = mapped_column(String(512))
    enabled: Mapped[bool] = mapped_column(default=True)

    # Opaque per-adapter cursor (last CELEX seen, last page, last timestamp...).
    last_run_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    cursor: Mapped[dict | None] = mapped_column(JSONB)

    documents: Mapped[list[Document]] = relationship(back_populates="source")


class Document(Base, TimestampMixin):
    """One official document, identified by a stable external identifier."""

    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_document_source_external"),
        Index("ix_documents_stage", "lifecycle_stage"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"))

    # Stable identifier within the source: CELEX, ELI, OEIL procedure ref, etc.
    external_id: Mapped[str] = mapped_column(String(255), index=True)
    celex: Mapped[str | None] = mapped_column(String(64), index=True)
    eli: Mapped[str | None] = mapped_column(String(512))

    title: Mapped[str] = mapped_column(Text)
    jurisdiction: Mapped[Jurisdiction] = mapped_column(Enum(Jurisdiction, name="jurisdiction"))
    document_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="document_type"), default=DocumentType.OTHER
    )
    lifecycle_stage: Mapped[LifecycleStage] = mapped_column(
        Enum(LifecycleStage, name="lifecycle_stage"), default=LifecycleStage.UNKNOWN
    )
    language: Mapped[str] = mapped_column(String(8), default="en")

    date_document: Mapped[dt.date | None] = mapped_column(Date)  # date of the act/publication
    date_in_force: Mapped[dt.date | None] = mapped_column(Date)
    date_end_validity: Mapped[dt.date | None] = mapped_column(Date)

    url: Mapped[str | None] = mapped_column(String(1024))
    extra: Mapped[dict | None] = mapped_column(JSONB)  # source-specific metadata

    source: Mapped[Source] = relationship(back_populates="documents")
    versions: Mapped[list[DocumentVersion]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentVersion.fetched_at",
    )
    enrichment: Mapped[Enrichment | None] = relationship(
        back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    policy_areas: Mapped[list[PolicyArea]] = relationship(secondary=document_policy_area)
    sectors: Mapped[list[Sector]] = relationship(secondary=document_sector)


class DocumentVersion(Base, TimestampMixin):
    """A content-hashed snapshot of a document's text. New hash => new version."""

    __tablename__ = "document_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "content_hash", name="uq_version_document_hash"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))

    content_hash: Mapped[str] = mapped_column(String(64), index=True)  # sha256 of normalized text
    raw_format: Mapped[str] = mapped_column(String(32), default="html")  # html|xml|pdf|text
    text: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    fetched_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    is_current: Mapped[bool] = mapped_column(default=True, index=True)

    document: Mapped[Document] = relationship(back_populates="versions")
    passages: Mapped[list[Passage]] = relationship(
        back_populates="version", cascade="all, delete-orphan", order_by="Passage.ordinal"
    )


class Passage(Base):
    """A retrievable chunk of a document version — the unit of citation in RAG."""

    __tablename__ = "passages"
    __table_args__ = (
        UniqueConstraint("version_id", "ordinal", name="uq_passage_version_ordinal"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("document_versions.id", ondelete="CASCADE"), index=True
    )
    ordinal: Mapped[int] = mapped_column(Integer)  # position within the version
    text: Mapped[str] = mapped_column(Text)
    char_start: Mapped[int] = mapped_column(Integer)
    char_end: Mapped[int] = mapped_column(Integer)
    heading: Mapped[str | None] = mapped_column(Text)  # nearest article/section heading
    token_count: Mapped[int | None] = mapped_column(Integer)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM))

    version: Mapped[DocumentVersion] = relationship(back_populates="passages")


class Enrichment(Base, TimestampMixin):
    """LLM-derived, citation-linked synthesis for a document."""

    __tablename__ = "enrichments"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), unique=True
    )

    summary: Mapped[str | None] = mapped_column(Text)
    plain_language: Mapped[str | None] = mapped_column(Text)  # "what to expect", realistic
    what_changes: Mapped[str | None] = mapped_column(Text)

    model: Mapped[str | None] = mapped_column(String(128))  # model used to generate
    # Passage ids backing each generated field, so claims remain auditable.
    citations: Mapped[dict | None] = mapped_column(JSONB)

    document: Mapped[Document] = relationship(back_populates="enrichment")


class PolicyArea(Base):
    __tablename__ = "policy_areas"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))


class Sector(Base):
    __tablename__ = "sectors"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
