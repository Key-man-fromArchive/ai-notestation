# @TASK P0-T0.5 - PostgreSQL schema and pgvector migration
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#database-schema

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, UniqueConstraint, func
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
    content_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    content_text: Mapped[str] = mapped_column(Text, default="")  # Plaintext extracted from HTML
    notebook_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # ["tag1", "tag2"]
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


class NoteImage(Base):
    """Images extracted from NoteStation NSX exports.

    Maps note attachment references to extracted image files,
    enabling image serving through our API.
    """

    __tablename__ = "note_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    synology_note_id: Mapped[str] = mapped_column(String(255), index=True)
    ref: Mapped[str] = mapped_column(String(512))  # Original reference in note content
    name: Mapped[str] = mapped_column(String(512))  # Human-readable filename
    md5: Mapped[str] = mapped_column(String(32))  # MD5 hash from NSX
    file_path: Mapped[str] = mapped_column(String(1024))  # Path to extracted file
    mime_type: Mapped[str] = mapped_column(String(100), default="image/png")
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("synology_note_id", "ref", name="uq_note_images_note_ref"),
        Index("idx_note_images_note_id", "synology_note_id"),
        Index("idx_note_images_md5", "md5"),
    )


class NoteAttachment(Base):
    """Attachments uploaded for notes (files or images)."""

    __tablename__ = "note_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(Integer, index=True)
    file_id: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("idx_note_attachments_note_id", "note_id"),)


class OAuthToken(Base):
    """OAuth tokens for provider authentication (Google, OpenAI)."""

    __tablename__ = "oauth_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_type: Mapped[str] = mapped_column(String(50), default="bearer")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scope: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pkce_state: Mapped[str | None] = mapped_column(String(128), nullable=True)
    pkce_code_verifier: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("username", "provider", name="uq_oauth_tokens_user_provider"),
        Index("idx_oauth_tokens_username", "username"),
        Index("idx_oauth_tokens_provider", "provider"),
    )


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Membership(Base):
    __tablename__ = "memberships"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    org_id: Mapped[int] = mapped_column(Integer, index=True)
    role: Mapped[str] = mapped_column(String(20), default="member")
    invited_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    invite_token: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "org_id", name="uq_memberships_user_org"),
        Index("idx_memberships_user_id", "user_id"),
        Index("idx_memberships_org_id", "org_id"),
    )


class NoteAccess(Base):
    __tablename__ = "note_access"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(Integer, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    org_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    permission: Mapped[str] = mapped_column(String(20), default="read")
    granted_by: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_note_access_note_id", "note_id"),
        Index("idx_note_access_user_id", "user_id"),
        Index("idx_note_access_org_id", "org_id"),
    )
