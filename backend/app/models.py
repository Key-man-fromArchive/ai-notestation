# @TASK P0-T0.5 - PostgreSQL schema and pgvector migration
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#database-schema

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Note(Base):
    """Note model representing a synced note from Synology NoteStation."""

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    synology_note_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(500), default="")
    content_html: Mapped[str] = mapped_column(Text, default="")
    content_text: Mapped[str] = mapped_column(Text, default="")  # Plaintext extracted from HTML
    notebook_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # ["tag1", "tag2"]
    is_todo: Mapped[bool] = mapped_column(Boolean, default=False)
    is_shortcut: Mapped[bool] = mapped_column(Boolean, default=False)
    source_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Full-text search vector
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)

    __table_args__ = (
        Index("idx_notes_search_vector", "search_vector", postgresql_using="gin"),
        Index("idx_notes_notebook", "notebook_name"),
        Index("idx_notes_synced_at", "synced_at"),
    )


class NoteEmbedding(Base):
    """Vector embeddings for note chunks (semantic search)."""

    __tablename__ = "note_embeddings"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(Integer, index=True)  # FK to notes.id
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    chunk_text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list] = mapped_column(Vector(1536))  # OpenAI text-embedding-3-small
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("idx_embeddings_note_id", "note_id"),)


class Setting(Base):
    """Application settings stored as key-value pairs in JSONB."""

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    value: Mapped[dict] = mapped_column(JSONB, default={})
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
