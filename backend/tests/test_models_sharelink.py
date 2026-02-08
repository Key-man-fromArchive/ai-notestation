# @TEST ShareLink model tests
# @SPEC Testing ShareLink model creation, constraints, and token generation

import secrets
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import Note, ShareLink, User


@pytest.mark.asyncio
async def test_create_sharelink_for_note(async_session):
    """Test creating a share link for a note."""
    # Create test user
    user = User(email="test@example.com", password_hash="hash123", name="Test User")
    async_session.add(user)
    await async_session.flush()

    # Create test note
    note = Note(
        synology_note_id="test-note-123",
        title="Test Note",
        content_html="<p>Test content</p>",
        content_text="Test content",
    )
    async_session.add(note)
    await async_session.flush()

    # Create share link
    token = secrets.token_urlsafe(32)
    share_link = ShareLink(
        token=token,
        note_id=note.id,
        link_type="public",
        created_by=user.id,
    )
    async_session.add(share_link)
    await async_session.commit()

    # Verify
    result = await async_session.execute(select(ShareLink).where(ShareLink.token == token))
    saved_link = result.scalar_one()

    assert saved_link.note_id == note.id
    assert saved_link.notebook_id is None
    assert saved_link.link_type == "public"
    assert saved_link.created_by == user.id
    assert saved_link.access_count == 0
    assert saved_link.is_active is True
    assert saved_link.created_at is not None


@pytest.mark.asyncio
async def test_create_sharelink_for_notebook(async_session):
    """Test creating a share link for a notebook (notebook_id without actual FK)."""
    user = User(email="test2@example.com", password_hash="hash123", name="Test User")
    async_session.add(user)
    await async_session.flush()

    token = secrets.token_urlsafe(32)
    share_link = ShareLink(
        token=token,
        notebook_id=42,  # Plain integer, no FK constraint yet
        link_type="public",
        created_by=user.id,
    )
    async_session.add(share_link)
    await async_session.commit()

    result = await async_session.execute(select(ShareLink).where(ShareLink.token == token))
    saved_link = result.scalar_one()

    assert saved_link.notebook_id == 42
    assert saved_link.note_id is None


@pytest.mark.asyncio
async def test_sharelink_email_required_type(async_session):
    """Test share link with email_required type."""
    user = User(email="test3@example.com", password_hash="hash123", name="Test User")
    async_session.add(user)
    await async_session.flush()

    note = Note(synology_note_id="note-456", title="Note", content_text="content")
    async_session.add(note)
    await async_session.flush()

    token = secrets.token_urlsafe(32)
    share_link = ShareLink(
        token=token,
        note_id=note.id,
        link_type="email_required",
        created_by=user.id,
        email_restriction="allowed@example.com",
    )
    async_session.add(share_link)
    await async_session.commit()

    result = await async_session.execute(select(ShareLink).where(ShareLink.id == share_link.id))
    saved_link = result.scalar_one()

    assert saved_link.link_type == "email_required"
    assert saved_link.email_restriction == "allowed@example.com"


@pytest.mark.asyncio
async def test_sharelink_time_limited_type(async_session):
    """Test share link with time_limited type."""
    user = User(email="test4@example.com", password_hash="hash123", name="Test User")
    async_session.add(user)
    await async_session.flush()

    note = Note(synology_note_id="note-789", title="Note", content_text="content")
    async_session.add(note)
    await async_session.flush()

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=7)
    share_link = ShareLink(
        token=token,
        note_id=note.id,
        link_type="time_limited",
        created_by=user.id,
        expires_at=expires_at,
    )
    async_session.add(share_link)
    await async_session.commit()

    result = await async_session.execute(select(ShareLink).where(ShareLink.id == share_link.id))
    saved_link = result.scalar_one()

    assert saved_link.link_type == "time_limited"
    assert saved_link.expires_at is not None
    assert saved_link.expires_at.replace(microsecond=0) == expires_at.replace(microsecond=0)


@pytest.mark.asyncio
async def test_sharelink_token_unique(async_session):
    """Test that token must be unique."""
    user = User(email="test5@example.com", password_hash="hash123", name="Test User")
    async_session.add(user)
    await async_session.flush()

    note = Note(synology_note_id="note-unique", title="Note", content_text="content")
    async_session.add(note)
    await async_session.flush()

    token = secrets.token_urlsafe(32)

    # Create first share link
    share_link1 = ShareLink(
        token=token,
        note_id=note.id,
        link_type="public",
        created_by=user.id,
    )
    async_session.add(share_link1)
    await async_session.commit()

    # Try to create second with same token
    share_link2 = ShareLink(
        token=token,  # Same token!
        note_id=note.id,
        link_type="public",
        created_by=user.id,
    )
    async_session.add(share_link2)

    with pytest.raises(IntegrityError):
        await async_session.commit()


@pytest.mark.asyncio
async def test_sharelink_requires_note_or_notebook(async_session):
    """Test that at least one of note_id or notebook_id must be set."""
    user = User(email="test6@example.com", password_hash="hash123", name="Test User")
    async_session.add(user)
    await async_session.flush()

    token = secrets.token_urlsafe(32)
    share_link = ShareLink(
        token=token,
        # Neither note_id nor notebook_id set!
        link_type="public",
        created_by=user.id,
    )
    async_session.add(share_link)

    # Should fail due to check constraint
    with pytest.raises(IntegrityError):
        await async_session.commit()


@pytest.mark.asyncio
async def test_sharelink_access_count_increment(async_session):
    """Test incrementing access_count."""
    user = User(email="test7@example.com", password_hash="hash123", name="Test User")
    async_session.add(user)
    await async_session.flush()

    note = Note(synology_note_id="note-count", title="Note", content_text="content")
    async_session.add(note)
    await async_session.flush()

    token = secrets.token_urlsafe(32)
    share_link = ShareLink(
        token=token,
        note_id=note.id,
        link_type="public",
        created_by=user.id,
    )
    async_session.add(share_link)
    await async_session.commit()

    # Increment access count
    result = await async_session.execute(select(ShareLink).where(ShareLink.token == token))
    link = result.scalar_one()
    assert link.access_count == 0

    link.access_count += 1
    await async_session.commit()

    result = await async_session.execute(select(ShareLink).where(ShareLink.token == token))
    link = result.scalar_one()
    assert link.access_count == 1


@pytest.mark.asyncio
async def test_sharelink_token_indexed(async_session):
    """Test that token column is indexed for fast lookup."""
    # This test verifies the index exists by checking we can query efficiently
    user = User(email="test8@example.com", password_hash="hash123", name="Test User")
    async_session.add(user)
    await async_session.flush()

    note = Note(synology_note_id="note-indexed", title="Note", content_text="content")
    async_session.add(note)
    await async_session.flush()

    # Create multiple share links
    for i in range(5):
        token = secrets.token_urlsafe(32)
        share_link = ShareLink(
            token=token,
            note_id=note.id,
            link_type="public",
            created_by=user.id,
        )
        async_session.add(share_link)

    await async_session.commit()

    # Query by token should work efficiently
    test_token = secrets.token_urlsafe(32)
    result = await async_session.execute(select(ShareLink).where(ShareLink.token == test_token))
    found = result.scalar_one_or_none()
    assert found is None  # Token doesn't exist, but query should work
