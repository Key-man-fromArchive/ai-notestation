# @TASK P0-T0.5 - PostgreSQL schema and pgvector migration
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#database-schema

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
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
    notebook_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("notebooks.id", ondelete="SET NULL"), nullable=True, index=True
    )
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

    # NAS image proxy fields (link_id + ver for constructing NAS image URLs)
    link_id: Mapped[str | None] = mapped_column(String, nullable=True)
    nas_ver: Mapped[str | None] = mapped_column(String, nullable=True)

    # Bidirectional sync fields
    sync_status: Mapped[str] = mapped_column(String(20), server_default="synced", default="synced")
    local_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    remote_conflict_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Full-text search vector
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)

    __table_args__ = (
        Index("idx_notes_search_vector", "search_vector", postgresql_using="gin"),
        Index("idx_notes_notebook", "notebook_name"),
        Index("idx_notes_synced_at", "synced_at"),
        Index("idx_notes_sync_status", "sync_status"),
    )


class Notebook(Base):
    """Notebook model for organizing notes."""

    __tablename__ = "notebooks"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    org_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    public_links_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("org_id", "name", name="uq_notebooks_org_name"),
        Index("idx_notebooks_owner_id", "owner_id"),
        Index("idx_notebooks_org_id", "org_id"),
    )


class NoteEmbedding(Base):
    """Vector embeddings for note chunks (semantic search)."""

    __tablename__ = "note_embeddings"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), index=True)
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

    # OCR fields (Task 4-2)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # None | "pending" | "completed" | "failed"

    # Vision analysis fields
    vision_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    vision_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # None | "pending" | "completed" | "failed"

    __table_args__ = (
        UniqueConstraint("synology_note_id", "ref", name="uq_note_images_note_ref"),
        Index("idx_note_images_note_id", "synology_note_id"),
        Index("idx_note_images_md5", "md5"),
    )


class NoteAttachment(Base):
    """Attachments uploaded for notes (files or images)."""

    __tablename__ = "note_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    file_id: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # PDF text extraction fields
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # None | "pending" | "completed" | "failed"
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

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
    device_code: Mapped[str | None] = mapped_column(String(512), nullable=True)
    device_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="member")
    invited_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
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
    note_id: Mapped[int] = mapped_column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    org_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    permission: Mapped[str] = mapped_column(String(20), default="read")
    granted_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_note_access_note_id", "note_id"),
        Index("idx_note_access_user_id", "user_id"),
        Index("idx_note_access_org_id", "org_id"),
    )


class NotebookAccess(Base):
    __tablename__ = "notebook_access"

    id: Mapped[int] = mapped_column(primary_key=True)
    notebook_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("notebooks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    org_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    permission: Mapped[str] = mapped_column(String(20), default="read", nullable=False)
    granted_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "(user_id IS NOT NULL AND org_id IS NULL) OR (user_id IS NULL AND org_id IS NOT NULL)",
            name="ck_notebook_access_one_of_user_or_org",
        ),
        UniqueConstraint("notebook_id", "user_id", name="uq_notebook_access_notebook_user"),
        UniqueConstraint("notebook_id", "org_id", name="uq_notebook_access_notebook_org"),
        Index("idx_notebook_access_notebook_id", "notebook_id"),
        Index("idx_notebook_access_user_id", "user_id"),
        Index("idx_notebook_access_org_id", "org_id"),
    )


class ShareLink(Base):
    """Shareable links for notes or notebooks with access control."""

    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    notebook_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=True
    )
    note_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=True)
    link_type: Mapped[str] = mapped_column(String(20), nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    email_restriction: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("(note_id IS NOT NULL) OR (notebook_id IS NOT NULL)", name="ck_sharelink_has_target"),
        Index("idx_share_links_token", "token"),
    )


class ClusteringTask(Base):
    __tablename__ = "clustering_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    notebook_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="pending")
    num_clusters: Mapped[int] = mapped_column(Integer, default=5)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_clustering_tasks_task_id", "task_id"),
        Index("idx_clustering_tasks_notebook_id", "notebook_id"),
    )


class NoteCluster(Base):
    __tablename__ = "note_clusters"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    notebook_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cluster_index: Mapped[int] = mapped_column(Integer, nullable=False)
    note_ids: Mapped[list] = mapped_column(JSONB, nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    keywords: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    centroid: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("idx_note_clusters_task_id", "task_id"),
        Index("idx_note_clusters_notebook_id", "notebook_id"),
    )


class ActivityLog(Base):
    """Persistent log of system operations (sync, embedding, image-sync)."""

    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    operation: Mapped[str] = mapped_column(String(50), index=True)
    status: Mapped[str] = mapped_column(String(20))
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    triggered_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (Index("idx_activity_log_op_created", "operation", "created_at"),)


class TrashOperation(Base):
    """Trash operation record for soft-delete / restore / purge."""

    __tablename__ = "trash_operations"

    id: Mapped[int] = mapped_column(primary_key=True)
    operation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    item_count: Mapped[int] = mapped_column(Integer, server_default="0")
    size_bytes: Mapped[int] = mapped_column(BigInteger, server_default="0")
    backup_path: Mapped[str] = mapped_column(String(500), nullable=False)
    manifest: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    triggered_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), server_default="active")
    restored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("idx_trash_operations_status", "status"),)


class GraphInsight(Base):
    """Persisted AI insight from graph cluster analysis."""

    __tablename__ = "graph_insights"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    hub_label: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[dict] = mapped_column(JSONB, nullable=False)
    note_ids: Mapped[list] = mapped_column(JSONB, nullable=False)
    chat_messages: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_graph_insights_user_id", "user_id"),
        Index("idx_graph_insights_org_id", "org_id"),
        Index("idx_graph_insights_created_at", "created_at"),
    )
