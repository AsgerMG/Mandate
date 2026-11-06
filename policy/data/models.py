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
    Boolean,
    MetaData,
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
from .grounding_bridge import LEGACY_COMMENT


class Jurisdiction(enum.StrEnum):
    EU = "EU"
    FR = "FR"
    DE = "DE"


class DocumentType(enum.StrEnum):
    """What kind of document this is — and, by extension, how much authority it
    carries.

    The brief's whole reasoning depends on this distinction: a regulation binds,
    a judgment settles what a provision means, a recommendation guides, a staff
    working document is the Commission's reasoning about a law, and a newsletter
    is somebody's opinion about all of it. ``_DEEPEN_QUOTAS`` in
    etl/intelligence/briefing.py splits the retrieval depth budget by exactly
    these tiers, so a document collapsed into OTHER is a document the brief
    cannot weigh correctly.

    Measured 2026-07-27: 2,774 of 4,781 documents were OTHER, including 459 real
    EU legal acts, because the vocabulary below stopped at REGULATION/DIRECTIVE/
    DECISION and everything else fell through. Anything genuinely unclassifiable
    still lands in OTHER — the point is that it should be rare and honest, not
    the default.
    """

    # --- Binding law ------------------------------------------------------
    REGULATION = "regulation"
    DIRECTIVE = "directive"
    DECISION = "decision"
    # A court ruling: not "law" in the legislative sense, but authoritative on
    # what an existing provision actually requires — which is precisely what a
    # compliance verdict turns on.
    JUDGMENT = "judgment"
    # A supervisory authority's binding enforcement act (DPA fine, DMA
    # non-compliance decision). Distinct from DECISION, which is the EU
    # legislative instrument type, and from JUDGMENT, which is a court.
    ENFORCEMENT_DECISION = "enforcement_decision"

    # --- Soft law / authoritative guidance --------------------------------
    GUIDELINE = "guideline"
    # A harmonised standard. Separate because conformity assessment legally
    # turns on these: they confer presumption of conformity, which no other
    # non-binding document does.
    STANDARD = "standard"

    # --- The legislative pipeline -----------------------------------------
    PROPOSAL = "proposal"
    CONSULTATION = "consultation"
    # An institution's formal position in a procedure — EP legislative
    # positions/amendments (CELEX AP), EP resolutions (IP), EESC/CoR/ECB
    # opinions (AE/IE/IR/AR/AB). Shapes where a file lands without binding.
    OPINION = "opinion"

    # --- Commentary and context -------------------------------------------
    COMMUNICATION = "communication"
    # Impact assessments and accompanying analysis (CELEX SC). Where the
    # Commission's own reasoning and quantified thresholds live — genuine
    # brief material, but commentary about law, not law.
    STAFF_WORKING_DOC = "staff_working_doc"
    PRESS = "press"
    # A subscription newsletter (Politico playbooks, techpolicy.press). Was
    # indistinguishable from a verbatim debate transcript under OTHER.
    NEWSLETTER = "newsletter"
    # A plenary debate transcript with named speakers and their actual stated
    # positions — a primary source for the political-landscape section, and
    # nothing like a press summary of the same debate.
    VERBATIM_DEBATE = "verbatim_debate"
    # Budgetary instruments (CELEX B*). Binding, and deliberately NOT in the
    # binding tier: discharge decisions would compete for depth slots against
    # regulation the company is actually subject to.
    BUDGET = "budget"

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
    # When the act's obligations actually start to bite, which in EU law is
    # routinely NOT date_in_force: an act enters into force ~20 days after
    # publication and often applies months or years later (the AI Act entered
    # into force 2024-08-01 and applies in stages through 2027). This is the
    # date a compliance verdict and every Watchlist deadline turn on, so it is
    # tracked separately rather than conflated with entry into force. Staged,
    # per-provision application dates live in ``extra["application_stages"]``.
    date_application: Mapped[dt.date | None] = mapped_column(Date)
    date_end_validity: Mapped[dt.date | None] = mapped_column(Date)

    url: Mapped[str | None] = mapped_column(String(1024))
    extra: Mapped[dict | None] = mapped_column(JSONB)  # source-specific metadata

    source: Mapped[Source] = relationship(back_populates="documents")
    # Read through the grounded view (text from schema grounding); written only
    # as VersionRef rows by etl/pipeline.py.
    versions: Mapped[list[DocumentVersion]] = relationship(
        primaryjoin="Document.id == foreign(DocumentVersion.document_id)",
        viewonly=True,
        order_by="DocumentVersion.fetched_at",
    )
    enrichment: Mapped[Enrichment | None] = relationship(
        back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    policy_areas: Mapped[list[PolicyArea]] = relationship(secondary=document_policy_area)
    sectors: Mapped[list[Sector]] = relationship(secondary=document_sector)


class LegacyDocumentVersion(Base, TimestampMixin):
    """DEPRECATED, READ-ONLY: policy's pre-grounding version table.

    Superseded on the move to schema `grounding` (see the bridge section at the
    end of this file). Kept, never dropped and never deleted from: it is the
    record the migration copied from, and its retirement is an owner decision.
    Nothing writes it: a trigger refuses every INSERT/UPDATE/DELETE
    (data/grounding_bridge.py) and tests/test_grounding_bridge.py fails the
    build on any code path that names it outside the migration tooling."""

    __tablename__ = "document_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "content_hash", name="uq_version_document_hash"),
        {"comment": LEGACY_COMMENT},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))

    content_hash: Mapped[str] = mapped_column(String(64), index=True)  # sha256 of normalized text
    raw_format: Mapped[str] = mapped_column(String(32), default="html")  # html|xml|pdf|text
    text: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    fetched_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    is_current: Mapped[bool] = mapped_column(default=True, index=True)



class LegacyPassage(Base):
    """DEPRECATED, READ-ONLY: policy's pre-grounding passages (and their vectors).

    Same status as LegacyDocumentVersion: superseded by grounding.passages and
    grounding.passage_embeddings, kept in place, refused writes by a trigger."""

    __tablename__ = "passages"
    __table_args__ = (
        UniqueConstraint("version_id", "ordinal", name="uq_passage_version_ordinal"),
        # The HNSW index every semantic search rides. Declared here rather than
        # only created imperatively in init_db(), because an index that exists in
        # the database but not in Base.metadata is an index `alembic revision
        # --autogenerate` will propose DROPPING — silently, as one line in a
        # migration nobody reads closely. `alembic check` failed on exactly that
        # diff until this was added.
        #
        # Must stay byte-identical in effect to what the database already holds:
        #   CREATE INDEX ix_passages_embedding_hnsw
        #     ON public.passages USING hnsw (embedding vector_cosine_ops)
        # i.e. cosine opclass, pgvector's default m/ef_construction (no WITH
        # clause). Adding build parameters here without also rebuilding the live
        # index would re-introduce the same drift in the opposite direction.
        Index(
            "ix_passages_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        {"comment": LEGACY_COMMENT},
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


class ActorRole(enum.StrEnum):
    """How an actor relates to a document. Not the actor's job title — the same
    MEP is a RAPPORTEUR on one file and a SPEAKER on another."""

    SPEAKER = "speaker"  # spoke on it in a plenary debate (ep/an/de_verbatim)
    RAPPORTEUR = "rapporteur"  # holds the file in committee
    SHADOW_RAPPORTEUR = "shadow_rapporteur"  # opposite-group counterpart
    COMMITTEE = "committee"  # the responsible committee, not an individual
    AUTHOR = "author"  # tabled/authored it
    ADDRESSEE = "addressee"  # a decision's named addressee
    OTHER = "other"


class Actor(Base, TimestampMixin):
    """A named person or body that acts on regulatory files.

    Added 2026-07-28. The gap this closes was measured, not assumed: the first
    judged panel put ``stakeholder_specificity`` at 2.80 — by far the lowest
    dimension and the only one that went *down* — and four of five judge
    critiques said the same thing in different words, that stakeholders "remain
    institutional (AI Office, committees) without named individuals".

    The brief's prompt already demands a who-runs-what map and visibly tries; it
    reaches institutions because that is all the corpus held. Actors were present
    only as strings inside passage text, so "who holds this file, and what have
    they actually said" was unanswerable as a query.

    ``name`` is deliberately not unique on its own — two people can share a name,
    and the same person appears with different spellings across sources. The
    unique key is (name, institution), which is imperfect but stable enough to
    aggregate on; a proper identity resolution pass (MEP ids from EP Open Data)
    is a later refinement, and matters most once roll-call votes land.
    """

    __tablename__ = "actors"
    __table_args__ = (UniqueConstraint("name", "institution", name="uq_actor_name_institution"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    # Free text rather than an enum: it arrives as whatever the source calls it
    # ("European Parliament", "Bundestag", "European Commission"), and forcing a
    # vocabulary here would mean dropping actors we cannot classify yet.
    institution: Mapped[str | None] = mapped_column(String(255))
    # The role/party cue as the source stated it, verbatim — e.g. "on behalf of
    # the EPP Group", "Rapporteur", "Member of the Commission". Kept raw because
    # it is evidence, and normalizing it early would discard the qualifier that
    # makes it citable.
    role_text: Mapped[str | None] = mapped_column(Text)
    political_group: Mapped[str | None] = mapped_column(String(128))
    # Stable upstream identifier when one exists (EP Open Data person id), so
    # identity resolution can improve later without re-deriving everything.
    external_id: Mapped[str | None] = mapped_column(String(128), index=True)

    documents: Mapped[list[DocumentActor]] = relationship(
        back_populates="actor", cascade="all, delete-orphan"
    )


class DocumentActor(Base):
    """An actor's link to one document, with the role they played on it.

    An association *object* rather than a plain many-to-many table because the
    role is a property of the relationship, not of either side, and because a
    quote needs to hang off the link: what this person said about this file is
    the whole point of having actors at all.
    """

    __tablename__ = "document_actor"
    __table_args__ = (
        UniqueConstraint("document_id", "actor_id", "role", name="uq_document_actor_role"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    actor_id: Mapped[int] = mapped_column(ForeignKey("actors.id", ondelete="CASCADE"), index=True)
    role: Mapped[ActorRole] = mapped_column(
        Enum(ActorRole, name="actor_role"), default=ActorRole.OTHER
    )
    # The passage this link was derived from, so a named stakeholder in a brief
    # traces to stored text exactly like every other generated claim. A
    # grounding.passages id (ids were preserved by the migration; an id from a
    # folded duplicate resolves through grounding_passage_link, see
    # data/grounding_bridge.resolve_passage_ids). No foreign key: the FK to the
    # legacy table was dropped in revision 5c2f9e1a7b30, and grounding is
    # append-only, so a cited passage cannot disappear.
    passage_id: Mapped[int | None] = mapped_column(BigInteger, index=True)

    actor: Mapped[Actor] = relationship(back_populates="documents")


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


class RetrievalEvent(Base, TimestampMixin):
    """Best-effort log of retrieval usage from real ``/api/brief`` calls.

    Answers "is the vector DB content we embed actually being surfaced and
    cited" — a question the corpus otherwise has no record of. Written only
    when ``Settings.brief_eval_enabled`` is true (see the ``/api/brief``
    handler in ``etl/api.py``); this table has no other writers or readers in
    the live pipeline, so leaving the flag off leaves it permanently empty.
    Keys passages by (celex/url/title, char_start, char_end) rather than
    Passage.id since that's the identity scheme ``parse_response`` already
    uses to resolve citations — no schema change needed upstream to support
    this.
    """

    __tablename__ = "retrieval_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    query: Mapped[str] = mapped_column(Text)
    retrieved: Mapped[list] = mapped_column(JSONB)  # every passage handed to the model
    cited: Mapped[list] = mapped_column(JSONB)  # the subset the model actually cited


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


# --- The bridge to schema `grounding` ----------------------------------------
#
# Policy's documents, versions and passages are being moved into the shared,
# append-only schema `grounding` (mandate/db/grounding.sql), where every brain's
# sources live once, deduplicated by content hash. These three tables say, for
# each policy row, which grounding row now holds it. They are written once, by
# mandate/grounding/migrations/policy_to_grounding.py, and only ever appended to.
#
# Ids are PRESERVED for every row that was not a duplicate (grounding version id
# = policy version id, grounding passage id = policy passage id), so
# enrichments.citations and document_actor.passage_id stay valid unchanged. The
# rows that differ are exactly the duplicates: 73 versions whose bytes another
# policy version already holds, and their passages, which map onto the
# surviving version's passages ordinal for ordinal (their texts are identical:
# verified before the write).
#
# NO FOREIGN KEY to grounding in the ORM, deliberately: declaring one would make
# Base.metadata.create_all (every test) try to create grounding's tables, and
# Alembic autogenerate compare a schema it does not own. Integrity is checked by
# the migration before it commits, and grounding is append-only, so a referenced
# row cannot later disappear.


class GroundingDocumentLink(Base):
    __tablename__ = "grounding_document_link"

    policy_document_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    grounding_document_id: Mapped[int] = mapped_column(BigInteger, index=True)


class GroundingVersionLink(Base):
    __tablename__ = "grounding_version_link"

    policy_version_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    grounding_version_id: Mapped[int] = mapped_column(BigInteger, index=True)


class GroundingPassageLink(Base):
    __tablename__ = "grounding_passage_link"

    policy_passage_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    grounding_passage_id: Mapped[int] = mapped_column(BigInteger, index=True)


# --- Policy ON grounding (revision 5c2f9e1a7b30) -------------------------------
#
# From the cutover on, schema `grounding` is policy's ONLY store of source text,
# versions, fetches, passages and embeddings. Policy keeps what is its own:
#
#   VersionRef   which grounding version a policy document is at, when policy
#                saw it, in what raw format, and whether it is current. One row
#                per (document, grounding version). The migrated rows keep their
#                policy.document_versions id, so a policy version id means the
#                same thing before and after.
#
# and READS the source through two views (data/grounding_bridge.py), mapped
# below, so every reader keeps asking for "a document version" and "a passage"
# while the text, spans and vectors come from grounding:
#
#   grounded_versions  VersionRef + the grounding version's text and sha256
#   grounded_passages  the grounding passages of each VersionRef, with their
#                      vector in mandate.embedding's model (halfvec in prod)
#
# The views are NOT in Base.metadata (create_all would make them tables, and
# Alembic would diff them): they live in VIEWS and are created by
# grounding_bridge.install(). Writes to them fail in Postgres, which is the
# point: the write path is etl/pipeline.py through mandate.grounding.

VIEWS = MetaData()


class VersionRef(Base, TimestampMixin):
    __tablename__ = "version_refs"
    __table_args__ = (
        UniqueConstraint("document_id", "grounding_version_id", name="uq_version_ref_document_gversion"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    # grounding.document_versions.id. No FK in the ORM for the reason given above
    # GroundingDocumentLink; grounding is append-only, so it cannot dangle.
    grounding_version_id: Mapped[int] = mapped_column(BigInteger, index=True)
    raw_format: Mapped[str] = mapped_column(String(32), default="html")
    fetched_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    is_current: Mapped[bool] = mapped_column(default=True, index=True)


class DocumentVersion(Base):
    """A document's version as policy reads it: VersionRef + grounding's text.
    Read-only (a view)."""

    __table__ = Table(
        "grounded_versions",
        VIEWS,
        Column("id", Integer, primary_key=True),
        Column("document_id", Integer),
        Column("grounding_version_id", BigInteger),
        Column("content_hash", String(64)),
        Column("raw_format", String(32)),
        Column("text", Text),
        Column("char_count", Integer),
        Column("fetched_at", DateTime(timezone=True)),
        Column("is_current", Boolean),
        Column("created_at", DateTime(timezone=True)),
        Column("updated_at", DateTime(timezone=True)),
    )

    document: Mapped[Document] = relationship(
        primaryjoin="foreign(DocumentVersion.document_id) == Document.id", viewonly=True
    )
    passages: Mapped[list[Passage]] = relationship(
        primaryjoin="DocumentVersion.id == foreign(Passage.version_id)",
        viewonly=True,
        order_by="Passage.ordinal",
    )


class Passage(Base):
    """A retrievable chunk — the unit of citation in RAG. ``id`` is the
    grounding.passages id; ``version_id`` the policy version (VersionRef) it is
    read under. Read-only (a view)."""

    __table__ = Table(
        "grounded_passages",
        VIEWS,
        Column("id", BigInteger, primary_key=True),
        Column("version_id", Integer, primary_key=True),
        Column("grounding_version_id", BigInteger),
        Column("ordinal", Integer),
        Column("text", Text),
        Column("char_start", Integer),
        Column("char_end", Integer),
        Column("heading", Text),
        Column("token_count", Integer),
        Column("embedding", Vector(EMBEDDING_DIM)),
    )

    version: Mapped[DocumentVersion] = relationship(
        primaryjoin="foreign(Passage.version_id) == DocumentVersion.id", viewonly=True
    )
